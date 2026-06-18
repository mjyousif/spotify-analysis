import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSpotifyAuth } from './hooks/useSpotifyAuth';
import { apiService } from './services/api';
import type { TrackData, AnalysisResponse, DocumentationMetadata } from './services/api';
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
import { DocumentationModal } from './components/Dashboard/DocumentationModal';
import { LlmErrorModal } from './components/Dashboard/LlmErrorModal';
import { ExcludedTracksAlert } from './components/Dashboard/ExcludedTracksAlert';
import { AnalysisProgressPanel } from './components/Dashboard/AnalysisProgressPanel';
import type { ProgressState } from './components/Dashboard/AnalysisProgressPanel';

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
  const [analysisProgress, setAnalysisProgress] = useState<ProgressState>({
    stage: 'initializing',
    message: 'Starting playlist analysis...',
    step: 0,
    totalSteps: 6,
  });
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState<boolean>(false);
  const activePlaylistIdRef = useRef<string | null>(null);

  // Documentation States
  const [docMetadata, setDocMetadata] = useState<DocumentationMetadata | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState<boolean>(false);
  const [docModalTab, setDocModalTab] = useState<'algorithms' | 'projections'>('algorithms');
  const [docModalKey, setDocModalKey] = useState<string>('');
  
  // Projection State (Controlled)
  const [projectionMode, setProjectionMode] = useState<'pca' | 'tsne' | 'umap' | 'circumplex'>('pca');

  // Feature Influence Weight States (Default to 0.0 for backward-compatible pure audio)
  const [genreWeight, setGenreWeight] = useState<number>(0.0);
  const [eraWeight, setEraWeight] = useState<number>(0.0);
  const [popularityWeight, setPopularityWeight] = useState<number>(0.0);
  const [lyricsWeight, setLyricsWeight] = useState<number>(0.0);
  const [lyricsStrategy, setLyricsStrategy] = useState<string>('spotify_model');

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

  // Fetch Documentation Metadata on mount
  useEffect(() => {
    apiService.getDocumentationMetadata()
      .then(data => setDocMetadata(data))
      .catch(err => console.error("Failed to load documentation metadata:", err));
  }, []);

  const handleOpenDocs = (tab: 'algorithms' | 'projections', key?: string) => {
    setDocModalTab(tab);
    if (key) setDocModalKey(key);
    setIsDocModalOpen(true);
  };

  const handleApplySetting = (type: 'algorithm' | 'projection', value: string) => {
    if (type === 'algorithm') {
      const algoVal = value as 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic';
      setAlgorithm(algoVal);
      // Run analysis with the new algorithm immediately so the user sees results
      handleRunAnalysis(selectedPlaylistId || '', kValue, algoVal, genreWeight, eraWeight, popularityWeight, lyricsWeight);
    } else if (type === 'projection') {
      const projVal = value as 'pca' | 'tsne' | 'umap' | 'circumplex';
      setProjectionMode(projVal);
    }
  };

  // Run Vibe Analysis on a Playlist
  const handleRunAnalysis = (
    playlistId: string,
    customK?: number,
    customAlgo?: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic',
    customGenreWeight?: number,
    customEraWeight?: number,
    customPopularityWeight?: number,
    customLyricsWeight?: number,
    customLyricsStrategy?: string
  ) => {
    activePlaylistIdRef.current = playlistId;
    setSelectedPlaylistId(playlistId);
    setAnalysisLoading(true);
    setAnalysisProgress({
      stage: 'initializing',
      message: 'Initializing analysis...',
      step: 0,
      totalSteps: 6,
    });
    setAnalysisError(null);
    setExportedPlaylists(null);
    setSelectedTrack(null);
    setRecommendationsLoading(false);

    const algoToUse = customAlgo !== undefined ? customAlgo : algorithm;
    const gWeight = customGenreWeight !== undefined ? customGenreWeight : genreWeight;
    const eWeight = customEraWeight !== undefined ? customEraWeight : eraWeight;
    const pWeight = customPopularityWeight !== undefined ? customPopularityWeight : popularityWeight;
    const lWeight = customLyricsWeight !== undefined ? customLyricsWeight : lyricsWeight;
    const lStrategy = customLyricsStrategy !== undefined ? customLyricsStrategy : lyricsStrategy;

    apiService.streamAnalysis(
      playlistId,
      customK,
      algoToUse,
      gWeight,
      eWeight,
      pWeight,
      lWeight,
      false, // includeLlm
      lStrategy,
      (progressEvent) => {
        if (activePlaylistIdRef.current !== playlistId) return;
        setAnalysisProgress(progressEvent);
      },
      (data) => {
        if (activePlaylistIdRef.current !== playlistId) return;

        setAnalysisData(data);
        const resolvedK = customK !== undefined ? customK : (data.recommended_k || kValue);
        if (customK === undefined && data.recommended_k) {
          setKValue(data.recommended_k);
        }
        if (data.default_projection) {
          setProjectionMode(data.default_projection);
        }
        if (data.tracks.length > 0) {
          setSelectedTrack(data.tracks[0]);
        }

        // If recommendations are already returned (e.g. from LLM Semantic Splitter or cache)
        if (data.recommendations && data.recommendations.length > 0) {
          setRecommendationsLoading(false);
          setAnalysisLoading(false);
        } else {
          setRecommendationsLoading(true);
          // Transition progress bar to showing the AI recommender step while loading recommendations
          setAnalysisProgress({
            stage: 'recommendations',
            message: 'Generating AI vibe recommendations...',
            step: 6,
            totalSteps: 6,
          });

          apiService.getRecommendations(playlistId, resolvedK, algoToUse, gWeight, eWeight, pWeight, lWeight, lStrategy)
            .then(recData => {
              if (activePlaylistIdRef.current !== playlistId) return;
              setAnalysisData(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  recommendations: recData.recommendations,
                  llm_active: recData.llm_active,
                  llm_provider: recData.llm_provider,
                  llm_model: recData.llm_model
                };
              });
            })
            .catch(err => {
              console.error("Failed to load recommendations:", err);
            })
            .finally(() => {
              if (activePlaylistIdRef.current === playlistId) {
                setRecommendationsLoading(false);
                setAnalysisLoading(false);
              }
            });
        }
      },
      (err) => {
        if (activePlaylistIdRef.current !== playlistId) return;
        console.error("Analysis stream error:", err);

        const errMsg = err.message || err.detail || "Failed to analyze playlist.";

        if (algoToUse === 'llm_semantic' && (errMsg.includes("AI Semantic Split failed") || errMsg.includes("LlmSplitterError") || errMsg.includes("LiteLLM is not configured"))) {
          setLlmError(errMsg);
          setAlgorithm('kmeans');
          handleRunAnalysis(playlistId, customK, 'kmeans', gWeight, eWeight, pWeight, lWeight);
        } else {
          setAnalysisError(errMsg);
          setAnalysisLoading(false);
        }
      }
    ).catch(err => {
      if (activePlaylistIdRef.current !== playlistId) return;
      console.error("Outer analysis error:", err);
      setAnalysisError(err.message || "An unexpected error occurred.");
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
            lyricsStrategy={lyricsStrategy}
            setLyricsStrategy={setLyricsStrategy}
            recommendedK={analysisData.recommended_k}
            onUpdateMap={(k, algo, gw, ew, pw, lw, lStrat) => {
              const strat = lStrat !== undefined ? lStrat : lyricsStrategy;
              if (lStrat !== undefined) setLyricsStrategy(lStrat);
              handleRunAnalysis(selectedPlaylistId, k, algo, gw, ew, pw, lw, strat);
            }}
            loading={analysisLoading}
            onOpenDocs={handleOpenDocs}
          />
        )}
      </div>

      {/* Main Analysis Screen */}
      {analysisLoading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <AnalysisProgressPanel progress={analysisProgress} />
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
          {/* Excluded Tracks Alert */}
          <ExcludedTracksAlert excludedTracks={analysisData.excluded_tracks} />

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
                  projectionMode={projectionMode}
                  setProjectionMode={setProjectionMode}
                  onOpenDocs={handleOpenDocs}
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
                  loading={recommendationsLoading}
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
                  lyricsStrategy={lyricsStrategy}
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

      {/* Dynamic Documentation System Modal */}
      <DocumentationModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        metadata={docMetadata}
        initialTab={docModalTab}
        initialKey={docModalKey}
        onApplySetting={handleApplySetting}
      />

      {/* AI Semantic Split Error Modal */}
      {llmError && (
        <LlmErrorModal
          error={llmError}
          onClose={() => setLlmError(null)}
        />
      )}
    </Layout>
  );
}

export default App;
