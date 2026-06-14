import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, List, Optional
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from .base import BaseVibeSplitter
from .dimensionality import compute_pca_coords

logger = logging.getLogger("uvicorn.error")

class KMeansSplitter(BaseVibeSplitter):
    @property
    def name(self) -> str:
        return "K-Means Clustering"

    @property
    def description(self) -> str:
        return "Groups tracks by minimizing the distance between tracks and their cluster centers (centroids) in the multidimensional acoustic space."

    @property
    def help_text(self) -> str:
        return "A standard, balanced clustering algorithm. It is non-deterministic and assumes spherical cluster shapes, meaning it works best when your vibes are relatively evenly distributed across features like tempo, energy, and danceability."

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
    @property
    def name(self) -> str:
        return "Hierarchical (Deterministic)"

    @property
    def description(self) -> str:
        return "Creates a tree of clusters using a bottom-up merging strategy, ensuring consistent, repeatable groups."

    @property
    def help_text(self) -> str:
        return "Also known as Ward's linkage hierarchical clustering. Unlike K-Means, this algorithm is fully deterministic (running it multiple times on the same data yields identical results). It sequentially merges the most similar tracks until the target number of vibes is reached."

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
    @property
    def name(self) -> str:
        return "DBSCAN (Density-Based)"

    @property
    def description(self) -> str:
        return "Identifies clusters based on track density, marking isolated or dissimilar songs as outliers."

    @property
    def help_text(self) -> str:
        return "Density-Based Spatial Clustering of Applications with Noise. It does not require specifying the number of clusters beforehand. Instead, it finds dense regions and groups tracks within them. Isolated tracks that don't fit well anywhere are labeled as wildcards/outliers (-1), which is ideal for cleaning up heterogeneous playlists."

    @property
    def recommended_projections(self) -> List[str]:
        return ["tsne", "umap"]

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
