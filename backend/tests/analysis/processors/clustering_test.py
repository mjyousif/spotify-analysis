import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock
from app.analysis.pipeline import create_clustering_pipeline, create_default_pipeline
from app.analysis.processors.clustering import VibeClusteringProcessor
from app.analysis.processors.vibe_splitters.algorithms import KMeansSplitter, AgglomerativeSplitter, DbscanSplitter

@pytest.fixture
def sample_tracks():
    return [
        {
            "id": "track_1",
            "name": "Track One",
            "uri": "spotify:track:1",
            "popularity": 80,
            "duration_ms": 200000,
            "artists": [{"id": "artist_1", "name": "Artist A"}],
            "album": {"release_date": "2020-05-15", "images": []}
        },
        {
            "id": "track_2",
            "name": "Track Two",
            "uri": "spotify:track:2",
            "popularity": 50,
            "duration_ms": 180000,
            "artists": [{"id": "artist_2", "name": "Artist B"}],
            "album": {"release_date": "1995-10-21", "images": []}
        },
        {
            "id": "track_3",
            "name": "Track Three",
            "uri": "spotify:track:3",
            "popularity": 90,
            "duration_ms": 210000,
            "artists": [{"id": "artist_1", "name": "Artist A"}],
            "album": {"release_date": "2022-01-01", "images": []}
        },
        {
            "id": "track_4",
            "name": "Track Four (Instrumental)",
            "uri": "spotify:track:4",
            "popularity": 30,
            "duration_ms": 250000,
            "artists": [{"id": "artist_3", "name": "Artist C"}],
            "album": {"release_date": "2010-06-01", "images": []}
        },
        {
            "id": "track_5",
            "name": "Track Five (No Lyrics)",
            "uri": "spotify:track:5",
            "popularity": 45,
            "duration_ms": 220000,
            "artists": [{"id": "artist_4", "name": "Artist D"}],
            "album": {"release_date": "2018-09-12", "images": []}
        }
    ]

@pytest.fixture
def sample_audio_features():
    return {
        "track_1": {"id": "track_1", "tempo": 120.0, "energy": 0.8, "valence": 0.6, "acousticness": 0.1, "danceability": 0.7, "instrumentalness": 0.0, "speechiness": 0.05, "liveness": 0.1, "mode": 1, "key": 0},
        "track_2": {"id": "track_2", "tempo": 90.0, "energy": 0.4, "valence": 0.3, "acousticness": 0.7, "danceability": 0.4, "instrumentalness": 0.1, "speechiness": 0.03, "liveness": 0.15, "mode": 0, "key": 5},
        "track_3": {"id": "track_3", "tempo": 125.0, "energy": 0.9, "valence": 0.7, "acousticness": 0.05, "danceability": 0.8, "instrumentalness": 0.0, "speechiness": 0.06, "liveness": 0.2, "mode": 1, "key": 1},
        "track_4": {"id": "track_4", "tempo": 110.0, "energy": 0.5, "valence": 0.5, "acousticness": 0.8, "danceability": 0.5, "instrumentalness": 0.9, "speechiness": 0.02, "liveness": 0.1, "mode": 1, "key": 7},
        "track_5": {"id": "track_5", "tempo": 95.0, "energy": 0.6, "valence": 0.4, "acousticness": 0.3, "danceability": 0.6, "instrumentalness": 0.0, "speechiness": 0.04, "liveness": 0.12, "mode": 0, "key": 2}
    }

def test_vibe_splitters(sample_tracks, sample_audio_features):
    tracks_df = pd.DataFrame(sample_tracks)
    features_df = pd.DataFrame(list(sample_audio_features.values()))
    features_df["spotify_id"] = list(sample_audio_features.keys())
    
    from sklearn.preprocessing import MinMaxScaler
    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(features_df[["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"]])
    
    context = {"timings": {}, "algorithm": "kmeans", "lyrics_strategy": "spotify_model"}
    
    km = KMeansSplitter()
    labels, x_c, y_c, _ = km.split(tracks_df, features_df, X_scaled, k=2, context=context)
    assert len(labels) == len(sample_tracks)
    assert len(set(labels)) == 2
    assert len(x_c) == len(sample_tracks)
    
    agg = AgglomerativeSplitter()
    labels, x_c, y_c, _ = agg.split(tracks_df, features_df, X_scaled, k=2, context=context)
    assert len(labels) == len(sample_tracks)
    assert len(set(labels)) == 2
    
    db = DbscanSplitter()
    labels, x_c, y_c, _ = db.split(tracks_df, features_df, X_scaled, k=2, context=context)
    assert len(labels) == len(sample_tracks)

@patch("app.analysis.pipeline.get_artists_genres")
@patch("app.analysis.pipeline.get_tracks_audio_features")
def test_pipeline_without_lyrics(mock_features, mock_genres, sample_tracks, sample_audio_features):
    mock_genres.return_value = {"artist_1": ["pop", "rock"], "artist_2": ["indie"]}
    mock_features.return_value = sample_audio_features
    
    pipeline = create_default_pipeline()
    pipeline.processors = [p for p in pipeline.processors if isinstance(p, VibeClusteringProcessor)]
    
    res = pipeline.run("mock_token", sample_tracks, k=2)
    
    assert "tracks" in res
    assert len(res["tracks"]) == 5
    assert len(res["excluded_tracks"]) == 0
    assert "clusters" in res
    assert all("cluster" in t for t in res["tracks"])

@patch("app.analysis.pipeline.get_artists_genres")
@patch("app.analysis.pipeline.get_tracks_audio_features")
@patch("app.analysis.processors.lyric_sentiment.fetch_lyrics")
def test_pipeline_with_lyrics_exclusion(mock_fetch, mock_features, mock_genres, sample_tracks, sample_audio_features):
    mock_genres.return_value = {}
    mock_features.return_value = sample_audio_features
    
    def mock_fetch_lyrics(track_id, name, artists, album_name="", duration_ms=0):
        if track_id == "track_4":
            return {"lyrics": "", "instrumental": True, "synced_lyrics": None}
        elif track_id == "track_5":
            return {"lyrics": "", "instrumental": False, "synced_lyrics": None}
        else:
            return {"lyrics": f"These are lyrics for {name}", "instrumental": False, "synced_lyrics": None}
            
    mock_fetch.side_effect = mock_fetch_lyrics
    
    pipeline = create_clustering_pipeline(lyrics_weight=0.5)
    
    res = pipeline.run(
        access_token="mock_token",
        tracks=sample_tracks,
        k=2,
        lyrics_weight=0.5,
        lyrics_strategy="spotify_model"
    )
    
    excluded_ids = {t["id"] for t in res["excluded_tracks"]}
    assert "track_4" in excluded_ids
    assert "track_5" in excluded_ids
    assert len(res["excluded_tracks"]) == 2
    
    remaining_ids = {t["id"] for t in res["tracks"]}
    assert remaining_ids == {"track_1", "track_2", "track_3"}
    assert len(res["tracks"]) == 3
