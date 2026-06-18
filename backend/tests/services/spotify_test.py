import pytest
import requests
from unittest.mock import patch, MagicMock
from app.services.spotify import (
    SpotifyAPIError,
    make_spotify_request,
    get_current_user_id,
    get_user_playlists,
    get_playlist_snapshot_id,
    get_playlist_tracks,
    get_artists_genres,
    create_playlist,
    add_tracks_to_playlist,
    search_public_playlists,
    get_playlist_details,
)

@pytest.fixture
def mock_cache():
    with patch("app.services.spotify.cache") as mocked:
        yield mocked

@pytest.fixture
def mock_sleep():
    with patch("time.sleep") as mocked:
        yield mocked

def test_make_spotify_request_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"key": "val"}
    
    with patch("requests.request", return_value=mock_resp) as mock_req:
        res = make_spotify_request("GET", "http://spotify/me", headers={"Authorization": "Bearer tok"})
        assert res == mock_resp
        mock_req.assert_called_once_with("GET", "http://spotify/me", headers={"Authorization": "Bearer tok"})

def test_make_spotify_request_rate_limited(mock_sleep):
    mock_429 = MagicMock()
    mock_429.status_code = 429
    mock_429.headers = {"Retry-After": "3"}
    
    mock_200 = MagicMock()
    mock_200.status_code = 200
    
    with patch("requests.request", side_effect=[mock_429, mock_200]) as mock_req:
        res = make_spotify_request("GET", "http://spotify/me")
        assert res == mock_200
        assert mock_req.call_count == 2
        mock_sleep.assert_called_once_with(3)

def test_make_spotify_request_rate_limited_no_header(mock_sleep):
    mock_429 = MagicMock()
    mock_429.status_code = 429
    mock_429.headers = {}
    
    mock_200 = MagicMock()
    mock_200.status_code = 200
    
    with patch("requests.request", side_effect=[mock_429, mock_200]) as mock_req:
        res = make_spotify_request("GET", "http://spotify/me")
        assert res == mock_200
        assert mock_req.call_count == 2
        mock_sleep.assert_called_once_with(1)  # backoff factor 2 ** 0

def test_make_spotify_request_transient_error(mock_sleep):
    mock_503 = MagicMock()
    mock_503.status_code = 503
    
    mock_200 = MagicMock()
    mock_200.status_code = 200
    
    with patch("requests.request", side_effect=[mock_503, mock_200]) as mock_req:
        res = make_spotify_request("GET", "http://spotify/me")
        assert res == mock_200
        assert mock_req.call_count == 2
        mock_sleep.assert_called_once_with(1)

def test_make_spotify_request_api_error():
    mock_400 = MagicMock()
    mock_400.status_code = 400
    mock_400.json.return_value = {"error": {"message": "Invalid token"}}
    
    with patch("requests.request", return_value=mock_400):
        with pytest.raises(SpotifyAPIError) as exc_info:
            make_spotify_request("GET", "http://spotify/me")
        assert exc_info.value.status_code == 400
        assert exc_info.value.message == "Invalid token"

def test_make_spotify_request_api_error_invalid_json():
    mock_400 = MagicMock()
    mock_400.status_code = 404
    mock_400.json.side_effect = ValueError("No JSON")
    
    with patch("requests.request", return_value=mock_400):
        with pytest.raises(SpotifyAPIError) as exc_info:
            make_spotify_request("GET", "http://spotify/me")
        assert exc_info.value.status_code == 404
        assert exc_info.value.message == "Unknown Spotify error"

def test_make_spotify_request_request_exception(mock_sleep):
    with patch("requests.request", side_effect=[requests.exceptions.RequestException("conn error"), MagicMock(status_code=200)]) as mock_req:
        res = make_spotify_request("GET", "http://spotify/me")
        assert res.status_code == 200
        mock_sleep.assert_called_once_with(1)

def test_make_spotify_request_request_exception_max_retries(mock_sleep):
    with patch("requests.request", side_effect=requests.exceptions.RequestException("conn error")) as mock_req:
        with pytest.raises(SpotifyAPIError) as exc_info:
            make_spotify_request("GET", "http://spotify/me")
        assert exc_info.value.status_code == 500
        assert "Request exception" in exc_info.value.message
        assert mock_sleep.call_count == 4

def test_get_current_user_id():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "user123"}
    
    with patch("requests.request", return_value=mock_resp):
        uid = get_current_user_id("token")
        assert uid == "user123"

def test_get_user_playlists():
    mock_resp_1 = MagicMock()
    mock_resp_1.status_code = 200
    mock_resp_1.json.return_value = {
        "items": [{"id": "pl1"}],
        "next": "http://next-page"
    }
    
    mock_resp_2 = MagicMock()
    mock_resp_2.status_code = 200
    mock_resp_2.json.return_value = {
        "items": [{"id": "pl2"}],
        "next": None
    }
    
    with patch("requests.request", side_effect=[mock_resp_1, mock_resp_2]):
        playlists = get_user_playlists("token")
        assert playlists == [{"id": "pl1"}, {"id": "pl2"}]

