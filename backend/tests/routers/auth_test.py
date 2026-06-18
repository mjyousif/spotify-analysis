import pytest
from fastapi import FastAPI, Depends, HTTPException
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.routers.auth import router, get_spotify_token

# Define a test app to test the router and dependency injection
app = FastAPI()
app.include_router(router)

@app.get("/test-token-dependency")
def dummy_token_dependency(token: str = Depends(get_spotify_token)):
    return {"token": token}

client = TestClient(app)

@pytest.fixture
def mock_settings():
    with patch("app.routers.auth.settings") as mocked:
        mocked.spotify_client_id = "client_id_123"
        mocked.spotify_client_secret = "client_secret_456"
        mocked.spotify_redirect_uri = "http://redirect"
        yield mocked

def test_get_spotify_token_dependency_success():
    response = client.get("/test-token-dependency", headers={"Authorization": "Bearer spotify_token_abc"})
    assert response.status_code == 200
    assert response.json() == {"token": "spotify_token_abc"}

def test_get_spotify_token_dependency_invalid_format():
    response = client.get("/test-token-dependency", headers={"Authorization": "Token spotify_token_abc"})
    assert response.status_code == 401
    assert "Authorization header must start with" in response.json()["detail"]

def test_get_login_url_success(mock_settings):
    response = client.get("/api/auth/login-url")
    assert response.status_code == 200
    url = response.json()["url"]
    assert "accounts.spotify.com/authorize" in url
    assert "client_id=client_id_123" in url
    assert "redirect_uri=http%3A%2F%2Fredirect" in url

def test_get_login_url_missing_config(mock_settings):
    mock_settings.spotify_client_id = ""
    response = client.get("/api/auth/login-url")
    assert response.status_code == 500
    assert "Spotify Client ID is not configured" in response.json()["detail"]

def test_exchange_token_success(mock_settings):
    mock_resp = MagicMock(status_code=200, ok=True)
    mock_resp.json.return_value = {"access_token": "acc", "refresh_token": "ref"}
    
    with patch("requests.post", return_value=mock_resp) as mock_post:
        response = client.post("/api/auth/token", json={"code": "auth_code_123"})
        assert response.status_code == 200
        assert response.json() == {"access_token": "acc", "refresh_token": "ref"}
        mock_post.assert_called_once()

def test_exchange_token_missing_config(mock_settings):
    mock_settings.spotify_client_secret = ""
    response = client.post("/api/auth/token", json={"code": "auth_code_123"})
    assert response.status_code == 500
    assert "Spotify Client ID or Client Secret" in response.json()["detail"]

def test_exchange_token_spotify_failure(mock_settings):
    mock_resp = MagicMock(status_code=400, ok=False, text="Invalid Code")
    
    with patch("requests.post", return_value=mock_resp):
        response = client.post("/api/auth/token", json={"code": "bad_code"})
        assert response.status_code == 400
        assert "Spotify token exchange failed" in response.json()["detail"]

def test_exchange_token_exception(mock_settings):
    with patch("requests.post", side_effect=Exception("Connection reset")):
        response = client.post("/api/auth/token", json={"code": "code"})
        assert response.status_code == 500
        assert "Failed to exchange token" in response.json()["detail"]

def test_refresh_token_success(mock_settings):
    mock_resp = MagicMock(status_code=200, ok=True)
    mock_resp.json.return_value = {"access_token": "new_acc"}
    
    with patch("requests.post", return_value=mock_resp):
        response = client.post("/api/auth/refresh", json={"refresh_token": "ref_123"})
        assert response.status_code == 200
        assert response.json() == {"access_token": "new_acc"}

def test_refresh_token_missing_config(mock_settings):
    mock_settings.spotify_client_id = ""
    response = client.post("/api/auth/refresh", json={"refresh_token": "ref"})
    assert response.status_code == 500
    assert "Spotify Client ID or Client Secret" in response.json()["detail"]

def test_refresh_token_spotify_failure(mock_settings):
    mock_resp = MagicMock(status_code=401, ok=False, text="Expired Token")
    
    with patch("requests.post", return_value=mock_resp):
        response = client.post("/api/auth/refresh", json={"refresh_token": "bad_ref"})
        assert response.status_code == 401
        assert "Spotify token refresh failed" in response.json()["detail"]

def test_refresh_token_exception(mock_settings):
    with patch("requests.post", side_effect=Exception("Network error")):
        response = client.post("/api/auth/refresh", json={"refresh_token": "ref"})
        assert response.status_code == 500
        assert "Failed to refresh token" in response.json()["detail"]
