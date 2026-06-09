import json
import logging
import re
import os
import pandas as pd
from typing import Dict, Any, List
from app.analysis.processors.base import BaseAnalysisProcessor
from app.config import settings
from app.services.cache import cache
import hashlib

# Try to import litellm, catch import errors gracefully
try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

def is_valid_key(key: str) -> bool:
    if not key:
        return False
    key_stripped = key.strip()
    if key_stripped.lower() in (
        "", "none", "null", "false", "placeholder",
        "your_openai_api_key_here",
        "your_gemini_api_key_here",
        "your_anthropic_api_key_here",
        "your_reccobeats_api_key_here"
    ) or key_stripped.startswith("your_"):
        return False
    return True

class LLMRecommendationProcessor(BaseAnalysisProcessor):
    """
    Summarizes each cluster's musical features and uses LiteLLM
    to generate creative playlist names, descriptions, and vibe analyses.
    """
    def process(
        self, 
        tracks_df: pd.DataFrame, 
        features_df: pd.DataFrame, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        
        cluster_profiles = context.get("cluster_profiles", [])
        if not cluster_profiles:
            return {"recommendations": []}

        # Check if recommendations were already generated (e.g. by LLM Semantic Splitter)
        llm_recommendations = context.get("llm_recommendations")
        from app.analysis.processors.vibe_splitters import resolve_llm_config
        provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()

        if llm_recommendations is not None:
            return {
                "recommendations": llm_recommendations,
                "llm_active": has_llm_key,
                "llm_provider": provider,
                "llm_model": actual_model
            }

        recommendations = []
        
        if not litellm or not has_llm_key:
            logger.info("LiteLLM not configured or API keys missing. Generating static vibe summaries.")
            for profile in cluster_profiles:
                recommendations.append(self._generate_static_recommendation(profile))
            return {
                "recommendations": recommendations, 
                "llm_active": False,
                "llm_provider": provider or "none",
                "llm_model": actual_model or "none"
            }
            
        try:
            # Build the prompt
            prompt_data = []
            for profile in cluster_profiles:
                prompt_data.append({
                    "cluster_id": profile["cluster_id"],
                    "song_count": profile["count"],
                    "top_genres": profile["top_genres"],
                    "representative_songs": profile["representative_songs"],
                    "averages": profile["averages"]
                })

            # Check cache using a SHA-256 hash of the input configuration and model
            serialized_prompt = json.dumps(prompt_data, sort_keys=True)
            hash_input = f"{actual_model}:{serialized_prompt}"
            hash_key = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()

            cached_recs = cache.get_llm_recommendations(hash_key)
            if cached_recs is not None:
                logger.info(f"Cache hit for LLM recommendations (hash: {hash_key})")
                return {
                    "recommendations": cached_recs, 
                    "llm_active": True,
                    "llm_provider": provider,
                    "llm_model": actual_model
                }

            logger.info(f"Cache miss for LLM recommendations. Sending request to LiteLLM ({actual_model})...")
            prompt = f"""
You are a professional music curator and playlist designer.
I have clustered a user's Spotify playlist into vibe subgroups. Below is the data representing each cluster.
Analyze each cluster and generate a creative playlist name (avoiding generic names like 'Chill Vibes' or 'Upbeat Mix'), a short Spotify-ready description (1-2 sentences), and a detailed explanation of the 'vibe' (what mood it is, why these songs go together).

Note: If a cluster has a cluster_id of -1, it represents "Wildcard" or "Outlier" songs that did not fit cleanly into the other core vibes. Give it a creative name representing its diverse or misfit nature (e.g., 'The Eclectic Wildcards', 'Sonic Misfits', or 'Curious Oddities') and write a description explaining that it contains the unique exceptions of the playlist.

Cluster Data:
{json.dumps(prompt_data, indent=2)}

Format your response as a JSON object containing a list of recommendations, exactly matching this structure:
{{
  "recommendations": [
    {{
      "cluster_id": 0,
      "playlist_name": "Name of Playlist",
      "description": "Short description.",
      "vibe_explanation": "Detailed paragraph explaining the vibe, mood, and characteristics of this cluster."
    }},
    ...
  ]
}}

Ensure the output is valid JSON and nothing else. Do not wrap in markdown code blocks.
"""
            # Build completion kwargs
            completion_kwargs = {
                "model": actual_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.5,
            }
            if api_base:
                completion_kwargs["api_base"] = api_base
            if api_key:
                completion_kwargs["api_key"] = api_key

            try:
                # Call LiteLLM with response_format first
                response = litellm.completion(
                    response_format={"type": "json_object"},
                    **completion_kwargs
                )
            except Exception as format_err:
                logger.warning(
                    f"LiteLLM JSON format request failed, retrying without strict format: {str(format_err)}"
                )
                # Fallback: Retry without response_format (useful for older/custom local LLMs)
                response = litellm.completion(**completion_kwargs)
            
            content = response.choices[0].message.content
            # Clean response if LLM accidentally wrapped it in markdown code blocks
            if content.startswith("```"):
                content = re.sub(r"^```json\s*", "", content)
                content = re.sub(r"```$", "", content).strip()
                
            data = json.loads(content)
            recommendations = data.get("recommendations", [])
            
            # Match LLM recommendations with profiles to ensure all clusters are represented
            rec_map = {r["cluster_id"]: r for r in recommendations if "cluster_id" in r}
            
            final_recs = []
            for profile in cluster_profiles:
                cid = profile["cluster_id"]
                if cid in rec_map:
                    final_recs.append(rec_map[cid])
                else:
                    final_recs.append(self._generate_static_recommendation(profile))
            
            # Save finalized recommendations to cache
            if final_recs:
                cache.set_llm_recommendations(hash_key, final_recs)

            return {
                "recommendations": final_recs, 
                "llm_active": True,
                "llm_provider": provider,
                "llm_model": actual_model
            }
            
        except Exception as e:
            logger.error(f"LiteLLM completion error: {str(e)}. Falling back to static vibe summaries.")
            for profile in cluster_profiles:
                recommendations.append(self._generate_static_recommendation(profile))
            return {
                "recommendations": recommendations, 
                "llm_active": False,
                "llm_provider": provider,
                "llm_model": actual_model
            }

    def _generate_static_recommendation(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """Procedural recommendation engine in case LLM is unavailable."""
        cid = profile["cluster_id"]
        
        if cid == -1:
            return {
                "cluster_id": -1,
                "playlist_name": "The Eclectic Wildcards",
                "description": "A curated collection of unique tracks that stand out from the playlist's main vibes.",
                "vibe_explanation": "These songs represent the outliers and unique soundscapes in your playlist. Because they didn't cluster cleanly into the main vibes, they form a delightful, diverse wildcard mix."
            }
            
        genres = profile["top_genres"]
        averages = profile["averages"]
        
        # Simple heuristic to determine name
        energy = averages.get("energy", 0.5)
        valence = averages.get("valence", 0.5)
        tempo = averages.get("tempo", 120.0)
        acoustic = averages.get("acousticness", 0.5)
        
        # Base vibe name
        genre_cap = genres[0].title() if genres else "Eclectic"
        if energy > 0.7:
            if valence > 0.6:
                name = f"High-Energy Upbeat {genre_cap}"
                vibe = "An energetic, cheerful collection of fast-paced tracks perfect for workouts, parties, or driving."
            else:
                name = f"Intense & Heavy {genre_cap}"
                vibe = "A powerful, intense, and driving mix featuring deep beats and high energy, carrying a darker or more serious mood."
        elif acoustic > 0.6:
            name = f"Organic Acoustic {genre_cap}"
            vibe = "A warm, introspective, and mellow collection of organic, acoustic, and soft instruments. Excellent for focusing, relaxing, or winding down."
        else:
            if valence > 0.5:
                name = f"Smooth & Sunny {genre_cap}"
                vibe = "A balanced, warm, and highly melodic groove with smooth pacing and positive emotional undertones."
            else:
                name = f"Moody & Atmospheric {genre_cap}"
                vibe = "An atmospheric, emotional, and introspective selection with slower tempos and deeper textures. Ideal for late nights."
                
        # Append cluster number to guarantee uniqueness
        name = f"{name} (Vibe {cid + 1})"
        
        return {
            "cluster_id": cid,
            "playlist_name": name,
            "description": f"A curated vibe-split featuring {', '.join(genres[:3])}. Hand-sorted by Spotify Vibe Analyzer.",
            "vibe_explanation": vibe
        }

