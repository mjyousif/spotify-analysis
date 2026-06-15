import pandas as pd
import logging
from typing import List, Dict, Any, Optional, Callable
from app.services.spotify import get_artists_genres
from app.services.reccobeats import get_tracks_audio_features
from app.analysis.processors.base import BaseAnalysisProcessor
from app.analysis.processors.clustering import VibeClusteringProcessor
from app.analysis.processors.llm_recommender import LLMRecommendationProcessor
from app.analysis.processors.lyric_sentiment import LyricSentimentProcessor
from app.analysis.timing import AnalysisTimer, log_timing_summary

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
        lyrics_strategy: str = "spotify_model",
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        playlist_id: str = "",
    ) -> Dict[str, Any]:
        """
        Gathers raw data, builds DataFrames, runs all processors, 
        and packages the final payload.
        
        progress_callback: optional callable(event_dict) emitted at each major stage.
        """
        if not tracks:
            return {
                "tracks": [],
                "clusters": [],
                "recommendations": []
            }

        n_tracks = len(tracks)
        timings: Dict = {}  # shared timing registry

        logger.info(
            f"━━━ Analysis pipeline starting ━━━  playlist={playlist_id or 'unknown'}, "
            f"tracks={n_tracks}, algorithm={algorithm}, k={k}, "
            f"genre_weight={genre_weight}, era_weight={era_weight}, "
            f"popularity_weight={popularity_weight}, lyrics_weight={lyrics_weight}, "
            f"strategy={lyrics_strategy}"
        )
            
        # ── 1. Fetch artist genres ────────────────────────────────────────────────
        if progress_callback:
            progress_callback({
                "type": "progress",
                "stage": "artist_genres",
                "message": f"Fetching artist genre data for {n_tracks} tracks...",
                "step": 1,
                "total_steps": 6,
            })

        artist_ids = set()
        for track in tracks:
            for artist in track.get("artists", []):
                if artist.get("id"):
                    artist_ids.add(artist["id"])

        with AnalysisTimer("artist_genres", timings):
            try:
                genres_map = get_artists_genres(access_token, list(artist_ids))
                logger.info(f"[1/6] Artist genres fetched for {len(genres_map)} artists.")
            except Exception as e:
                logger.error(f"[1/6] Failed to fetch artist genres: {str(e)}")
                genres_map = {}
                    
        # ── 2. Fetch audio features ───────────────────────────────────────────────
        if progress_callback:
            progress_callback({
                "type": "progress",
                "stage": "audio_features",
                "message": f"Fetching audio features for {n_tracks} tracks from ReccoBeats...",
                "step": 2,
                "total_steps": 6,
            })

        track_ids = [t["id"] for t in tracks if t.get("id")]
        with AnalysisTimer("audio_features", timings):
            try:
                features_map = get_tracks_audio_features(track_ids)
                logger.info(f"[2/6] Audio features fetched for {len(features_map)}/{n_tracks} tracks.")
            except Exception as e:
                logger.error(f"[2/6] Failed to fetch audio features: {str(e)}")
                features_map = {}
                    
        # ── 3. Build feature list & filter tracks missing audio data ──────────────
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
                logger.warning(f"Excluding track '{t.get('name')}' ({tid}) — audio features missing from ReccoBeats.")

        if excluded_tracks:
            logger.info(f"{len(excluded_tracks)} tracks excluded (no audio features). {len(valid_track_ids)} remain.")
                
        valid_tracks = [t for t in tracks if t.get("id") in valid_track_ids]
        if not valid_tracks:
            return {
                "tracks": [],
                "clusters": [],
                "recommendations": [],
                "excluded_tracks": excluded_tracks,
                "message": "All tracks in the playlist were excluded because their audio features could not be retrieved.",
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

        # ── 5. Initialize Context for processors ─────────────────────────────────
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
            "progress_callback": progress_callback,
            "timings": timings,
        }
        
        # ── 6. Run all registered processors ─────────────────────────────────────
        payload = {"excluded_tracks": excluded_tracks}
        for processor in self.processors:
            proc_name = processor.__class__.__name__
            logger.info(f"Running processor: {proc_name}")
            with AnalysisTimer(f"processor_{proc_name}", timings):
                try:
                    result = processor.process(tracks_df, features_df, context)
                    if result:
                        payload.update(result)
                except Exception as e:
                    logger.error(f"Processor {proc_name} failed: {str(e)}")
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
                            f"Excluding track '{name}' ({tid}) — {reason.lower()} (lyrics_weight={lyrics_weight})."
                        )

                    payload["excluded_tracks"] = excluded_tracks

                    tracks_df = tracks_df[~tracks_df["id"].isin(lyrics_missing_ids)].reset_index(drop=True)
                    features_df = features_df[~features_df["spotify_id"].isin(lyrics_missing_ids)]
                    context["processed_tracks"] = [
                        pt for pt in context["processed_tracks"]
                        if pt["id"] not in lyrics_missing_ids
                    ]

                    logger.info(
                        f"Excluded {len(lyrics_missing_ids)} tracks due to missing lyrics. "
                        f"{len(tracks_df)} tracks remain for clustering."
                    )

        # ── 7. Timing summary ─────────────────────────────────────────────────────
        log_timing_summary(timings, playlist_id=playlist_id)
        logger.info("━━━ Analysis pipeline complete ━━━")

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
