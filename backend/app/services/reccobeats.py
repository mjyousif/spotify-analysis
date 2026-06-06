import requests
import logging
import random
from typing import List, Dict, Any
from app.config import settings

logger = logging.getLogger("uvicorn.error")

REC_BEATS_API_URL = "https://api.reccobeats.com/v1"

def get_tracks_audio_features(track_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetches audio features for a list of track IDs from ReccoBeats.
    Returns a dictionary mapping track_id -> audio_feature_dict.
    """
    if not track_ids:
        return {}

    features_map = {}
    headers = {"Accept": "application/json"}
    
    if settings.reccobeats_api_key:
        # Support both standard headers just in case
        headers["Authorization"] = f"Bearer {settings.reccobeats_api_key}"
        headers["x-api-key"] = settings.reccobeats_api_key
        
    batch_size = 40
    for i in range(0, len(track_ids), batch_size):
        batch = track_ids[i:i + batch_size]
        ids_str = ",".join(batch)
        
        try:
            url = f"{REC_BEATS_API_URL}/audio-features?ids={ids_str}"
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                # The response is typically a list of track feature objects
                # or a dict containing an 'audio_features' list.
                items = []
                if isinstance(data, list):
                    items = data
                elif isinstance(data, dict):
                    items = data.get("audio_features", []) or data.get("data", []) or []
                
                for item in items:
                    if item and "id" in item:
                        features_map[item["id"]] = item
                    elif item and "track_id" in item:
                        features_map[item["track_id"]] = item
            else:
                logger.warning(f"ReccoBeats API returned status {response.status_code} for batch. Activating fallback.")
                _generate_fallback_for_batch(batch, features_map)
                
        except Exception as e:
            logger.error(f"Failed to fetch audio features from ReccoBeats: {str(e)}. Activating fallback.")
            _generate_fallback_for_batch(batch, features_map)
            
    return features_map

def _generate_fallback_for_batch(batch: List[str], features_map: Dict[str, Dict[str, Any]]) -> None:
    """Generates realistic mockup audio features in case the third-party API fails."""
    for tid in batch:
        features_map[tid] = {
            "id": tid,
            "tempo": random.uniform(80.0, 160.0),
            "energy": random.uniform(0.2, 0.9),
            "valence": random.uniform(0.1, 0.95),
            "acousticness": random.uniform(0.01, 0.8),
            "danceability": random.uniform(0.3, 0.85),
            "instrumentalness": random.uniform(0.0, 0.9),
            "liveness": random.uniform(0.05, 0.4),
            "speechiness": random.uniform(0.02, 0.25),
            "loudness": random.uniform(-12.0, -3.0),
            "mode": random.choice([0, 1]),
            "key": random.randint(0, 11)
        }
