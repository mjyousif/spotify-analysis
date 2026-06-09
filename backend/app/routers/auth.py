import logging
import base64
import urllib.parse
import requests
from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from app.config import settings

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Auth dependency
def get_spotify_token(authorization: str = Header(..., description="Spotify OAuth Access Token")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, 
            detail="Authorization header must start with 'Bearer '"
        )
    return authorization.split(" ")[1]

class TokenExchangeRequest(BaseModel):
    code: str

class TokenRefreshRequest(BaseModel):
    refresh_token: str

@router.get("/login-url")
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


@router.post("/token")
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


@router.post("/refresh")
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
