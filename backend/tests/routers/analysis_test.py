import pytest
import queue
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.routers.analysis import router
from app.services.spotify import SpotifyAPIError
from app.analysis.processors.vibe_splitters.llm import LlmSplitterError

app = FastAPI()
app.include_router(router)
client = TestClient(app)

@pytest.fixture
def mock_token_header():
    return {"Authorization": "Bearer spotify_token_xyz"}

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_clustering_pipeline")
def test_stream_analyze_playlist_success(mock_create_pipeline, mock_tracks, mock_token_header):
    # Setup track list mock
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1", "artists": [{"name": "A1"}]}]
    
    # Mock pipeline and its run method
    mock_pipeline = MagicMock()
    def mock_run(token, tracks, k, algorithm, **kwargs):
        # Trigger progress callback to cover _run_pipeline_streaming progress callbacks
        progress_cb = kwargs.get("progress_callback")
        if progress_cb:
            progress_cb({"stage": "clustering", "message": "running kmeans", "step": 2, "total_steps": 6})
        return {"tracks": [{"id": "t1", "cluster": 0}], "clusters": [{"cluster_id": 0}], "recommendations": []}
        
    mock_pipeline.run.side_effect = mock_run
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/stream?k=2&include_llm=false", headers=mock_token_header)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    
    # Parse SSE stream response
    content = response.text
    assert "data: " in content
    assert "initializing" in content
    assert "clustering" in content
    assert "complete" in content

@patch("app.routers.analysis.get_playlist_tracks")
def test_stream_analyze_playlist_empty(mock_tracks, mock_token_header):
    mock_tracks.return_value = []
    
    response = client.get("/api/analysis/playlist/pl_123/stream", headers=mock_token_header)
    assert response.status_code == 200
    assert "complete" in response.text
    assert "Playlist is empty" in response.text

@patch("app.routers.analysis.get_playlist_tracks")
def test_stream_analyze_playlist_tracks_error(mock_tracks, mock_token_header):
    mock_tracks.side_effect = SpotifyAPIError(404, "Playlist not found")
    response = client.get("/api/analysis/playlist/pl_123/stream", headers=mock_token_header)
    assert response.status_code == 404
    assert response.json()["detail"] == "Playlist not found"

