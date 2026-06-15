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
        # Stamp the Spotify track ID on each row so we can reliably filter features_df
        # by Spotify ID later. features_df's own index uses ReccoBeats internal IDs.
        features_df["spotify_id"] = valid_track_ids
        features_df.set_index("id", inplace=True)

        # 4.5. Pre-build processed_tracks so LyricSentimentProcessor can run before
        # VibeClusteringProcessor (which would otherwise be the one to populate it).
        pre_processed_tracks = []
        for pos, t in enumerate(valid_tracks):
            tid = t.get("id")
            artist_list = t.get("artists", [])
            artists_str = ", ".join([a.get("name", "") for a in artist_list]) if isinstance(artist_list, list) else ""
            raw_features = features_list[pos] if pos < len(features_list) else {}
            pre_processed_tracks.append({
                "id": tid,
                "name": t.get("name", ""),
                "artists": artists_str,
                "features": {
                    "tempo": raw_features.get("tempo", 120.0),
                    "energy": raw_features.get("energy", 0.5),
                    "valence": raw_features.get("valence", 0.5),
                    "acousticness": raw_features.get("acousticness", 0.5),
                    "danceability": raw_features.get("danceability", 0.5),
                    "duration_ms": t.get("duration_ms", 0),
                }
            })

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
            "lyrics_strategy": lyrics_strategy,
            "processed_tracks": pre_processed_tracks,
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

            # After LyricSentimentProcessor: if lyrics influence the clustering,
            # exclude tracks whose lyrics couldn't be fetched (not instrumental, empty text).
            if isinstance(processor, LyricSentimentProcessor) and lyrics_weight > 0.0:
                lyric_track_data = payload.get("lyrics_analysis", {}).get("tracks", {})
                lyrics_missing_ids = set()
                for tid, analysis in lyric_track_data.items():
                    is_instrumental = analysis.get("instrumental", False)
                    has_lyrics = bool(analysis.get("lyrics", "").strip())
                    if is_instrumental or not has_lyrics:
                        lyrics_missing_ids.add(tid)

                if lyrics_missing_ids:
                    for tid in lyrics_missing_ids:
                        # Find the original track metadata for the exclusion record
                        track_meta = next((t for t in valid_tracks if t.get("id") == tid), None)
                        name = track_meta.get("name") if track_meta else tid
                        artists_str = (
                            ", ".join([a.get("name", "") for a in track_meta.get("artists", [])]) 
                            if track_meta and isinstance(track_meta.get("artists"), list) else ""
                        )
                        analysis = lyric_track_data.get(tid, {})
                        if analysis.get("instrumental", False):
                            reason = "Track is instrumental and lyrics influence is active"
                        else:
                            reason = "Lyrics could not be retrieved and lyrics influence is active"
                        excluded_tracks.append({
                            "id": tid,
                            "name": name,
                            "artists": artists_str,
                            "reason": reason
                        })
                        logger.warning(
                            f"Excluding track '{name}' ({tid}) - {reason.lower()} (lyrics_weight={lyrics_weight})."
                        )

                    # Sync payload's excluded_tracks list
                    payload["excluded_tracks"] = excluded_tracks

                    # Filter tracks_df and features_df
                    tracks_df = tracks_df[~tracks_df["id"].isin(lyrics_missing_ids)].reset_index(drop=True)
                    # features_df is indexed by ReccoBeats internal IDs, not Spotify IDs;
                    # use the stamped spotify_id column to filter correctly.
                    features_df = features_df[~features_df["spotify_id"].isin(lyrics_missing_ids)]

                    # Filter context processed_tracks
                    context["processed_tracks"] = [
                        pt for pt in context["processed_tracks"]
                        if pt["id"] not in lyrics_missing_ids
                    ]

                    logger.info(
                        f"Excluded {len(lyrics_missing_ids)} tracks due to missing lyrics. "
                        f"{len(tracks_df)} tracks remain for clustering."
                    )

        return payload

def create_clustering_pipeline(lyrics_weight: float = 0.0) -> AnalysisPipeline:
    pipeline = AnalysisPipeline()
    if lyrics_weight > 0.0:
        # Run LyricSentimentProcessor first to warm the lyric analysis cache.
        # VibeClusteringProcessor reads from that cache when lyrics_weight > 0,
        # so this ordering ensures it always has real data to work with.
        pipeline.register_processor(LyricSentimentProcessor())
    pipeline.register_processor(VibeClusteringProcessor())
    return pipeline

def create_default_pipeline() -> AnalysisPipeline:
    pipeline = AnalysisPipeline()
    pipeline.register_processor(VibeClusteringProcessor())
    pipeline.register_processor(LLMRecommendationProcessor())
    return pipeline

