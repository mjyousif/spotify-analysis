import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock
from app.analysis.processors.vibe_splitters.heuristics import MoodMappingSplitter, GenreFirstSplitter

@pytest.fixture
def sample_tracks_df():
    return pd.DataFrame([
        {"id": "t1", "name": "Song A", "artists": [{"id": "art1", "name": "Artist A"}]},
        {"id": "t2", "name": "Song B", "artists": [{"id": "art2", "name": "Artist B"}]},
        {"id": "t3", "name": "Song C", "artists": [{"id": "art1", "name": "Artist A"}]},
        {"id": "t4", "name": "Song D", "artists": [{"id": "art3", "name": "Artist C"}]},
    ])

@pytest.fixture
def sample_features_df():
    return pd.DataFrame([
        {"id": "t1", "tempo": 120.0, "energy": 0.8, "valence": 0.7, "acousticness": 0.1, "danceability": 0.8, "instrumentalness": 0.0, "speechiness": 0.05},
        {"id": "t2", "tempo": 90.0, "energy": 0.3, "valence": 0.2, "acousticness": 0.8, "danceability": 0.4, "instrumentalness": 0.1, "speechiness": 0.03},
        {"id": "t3", "tempo": 110.0, "energy": 0.6, "valence": 0.4, "acousticness": 0.3, "danceability": 0.6, "instrumentalness": 0.0, "speechiness": 0.04},
        {"id": "t4", "tempo": 95.0, "energy": 0.2, "valence": 0.9, "acousticness": 0.5, "danceability": 0.7, "instrumentalness": 0.0, "speechiness": 0.02},
    ])

@pytest.fixture
def sample_x_scaled():
    # Columns in context: ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"]
    return np.array([
        [1.0, 0.8, 0.7, 0.1, 0.8, 0.0, 0.05],
        [0.0, 0.3, 0.2, 0.8, 0.4, 0.1, 0.03],
        [0.5, 0.6, 0.4, 0.3, 0.6, 0.0, 0.04],
        [0.2, 0.2, 0.9, 0.5, 0.7, 0.0, 0.02],
    ])

def test_mood_mapping_metadata():
    splitter = MoodMappingSplitter()
    assert splitter.name == "Mood Mapping (2D Circumplex)"
    assert "emotional grid" in splitter.description
    assert "Russell's" in splitter.help_text
    assert splitter.recommended_projections == ["circumplex"]
    assert splitter.default_projection == "circumplex"
    
    # Recommended K
    X = np.zeros((5, 7))
    assert splitter.get_recommended_k(X) == 4
    X_empty = np.zeros((0, 7))
    assert splitter.get_recommended_k(X_empty) == 4
    X_small = np.zeros((2, 7))
    assert splitter.get_recommended_k(X_small) == 2

