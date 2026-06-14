import os
import json
import logging
import re
import hashlib
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, Optional, List
from app.config import settings
from app.services.cache import cache
from .base import BaseVibeSplitter, safe_float, is_valid_key
from .dimensionality import compute_pca_coords

try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

def resolve_llm_config() -> Tuple[str, str, Optional[str], Optional[str], bool]:
    """
    Resolves the active LLM provider, model, api_base, api_key, and active status.
    Returns:
        (provider, actual_model, api_base, api_key, has_llm_key)
    """
    provider = settings.llm_provider.lower().strip() if settings.llm_provider else ""
    model_override = settings.llm_model.strip() if settings.llm_model else ""
    api_base = None
    api_key = None
    has_llm_key = False

    if provider:
        if provider == "lm_studio":
            has_llm_key = True
            api_base = settings.lm_studio_api_base
            actual_model = f"lm_studio/{model_override}" if model_override else "lm_studio/local-model"
            api_key = "lm-studio"
        elif provider == "ollama":
            has_llm_key = True
            api_base = settings.ollama_api_base
            actual_model = f"ollama/{model_override}" if model_override else "ollama/llama3"
            api_key = "ollama"
        elif provider == "gemini":
            val = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
            has_llm_key = is_valid_key(val)
            api_key = val if has_llm_key else None
            actual_model = f"gemini/{model_override}" if model_override else "gemini/gemini-1.5-flash"
        elif provider == "openai":
            val = settings.openai_api_key or os.environ.get("OPENAI_API_KEY", "")
            has_llm_key = is_valid_key(val)
            api_key = val if has_llm_key else None
            actual_model = model_override if model_override else "gpt-4o-mini"
        elif provider == "anthropic":
            val = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")
            has_llm_key = is_valid_key(val)
            api_key = val if has_llm_key else None
            actual_model = f"anthropic/{model_override}" if model_override else "anthropic/claude-3-haiku-20240307"
        else:
            actual_model = model_override
            val = os.environ.get("OPENAI_API_KEY", "")
            has_llm_key = is_valid_key(val) or bool(actual_model)
            api_key = val if is_valid_key(val) else None
    else:
        # Auto-detect provider based on environment keys
        gemini_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        openai_key = settings.openai_api_key or os.environ.get("OPENAI_API_KEY", "")
        anthropic_key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")

        if is_valid_key(gemini_key):
            provider = "gemini"
            actual_model = "gemini/gemini-1.5-flash"
            api_key = gemini_key
            has_llm_key = True
        elif is_valid_key(openai_key):
            provider = "openai"
            actual_model = "gpt-4o-mini"
            api_key = openai_key
            has_llm_key = True
        elif is_valid_key(anthropic_key):
            provider = "anthropic"
            actual_model = "anthropic/claude-3-haiku-20240307"
            api_key = anthropic_key
            has_llm_key = True
        else:
            provider = "none"
            actual_model = "none"
            has_llm_key = False

    return provider, actual_model, api_base, api_key, has_llm_key


class LlmSplitterError(Exception):
    """Exception raised when LLM-based vibe splitting fails."""
    pass


def escape_raw_control_chars_in_json_strings(s: str) -> str:
    in_string = False
    escaped = False
    result = []
    for char in s:
        if char == '"' and not escaped:
            in_string = not in_string
            result.append(char)
        elif in_string:
            if char == '\\':
                escaped = not escaped
                result.append(char)
            else:
                if char == '\n':
                    result.append('\\n')
                elif char == '\r':
                    result.append('\\r')
                elif char == '\t':
                    result.append('\\t')
                else:
                    result.append(char)
                escaped = False
        else:
            result.append(char)
            escaped = False
    return "".join(result)


def repair_truncated_json(s: str) -> str:
    s = s.strip()
    in_string = False
    escaped = False
    stack = []
    clean_chars = []
    for char in s:
        if char == '"' and not escaped:
            in_string = not in_string
            clean_chars.append(char)
        elif in_string:
            if char == '\\':
                escaped = not escaped
            else:
                escaped = False
            clean_chars.append(char)
        else:
            if char in ['{', '[']:
                stack.append(char)
            elif char in ['}', ']']:
                if stack:
                    top = stack[-1]
                    if (char == '}' and top == '{') or (char == ']' and top == '['):
                        stack.pop()
            clean_chars.append(char)
            
    if in_string:
        while clean_chars and clean_chars[-1] != '"':
            clean_chars.pop()
        if clean_chars:
            clean_chars.pop()
            
    reconstructed = "".join(clean_chars).strip()
    
    while reconstructed and reconstructed[-1] in [',', ':', '{', '[', ' ', '\n', '\r', '\t']:
        reconstructed = reconstructed[:-1].strip()
        
    new_stack = []
    in_string = False
    escaped = False
    for char in reconstructed:
        if char == '"' and not escaped:
            in_string = not in_string
        elif in_string:
            if char == '\\':
                escaped = not escaped
            else:
                escaped = False
        else:
            if char in ['{', '[']:
                new_stack.append(char)
            elif char in ['}', ']']:
                if new_stack:
                    new_stack.pop()
                    
    for sym in reversed(new_stack):
        if sym == '{':
            reconstructed += '}'
        elif sym == '[':
            reconstructed += ']'
            
    return reconstructed


