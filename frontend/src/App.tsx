import React, { useState, useEffect, useCallback } from 'react';
import { spotifyAuth } from './services/spotifyAuth';
import { apiService } from './services/api';
import type { PlaylistInfo, TrackData, AnalysisResponse } from './services/api';
import { Layout } from './components/Layout';
import { PlaylistGrid } from './components/PlaylistGrid';
import { ScatterPlotWidget } from './components/Dashboard/ScatterPlotWidget';
import { RecommendationsWidget } from './components/Dashboard/RecommendationsWidget';
import { FeatureAveragesWidget } from './components/Dashboard/FeatureAveragesWidget';
import { TasteProfileWidget } from './components/Dashboard/TasteProfileWidget';
import { DJDeckWidget } from './components/Dashboard/DJDeckWidget';
import { EraTimelineWidget } from './components/Dashboard/EraTimelineWidget';
import { ErrorBoundary } from './components/ErrorBoundary';

const LyricSentimentWidget = React.lazy(() => import('./components/Dashboard/LyricSentimentWidget').then(m => ({ default: m.LyricSentimentWidget })));
import { 
  Music, Sparkles, Layers, Shuffle, ArrowLeft, 
  CheckCircle2, Sliders, ExternalLink, AlertCircle,
  Info
} from 'lucide-react';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(spotifyAuth.isLoggedIn());
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // App States
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState<boolean>(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  
  // Analysis States
  const [kValue, setKValue] = useState<number>(3);
  const [algorithm, setAlgorithm] = useState<'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic'>('kmeans');
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [llmConfig, setLlmConfig] = useState<{ llm_active: boolean; llm_provider: string; llm_model: string } | null>(null);

  // Selection State
  const [selectedTrack, setSelectedTrack] = useState<TrackData | null>(null);
  const [loadSpotifyEmbed, setLoadSpotifyEmbed] = useState<boolean>(false);

  // Reset Spotify embed loader on track change to prevent focus stealing on click
  useEffect(() => {
    setLoadSpotifyEmbed(false);
  }, [selectedTrack]);

  // Success Export State
  const [exportedPlaylists, setExportedPlaylists] = useState<
    Array<{ playlist_id: string; name: string; track_count: number }> | null
  >(null);

  // 1. Handle OAuth Callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      setAuthLoading(true);
      spotifyAuth.handleCallback(code)
        .then(() => {
          setIsLoggedIn(true);
          window.history.replaceState({}, document.title, window.location.pathname); // clear params
        })
        .catch(err => {
          console.error(err);
          setAuthError(err.message || "Failed to log in with Spotify.");
        })
        .finally(() => {
          setAuthLoading(false);
        });
    }
  }, []);

  // 2. Load Playlists if logged in
  useEffect(() => {
    if (isLoggedIn) {
      setPlaylistsLoading(true);
      apiService.getPlaylists()
        .then(data => {
          setPlaylists(data);
        })
        .catch(err => {
          console.error(err);
          // If token expired, log out
          if (err.response?.status === 401) {
            spotifyAuth.logout();
            setIsLoggedIn(false);
          }
        })
        .finally(() => {
          setPlaylistsLoading(false);
        });
    }
  }, [isLoggedIn]);

  // Fetch LLM configuration status on login status change
  useEffect(() => {
    if (isLoggedIn) {
      apiService.getLlmConfig()
        .then(data => {
          setLlmConfig(data);
        })
        .catch(err => {
          console.error("Error fetching LLM config:", err);
        });
    }
  }, [isLoggedIn]);

  // Verify that Spotify is configured on the backend
  const [isBackendConfigured, setIsBackendConfigured] = useState<boolean>(true);
  useEffect(() => {
    if (!isLoggedIn) {
      apiService.getLoginUrl()
        .then(() => {
          setIsBackendConfigured(true);
        })
        .catch(err => {
          console.error("Spotify credentials check failed:", err);
          setIsBackendConfigured(false);
          setAuthError("Spotify Client ID & Secret are not configured in backend/.env. Please configure them on the backend server to enable login.");
        });
    }
  }, [isLoggedIn]);

  // 3. Run Vibe Analysis on a Playlist
  const handleRunAnalysis = (playlistId: string, customK?: number, customAlgo?: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic') => {
    setSelectedPlaylistId(playlistId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setExportedPlaylists(null);
    setSelectedTrack(null);

    const algoToUse = customAlgo !== undefined ? customAlgo : algorithm;

    apiService.analyzePlaylist(playlistId, customK, algoToUse)
      .then(data => {
        setAnalysisData(data);
        if (customK === undefined && data.recommended_k) {
          setKValue(data.recommended_k);
        }
        if (data.tracks.length > 0) {
          setSelectedTrack(data.tracks[0]);
        }
      })
      .catch(err => {
        console.error(err);
        setAnalysisError(err.response?.data?.detail || err.message || "Failed to analyze playlist.");
      })
      .finally(() => {
        setAnalysisLoading(false);
      });
  };

  // 4. Handle Preview Audio Controls
  // useCallback with [] so this function reference NEVER changes across re-renders.
  // A new reference would propagate into ScatterPlotWidget and cause Plotly to
  // re-render its chart, detaching the internal click listeners mid-session.
  const handleSelectTrack = useCallback((track: TrackData) => {
    setSelectedTrack(track);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    spotifyAuth.login()
      .catch(err => {
        setAuthError(err.message || "Failed to initiate Spotify login.");
      })
      .finally(() => {
        setAuthLoading(false);
      });
  };

  // RENDER: Login landing page
  if (!isLoggedIn) {
    return (
      <Layout showLogout={false} onLogout={() => {}}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 py-10">
          
          {/* Left Text Pitch */}
          <div className="flex-1 space-y-6 text-left max-w-xl">
            <div className="inline-flex items-center space-x-2 bg-violet-500/10 border border-violet-500/20 px-3.5 py-1.5 rounded-full text-xs text-violet-400 font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 fill-violet-400/20" />
              <span>Smart Playlist Curation</span>
            </div>
            
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-[1.1]">
              Unclutter Your Playlists. <br />
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent">
                Match the Vibes.
              </span>
            </h2>
            
            <p className="text-gray-400 text-base leading-relaxed">
              Vibe Splitter analyzes your Spotify playlist's acoustic DNA—tempo, energy, valence, and genres. It clusters similar songs using machine learning and splits them into distinct, cohesive playlists. No more jarring transitions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-start space-x-3 p-3 bg-gray-900/30 border border-gray-850 rounded-xl">
                <Layers className="w-5 h-5 text-violet-400 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-gray-200">Acoustic Clustering</h4>
                  <p className="text-[10px] text-gray-550 mt-0.5">Analyze tracks based on BPM, energy, valence, and genre tags.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 bg-gray-900/30 border border-gray-850 rounded-xl">
                <Shuffle className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-gray-200">Interactive Split Mapping</h4>
                  <p className="text-[10px] text-gray-550 mt-0.5">Plot playlists on a 2D canvas and rename vibe splits prior to export.</p>
                </div>
              </div>
            </div>
          </div>          {/* Right Login Widget */}
          <div className="w-full max-w-md bg-gray-900/40 border border-gray-800 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl shadow-violet-500/5 relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 left-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl -ml-10 -mt-10"></div>
            
            <h3 className="text-lg font-bold text-white mb-2">Connect Spotify</h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              We authenticate securely via Spotify OAuth. Once connected, you can import and split your playlists directly.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              {authError && (
                <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-950/25 border border-red-900/40 p-3 rounded-xl text-left">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="leading-relaxed">{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading || !isBackendConfigured}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-2 text-sm"
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Music className="w-4 h-4" />
                    <span>Login with Spotify Account</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  // RENDER: Playlist Selector
  if (!selectedPlaylistId) {
    return (
      <Layout onLogout={() => setIsLoggedIn(false)}>
        {llmConfig && (
          <div className="mb-6 flex items-center justify-between p-4 bg-gray-900/20 border border-gray-850 rounded-2xl animate-fadeIn">
            <div className="flex items-center space-x-3">
              <div className={`p-2.5 rounded-xl ${llmConfig.llm_active ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-bold text-white">
                  {llmConfig.llm_active ? 'AI Vibe Engine Active' : 'AI Vibe Engine Standby'}
                </h4>
                <p className="text-[10px] text-gray-500 mt-0.5 font-medium leading-relaxed text-left">
                  {llmConfig.llm_active 
                    ? `Powered by ${llmConfig.llm_provider.replace('_', ' ')} (${llmConfig.llm_model && llmConfig.llm_model.includes('/') ? llmConfig.llm_model.split('/')[1] : llmConfig.llm_model || 'default'})`
                    : 'Setup local LLM (LM Studio / Ollama) or cloud API keys to enable automatic, creative playlist descriptors.'}
                </p>
              </div>
            </div>
            {llmConfig.llm_active ? (
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline-block">
                Online
              </span>
            ) : (
              <span className="text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline-block">
                Offline Mode
              </span>
            )}
          </div>
        )}
        <PlaylistGrid
          playlists={playlists}
          onSelectPlaylist={handleRunAnalysis}
          loading={playlistsLoading}
        />
      </Layout>
    );
  }

  // RENDER: Analysis Workbench / Loading States
  const currentPlaylist = playlists.find(p => p.id === selectedPlaylistId);
  const playlistName = currentPlaylist ? currentPlaylist.name : "Playlist";

  return (
    <Layout onLogout={() => setIsLoggedIn(false)}>
      {/* Workbench Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSelectedPlaylistId(null)}
            className="p-2.5 bg-gray-900/60 border border-gray-800 hover:border-gray-700 hover:text-white rounded-xl text-gray-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2 text-xs text-gray-500 font-medium">
              <span>Playlists</span>
              <span>/</span>
              <span className="truncate max-w-[120px]">{playlistName}</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Analysis: {playlistName}
            </h2>
          </div>
        </div>

        {/* Cluster / Split Controller */}
        {analysisData && (
          <div className="flex flex-wrap items-center gap-4 bg-gray-900/40 border border-gray-800/80 px-4 py-3 rounded-2xl backdrop-blur-md">
            {/* Algorithm Select */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 font-bold">Algorithm:</span>
              <select
                value={algorithm}
                onChange={(e) => {
                  const val = e.target.value as 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic';
                  setAlgorithm(val);
                  handleRunAnalysis(selectedPlaylistId!, val === 'dbscan' ? undefined : kValue, val);
                }}
                className="bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1 text-xs text-gray-250 font-bold focus:outline-none focus:border-violet-500 transition-colors"
              >
                <option value="kmeans">K-Means (Balanced)</option>
                <option value="agglomerative">Hierarchical (Deterministic)</option>
                <option value="dbscan">DBSCAN (Outliers Filter)</option>
                <option value="mood_mapping">Mood Mapping (2D Circumplex)</option>
                <option value="genre_first">Genre-First Hierarchical</option>
                <option value="llm_semantic">AI Semantic Splitting</option>
              </select>
            </div>

            {/* Split controls if not DBSCAN */}
            {algorithm !== 'dbscan' && (
              <div className="flex items-center space-x-4 border-l border-gray-800/80 pl-4">
                <div className="flex items-center space-x-2 text-xs text-gray-400 font-bold">
                  <Sliders className="w-4 h-4 text-violet-400" />
                  <span>Splits:</span>
                </div>
                <div className="flex items-center space-x-2 relative group">
                  <input
                    type="range"
                    min="2"
                    max="6"
                    value={kValue}
                    onChange={(e) => setKValue(parseInt(e.target.value))}
                    className="w-36 h-2 bg-transparent rounded-lg cursor-pointer"
                  />
                  {analysisData.recommended_k && (
                    <div className="relative flex items-center">
                      <Info className="w-3.5 h-3.5 text-gray-450 hover:text-violet-400 cursor-pointer transition-colors" />
                      <div className="absolute bottom-full mb-2.5 right-1/2 translate-x-1/2 hidden group-hover:block w-48 bg-gray-950/95 border border-gray-800 text-[10px] text-gray-300 p-2.5 rounded-xl shadow-xl z-20 text-center leading-normal backdrop-blur-sm">
                        {analysisData.recommended_k} vibes might be a good fit but you can change it.
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-xs font-bold text-white min-w-[50px]">{kValue} vibes</span>
                <button
                  onClick={() => handleRunAnalysis(selectedPlaylistId, kValue)}
                  disabled={analysisLoading}
                  className="bg-violet-650 hover:bg-violet-500 disabled:bg-violet-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  Update Map
                </button>
              </div>
            )}
            
            {algorithm === 'dbscan' && (
              <div className="flex items-center space-x-2 border-l border-gray-800/80 pl-4">
                <span className="text-xs font-semibold text-gray-450 italic bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-850">
                  Vibes auto-calculated ({analysisData.clusters.filter(c => c.cluster_id !== -1).length} vibes)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Analysis Screen */}
      {analysisLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Running Clustering Engine</h3>
            <p className="text-xs text-gray-500 mt-1 animate-pulse">Fetching track audio features & consulting LLM...</p>
          </div>
        </div>
      ) : analysisError ? (
        <div className="max-w-md mx-auto text-center py-16 bg-red-950/10 border border-red-900/30 rounded-2xl p-6">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-white font-bold text-lg">Analysis Failed</h3>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">{analysisError}</p>
          <button
            onClick={() => handleRunAnalysis(selectedPlaylistId)}
            className="mt-6 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 font-bold px-5 py-2.5 rounded-xl text-xs transition-colors"
          >
            Retry Analysis
          </button>
        </div>
      ) : analysisData ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Interactive Graph Widget */}
            <div className="lg:col-span-5 flex flex-col">
              <ErrorBoundary name="Similarity Map">
                <ScatterPlotWidget
                  tracks={analysisData.tracks}
                  clusters={analysisData.clusters}
                  recommendations={analysisData.recommendations}
                  selectedTrack={selectedTrack}
                  onSelectTrack={handleSelectTrack}
                />
              </ErrorBoundary>
            </div>

            {/* Recommendations Tabs Widget */}
            <div className="lg:col-span-7 flex flex-col">
              <ErrorBoundary name="Recommendations Widget">
                <RecommendationsWidget
                  tracks={analysisData.tracks}
                  clusters={analysisData.clusters}
                  recommendations={analysisData.recommendations}
                  onExportSuccess={setExportedPlaylists}
                  llm_active={analysisData.llm_active}
                  llm_provider={analysisData.llm_provider}
                  llm_model={analysisData.llm_model}
                  selectedTrack={selectedTrack}
                  onSelectTrack={handleSelectTrack}
                />
              </ErrorBoundary>
            </div>
          </div>          {/* Player details sidebar (with Spotify Embed player) */}
          {selectedTrack && (
            <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 flex flex-col lg:flex-row items-stretch justify-between gap-6">
              {/* Spotify Embed Player & Genre Tags */}
              <div className="flex flex-col justify-between gap-3 w-full lg:max-w-md">
                {loadSpotifyEmbed ? (
                  <iframe
                    src={`https://open.spotify.com/embed/track/${selectedTrack.id}?utm_source=generator&theme=0`}
                    width="100%"
                    height="80"
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="rounded-xl border-0 bg-transparent"
                  />
                ) : (
                  <div className="flex items-center space-x-4 h-[80px]">
                    <div className="w-16 h-16 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-850">
                      {selectedTrack.album_images && selectedTrack.album_images.length > 0 ? (
                        <img
                          src={selectedTrack.album_images[selectedTrack.album_images.length - 1].url}
                          alt={selectedTrack.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white text-sm truncate">{selectedTrack.name}</h4>
                      <p className="text-xs text-gray-400 truncate">by {selectedTrack.artists}</p>
                    </div>
                    <button
                      onClick={() => setLoadSpotifyEmbed(true)}
                      className="bg-violet-650 hover:bg-violet-550 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-violet-550/10 hover:shadow-violet-550/25 transition-all cursor-pointer flex items-center space-x-1.5 flex-shrink-0"
                    >
                      <Music className="w-3.5 h-3.5" />
                      <span>Play Preview</span>
                    </button>
                  </div>
                )}
                {selectedTrack.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTrack.genres.map((g, idx) => (
                      <span key={idx} className="bg-gray-950 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Simple Feature Radar/Progress bars for this track */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 bg-gray-950/20 border border-gray-850/60 p-4 rounded-xl flex-1 items-center max-w-xl">
                {Object.entries(selectedTrack.features)
                  .filter(([key]) => key !== 'key' && key !== 'mode')
                  .map(([key, val]) => {
                    const label = key.toUpperCase();
                    const pct = key === 'tempo' ? (val / 200) * 100 : val * 100;
                    const displayVal = key === 'tempo' ? `${Math.round(val)} BPM` : `${Math.round(val * 100)}%`;

                    return (
                      <div key={key} className="text-center space-y-1">
                        <span className="text-[8px] text-gray-500 font-bold tracking-wider block">{label}</span>
                        <span className="text-[10px] text-gray-250 font-bold block">{displayVal}</span>
                        <div className="w-full bg-gray-900 h-1 rounded-full overflow-hidden">
                          <div className="bg-violet-500 h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Advanced Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ErrorBoundary name="Taste Profile">
              <TasteProfileWidget tracks={analysisData.tracks} />
            </ErrorBoundary>

            <ErrorBoundary name="Lyrics Sentiment">
              <React.Suspense fallback={
                <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-center items-center h-full min-h-[420px] text-center">
                  <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              }>
                <LyricSentimentWidget
                  playlistId={selectedPlaylistId || ''}
                  tracks={analysisData.tracks}
                  selectedTrack={selectedTrack}
                  onSelectTrack={handleSelectTrack}
                />
              </React.Suspense>
            </ErrorBoundary>
            
            <ErrorBoundary name="DJ Deck Flow">
              <DJDeckWidget tracks={analysisData.tracks} />
            </ErrorBoundary>
            
            <ErrorBoundary name="Era Timeline">
              <EraTimelineWidget tracks={analysisData.tracks} />
            </ErrorBoundary>
          </div>

          {/* Feature distribution/aggregate metrics comparisons */}
          <ErrorBoundary name="Feature Metrics">
            <FeatureAveragesWidget
              clusters={analysisData.clusters}
              recommendations={analysisData.recommendations}
            />
          </ErrorBoundary>
        </div>
      ) : null}

      {/* Export Success Modal */}
      {exportedPlaylists && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl relative">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4 animate-scaleUp" />
            
            <h3 className="text-2xl font-black text-white tracking-tight">Playlists Created!</h3>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              We successfully split your playlist and exported {exportedPlaylists.length} new vibe groupings onto your Spotify account.
            </p>

            <div className="mt-6 space-y-3 bg-gray-950/40 p-4 rounded-2xl border border-gray-850 text-left">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-2">New Playlists</span>
              {exportedPlaylists.map((playlist) => (
                <div key={playlist.playlist_id} className="flex items-center justify-between text-xs py-1">
                  <span className="font-semibold text-gray-200 truncate max-w-[200px]">{playlist.name}</span>
                  <a
                    href={`https://open.spotify.com/playlist/${playlist.playlist_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 text-violet-400 hover:text-violet-300 font-bold"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setExportedPlaylists(null);
                setSelectedPlaylistId(null); // Return to playlist selection
              }}
              className="mt-6 w-full bg-violet-650 hover:bg-violet-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition-colors cursor-pointer text-sm"
            >
              Return to Playlists List
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default App;
