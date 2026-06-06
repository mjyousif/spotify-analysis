import json
import logging
import re
import os
import pandas as pd
from typing import Dict, Any, List
from app.analysis.processors.base import BaseAnalysisProcessor
from app.config import settings

# Try to import litellm, catch import errors gracefully
try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

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
            
        # Check if we have active LLM keys
        has_llm_key = any([
            settings.openai_api_key, 
            settings.anthropic_api_key, 
            settings.gemini_api_key,
            # Or if they are set in env directly
            "OPENAI_API_KEY" in os.environ,
            "ANTHROPIC_API_KEY" in os.environ,
            "GEMINI_API_KEY" in os.environ
        ])
        
        # Determine model to use
        # Default model will be gpt-4o-mini, or gemini-1.5-flash, or a similar light model
        model = "gpt-4o-mini"
        if "GEMINI_API_KEY" in os.environ or settings.gemini_api_key:
            model = "gemini/gemini-1.5-flash"
        elif "ANTHROPIC_API_KEY" in os.environ or settings.anthropic_api_key:
            model = "anthropic/claude-3-haiku-20240307"
            
        recommendations = []
        
        if not litellm or not has_llm_key:
            logger.info("LiteLLM not configured or API keys missing. Generating static vibe summaries.")
            for profile in cluster_profiles:
                recommendations.append(self._generate_static_recommendation(profile))
            return {"recommendations": recommendations, "llm_active": False}
            
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
                
            prompt = f"""
You are a professional music curator and playlist designer.
I have clustered a user's Spotify playlist into vibe subgroups. Below is the data representing each cluster.
Analyze each cluster and generate a creative playlist name (avoiding generic names like 'Chill Vibes' or 'Upbeat Mix'), a short Spotify-ready description (1-2 sentences), and a detailed explanation of the 'vibe' (what mood it is, why these songs go together).

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
            # Call LiteLLM
            response = litellm.completion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
                response_format={"type": "json_object"}
            )
            
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
            return {"recommendations": final_recs, "llm_active": True}
            
        except Exception as e:
            logger.error(f"LiteLLM completion error: {str(e)}. Falling back to static vibe summaries.")
            for profile in cluster_profiles:
                recommendations.append(self._generate_static_recommendation(profile))
            return {"recommendations": recommendations, "llm_active": False}

    def _generate_static_recommendation(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """Procedural recommendation engine in case LLM is unavailable."""
        cid = profile["cluster_id"]
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

