import pytest
from unittest.mock import patch, MagicMock
from app.services.lyrics import fetch_lyrics

@pytest.fixture
def mock_cache():
    with patch("app.services.lyrics.cache") as mocked:
        yield mocked

def test_fetch_lyrics_cache_hit(mock_cache):
    cached_val = {"lyrics": "some lyrics", "instrumental": False, "synced_lyrics": None}
    mock_cache.get_track_lyrics.return_value = cached_val
    
    with patch("requests.get") as mock_get:
        res = fetch_lyrics("track123", "Song Name", "Artist Name")
        
        assert res == cached_val
        mock_cache.get_track_lyrics.assert_called_once_with("track123")
        mock_get.assert_not_called()
        mock_cache.set_track_lyrics.assert_not_called()

def test_fetch_lyrics_direct_match(mock_cache):
    mock_cache.get_track_lyrics.return_value = None
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "plainLyrics": "direct lyrics",
        "instrumental": False,
        "syncedLyrics": "[00:05.00] direct lyrics"
    }
    
    with patch("requests.get") as mock_get:
        mock_get.return_value = mock_response
        
        res = fetch_lyrics("track123", "Song Name", "Artist Name", "Album Name", 180000)
        
        assert res["lyrics"] == "direct lyrics"
        assert res["instrumental"] is False
        assert res["synced_lyrics"] == "[00:05.00] direct lyrics"
        
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        assert args[0] == "https://lrclib.net/api/get"
        assert kwargs["params"]["artist_name"] == "Artist Name"
        assert kwargs["params"]["track_name"] == "Song Name"
        assert kwargs["params"]["album_name"] == "Album Name"
        assert kwargs["params"]["duration"] == 180
        
        mock_cache.set_track_lyrics.assert_called_once_with(
            "track123", "direct lyrics", False, "[00:05.00] direct lyrics"
        )

def test_fetch_lyrics_search_fallback(mock_cache):
    mock_cache.get_track_lyrics.return_value = None
    
    mock_get_response = MagicMock()
    mock_get_response.status_code = 404
    
    mock_search_response = MagicMock()
    mock_search_response.status_code = 200
    mock_search_response.json.return_value = [
        {"plainLyrics": "", "instrumental": True},
        {"plainLyrics": "search lyrics", "instrumental": False}
    ]
    
    with patch("requests.get") as mock_get:
        mock_get.side_effect = [mock_get_response, mock_search_response]
        
        res = fetch_lyrics("track123", "Song Name", "Artist Name", "Album Name", 180000)
        
        assert res["lyrics"] == ""
        assert res["instrumental"] is True
        assert res["synced_lyrics"] is None
        
        assert mock_get.call_count == 2
        calls = mock_get.call_args_list
        assert calls[0][0][0] == "https://lrclib.net/api/get"
        assert calls[1][0][0] == "https://lrclib.net/api/search"
        assert calls[1][1]["params"]["q"] == "Artist Name Song Name"
        
        mock_cache.set_track_lyrics.assert_called_once_with(
            "track123", "", True, None
        )

def test_fetch_lyrics_offline_graceful_degradation(mock_cache):
    mock_cache.get_track_lyrics.return_value = None
    
    with patch("requests.get", side_effect=Exception("Connection timed out")) as mock_get:
        res = fetch_lyrics("track123", "Song Name", "Artist Name")
        
        assert res["lyrics"] == ""
        assert res["instrumental"] is False
        assert res["synced_lyrics"] is None
        
        mock_cache.set_track_lyrics.assert_called_once_with(
            "track123", "", False, None
        )
