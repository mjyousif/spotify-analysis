import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from app.routers.auth import get_spotify_token
from app.services.spotify import (
    get_user_playlists, 
    get_current_user_id, 
    create_playlist, 
    add_tracks_to_playlist,
    SpotifyAPIError
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Playlists"])

class SplitPlaylistRequest(BaseModel):
    playlist_name: str
    description: str
    track_uris: List[str]

class CreateSplitsRequest(BaseModel):
    splits: List[SplitPlaylistRequest]

@router.get("/api/playlists")
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


@router.post("/api/playlist/create-split")
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
