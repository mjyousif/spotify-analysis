import os
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)

def reset_settings(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "")
    monkeypatch.setattr(settings, "llm_model", "")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "lm_studio_api_base", "")
    monkeypatch.setattr(settings, "ollama_api_base", "")

def test_get_llm_config_none(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is False
    assert data["llm_provider"] == "none"
    assert data["llm_model"] == "none"

def test_get_llm_config_lm_studio(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setattr(settings, "llm_provider", "lm_studio")
    monkeypatch.setattr(settings, "llm_model", "local-model-qwen")
    monkeypatch.setattr(settings, "lm_studio_api_base", "http://localhost:1234/v1")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "lm_studio"
    assert data["llm_model"] == "lm_studio/local-model-qwen"
    assert data["api_base"] == "http://localhost:1234/v1"

def test_get_llm_config_ollama(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_api_base", "http://localhost:11434")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "ollama"
    assert data["llm_model"] == "ollama/llama3"  # default when model override is empty

def test_get_llm_config_gemini_valid(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "AIzaSyValidKeyHere123")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "gemini"
    assert data["llm_model"] == "gemini/gemini-1.5-flash"

def test_get_llm_config_gemini_invalid_placeholder(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "your_gemini_api_key_here")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is False

def test_get_llm_config_openai(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "sk-proj-validkey")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "openai"
    assert data["llm_model"] == "gpt-4o-mini"

def test_get_llm_config_anthropic(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-validkey")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "anthropic"
    assert data["llm_model"] == "anthropic/claude-3-haiku-20240307"

def test_get_llm_config_autodetect_gemini(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaSyValidEnvKey")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "gemini"

def test_get_llm_config_autodetect_openai(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-proj-envkey")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "openai"

def test_get_llm_config_autodetect_anthropic(monkeypatch):
    reset_settings(monkeypatch)
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-envkey")

    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert data["llm_active"] is True
    assert data["llm_provider"] == "anthropic"

def test_get_documentation():
    response = client.get("/api/config/documentation")
    assert response.status_code == 200
    data = response.json()
    assert "algorithms" in data
    assert "projections" in data
    assert "kmeans" in data["algorithms"]
    assert "pca" in data["projections"]
