import pytest
import json
import pandas as pd
from unittest.mock import patch, MagicMock
from app.analysis.processors.llm_recommender import LLMRecommendationProcessor, is_valid_key

def test_is_valid_key():
    assert is_valid_key("sk-1234567890abcdef") is True
    assert is_valid_key("") is False
    assert is_valid_key("None") is False
    assert is_valid_key("your_openai_api_key_here") is False
    assert is_valid_key("your_api_key") is False

def test_llm_recommender_empty_profiles():
    processor = LLMRecommendationProcessor()
    res = processor.process(pd.DataFrame(), pd.DataFrame(), {"cluster_profiles": []})
    assert res == {"recommendations": []}

def test_llm_recommender_already_in_context():
    processor = LLMRecommendationProcessor()
    context = {
        "cluster_profiles": [{"cluster_id": 0}],
        "llm_recommendations": [{"cluster_id": 0, "playlist_name": "Context Vibe"}]
    }
    with patch("app.analysis.processors.vibe_splitters.resolve_llm_config", return_value=("openai", "gpt-4o-mini", None, "key", True)):
        res = processor.process(pd.DataFrame(), pd.DataFrame(), context)
        assert res["recommendations"] == [{"cluster_id": 0, "playlist_name": "Context Vibe"}]
        assert res["llm_active"] is True

@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
def test_llm_recommender_inactive_static_fallback(mock_resolve):
    # Mock LLM not configured
    mock_resolve.return_value = ("none", "none", None, None, False)
    
    processor = LLMRecommendationProcessor()
    context = {
        "cluster_profiles": [
            {
                "cluster_id": 0,
                "count": 5,
                "top_genres": ["pop", "dance"],
                "representative_songs": [],
                "averages": {"energy": 0.8, "valence": 0.7, "acousticness": 0.1}
            },
            {
                "cluster_id": -1,
                "count": 2,
                "top_genres": ["jazz"],
                "representative_songs": [],
                "averages": {"energy": 0.2, "valence": 0.5, "acousticness": 0.7}
            }
        ]
    }
    
    res = processor.process(pd.DataFrame(), pd.DataFrame(), context)
    assert res["llm_active"] is False
    assert len(res["recommendations"]) == 2
    assert res["recommendations"][0]["cluster_id"] == 0
    assert "High-Energy Upbeat Pop" in res["recommendations"][0]["playlist_name"]
    assert res["recommendations"][1]["cluster_id"] == -1
    assert res["recommendations"][1]["playlist_name"] == "The Eclectic Wildcards"

