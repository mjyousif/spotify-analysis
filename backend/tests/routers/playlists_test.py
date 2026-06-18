import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.routers.playlists import router, extract_playlist_id
from app.services.spotify import SpotifyAPIError

app = FastAPI()
app.include_router(router)

client = TestClient(app)

def test_extract_playlist_id():
    # URL extraction
    assert extract_playlist_id("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo37123") == "37i9dQZF1DXcBWIGo37123"
    # URI extraction
    assert extract_playlist_id("spotify:playlist:37i9dQZF1DXcBWIGo37123") == "37i9dQZF1DXcBWIGo37123"
    # Raw ID
    assert extract_playlist_id("37i9dQZF1DXcBWIGo37123") == "37i9dQZF1DXcBWIGo37123"
    # Invalid queries
    assert extract_playlist_id("too-short") is None
    assert extract_playlist_id("invalid characters!!!1234567") is None

@patch("app.routers.playlists.get_user_playlists")
def test_list_playlists_success(mock_get_playlists):
    mock_get_playlists.return_value = [{"id": "pl1", "name": "Vibe List"}]
    
    response = client.get("/api/playlists", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    assert response.json() == {"playlists": [{"id": "pl1", "name": "Vibe List"}]}

@patch("app.routers.playlists.get_user_playlists")
def test_list_playlists_spotify_error(mock_get_playlists):
    mock_get_playlists.side_effect = SpotifyAPIError(status_code=403, message="Not allowed")
    
    response = client.get("/api/playlists", headers={"Authorization": "Bearer token"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Not allowed"

@patch("app.routers.playlists.get_user_playlists")
def test_list_playlists_exception(mock_get_playlists):
    mock_get_playlists.side_effect = Exception("System error")
    
    response = client.get("/api/playlists", headers={"Authorization": "Bearer token"})
    assert response.status_code == 500
    assert "Failed to fetch Spotify playlists" in response.json()["detail"]

@patch("app.routers.playlists.search_public_playlists")
@patch("app.routers.playlists.get_playlist_details")
def test_search_playlists_empty(mock_details, mock_search):
    response = client.get("/api/playlists/search?q=   ", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    assert response.json()["playlists"] == []
    mock_details.assert_not_called()
    mock_search.assert_not_called()

@patch("app.routers.playlists.get_playlist_details")
def test_search_playlists_by_id_success(mock_details):
    playlist_mock = {"id": "37i9dQZF1DXcBWIGo37123", "name": "Chill Vibe"}
    mock_details.return_value = playlist_mock
    
    response = client.get("/api/playlists/search?q=37i9dQZF1DXcBWIGo37123", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["playlists"] == [playlist_mock]
    assert res_data["total"] == 1
    mock_details.assert_called_once_with("token", "37i9dQZF1DXcBWIGo37123")

@patch("app.routers.playlists.search_public_playlists")
@patch("app.routers.playlists.get_playlist_details")
def test_search_playlists_by_id_not_found_fallback(mock_details, mock_search):
    mock_details.side_effect = Exception("Not found")
    mock_search.return_value = {"items": [{"id": "fallback_pl"}], "total": 1}
    
    response = client.get("/api/playlists/search?q=37i9dQZF1DXcBWIGo37123", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["playlists"] == [{"id": "fallback_pl"}]
    mock_search.assert_called_once()

@patch("app.routers.playlists.search_public_playlists")
def test_search_playlists_by_query_success(mock_search):
    mock_search.return_value = {
        "items": [{"id": "p1"}, None],
        "total": 1,
        "limit": 20,
        "offset": 0,
        "next": "http://next"
    }
    
    response = client.get("/api/playlists/search?q=rock", headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["playlists"] == [{"id": "p1"}]
    assert res_data["has_more"] is True
    mock_search.assert_called_once_with("token", "rock", 0)

@patch("app.routers.playlists.search_public_playlists")
def test_search_playlists_spotify_error(mock_search):
    mock_search.side_effect = SpotifyAPIError(400, "Bad Request")
    
    response = client.get("/api/playlists/search?q=pop", headers={"Authorization": "Bearer token"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Bad Request"

@patch("app.routers.playlists.search_public_playlists")
def test_search_playlists_exception(mock_search):
    mock_search.side_effect = Exception("Network timeout")
    
    response = client.get("/api/playlists/search?q=pop", headers={"Authorization": "Bearer token"})
    assert response.status_code == 500
    assert "Failed to search Spotify playlists" in response.json()["detail"]

@patch("app.routers.playlists.add_tracks_to_playlist")
@patch("app.routers.playlists.create_playlist")
@patch("app.routers.playlists.get_current_user_id")
def test_create_split_playlists_success(mock_user_id, mock_create, mock_add):
    mock_user_id.return_value = "user_abc"
    mock_create.side_effect = ["new_pl_1", "new_pl_2"]
    
    payload = {
        "splits": [
            {"playlist_name": "Split A", "description": "desc A", "track_uris": ["uri1", "uri2"]},
            {"playlist_name": "Split B", "description": "desc B", "track_uris": []},  # skipped because empty
            {"playlist_name": "Split C", "description": "desc C", "track_uris": ["uri3"]}
        ]
    }
    
    response = client.post("/api/playlist/create-split", json=payload, headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert len(res_data["created_playlists"]) == 2
    assert res_data["created_playlists"][0]["playlist_id"] == "new_pl_1"
    assert res_data["created_playlists"][1]["playlist_id"] == "new_pl_2"
    assert mock_create.call_count == 2
    assert mock_add.call_count == 2

@patch("app.routers.playlists.get_current_user_id")
def test_create_split_playlists_spotify_error(mock_user_id):
    mock_user_id.side_effect = SpotifyAPIError(403, "Forbidden")
    
    payload = {"splits": [{"playlist_name": "Split A", "description": "desc", "track_uris": ["uri"]}]}
    response = client.post("/api/playlist/create-split", json=payload, headers={"Authorization": "Bearer token"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"

@patch("app.routers.playlists.get_current_user_id")
def test_create_split_playlists_exception(mock_user_id):
    mock_user_id.side_effect = Exception("Database write error")
    
    payload = {"splits": [{"playlist_name": "Split A", "description": "desc", "track_uris": ["uri"]}]}
    response = client.post("/api/playlist/create-split", json=payload, headers={"Authorization": "Bearer token"})
    assert response.status_code == 500
    assert "Failed to create split playlists on Spotify" in response.json()["detail"]
