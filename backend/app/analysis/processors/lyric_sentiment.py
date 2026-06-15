import json
import logging
import re
import os
import time
import pandas as pd
from typing import Dict, Any, List, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.analysis.processors.base import BaseAnalysisProcessor
from app.services.cache import cache
from app.services.lyrics import fetch_lyrics
from app.analysis.processors.vibe_splitters import resolve_llm_config
from app.analysis.processors.lyric_strategies import get_lyric_strategy, safe_float
from app.analysis.timing import AnalysisTimer


# Try to import litellm, catch import errors gracefully
try:
    import litellm
except ImportError:
    litellm = None

logger = logging.getLogger("uvicorn.error")

class LyricSentimentProcessor(BaseAnalysisProcessor):
    """
    Fetches lyrics for playlist tracks and runs mood/sentiment/emotion analysis.
    Uses configurable strategies (e.g. spotify_model vs emotional_profile_6d).
    Saves and reads analyses from DB cache. Performs LLM analysis when active
    and falls back to strategy-specific rule-based heuristics when not.
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

            progress_callback: Optional[Callable] = context.get("progress_callback")
            timings: Optional[Dict] = context.get("timings")
            n_tracks = len(processed_tracks)

            # Resolve strategy
            strategy_name = context.get("lyrics_strategy", "spotify_model")
            strategy = get_lyric_strategy(strategy_name)

            logger.info(
                f"LyricSentimentProcessor: Starting lyrics pipeline for {n_tracks} tracks "
                f"using strategy '{strategy_name}'."
            )

            # ── 1. Fetch lyrics in parallel ──────────────────────────────────────────
            lyrics_map: Dict[str, Any] = {}
            with AnalysisTimer("lyrics_fetch", timings) as fetch_timer:
                with ThreadPoolExecutor(max_workers=10) as executor:
                    futures = {}
                    for track in processed_tracks:
                        tid = track["id"]
                        futures[executor.submit(
                            fetch_lyrics,
                            tid,
                            track["name"],
                            track["artists"],
                            "",                               # album_name
                            track["features"].get("duration_ms", 0),
                        )] = tid

                    fetched = 0
                    for future in as_completed(futures):
                        tid = futures[future]
                        try:
                            lyrics_map[tid] = future.result()
                        except Exception as e:
                            logger.error(f"Failed to fetch lyrics for track {tid}: {str(e)}")
                            lyrics_map[tid] = {"lyrics": "", "instrumental": False, "synced_lyrics": None}
                        fetched += 1

            logger.info(
                f"LyricSentimentProcessor: Lyrics fetched for {n_tracks} tracks "
                f"in {fetch_timer.duration_ms:.0f}ms "
                f"({fetch_timer.duration_ms / n_tracks:.0f}ms avg/track)."
            )

            # ── 2. Resolve LLM configuration ─────────────────────────────────────────
            provider, actual_model, api_base, api_key, has_llm_key = resolve_llm_config()
            use_llm = litellm is not None and has_llm_key
            if use_llm:
                logger.info(
                    f"LyricSentimentProcessor: LLM active — provider={provider}, model={actual_model}"
                )
            else:
                logger.info("LyricSentimentProcessor: LLM not configured — using heuristic fallback.")

            # ── 3. Sentiment analysis loop ────────────────────────────────────────────
            lyrics_analyses: Dict[str, Any] = {}
            playlist_mood_counts: Dict[str, int] = {}
            total_sentiment = 0.0
            sentiment_count = 0
            word_counts: Dict[str, int] = {}

            llm_durations: List[float] = []
            cache_hits = 0
            heuristic_fallbacks = 0
            llm_calls = 0

            for idx, track in enumerate(processed_tracks):
                tid = track["id"]
                track_name = track["name"]
                artists = track["artists"]
                track_num = idx + 1

                track_lyrics_info = lyrics_map.get(tid, {"lyrics": "", "instrumental": False, "synced_lyrics": None})
                lyrics_text = track_lyrics_info.get("lyrics", "")
                is_instrumental = track_lyrics_info.get("instrumental", False)
                synced_lyrics = track_lyrics_info.get("synced_lyrics")

                cache_key = f"{tid}:{strategy_name}"

                # Emit per-track progress update
                if progress_callback:
                    progress_callback({
                        "type": "progress",
                        "stage": "lyrics",
                        "message": f"Analyzing lyrics: {track_num}/{n_tracks} — {track_name}",
                        "current": track_num,
                        "total": n_tracks,
                        "step": 3,
                        "total_steps": 6,
                    })

                # Try cache first
                analysis_data = None
                try:
                    analysis_data = cache.get_track_lyric_analysis(cache_key)
                    if analysis_data is not None:
                        cache_hits += 1
                        logger.debug(
                            f"  [{track_num}/{n_tracks}] Cache hit — '{track_name}' by {artists}"
                        )
                except Exception as e:
                    logger.error(f"Error checking lyric analysis cache for {tid} ({strategy_name}): {str(e)}")

                if analysis_data is None:
                    try:
                        if is_instrumental:
                            analysis_data = {
                                "mood": "instrumental",
                                "key_themes": ["instrumental"],
                                "prominent_words": [],
                                "summary": "This track is instrumental, carrying mood through sound and rhythm rather than lyrics.",
                            }
                            if strategy_name == "spotify_model":
                                analysis_data.update({
                                    "lyrical_valence": 0.5,
                                    "lyrical_energy": 0.5,
                                    "emotional_ambiguity": 0.0,
                                })
                            else:
                                analysis_data.update({
                                    "sentiment_score": 0.0,
                                    "emotions": {
                                        "joy": 0.0, "sadness": 0.0, "anger": 0.0,
                                        "fear_anxiety": 0.0, "love_romance": 0.0, "nostalgia_longing": 0.0,
                                    },
                                })
                            logger.debug(
                                f"  [{track_num}/{n_tracks}] Instrumental — '{track_name}'"
                            )

                        elif not lyrics_text.strip():
                            analysis_data = strategy.run_heuristic_fallback(track, lyrics_text)
                            heuristic_fallbacks += 1
                            logger.debug(
                                f"  [{track_num}/{n_tracks}] No lyrics — heuristic fallback for '{track_name}'"
                            )

                        elif use_llm:
                            llm_start = time.perf_counter()
                            analysis_data = self._run_llm_analysis(
                                track_name, artists, lyrics_text, actual_model, api_base, api_key, strategy_name
                            )
                            llm_elapsed_ms = (time.perf_counter() - llm_start) * 1000.0
                            if analysis_data is not None:
                                llm_durations.append(llm_elapsed_ms)
                                llm_calls += 1
                                logger.info(
                                    f"  [{track_num}/{n_tracks}] LLM ✓ — '{track_name}' ({llm_elapsed_ms:.0f}ms)"
                                )
                            else:
                                logger.warning(
                                    f"  [{track_num}/{n_tracks}] LLM returned None — heuristic fallback for '{track_name}'"
                                )

                        # Heuristic fallback if LLM inactive or failed
                        if analysis_data is None:
                            analysis_data = strategy.run_heuristic_fallback(track, lyrics_text)
                            heuristic_fallbacks += 1

                        # Persist to cache
                        try:
                            cache.set_track_lyric_analysis(cache_key, analysis_data)
                        except Exception as e:
                            logger.error(f"Failed to cache lyric analysis for {tid}: {str(e)}")

                    except Exception as e:
                        logger.error(f"Failed to analyze track '{track_name}': {str(e)}")
                        analysis_data = strategy.run_heuristic_fallback(track, lyrics_text)
                        heuristic_fallbacks += 1

                # Attach raw lyrics to payload
                analysis_data["lyrics"] = lyrics_text
                analysis_data["instrumental"] = is_instrumental
                analysis_data["synced_lyrics"] = synced_lyrics
                lyrics_analyses[tid] = analysis_data

                # Aggregate mood distribution
                mood = analysis_data.get("mood", "unknown")
                playlist_mood_counts[mood] = playlist_mood_counts.get(mood, 0) + 1

                # Derive 1-D sentiment for aggregate stats
                if strategy_name == "spotify_model":
                    val = safe_float(analysis_data.get("lyrical_valence"), 0.5)
                    score = float((val - 0.5) * 2.0)
                else:
                    score = safe_float(analysis_data.get("sentiment_score"), 0.0)
                total_sentiment += score
                sentiment_count += 1

                for w in analysis_data.get("prominent_words", []):
                    w_lower = w.lower()
                    word_counts[w_lower] = word_counts.get(w_lower, 0) + 1

            # ── 4. Summary logging ────────────────────────────────────────────────────
            avg_llm_ms = (sum(llm_durations) / len(llm_durations)) if llm_durations else 0.0
            logger.info(
                f"LyricSentimentProcessor: Completed {n_tracks} tracks — "
                f"cache_hits={cache_hits}, llm_calls={llm_calls} (avg {avg_llm_ms:.0f}ms), "
                f"heuristic_fallbacks={heuristic_fallbacks}."
            )

            # Store LLM timing stats in timings map for summary report
            if timings is not None and llm_durations:
                from app.analysis.timing import StageResult
                timings["lyrics_llm_calls"] = StageResult(
                    name=f"lyrics_llm_calls ({llm_calls} calls)",
                    duration_ms=sum(llm_durations),
                    metadata={"count": llm_calls, "avg_ms": avg_llm_ms},
                )

            # ── 5. Build payload ──────────────────────────────────────────────────────
            sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:50]
            top_words = [{"text": word, "value": count} for word, count in sorted_words]
            average_sentiment = float(total_sentiment / sentiment_count) if sentiment_count > 0 else 0.0

            return {
                "lyrics_analysis": {
                    "tracks": lyrics_analyses,
                    "playlist_sentiment": {
                        "mood_distribution": playlist_mood_counts,
                        "top_words": top_words,
                        "average_sentiment": average_sentiment,
                    },
                }
            }

        except Exception as e:
            logger.error(f"LyricSentimentProcessor critical failure: {str(e)}")
            return {}

    def _run_llm_analysis(
        self, 
        track_name: str, 
        artists: str, 
        lyrics_text: str, 
        model: str, 
        api_base: str = None, 
        api_key: str = None,
        strategy_name: str = "spotify_model"
    ) -> Optional[Dict[str, Any]]:
        """
        Uses LLM to perform high-quality lyric sentiment analysis based on the active strategy.
        """
        if not litellm:
            return None

        # Resolve strategy
        strategy = get_lyric_strategy(strategy_name)

        # Truncate lyrics if they are extremely long to save tokens
        truncated_lyrics = lyrics_text[:3000]
        
        prompt = strategy.prompt_template.format(
            track_name=track_name,
            artists=artists,
            truncated_lyrics=truncated_lyrics
        )

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
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r"^```json\s*", "", content)
                content = re.sub(r"```$", "", content).strip()

            from app.analysis.processors.vibe_splitters.llm import (
                escape_raw_control_chars_in_json_strings,
                repair_truncated_json
            )
            content = escape_raw_control_chars_in_json_strings(content)
            # Remove trailing commas
            content = re.sub(r',\s*([\]}])', r'\1', content)

            try:
                data = json.loads(content)
            except Exception as parse_err:
                logger.warning(f"Lyric sentiment direct JSON parse failed: {parse_err}. Attempting repair...")
                repaired = repair_truncated_json(content)
                data = json.loads(repaired)

            return strategy.extract_emotions_and_metrics(data)
        except Exception as e:
            logger.warning(f"LLM lyric analysis failed: {str(e)}")
            return None
