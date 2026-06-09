import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, List, Optional
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from .base import BaseVibeSplitter
from .dimensionality import compute_pca_coords

logger = logging.getLogger("uvicorn.error")

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
