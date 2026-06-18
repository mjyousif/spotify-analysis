import pytest
import requests
from unittest.mock import patch, MagicMock
from app.services.reccobeats import get_tracks_audio_features

@pytest.fixture
def mock_cache():
    with patch("app.services.reccobeats.cache") as mocked:
        yield mocked

@pytest.fixture
def mock_settings():
    with patch("app.services.reccobeats.settings") as mocked:
        mocked.reccobeats_api_key = "test_api_key"
        yield mocked

def test_get_tracks_audio_features_empty():
    res = get_tracks_audio_features([])
    assert res == {}

def test_get_tracks_audio_features_cache_hit(mock_cache):
    cached = {"t1": {"tempo": 120}}
    mock_cache.get_track_features.return_value = cached
    
    res = get_tracks_audio_features(["t1"])
    assert res == cached
    mock_cache.get_track_features.assert_called_once_with(["t1"])

def test_get_tracks_audio_features_cache_miss_dict_content(mock_cache, mock_settings):
    mock_cache.get_track_features.return_value = {}
    
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "content": [
            {"id": "t1", "tempo": 120, "href": "https://api.spotify.com/v1/tracks/t1"},
            {"track_id": "t2", "tempo": 100, "isrc": "US-123", "href": "https://open.spotify.com/track/t2?si=123"}
        ]
    }
    
    with patch("requests.get", return_value=mock_resp) as mock_get:
        res = get_tracks_audio_features(["t1", "t2"])
        
        # Verify call headers and params
        mock_get.assert_called_once()
        headers = mock_get.call_args[1]["headers"]
        assert headers["Authorization"] == "Bearer test_api_key"
        assert headers["x-api-key"] == "test_api_key"
        
        assert "t1" in res
        assert "t2" in res
        # Verify cache storage
        mock_cache.set_track_features.assert_called_once()

def test_get_tracks_audio_features_list_format(mock_cache, mock_settings):
    mock_cache.get_track_features.return_value = {}
    
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = [
        {"id": "t1", "tempo": 120}
    ]
    
    with patch("requests.get", return_value=mock_resp):
        res = get_tracks_audio_features(["t1"])
        assert "t1" in res

def test_get_tracks_audio_features_fallback_keys(mock_cache, mock_settings):
    mock_cache.get_track_features.return_value = {}
    
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {
        "audio_features": [
            {"id": "t1", "tempo": 120}
        ]
    }
    
    with patch("requests.get", return_value=mock_resp):
        res = get_tracks_audio_features(["t1"])
        assert "t1" in res

def test_get_tracks_audio_features_empty_api_key(mock_cache, mock_settings):
    mock_settings.reccobeats_api_key = "placeholder"
    mock_cache.get_track_features.return_value = {}
    
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = []
    
    with patch("requests.get", return_value=mock_resp) as mock_get:
        get_tracks_audio_features(["t1"])
        headers = mock_get.call_args[1]["headers"]
        assert "Authorization" not in headers
        assert "x-api-key" not in headers

def test_get_tracks_audio_features_non_200(mock_cache, mock_settings):
    mock_cache.get_track_features.return_value = {}
    mock_resp = MagicMock(status_code=500)
    
    with patch("requests.get", return_value=mock_resp):
        res = get_tracks_audio_features(["t1"])
        assert res == {}

def test_get_tracks_audio_features_exception(mock_cache, mock_settings):
    mock_cache.get_track_features.return_value = {}
    
    with patch("requests.get", side_effect=Exception("Timeout")):
        res = get_tracks_audio_features(["t1"])
        assert res == {}

def test_get_tracks_audio_features_batching(mock_cache, mock_settings):
    mock_cache.get_track_features.return_value = {}
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = []
    
    track_ids = [f"t{i}" for i in range(50)]
    
    with patch("requests.get", return_value=mock_resp) as mock_get:
        get_tracks_audio_features(track_ids)
        assert mock_get.call_count == 2
