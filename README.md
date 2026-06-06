# Spotify Playlist Vibe Splitter & Analyzer

An interactive web application that analyzes the acoustic features of your Spotify playlists, clusters songs with machine learning based on their "vibe" (tempo, energy, valence, acousticness), and recommends how to split them into cohesive, vibe-matched playlists.

## Key Features
- **Acoustic Clustering**: Normalizes features and uses K-Means clustering to separate tracks.
- **PCA Similarity Canvas**: Visualizes tracks on a 2D interactive scatter plot using Plotly.js (clicking a track plays a 30-second preview and shows its acoustic fingerprint).
- **Alternative Audio Features**: Uses the **ReccoBeats API** as a replacement for Spotify's deprecated `/v1/audio-features` endpoint.
- **LLM Playlist Recommendations**: Uses **LiteLLM** (supporting OpenAI, Anthropic, Gemini, or Ollama) to analyze the audio profile of each cluster and suggest creative playlist names and descriptions.
- **Direct Export**: Batch-creates new split playlists on your Spotify profile with a single click.
- **Modular Dashboard Grid**: Built with modular components (Widgets) on the frontend and an extensible processor pipeline on the backend.

---

## Project Structure

```text
spotify-analysis/
├── docs/
│   └── Spec-1.md            # Detailed technical specification
├── backend/                 # FastAPI (Python 3.10+) Backend
│   ├── app/
│   │   ├── main.py          # FastAPI application & API endpoints
│   │   ├── config.py        # Settings loader
│   │   ├── services/        # Third-party integrations (Spotify, ReccoBeats)
│   │   └── analysis/        # Modular analysis engine & processors
│   ├── requirements.txt     # Python dependencies
│   ├── config.yaml          # LiteLLM configuration file
│   └── .env                 # Environment secrets
└── frontend/                # React (Vite + TS + Tailwind v4) Frontend
    ├── src/
    │   ├── components/      # UI Layout, grids, and dashboard widgets
    │   ├── services/        # Axios API wrapper & PKCE OAuth helper
    │   ├── App.tsx          # Main view router & audio preview controller
    │   └── index.css        # Tailwind directives
    └── package.json         # Node dependencies
```

---

## Getting Started

### Prerequisites
1. **Spotify Developer Account**:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
   - Create an app. Set **Redirect URI** to `http://[::1]:5173/callback`.
   - Copy your **Client ID** and **Client Secret**.
2. **ReccoBeats API Key (Optional)**:
   - Go to [ReccoBeats](https://reccobeats.com) to register an API key for retrieving track acoustics.
   - *Note: If no key is set or the API is unavailable, the application gracefully degrades to generating realistic mock-features so you can still test it out.*
3. **LLM Provider / Local LLM (Optional)**:
   - Configure a cloud provider (e.g. Gemini, OpenAI, Anthropic) or connect a local LLM running via **LM Studio** or **Ollama**.
   - *Note: If no LLM provider is active, the engine falls back to a high-quality rules-based categorization engine.*

---

## Installation & Setup

### 1. Configure the Backend
1. Copy the `.env` template or create a `backend/.env` file:
   ```bash
   cd backend
   # Open/edit the .env file and fill in your keys:
   ```
   **`backend/.env` contents:**
   ```env
   SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
   SPOTIFY_REDIRECT_URI=http://[::1]:5173/callback

   # Optional API keys:
   RECCOBEATS_API_KEY=your_reccobeats_api_key_here

   # LLM selection: gemini, openai, anthropic, lm_studio, or ollama
   LLM_PROVIDER=lm_studio
   LLM_MODEL=your-local-model-id  # Optional model override

   # API Keys (required for cloud providers):
   GEMINI_API_KEY=your_gemini_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

### 2. Run the Backend (FastAPI)
We recommend using **`uv`** (a fast Python package installer and runner) to install dependencies and run the server.

```bash
cd backend
# 1. Create a virtual environment
uv venv

# 2. Install dependencies
uv pip install -r requirements.txt

# 3. Start the FastAPI server (Port 8000)
.venv\Scripts\uvicorn app.main:app --reload
```
*Verify the backend is active at [http://localhost:8000/health](http://localhost:8000/health) or explore endpoints at [http://localhost:8000/docs](http://localhost:8000/docs).*

### 3. Run the Frontend (React)
```bash
cd frontend
# 1. Install npm packages
npm install

# 2. Start the Vite development server (Port 5173)
npm run dev
```
*Open [http://localhost:5173](http://localhost:5173) in your browser to start splitting your playlists!*
*(If VITE_SPOTIFY_CLIENT_ID is not set in your env, the landing page will prompt you to paste it in directly, saving it locally in your browser).*

---

## Modularity & Extensibility

The application is structured to be extensible for adding new analysis types (e.g. lyric sentiment, music decades distribution, etc.) as the project grows:

### Extending Backend Analysis Pipeline
To add a new analysis feature, create a class subclassing `BaseAnalysisProcessor` inside `backend/app/analysis/processors/` and register it inside `pipeline.py`:
```python
from app.analysis.processors.base import BaseAnalysisProcessor

class DecadesDistributionProcessor(BaseAnalysisProcessor):
    def process(self, tracks_df, features_df, context):
        # Calculate release decades from tracks_df metadata
        decades = tracks_df['album'].apply(lambda x: get_decade(x['release_date']))
        return {"decades_distribution": decades.value_counts().to_dict()}
```

### Extending Frontend Dashboard Widgets
To add a new widget on the frontend:
1. Build your widget component under `frontend/src/components/Dashboard/`.
2. Connect it to the analysis payload inside `App.tsx` (the dashboard grid renders components dynamically. If the backend omits the analysis key in the JSON, the widget hides itself).
