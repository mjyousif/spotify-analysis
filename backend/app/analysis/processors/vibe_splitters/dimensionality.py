import logging
import pandas as pd
import numpy as np
from typing import Dict, Tuple, List
from sklearn.decomposition import PCA
from .base import safe_float

logger = logging.getLogger("uvicorn.error")

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
    feature_cols: List[str],
    lyrics_strategy: str = "spotify_model",
    lyrics_weight: float = 0.0
) -> Dict[str, Tuple[List[float], List[float], List[float]]]:
    num_tracks = X_scaled.shape[0]
    
    # Initialize defaults
    res = {
        "pca": ([0.0] * num_tracks, [0.0] * num_tracks, [0.0] * num_tracks),
        "tsne": ([0.0] * num_tracks, [0.0] * num_tracks, [0.0] * num_tracks),
        "umap": ([0.0] * num_tracks, [0.0] * num_tracks, [0.0] * num_tracks),
        "circumplex": ([0.5] * num_tracks, [0.5] * num_tracks, [0.5] * num_tracks)
    }
    
    if num_tracks < 1:
        return res
        
    # Circumplex: Valence (X), Energy (Y), Danceability (Z)
    valence_list = []
    energy_list = []
    danceability_list = []
    
    # Pre-compute column indices into X_scaled (already MinMaxScaler normalized to [0,1])
    # This is more reliable than looking up features_df by track_id, which can fail when
    # features_df is indexed by ReccoBeats IDs rather than Spotify IDs.
    val_idx   = feature_cols.index("valence")      if "valence"      in feature_cols else None
    eng_idx   = feature_cols.index("energy")       if "energy"       in feature_cols else None
    dance_idx = feature_cols.index("danceability") if "danceability" in feature_cols else None

    # Blend lyrics valence/energy if lyrics_weight > 0
    blend_lyrics = (lyrics_weight > 0.0)
    from app.services.cache import cache
    from app.analysis.processors.lyric_strategies import get_lyric_strategy
    
    strategy = get_lyric_strategy(lyrics_strategy)
    
    for pos, (_, row) in enumerate(tracks_df.iterrows()):
        track_id = row["id"]

        # Read normalized audio features directly from X_scaled by position
        audio_val   = float(X_scaled[pos, val_idx])   if val_idx   is not None else 0.5
        audio_eng   = float(X_scaled[pos, eng_idx])   if eng_idx   is not None else 0.5
        dance       = float(X_scaled[pos, dance_idx]) if dance_idx is not None else 0.5
        
        if blend_lyrics:
            try:
                cache_key = f"{track_id}:{lyrics_strategy}"
                analysis = cache.get_track_lyric_analysis(cache_key)
                if analysis:
                    lyrical_val, lyrical_eng = strategy.get_lyrical_valence_and_energy(analysis, audio_val, audio_eng)
                    
                    audio_val = (audio_val + lyrics_weight * lyrical_val) / (1.0 + lyrics_weight)
                    audio_eng = (audio_eng + lyrics_weight * lyrical_eng) / (1.0 + lyrics_weight)
            except Exception as e:
                logger.error(f"Error fetching cache in compute_all_coords: {str(e)}")
                
        valence_list.append(audio_val)
        energy_list.append(audio_eng)
        danceability_list.append(dance)
        
    res["circumplex"] = (valence_list, energy_list, danceability_list)


    if num_tracks < 2:
        res["pca"] = (valence_list, energy_list, danceability_list)
        res["tsne"] = (valence_list, energy_list, danceability_list)
        res["umap"] = (valence_list, energy_list, danceability_list)
        return res

    # 1. PCA
    try:
        n_comps = min(3, num_tracks)
        pca = PCA(n_components=n_comps, random_state=42)
        coords = pca.fit_transform(X_scaled)
        x_pts = coords[:, 0].tolist()
        y_pts = coords[:, 1].tolist() if n_comps > 1 else [0.0] * num_tracks
        z_pts = coords[:, 2].tolist() if n_comps > 2 else [0.0] * num_tracks
        res["pca"] = (x_pts, y_pts, z_pts)
    except Exception as e:
        logger.error(f"PCA failed in compute_all_coords: {e}")
        res["pca"] = (valence_list, energy_list, danceability_list)

    # 2. t-SNE
    try:
        from sklearn.manifold import TSNE
        perplexity = max(1.0, min(30.0, float(num_tracks - 1) / 3.0))
        n_comps = min(3, num_tracks - 1)
        if n_comps >= 1:
            tsne = TSNE(n_components=n_comps, random_state=42, perplexity=perplexity)
            coords = tsne.fit_transform(X_scaled)
            x_pts = coords[:, 0].tolist()
            y_pts = coords[:, 1].tolist() if n_comps > 1 else [0.0] * num_tracks
            z_pts = coords[:, 2].tolist() if n_comps > 2 else [0.0] * num_tracks
            res["tsne"] = (x_pts, y_pts, z_pts)
        else:
            res["tsne"] = (valence_list, energy_list, danceability_list)
    except Exception as e:
        logger.error(f"t-SNE failed in compute_all_coords: {e}")
        res["tsne"] = res["pca"]

    # 3. UMAP
    try:
        import umap
        n_neighbors = max(2, min(15, num_tracks - 1))
        n_comps = min(3, num_tracks - 1)
        if n_comps >= 2:
            reducer = umap.UMAP(n_components=n_comps, random_state=42, n_neighbors=n_neighbors, n_epochs=200)
            coords = reducer.fit_transform(X_scaled)
            x_pts = coords[:, 0].tolist()
            y_pts = coords[:, 1].tolist() if n_comps > 1 else [0.0] * num_tracks
            z_pts = coords[:, 2].tolist() if n_comps > 2 else [0.0] * num_tracks
            res["umap"] = (x_pts, y_pts, z_pts)
        else:
            res["umap"] = (valence_list, energy_list, danceability_list)
    except Exception as e:
        logger.error(f"UMAP failed in compute_all_coords: {e}")
        res["umap"] = res["pca"]

    return res


