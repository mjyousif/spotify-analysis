import os
import json
import logging
import re
import hashlib
import pandas as pd
import numpy as np
from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional, List
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from sklearn.decomposition import PCA
from app.config import settings

# Try to import litellm, catch import errors gracefully
try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

def safe_float(val: Any, default: float) -> float:
    if val is None or pd.isna(val):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

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

def compute_pca_coords(X_scaled: np.ndarray) -> Tuple[List[float], List[float]]:
    num_tracks = X_scaled.shape[0]
    if num_tracks >= 2:
        try:
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(X_scaled)
            return coords[:, 0].tolist(), coords[:, 1].tolist()
        except Exception as e:
            logger.error(f"PCA computation failed: {str(e)}")
    return [0.0] * num_tracks, [0.0] * num_tracks


def compute_all_coords(
    X_scaled: np.ndarray,
    features_df: pd.DataFrame,
    tracks_df: pd.DataFrame,
    feature_cols: List[str]
) -> Dict[str, Tuple[List[float], List[float]]]:
    num_tracks = X_scaled.shape[0]
    
    # Initialize defaults
    res = {
        "pca": ([0.0] * num_tracks, [0.0] * num_tracks),
        "tsne": ([0.0] * num_tracks, [0.0] * num_tracks),
        "umap": ([0.0] * num_tracks, [0.0] * num_tracks),
        "circumplex": ([0.5] * num_tracks, [0.5] * num_tracks)
    }
    
    if num_tracks < 1:
        return res
        
    # Circumplex: Valence (X), Energy (Y)
    valence_list = []
    energy_list = []
    for _, row in tracks_df.iterrows():
        track_id = row["id"]
        track_features = features_df.loc[track_id] if track_id in features_df.index else {}
        valence_list.append(float(safe_float(track_features.get("valence"), 0.5)))
        energy_list.append(float(safe_float(track_features.get("energy"), 0.5)))
    res["circumplex"] = (valence_list, energy_list)

    if num_tracks < 2:
        res["pca"] = (valence_list, energy_list)
        res["tsne"] = (valence_list, energy_list)
        res["umap"] = (valence_list, energy_list)
        return res

    # 1. PCA
    try:
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(X_scaled)
        res["pca"] = (coords[:, 0].tolist(), coords[:, 1].tolist())
    except Exception as e:
        logger.error(f"PCA failed in compute_all_coords: {e}")
        res["pca"] = (valence_list, energy_list)

    # 2. t-SNE
    try:
        from sklearn.manifold import TSNE
        perplexity = max(1.0, min(30.0, float(num_tracks - 1) / 3.0))
        tsne = TSNE(n_components=2, random_state=42, perplexity=perplexity)
        coords = tsne.fit_transform(X_scaled)
        res["tsne"] = (coords[:, 0].tolist(), coords[:, 1].tolist())
    except Exception as e:
        logger.error(f"t-SNE failed in compute_all_coords: {e}")
        res["tsne"] = res["pca"]

    # 3. UMAP
    try:
        import umap
        n_neighbors = max(2, min(15, num_tracks - 1))
        reducer = umap.UMAP(n_components=2, random_state=42, n_neighbors=n_neighbors, n_epochs=200)
        coords = reducer.fit_transform(X_scaled)
        res["umap"] = (coords[:, 0].tolist(), coords[:, 1].tolist())
    except Exception as e:
        logger.error(f"UMAP failed in compute_all_coords: {e}")
        res["umap"] = res["pca"]

    return res


class BaseVibeSplitter(ABC):
    @abstractmethod
    def split(
        self,
        tracks_df: pd.DataFrame,
        features_df: pd.DataFrame,
        X_scaled: np.ndarray,
        k: int,
        context: Dict[str, Any]
    ) -> Tuple[np.ndarray, List[float], List[float], Optional[List[Dict[str, Any]]]]:
        """
        Abstract method to split a playlist.
        Returns:
            - cluster_labels: np.ndarray
            - x_coords: List[float]
            - y_coords: List[float]
            - recommendations: Optional[List[Dict[str, Any]]]
        """
        pass


class KMeansSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        if num_tracks >= 2:
            try:
                kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
                cluster_labels = kmeans.fit_predict(X_scaled)
            except Exception as e:
                logger.error(f"KMeans failed: {str(e)}")
                cluster_labels = np.zeros(num_tracks, dtype=int)
        else:
            cluster_labels = np.zeros(num_tracks, dtype=int)
        
        x_coords, y_coords = compute_pca_coords(X_scaled)
        return cluster_labels, x_coords, y_coords, None


class AgglomerativeSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        if num_tracks >= 2:
            try:
                agglomerative = AgglomerativeClustering(n_clusters=k, linkage="ward")
                cluster_labels = agglomerative.fit_predict(X_scaled)
            except Exception as e:
                logger.error(f"Agglomerative failed: {str(e)}")
                cluster_labels = np.zeros(num_tracks, dtype=int)
        else:
            cluster_labels = np.zeros(num_tracks, dtype=int)
            
        x_coords, y_coords = compute_pca_coords(X_scaled)
        return cluster_labels, x_coords, y_coords, None


class DbscanSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        if num_tracks >= 2:
            try:
                eps_val = 0.45
                dbscan = DBSCAN(eps=eps_val, min_samples=3)
                cluster_labels = dbscan.fit_predict(X_scaled)
                
                num_outliers = np.sum(cluster_labels == -1)
                if num_outliers == num_tracks:
                    eps_val = 0.6
                    dbscan = DBSCAN(eps=eps_val, min_samples=3)
                    cluster_labels = dbscan.fit_predict(X_scaled)
                    
                unique, counts = np.unique(cluster_labels, return_counts=True)
                for val, count in zip(unique, counts):
                    if val != -1 and count < 3:
                        cluster_labels[cluster_labels == val] = -1
            except Exception as e:
                logger.error(f"DBSCAN failed: {str(e)}")
                cluster_labels = np.zeros(num_tracks, dtype=int)
        else:
            cluster_labels = np.zeros(num_tracks, dtype=int)
            
        x_coords, y_coords = compute_pca_coords(X_scaled)
        return cluster_labels, x_coords, y_coords, None


class MoodMappingSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        cluster_labels = np.zeros(num_tracks, dtype=int)
        x_coords = []
        y_coords = []
        
        for idx, (_, row) in enumerate(tracks_df.iterrows()):
            track_id = row["id"]
            track_features = features_df.loc[track_id] if track_id in features_df.index else {}
            valence = safe_float(track_features.get("valence"), 0.5)
            energy = safe_float(track_features.get("energy"), 0.5)
            
            x_coords.append(valence)
            y_coords.append(energy)
            
            # Russell's Circumplex Model quadrant assignments
            if k <= 2:
                # 2 vibes: Positive (Valence >= 0.5) vs Negative/Moody (Valence < 0.5)
                cluster_labels[idx] = 0 if valence >= 0.5 else 1
            elif k == 3:
                # 3 vibes: High Energy (Energy >= 0.5), Chill Positive (Energy < 0.5, Valence >= 0.5), Chill Moody (Energy < 0.5, Valence < 0.5)
                if energy >= 0.5:
                    cluster_labels[idx] = 0
                elif valence >= 0.5:
                    cluster_labels[idx] = 1
                else:
                    cluster_labels[idx] = 2
            else:
                # 4+ vibes: 4 Quadrants
                if valence >= 0.5 and energy >= 0.5:
                    cluster_labels[idx] = 0  # Happy / Upbeat
                elif valence >= 0.5 and energy < 0.5:
                    cluster_labels[idx] = 1  # Calm / Smooth
                elif valence < 0.5 and energy < 0.5:
                    cluster_labels[idx] = 2  # Moody / Melancholic
                else:
                    cluster_labels[idx] = 3  # Intense / Dark
                    
        return cluster_labels, x_coords, y_coords, None


class GenreFirstSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        track_genres_list = []
        all_genres = []
        genres_dict = context.get("artist_genres", {})
        
        for _, row in tracks_df.iterrows():
            artists = row.get("artists", [])
            t_genres = []
            if isinstance(artists, list):
                for artist in artists:
                    aid = artist.get("id")
                    if aid in genres_dict:
                        t_genres.extend(genres_dict[aid])
            t_genres = list(set(t_genres))
            track_genres_list.append(t_genres)
            all_genres.extend(t_genres)
            
        from collections import Counter
        genre_counts = Counter(all_genres)
        
        # We need k-1 groups + 1 Wildcard group (-1)
        num_genres_needed = max(1, k - 1)
        top_genres_with_counts = genre_counts.most_common(num_genres_needed)
        top_genres = [g for g, _ in top_genres_with_counts]
        
        cluster_labels = np.zeros(num_tracks, dtype=int)
        for idx in range(num_tracks):
            t_genres = track_genres_list[idx]
            assigned = False
            for i, g in enumerate(top_genres):
                if g in t_genres:
                    cluster_labels[idx] = i
                    assigned = True
                    break
            if not assigned:
                cluster_labels[idx] = -1 # Wildcard/Other
                
        x_coords, y_coords = compute_pca_coords(X_scaled)
        return cluster_labels, x_coords, y_coords, None


class LlmSemanticSplitter(BaseVibeSplitter):
    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
        
        if not litellm or not has_llm_key:
            logger.warning("LiteLLM is not configured/active. Falling back to KMeans for LLM Semantic algorithm.")
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
        
        from app.services.cache import cache
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
            fallback = KMeansSplitter()
            return fallback.split(tracks_df, features_df, X_scaled, k, context)


# Extensible Strategy Registry
SPLITTER_REGISTRY: Dict[str, BaseVibeSplitter] = {
    "kmeans": KMeansSplitter(),
    "agglomerative": AgglomerativeSplitter(),
    "dbscan": DbscanSplitter(),
    "mood_mapping": MoodMappingSplitter(),
    "genre_first": GenreFirstSplitter(),
    "llm_semantic": LlmSemanticSplitter(),
}

def get_vibe_splitter(algorithm_name: str) -> BaseVibeSplitter:
    """Returns the registered vibe splitter for the given algorithm name, falling back to KMeans if not found."""
    return SPLITTER_REGISTRY.get(algorithm_name.lower(), SPLITTER_REGISTRY["kmeans"])
