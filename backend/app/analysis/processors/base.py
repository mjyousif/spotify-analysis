import pandas as pd
from typing import Dict, Any

class BaseAnalysisProcessor:
    """
    Abstract interface for playlist analysis processors.
    """
    def process(
        self, 
        tracks_df: pd.DataFrame, 
        features_df: pd.DataFrame, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Processes track and feature dataframes and returns key-value data to append to the analysis payload.
        
        Args:
            tracks_df: DataFrame containing track metadata (id, name, artists, uri, etc.)
            features_df: DataFrame containing numerical audio features (tempo, energy, valence, etc.)
            context: Dictionary sharing cross-processor info (e.g. settings, oauth token, computed labels)
        
        Returns:
            Dict: Output data containing results of this analysis.
        """
        raise NotImplementedError
