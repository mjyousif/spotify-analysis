import logging
import os
import re
import json
import queue
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.routers.auth import get_spotify_token
from app.services.spotify import (
    get_playlist_tracks, 
    get_artists_genres, 
    SpotifyAPIError
)
from app.analysis.pipeline import create_default_pipeline, create_clustering_pipeline
from app.analysis.processors.vibe_splitters.llm import LlmSplitterError

try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


# ─────────────────────────────────────────────────────────────────────────────
# SSE helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sse_event(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _run_pipeline_streaming(
    token: str,
    playlist_id: str,
    tracks,
    k,
    algorithm,
    genre_weight,
    era_weight,
    popularity_weight,
    lyrics_weight,
    lyrics_strategy,
    include_llm,
    event_queue: "queue.Queue",
):
    """
    Runs the analysis pipeline in the current thread, pushing SSE events into
    event_queue as stages complete. Pushes a sentinel None when done.
    """
    def progress_callback(event: dict):
        event_queue.put(event)

    try:
        if include_llm:
            pipeline = create_default_pipeline()
        else:
            pipeline = create_clustering_pipeline(lyrics_weight=lyrics_weight)

        result = pipeline.run(
            token,
            tracks,
            k,
            algorithm,
            genre_weight=genre_weight,
            era_weight=era_weight,
            popularity_weight=popularity_weight,
            lyrics_weight=lyrics_weight,
            lyrics_strategy=lyrics_strategy,
            progress_callback=progress_callback,
            playlist_id=playlist_id,
        )

        if "recommendations" not in result:
            result["recommendations"] = []

        event_queue.put({"type": "complete", "data": result})

    except LlmSplitterError as e:
        logger.error(f"LLM Splitter error during streaming analysis of {playlist_id}: {str(e)}")
        event_queue.put({"type": "error", "code": "llm_splitter_error", "message": str(e)})
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error during streaming analysis of {playlist_id}: {e.message}")
        event_queue.put({"type": "error", "code": "spotify_error", "message": e.message})
    except Exception as e:
        logger.error(f"Error during streaming analysis of {playlist_id}: {str(e)}")
        event_queue.put({"type": "error", "code": "pipeline_error", "message": str(e)})
    finally:
        event_queue.put(None)  # sentinel → generator exits


