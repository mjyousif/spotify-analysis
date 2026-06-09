import pandas as pd
import numpy as np
from collections import Counter
from typing import Dict, Any, Tuple, List, Optional
from .base import BaseVibeSplitter, safe_float
from .dimensionality import compute_pca_coords

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
