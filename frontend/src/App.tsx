import React, { useState, useEffect, useCallback } from 'react';
import { useSpotifyAuth } from './hooks/useSpotifyAuth';
import { apiService } from './services/api';
import type { TrackData, AnalysisResponse } from './services/api';
import { Layout } from './components/Layout';
import { PlaylistGrid } from './components/PlaylistGrid';
import { ScatterPlotWidget } from './components/Dashboard/ScatterPlotWidget';
import { RecommendationsWidget } from './components/Dashboard/RecommendationsWidget';
import { FeatureAveragesWidget } from './components/Dashboard/FeatureAveragesWidget';
import { TasteProfileWidget } from './components/Dashboard/TasteProfileWidget';
import { DJDeckWidget } from './components/Dashboard/DJDeckWidget';
import { EraTimelineWidget } from './components/Dashboard/EraTimelineWidget';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { LLMConfigAlert } from './components/Dashboard/LLMConfigAlert';
import { AnalysisControls } from './components/Dashboard/AnalysisControls';
import { TrackDetailsPlayer } from './components/Dashboard/TrackDetailsPlayer';
import { ExportSuccessModal } from './components/Dashboard/ExportSuccessModal';

const LyricSentimentWidget = React.lazy(() =>
  import('./components/Dashboard/LyricSentimentWidget').then(m => ({
    default: m.LyricSentimentWidget,
  }))
);

import { ArrowLeft, AlertCircle } from 'lucide-react';

function App() {
  const {
    isLoggedIn,
    authLoading,
    authError,
    isBackendConfigured,
    playlists,
    playlistsLoading,
    llmConfig,
    handleLogin,
    logout,
  } = useSpotifyAuth();

  // App / Analysis States
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [kValue, setKValue] = useState<number>(3);
  const [algorithm, setAlgorithm] = useState<
    'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic'
  >('kmeans');
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Feature Influence Weight States (Default to 0.0 for backward-compatible pure audio)
  const [genreWeight, setGenreWeight] = useState<number>(0.0);
  const [eraWeight, setEraWeight] = useState<number>(0.0);
  const [popularityWeight, setPopularityWeight] = useState<number>(0.0);
  const [lyricsWeight, setLyricsWeight] = useState<number>(0.0);

  // Selection State
  const [selectedTrack, setSelectedTrack] = useState<TrackData | null>(null);
  const [loadSpotifyEmbed, setLoadSpotifyEmbed] = useState<boolean>(false);

  // Success Export State
  const [exportedPlaylists, setExportedPlaylists] = useState<
    Array<{ playlist_id: string; name: string; track_count: number }> | null
  >(null);

  // Reset Spotify embed loader on track change to prevent focus stealing on click
  useEffect(() => {
    setLoadSpotifyEmbed(false);
  }, [selectedTrack]);

  // Run Vibe Analysis on a Playlist
  const handleRunAnalysis = (
    playlistId: string,
    customK?: number,
    customAlgo?: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic',
    customGenreWeight?: number,
    customEraWeight?: number,
    customPopularityWeight?: number,
    customLyricsWeight?: number
  ) => {
    setSelectedPlaylistId(playlistId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setExportedPlaylists(null);
    setSelectedTrack(null);

    const algoToUse = customAlgo !== undefined ? customAlgo : algorithm;
    const gWeight = customGenreWeight !== undefined ? customGenreWeight : genreWeight;
    const eWeight = customEraWeight !== undefined ? customEraWeight : eraWeight;
    const pWeight = customPopularityWeight !== undefined ? customPopularityWeight : popularityWeight;
    const lWeight = customLyricsWeight !== undefined ? customLyricsWeight : lyricsWeight;

    apiService.analyzePlaylist(playlistId, customK, algoToUse, gWeight, eWeight, pWeight, lWeight)
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

  // useCallback with [] so this function reference NEVER changes across re-renders.
  // A new reference would propagate into ScatterPlotWidget and cause Plotly to
  // re-render its chart, detaching the internal click listeners mid-session.
  const handleSelectTrack = useCallback((track: TrackData) => {
    setSelectedTrack(track);
  }, []);

  // RENDER: Login landing page
  if (!isLoggedIn) {
    return (
      <LoginScreen
        authLoading={authLoading}
        authError={authError}
        isBackendConfigured={isBackendConfigured}
        handleLogin={handleLogin}
      />
    );
  }

  // RENDER: Playlist Selector
  if (!selectedPlaylistId) {
    return (
      <Layout onLogout={logout}>
        {llmConfig && <LLMConfigAlert llmConfig={llmConfig} />}
        <PlaylistGrid
          playlists={playlists}
          onSelectPlaylist={handleRunAnalysis}
          loading={playlistsLoading}
        />
      </Layout>
    );
  }

  // RENDER: Analysis Workbench
  const currentPlaylist = playlists.find(p => p.id === selectedPlaylistId);
  const playlistName = currentPlaylist ? currentPlaylist.name : "Playlist";

  return (
    <Layout onLogout={logout}>
      {/* Workbench Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSelectedPlaylistId(null)}
            className="p-2.5 bg-gray-900/60 border border-gray-800 hover:border-gray-700 hover:text-white rounded-xl text-gray-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="text-left">
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

        {/* Cluster / Split Controls */}
        {analysisData && (
          <AnalysisControls
            algorithm={algorithm}
            setAlgorithm={setAlgorithm}
            kValue={kValue}
            setKValue={setKValue}
            genreWeight={genreWeight}
            setGenreWeight={setGenreWeight}
            eraWeight={eraWeight}
            setEraWeight={setEraWeight}
            popularityWeight={popularityWeight}
            setPopularityWeight={setPopularityWeight}
            lyricsWeight={lyricsWeight}
            setLyricsWeight={setLyricsWeight}
            recommendedK={analysisData.recommended_k}
            onUpdateMap={(k, algo, gw, ew, pw, lw) => handleRunAnalysis(selectedPlaylistId, k, algo, gw, ew, pw, lw)}
            loading={analysisLoading}
          />
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
            <p className="text-xs text-gray-550 mt-1 animate-pulse">Fetching track audio features & consulting LLM...</p>
          </div>
        </div>
      ) : analysisError ? (
        <div className="max-w-md mx-auto text-center py-16 bg-red-950/10 border border-red-900/30 rounded-2xl p-6">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-white font-bold text-lg">Analysis Failed</h3>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed text-center">{analysisError}</p>
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
                  defaultProjection={analysisData.default_projection}
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
          </div>

          {/* Player details sidebar (with Spotify Embed player) */}
          {selectedTrack && (
            <TrackDetailsPlayer
              selectedTrack={selectedTrack}
              loadSpotifyEmbed={loadSpotifyEmbed}
              setLoadSpotifyEmbed={setLoadSpotifyEmbed}
            />
          )}

          {/* Advanced Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ErrorBoundary name="Taste Profile">
              <TasteProfileWidget tracks={analysisData.tracks} />
            </ErrorBoundary>

            <ErrorBoundary name="Lyrics Sentiment">
              <React.Suspense
                fallback={
                  <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-center items-center h-full min-h-[420px] text-center">
                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                }
              >
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
        <ExportSuccessModal
          exportedPlaylists={exportedPlaylists}
          onClose={() => {
            setExportedPlaylists(null);
            setSelectedPlaylistId(null); // Return to playlist selection
          }}
        />
      )}
    </Layout>
  );
}

export default App;
