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
