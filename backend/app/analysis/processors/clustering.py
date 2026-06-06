import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from typing import Dict, Any, List
from app.analysis.processors.base import BaseAnalysisProcessor

class VibeClusteringProcessor(BaseAnalysisProcessor):
    """
    Normalizes audio features, runs K-Means clustering, 
    and applies PCA for 2D visualization coordinate mapping.
    """
    def process(
        self, 
        tracks_df: pd.DataFrame, 
        features_df: pd.DataFrame, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        
        # If we have no tracks or features, return empty result
        if tracks_df.empty or features_df.empty:
            return {"tracks": [], "clusters": []}
            
        # 1. Determine number of clusters (k) from context, with fallback defaults
        num_tracks = len(tracks_df)
        k = int(context.get("k", 3))
        # Ensure k is valid
        if k < 1:
            k = 1
        if k > num_tracks:
            k = num_tracks
            
        # 2. Extract numeric feature columns for clustering & PCA
        feature_cols = [
            "tempo", "energy", "valence", "acousticness", 
            "danceability", "instrumentalness", "speechiness"
        ]
        
        # Ensure all required columns exist in the DataFrame (fill missing values if any)
        for col in feature_cols:
            if col not in features_df.columns:
                features_df[col] = 0.5 if col != "tempo" else 120.0
                
        X = features_df[feature_cols].copy()
        
        # 3. Normalize features
        scaler = MinMaxScaler()
        X_scaled = scaler.fit_transform(X)
        
        # 4. Perform K-Means Clustering
        if k > 1 and num_tracks >= k:
            kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
            cluster_labels = kmeans.fit_predict(X_scaled)
        else:
            cluster_labels = np.zeros(num_tracks, dtype=int)
            
        # Add cluster labels to the context for downstream processors (like LLM)
        context["cluster_labels"] = cluster_labels
        
        # 5. Dimensionality Reduction (PCA) to 2D
        if num_tracks >= 2:
            pca = PCA(n_components=2, random_state=42)
            coords = pca.fit_transform(X_scaled)
            x_coords = coords[:, 0].tolist()
            y_coords = coords[:, 1].tolist()
        else:
            x_coords = [0.0] * num_tracks
            y_coords = [0.0] * num_tracks
            
        # 6. Merge results and format track list
        processed_tracks = []
        for idx, row in tracks_df.iterrows():
            track_id = row["id"]
            artist_list = row.get("artists", [])
            artists_str = ", ".join([a.get("name", "") for a in artist_list])
            
            # Retrieve artist genres if available in context
            track_artist_ids = [a.get("id") for a in artist_list if a.get("id")]
            track_genres = []
            genres_dict = context.get("artist_genres", {})
            for aid in track_artist_ids:
                if aid in genres_dict:
                    track_genres.extend(genres_dict[aid])
            
            # Deduplicate genres
            track_genres = list(set(track_genres))
            
            track_features = features_df.loc[track_id].to_dict() if track_id in features_df.index else {}
            
            processed_tracks.append({
                "id": track_id,
                "name": row["name"],
                "uri": row["uri"],
                "artists": artists_str,
                "album_images": row.get("album", {}).get("images", []),
                "cluster": int(cluster_labels[idx]),
                "x": float(x_coords[idx]),
                "y": float(y_coords[idx]),
                "features": {
                    "tempo": float(track_features.get("tempo", 120.0)),
                    "energy": float(track_features.get("energy", 0.5)),
                    "valence": float(track_features.get("valence", 0.5)),
                    "acousticness": float(track_features.get("acousticness", 0.5)),
                    "danceability": float(track_features.get("danceability", 0.5)),
                    "instrumentalness": float(track_features.get("instrumentalness", 0.0)),
                },
                "genres": track_genres
            })
            
        # 7. Aggregate Cluster Profiles
        cluster_profiles = []
        for cluster_idx in range(k):
            cluster_tracks = [t for t in processed_tracks if t["cluster"] == cluster_idx]
            if not cluster_tracks:
                continue
                
            # Compute average features
            avg_tempo = np.mean([t["features"]["tempo"] for t in cluster_tracks])
            avg_energy = np.mean([t["features"]["energy"] for t in cluster_tracks])
            avg_valence = np.mean([t["features"]["valence"] for t in cluster_tracks])
            avg_acoustic = np.mean([t["features"]["acousticness"] for t in cluster_tracks])
            avg_dance = np.mean([t["features"]["danceability"] for t in cluster_tracks])
            
            # Aggregate genres
            all_genres = []
            for t in cluster_tracks:
                all_genres.extend(t["genres"])
                
            # Get top 5 genres
            genre_series = pd.Series(all_genres)
            top_genres = genre_series.value_counts().head(5).index.tolist() if not genre_series.empty else []
            
            cluster_profiles.append({
                "cluster_id": cluster_idx,
                "count": len(cluster_tracks),
                "averages": {
                    "tempo": float(avg_tempo),
                    "energy": float(avg_energy),
                    "valence": float(avg_valence),
                    "acousticness": float(avg_acoustic),
                    "danceability": float(avg_dance)
                },
                "top_genres": top_genres,
                "representative_songs": [f"{t['name']} by {t['artists']}" for t in cluster_tracks[:4]]
            })
            
        # Save profiles in context for subsequent processors (like LLM)
        context["cluster_profiles"] = cluster_profiles
        context["processed_tracks"] = processed_tracks
        
        return {
            "tracks": processed_tracks,
            "clusters": cluster_profiles
        }
