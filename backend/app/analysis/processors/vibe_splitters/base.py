import pandas as pd
import numpy as np
from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional, List

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

class BaseVibeSplitter(ABC):
    @property
    def default_projection(self) -> str:
        return "pca"

    def get_recommended_k(self, X_scaled: np.ndarray) -> int:
        num_tracks = X_scaled.shape[0]
        if num_tracks <= 3:
            return 2
        
        max_k = min(6, num_tracks - 1)
        if max_k < 2:
            return 2
            
        best_k = 3
        best_score = -1.0
        
        from sklearn.cluster import KMeans
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
                
        if num_tracks < 12:
            best_k = min(best_k, 2)
        elif num_tracks < 24:
            best_k = min(best_k, 3)
        elif num_tracks < 40:
            best_k = min(best_k, 4)
            
        return best_k

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
