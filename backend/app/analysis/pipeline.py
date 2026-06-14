import pandas as pd
import logging
from typing import List, Dict, Any
from app.services.spotify import get_artists_genres
from app.services.reccobeats import get_tracks_audio_features
from app.analysis.processors.base import BaseAnalysisProcessor
from app.analysis.processors.clustering import VibeClusteringProcessor
from app.analysis.processors.llm_recommender import LLMRecommendationProcessor
from app.analysis.processors.lyric_sentiment import LyricSentimentProcessor

logger = logging.getLogger("uvicorn.error")

class AnalysisPipeline:
    def __init__(self):
        self.processors: List[BaseAnalysisProcessor] = []
        
    def register_processor(self, processor: BaseAnalysisProcessor) -> None:
        self.processors.append(processor)
        
    def run(
        self, 
        access_token: str, 
        tracks: List[Dict[str, Any]], 
        k: int = None, 
        algorithm: str = "kmeans",
        genre_weight: float = 0.0,
        era_weight: float = 0.0,
        popularity_weight: float = 0.0,
        lyrics_weight: float = 0.0,
        lyrics_strategy: str = "spotify_model"
    ) -> Dict[str, Any]:
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
            
        logger.info(
            f"Running analysis pipeline on {len(tracks)} tracks with k={k}, algorithm={algorithm}, "
            f"genre_weight={genre_weight}, era_weight={era_weight}, "
            f"popularity_weight={popularity_weight}, lyrics_weight={lyrics_weight}, strategy={lyrics_strategy}"
        )
        
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
            
        # 3. Build features list and filter out tracks without features
        features_list = []
        valid_track_ids = []
        excluded_tracks = []
        
        for t in tracks:
            tid = t.get("id")
            if not tid:
                continue
            if tid in features_map:
                features_list.append(features_map[tid])
                valid_track_ids.append(tid)
            else:
                excluded_tracks.append({
                    "id": tid,
                    "name": t.get("name"),
                    "artists": ", ".join([a.get("name", "") for a in t.get("artists", [])]) if isinstance(t.get("artists"), list) else "",
                    "reason": "Acoustic audio features could not be retrieved from ReccoBeats"
                })
                logger.warning(f"Excluding track '{t.get('name')}' ({tid}) - audio features missing from ReccoBeats.")
                
        # Re-build tracks list and tracks_df for remaining valid tracks
        valid_tracks = [t for t in tracks if t.get("id") in valid_track_ids]
        if not valid_tracks:
            return {
                "tracks": [],
                "clusters": [],
                "recommendations": [],
                "excluded_tracks": excluded_tracks,
                "message": "All tracks in the playlist were excluded because their audio features could not be retrieved."
            }
            
        tracks_df = pd.DataFrame(valid_tracks)
        features_df = pd.DataFrame(features_list)
        features_df.set_index("id", inplace=True)
        
        # 5. Initialize Context for processors
        context = {
            "k": k,
            "algorithm": algorithm,
            "artist_genres": genres_map,
            "access_token": access_token,
            "genre_weight": genre_weight,
            "era_weight": era_weight,
            "popularity_weight": popularity_weight,
            "lyrics_weight": lyrics_weight,
            "lyrics_strategy": lyrics_strategy
        }
        
        # 6. Run all registered processors
        payload = {"excluded_tracks": excluded_tracks}
        for processor in self.processors:
            try:
                result = processor.process(tracks_df, features_df, context)
                if result:
                    payload.update(result)
            except Exception as e:
                logger.error(f"Processor {processor.__class__.__name__} failed: {str(e)}")
                raise e
                
        return payload

def create_clustering_pipeline() -> AnalysisPipeline:
    pipeline = AnalysisPipeline()
    pipeline.register_processor(VibeClusteringProcessor())
    return pipeline

def create_default_pipeline() -> AnalysisPipeline:
    pipeline = AnalysisPipeline()
    pipeline.register_processor(VibeClusteringProcessor())
    pipeline.register_processor(LLMRecommendationProcessor())
    return pipeline

