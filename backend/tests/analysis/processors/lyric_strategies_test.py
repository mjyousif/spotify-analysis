import pytest
import math
from app.analysis.processors.lyric_strategies import (
    safe_float,
    SpotifyModelStrategy,
    EmotionalProfile6dStrategy,
    get_lyric_strategy,
    BaseLyricStrategy
)

def test_safe_float():
    assert safe_float(1.5, 0.0) == 1.5
    assert safe_float("2.7", 0.0) == 2.7
    assert safe_float(None, 0.5) == 0.5
    assert safe_float("invalid", 0.8) == 0.8
    assert safe_float(float("nan"), 0.3) == 0.3
    assert safe_float(float("inf"), 0.3) == 0.3

def test_base_lyric_strategy_abstracts():
    # Instantiate a dummy implementation to cover abstract properties/methods on BaseLyricStrategy
    class DummyStrategy(BaseLyricStrategy):
        @property
        def name(self):
            return super().name
        @property
        def prompt_template(self):
            return super().prompt_template
        def extract_emotions_and_metrics(self, data):
            return super().extract_emotions_and_metrics(data)
        def run_heuristic_fallback(self, track, lyrics_text):
            return super().run_heuristic_fallback(track, lyrics_text)
        def get_clustering_features(self, analysis):
            return super().get_clustering_features(analysis)
        @property
        def feature_names(self):
            return super().feature_names
        def get_lyrical_valence_and_energy(self, analysis, default_valence, default_energy):
            return super().get_lyrical_valence_and_energy(analysis, default_valence, default_energy)

    dummy = DummyStrategy()
    # Execute to cover definition lines
    dummy.name
    dummy.prompt_template
    dummy.extract_emotions_and_metrics({})
    dummy.run_heuristic_fallback({}, "")
    dummy.get_clustering_features({})
    dummy.feature_names
    dummy.get_lyrical_valence_and_energy({}, 0.5, 0.5)
    
    # Check token cleaner helper on base class
    assert dummy._clean_tokens("") == []
    assert dummy._clean_tokens("a an the love") == ["love"]

def test_spotify_model_strategy():
    strategy = SpotifyModelStrategy()
    assert strategy.name == "spotify_model"
    assert "Analyze the multi-dimensional mood" in strategy.prompt_template
    assert strategy.feature_names == ["lyrical_valence", "lyrical_energy", "emotional_ambiguity"]
    
    # extract_emotions_and_metrics
    data_valid = {
        "mood": "Aggressive",
        "lyrical_valence": 0.2,
        "lyrical_energy": 0.9,
        "emotional_ambiguity": 0.1,
        "key_themes": ["rage", "fire", "extra1", "extra2"],
        "prominent_words": ["burn", "rage"],
        "summary": "Explosive energy"
    }
    extracted = strategy.extract_emotions_and_metrics(data_valid)
    assert extracted["mood"] == "aggressive"
    assert extracted["lyrical_valence"] == 0.2
    assert len(extracted["key_themes"]) == 3 # truncated to 3
    
    # extract with invalid types/missing keys
    extracted_bad = strategy.extract_emotions_and_metrics({})
    assert extracted_bad["mood"] == "unknown"
    assert extracted_bad["lyrical_valence"] == 0.5
    assert extracted_bad["key_themes"] == []
    
    # run_heuristic_fallback - empty tokens, features is None/not dict
    fallback_no_features = strategy.run_heuristic_fallback({"features": None}, "")
    assert fallback_no_features["mood"] == "joyful"
    
    # run_heuristic_fallback - empty tokens, low valence high energy (angry)
    track_angry = {"features": {"valence": 0.3, "energy": 0.8}}
    fallback_angry = strategy.run_heuristic_fallback(track_angry, "")
    assert fallback_angry["mood"] == "angry"
    
    # run_heuristic_fallback - empty tokens, valence & energy < 0.5 (melancholic)
    track_mel = {"features": {"valence": 0.3, "energy": 0.3}}
    fallback_mel = strategy.run_heuristic_fallback(track_mel, "")
    assert fallback_mel["mood"] == "melancholic"
    
    # run_heuristic_fallback - with tokens (valence & energy offset keywords)
    # pos_words: love, happy, joy
    # high_energy_words: fight, rage, fast, scream
    track = {"features": {"valence": 0.8, "energy": 0.4}}
    lyrics = "love happy joy fight rage fast scream hello testing"
    fallback_with_tokens = strategy.run_heuristic_fallback(track, lyrics)
    assert fallback_with_tokens["lyrical_valence"] > 0.5
    assert fallback_with_tokens["lyrical_energy"] > 0.5
    assert "love" in fallback_with_tokens["prominent_words"]
    
    # run_heuristic_fallback - heartbreak theme (cry/tears present)
    lyrics_cry = "cry tears pain sadness hello testing"
    fallback_cry = strategy.run_heuristic_fallback(track_mel, lyrics_cry)
    assert "heartbreak" in fallback_cry["key_themes"]
    
    # run_heuristic_fallback - no themes fallback (neutral words)
    lyrics_neutral = "hello testing computer desk window"
    fallback_neutral = strategy.run_heuristic_fallback(track, lyrics_neutral)
    assert fallback_neutral["key_themes"] == ["peaceful"]
    
    # get_clustering_features
    assert strategy.get_clustering_features(None) == [0.5, 0.5, 0.0]
    assert strategy.get_clustering_features({"lyrical_valence": 0.8, "lyrical_energy": 0.2, "emotional_ambiguity": 0.5}) == [0.8, 0.2, 0.5]
    
    # get_lyrical_valence_and_energy
    assert strategy.get_lyrical_valence_and_energy(None, 0.1, 0.2) == (0.1, 0.2)
    assert strategy.get_lyrical_valence_and_energy({"lyrical_valence": 0.8, "lyrical_energy": 0.7}, 0.1, 0.2) == (0.8, 0.7)