def test_get_playlist_snapshot_id_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"snapshot_id": "snap1"}
    
    with patch("requests.request", return_value=mock_resp):
        snap_id = get_playlist_snapshot_id("token", "pl1")
        assert snap_id == "snap1"

def test_get_playlist_snapshot_id_failure():
    with patch("requests.request", side_effect=Exception("Failed request")):
        snap_id = get_playlist_snapshot_id("token", "pl1")
        assert snap_id is None

def test_get_playlist_tracks_cache_hit(mock_cache):
    cached_tracks = [{"id": "tr1", "name": "Track A"}]
    mock_cache.get_playlist_tracks.return_value = cached_tracks
    
    mock_snap_resp = MagicMock(status_code=200)
    mock_snap_resp.json.return_value = {"snapshot_id": "snap1"}
    
    with patch("requests.request", return_value=mock_snap_resp):
        tracks = get_playlist_tracks("token", "pl1")
        assert tracks == cached_tracks
        mock_cache.get_playlist_tracks.assert_called_once_with("pl1", "snap1")

def test_get_playlist_tracks_cache_miss(mock_cache):
    mock_cache.get_playlist_tracks.return_value = None
    
    mock_snap_resp = MagicMock(status_code=200)
    mock_snap_resp.json.return_value = {"snapshot_id": "snap1"}
    
    mock_tracks_resp = MagicMock(status_code=200)
    mock_tracks_resp.json.return_value = {
        "items": [
            {"track": {"id": "tr1", "name": "Track A"}},
            {"track": None},  # empty track
            {"track": {"id": None, "name": "Local file"}}  # local file
        ],
        "next": None
    }
    
    with patch("requests.request", side_effect=[mock_snap_resp, mock_tracks_resp]):
        tracks = get_playlist_tracks("token", "pl1")
        assert tracks == [{"id": "tr1", "name": "Track A"}]
        mock_cache.set_playlist_tracks.assert_called_once_with(
            "pl1", "snap1", [{"id": "tr1", "name": "Track A"}]
        )

def test_get_artists_genres_cache_hit(mock_cache):
    cached_genres = {"a1": ["rock"], "a2": ["pop"]}
    mock_cache.get_artist_genres.return_value = cached_genres
    
    res = get_artists_genres("token", ["a1", "a2"])
    assert res == cached_genres
    mock_cache.get_artist_genres.assert_called_once_with(["a1", "a2"])

def test_get_artists_genres_cache_miss(mock_cache):
    mock_cache.get_artist_genres.return_value = {"a1": ["rock"]}
    
    mock_artists_resp = MagicMock(status_code=200)
    mock_artists_resp.json.return_value = {
        "artists": [
            {"id": "a2", "genres": ["jazz"]},
            None
        ]
    }
    
    with patch("requests.request", return_value=mock_artists_resp):
        res = get_artists_genres("token", ["a1", "a2", "a3"])
        assert res == {"a1": ["rock"], "a2": ["jazz"]}
        mock_cache.set_artist_genres.assert_called_once_with({"a2": ["jazz"]})

def test_get_artists_genres_empty():
    res = get_artists_genres("token", [])
    assert res == {}

def test_create_playlist():
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {"id": "new_pl1"}
    
    with patch("requests.request", return_value=mock_resp):
        pl_id = create_playlist("token", "user1", "Vibe Split", "desc")
        assert pl_id == "new_pl1"

def test_add_tracks_to_playlist():
    mock_resp = MagicMock(status_code=200)
    
    with patch("requests.request", return_value=mock_resp) as mock_req:
        add_tracks_to_playlist("token", "pl1", ["u1", "u2"])
        mock_req.assert_called_once()
        
        # Test empty URIs
        mock_req.reset_mock()
        add_tracks_to_playlist("token", "pl1", [])
        mock_req.assert_not_called()

def test_add_tracks_to_playlist_batching():
    mock_resp = MagicMock(status_code=200)
    uris = [f"uri{i}" for i in range(150)]
    
    with patch("requests.request", return_value=mock_resp) as mock_req:
        add_tracks_to_playlist("token", "pl1", uris)
        assert mock_req.call_count == 2
        calls = mock_req.call_args_list
        assert len(calls[0][1]["json"]["uris"]) == 100
        assert len(calls[1][1]["json"]["uris"]) == 50

def test_search_public_playlists():
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {"playlists": {"items": []}}
    
    with patch("requests.request", return_value=mock_resp):
        res = search_public_playlists("token", "rock", 5)
        assert res == {"items": []}

def test_get_playlist_details():
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {"id": "pl1", "name": "rock"}
    
    with patch("requests.request", return_value=mock_resp):
        res = get_playlist_details("token", "pl1")
        assert res == {"id": "pl1", "name": "rock"}