@patch("app.services.cache.cache")
def test_mood_mapping_split_k2_no_lyrics(mock_cache, sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = MoodMappingSplitter()
    context = {
        "feature_cols": ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"],
        "lyrics_weight": 0.0
    }
    
    labels, x_coords, y_coords, recs = splitter.split(
        sample_tracks_df, sample_features_df, sample_x_scaled, k=2, context=context
    )
    
    assert recs is None
    # t1: valence=0.7 >=0.5 -> 0
    # t2: valence=0.2 <0.5 -> 1
    # t3: valence=0.4 <0.5 -> 1
    # t4: valence=0.9 >=0.5 -> 0
    assert list(labels) == [0, 1, 1, 0]
    assert x_coords == [0.7, 0.2, 0.4, 0.9]
    assert y_coords == [0.8, 0.3, 0.6, 0.2]

def test_mood_mapping_split_k3_no_lyrics(sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = MoodMappingSplitter()
    context = {
        "feature_cols": ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"],
        "lyrics_weight": 0.0
    }
    
    labels, _, _, _ = splitter.split(
        sample_tracks_df, sample_features_df, sample_x_scaled, k=3, context=context
    )
    # k == 3 quadrants:
    # t1: energy=0.8 >= 0.5 -> 0
    # t2: energy=0.3 < 0.5, valence=0.2 < 0.5 -> 2
    # t3: energy=0.6 >= 0.5 -> 0
    # t4: energy=0.2 < 0.5, valence=0.9 >= 0.5 -> 1
    assert list(labels) == [0, 2, 0, 1]

def test_mood_mapping_split_k4_no_lyrics(sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = MoodMappingSplitter()
    context = {
        "feature_cols": ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"],
        "lyrics_weight": 0.0
    }
    
    labels, _, _, _ = splitter.split(
        sample_tracks_df, sample_features_df, sample_x_scaled, k=4, context=context
    )
    # k >= 4 quadrants:
    # t1: valence=0.7 >= 0.5, energy=0.8 >= 0.5 -> 0 (Happy/Upbeat)
    # t2: valence=0.2 < 0.5, energy=0.3 < 0.5 -> 2 (Moody/Melancholic)
    # t3: valence=0.4 < 0.5, energy=0.6 >= 0.5 -> 3 (Intense/Dark)
    # t4: valence=0.9 >= 0.5, energy=0.2 < 0.5 -> 1 (Calm/Smooth)
    assert list(labels) == [0, 2, 3, 1]

@patch("app.services.cache.cache")
@patch("app.analysis.processors.lyric_strategies.SpotifyModelStrategy")
def test_mood_mapping_split_with_lyrics_cache_hit(mock_strategy_cls, mock_cache, sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = MoodMappingSplitter()
    context = {
        "feature_cols": ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"],
        "lyrics_weight": 1.0,
        "lyrics_strategy": "spotify_model"
    }
    
    mock_cache.get_track_lyric_analysis.side_effect = [
        {"lyrical_valence": 0.9, "lyrical_energy": 0.9},
        {"lyrical_valence": 0.1, "lyrical_energy": 0.1},
        {"lyrical_valence": 0.5, "lyrical_energy": 0.5},
        {"lyrical_valence": 0.9, "lyrical_energy": 0.2}
    ]
    
    mock_strategy = MagicMock()
    mock_strategy.get_lyrical_valence_and_energy.side_effect = [
        (0.9, 0.9), (0.1, 0.1), (0.5, 0.5), (0.9, 0.2)
    ]
    mock_strategy_cls.return_value = mock_strategy
    
    with patch("app.analysis.processors.lyric_strategies.get_lyric_strategy", return_value=mock_strategy):
        labels, x_coords, y_coords, _ = splitter.split(
            sample_tracks_df, sample_features_df, sample_x_scaled, k=4, context=context
        )
        assert list(labels) == [0, 2, 3, 1]

@patch("app.services.cache.cache")
@patch("app.analysis.processors.lyric_strategies.SpotifyModelStrategy")
def test_mood_mapping_split_with_lyrics_cache_miss_fallback(mock_strategy_cls, mock_cache, sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = MoodMappingSplitter()
    context = {
        "feature_cols": ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"],
        "lyrics_weight": 2.0,
        "lyrics_strategy": "spotify_model"
    }
    
    mock_cache.get_track_lyric_analysis.return_value = None
    mock_cache.get_track_lyrics.return_value = {"lyrics": "Mock Lyrics"}
    
    mock_strategy = MagicMock()
    mock_strategy.run_heuristic_fallback.return_value = {"lyrical_valence": 0.8, "lyrical_energy": 0.8}
    mock_strategy.get_lyrical_valence_and_energy.return_value = (0.8, 0.8)
    mock_strategy_cls.return_value = mock_strategy
    
    with patch("app.analysis.processors.lyric_strategies.get_lyric_strategy", return_value=mock_strategy):
        labels, x_coords, y_coords, _ = splitter.split(
            sample_tracks_df, sample_features_df, sample_x_scaled, k=4, context=context
        )
        assert labels[0] == 0

@patch("app.services.cache.cache")
def test_mood_mapping_split_lyrics_exception_logs(mock_cache, sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = MoodMappingSplitter()
    context = {
        "feature_cols": ["tempo", "energy", "valence", "acousticness", "danceability", "instrumentalness", "speechiness"],
        "lyrics_weight": 1.0
    }
    
    mock_cache.get_track_lyric_analysis.side_effect = Exception("Cache exploded")
    
    with patch("logging.getLogger") as mock_log_getter:
        mock_log = MagicMock()
        mock_log_getter.return_value = mock_log
        
        labels, x, y, _ = splitter.split(
            sample_tracks_df, sample_features_df, sample_x_scaled, k=4, context=context
        )
        
        assert len(labels) == 4
        mock_log.error.assert_called()

def test_genre_first_metadata():
    splitter = GenreFirstSplitter()
    assert splitter.name == "Genre-First Hierarchical"
    assert "Groups tracks" in splitter.description
    assert "Prioritizes artist metadata" in splitter.help_text

@patch("app.analysis.processors.vibe_splitters.heuristics.compute_pca_coords")
def test_genre_first_split(mock_pca, sample_tracks_df, sample_features_df, sample_x_scaled):
    splitter = GenreFirstSplitter()
    mock_pca.return_value = ([0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8])
    
    context = {
        "artist_genres": {
            "art1": ["pop", "rock"],
            "art2": ["jazz"],
            "art3": ["classical"]
        }
    }
    
    labels, x_coords, y_coords, recs = splitter.split(
        sample_tracks_df, sample_features_df, sample_x_scaled, k=2, context=context
    )
    
    assert recs is None
    assert labels[0] == 0
    assert labels[1] == -1
    assert labels[2] == 0
    assert labels[3] == -1
    assert x_coords == [0.1, 0.2, 0.3, 0.4]
    assert y_coords == [0.5, 0.6, 0.7, 0.8]
