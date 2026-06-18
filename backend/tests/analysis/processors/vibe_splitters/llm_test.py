import pytest
import json
import numpy as np
import pandas as pd
from unittest.mock import patch, MagicMock
from app.analysis.processors.vibe_splitters.llm import (
    resolve_llm_config,
    escape_raw_control_chars_in_json_strings,
    repair_truncated_json,
    extract_recommendations_and_assignments,
    LlmSemanticSplitter,
    LlmSplitterError
)

@pytest.fixture
def mock_settings():
    with patch("app.analysis.processors.vibe_splitters.llm.settings") as mocked:
        mocked.llm_provider = "openai"
        mocked.llm_model = "gpt-4o-mini"
        mocked.openai_api_key = "sk-123"
        yield mocked

def test_resolve_llm_config_explicit_openai(mock_settings):
    provider, model, base, key, has_key = resolve_llm_config()
    assert provider == "openai"
    assert model == "gpt-4o-mini"
    assert key == "sk-123"
    assert has_key is True

def test_resolve_llm_config_explicit_gemini(mock_settings):
    mock_settings.llm_provider = "gemini"
    mock_settings.gemini_api_key = "gemini-123"
    mock_settings.llm_model = ""
    provider, model, base, key, has_key = resolve_llm_config()
    assert provider == "gemini"
    assert model == "gemini/gemini-1.5-flash"
    assert key == "gemini-123"
    assert has_key is True

def test_resolve_llm_config_explicit_anthropic(mock_settings):
    mock_settings.llm_provider = "anthropic"
    mock_settings.anthropic_api_key = "anthropic-123"
    mock_settings.llm_model = "claude-3.5"
    provider, model, base, key, has_key = resolve_llm_config()
    assert provider == "anthropic"
    assert model == "anthropic/claude-3.5"
    assert key == "anthropic-123"
    assert has_key is True

def test_resolve_llm_config_explicit_lm_studio(mock_settings):
    mock_settings.llm_provider = "lm_studio"
    mock_settings.lm_studio_api_base = "http://localhost:1234/v1"
    mock_settings.llm_model = "llama-3"
    provider, model, base, key, has_key = resolve_llm_config()
    assert provider == "lm_studio"
    assert model == "lm_studio/llama-3"
    assert base == "http://localhost:1234/v1"
    assert has_key is True

def test_resolve_llm_config_explicit_ollama(mock_settings):
    mock_settings.llm_provider = "ollama"
    mock_settings.ollama_api_base = "http://localhost:11434"
    mock_settings.llm_model = ""
    provider, model, base, key, has_key = resolve_llm_config()
    assert provider == "ollama"
    assert model == "ollama/llama3"
    assert base == "http://localhost:11434"
    assert has_key is True

@patch.dict("os.environ", {"GEMINI_API_KEY": "gemini-env-123"})
def test_resolve_llm_config_autodetect_gemini(mock_settings):
    mock_settings.llm_provider = ""
    mock_settings.gemini_api_key = ""
    mock_settings.openai_api_key = ""
    mock_settings.anthropic_api_key = ""
    
    provider, model, base, key, has_key = resolve_llm_config()
    assert provider == "gemini"
    assert model == "gemini/gemini-1.5-flash"
    assert key == "gemini-env-123"
    assert has_key is True

def test_resolve_llm_config_none(mock_settings):
    mock_settings.llm_provider = ""
    mock_settings.gemini_api_key = ""
    mock_settings.openai_api_key = ""
    mock_settings.anthropic_api_key = ""
    with patch.dict("os.environ", {}, clear=True):
        provider, model, base, key, has_key = resolve_llm_config()
        assert provider == "none"
        assert has_key is False

def test_escape_raw_control_chars_in_json_strings():
    s = '{"desc": "hello\nworld\ttest\r"}'
    escaped = escape_raw_control_chars_in_json_strings(s)
    assert "\\n" in escaped
    assert "\\t" in escaped
    assert "\\r" in escaped

def test_repair_truncated_json():
    # Simple truncated object
    s = '{"recommendations": [{"cluster_id": 0, "name": "Chill"'
    repaired = repair_truncated_json(s)
    assert repaired.endswith("}]}")
    json.loads(repaired) # verify it's valid JSON now

def test_extract_recommendations_and_assignments():
    content = """
    ```json
    {
      "recommendations": [{"cluster_id": 0, "playlist_name": "Ambient"}],
      "assignments": {"0": 0, "1": 0}
    }
    ```
    """
    recs, assigns = extract_recommendations_and_assignments(content)
    assert len(recs) == 1
    assert recs[0]["playlist_name"] == "Ambient"
    assert assigns == {"0": 0, "1": 0}

def test_extract_recommendations_and_assignments_fallback_regex():
    content = 'some junk here {"cluster_id": 0, "playlist_name": "Vibe 1"} "0": 0, "1": 0 junk'
    recs, assigns = extract_recommendations_and_assignments(content)
    assert len(recs) == 1
    assert recs[0]["playlist_name"] == "Vibe 1"
    assert assigns == {"0": 0, "1": 0}

def test_llm_semantic_splitter_metadata():
    splitter = LlmSemanticSplitter()
    assert splitter.name == "AI Semantic Splitting"
    assert "language models" in splitter.description
    assert "cultural references" in splitter.help_text

