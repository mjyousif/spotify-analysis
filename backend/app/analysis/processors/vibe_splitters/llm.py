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


class LlmSemanticSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
        
        if not litellm or not has_llm_key:
            logger.warning("LiteLLM is not configured/active. Falling back to KMeans for LLM Semantic algorithm.")
            from .algorithms import KMeansSplitter
            fallback = KMeansSplitter()
            return fallback.split(tracks_df, features_df, X_scaled, k, context)
            
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
            
            track_features = features_df.loc[track_id] if track_id in features_df.index else {}
            
            prompt_tracks.append({
                "id": track_id,
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
        prompt = f"""
You are a professional music curator. I have a list of Spotify tracks from a playlist.
Please group these {num_tracks} tracks into exactly {k} distinct "vibe" categories (clusters labeled 0 to {k-1}).
Ensure all tracks are assigned to a cluster.

Tracks:
{json.dumps(prompt_tracks, indent=2)}

For each cluster, create a unique and creative playlist name, a short description (1-2 sentences), and a detailed explanation of the vibe.

Format your response as a JSON object matching this schema exactly:
{{
  "recommendations": [
    {{
      "cluster_id": 0,
      "playlist_name": "Creative Vibe Name",
      "description": "Short description.",
      "vibe_explanation": "Detailed explanation."
    }},
    ...
  ],
  "assignments": {{
    "track_id_1": 0,
    "track_id_2": 1,
    ...
  }}
}}
Ensure the output is valid JSON and nothing else. Do not wrap in markdown code blocks.
"""

        completion_kwargs = {
            "model": actual_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
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
            if content.startswith("```"):
                content = re.sub(r"^```json\s*", "", content)
                content = re.sub(r"```$", "", content).strip()
                
            data = json.loads(content)
            recommendations = data.get("recommendations", [])
            assignments = data.get("assignments", {})
            
            cluster_labels = np.zeros(num_tracks, dtype=int)
            for idx, (_, row) in enumerate(tracks_df.iterrows()):
                tid = row["id"]
                cluster_labels[idx] = int(assignments.get(tid, 0))
                
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
            logger.error(f"LiteLLM Semantic Split failed: {str(e)}. Falling back to KMeans.")
            from .algorithms import KMeansSplitter
            fallback = KMeansSplitter()
            return fallback.split(tracks_df, features_df, X_scaled, k, context)
