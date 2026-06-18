import pytest
from app.services.cache import SQLiteCache

@pytest.fixture
def temp_cache(tmp_path):
    db_file = tmp_path / "test_cache.db"
    return SQLiteCache(str(db_file))

def test_init_db(temp_cache):
    with temp_cache._get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        
        expected_tables = {
            "track_features",
            "artist_genres",
            "playlist_tracks",
            "llm_recommendations",
            "track_lyrics",
            "track_lyric_analysis"
        }
        assert expected_tables.issubset(tables)

def test_track_features(temp_cache):
    features = {"tempo": 120.0, "energy": 0.8}
    temp_cache.set_track_features({"track1": features})
    
    res = temp_cache.get_track_features(["track1", "nonexistent"])
    assert "track1" in res
    assert res["track1"] == features
    assert "nonexistent" not in res

def test_artist_genres(temp_cache):
    genres = ["shoegaze", "dream pop"]
    temp_cache.set_artist_genres({"artist1": genres})
    
    res = temp_cache.get_artist_genres(["artist1", "nonexistent"])
    assert "artist1" in res
    assert res["artist1"] == genres
    assert "nonexistent" not in res

def test_playlist_tracks(temp_cache):
    tracks = [{"id": "t1", "name": "Song 1"}, {"id": "t2", "name": "Song 2"}]
    temp_cache.set_playlist_tracks("playlist1", "snapshot1", tracks)
    
    res = temp_cache.get_playlist_tracks("playlist1", "snapshot1")
    assert res == tracks
    
    assert temp_cache.get_playlist_tracks("playlist1", "snapshot_wrong") is None

def test_llm_recommendations(temp_cache):
    recs = [{"cluster_id": 0, "name": "Chill Vibes"}]
    temp_cache.set_llm_recommendations("hash123", recs)
    
    res = temp_cache.get_llm_recommendations("hash123")
    assert res == recs
    assert temp_cache.get_llm_recommendations("nonexistent") is None

def test_track_lyrics(temp_cache):
    temp_cache.set_track_lyrics("track1", "Lalalala lyrics", False, "[00:10.00] Lalalala lyrics")
    
    res = temp_cache.get_track_lyrics("track1")
    assert res is not None
    assert res["lyrics"] == "Lalalala lyrics"
    assert res["instrumental"] is False
    assert res["synced_lyrics"] == "[00:10.00] Lalalala lyrics"
    
    temp_cache.set_track_lyrics("track2", "", True, None)
    res2 = temp_cache.get_track_lyrics("track2")
    assert res2 is not None
    assert res2["lyrics"] == ""
    assert res2["instrumental"] is True
    assert res2["synced_lyrics"] is None

def test_track_lyric_analysis(temp_cache):
    analysis = {"mood": "happy", "sentiment_score": 0.8}
    temp_cache.set_track_lyric_analysis("track1:spotify_model", analysis)
    
    res = temp_cache.get_track_lyric_analysis("track1:spotify_model")
    assert res == analysis
    assert temp_cache.get_track_lyric_analysis("nonexistent") is None
