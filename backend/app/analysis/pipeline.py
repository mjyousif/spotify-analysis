import pandas as pd
import logging
from typing import List, Dict, Any
from app.services.spotify import get_artists_genres
from app.services.reccobeats import get_tracks_audio_features
from app.analysis.processors.base import BaseAnalysisProcessor
from app.analysis.processors.clustering import VibeClusteringProcessor
from app.analysis.processors.llm_recommender import LLMRecommendationProcessor

logger = logging.getLogger("uvicorn.error")

class AnalysisPipeline:
    def __init__(self):
        self.processors: List[BaseAnalysisProcessor] = []
        
    def register_processor(self, processor: BaseAnalysisProcessor) -> None:
        self.processors.append(processor)
        
    def run(self, access_token: str, tracks: List[Dict[str, Any]], k: int) -> Dict[str, Any]:
        """
        Gathers raw data, builds DataFrames, runs all processors, 
        and packages the final payload.
        """
        if not tracks:
            return {
                "tracks": [],
                "clusters": [],
                "recommendations": []
            }
            
        logger.info(f"Running analysis pipeline on {len(tracks)} tracks with k={k}")
        
        # 1. Fetch artist details (genres) from Spotify
        artist_ids = set()
        for track in tracks:
            for artist in track.get("artists", []):
                if artist.get("id"):
                    artist_ids.add(artist["id"])
                    
        # Retrieve genres from Spotify API
        try:
            genres_map = get_artists_genres(access_token, list(artist_ids))
        except Exception as e:
            logger.error(f"Failed to fetch artist genres: {str(e)}")
            genres_map = {}
            
        # 2. Fetch audio features from ReccoBeats
        track_ids = [t["id"] for t in tracks if t.get("id")]
        try:
            features_map = get_tracks_audio_features(track_ids)
        except Exception as e:
            logger.error(f"Failed to fetch audio features: {str(e)}")
            features_map = {}
            
        # 3. Build tracks metadata DataFrame
        tracks_df = pd.DataFrame(tracks)
        
        # 4. Build features DataFrame
        features_list = []
        for tid in track_ids:
            # If feature is missing, construct a default/mock one
            feat = features_map.get(tid, {
                "id": tid,
                "tempo": 120.0,
                "energy": 0.5,
                "valence": 0.5,
                "acousticness": 0.5,
                "danceability": 0.5,
                "instrumentalness": 0.0,
                "speechiness": 0.05
            })
            features_list.append(feat)
            
        features_df = pd.DataFrame(features_list)
        features_df.set_index("id", inplace=True)
        
        # 5. Initialize Context for processors
        context = {
            "k": k,
            "artist_genres": genres_map,
            "access_token": access_token
        }
        
        # 6. Run all registered processors
        payload = {}
        for processor in self.processors:
            try:
                result = processor.process(tracks_df, features_df, context)
                if result:
                    payload.update(result)
            except Exception as e:
                logger.error(f"Processor {processor.__class__.__name__} failed: {str(e)}")
                
        return payload

# Factory method to create a pre-configured pipeline
def create_default_pipeline() -> AnalysisPipeline:
    pipeline = AnalysisPipeline()
    pipeline.register_processor(VibeClusteringProcessor())
    pipeline.register_processor(LLMRecommendationProcessor())
    return pipeline