PROJECTION_METADATA = {
    "pca": {
        "name": "PCA (Principal Component Analysis)",
        "description": "Reduces dimensions by finding the axes of maximum variance in acoustic feature space.",
        "help_text": "Principal Component Analysis is a linear dimensionality reduction method. It projects the multi-dimensional audio features onto two key axes that capture the maximum spread of the data. It is excellent for preserving the global structure and layout of the entire playlist, showing which tracks are broadly similar.",
        "recommended_algorithms": ["kmeans", "agglomerative", "genre_first", "llm_semantic"]
    },
    "tsne": {
        "name": "t-SNE (t-Distributed Stochastic Neighbor Embedding)",
        "description": "A non-linear technique that groups close neighbors tightly while ignoring global distances.",
        "help_text": "t-SNE is a non-linear probability-based visualization tool. It is designed to preserve local relationships, meaning highly similar tracks are compressed into tight, distinct neighborhoods on the plot. Note: the distances between clusters are not meaningful, and it can be non-deterministic.",
        "recommended_algorithms": ["kmeans", "agglomerative", "dbscan"]
    },
    "umap": {
        "name": "UMAP (Uniform Manifold Approximation and Projection)",
        "description": "Balances local and global structure using manifold learning for natural cluster visual separation.",
        "help_text": "UMAP is a state-of-the-art non-linear dimensionality reduction algorithm. It preserves both the local groupings (like t-SNE) and the global relationships between those groups (like PCA). This makes it the most natural representation for exploring complex vibe clusters.",
        "recommended_algorithms": ["kmeans", "agglomerative", "dbscan", "llm_semantic"]
    },
    "circumplex": {
        "name": "Russell Circumplex Model",
        "description": "Uses Valence as the horizontal axis (mood positivity) and Energy as the vertical axis.",
        "help_text": "Russell's Circumplex Model of Affect represents emotion along two axes: Valence (pleasure-displeasure) and Arousal/Energy (activation-deactivation). This plot places happy tracks top-right, angry/intense tracks top-left, sad/depressed tracks bottom-left, and peaceful tracks bottom-right. It is fully intuitive and readable.",
        "recommended_algorithms": ["mood_mapping"]
    }
}
