import sqlite3
import json
import os
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("uvicorn.error")

DB_PATH = os.getenv("CACHE_DB_PATH", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "cache.db")))

class SQLiteCache:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_db(self) -> None:
        # Ensure database directory exists
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        try:
            with self._get_conn() as conn:
                # Table for track features (permanent cache)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS track_features (
                        id TEXT PRIMARY KEY,
                        features TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # Table for artist genres (temporary cache)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS artist_genres (
                        id TEXT PRIMARY KEY,
                        genres TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # Table for playlist tracks (snapshot cache)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS playlist_tracks (
                        playlist_id TEXT,
                        snapshot_id TEXT,
                        tracks TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (playlist_id, snapshot_id)
                    )
                """)
                # Table for LLM recommendations (input hash cache)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS llm_recommendations (
                        hash_key TEXT PRIMARY KEY,
                        recommendations TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # Table for track lyrics
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS track_lyrics (
                        id TEXT PRIMARY KEY,
                        lyrics TEXT,
                        instrumental INTEGER,
                        synced_lyrics TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # Table for track lyric sentiment analysis
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS track_lyric_analysis (
                        id TEXT PRIMARY KEY,
                        analysis TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.commit()
            logger.info(f"SQLite cache initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize SQLite cache: {str(e)}")

    # -------------------------------------------------------------
    # Track Features (ReccoBeats)
    # -------------------------------------------------------------
    def get_track_features(self, track_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not track_ids:
            return {}
        
        placeholders = ",".join("?" for _ in track_ids)
        query = f"SELECT id, features FROM track_features WHERE id IN ({placeholders})"
        
        features_map = {}
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(query, track_ids)
                for row in cursor.fetchall():
                    try:
                        features_map[row[0]] = json.loads(row[1])
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Error reading track features from cache: {str(e)}")
            
        return features_map

    def set_track_features(self, features_map: Dict[str, Dict[str, Any]]) -> None:
        if not features_map:
            return
        
        try:
            with self._get_conn() as conn:
                conn.executemany(
                    "INSERT OR REPLACE INTO track_features (id, features, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    [(tid, json.dumps(feat)) for tid, feat in features_map.items()]
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error writing track features to cache: {str(e)}")

    # -------------------------------------------------------------
    # Artist Genres (Spotify)
    # -------------------------------------------------------------
    def get_artist_genres(self, artist_ids: List[str], max_age_days: int = 14) -> Dict[str, List[str]]:
        if not artist_ids:
            return {}
            
        placeholders = ",".join("?" for _ in artist_ids)
        query = f"""
            SELECT id, genres 
            FROM artist_genres 
            WHERE id IN ({placeholders}) 
              AND updated_at >= datetime('now', '-{max_age_days} days')
        """
        
        genres_map = {}
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(query, artist_ids)
                for row in cursor.fetchall():
                    try:
                        genres_map[row[0]] = json.loads(row[1])
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Error reading artist genres from cache: {str(e)}")
            
        return genres_map

    def set_artist_genres(self, genres_map: Dict[str, List[str]]) -> None:
        if not genres_map:
            return
            
        try:
            with self._get_conn() as conn:
                conn.executemany(
                    "INSERT OR REPLACE INTO artist_genres (id, genres, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    [(aid, json.dumps(genres)) for aid, genres in genres_map.items()]
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error writing artist genres to cache: {str(e)}")

    # -------------------------------------------------------------
    # Playlist Tracks (Spotify)
    # -------------------------------------------------------------
    def get_playlist_tracks(self, playlist_id: str, snapshot_id: str) -> Optional[List[Dict[str, Any]]]:
        query = "SELECT tracks FROM playlist_tracks WHERE playlist_id = ? AND snapshot_id = ?"
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(query, (playlist_id, snapshot_id))
                row = cursor.fetchone()
                if row:
                    try:
                        return json.loads(row[0])
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Error reading playlist tracks from cache: {str(e)}")
        return None

    def set_playlist_tracks(self, playlist_id: str, snapshot_id: str, tracks: List[Dict[str, Any]]) -> None:
        try:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO playlist_tracks (playlist_id, snapshot_id, tracks, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                    (playlist_id, snapshot_id, json.dumps(tracks))
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error writing playlist tracks to cache: {str(e)}")

    # -------------------------------------------------------------
    # LLM Recommendations
    # -------------------------------------------------------------
    def get_llm_recommendations(self, hash_key: str) -> Optional[List[Dict[str, Any]]]:
        query = "SELECT recommendations FROM llm_recommendations WHERE hash_key = ?"
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(query, (hash_key,))
                row = cursor.fetchone()
                if row:
                    try:
                        return json.loads(row[0])
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Error reading LLM recommendations from cache: {str(e)}")
        return None

    def set_llm_recommendations(self, hash_key: str, recommendations: List[Dict[str, Any]]) -> None:
        try:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO llm_recommendations (hash_key, recommendations, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    (hash_key, json.dumps(recommendations))
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error writing LLM recommendations to cache: {str(e)}")

    # -------------------------------------------------------------
    # Track Lyrics (LRCLib)
    # -------------------------------------------------------------
    def get_track_lyrics(self, track_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT lyrics, instrumental, synced_lyrics FROM track_lyrics WHERE id = ?"
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(query, (track_id,))
                row = cursor.fetchone()
                if row:
                    return {
                        "lyrics": row[0],
                        "instrumental": bool(row[1]),
                        "synced_lyrics": row[2]
                    }
        except Exception as e:
            logger.error(f"Error reading track lyrics from cache: {str(e)}")
        return None

    def set_track_lyrics(self, track_id: str, lyrics: str, instrumental: bool, synced_lyrics: Optional[str] = None) -> None:
        try:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO track_lyrics (id, lyrics, instrumental, synced_lyrics, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    (track_id, lyrics, 1 if instrumental else 0, synced_lyrics)
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error writing track lyrics to cache: {str(e)}")

    # -------------------------------------------------------------
    # Track Lyric Sentiment / Analysis
    # -------------------------------------------------------------
    def get_track_lyric_analysis(self, track_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT analysis FROM track_lyric_analysis WHERE id = ?"
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(query, (track_id,))
                row = cursor.fetchone()
                if row:
                    try:
                        return json.loads(row[0])
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Error reading track lyric analysis from cache: {str(e)}")
        return None

    def set_track_lyric_analysis(self, track_id: str, analysis: Dict[str, Any]) -> None:
        try:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO track_lyric_analysis (id, analysis, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    (track_id, json.dumps(analysis))
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error writing track lyric analysis to cache: {str(e)}")

# Global instance of cache
cache = SQLiteCache()
