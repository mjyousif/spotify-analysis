import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from typing import Dict, Any, List
from app.analysis.processors.base import BaseAnalysisProcessor
from app.analysis.processors.vibe_splitters import get_vibe_splitter, compute_all_coords

def safe_float(val: Any, default: float) -> float:
    if val is None or pd.isna(val):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_int(val: Any, default: int) -> int:
    if val is None or pd.isna(val):
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


class VibeClusteringProcessor(BaseAnalysisProcessor):
    """
    Normalizes audio features, runs K-Means, Agglomerative, or DBSCAN clustering, 
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
        
        # 2.5. Append weighted metadata features if specified
        genre_weight = safe_float(context.get("genre_weight"), 0.0)
        era_weight = safe_float(context.get("era_weight"), 0.0)
        popularity_weight = safe_float(context.get("popularity_weight"), 0.0)
        lyrics_weight = safe_float(context.get("lyrics_weight"), 0.0)

        extra_features_parts = []

        # Genres (using PCA to reduce dimensionality)
        if genre_weight > 0.0:
            try:
                genres_dict = context.get("artist_genres", {})
                track_genres_list = []
                for _, row in tracks_df.iterrows():
                    artists = row.get("artists", [])
                    t_genres = []
                    if isinstance(artists, list):
                        for artist in artists:
                            aid = artist.get("id")
                            if aid in genres_dict:
                                t_genres.extend(genres_dict[aid])
                    track_genres_list.append(list(set(t_genres)))

                from sklearn.preprocessing import MultiLabelBinarizer
                from sklearn.decomposition import PCA
                mlb = MultiLabelBinarizer()
                genre_matrix = mlb.fit_transform(track_genres_list)
                if genre_matrix.shape[1] > 0:
                    n_components = min(3, genre_matrix.shape[1], num_tracks)
                    pca_genre = PCA(n_components=n_components, random_state=42)
                    genre_pca = pca_genre.fit_transform(genre_matrix)
                    genre_scaled = MinMaxScaler().fit_transform(genre_pca) * genre_weight
                    extra_features_parts.append(genre_scaled)
            except Exception as e:
                logger.error(f"Failed to process genres for weighted clustering: {str(e)}")

        # Release Era (Year)
        if era_weight > 0.0:
            try:
                import re
                years = []
                for _, row in tracks_df.iterrows():
                    album = row.get("album")
                    r_date = album.get("release_date") if isinstance(album, dict) else ""
                    year = 2000.0
                    if r_date:
                        match = re.match(r"^(\d{4})", str(r_date))
                        if match:
                            year = float(match.group(1))
                    years.append(year)
                
                years_arr = np.array(years).reshape(-1, 1)
                if len(np.unique(years_arr)) > 1:
                    years_scaled = MinMaxScaler().fit_transform(years_arr) * era_weight
                else:
                    years_scaled = np.zeros_like(years_arr)
                extra_features_parts.append(years_scaled)
            except Exception as e:
                logger.error(f"Failed to process eras for weighted clustering: {str(e)}")

        # Popularity
        if popularity_weight > 0.0:
            try:
                pops = []
                for _, row in tracks_df.iterrows():
                    pops.append(safe_float(row.get("popularity"), 50.0))
                pops_arr = np.array(pops).reshape(-1, 1)
                if len(np.unique(pops_arr)) > 1:
                    pops_scaled = MinMaxScaler().fit_transform(pops_arr) * popularity_weight
                else:
                    pops_scaled = np.zeros_like(pops_arr)
                extra_features_parts.append(pops_scaled)
            except Exception as e:
                logger.error(f"Failed to process popularity for weighted clustering: {str(e)}")

        # Lyrics Sentiment
        if lyrics_weight > 0.0:
            try:
                sentiments = []
                from app.services.cache import cache
                from app.analysis.processors.lyric_sentiment import LyricSentimentProcessor
                sentiment_proc = LyricSentimentProcessor()
                
                for _, row in tracks_df.iterrows():
                    tid = row["id"]
                    analysis = cache.get_track_lyric_analysis(tid)
                    if analysis is None:
                        lyrics_info = cache.get_track_lyrics(tid)
                        if lyrics_info:
                            track_mock = {
                                "id": tid,
                                "name": row.get("name"),
                                "artists": ", ".join([a.get("name", "") for a in row.get("artists", [])]) if isinstance(row.get("artists"), list) else "",
                                "features": features_df.loc[tid].to_dict() if tid in features_df.index else {}
                            }
                            analysis = sentiment_proc._run_heuristic_analysis(track_mock, lyrics_info.get("lyrics", ""))
                    
                    if analysis is None:
                        track_mock = {
                            "id": tid,
                            "name": row.get("name"),
                            "artists": ", ".join([a.get("name", "") for a in row.get("artists", [])]) if isinstance(row.get("artists"), list) else "",
                            "features": features_df.loc[tid].to_dict() if tid in features_df.index else {}
                        }
                        analysis = sentiment_proc._run_heuristic_analysis(track_mock, "")
                    
                    score = safe_float(analysis.get("sentiment_score"), 0.0)
                    sentiments.append(score)
                
                sentiments_arr = np.array(sentiments).reshape(-1, 1)
                sentiments_scaled = (sentiments_arr + 1.0) / 2.0
                sentiments_weighted = sentiments_scaled * lyrics_weight
                extra_features_parts.append(sentiments_weighted)
            except Exception as e:
                logger.error(f"Failed to process lyrics sentiment for weighted clustering: {str(e)}")

        # Combine Audio scaled and extra features
        if extra_features_parts:
            X_scaled = np.hstack([X_scaled] + extra_features_parts)
        
        # 3. Determine recommended and active K
        algorithm = context.get("algorithm", "kmeans")
        splitter = get_vibe_splitter(algorithm)
        recommended_k = splitter.get_recommended_k(X_scaled)
        
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
        
        # 4. Perform Clustering / Vibe Splitting based on selected algorithm
        cluster_labels, x_coords, y_coords, recommendations = splitter.split(
            tracks_df, features_df, X_scaled, k, context
        )
            
        # Update context so subsequent processors know the actual vibes count
        unique_labels = set(cluster_labels)
        active_vibes = unique_labels - {-1}
        context["k"] = len(active_vibes)
        context["cluster_labels"] = cluster_labels
        context["llm_recommendations"] = recommendations
        
        # 5. Compute all dimensionality reduction coordinates for instant client-side toggles
        all_coords = compute_all_coords(X_scaled, features_df, tracks_df, feature_cols)
            
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
            
            # Extract popularity and album release date
            popularity = safe_int(row.get("popularity"), 50)
            album = row.get("album")
            release_date = "2000-01-01"
            if isinstance(album, dict):
                release_date = album.get("release_date") or "2000-01-01"
            album_images = album.get("images", []) if isinstance(album, dict) else []
            
            processed_tracks.append({
                "id": track_id,
                "name": row["name"],
                "uri": row["uri"],
                "artists": artists_str,
                "album_images": album_images,
                "cluster": int(cluster_labels[idx]),
                "x": float(x_coords[idx]),
                "y": float(y_coords[idx]),
                "coords": {
                    "pca": {"x": float(all_coords["pca"][0][idx]), "y": float(all_coords["pca"][1][idx])},
                    "tsne": {"x": float(all_coords["tsne"][0][idx]), "y": float(all_coords["tsne"][1][idx])},
                    "umap": {"x": float(all_coords["umap"][0][idx]), "y": float(all_coords["umap"][1][idx])},
                    "circumplex": {"x": float(all_coords["circumplex"][0][idx]), "y": float(all_coords["circumplex"][1][idx])}
                },
                "popularity": popularity,
                "release_date": release_date,
                "duration_ms": safe_int(row.get("duration_ms"), 0),
                "features": {
                    "tempo": safe_float(track_features.get("tempo"), 120.0),
                    "energy": safe_float(track_features.get("energy"), 0.5),
                    "valence": safe_float(track_features.get("valence"), 0.5),
                    "acousticness": safe_float(track_features.get("acousticness"), 0.5),
                    "danceability": safe_float(track_features.get("danceability"), 0.5),
                    "instrumentalness": safe_float(track_features.get("instrumentalness"), 0.0),
                    "speechiness": safe_float(track_features.get("speechiness"), 0.05),
                    "liveness": safe_float(track_features.get("liveness"), 0.1),
                    "mode": safe_int(track_features.get("mode"), 1),
                    "key": safe_int(track_features.get("key"), 0),
                },
                "genres": track_genres
            })
            
        # 7. Aggregate Cluster Profiles
        cluster_profiles = []
        cluster_ids = sorted(list(unique_labels)) # Will include -1 if present
        
        for cluster_idx in cluster_ids:
            cluster_idx_int = int(cluster_idx)
            cluster_tracks = [t for t in processed_tracks if t["cluster"] == cluster_idx_int]
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
                "cluster_id": cluster_idx_int,
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
        
        result = {
            "tracks": processed_tracks,
            "clusters": cluster_profiles,
            "recommended_k": recommended_k,
            "default_projection": splitter.default_projection
        }
        if recommendations is not None:
            result["recommendations"] = recommendations
            
        return result
