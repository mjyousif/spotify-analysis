import logging
import requests
from typing import Optional, Dict, Any
from app.services.cache import cache

logger = logging.getLogger("uvicorn.error")

def fetch_lyrics(
    track_id: str, 
    track_name: str, 
    artist_name: str, 
    album_name: str = "", 
    duration_ms: int = 0
) -> Dict[str, Any]:
    """
    Fetches track lyrics from LRCLib, checking cache first.
    Returns a dict with {"lyrics": str, "instrumental": bool, "synced_lyrics": Optional[str]}
    """
    # 1. Check SQLite cache
    try:
        cached = cache.get_track_lyrics(track_id)
        if cached is not None:
            return cached
    except Exception as e:
        logger.error(f"Error reading track lyrics cache for {track_id}: {str(e)}")

    # 2. Query LRCLib API
    duration_sec = int(duration_ms / 1000) if duration_ms > 0 else None
    
    headers = {
        "User-Agent": "SpotifyVibeAnalyzer/1.0.0 (https://github.com/mjyousif/spotify-analysis)"
    }
    
    lyrics_data = None

    # Attempt 1: Precise lookup via GET /api/get if duration and album are provided
    if duration_sec and track_name and artist_name:
        try:
            params = {
                "artist_name": artist_name,
                "track_name": track_name,
                "album_name": album_name,
                "duration": duration_sec
            }
            # Remove empty fields
            params = {k: v for k, v in params.items() if v}
            response = requests.get("https://lrclib.net/api/get", params=params, headers=headers, timeout=5)
            if response.status_code == 200:
                lyrics_data = response.json()
                logger.info(f"LRCLib direct match found for: {track_name} by {artist_name}")
        except Exception as e:
            logger.warning(f"LRCLib direct get failed for '{track_name}': {str(e)}")

    # Attempt 2: Search lookup via GET /api/search if direct matching failed
    if not lyrics_data and track_name and artist_name:
        try:
            # Construct a clean query
            query = f"{artist_name} {track_name}"
            response = requests.get("https://lrclib.net/api/search", params={"q": query}, headers=headers, timeout=5)
            if response.status_code == 200:
                results = response.json()
                if results:
                    # Find the first result with lyrics or instrumental flag
                    for res in results:
                        if res.get("plainLyrics") or res.get("instrumental"):
                            lyrics_data = res
                            logger.info(f"LRCLib search match found for: {track_name} by {artist_name}")
                            break
        except Exception as e:
            logger.warning(f"LRCLib search failed for query '{artist_name} {track_name}': {str(e)}")

    # 3. Process the response and cache it
    lyrics = ""
    instrumental = False
    synced_lyrics = None
    
    if lyrics_data:
        lyrics = lyrics_data.get("plainLyrics") or ""
        instrumental = bool(lyrics_data.get("instrumental"))
        synced_lyrics = lyrics_data.get("syncedLyrics")
    else:
        logger.info(f"Lyrics NOT found on LRCLib for: {track_name} by {artist_name}")

    # Save to cache even if empty to prevent repeated external queries
    try:
        cache.set_track_lyrics(track_id, lyrics, instrumental, synced_lyrics)
    except Exception as e:
        logger.error(f"Error caching track lyrics for {track_id}: {str(e)}")
    
    return {
        "lyrics": lyrics,
        "instrumental": instrumental,
        "synced_lyrics": synced_lyrics
    }
