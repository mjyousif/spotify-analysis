import re
import math
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple

def safe_float(val: Any, default: float) -> float:
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


# Stopwords for keyword matching
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

class BaseLyricStrategy(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def prompt_template(self) -> str:
        pass

    @abstractmethod
    def extract_emotions_and_metrics(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validates and parses the strategy specific fields from LLM json output."""
        pass

    @abstractmethod
    def run_heuristic_fallback(self, track: Dict[str, Any], lyrics_text: str) -> Dict[str, Any]:
        """Heuristic rule-based calculation matching the strategy's dimensions."""
        pass

    @abstractmethod
    def get_clustering_features(self, analysis: Dict[str, Any]) -> List[float]:
        """Converts the cached analysis into a flat list of numeric features for clustering."""
        pass

    @property
    @abstractmethod
    def feature_names(self) -> List[str]:
        pass

    @abstractmethod
    def get_lyrical_valence_and_energy(self, analysis: Dict[str, Any], default_valence: float, default_energy: float) -> Tuple[float, float]:
        """Extracts or estimates valence and energy dimensions from the strategy-specific analysis."""
        pass


    def _clean_tokens(self, lyrics_text: str) -> List[str]:
        if not lyrics_text.strip():
            return []
        lyrics_clean = re.sub(r"[^\w\s]", "", lyrics_text.lower())
        return [t for t in lyrics_clean.split() if len(t) > 2 and t not in STOPWORDS]


class SpotifyModelStrategy(BaseLyricStrategy):
    @property
    def name(self) -> str:
        return "spotify_model"

    @property
    def prompt_template(self) -> str:
        return """
Analyze the multi-dimensional mood, sentiment, themes, and emotional subtext of these song lyrics.

Song: {track_name} by {artists}

Lyrics:
{truncated_lyrics}

Format your response as a JSON object matching this structure exactly:
{{
  "mood": "mood name (single word, e.g., melancholic, joyful, energetic, peaceful, romantic, aggressive)",
  "lyrical_valence": 0.5, // Float 0.0 (deeply sad/bleak) to 1.0 (pure joy/celebration)
  "lyrical_energy": 0.5, // Float 0.0 (calm/subdued) to 1.0 (intense/explosive/aggressive)
  "emotional_ambiguity": 0.3, // Float 0.0 (one clear emotion) to 1.0 (highly bittersweet/sarcastic/conflicting)
  "key_themes": ["theme1", "theme2"], // Up to 3 main themes
  "prominent_words": ["word1", "word2"], // 5-8 strong emotional words
  "summary": "1-2 sentence description summarizing the lyrically expressed mood."
}}
Return ONLY the raw JSON string. Do not include markdown code blocks or backticks.
"""

    def extract_emotions_and_metrics(self, data: Dict[str, Any]) -> Dict[str, Any]:
        mood_raw = data.get("mood", "unknown")
        mood = mood_raw.lower() if isinstance(mood_raw, str) else "unknown"
        summary_raw = data.get("summary", "Lyrical themes analyzed via Spotify Valence/Energy model.")
        summary = summary_raw if isinstance(summary_raw, str) else "Lyrical themes analyzed via Spotify Valence/Energy model."
        return {
            "mood": mood,
            "lyrical_valence": safe_float(data.get("lyrical_valence"), 0.5),
            "lyrical_energy": safe_float(data.get("lyrical_energy"), 0.5),
            "emotional_ambiguity": safe_float(data.get("emotional_ambiguity"), 0.0),
            "key_themes": data.get("key_themes", [])[:3] if isinstance(data.get("key_themes"), list) else [],
            "prominent_words": data.get("prominent_words", [])[:8] if isinstance(data.get("prominent_words"), list) else [],
            "summary": summary
        }


    def run_heuristic_fallback(self, track: Dict[str, Any], lyrics_text: str) -> Dict[str, Any]:
        features = track.get("features")
        if not isinstance(features, dict):
            features = {}
        track_valence = safe_float(features.get("valence"), 0.5)
        track_energy = safe_float(features.get("energy"), 0.5)


        tokens = self._clean_tokens(lyrics_text)
        
        # Word counts for prominent words
        word_counts = {}
        for token in tokens:
            word_counts[token] = word_counts.get(token, 0) + 1
        sorted_tokens = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        prominent_words = [token for token, _ in sorted_tokens[:8]]

        if not tokens:
            # Fallback based on audio features
            mood = "joyful" if track_valence >= 0.5 else "melancholic"
            if track_energy < 0.5:
                mood = "peaceful" if track_valence >= 0.5 else "melancholic"
            elif track_valence < 0.5:
                mood = "angry"
            
            return {
                "mood": mood,
                "lyrical_valence": float(track_valence),
                "lyrical_energy": float(track_energy),
                "emotional_ambiguity": 0.0,
                "key_themes": [mood],
                "prominent_words": [],
                "summary": f"Lyrics unavailable. Sonic mood categorized as {mood}."
            }

        # Valence calculation keywords
        pos_words = ["love", "happy", "dance", "joy", "celebrate", "smile", "laugh", "light", "sun", "bright", "sweet", "beautiful", "play", "game", "kiss", "heaven", "good"]
        neg_words = ["cry", "sad", "tears", "blue", "rain", "alone", "dark", "pain", "hurt", "sorrow", "broken", "gone", "lose", "grief", "goodbye", "hate", "angry", "fight", "kill", "war", "mad", "rage", "burn", "hell", "break", "lie", "wrong", "enemy", "blood", "weapon"]
        
        pos_count = sum(1 for t in tokens if t in pos_words)
        neg_count = sum(1 for t in tokens if t in neg_words)

        valence_offset = (pos_count - neg_count) * 0.1
        lyrical_valence = max(0.0, min(1.0, 0.5 + valence_offset))
        # Blend with track valence
        final_valence = 0.7 * lyrical_valence + 0.3 * track_valence

        # Energy calculation keywords
        high_energy_words = ["dance", "fight", "kill", "war", "mad", "rage", "burn", "hell", "break", "play", "game", "celebrate", "laugh", "blood", "weapon", "run", "fast", "scream", "loud", "fire", "hot", "wild", "go", "scream"]
        low_energy_words = ["sleep", "dream", "quiet", "soft", "calm", "alone", "slow", "rain", "blue", "night", "cry", "sad", "shadow", "cold", "rest", "peace", "lay", "breeze"]
        
        high_count = sum(1 for t in tokens if t in high_energy_words)
        low_count = sum(1 for t in tokens if t in low_energy_words)

        energy_offset = (high_count - low_count) * 0.1
        lyrical_energy = max(0.0, min(1.0, 0.5 + energy_offset))
        final_energy = 0.7 * lyrical_energy + 0.3 * track_energy

        # Ambiguity: Contrast between audio vibe and lyric vibe + presence of mixed emotions
        audio_lyric_valence_diff = abs(track_valence - final_valence)
        audio_lyric_energy_diff = abs(track_energy - final_energy)
        
        mixed_ratio = 0.0
        if pos_count > 0 and neg_count > 0:
            mixed_ratio = min(pos_count, neg_count) / max(1, pos_count + neg_count) * 2.0

        emotional_ambiguity = min(1.0, 0.4 * mixed_ratio + 0.3 * audio_lyric_valence_diff + 0.3 * audio_lyric_energy_diff)

        # Select mood
        if final_valence >= 0.5:
            mood = "joyful" if final_energy >= 0.5 else "peaceful"
        else:
            mood = "angry" if final_energy >= 0.5 else "melancholic"

        themes = []
        if pos_count > 2:
            themes.append("celebration" if final_energy > 0.5 else "romance")
        if neg_count > 2:
            themes.append("heartbreak" if "cry" in tokens or "tears" in tokens else "sadness")
        if high_count > 2:
            themes.append("intensity")
        if not themes:
            themes = [mood]

        return {
            "mood": mood,
            "lyrical_valence": safe_float(final_valence, 0.5),
            "lyrical_energy": safe_float(final_energy, 0.5),
            "emotional_ambiguity": safe_float(emotional_ambiguity, 0.0),
            "key_themes": themes[:3],
            "prominent_words": prominent_words,
            "summary": f"Lyrical analysis conveys a {mood} mood with ambiguity score of {emotional_ambiguity:.2f}."
        }


    def get_clustering_features(self, analysis: Dict[str, Any]) -> List[float]:
        if not isinstance(analysis, dict):
            return [0.5, 0.5, 0.0]
        return [
            safe_float(analysis.get("lyrical_valence"), 0.5),
            safe_float(analysis.get("lyrical_energy"), 0.5),
            safe_float(analysis.get("emotional_ambiguity"), 0.0)
        ]


    @property
    def feature_names(self) -> List[str]:
        return ["lyrical_valence", "lyrical_energy", "emotional_ambiguity"]

    def get_lyrical_valence_and_energy(self, analysis: Dict[str, Any], default_valence: float, default_energy: float) -> Tuple[float, float]:
        if not isinstance(analysis, dict):
            return default_valence, default_energy
        val = safe_float(analysis.get("lyrical_valence"), default_valence)
        eng = safe_float(analysis.get("lyrical_energy"), default_energy)
        return val, eng



class EmotionalProfile6dStrategy(BaseLyricStrategy):
    @property
    def name(self) -> str:
        return "emotional_profile_6d"

    @property
    def prompt_template(self) -> str:
        return """
Analyze the emotional profile, themes, and emotional subtext of these song lyrics.

Song: {track_name} by {artists}

Lyrics:
{truncated_lyrics}

Format your response as a JSON object matching this structure exactly:
{{
  "mood": "mood name (single word, e.g., melancholic, joyful, energetic, peaceful, romantic, aggressive)",
  "sentiment_score": 0.5, // Float -1.0 (most negative) to 1.0 (most positive)
  "emotions": {{
    "joy": 0.5, // Float 0.0 (none) to 1.0 (intense)
    "sadness": 0.5, // Float 0.0 (none) to 1.0 (intense)
    "anger": 0.5, // Float 0.0 (none) to 1.0 (intense)
    "fear_anxiety": 0.3, // Float 0.0 (none) to 1.0 (intense)
    "love_romance": 0.2, // Float 0.0 (none) to 1.0 (intense)
    "nostalgia_longing": 0.4 // Float 0.0 (none) to 1.0 (intense)
  }},
  "key_themes": ["theme1", "theme2"], // Up to 3 main themes
  "prominent_words": ["word1", "word2"], // 5-8 strong emotional words
  "summary": "1-2 sentence description summarizing the lyrically expressed mood."
}}
Return ONLY the raw JSON string. Do not include markdown code blocks or backticks.
"""

    def extract_emotions_and_metrics(self, data: Dict[str, Any]) -> Dict[str, Any]:
        emotions_raw = data.get("emotions")
        if not isinstance(emotions_raw, dict):
            emotions_raw = {}
        emotions = {
            "joy": safe_float(emotions_raw.get("joy"), 0.0),
            "sadness": safe_float(emotions_raw.get("sadness"), 0.0),
            "anger": safe_float(emotions_raw.get("anger"), 0.0),
            "fear_anxiety": safe_float(emotions_raw.get("fear_anxiety"), 0.0),
            "love_romance": safe_float(emotions_raw.get("love_romance"), 0.0),
            "nostalgia_longing": safe_float(emotions_raw.get("nostalgia_longing"), 0.0)
        }
        mood_raw = data.get("mood", "unknown")
        mood = mood_raw.lower() if isinstance(mood_raw, str) else "unknown"
        summary_raw = data.get("summary", "Lyrical themes analyzed via 6D Emotion vector model.")
        summary = summary_raw if isinstance(summary_raw, str) else "Lyrical themes analyzed via 6D Emotion vector model."
        return {
            "mood": mood,
            "sentiment_score": safe_float(data.get("sentiment_score"), 0.0),
            "emotions": emotions,
            "key_themes": data.get("key_themes", [])[:3] if isinstance(data.get("key_themes"), list) else [],
            "prominent_words": data.get("prominent_words", [])[:8] if isinstance(data.get("prominent_words"), list) else [],
            "summary": summary
        }


    def run_heuristic_fallback(self, track: Dict[str, Any], lyrics_text: str) -> Dict[str, Any]:
        features = track.get("features")
        if not isinstance(features, dict):
            features = {}
        track_valence = safe_float(features.get("valence"), 0.5)
        track_energy = safe_float(features.get("energy"), 0.5)

        tokens = self._clean_tokens(lyrics_text)

        # Word counts for prominent words
        word_counts = {}
        for token in tokens:
            word_counts[token] = word_counts.get(token, 0) + 1
        sorted_tokens = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        prominent_words = [token for token, _ in sorted_tokens[:8]]

        if not tokens:
            mood = "joyful" if track_valence >= 0.5 else "melancholic"
            sentiment_score = (track_valence - 0.5) * 2.0
            
            # Form default emotions based on audio valence/energy
            emotions = {
                "joy": safe_float(max(0.0, sentiment_score), 0.0),
                "sadness": safe_float(max(0.0, -sentiment_score), 0.0),
                "anger": safe_float(max(0.0, track_energy - 0.5) if sentiment_score < 0 else 0.0, 0.0),
                "fear_anxiety": 0.0,
                "love_romance": 0.0,
                "nostalgia_longing": 0.0
            }
            return {
                "mood": mood,
                "sentiment_score": safe_float(sentiment_score, 0.0),
                "emotions": emotions,
                "key_themes": [mood],
                "prominent_words": [],
                "summary": f"Lyrics unavailable. Mood categorized as {mood} based on audio features."
            }


        # Emotion keywords list
        joy_words = ["happy", "dance", "joy", "celebrate", "smile", "laugh", "light", "sun", "bright", "play", "game", "heaven", "good"]
        sad_words = ["cry", "sad", "tears", "blue", "rain", "alone", "dark", "pain", "hurt", "sorrow", "broken", "gone", "lose", "grief", "goodbye"]
        ang_words = ["hate", "angry", "fight", "kill", "war", "mad", "rage", "burn", "hell", "break", "lie", "wrong", "enemy", "blood", "weapon"]
        fear_words = ["fear", "afraid", "scared", "anxiety", "nervous", "panic", "shadow", "run", "hide", "worry", "scream", "nightmare", "dread"]
        love_words = ["kiss", "baby", "love", "touch", "night", "heart", "yours", "mine", "hold", "close", "darling", "sweet", "paradise"]
        nost_words = ["remember", "years", "young", "old", "home", "back", "past", "legacy", "memory", "dream", "wish", "miss", "time", "once"]

        joy_score = min(1.0, sum(1 for t in tokens if t in joy_words) * 0.25)
        sad_score = min(1.0, sum(1 for t in tokens if t in sad_words) * 0.25)
        ang_score = min(1.0, sum(1 for t in tokens if t in ang_words) * 0.25)
        fear_score = min(1.0, sum(1 for t in tokens if t in fear_words) * 0.25)
        love_score = min(1.0, sum(1 for t in tokens if t in love_words) * 0.25)
        nost_score = min(1.0, sum(1 for t in tokens if t in nost_words) * 0.25)

        # Basic sentiment
        sentiment = (joy_score + love_score * 0.5) - (sad_score + ang_score * 0.5 + fear_score * 0.5)
        sentiment_score = max(-1.0, min(1.0, (track_valence - 0.5) * 2.0 + sentiment))

        # Select mood
        scores = {"joyful": joy_score, "melancholic": sad_score, "angry": ang_score, "romantic": love_score}
        max_cat = max(scores, key=scores.get)
        if scores[max_cat] > 0.2:
            mood = max_cat
        else:
            mood = "peaceful" if track_valence >= 0.5 else "melancholic"

        return {
            "mood": mood,
            "sentiment_score": safe_float(sentiment_score, 0.0),
            "emotions": {
                "joy": safe_float(joy_score, 0.0),
                "sadness": safe_float(sad_score, 0.0),
                "anger": safe_float(ang_score, 0.0),
                "fear_anxiety": safe_float(fear_score, 0.0),
                "love_romance": safe_float(love_score, 0.0),
                "nostalgia_longing": safe_float(nost_score, 0.0)
            },
            "key_themes": [mood],
            "prominent_words": prominent_words,
            "summary": f"Lyrical analysis indicates a {mood} profile."
        }


    def get_clustering_features(self, analysis: Dict[str, Any]) -> List[float]:
        if not isinstance(analysis, dict):
            return [0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        emotions_raw = analysis.get("emotions")
        if not isinstance(emotions_raw, dict):
            emotions_raw = {}
        sentiment = safe_float(analysis.get("sentiment_score"), 0.0)
        # Scale from [-1..1] to [0..1]
        sentiment_scaled = (sentiment + 1.0) / 2.0
        return [
            sentiment_scaled,
            safe_float(emotions_raw.get("joy"), 0.0),
            safe_float(emotions_raw.get("sadness"), 0.0),
            safe_float(emotions_raw.get("anger"), 0.0),
            safe_float(emotions_raw.get("fear_anxiety"), 0.0),
            safe_float(emotions_raw.get("love_romance"), 0.0),
            safe_float(emotions_raw.get("nostalgia_longing"), 0.0)
        ]


    @property
    def feature_names(self) -> List[str]:
        return ["sentiment_score", "joy", "sadness", "anger", "fear_anxiety", "love_romance", "nostalgia_longing"]

    def get_lyrical_valence_and_energy(self, analysis: Dict[str, Any], default_valence: float, default_energy: float) -> Tuple[float, float]:
        if not isinstance(analysis, dict):
            return default_valence, default_energy
        
        # Estimate Valence from sentiment_score (range -1.0 to 1.0 -> 0.0 to 1.0)
        sentiment = safe_float(analysis.get("sentiment_score"), 0.0)
        lyrical_val = (sentiment + 1.0) / 2.0
        
        # Retrieve raw emotions (Joy, Sadness, Anger, Fear, Love, Nostalgia)
        emotions_raw = analysis.get("emotions")
        if not isinstance(emotions_raw, dict):
            emotions_raw = {}
        joy = safe_float(emotions_raw.get("joy"), 0.0)
        sadness = safe_float(emotions_raw.get("sadness"), 0.0)
        anger = safe_float(emotions_raw.get("anger"), 0.0)
        fear = safe_float(emotions_raw.get("fear_anxiety"), 0.0)
        love = safe_float(emotions_raw.get("love_romance"), 0.0)
        nostalgia = safe_float(emotions_raw.get("nostalgia_longing"), 0.0)
        
        # Estimate Arousal/Energy:
        # High arousal: anger (1.0), joy (0.6), fear (0.6)
        # Low arousal: sadness (0.8), nostalgia (0.5), love (0.3)
        energy_delta = (anger * 1.0 + joy * 0.6 + fear * 0.6) - (sadness * 0.8 + nostalgia * 0.5 + love * 0.3)
        
        # Center around 0.5 and clamp between 0.0 and 1.0
        lyrical_eng = 0.5 + 0.5 * energy_delta
        lyrical_eng = max(0.0, min(1.0, lyrical_eng))
        
        return lyrical_val, lyrical_eng



# Strategy Registry
STRATEGIES = {
    "spotify_model": SpotifyModelStrategy(),
    "emotional_profile_6d": EmotionalProfile6dStrategy()
}

def get_lyric_strategy(name: str) -> BaseLyricStrategy:
    name_norm = name.lower().strip()
    return STRATEGIES.get(name_norm, STRATEGIES["spotify_model"])