# ─────────────────────────────────────────────────────────────────────────────
# Streaming analysis endpoint (replaces the old synchronous one)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/playlist/{playlist_id}/stream")
def stream_analyze_playlist(
    playlist_id: str,
    k: int = Query(None, description="Number of clusters/vibe splits to create", ge=1, le=10),
    algorithm: str = Query("kmeans", description="Clustering algorithm to use"),
    genre_weight: float = Query(0.0, description="Weight of artist genres", ge=0.0, le=5.0),
    era_weight: float = Query(0.0, description="Weight of release decade/year", ge=0.0, le=5.0),
    popularity_weight: float = Query(0.0, description="Weight of track popularity", ge=0.0, le=5.0),
    lyrics_weight: float = Query(0.0, description="Weight of lyrics sentiment", ge=0.0, le=5.0),
    lyrics_strategy: str = Query("spotify_model", description="Lyrical analysis strategy to use"),
    include_llm: bool = Query(False, description="Whether to run LLM recommendation processor"),
    token: str = Depends(get_spotify_token)
):
    """
    Streams the analysis pipeline as Server-Sent Events (SSE).

    Each event is a JSON object on a ``data:`` line:
      - ``{"type": "progress", "stage": "...", "message": "...", "step": N, "total_steps": 6, ...}``
      - ``{"type": "complete", "data": { ...AnalysisResponse... }}``
      - ``{"type": "error",    "code": "...", "message": "..."}``

    The client should replace this endpoint wherever the old synchronous
    ``GET /api/analysis/playlist/{id}`` was previously used.
    """
    import threading

    # 1. Fetch track list first (fast, usually cached)
    try:
        tracks = get_playlist_tracks(token, playlist_id)
    except SpotifyAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch tracks: {str(e)}")

    if not tracks:
        # Return a single complete event for empty playlists
        def _empty():
            yield _sse_event({
                "type": "complete",
                "data": {"tracks": [], "clusters": [], "recommendations": [],
                         "message": "Playlist is empty or contains unsupported items."}
            })
        return StreamingResponse(_empty(), media_type="text/event-stream")

    n_tracks = len(tracks)
    event_queue: queue.Queue = queue.Queue()

    # 2. Kick off the pipeline in a background thread
    thread = threading.Thread(
        target=_run_pipeline_streaming,
        args=(
            token, playlist_id, tracks,
            k, algorithm,
            genre_weight, era_weight, popularity_weight, lyrics_weight, lyrics_strategy,
            include_llm, event_queue,
        ),
        daemon=True,
    )
    thread.start()

    # 3. Immediately emit an "initializing" event so the client knows we started
    def generate():
        # Emit initial event before pipeline even starts
        yield _sse_event({
            "type": "progress",
            "stage": "initializing",
            "message": f"Starting analysis for {n_tracks} tracks...",
            "step": 0,
            "total_steps": 6,
        })

        while True:
            event = event_queue.get()
            if event is None:
                break  # pipeline thread finished
            yield _sse_event(event)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Keep the old synchronous endpoint for backward compatibility / direct calls
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/playlist/{playlist_id}")
def analyze_playlist(
    playlist_id: str,
    k: int = Query(None, description="Number of clusters/vibe splits to create", ge=1, le=10),
    algorithm: str = Query("kmeans", description="Clustering algorithm to use"),
    genre_weight: float = Query(0.0, description="Weight of artist genres", ge=0.0, le=5.0),
    era_weight: float = Query(0.0, description="Weight of release decade/year", ge=0.0, le=5.0),
    popularity_weight: float = Query(0.0, description="Weight of track popularity", ge=0.0, le=5.0),
    lyrics_weight: float = Query(0.0, description="Weight of lyrics sentiment", ge=0.0, le=5.0),
    lyrics_strategy: str = Query("spotify_model", description="Lyrical analysis strategy to use"),
    include_llm: bool = Query(False, description="Whether to run LLM recommendation processor synchronously"),
    token: str = Depends(get_spotify_token)
):
    """
    Synchronous fallback. Prefer the /stream endpoint for progress reporting.
    """
    try:
        tracks = get_playlist_tracks(token, playlist_id)
        if not tracks:
            return {
                "tracks": [],
                "clusters": [],
                "recommendations": [],
                "message": "Playlist is empty or contains unsupported items."
            }
            
        if include_llm:
            pipeline = create_default_pipeline()
        else:
            pipeline = create_clustering_pipeline(lyrics_weight=lyrics_weight)

        result = pipeline.run(
            token, 
            tracks, 
            k, 
            algorithm,
            genre_weight=genre_weight,
            era_weight=era_weight,
            popularity_weight=popularity_weight,
            lyrics_weight=lyrics_weight,
            lyrics_strategy=lyrics_strategy,
            playlist_id=playlist_id,
        )

        if "recommendations" not in result:
            result["recommendations"] = []

        return result
        
    except LlmSplitterError as e:
        logger.error(f"LLM Splitter error during analysis of {playlist_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"AI Semantic Split failed: {str(e)}")
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error during analysis of {playlist_id}: {e.message}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error analyzing playlist {playlist_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze playlist: {str(e)}"
        )


@router.get("/playlist/{playlist_id}/recommendations")
def get_playlist_recommendations(
    playlist_id: str,
    k: int = Query(None, description="Number of clusters/vibe splits to create", ge=1, le=10),
    algorithm: str = Query("kmeans", description="Clustering algorithm to use"),
    genre_weight: float = Query(0.0, description="Weight of artist genres", ge=0.0, le=5.0),
    era_weight: float = Query(0.0, description="Weight of release decade/year", ge=0.0, le=5.0),
    popularity_weight: float = Query(0.0, description="Weight of track popularity", ge=0.0, le=5.0),
    lyrics_weight: float = Query(0.0, description="Weight of lyrics sentiment", ge=0.0, le=5.0),
    lyrics_strategy: str = Query("spotify_model", description="Lyrical analysis strategy to use"),
    token: str = Depends(get_spotify_token)
):
    """
    Runs clustering and then generates LLM recommendations.
    Uses cached track details and features, so it is fast except for the LLM call itself.
    """
    try:
        tracks = get_playlist_tracks(token, playlist_id)
        if not tracks:
            return {
                "recommendations": [],
                "llm_active": False,
                "llm_provider": "none",
                "llm_model": "none"
            }
            
        pipeline = create_default_pipeline()
        result = pipeline.run(
            token, 
            tracks, 
            k, 
            algorithm,
            genre_weight=genre_weight,
            era_weight=era_weight,
            popularity_weight=popularity_weight,
            lyrics_weight=lyrics_weight,
            lyrics_strategy=lyrics_strategy,
            playlist_id=playlist_id,
        )
        return {
            "recommendations": result.get("recommendations", []),
            "llm_active": result.get("llm_active", False),
            "llm_provider": result.get("llm_provider", "none"),
            "llm_model": result.get("llm_model", "none")
        }
    except LlmSplitterError as e:
        logger.error(f"LLM Splitter error during recommendations of {playlist_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"AI Semantic Split failed: {str(e)}")
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error during recommendations of {playlist_id}: {e.message}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error generating recommendations for playlist {playlist_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recommendations: {str(e)}"
        )



@router.get("/track/{track_id}/lyrics")
def analyze_track_lyrics(
    track_id: str,
    track_name: str = Query(..., description="Name of the track"),
    artist_name: str = Query(..., description="Artist name"),
    album_name: str = Query("", description="Album name"),
    duration_ms: int = Query(0, description="Duration in ms"),
    valence: float = Query(0.5, description="Spotify valence"),
    energy: float = Query(0.5, description="Spotify energy"),
    lyrics_strategy: str = Query("spotify_model", description="Lyrical analysis strategy to use"),
    token: str = Depends(get_spotify_token)
):
    """
    Fetches lyrics and analyzes sentiment for a single track on-demand.
    """
    try:
        # 1. Fetch lyrics
        from app.services.lyrics import fetch_lyrics
        lyrics_info = fetch_lyrics(track_id, track_name, artist_name, album_name, duration_ms)
        lyrics_text = lyrics_info.get("lyrics", "")
        is_instrumental = lyrics_info.get("instrumental", False)
        synced_lyrics = lyrics_info.get("synced_lyrics")

        # 2. Check cache for sentiment analysis
        from app.services.cache import cache
        cache_key = f"{track_id}:{lyrics_strategy}"
        analysis_data = cache.get_track_lyric_analysis(cache_key)
        
        if analysis_data is None:
            # Analyze track
            from app.analysis.processors.lyric_sentiment import LyricSentimentProcessor
            processor = LyricSentimentProcessor()
            
            track_mock = {
                "id": track_id,
                "name": track_name,
                "artists": artist_name,
                "features": {
                    "valence": valence,
                    "energy": energy
                }
            }
            
            if is_instrumental:
                analysis_data = {
                    "mood": "instrumental",
                    "key_themes": ["instrumental"],
                    "prominent_words": [],
                    "summary": "This track is instrumental, carrying mood through sound and rhythm rather than lyrics."
                }
                if lyrics_strategy == "spotify_model":
                    analysis_data.update({
                        "lyrical_valence": 0.5,
                        "lyrical_energy": 0.5,
                        "emotional_ambiguity": 0.0
                    })
                else:
                    analysis_data.update({
                        "sentiment_score": 0.0,
                        "emotions": {
                            "joy": 0.0, "sadness": 0.0, "anger": 0.0,
                            "fear_anxiety": 0.0, "love_romance": 0.0, "nostalgia_longing": 0.0
                        }
                    })
            elif not lyrics_text.strip():
                from app.analysis.processors.lyric_strategies import get_lyric_strategy
                strategy = get_lyric_strategy(lyrics_strategy)
                analysis_data = strategy.run_heuristic_fallback(track_mock, lyrics_text)
            else:
                # Check if LLM is active
                from app.analysis.processors.vibe_splitters import resolve_llm_config
                provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
                
                if litellm and has_llm_key:
                    analysis_data = processor._run_llm_analysis(
                        track_name, artist_name, lyrics_text, actual_model, api_base, api_key, lyrics_strategy
                    )
                    
                if analysis_data is None:
                    from app.analysis.processors.lyric_strategies import get_lyric_strategy
                    strategy = get_lyric_strategy(lyrics_strategy)
                    analysis_data = strategy.run_heuristic_fallback(track_mock, lyrics_text)
                    
                # Cache it
                cache.set_track_lyric_analysis(cache_key, analysis_data)
                
        analysis_data["lyrics"] = lyrics_text
        analysis_data["instrumental"] = is_instrumental
        analysis_data["synced_lyrics"] = synced_lyrics
        return analysis_data
        
    except Exception as e:
        logger.error(f"Failed to analyze track lyrics for {track_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze track lyrics: {str(e)}")


@router.get("/playlist/{playlist_id}/lyrics")
def analyze_playlist_lyrics(
    playlist_id: str,
    lyrics_strategy: str = Query("spotify_model", description="Lyrical analysis strategy to use"),
    token: str = Depends(get_spotify_token)
):
    """
    Runs batch lyrics sentiment analysis for the entire playlist and caches results.
    """
    try:
        tracks = get_playlist_tracks(token, playlist_id)
        if not tracks:
            return {
                "tracks": {},
                "playlist_sentiment": {
                    "mood_distribution": {},
                    "top_words": [],
                    "average_sentiment": 0.0
                }
            }

        from app.services.reccobeats import get_tracks_audio_features
        track_ids = [t["id"] for t in tracks if t.get("id")]
        try:
            features_map = get_tracks_audio_features(track_ids)
        except Exception as e:
            logger.error(f"Failed to fetch audio features: {str(e)}")
            features_map = {}

        artist_ids = set()
        for track in tracks:
            for artist in track.get("artists", []):
                if artist.get("id"):
                    artist_ids.add(artist["id"])
        try:
            genres_map = get_artists_genres(token, list(artist_ids))
        except Exception as e:
            logger.error(f"Failed to fetch artist genres: {str(e)}")
            genres_map = {}

        features_list = []
        valid_track_ids = []
        for track in tracks:
            tid = track.get("id")
            if not tid:
                continue
            if tid in features_map:
                features_list.append(features_map[tid])
                valid_track_ids.append(tid)
            else:
                logger.warning(f"Excluding track '{track.get('name')}' ({tid}) from lyrics analysis — audio features missing.")
        
        valid_tracks = [t for t in tracks if t.get("id") in valid_track_ids]
        if not valid_tracks:
            return {
                "tracks": {},
                "playlist_sentiment": {
                    "mood_distribution": {},
                    "top_words": [],
                    "average_sentiment": 0.0
                }
            }
            
        tracks_df = pd.DataFrame(valid_tracks)
        features_df = pd.DataFrame(features_list)
        features_df.set_index("id", inplace=True)

        processed_tracks = []
        for pos, (_, row) in enumerate(tracks_df.iterrows()):
            track_id = row["id"]
            artist_list = row.get("artists", [])
            artists_str = ", ".join([a.get("name", "") for a in artist_list])
            track_features = features_df.iloc[pos].to_dict() if pos < len(features_df) else {}
            
            track_artist_ids = [a.get("id") for a in artist_list if a.get("id")]
            track_genres = []
            for aid in track_artist_ids:
                if aid in genres_map:
                    track_genres.extend(genres_map[aid])
            track_genres = list(set(track_genres))

            processed_tracks.append({
                "id": track_id,
                "name": row["name"],
                "artists": artists_str,
                "features": {
                    "tempo": track_features.get("tempo", 120.0),
                    "energy": track_features.get("energy", 0.5),
                    "valence": track_features.get("valence", 0.5),
                    "acousticness": track_features.get("acousticness", 0.5),
                    "danceability": track_features.get("danceability", 0.5),
                },
                "genres": track_genres
            })

        context = {
            "processed_tracks": processed_tracks,
            "artist_genres": genres_map,
            "lyrics_strategy": lyrics_strategy
        }

        from app.analysis.processors.lyric_sentiment import LyricSentimentProcessor
        processor = LyricSentimentProcessor()
        result = processor.process(tracks_df, features_df, context)
        
        return result.get("lyrics_analysis", {
            "tracks": {},
            "playlist_sentiment": {
                "mood_distribution": {},
                "top_words": [],
                "average_sentiment": 0.0
            }
        })

    except Exception as e:
        logger.error(f"Error running batch lyrics analysis for playlist {playlist_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze playlist lyrics: {str(e)}")
