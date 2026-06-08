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
    dim_reduction: str = Query("pca", description="Dimensionality reduction algorithm to use (pca, umap, tsne)"),
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
        result = pipeline.run(token, tracks, k, algorithm, dim_reduction)
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