@patch("app.analysis.processors.vibe_splitters.llm.resolve_llm_config")
def test_llm_semantic_splitter_inactive_error(mock_resolve):
    mock_resolve.return_value = ("none", "none", None, None, False)
    splitter = LlmSemanticSplitter()
    with pytest.raises(LlmSplitterError, match="credentials are missing"):
        splitter.split(pd.DataFrame(), pd.DataFrame(), np.array([]), 2, {})

@patch("app.analysis.processors.vibe_splitters.llm.resolve_llm_config")
@patch("app.analysis.processors.vibe_splitters.llm.cache")
@patch("app.analysis.processors.vibe_splitters.llm.compute_pca_coords")
def test_llm_semantic_splitter_cache_hit(mock_pca, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = {
        "labels": [0, 1],
        "recommendations": [{"cluster_id": 0, "playlist_name": "Cached Vibe"}]
    }
    mock_pca.return_value = ([0.1, 0.2], [0.3, 0.4])
    
    tracks_df = pd.DataFrame([
        {"id": "t1", "name": "Song 1", "artists": []},
        {"id": "t2", "name": "Song 2", "artists": []}
    ])
    features_df = pd.DataFrame([
        {"id": "t1"}, {"id": "t2"}
    ])
    X = np.zeros((2, 7))
    context = {}
    
    splitter = LlmSemanticSplitter()
    labels, x_c, y_c, recs = splitter.split(tracks_df, features_df, X, 2, context)
    
    assert list(labels) == [0, 1]
    assert recs == [{"cluster_id": 0, "playlist_name": "Cached Vibe"}]
    assert context["llm_recommendations"] == recs
    assert context["llm_provider"] == "openai"

@patch("app.analysis.processors.vibe_splitters.llm.resolve_llm_config")
@patch("app.analysis.processors.vibe_splitters.llm.cache")
@patch("app.analysis.processors.vibe_splitters.llm.compute_pca_coords")
@patch("app.analysis.processors.vibe_splitters.llm.litellm")
def test_llm_semantic_splitter_completion_success(mock_litellm, mock_pca, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = None
    mock_pca.return_value = ([0.1, 0.2], [0.3, 0.4])
    
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps({
        "recommendations": [
            {"cluster_id": 0, "playlist_name": "Pop Vibe", "description": "desc", "vibe_explanation": "exp"},
            {"cluster_id": 1, "playlist_name": "Rock Vibe", "description": "desc", "vibe_explanation": "exp"}
        ],
        "assignments": {"0": 0, "1": 1}
    })
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_litellm.completion.return_value = mock_response
    
    tracks_df = pd.DataFrame([
        {"id": "t1", "name": "Song 1", "artists": []},
        {"id": "t2", "name": "Song 2", "artists": []}
    ])
    features_df = pd.DataFrame([
        {"id": "t1"}, {"id": "t2"}
    ])
    X = np.zeros((2, 7))
    context = {}
    
    splitter = LlmSemanticSplitter()
    labels, x_c, y_c, recs = splitter.split(tracks_df, features_df, X, 2, context)
    
    assert list(labels) == [0, 1]
    assert len(recs) == 2
    assert recs[0]["playlist_name"] == "Pop Vibe"
    mock_cache.set_llm_recommendations.assert_called_once()

@patch("app.analysis.processors.vibe_splitters.llm.resolve_llm_config")
@patch("app.analysis.processors.vibe_splitters.llm.cache")
@patch("app.analysis.processors.vibe_splitters.llm.litellm")
def test_llm_semantic_splitter_completion_parse_failure(mock_litellm, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = None
    
    # liteLLM returns junk with no parseable recommendations
    mock_choice = MagicMock()
    mock_choice.message.content = "complete gibberish with no json"
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_litellm.completion.return_value = mock_response
    
    tracks_df = pd.DataFrame([{"id": "t1", "name": "Song 1", "artists": []}])
    features_df = pd.DataFrame([{"id": "t1"}])
    X = np.zeros((1, 7))
    
    splitter = LlmSemanticSplitter()
    with pytest.raises(LlmSplitterError, match="Failed to parse valid recommendations"):
        splitter.split(tracks_df, features_df, X, 2, {})

@patch("app.analysis.processors.vibe_splitters.llm.resolve_llm_config")
@patch("app.analysis.processors.vibe_splitters.llm.cache")
@patch("app.analysis.processors.vibe_splitters.llm.litellm")
def test_llm_semantic_splitter_completion_generic_exception(mock_litellm, mock_cache, mock_resolve):
    mock_resolve.return_value = ("openai", "gpt-4o-mini", None, "key", True)
    mock_cache.get_llm_recommendations.return_value = None
    mock_litellm.completion.side_effect = Exception("LiteLLM crashed")
    
    tracks_df = pd.DataFrame([{"id": "t1", "name": "Song 1", "artists": []}])
    features_df = pd.DataFrame([{"id": "t1"}])
    X = np.zeros((1, 7))
    
    splitter = LlmSemanticSplitter()
    with pytest.raises(LlmSplitterError, match="Semantic Split completion failed"):
        splitter.split(tracks_df, features_df, X, 2, {})
