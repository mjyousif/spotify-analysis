import json
import logging
import re
import os
import pandas as pd
from typing import Dict, Any, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.analysis.processors.base import BaseAnalysisProcessor
from app.services.cache import cache
from app.services.lyrics import fetch_lyrics
from app.analysis.processors.vibe_splitters import resolve_llm_config

# Try to import litellm, catch import errors gracefully
try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

# Stopwords for heuristic lyrics processing
STOPWORDS = set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", 
    "by", "can", "cannot", "could", "did", "do", "does", "doing", "down", "during", "each", 
    "few", "for", "from", "further", "had", "has", "have", "having", "he", "her", "here", 
    "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", 
    "its", "itself", "me", "more", "most", "my", "myself", "no", "nor", "not", "of", "off", 
    "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", 
    "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", 
    "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those", 
    "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", 
    "when", "where", "which", "while", "who", "whom", "why", "with", "would", "you", 
    "your", "yours", "yourself", "yourselves", "dont", "cant", "im", "ive", "youre", 
    "oh", "yeah", "la", "na", "oo", "ooh", "baby", "like", "know", "got", "get", "go",
    "let", "make", "wanna", "gonna"
])

class LyricSentimentProcessor(BaseAnalysisProcessor):
    """
    Fetches lyrics for playlist tracks and runs mood/sentiment analysis.
    Saves and reads analyses from DB cache. Performs LLM analysis when active
    and falls back to rule-based heuristics when not.
    """
    def process(
        self, 
        tracks_df: pd.DataFrame, 
        features_df: pd.DataFrame, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Executes lyrics fetching and analysis for all tracks.
        """
        try:
            processed_tracks = context.get("processed_tracks", [])
            if not processed_tracks:
                logger.info("LyricSentimentProcessor: No tracks available in context. Skipping.")
                return {}

            logger.info(f"LyricSentimentProcessor: Fetching lyrics for {len(processed_tracks)} tracks...")

            # 1. Fetch lyrics for all tracks in parallel using ThreadPoolExecutor
            lyrics_map = {}
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = {}
                for track in processed_tracks:
                    tid = track["id"]
                    track_name = track["name"]
                    artists = track["artists"]
                    
                    # Try to retrieve release year/album info if available
                    album_name = ""
                    duration_ms = track["features"].get("duration_ms", 0)
                    
                    futures[executor.submit(
                        fetch_lyrics, tid, track_name, artists, album_name, duration_ms
                    )] = tid

                for future in as_completed(futures):
                    tid = futures[future]
                    try:
                        lyrics_map[tid] = future.result()
                    except Exception as e:
                        logger.error(f"Failed to fetch lyrics for track {tid}: {str(e)}")
                        lyrics_map[tid] = {"lyrics": "", "instrumental": False, "synced_lyrics": None}

            # 2. Resolve LLM Configuration
            provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
            use_llm = litellm is not None and has_llm_key

            # 3. Process sentiment analysis for each track (checking cache first)
            lyrics_analyses = {}
            playlist_mood_counts = {}
            total_sentiment = 0.0
            sentiment_count = 0
            word_counts = {}

            for track in processed_tracks:
                tid = track["id"]
                track_name = track["name"]
                artists = track["artists"]
                
                track_lyrics_info = lyrics_map.get(tid, {"lyrics": "", "instrumental": False, "synced_lyrics": None})
                lyrics_text = track_lyrics_info.get("lyrics", "")
                is_instrumental = track_lyrics_info.get("instrumental", False)
                synced_lyrics = track_lyrics_info.get("synced_lyrics")

                # Try database cache for sentiment analysis
                analysis_data = None
                try:
                    analysis_data = cache.get_track_lyric_analysis(tid)
                except Exception as e:
                    logger.error(f"Error checking lyric analysis cache for {tid}: {str(e)}")

                if analysis_data is None:
                    # Cache miss: Run analysis
                    try:
                        if is_instrumental or not lyrics_text.strip():
                            analysis_data = {
                                "mood": "instrumental",
                                "sentiment_score": 0.0,
                                "key_themes": ["instrumental"],
                                "prominent_words": [],
                                "summary": "This track is instrumental, carrying mood through sound and rhythm rather than lyrics."
                            }
                        elif use_llm:
                            # Run LLM-based analysis
                            analysis_data = self._run_llm_analysis(
                                track_name, artists, lyrics_text, actual_model, api_base, api_key
                            )
                        
                        # Fallback if LLM is not active or LLM analysis failed
                        if analysis_data is None:
                            analysis_data = self._run_heuristic_analysis(track, lyrics_text)
                            
                        # Save to cache
                        cache.set_track_lyric_analysis(tid)
                        try:
                            cache.set_track_lyric_analysis(tid, analysis_data)
                        except Exception as e:
                            logger.error(f"Failed to cache lyric analysis for {tid}: {str(e)}")

                    except Exception as e:
                        logger.error(f"Failed to analyze track {track_name}: {str(e)}")
                        analysis_data = self._run_heuristic_analysis(track, lyrics_text)

                # Attach lyrics to track analysis payload
                analysis_data["lyrics"] = lyrics_text
                analysis_data["instrumental"] = is_instrumental
                analysis_data["synced_lyrics"] = synced_lyrics
                
                lyrics_analyses[tid] = analysis_data

                # Aggregate stats
                mood = analysis_data.get("mood", "unknown")
                playlist_mood_counts[mood] = playlist_mood_counts.get(mood, 0) + 1
                
                total_sentiment += analysis_data.get("sentiment_score", 0.0)
                sentiment_count += 1

                # Aggregate words for the playlist word cloud
                for w in analysis_data.get("prominent_words", []):
                    w_lower = w.lower()
                    word_counts[w_lower] = word_counts.get(w_lower, 0) + 1

            # Format top words for frontend cloud
            sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:50]
            top_words = [{"text": word, "value": count} for word, count in sorted_words]

            # Calculate average sentiment
            average_sentiment = float(total_sentiment / sentiment_count) if sentiment_count > 0 else 0.0

            result_payload = {
                "lyrics_analysis": {
                    "tracks": lyrics_analyses,
                    "playlist_sentiment": {
                        "mood_distribution": playlist_mood_counts,
                        "top_words": top_words,
                        "average_sentiment": average_sentiment
                    }
                }
            }

            logger.info("LyricSentimentProcessor: Successfully completed analysis.")
            return result_payload

        except Exception as e:
            # Standalone design: logging error and continuing without taking the app down
            logger.error(f"LyricSentimentProcessor critical failure: {str(e)}")
            return {}

    def _run_llm_analysis(
        self, 
        track_name: str, 
        artists: str, 
        lyrics_text: str, 
        model: str, 
        api_base: str = None, 
        api_key: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Uses LLM to perform high-quality lyric sentiment analysis.
        """
        if not litellm:
            return None

        # Truncate lyrics if they are extremely long to save tokens
        truncated_lyrics = lyrics_text[:3000]
        
        prompt = f"""
Analyze the mood, sentiment, themes, and emotional words of these song lyrics.

Song: {track_name} by {artists}

Lyrics:
{truncated_lyrics}

Format your response as a JSON object matching this structure exactly:
{{
  "mood": "mood name (single word, e.g., melancholic, angry, joyful, romantic, energetic, peaceful, reflective)",
  "sentiment_score": 0.5, // Float between -1.0 (most negative) and 1.0 (most positive)
  "key_themes": ["theme1", "theme2"], // Up to 3 main themes
  "prominent_words": ["word1", "word2"], // 5-8 strong emotional words featured in the lyrics
  "summary": "1-2 sentence description summarizing the lyrically expressed mood and message."
}}
Ensure the output is valid JSON and nothing else. Do not wrap in markdown code blocks.
"""

        completion_kwargs = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
        }
        if api_base:
            completion_kwargs["api_base"] = api_base
        if api_key:
            completion_kwargs["api_key"] = api_key

        try:
            try:
                response = litellm.completion(
                    response_format={"type": "json_object"},
                    **completion_kwargs
                )
            except Exception:
                # Fallback without strict JSON formatting
                response = litellm.completion(**completion_kwargs)

            content = response.choices[0].message.content
            if content.startswith("```"):
                content = re.sub(r"^```json\s*", "", content)
                content = re.sub(r"```$", "", content).strip()

            data = json.loads(content)
            return {
                "mood": data.get("mood", "unknown").lower(),
                "sentiment_score": float(data.get("sentiment_score", 0.0)),
                "key_themes": data.get("key_themes", [])[:3],
                "prominent_words": data.get("prominent_words", [])[:8],
                "summary": data.get("summary", "Lyrical themes explored in track.")
            }
        except Exception as e:
            logger.warning(f"LLM lyric analysis failed: {str(e)}")
            return None

    def _run_heuristic_analysis(self, track: Dict[str, Any], lyrics_text: str) -> Dict[str, Any]:
        """
        Rule-based keyword fallback when LLM is unavailable.
        Uses Spotify valence/energy and keyword counts.
        """
        valence = track["features"].get("valence", 0.5)
        energy = track["features"].get("energy", 0.5)

        if not lyrics_text.strip():
            # If no lyrics could be retrieved, fallback to Spotify audio features
            if valence >= 0.6:
                mood = "joyful" if energy >= 0.6 else "peaceful"
            else:
                mood = "angry" if energy >= 0.6 else "melancholic"
            
            return {
                "mood": mood,
                "sentiment_score": float((valence - 0.5) * 2.0),
                "key_themes": [mood],
                "prominent_words": [],
                "summary": f"Lyrics unavailable. Sonic mood categorized as {mood} based on audio dynamics."
            }

        # Analyze keywords in lyrics text
        lyrics_clean = re.sub(r"[^\w\s]", "", lyrics_text.lower())
        tokens = lyrics_clean.split()
        
        # Word counts for prominent words
        word_counts = {}
        for token in tokens:
            if len(token) > 2 and token not in STOPWORDS:
                word_counts[token] = word_counts.get(token, 0) + 1
        
        sorted_tokens = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        prominent_words = [token for token, _ in sorted_tokens[:8]]

        # Category keyword scoring
        scores = {
            "joyful": sum(1 for t in tokens if t in ["love", "happy", "dance", "joy", "celebrate", "smile", "laugh", "light", "sun", "bright", "sweet", "beautiful", "play", "game"]),
            "melancholic": sum(1 for t in tokens if t in ["cry", "sad", "tears", "blue", "rain", "alone", "dark", "pain", "hurt", "sorrow", "broken", "gone", "lose", "grief", "goodbye"]),
            "angry": sum(1 for t in tokens if t in ["hate", "angry", "fight", "kill", "war", "mad", "rage", "burn", "hell", "break", "lie", "wrong", "enemy", "blood", "weapon"]),
            "romantic": sum(1 for t in tokens if t in ["kiss", "baby", "love", "touch", "night", "heart", "yours", "mine", "hold", "close", "darling", "sweet", "paradise"])
        }

        # Select highest category, or map from valence-energy quadrant
        max_cat = max(scores, key=scores.get)
        if scores[max_cat] > 1:
            mood = max_cat
        else:
            # Quadrant logic fallback
            if valence >= 0.5 and energy >= 0.5:
                mood = "joyful"
            elif valence >= 0.5 and energy < 0.5:
                mood = "peaceful"
            elif valence < 0.5 and energy >= 0.5:
                mood = "angry"
            else:
                mood = "melancholic"

        # Construct sentiment score: scale valence (0..1) to (-1..1) adjusted by keywords
        text_sentiment = 0.0
        if scores["joyful"] > 0 or scores["romantic"] > 0:
            text_sentiment += 0.2
        if scores["melancholic"] > 0 or scores["angry"] > 0:
            text_sentiment -= 0.2
            
        base_sentiment = (valence - 0.5) * 2.0
        final_sentiment = max(-1.0, min(1.0, base_sentiment + text_sentiment))

        # Build themes list
        themes = []
        if scores["romantic"] > 0:
            themes.append("romance")
        if scores["melancholic"] > 0:
            themes.append("heartbreak" if scores["melancholic"] > 2 else "sadness")
        if scores["angry"] > 0:
            themes.append("rebellion")
        if scores["joyful"] > 0:
            themes.append("celebration")
            
        if not themes:
            themes = [mood]

        return {
            "mood": mood,
            "sentiment_score": float(final_sentiment),
            "key_themes": themes[:3],
            "prominent_words": prominent_words,
            "summary": f"Lyrical analysis conveys a {mood} theme. Sentiment is paced by the track's musical delivery."
        }
