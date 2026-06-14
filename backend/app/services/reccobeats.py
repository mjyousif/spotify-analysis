import requests
import logging
from typing import List, Dict, Any
from app.config import settings
from app.services.cache import cache

logger = logging.getLogger("uvicorn.error")

REC_BEATS_API_URL = "https://api.reccobeats.com/v1"

def get_tracks_audio_features(track_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetches audio features for a list of track IDs from ReccoBeats (checking local cache first).
    Returns a dictionary mapping track_id -> audio_feature_dict.
    """
    if not track_ids:
        return {}

    # 1. Fetch from cache first
    features_map = cache.get_track_features(track_ids)
    
    # 2. Identify missing track IDs
    missing_ids = [tid for tid in track_ids if tid not in features_map]
    
    if not missing_ids:
        logger.info(f"All {len(track_ids)} audio features retrieved from cache.")
        return features_map

    logger.info(f"Cache hit for {len(features_map)} tracks. Fetching remaining {len(missing_ids)} tracks from ReccoBeats...")

    headers = {"Accept": "application/json"}
    # Only send API key headers if the key is configured and is not a placeholder
    api_key = settings.reccobeats_api_key.strip() if settings.reccobeats_api_key else ""
    if api_key and not api_key.startswith("your_") and api_key.lower() not in ("placeholder", "none", "null", "false"):
        headers["Authorization"] = f"Bearer {api_key}"
        headers["x-api-key"] = api_key
        
    new_features = {}
    batch_size = 40
    for i in range(0, len(missing_ids), batch_size):
        batch = missing_ids[i:i + batch_size]
        ids_str = ",".join(batch)
        
        try:
            url = f"{REC_BEATS_API_URL}/audio-features?ids={ids_str}"
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                items = []
                if isinstance(data, list):
                    items = data
                elif isinstance(data, dict):
                    # Check 'content' key (primary ReccoBeats format) as well as fallbacks
                    items = data.get("content", []) or data.get("audio_features", []) or data.get("data", []) or []
                
                for item in items:
                    if not item:
                        continue
                    
                    # 1. Map by the primary ID returned
                    tid = item.get("id") or item.get("track_id")
                    if tid:
                        new_features[tid] = item
                        
                    # 2. Map by Spotify ID parsed from the href link (e.g. open.spotify.com/track/...)
                    href = item.get("href") or ""
                    if "spotify.com/track/" in href:
                        sp_id = href.split("spotify.com/track/")[-1].split("?")[0].strip()
                        if sp_id:
                            new_features[sp_id] = item
                            
                    # 3. Map by ISRC code
                    isrc_code = item.get("isrc")
                    if isrc_code:
                        new_features[isrc_code] = item
                
                # Check for tracks that weren't returned by the API
                unreturned = [tid for tid in batch if tid not in new_features]
                if unreturned:
                    logger.warning(f"ReccoBeats API did not return features for {len(unreturned)} tracks: {unreturned}")
            else:
                logger.warning(f"ReccoBeats API returned status {response.status_code} for batch: {batch}")
                
        except Exception as e:
            logger.error(f"Failed to fetch audio features from ReccoBeats: {str(e)} for batch: {batch}")

    # 3. Store newly fetched features in the cache
    if new_features:
        cache.set_track_features(new_features)

    # 4. Merge results
    features_map.update(new_features)
    return features_map