def test_emotional_profile_6d_strategy():
    strategy = EmotionalProfile6dStrategy()
    assert strategy.name == "emotional_profile_6d"
    assert "Analyze the emotional profile" in strategy.prompt_template
    assert strategy.feature_names == ["sentiment_score", "joy", "sadness", "anger", "fear_anxiety", "love_romance", "nostalgia_longing"]
    
    # extract_emotions_and_metrics
    data_valid = {
        "mood": "Romantic",
        "sentiment_score": 0.8,
        "emotions": {
            "joy": 0.9, "sadness": 0.0, "anger": 0.0, "fear_anxiety": 0.0, "love_romance": 0.95, "nostalgia_longing": 0.3
        },
        "key_themes": ["love"],
        "prominent_words": ["forever", "darling"],
        "summary": "A beautiful romance"
    }
    extracted = strategy.extract_emotions_and_metrics(data_valid)
    assert extracted["mood"] == "romantic"
    assert extracted["sentiment_score"] == 0.8
    assert extracted["emotions"]["love_romance"] == 0.95
    
    # extract with missing/invalid types
    extracted_bad = strategy.extract_emotions_and_metrics({})
    assert extracted_bad["mood"] == "unknown"
    assert extracted_bad["sentiment_score"] == 0.0
    assert extracted_bad["emotions"]["joy"] == 0.0
    
    # run_heuristic_fallback - empty tokens, features None
    fallback_no_features = strategy.run_heuristic_fallback({"features": None}, "")
    assert fallback_no_features["mood"] == "joyful"
    
    # run_heuristic_fallback - empty tokens, high valence low energy
    track_peaceful = {"features": {"valence": 0.8, "energy": 0.3}}
    fallback_empty = strategy.run_heuristic_fallback(track_peaceful, "")
    assert fallback_empty["mood"] == "joyful"
    
    # run_heuristic_fallback - with tokens (touch is in love_words, baby is a stopword)
    lyrics = "happy dance kiss touch cry tears remember years"
    track = {"features": {"valence": 0.3, "energy": 0.8}}
    fallback_with_tokens = strategy.run_heuristic_fallback(track, lyrics)
    assert fallback_with_tokens["emotions"]["joy"] == 0.5 # happy, dance
    assert fallback_with_tokens["emotions"]["love_romance"] == 0.5 # kiss, touch
    assert fallback_with_tokens["emotions"]["sadness"] == 0.5 # cry, tears
    
    # run_heuristic_fallback - low emotion score fallback (peaceful/melancholic)
    lyrics_neutral = "computer desk window paper coffee"
    fallback_neutral = strategy.run_heuristic_fallback(track_peaceful, lyrics_neutral)
    assert fallback_neutral["mood"] == "peaceful"
    
    # get_clustering_features
    assert strategy.get_clustering_features(None) == [0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    analysis_mock = {
        "sentiment_score": 0.5, # scaled to (0.5+1)/2 = 0.75
        "emotions": {
            "joy": 0.9, "sadness": 0.1, "anger": 0.0, "fear_anxiety": 0.0, "love_romance": 0.8, "nostalgia_longing": 0.4
        }
    }
    assert strategy.get_clustering_features(analysis_mock) == [0.75, 0.9, 0.1, 0.0, 0.0, 0.8, 0.4]
    
    # get_lyrical_valence_and_energy
    assert strategy.get_lyrical_valence_and_energy(None, 0.3, 0.4) == (0.3, 0.4)
    # joy=0.8, sadness=0.2, anger=0.9
    analysis_val_eng = {
        "sentiment_score": 0.6, # valence = (0.6+1)/2 = 0.8
        "emotions": {
            "joy": 0.8, "sadness": 0.2, "anger": 0.9, "fear_anxiety": 0.0, "love_romance": 0.0, "nostalgia_longing": 0.0
        }
    }
    val, eng = strategy.get_lyrical_valence_and_energy(analysis_val_eng, 0.3, 0.4)
    assert val == 0.8
    assert eng == 1.0

def test_get_lyric_strategy():
    assert get_lyric_strategy("spotify_model").name == "spotify_model"
    assert get_lyric_strategy(" SPOTIFY_MODEL ").name == "spotify_model"
    assert get_lyric_strategy("emotional_profile_6d").name == "emotional_profile_6d"
    assert get_lyric_strategy("unknown_strategy").name == "spotify_model"