@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
@patch("app.analysis.processors.llm_recommender.cache")
def test_llm_recommender_cache_hit(mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = [{"cluster_id": 0, "playlist_name": "Cached Vibe"}]
    
    processor = LLMRecommendationProcessor()
    context = {
        "cluster_profiles": [
            {
                "cluster_id": 0,
                "count": 5,
                "top_genres": ["pop"],
                "representative_songs": [],
                "averages": {"energy": 0.8, "valence": 0.7, "acousticness": 0.1}
            }
        ]
    }
    
    res = processor.process(pd.DataFrame(), pd.DataFrame(), context)
    assert res["recommendations"] == [{"cluster_id": 0, "playlist_name": "Cached Vibe"}]
    assert res["llm_active"] is True
    mock_cache.get_llm_recommendations.assert_called_once()

@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
@patch("app.analysis.processors.llm_recommender.cache")
@patch("app.analysis.processors.llm_recommender.litellm")
def test_llm_recommender_completion_success(mock_litellm, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = None
    
    # Mock LiteLLM response choice message
    mock_choice = MagicMock()
    mock_choice.message.content = """
    ```json
    {
      "recommendations": [
        {
          "cluster_id": 0,
          "playlist_name": "Neon Dreams",
          "description": "Synth-driven pop energy.",
          "vibe_explanation": "High energy beats."
        }
      ]
    }
    ```
    """
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_litellm.completion.return_value = mock_response
    
    processor = LLMRecommendationProcessor()
    context = {
        "cluster_profiles": [
            {
                "cluster_id": 0,
                "count": 5,
                "top_genres": ["pop"],
                "representative_songs": [],
                "averages": {"energy": 0.8, "valence": 0.7, "acousticness": 0.1}
            }
        ]
    }
    
    res = processor.process(pd.DataFrame(), pd.DataFrame(), context)
    assert res["llm_active"] is True
    assert res["recommendations"][0]["playlist_name"] == "Neon Dreams"
    mock_cache.set_llm_recommendations.assert_called_once()

@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
@patch("app.analysis.processors.llm_recommender.cache")
@patch("app.analysis.processors.llm_recommender.litellm")
def test_llm_recommender_completion_json_retry_and_repair(mock_litellm, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", "http://base", "key", True)
    mock_cache.get_llm_recommendations.return_value = None
    
    # 1. Raise Exception on response_format call
    # 2. Return success content on plain call (missing final braces to test repair)
    mock_choice = MagicMock()
    mock_choice.message.content = '{"recommendations": [{"cluster_id": 0, "playlist_name": "Repaired Dreams"'
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    
    mock_litellm.completion.side_effect = [
        Exception("JSON Mode unsupported"),
        mock_response
    ]
    
    processor = LLMRecommendationProcessor()
    context = {
        "cluster_profiles": [
            {
                "cluster_id": 0,
                "count": 5,
                "top_genres": ["pop"],
                "representative_songs": [],
                "averages": {"energy": 0.8, "valence": 0.7, "acousticness": 0.1}
            }
        ]
    }
    
    res = processor.process(pd.DataFrame(), pd.DataFrame(), context)
    assert res["recommendations"][0]["playlist_name"] == "Repaired Dreams" # parsed via repair_truncated_json

@patch("app.analysis.processors.vibe_splitters.resolve_llm_config")
@patch("app.analysis.processors.llm_recommender.cache")
@patch("app.analysis.processors.llm_recommender.litellm")
def test_llm_recommender_completion_exception_fallback(mock_litellm, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = None
    mock_litellm.completion.side_effect = Exception("LiteLLM crashed")
    
    processor = LLMRecommendationProcessor()
    context = {
        "cluster_profiles": [
            {
                "cluster_id": 0,
                "count": 5,
                "top_genres": ["pop"],
                "representative_songs": [],
                "averages": {"energy": 0.8, "valence": 0.7, "acousticness": 0.1}
            }
        ]
    }
    
    # Exception is caught, falls back to static recommendation
    res = processor.process(pd.DataFrame(), pd.DataFrame(), context)
    assert res["llm_active"] is False
    assert "High-Energy Upbeat Pop" in res["recommendations"][0]["playlist_name"]

def test_static_recommendation_variants():
    processor = LLMRecommendationProcessor()
    
    # 1. Organic Acoustic
    p1 = {"cluster_id": 0, "top_genres": ["indie"], "averages": {"energy": 0.4, "valence": 0.5, "acousticness": 0.8, "tempo": 100}}
    r1 = processor._generate_static_recommendation(p1)
    assert "Organic Acoustic Indie" in r1["playlist_name"]
    
    # 2. Smooth & Sunny
    p2 = {"cluster_id": 1, "top_genres": ["pop"], "averages": {"energy": 0.5, "valence": 0.8, "acousticness": 0.2, "tempo": 110}}
    r2 = processor._generate_static_recommendation(p2)
    assert "Smooth & Sunny Pop" in r2["playlist_name"]
    
    # 3. Moody & Atmospheric
    p3 = {"cluster_id": 2, "top_genres": ["ambient"], "averages": {"energy": 0.3, "valence": 0.3, "acousticness": 0.3, "tempo": 80}}
    r3 = processor._generate_static_recommendation(p3)
    assert "Moody & Atmospheric Ambient" in r3["playlist_name"]
    
    # 4. Intense & Heavy
    p4 = {"cluster_id": 3, "top_genres": ["metal"], "averages": {"energy": 0.9, "valence": 0.3, "acousticness": 0.05, "tempo": 140}}
    r4 = processor._generate_static_recommendation(p4)
    assert "Intense & Heavy Metal" in r4["playlist_name"]
