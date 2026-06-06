import time
import logging
import requests
from typing import List, Dict, Any

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

def get_playlist_tracks(access_token: str, playlist_id: str) -> List[Dict[str, Any]]:
    headers = {"Authorization": f"Bearer {access_token}"}
    tracks = []
    url = f"{SPOTIFY_API_URL}/playlists/{playlist_id}/items?limit=100&fields=items(track(id,name,uri,duration_ms,album(images),artists(id,name))),next"
    
    while url:
        response = make_spotify_request("GET", url, headers=headers)
        data = response.json()
        # Filter out local files or empty tracks
        for item in data.get("items", []):
            if item.get("track") and item["track"].get("id"):
                tracks.append(item["track"])
        url = data.get("next")
        
    return tracks

def get_artists_genres(access_token: str, artist_ids: List[str]) -> Dict[str, List[str]]:
    """Fetches artist profiles in batches of 50 to extract their genres."""
    if not artist_ids:
        return {}
        
    headers = {"Authorization": f"Bearer {access_token}"}
    artist_genres = {}
    
    # Spotify limit is 50 artist IDs per request
    batch_size = 50
    for i in range(0, len(artist_ids), batch_size):
        batch = artist_ids[i:i + batch_size]
        ids_str = ",".join(batch)
        response = make_spotify_request("GET", f"{SPOTIFY_API_URL}/artists?ids={ids_str}", headers=headers)
        data = response.json()
        
        for artist in data.get("artists", []):
            if artist:
                artist_genres[artist["id"]] = artist.get("genres", [])
                
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