def extract_recommendations_and_assignments(content: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    content = content.strip()
    
    # Strip markdown wrapper if present
    if content.startswith("```"):
        content = re.sub(r"^```json\s*", "", content)
        content = re.sub(r"```$", "", content).strip()
        
    content = escape_raw_control_chars_in_json_strings(content)
    # Remove trailing commas from objects/arrays
    content = re.sub(r',\s*([\]}])', r'\1', content)
    
    try:
        data = json.loads(content)
        return data.get("recommendations", []), data.get("assignments", {})
    except Exception as e:
        logger.warning(f"Direct JSON parsing failed: {e}. Attempting robust recovery...")
        
    try:
        repaired_content = repair_truncated_json(content)
        data = json.loads(repaired_content)
        return data.get("recommendations", []), data.get("assignments", {})
    except Exception as e:
        logger.warning(f"Repaired JSON parsing failed: {e}. Falling back to regex extraction...")
        
    recommendations = []
    brace_matches = []
    stack = []
    for i, char in enumerate(content):
        if char == '{':
            stack.append(i)
        elif char == '}':
            if stack:
                start = stack.pop()
                brace_matches.append(content[start:i+1])
                
    for block in brace_matches:
        try:
            block_clean = re.sub(r',\s*([\]}])', r'\1', block)
            item = json.loads(block_clean)
            if "cluster_id" in item and "playlist_name" in item:
                recommendations.append(item)
        except Exception:
            continue
            
    assignments = {}
    assignment_matches = re.finditer(r'["\']([^"\']+)["\']\s*:\s*(\d+)', content)
    for m in assignment_matches:
        key = m.group(1)
        val = int(m.group(2))
        if key not in ["cluster_id", "recommendations", "assignments", "playlist_name", "description", "vibe_explanation"]:
            assignments[key] = val
            
    return recommendations, assignments


class LlmSemanticSplitter(BaseVibeSplitter):
    @property
    def name(self) -> str:
        return "AI Semantic Splitting"

    @property
    def description(self) -> str:
        return "Leverages large language models to analyze track titles, artists, genres, and lyrics to group tracks by abstract themes."

    @property
    def help_text(self) -> str:
        return "A semantic clustering method using LLMs (e.g., Gemini, OpenAI, Claude). It looks beyond numerical audio features to understand cultural references, lyrical themes, and stylistic nuances. For example, it can group songs suitable for 'rainy Sunday mornings' vs 'night drives' based on their textual and contextual meaning."

    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
        
        if not litellm or not has_llm_key:
            raise LlmSplitterError("LiteLLM is not configured or LLM API keys/credentials are missing.")
            
        prompt_tracks = []
        for idx, (_, row) in enumerate(tracks_df.iterrows()):
            track_id = row["id"]
            artists = row.get("artists", [])
            artists_str = ", ".join([a.get("name", "") for a in artists])
            
            # Retrieve genres
            track_artist_ids = [a.get("id") for a in artists if a.get("id")]
            track_genres = []
            genres_dict = context.get("artist_genres", {})
            for aid in track_artist_ids:
                if aid in genres_dict:
                    track_genres.extend(genres_dict[aid])
            track_genres = list(set(track_genres))
            
            # Use iloc[idx] — features_df is indexed by ReccoBeats IDs, not Spotify IDs,
            # so .loc[track_id] always silently returns {}. Positional access is reliable.
            track_features = features_df.iloc[idx] if idx < len(features_df) else {}

            
            # Use short index string (0, 1, 2...) as ID to save context/output token budget
            prompt_tracks.append({
                "id": str(idx),
                "name": row["name"],
                "artists": artists_str,
                "genres": track_genres[:3],
                "tempo": int(safe_float(track_features.get("tempo"), 120.0)),
                "energy": float(safe_float(track_features.get("energy"), 0.5)),
                "valence": float(safe_float(track_features.get("valence"), 0.5)),
                "acousticness": float(safe_float(track_features.get("acousticness"), 0.5))
            })
            
        # Check cache
        serialized_prompt = json.dumps(prompt_tracks, sort_keys=True)
        hash_input = f"{actual_model}:{k}:{serialized_prompt}"
        hash_key = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        cached_payload = cache.get_llm_recommendations(f"semantic_split:{hash_key}")
        if cached_payload is not None:
            logger.info("Cache hit for LLM Semantic Split")
            cluster_labels = np.array(cached_payload["labels"])
            recommendations = cached_payload["recommendations"]
            x_coords, y_coords = compute_pca_coords(X_scaled)
            
            # Save in context for the next processor
            context["llm_recommendations"] = recommendations
            context["llm_provider"] = provider
            context["llm_model"] = actual_model
            return cluster_labels, x_coords, y_coords, recommendations
            
        logger.info(f"LLM Semantic Split cache miss. Contacting LiteLLM ({actual_model})...")
        
        # Format tracks list as compact CSV string to save context tokens and fit local model limits
        csv_lines = ["id,name,artists,genres,tempo,energy,valence,acousticness"]
        for t in prompt_tracks:
            # Escape double quotes by doubling them as per standard CSV rules
            name_esc = t["name"].replace('"', '""')
            art_esc = t["artists"].replace('"', '""')
            genres_esc = ",".join(t["genres"]).replace('"', '""')
            csv_lines.append(f'{t["id"]},"{name_esc}","{art_esc}","{genres_esc}",{t["tempo"]},{t["energy"]:.2f},{t["valence"]:.2f},{t["acousticness"]:.2f}')
        tracks_csv_str = "\n".join(csv_lines)

        prompt = f"""
You are a professional music curator. I have a CSV list of Spotify tracks from a playlist.
Please group these {num_tracks} tracks into exactly {k} distinct "vibe" categories (clusters labeled 0 to {k-1}).
Ensure all tracks are assigned to a cluster.

Tracks CSV:
{tracks_csv_str}

For each cluster, create a unique and creative playlist name, a short description (exactly 1 sentence), and a brief explanation of the vibe (at most 2 sentences). Keep descriptions and explanations highly concise to prevent output truncation.

Format your response as a JSON object matching this schema exactly:
{{
  "recommendations": [
    {{
      "cluster_id": 0,
      "playlist_name": "Creative Vibe Name",
      "description": "Short description.",
      "vibe_explanation": "Brief explanation."
    }},
    ...
  ],
  "assignments": {{
    "0": 0,
    "1": 0,
    "2": 1,
    "3": 2,
    "4": 1,
    "5": 0,
    ...
  }}
}}
Ensure the output is valid JSON and nothing else. Do not wrap in markdown code blocks.
CRITICAL: The cluster assignments must only map tracks to one of the {k} cluster IDs (integers from 0 to {k-1}). Do NOT assign each track to its own unique cluster. Multiple tracks MUST be grouped together into the same cluster ID.
IMPORTANT: Inside the JSON string values (playlist_name, description, vibe_explanation), NEVER use double quotes ("). If you need to quote something, use single quotes (') instead. Double quotes inside string values will break the JSON parser.
"""

        completion_kwargs = {
            "model": actual_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 4096,
        }
        if api_base:
            completion_kwargs["api_base"] = api_base
        if api_key:
            completion_kwargs["api_key"] = api_key
            
        try:
            try:
                response = litellm.completion(
                    response_format={"type": "json_object"},
                    **completion_kwargs
                )
            except Exception:
                response = litellm.completion(**completion_kwargs)
                
            content = response.choices[0].message.content
            
            # Robust extract of recommendations and assignments (recovers from truncation/control characters)
            recommendations, assignments = extract_recommendations_and_assignments(content)
            
            if not recommendations or not assignments:
                # Log the content for debugging
                logger.error(f"Failed to extract recommendations or assignments. Raw LLM content: {content[:1000]}...")
                raise LlmSplitterError("Failed to parse valid recommendations or assignments from LLM response.")
                
            cluster_labels = np.zeros(num_tracks, dtype=int)
            for idx, (_, row) in enumerate(tracks_df.iterrows()):
                # Match short ID assignment
                cid = int(assignments.get(str(idx), 0))
                # Clamp to [0, k-1] to prevent out of bounds vibes
                if cid < 0 or cid >= k:
                    cid = 0
                cluster_labels[idx] = cid
                
            x_coords, y_coords = compute_pca_coords(X_scaled)
            
            # Cache the payload
            cache_payload = {
                "labels": cluster_labels.tolist(),
                "recommendations": recommendations
            }
            cache.set_llm_recommendations(f"semantic_split:{hash_key}", cache_payload)
            
            # Save in context for next processor
            context["llm_recommendations"] = recommendations
            context["llm_provider"] = provider
            context["llm_model"] = actual_model
            
            return cluster_labels, x_coords, y_coords, recommendations
            
        except Exception as e:
            if isinstance(e, LlmSplitterError):
                raise e
            raise LlmSplitterError(f"LiteLLM Semantic Split completion failed: {str(e)}")
