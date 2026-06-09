import logging
import os
import re
import json
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from app.routers.auth import get_spotify_token
from app.services.spotify import (
    get_playlist_tracks, 
    get_artists_genres, 
    SpotifyAPIError
)
from app.analysis.pipeline import create_default_pipeline

try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])

@router.get("/playlist/{playlist_id}")
def analyze_playlist(
    playlist_id: str,
    k: int = Query(None, description="Number of clusters/vibe splits to create", ge=1, le=10),
    algorithm: str = Query("kmeans", description="Clustering algorithm to use"),
    token: str = Depends(get_spotify_token)
):
    """
    Fetches tracks in a playlist, retrieves audio features, 
    and returns cluster groupings, coordinates, and LLM vibe split recommendations.
    """
    try:
        # 1. Fetch tracks in the playlist
        tracks = get_playlist_tracks(token, playlist_id)
        if not tracks:
            return {
                "tracks": [],
                "clusters": [],
                "recommendations": [],
                "message": "Playlist is empty or contains unsupported items."
            }
            
        # 2. Run analysis pipeline
        pipeline = create_default_pipeline()
        result = pipeline.run(token, tracks, k, algorithm)
        return result
        
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error during analysis of {playlist_id}: {e.message}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error analyzing playlist {playlist_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze playlist: {str(e)}"
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
        analysis_data = cache.get_track_lyric_analysis(track_id)
        
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
                    "sentiment_score": 0.0,
                    "key_themes": ["instrumental"],
                    "prominent_words": [],
                    "summary": "This track is instrumental, carrying mood through sound and rhythm rather than lyrics."
                }
            elif not lyrics_text.strip():
                analysis_data = processor._run_heuristic_analysis(track_mock, lyrics_text)
            else:
                # Check if LLM is active
                from app.analysis.processors.vibe_splitters import resolve_llm_config
                provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
                
                if litellm and has_llm_key:
                    analysis_data = processor._run_llm_analysis(
                        track_name, artist_name, lyrics_text, actual_model, api_base, api_key
                    )
                    
                if analysis_data is None:
                    analysis_data = processor._run_heuristic_analysis(track_mock, lyrics_text)
                    
                # Cache it
                cache.set_track_lyric_analysis(track_id, analysis_data)
                
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
    token: str = Depends(get_spotify_token)
):
    """
    Runs batch lyrics sentiment analysis for the entire playlist and caches results.
    """
    try:
        # Fetch tracks from Spotify
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

        # Retrieve audio features
        from app.services.reccobeats import get_tracks_audio_features
        track_ids = [t["id"] for t in tracks if t.get("id")]
        try:
            features_map = get_tracks_audio_features(track_ids)
        except Exception as e:
            logger.error(f"Failed to fetch audio features: {str(e)}")
            features_map = {}

        # Build artist genres details map
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

        tracks_df = pd.DataFrame(tracks)
        
        # Build features list
        features_list = []
        for tid in track_ids:
            feat = features_map.get(tid, {
                "id": tid,
                "tempo": 120.0,
                "energy": 0.5,
                "valence": 0.5,
                "acousticness": 0.5,
                "danceability": 0.5,
                "instrumentalness": 0.0,
                "speechiness": 0.05,
                "liveness": 0.1,
                "mode": 1,
                "key": 0
            })
            features_list.append(feat)
        features_df = pd.DataFrame(features_list)
        features_df.set_index("id", inplace=True)

        # Pre-process tracks into structure required by LyricSentimentProcessor
        processed_tracks = []
        for idx, row in tracks_df.iterrows():
            track_id = row["id"]
            artist_list = row.get("artists", [])
            artists_str = ", ".join([a.get("name", "") for a in artist_list])
            track_features = features_df.loc[track_id].to_dict() if track_id in features_df.index else {}
            
            # Genres
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
            "artist_genres": genres_map
        }

        from app.analysis.processors.lyric_sentiment import LyricSentimentProcessor
        processor = LyricSentimentProcessor()
        result = processor.process(tracks_df, features_df, context)
        
        # return the lyrics_analysis part of the result payload
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
