import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, config, playlists, analysis

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="Spotify Playlist Vibe Analyzer API",
    description="Backend service for analyzing and splitting Spotify playlists based on audio features.",
    version="1.0.0"
)

# CORS configuration
import os
origins_env = os.getenv("CORS_ALLOWED_ORIGINS")
if origins_env:
    if origins_env.strip() == "*":
        allow_origins = ["*"]
    else:
        allow_origins = [o.strip() for o in origins_env.split(",") if o.strip()]
else:
    allow_origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(config.router)
app.include_router(playlists.router)
app.include_router(analysis.router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "spotify-vibe-analyzer"}
