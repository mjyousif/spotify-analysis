from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_llm_config():
    response = client.get("/api/config/llm")
    assert response.status_code == 200
    data = response.json()
    assert "llm_active" in data
    assert "llm_provider" in data
    assert "llm_model" in data

def test_get_documentation():
    response = client.get("/api/config/documentation")
    assert response.status_code == 200
    data = response.json()
    assert "algorithms" in data
    assert "projections" in data
    assert "kmeans" in data["algorithms"]
    assert "pca" in data["projections"]
