import logging
import os
import urllib.parse
import requests
import base64
from fastapi import FastAPI, Depends, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

from app.config import settings
from app.services.spotify import (
    get_user_playlists, 
    get_playlist_tracks, 
    get_current_user_id, 
    create_playlist, 
    add_tracks_to_playlist,
    SpotifyAPIError
)
from app.analysis.pipeline import create_default_pipeline

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="Spotify Playlist Vibe Analyzer API",
    description="Backend service for analyzing and splitting Spotify playlists based on audio features.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth dependency
def get_spotify_token(authorization: str = Header(..., description="Spotify OAuth Access Token")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, 
            detail="Authorization header must start with 'Bearer '"
        )
    return authorization.split(" ")[1]

# Pydantic models for split creation requests
class SplitPlaylistRequest(BaseModel):
    playlist_name: str
    description: str
    track_uris: List[str]

class CreateSplitsRequest(BaseModel):
    splits: List[SplitPlaylistRequest]

class TokenExchangeRequest(BaseModel):
    code: str

class TokenRefreshRequest(BaseModel):
    refresh_token: str

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "spotify-vibe-analyzer"}

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

@app.get("/api/config/llm")
def get_llm_config():
    """
    Returns the current configuration status of the LLM module.
    """
    provider = settings.llm_provider.lower().strip() if settings.llm_provider else ""
    model_override = settings.llm_model.strip() if settings.llm_model else ""
    
    # Check if a provider is configured and valid
    has_llm_key = False
    actual_model = ""
    api_base = ""

    if provider:
        if provider == "lm_studio":
            has_llm_key = True
            api_base = settings.lm_studio_api_base
            actual_model = f"lm_studio/{model_override}" if model_override else "lm_studio/local-model"
        elif provider == "ollama":
            has_llm_key = True
            api_base = settings.ollama_api_base
            actual_model = f"ollama/{model_override}" if model_override else "ollama/llama3"
        elif provider == "gemini":
            key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
            has_llm_key = is_valid_key(key)
            actual_model = f"gemini/{model_override}" if model_override else "gemini/gemini-1.5-flash"
        elif provider == "openai":
            key = settings.openai_api_key or os.environ.get("OPENAI_API_KEY", "")
            has_llm_key = is_valid_key(key)
            actual_model = model_override if model_override else "gpt-4o-mini"
        elif provider == "anthropic":
            key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")
            has_llm_key = is_valid_key(key)
            actual_model = f"anthropic/{model_override}" if model_override else "anthropic/claude-3-haiku-20240307"
    else:
        # Auto-detect
        gemini_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        openai_key = settings.openai_api_key or os.environ.get("OPENAI_API_KEY", "")
        anthropic_key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")

        if is_valid_key(gemini_key):
            provider = "gemini"
            actual_model = "gemini/gemini-1.5-flash"
            has_llm_key = True
        elif is_valid_key(openai_key):
            provider = "openai"
            actual_model = "gpt-4o-mini"
            has_llm_key = True
        elif is_valid_key(anthropic_key):
            provider = "anthropic"
            actual_model = "anthropic/claude-3-haiku-20240307"
            has_llm_key = True
        else:
            provider = "none"
            actual_model = "none"
            has_llm_key = False

    return {
        "llm_active": has_llm_key,
        "llm_provider": provider or "none",
        "llm_model": actual_model or "none",
        "api_base": api_base or None
    }


@app.get("/api/auth/login-url")
def get_login_url():
    """
    Generates the Spotify authorization URL.
    """
    if not settings.spotify_client_id:
        raise HTTPException(
            status_code=500,
            detail="Spotify Client ID is not configured on the backend."
        )
    
    scopes = "playlist-read-private playlist-modify-private"
    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": settings.spotify_redirect_uri,
        "scope": scopes,
    }
    url = f"https://accounts.spotify.com/authorize?{urllib.parse.urlencode(params)}"
    return {"url": url}


@app.post("/api/auth/token")
def exchange_token(payload: TokenExchangeRequest):
    """
    Exchanges authorization code for Spotify access & refresh tokens.
    """
    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Spotify Client ID or Client Secret is not configured on the backend."
        )

    auth_str = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_b64}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    data = {
        "grant_type": "authorization_code",
        "code": payload.code,
        "redirect_uri": settings.spotify_redirect_uri
    }
    
    try:
        response = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data)
        if not response.ok:
            logger.error(f"Spotify token exchange failed: {response.text}")
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Spotify token exchange failed: {response.text}"
            )
        return response.json()
    except Exception as e:
        logger.error(f"Error exchanging token: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to exchange token: {str(e)}")


@app.post("/api/auth/refresh")
def refresh_token(payload: TokenRefreshRequest):
    """
    Refreshes a Spotify access token using a refresh token.
    """
    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Spotify Client ID or Client Secret is not configured on the backend."
        )

    auth_str = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_b64}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    data = {
        "grant_type": "refresh_token",
        "refresh_token": payload.refresh_token
    }
    
    try:
        response = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data)
        if not response.ok:
            logger.error(f"Spotify token refresh failed: {response.text}")
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Spotify token refresh failed: {response.text}"
            )
        return response.json()
    except Exception as e:
        logger.error(f"Error refreshing token: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to refresh token: {str(e)}")


@app.get("/api/playlists")
def list_playlists(token: str = Depends(get_spotify_token)):
    """Fetches all playlists owned or followed by the authenticated user."""
    try:
        playlists = get_user_playlists(token)
        return {"playlists": playlists}
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error: {e.message}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error fetching playlists: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch Spotify playlists: {str(e)}"
        )

@app.get("/api/analysis/playlist/{playlist_id}")
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

@app.post("/api/playlist/create-split")
def create_split_playlists(
    payload: CreateSplitsRequest,
    token: str = Depends(get_spotify_token)
):
    """
    Creates multiple new playlists on the user's Spotify profile 
    and adds the corresponding tracks to them.
    """
    try:
        # 1. Get the current user's profile ID
        user_id = get_current_user_id(token)
        
        created_playlists = []
        # 2. Process each split playlist
        for split in payload.splits:
            if not split.track_uris:
                continue
                
            # Create the playlist
            playlist_id = create_playlist(
                access_token=token,
                user_id=user_id,
                name=split.playlist_name,
                description=split.description
            )
            
            # Add tracks in batches of 100
            add_tracks_to_playlist(token, playlist_id, split.track_uris)
            
            created_playlists.append({
                "playlist_id": playlist_id,
                "name": split.playlist_name,
                "track_count": len(split.track_uris)
            })
            
        return {
            "status": "success",
            "message": f"Successfully created {len(created_playlists)} playlists.",
            "created_playlists": created_playlists
        }
        
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error during split creation: {e.message}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error creating split playlists: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create split playlists on Spotify: {str(e)}"
        )


@app.get("/api/analysis/track/{track_id}/lyrics")
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
            
            if is_instrumental or not lyrics_text.strip():
                analysis_data = {
                    "mood": "instrumental",
                    "sentiment_score": 0.0,
                    "key_themes": ["instrumental"],
                    "prominent_words": [],
                    "summary": "This track is instrumental, carrying mood through sound and rhythm rather than lyrics."
                }
            else:
                # Check if LLM is active
                from app.analysis.processors.vibe_splitters import resolve_llm_config
                provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
                
                try:
                    import litellm
                except ImportError:
                    litellm = None
                    
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


@app.get("/api/analysis/playlist/{playlist_id}/lyrics")
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

        import pandas as pd
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