@patch("app.routers.analysis.get_playlist_tracks")
def test_stream_analyze_playlist_tracks_generic_exception(mock_tracks, mock_token_header):
    mock_tracks.side_effect = Exception("General error")
    response = client.get("/api/analysis/playlist/pl_123/stream", headers=mock_token_header)
    assert response.status_code == 500
    assert "Failed to fetch tracks" in response.json()["detail"]

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_stream_analyze_playlist_llm_splitter_error(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = LlmSplitterError("LLM failed")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/stream?include_llm=true", headers=mock_token_header)
    assert response.status_code == 200
    assert "llm_splitter_error" in response.text

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_stream_analyze_playlist_spotify_api_error_in_thread(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = SpotifyAPIError(status_code=403, message="Spotify error in thread")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/stream?include_llm=true", headers=mock_token_header)
    assert response.status_code == 200
    assert "spotify_error" in response.text
    assert "Spotify error in thread" in response.text

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_stream_analyze_playlist_exception_in_thread(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = Exception("Generic pipeline error")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/stream?include_llm=true", headers=mock_token_header)
    assert response.status_code == 200
    assert "pipeline_error" in response.text

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_clustering_pipeline")
def test_analyze_playlist_sync_success(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.return_value = {"tracks": [], "clusters": []}
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123?include_llm=false", headers=mock_token_header)
    assert response.status_code == 200
    res = response.json()
    assert "tracks" in res
    assert "recommendations" in res

@patch("app.routers.analysis.get_playlist_tracks")
def test_analyze_playlist_sync_empty(mock_tracks, mock_token_header):
    mock_tracks.return_value = []
    response = client.get("/api/analysis/playlist/pl_123", headers=mock_token_header)
    assert response.status_code == 200
    assert response.json()["tracks"] == []

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_analyze_playlist_sync_llm_error(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = LlmSplitterError("LLM failed")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123?include_llm=true", headers=mock_token_header)
    assert response.status_code == 400
    assert "AI Semantic Split failed" in response.json()["detail"]

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_analyze_playlist_sync_spotify_error(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = SpotifyAPIError(status_code=403, message="Access Denied")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123?include_llm=true", headers=mock_token_header)
    assert response.status_code == 403
    assert response.json()["detail"] == "Access Denied"

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_analyze_playlist_sync_generic_exception(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = Exception("Mystery error")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123?include_llm=true", headers=mock_token_header)
    assert response.status_code == 500
    assert "Failed to analyze playlist" in response.json()["detail"]

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_get_playlist_recommendations_success(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.return_value = {
        "recommendations": [{"cluster_id": 0, "playlist_name": "Rec Playlist"}],
        "llm_active": True,
        "llm_provider": "openai",
        "llm_model": "gpt-4o-mini"
    }
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/recommendations", headers=mock_token_header)
    assert response.status_code == 200
    res = response.json()
    assert res["llm_active"] is True
    assert len(res["recommendations"]) == 1

@patch("app.routers.analysis.get_playlist_tracks")
def test_get_playlist_recommendations_empty(mock_tracks, mock_token_header):
    mock_tracks.return_value = []
    response = client.get("/api/analysis/playlist/pl_123/recommendations", headers=mock_token_header)
    assert response.status_code == 200
    assert response.json()["recommendations"] == []

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_get_playlist_recommendations_llm_error(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = LlmSplitterError("LLM failed")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/recommendations", headers=mock_token_header)
    assert response.status_code == 400
    assert "AI Semantic Split failed" in response.json()["detail"]

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_get_playlist_recommendations_spotify_error(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = SpotifyAPIError(status_code=400, message="Spotify error")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/recommendations", headers=mock_token_header)
    assert response.status_code == 400
    assert "Spotify error" in response.json()["detail"]

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.routers.analysis.create_default_pipeline")
def test_get_playlist_recommendations_exception(mock_create_pipeline, mock_tracks, mock_token_header):
    mock_tracks.return_value = [{"id": "t1", "name": "Song 1"}]
    mock_pipeline = MagicMock()
    mock_pipeline.run.side_effect = Exception("Fatal error")
    mock_create_pipeline.return_value = mock_pipeline
    
    response = client.get("/api/analysis/playlist/pl_123/recommendations", headers=mock_token_header)
    assert response.status_code == 500
    assert "Failed to generate recommendations" in response.json()["detail"]

@patch("app.services.lyrics.fetch_lyrics")
@patch("app.services.cache.cache")
@patch("app.analysis.processors.lyric_sentiment.LyricSentimentProcessor")
@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
def test_analyze_track_lyrics_instrumental(mock_resolve, mock_processor_cls, mock_cache, mock_fetch, mock_token_header):
    mock_fetch.return_value = {"lyrics": "", "instrumental": True, "synced_lyrics": None}
    mock_cache.get_track_lyric_analysis.return_value = None
    
    response = client.get(
        "/api/analysis/track/t1/lyrics?track_name=Song&artist_name=Artist&lyrics_strategy=spotify_model",
        headers=mock_token_header
    )
    assert response.status_code == 200
    res = response.json()
    assert res["instrumental"] is True
    assert res["mood"] == "instrumental"

@patch("app.services.lyrics.fetch_lyrics")
@patch("app.services.cache.cache")
def test_analyze_track_lyrics_cache_hit(mock_cache, mock_fetch, mock_token_header):
    mock_fetch.return_value = {"lyrics": "some lyrics", "instrumental": False, "synced_lyrics": "synced"}
    mock_cache.get_track_lyric_analysis.return_value = {
        "mood": "happy", "key_themes": ["joy"], "prominent_words": ["happy"], "summary": "Happy song"
    }
    
    response = client.get(
        "/api/analysis/track/t1/lyrics?track_name=Song&artist_name=Artist",
        headers=mock_token_header
    )
    assert response.status_code == 200
    res = response.json()
    assert res["lyrics"] == "some lyrics"
    assert res["instrumental"] is False
    assert res["synced_lyrics"] == "synced"
    assert res["mood"] == "happy"

@patch("app.services.lyrics.fetch_lyrics")
@patch("app.services.cache.cache")
@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
@patch("app.routers.analysis.litellm")
@patch("app.analysis.processors.lyric_sentiment.LyricSentimentProcessor")
def test_analyze_track_lyrics_llm_success(mock_processor_cls, mock_litellm, mock_resolve_llm, mock_cache, mock_fetch, mock_token_header):
    mock_fetch.return_value = {"lyrics": "some lyrics", "instrumental": False, "synced_lyrics": None}
    mock_cache.get_track_lyric_analysis.return_value = None
    mock_resolve_llm.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    
    mock_processor = MagicMock()
    mock_processor._run_llm_analysis.return_value = {
        "mood": "sad",
        "key_themes": ["heartbreak"],
        "prominent_words": ["cry"],
        "summary": "Sad song analyzed by LLM"
    }
    mock_processor_cls.return_value = mock_processor
    
    response = client.get(
        "/api/analysis/track/t1/lyrics?track_name=Song&artist_name=Artist",
        headers=mock_token_header
    )
    assert response.status_code == 200
    res = response.json()
    assert res["mood"] == "sad"
    mock_cache.set_track_lyric_analysis.assert_called_once()

@patch("app.services.lyrics.fetch_lyrics")
@patch("app.services.cache.cache")
@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
def test_analyze_track_lyrics_heuristic_fallback(mock_resolve_llm, mock_cache, mock_fetch, mock_token_header):
    # LiteLLM not configured (has_llm_key = False)
    mock_fetch.return_value = {"lyrics": "some happy light sunshine dance", "instrumental": False, "synced_lyrics": None}
    mock_cache.get_track_lyric_analysis.return_value = None
    mock_resolve_llm.return_value = ("none", "none", None, None, False)
    
    response = client.get(
        "/api/analysis/track/t1/lyrics?track_name=Song&artist_name=Artist",
        headers=mock_token_header
    )
    assert response.status_code == 200
    res = response.json()
    assert res["mood"] == "joyful" # heuristic result of pos_words count

@patch("app.services.lyrics.fetch_lyrics")
def test_analyze_track_lyrics_exception(mock_fetch, mock_token_header):
    mock_fetch.side_effect = Exception("Database is down")
    response = client.get(
        "/api/analysis/track/t1/lyrics?track_name=Song&artist_name=Artist",
        headers=mock_token_header
    )
    assert response.status_code == 500
    assert "Failed to analyze track lyrics" in response.json()["detail"]

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.services.reccobeats.get_tracks_audio_features")
@patch("app.routers.analysis.get_artists_genres")
@patch("app.analysis.processors.lyric_sentiment.LyricSentimentProcessor")
def test_analyze_playlist_lyrics_success(mock_processor_cls, mock_genres, mock_features, mock_tracks, mock_token_header):
    mock_tracks.return_value = [
        {"id": "t1", "name": "Song 1", "artists": [{"id": "a1", "name": "Artist A"}]}
    ]
    mock_features.return_value = {
        "t1": {"id": "t1", "tempo": 120.0, "energy": 0.8, "valence": 0.6, "acousticness": 0.1, "danceability": 0.7}
    }
    mock_genres.return_value = {"a1": ["rock"]}
    
    mock_processor = MagicMock()
    mock_processor.process.return_value = {
        "lyrics_analysis": {
            "tracks": {"t1": {"mood": "joyful"}},
            "playlist_sentiment": {"mood_distribution": {"joyful": 1}, "top_words": [], "average_sentiment": 0.8}
        }
    }
    mock_processor_cls.return_value = mock_processor
    
    response = client.get(
        "/api/analysis/playlist/pl_123/lyrics?lyrics_strategy=spotify_model",
        headers=mock_token_header
    )
    assert response.status_code == 200
    res = response.json()
    assert "playlist_sentiment" in res
    assert res["tracks"]["t1"]["mood"] == "joyful"

@patch("app.routers.analysis.get_playlist_tracks")
def test_analyze_playlist_lyrics_empty(mock_tracks, mock_token_header):
    mock_tracks.return_value = []
    response = client.get(
        "/api/analysis/playlist/pl_123/lyrics",
        headers=mock_token_header
    )
    assert response.status_code == 200
    assert response.json()["tracks"] == {}

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.services.reccobeats.get_tracks_audio_features")
@patch("app.routers.analysis.get_artists_genres")
def test_analyze_playlist_lyrics_missing_features(mock_genres, mock_features, mock_tracks, mock_token_header):
    mock_tracks.return_value = [
        {"id": "t1", "name": "Song 1", "artists": [{"id": "a1", "name": "Artist A"}]}
    ]
    mock_features.return_value = {} # missing feature map
    mock_genres.return_value = {}
    
    response = client.get(
        "/api/analysis/playlist/pl_123/lyrics",
        headers=mock_token_header
    )
    assert response.status_code == 200
    assert response.json()["tracks"] == {} # all excluded because features are missing

@patch("app.routers.analysis.get_playlist_tracks")
@patch("app.services.reccobeats.get_tracks_audio_features")
@patch("app.routers.analysis.get_artists_genres")
@patch("app.analysis.processors.lyric_sentiment.LyricSentimentProcessor")
def test_analyze_playlist_lyrics_api_failures_caught(mock_processor_cls, mock_genres, mock_features, mock_tracks, mock_token_header):
    mock_tracks.return_value = [
        {"id": "t1", "name": "Song 1", "artists": [{"id": "a1", "name": "Artist A"}]}
    ]
    mock_features.side_effect = Exception("Features failed")
    mock_genres.side_effect = Exception("Genres failed")
    
    mock_processor = MagicMock()
    mock_processor.process.return_value = {"lyrics_analysis": {"tracks": {}}}
    mock_processor_cls.return_value = mock_processor
    
    response = client.get(
        "/api/analysis/playlist/pl_123/lyrics",
        headers=mock_token_header
    )
    assert response.status_code == 200 # exception is caught and returns empty tracks list because features mapping is empty
    assert response.json()["tracks"] == {}

@patch("app.routers.analysis.get_playlist_tracks")
def test_analyze_playlist_lyrics_exception(mock_tracks, mock_token_header):
    mock_tracks.side_effect = Exception("Fatal error")
    response = client.get(
        "/api/analysis/playlist/pl_123/lyrics",
        headers=mock_token_header
    )
    assert response.status_code == 500
    assert "Failed to analyze playlist lyrics" in response.json()["detail"]
