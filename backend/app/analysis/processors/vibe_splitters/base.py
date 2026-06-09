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
