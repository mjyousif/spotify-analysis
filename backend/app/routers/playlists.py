import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.routers.auth import get_spotify_token
from app.services.spotify import (
    get_user_playlists, 
    get_current_user_id, 
    create_playlist, 
    add_tracks_to_playlist,
    search_public_playlists,
    get_playlist_details,
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

def extract_playlist_id(query: str) -> Optional[str]:
    """Extracts base62 playlist ID from a Spotify URL, URI, or raw ID."""
    # Check if Spotify URL
    url_match = re.search(r"open\.spotify\.com/playlist/([a-zA-Z0-9]{22})", query)
    if url_match:
        return url_match.group(1)
    # Check if URI
    uri_match = re.search(r"spotify:playlist:([a-zA-Z0-9]{22})", query)
    if uri_match:
        return uri_match.group(1)
    # Check if it's just the 22-character base62 ID itself
    id_match = re.match(r"^[a-zA-Z0-9]{22}$", query.strip())
    if id_match:
        return query.strip()
    return None

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

@router.get("/api/playlists/search")
def search_playlists(
    q: str, 
    offset: int = Query(0, description="Offset for pagination", ge=0),
    token: str = Depends(get_spotify_token)
):
    """
    Searches for public playlists using the Spotify Search API.
    If the query looks like a playlist ID, URL, or URI, it tries to fetch that specific playlist.
    """
    try:
        query_stripped = q.strip()
        if not query_stripped:
            return {
                "playlists": [],
                "total": 0,
                "limit": 20,
                "offset": 0,
                "has_more": False
            }

        playlist_id = extract_playlist_id(query_stripped)
        
        if playlist_id:
            try:
                playlist = get_playlist_details(token, playlist_id)
                if playlist:
                    return {
                        "playlists": [playlist],
                        "total": 1,
                        "limit": 20,
                        "offset": 0,
                        "has_more": False
                    }
                else:
                    return {
                        "playlists": [],
                        "total": 0,
                        "limit": 20,
                        "offset": 0,
                        "has_more": False
                    }
            except Exception as e:
                # If specific lookup fails, log it and fall back to keyword search
                logger.warning(f"Failed to fetch specific playlist {playlist_id}: {str(e)}")
                
        # Default to keyword search
        data = search_public_playlists(token, query_stripped, offset)
        items = data.get("items", [])
        filtered_items = [r for r in items if r is not None]
        
        return {
            "playlists": filtered_items,
            "total": data.get("total", 0),
            "limit": data.get("limit", 20),
            "offset": data.get("offset", 0),
            "has_more": data.get("next") is not None
        }
    except SpotifyAPIError as e:
        logger.error(f"Spotify API error during search: {e.message}")
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error searching playlists: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to search Spotify playlists: {str(e)}"
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
