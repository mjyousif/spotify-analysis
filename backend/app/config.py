import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://[::1]:5173/callback"
    
    reccobeats_api_key: str = ""
    
    # LiteLLM model configs
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
