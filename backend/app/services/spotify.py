import time
import logging
import requests
from typing import List, Dict, Any, Optional
from app.services.cache import cache

SPOTIFY_API_URL = "https://api.spotify.com/v1"

logger = logging.getLogger("uvicorn.error")

class SpotifyAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Spotify API Error {status_code}: {message}")

def make_spotify_request(method: str, url: str, **kwargs) -> requests.Response:
    max_retries = 5
    backoff_factor = 2
    
    for attempt in range(max_retries):
        try:
            response = requests.request(method, url, **kwargs)
            
            if response.status_code == 429:
                retry_after_str = response.headers.get("Retry-After")
                if retry_after_str:
                    try:
                        sleep_time = int(retry_after_str)
                    except ValueError:
                        sleep_time = backoff_factor ** attempt
                else:
                    sleep_time = backoff_factor ** attempt
                
                logger.warning(f"Rate limited (429) on {url}. Retrying after {sleep_time} seconds (attempt {attempt + 1}/{max_retries})...")
                time.sleep(sleep_time)
                continue
                
            # If we get a transient server error, wait and retry
            if response.status_code in [500, 502, 503, 504] and attempt < max_retries - 1:
                sleep_time = backoff_factor ** attempt
                logger.warning(f"Transient error ({response.status_code}) on {url}. Retrying after {sleep_time} seconds (attempt {attempt + 1}/{max_retries})...")
                time.sleep(sleep_time)
                continue

            if response.status_code >= 400:
                error_msg = "Unknown Spotify error"
                try:
                    error_data = response.json()
                    if "error" in error_data:
                        error_msg = error_data["error"].get("message", error_msg)
                except Exception:
                    pass
                raise SpotifyAPIError(response.status_code, error_msg)

            return response
            
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise SpotifyAPIError(500, f"Request exception: {str(e)}")
            sleep_time = backoff_factor ** attempt
            logger.warning(f"Request exception on {url}: {str(e)}. Retrying after {sleep_time} seconds (attempt {attempt + 1}/{max_retries})...")
            time.sleep(sleep_time)
            
    raise SpotifyAPIError(500, "Max retries reached without response")

def get_current_user_id(access_token: str) -> str:
    headers = {"Authorization": f"Bearer {access_token}"}
    response = make_spotify_request("GET", f"{SPOTIFY_API_URL}/me", headers=headers)
    return response.json()["id"]

def get_user_playlists(access_token: str) -> List[Dict[str, Any]]:
    headers = {"Authorization": f"Bearer {access_token}"}
    playlists = []
    url = f"{SPOTIFY_API_URL}/me/playlists?limit=50"
    
    while url:
        response = make_spotify_request("GET", url, headers=headers)
        data = response.json()
        playlists.extend(data["items"])
        url = data.get("next")
        
    return playlists

def get_playlist_snapshot_id(access_token: str, playlist_id: str) -> Optional[str]:
    """Fetches the current snapshot_id of a playlist from Spotify."""
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        response = make_spotify_request(
            "GET", 
            f"{SPOTIFY_API_URL}/playlists/{playlist_id}?fields=snapshot_id", 
            headers=headers
        )
        return response.json().get("snapshot_id")
    except Exception as e:
        logger.error(f"Failed to fetch snapshot ID for playlist {playlist_id}: {str(e)}")
        return None

def get_playlist_tracks(access_token: str, playlist_id: str) -> List[Dict[str, Any]]:
    # Try fetching the current snapshot ID from Spotify
    snapshot_id = get_playlist_snapshot_id(access_token, playlist_id)
    
    # If snapshot_id was successfully retrieved, check cache
    if snapshot_id:
        cached_tracks = cache.get_playlist_tracks(playlist_id, snapshot_id)
        if cached_tracks is not None:
            logger.info(f"Cache hit for playlist {playlist_id} tracks (snapshot: {snapshot_id})")
            return cached_tracks
            
    # Cache miss (or we couldn't get snapshot_id): fetch from API
    logger.info(f"Cache miss for playlist {playlist_id} tracks. Fetching from Spotify API...")
    headers = {"Authorization": f"Bearer {access_token}"}
    tracks = []
    url = f"{SPOTIFY_API_URL}/playlists/{playlist_id}/items?limit=100&fields=items(track(id,name,uri,duration_ms,popularity,album(name,images,release_date),artists(id,name))),next"
    
    while url:
        response = make_spotify_request("GET", url, headers=headers)
        data = response.json()
        # Filter out local files or empty tracks
        for item in data.get("items", []):
            if item.get("track") and item["track"].get("id"):
                tracks.append(item["track"])
        url = data.get("next")
        
    # Store in cache if we have a snapshot ID
    if snapshot_id and tracks:
        cache.set_playlist_tracks(playlist_id, snapshot_id, tracks)
        
    return tracks

def get_artists_genres(access_token: str, artist_ids: List[str]) -> Dict[str, List[str]]:
    """Fetches artist profiles in batches of 50 to extract their genres (checking local cache first)."""
    if not artist_ids:
        return {}
        
    # 1. Check cache first
    artist_genres = cache.get_artist_genres(artist_ids)
    
    # 2. Identify missing artist IDs
    missing_ids = [aid for aid in artist_ids if aid not in artist_genres]
    
    if not missing_ids:
        logger.info(f"All {len(artist_ids)} artist genres retrieved from cache.")
        return artist_genres
        
    logger.info(f"Cache hit for {len(artist_genres)} artists. Fetching remaining {len(missing_ids)} from Spotify API...")
    
    headers = {"Authorization": f"Bearer {access_token}"}
    new_genres = {}
    
    # Spotify limit is 50 artist IDs per request
    batch_size = 50
    for i in range(0, len(missing_ids), batch_size):
        batch = missing_ids[i:i + batch_size]
        ids_str = ",".join(batch)
        response = make_spotify_request("GET", f"{SPOTIFY_API_URL}/artists?ids={ids_str}", headers=headers)
        data = response.json()
        
        for artist in data.get("artists", []):
            if artist:
                new_genres[artist["id"]] = artist.get("genres", [])
                
    # 3. Store newly fetched artist genres in cache
    if new_genres:
        cache.set_artist_genres(new_genres)
        
    # 4. Merge results
    artist_genres.update(new_genres)
    return artist_genres


def create_playlist(access_token: str, user_id: str, name: str, description: str) -> str:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "name": name,
        "description": description,
        "public": False
    }
    response = make_spotify_request(
        "POST",
        f"{SPOTIFY_API_URL}/users/{user_id}/playlists",
        headers=headers,
        json=payload
    )
    return response.json()["id"]

def add_tracks_to_playlist(access_token: str, playlist_id: str, track_uris: List[str]) -> None:
    """Adds track URIs to a Spotify playlist in batches of 100."""
    if not track_uris:
        return
        
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Spotify limit is 100 URIs per request
    batch_size = 100
    for i in range(0, len(track_uris), batch_size):
        batch = track_uris[i:i + batch_size]
        payload = {"uris": batch}
        make_spotify_request(
            "POST",
            f"{SPOTIFY_API_URL}/playlists/{playlist_id}/items",
            headers=headers,
            json=payload
        )
