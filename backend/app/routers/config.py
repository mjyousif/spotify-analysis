import os
from fastapi import APIRouter
from app.config import settings

router = APIRouter(prefix="/api/config", tags=["Configuration"])

def is_valid_key(key: str) -> bool:
    if not key:
        return False
    key_stripped = key.strip()
    if key_stripped.lower() in (
        "", "none", "null", "false", "placeholder",
        "your_openai_api_key_here",
        "your_gemini_api_key_here",
        "your_anthropic_api_key_here",
        "your_reccobeats_api_key_here"
    ) or key_stripped.startswith("your_"):
        return False
    return True

@router.get("/llm")
def get_llm_config():
    """
    Returns the current configuration status of the LLM module.
    """
    provider = settings.llm_provider.lower().strip() if settings.llm_provider else ""
    model_override = settings.llm_model.strip() if settings.llm_model else ""
    
    # Check if a provider is configured and valid
    has_llm_key = False
    actual_model = ""
    api_base = ""

    if provider:
        if provider == "lm_studio":
            has_llm_key = True
            api_base = settings.lm_studio_api_base
            actual_model = f"lm_studio/{model_override}" if model_override else "lm_studio/local-model"
        elif provider == "ollama":
            has_llm_key = True
            api_base = settings.ollama_api_base
            actual_model = f"ollama/{model_override}" if model_override else "ollama/llama3"
        elif provider == "gemini":
            key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
            has_llm_key = is_valid_key(key)
            actual_model = f"gemini/{model_override}" if model_override else "gemini/gemini-1.5-flash"
        elif provider == "openai":
            key = settings.openai_api_key or os.environ.get("OPENAI_API_KEY", "")
            has_llm_key = is_valid_key(key)
            actual_model = model_override if model_override else "gpt-4o-mini"
        elif provider == "anthropic":
            key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")
            has_llm_key = is_valid_key(key)
            actual_model = f"anthropic/{model_override}" if model_override else "anthropic/claude-3-haiku-20240307"
    else:
        # Auto-detect
        gemini_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        openai_key = settings.openai_api_key or os.environ.get("OPENAI_API_KEY", "")
        anthropic_key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")

        if is_valid_key(gemini_key):
            provider = "gemini"
            actual_model = "gemini/gemini-1.5-flash"
            has_llm_key = True
        elif is_valid_key(openai_key):
            provider = "openai"
            actual_model = "gpt-4o-mini"
            has_llm_key = True
        elif is_valid_key(anthropic_key):
            provider = "anthropic"
            actual_model = "anthropic/claude-3-haiku-20240307"
            has_llm_key = True
        else:
            provider = "none"
            actual_model = "none"
            has_llm_key = False

    return {
        "llm_active": has_llm_key,
        "llm_provider": provider or "none",
        "llm_model": actual_model or "none",
        "api_base": api_base or None
    }
