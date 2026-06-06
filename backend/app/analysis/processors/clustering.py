import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from typing import Dict, Any, List
from app.analysis.processors.base import BaseAnalysisProcessor

def calculate_recommended_k(X_scaled: np.ndarray) -> int:
    num_tracks = X_scaled.shape[0]
    if num_tracks <= 3:
        return 2
    
    # We want to search between 2 and min(6, num_tracks - 1)
    max_k = min(6, num_tracks - 1)
    if max_k < 2:
        return 2
        
    best_k = 3
    best_score = -1.0
    
    # Try different values of k and evaluate using Silhouette Score
    from sklearn.metrics import silhouette_score
    
    for k in range(2, max_k + 1):
        try:
            kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
            labels = kmeans.fit_predict(X_scaled)
            score = silhouette_score(X_scaled, labels)
            if score > best_score:
                best_score = score
                best_k = k
        except Exception:
            continue
            
    # Cap k based on playlist size to keep vibes appropriately sized
    if num_tracks < 12:
        best_k = min(best_k, 2)
    elif num_tracks < 24:
        best_k = min(best_k, 3)
    elif num_tracks < 40:
        best_k = min(best_k, 4)
        
    return best_k

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
            
        # 1. Extract numeric feature columns for clustering & PCA
        num_tracks = len(tracks_df)
        feature_cols = [
            "tempo", "energy", "valence", "acousticness", 
            "danceability", "instrumentalness", "speechiness"
        ]
        
        # Ensure all required columns exist in the DataFrame (fill missing values if any)
        for col in feature_cols:
            if col not in features_df.columns:
                features_df[col] = 0.5 if col != "tempo" else 120.0
                
        X = features_df[feature_cols].copy()
        
        # 2. Normalize features
        scaler = MinMaxScaler()
        X_scaled = scaler.fit_transform(X)
        
        # 3. Determine recommended and active K
        recommended_k = calculate_recommended_k(X_scaled)
        
        context_k = context.get("k")
        if context_k is None:
            k = recommended_k
        else:
            try:
                k = int(context_k)
            except (ValueError, TypeError):
                k = recommended_k
                
        # Ensure k is valid
        if k < 1:
            k = 1
        if k > num_tracks:
            k = num_tracks
            
        # Update context so subsequent processors know the actual k used
        context["k"] = k
        
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
            
            # Deterministically sample up to 30 tracks to ensure cache consistency
            if len(cluster_tracks) <= 30:
                sampled_tracks = cluster_tracks
            else:
                indices = np.linspace(0, len(cluster_tracks) - 1, 30, dtype=int)
                sampled_tracks = [cluster_tracks[i] for i in indices]
            
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
                "representative_songs": [f"{t['name']} by {t['artists']}" for t in sampled_tracks]
            })
            
        # Save profiles in context for subsequent processors (like LLM)
        context["cluster_profiles"] = cluster_profiles
        context["processed_tracks"] = processed_tracks
        
        return {
            "tracks": processed_tracks,
            "clusters": cluster_profiles,
            "recommended_k": recommended_k
        }
