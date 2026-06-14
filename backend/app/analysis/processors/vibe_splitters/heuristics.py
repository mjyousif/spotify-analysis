import pandas as pd
import numpy as np
from collections import Counter
from typing import Dict, Any, Tuple, List, Optional
from .base import BaseVibeSplitter, safe_float
from .dimensionality import compute_pca_coords

class MoodMappingSplitter(BaseVibeSplitter):
    @property
    def name(self) -> str:
        return "Mood Mapping (2D Circumplex)"

    @property
    def description(self) -> str:
        return "Maps tracks to a standard 2D emotional grid based on Spotify valence (positivity) and energy features."

    @property
    def help_text(self) -> str:
        return "Uses Russell's Circumplex Model of Affect. Tracks are assigned to emotional quadrants: High Energy & High Valence (Happy/Upbeat), Low Energy & High Valence (Calm/Smooth), Low Energy & Low Valence (Moody/Melancholic), and High Energy & Low Valence (Intense/Dark). Excellent for visual and emotional structuring."

    @property
    def recommended_projections(self) -> List[str]:
        return ["circumplex"]

    @property
    def default_projection(self) -> str:
        return "circumplex"

    def get_recommended_k(self, X_scaled: np.ndarray) -> int:
        num_tracks = X_scaled.shape[0]
        return min(4, num_tracks) if num_tracks >= 1 else 4

    def split(self, tracks_df: pd.DataFrame, features_df: pd.DataFrame, X_scaled: np.ndarray, k: int, context: Dict[str, Any]):
        num_tracks = len(tracks_df)
        cluster_labels = np.zeros(num_tracks, dtype=int)
        x_coords = []
        y_coords = []
        
        lyrics_weight = safe_float(context.get("lyrics_weight"), 0.0)
        lyrics_strategy = context.get("lyrics_strategy", "spotify_model")
        blend_lyrics = (lyrics_weight > 0.0)
        
        # Pre-compute column indices into X_scaled (normalized [0,1])
        # features_df may be indexed by ReccoBeats IDs not Spotify IDs, so use X_scaled directly
        feature_cols = context.get("feature_cols", [
            "tempo", "energy", "valence", "acousticness",
            "danceability", "instrumentalness", "speechiness"
        ])
        val_idx   = feature_cols.index("valence")      if "valence"      in feature_cols else None
        eng_idx   = feature_cols.index("energy")       if "energy"       in feature_cols else None
        dance_idx = feature_cols.index("danceability") if "danceability" in feature_cols else None
        
        from app.services.cache import cache
        from app.analysis.processors.lyric_strategies import get_lyric_strategy
        
        strategy = get_lyric_strategy(lyrics_strategy)
        
        for idx, (_, row) in enumerate(tracks_df.iterrows()):
            track_id = row["id"]

            # Read audio features from X_scaled by position — reliable regardless of features_df index format
            valence = float(X_scaled[idx, val_idx])   if val_idx   is not None else 0.5
            energy  = float(X_scaled[idx, eng_idx])   if eng_idx   is not None else 0.5
            
            if blend_lyrics:
                try:
                    cache_key = f"{track_id}:{lyrics_strategy}"
                    analysis = cache.get_track_lyric_analysis(cache_key)
                    
                    if analysis is None:
                        # Build features dict from X_scaled for heuristic fallback
                        features_from_scaled = {
                            col: float(X_scaled[idx, ci])
                            for ci, col in enumerate(feature_cols)
                        }
                        track_mock = {
                            "id": track_id,
                            "name": row.get("name"),
                            "artists": ", ".join([a.get("name", "") for a in row.get("artists", [])]) if isinstance(row.get("artists"), list) else "",
                            "features": features_from_scaled
                        }
                        
                        lyrics_info = cache.get_track_lyrics(track_id)
                        lyrics_text = lyrics_info.get("lyrics", "") if lyrics_info else ""
                        analysis = strategy.run_heuristic_fallback(track_mock, lyrics_text)
                    
                    if analysis:
                        lyrical_val, lyrical_eng = strategy.get_lyrical_valence_and_energy(analysis, valence, energy)
                        valence = (valence + lyrics_weight * lyrical_val) / (1.0 + lyrics_weight)
                        energy = (energy + lyrics_weight * lyrical_eng) / (1.0 + lyrics_weight)
                except Exception as e:
                    import logging
                    logging.getLogger("uvicorn.error").error(f"Error blending lyrics in MoodMappingSplitter: {str(e)}")
            
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
    @property
    def name(self) -> str:
        return "Genre-First Hierarchical"

    @property
    def description(self) -> str:
        return "Groups tracks by their primary artist genres first, placing remaining tracks into a wildcard category."

    @property
    def help_text(self) -> str:
        return "Prioritizes artist metadata. It scans your playlist, identifies the most common genre tags, and forms clusters around those primary genres. Any track whose artists do not match the top genres is grouped into an 'Other/Wildcard' category, ensuring clear genre boundaries."

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
