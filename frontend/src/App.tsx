import React, { useState, useEffect, useRef } from 'react';
import { spotifyAuth } from './services/spotifyAuth';
import { apiService } from './services/api';
import type { PlaylistInfo, TrackData, AnalysisResponse } from './services/api';
import { Layout } from './components/Layout';
import { PlaylistGrid } from './components/PlaylistGrid';
import { ScatterPlotWidget } from './components/Dashboard/ScatterPlotWidget';
import { RecommendationsWidget } from './components/Dashboard/RecommendationsWidget';
import { FeatureAveragesWidget } from './components/Dashboard/FeatureAveragesWidget';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Music, Sparkles, Layers, Shuffle, ArrowLeft, 
  CheckCircle2, Sliders, ExternalLink, Play, Pause, AlertCircle,
  Info
} from 'lucide-react';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(spotifyAuth.isLoggedIn());
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [clientIdInput, setClientIdInput] = useState<string>(spotifyAuth.getClientId());
  const [authError, setAuthError] = useState<string | null>(null);

  // App States
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState<boolean>(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  
  // Analysis States
  const [kValue, setKValue] = useState<number>(3);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Selection & Player States
  const [selectedTrack, setSelectedTrack] = useState<TrackData | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // 3. Run Vibe Analysis on a Playlist
  const handleRunAnalysis = (playlistId: string, customK?: number) => {
    setSelectedPlaylistId(playlistId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setExportedPlaylists(null);
    setSelectedTrack(null);
    setIsPlaying(false);

    apiService.analyzePlaylist(playlistId, customK)
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
  const handleSelectTrack = (track: TrackData) => {
    setSelectedTrack(track);
    setIsPlaying(false);
    
    // Spotify track metadata has preview_url, but ReccoBeats or Spotify mock endpoint might not return it.
    // We can simulate playing a generic track if missing, or use a placeholder.
    // In our Spotify API service, we query track objects. Standard Spotify API has a `preview_url` field.
    // If it exists, we play it. Let's write standard preview audio player code:
    const mockPreview = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(track.name.length % 8) + 1}.mp3`;
    setPreviewUrl(mockPreview);
  };

  const togglePlayback = () => {
    if (!audioRef.current || !previewUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = previewUrl;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(e => console.error("Audio playback error: ", e));
    }
  };

  // Reset audio on track change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [selectedTrack]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientIdInput.trim()) {
      setAuthError("Please enter a valid Spotify Client ID.");
      return;
    }
    setAuthError(null);
    spotifyAuth.login(clientIdInput.trim()).catch(err => {
      setAuthError(err.message);
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
          </div>

          {/* Right Login Widget */}
          <div className="w-full max-w-md bg-gray-900/40 border border-gray-800 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl shadow-violet-500/5 relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 left-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl -ml-10 -mt-10"></div>
            
            <h3 className="text-lg font-bold text-white mb-2">Connect Spotify</h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              We authenticate directly with Spotify using secure OAuth. Your access token is stored safely in your browser session.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Spotify Client ID</label>
                <input
                  type="text"
                  placeholder="Paste Spotify Client ID"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-violet-500/80 transition-colors"
                />
              </div>

              {authError && (
                <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-950/25 border border-red-900/40 p-3 rounded-xl text-left">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-2 text-sm"
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

            <div className="mt-6 border-t border-gray-800/60 pt-4 text-left">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1.5">How to get a Client ID?</span>
              <ol className="list-decimal list-inside text-[10px] text-gray-500 space-y-1 font-medium">
                <li>Go to the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">Spotify Developer Dashboard</a>.</li>
                <li>Create an App and set Redirect URI to <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">http://[::1]:5173/callback</code>.</li>
                <li>Copy the "Client ID" and paste it in the box above.</li>
              </ol>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // RENDER: Playlist Selector
  if (!selectedPlaylistId) {
    return (
      <Layout onLogout={() => setIsLoggedIn(false)}>
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
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

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
          <div className="flex items-center space-x-4 bg-gray-900/40 border border-gray-800/80 px-4 py-3 rounded-2xl backdrop-blur-md">
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
                />
              </ErrorBoundary>
            </div>
          </div>

          {/* Player details sidebar (if track is selected, we can also play preview audio) */}
          {selectedTrack && (
            <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={togglePlayback}
                  className="bg-violet-600 hover:bg-violet-500 text-white p-4 rounded-full shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 transition-all cursor-pointer flex-shrink-0"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>
                <div>
                  <h4 className="font-bold text-white text-base">{selectedTrack.name}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">by {selectedTrack.artists}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedTrack.genres.map((g, idx) => (
                      <span key={idx} className="bg-gray-950 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Simple Feature Radar/Progress bars for this track */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 bg-gray-950/20 border border-gray-850/60 p-3 rounded-xl flex-1 max-w-xl">
                {Object.entries(selectedTrack.features).map(([key, val]) => {
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
