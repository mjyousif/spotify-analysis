import React, { useState, useEffect, useRef, useMemo } from 'react';
import { apiService } from '../../services/api';
import type { TrackData, ClusterProfile, Recommendation } from '../../services/api';
import { Music, Check, ArrowRight, Loader2, Sparkles, Edit2, AlertCircle, ChevronLeft, ChevronRight, Disc } from 'lucide-react';
import { harmonicSortTracks } from '../../utils/harmonicSort';

interface RecommendationsWidgetProps {
  tracks: TrackData[];
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
  onExportSuccess: (created: Array<{ playlist_id: string; name: string; track_count: number }>) => void;
  llm_active?: boolean;
  llm_provider?: string;
  llm_model?: string;
}

export const RecommendationsWidget: React.FC<RecommendationsWidgetProps> = ({
  tracks,
  clusters,
  recommendations,
  onExportSuccess,
  llm_active = true,
  llm_provider,
  llm_model
}) => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [guideTab, setGuideTab] = useState<'cloud' | 'lmstudio' | 'ollama'>('cloud');
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [djFlowOrder, setDjFlowOrder] = useState<boolean>(false);

  // Tabs scroll references and states
  const tabsRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState<boolean>(false);
  const [showRightArrow, setShowRightArrow] = useState<boolean>(false);

  // Dynamic scroll checker
  const checkScroll = () => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setShowLeftArrow(scrollLeft > 1);
      // Tolerance of 1px for subpixel rendering issues
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (tabsEl) {
      checkScroll();
      tabsEl.addEventListener('scroll', checkScroll, { passive: true });
      window.addEventListener('resize', checkScroll);

      // Observe size changes to adapt dynamic arrows when items load or resize
      const observer = new ResizeObserver(() => {
        checkScroll();
      });
      observer.observe(tabsEl);

      return () => {
        tabsEl.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        observer.disconnect();
      };
    }
  }, [recommendations]);

  // Scroll active tab into view when selected
  useEffect(() => {
    if (tabsRef.current) {
      const activeEl = tabsRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
    // Recheck scroll after a delay to allow scrollIntoView to complete
    const timer = setTimeout(checkScroll, 300);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const { clientWidth } = tabsRef.current;
      const scrollAmount = clientWidth * 0.6;
      tabsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  
  // Local state for editable playlist details
  const [editableDetails, setEditableDetails] = useState<
    Record<number, { name: string; description: string }>
  >({});

  // Sync recommendations to editable details when they load/change
  useEffect(() => {
    const details: Record<number, { name: string; description: string }> = {};
    recommendations.forEach(rec => {
      details[rec.cluster_id] = {
        name: rec.playlist_name,
        description: rec.description
      };
    });
    setEditableDetails(details);
    if (recommendations.length > 0) {
      setActiveTab(recommendations[0].cluster_id);
    }
  }, [recommendations]);

  const handleInputChange = (clusterId: number, field: 'name' | 'description', value: string) => {
    setEditableDetails(prev => ({
      ...prev,
      [clusterId]: {
        ...prev[clusterId],
        [field]: value
      }
    }));
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const splitsPayload = clusters.map(cluster => {
        const clusterId = cluster.cluster_id;
        const details = editableDetails[clusterId] || {
          name: clusterId === -1 ? 'The Eclectic Wildcards' : `Vibe Split ${clusterId + 1}`,
          description: clusterId === -1
            ? "A collection of unique tracks that stand out from the playlist's main vibes."
            : `Automatically split playlist.`
        };
        const clusterTracks = tracks.filter(t => t.cluster === clusterId);
        const orderedTracks = djFlowOrder ? harmonicSortTracks(clusterTracks) : clusterTracks;
        const clusterTrackUris = orderedTracks.map(t => t.uri);

        return {
          playlist_name: details.name,
          description: details.description,
          track_uris: clusterTrackUris
        };
      }).filter(s => s.track_uris.length > 0);

      if (splitsPayload.length === 0) {
        throw new Error("No playlists contain songs. Adjust your splits.");
      }

      const result = await apiService.createSplits(splitsPayload);
      if (result.status === 'success') {
        onExportSuccess(result.created_playlists);
      } else {
        throw new Error(result.message || "Failed to create playlists.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "An error occurred during export.");
    } finally {
      setExporting(false);
    }
  };

  if (recommendations.length === 0) {
    return (
      <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-6 h-full flex items-center justify-center">
        <p className="text-gray-500 font-medium">Run analysis to generate splits.</p>
      </div>
    );
  }

  // Helper variables for current tab
  const currentDetails = editableDetails[activeTab] || { name: '', description: '' };
  const currentRec = recommendations.find(r => r.cluster_id === activeTab);
  const currentClusterTracksRaw = tracks.filter(t => t.cluster === activeTab);
  const currentClusterTracks = useMemo(() => {
    return djFlowOrder ? harmonicSortTracks(currentClusterTracksRaw) : currentClusterTracksRaw;
  }, [currentClusterTracksRaw, djFlowOrder]);

  // Cluster colors
  const colors = ['border-violet-500 text-violet-400', 'border-emerald-500 text-emerald-400', 'border-blue-500 text-blue-400', 'border-amber-500 text-amber-400', 'border-pink-500 text-pink-400'];
  const bgColors = ['bg-violet-500/10 text-violet-400', 'bg-emerald-500/10 text-emerald-400', 'bg-blue-500/10 text-blue-400', 'bg-amber-500/10 text-amber-400', 'bg-pink-500/10 text-pink-400'];

  return (
    <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-6 flex flex-col h-full shadow-lg backdrop-blur-md relative overflow-hidden">
      
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-650/5 rounded-full blur-2xl -mr-10 -mt-10"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400 fill-violet-400/20" />
            Vibe Splits & Recommendations
          </h3>
          <p className="text-xs text-gray-500">Edit titles and export each vibe group as a separate Spotify playlist.</p>
        </div>
        {llm_active && llm_provider && llm_provider !== 'none' && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full text-[10px] text-violet-300 font-bold self-start sm:self-center capitalize">
            <Sparkles className="w-3 h-3 text-violet-400" />
            <span>Active: {llm_provider.replace('_', ' ')} ({llm_model && llm_model.includes('/') ? llm_model.split('/')[1] : llm_model || 'default'})</span>
          </div>
        )}
      </div>

      {/* LiteLLM Setup & Integration Guide */}
      {!llm_active && (
        <div className="mb-4 bg-gray-950/40 border border-gray-850 rounded-2xl p-4 flex flex-col space-y-3 animate-fadeIn">
          <div className="flex items-start space-x-2.5 text-amber-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="text-xs flex-1">
              <p className="font-bold text-gray-200">AI Vibe Summaries Disabled</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed font-medium">
                No active LLM provider is configured. The application is using rule-based descriptors. Follow one of the tabs below to enable creative vibe analysis.
              </p>
            </div>
          </div>
          
          {/* Guide Tabs */}
          <div className="flex border-b border-gray-900 pb-px gap-1">
            {(['cloud', 'lmstudio', 'ollama'] as const).map((tab) => {
              const isActive = guideTab === tab;
              const labels = {
                cloud: 'Cloud APIs',
                lmstudio: 'LM Studio (Local)',
                ollama: 'Ollama (Local)'
              };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setGuideTab(tab)}
                  className={`px-3 py-1.5 border-b-2 text-[10px] font-bold transition-all cursor-pointer ${
                    isActive 
                      ? 'border-violet-500 text-violet-400 bg-violet-500/5' 
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Guide Tab Content */}
          <div className="text-[10px] text-gray-400 leading-normal font-medium space-y-2 pt-1">
            {guideTab === 'cloud' && (
              <div className="space-y-1">
                <p>To use cloud models (Gemini, OpenAI, Anthropic):</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9px] text-gray-500">
                  <li>Open <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">backend/.env</code> in your editor.</li>
                  <li>Provide your API key: e.g. <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">GEMINI_API_KEY=AIzaSy...</code></li>
                  <li>Restart the backend server. The app automatically detects keys.</li>
                </ol>
              </div>
            )}
            {guideTab === 'lmstudio' && (
              <div className="space-y-1">
                <p>To run local models using LM Studio:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9px] text-gray-500">
                  <li>Download and launch <a href="https://lmstudio.ai" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">LM Studio</a>.</li>
                  <li>Download a model (e.g. Qwen 2.5 7B, Llama 3.2 3B) and load it.</li>
                  <li>Enable the **Local Server** option in LM Studio (typically port <code className="text-gray-450">1234</code>).</li>
                  <li>Update your <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">backend/.env</code>:
                    <pre className="bg-gray-950 p-1.5 rounded text-[8px] text-gray-400 mt-1 block font-mono">
                      LLM_PROVIDER=lm_studio{"\n"}
                      LLM_MODEL=your-loaded-model-id  # Optional
                    </pre>
                  </li>
                  <li>Restart the backend server. No API keys are required.</li>
                </ol>
              </div>
            )}
            {guideTab === 'ollama' && (
              <div className="space-y-1">
                <p>To run local models using Ollama:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9px] text-gray-500">
                  <li>Download and install <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">Ollama</a>.</li>
                  <li>Pull and run a model from your terminal: <code className="bg-gray-950 px-1.5 py-0.5 rounded text-gray-400 block mt-1 w-fit font-mono">ollama run llama3.2</code></li>
                  <li>Verify Ollama is running (typically port <code className="text-gray-450">11434</code>).</li>
                  <li>Update your <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">backend/.env</code>:
                    <pre className="bg-gray-950 p-1.5 rounded text-[8px] text-gray-400 mt-1 block font-mono">
                      LLM_PROVIDER=ollama{"\n"}
                      LLM_MODEL=llama3.2  # Matches pulled model
                    </pre>
                  </li>
                  <li>Restart the backend server. No API keys are required.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs list */}
      <div className="relative mb-4 group/tabs">
        {showLeftArrow && (
          <div className="absolute left-0 top-0 bottom-0 flex items-center pr-8 bg-gradient-to-r from-gray-900/95 via-gray-900/60 to-transparent z-10 pointer-events-none animate-fadeIn">
            <button
              type="button"
              onClick={() => scrollTabs('left')}
              className="p-1.5 rounded-lg bg-gray-950 border border-gray-850 hover:border-gray-700 text-gray-400 hover:text-white transition-all shadow-md pointer-events-auto cursor-pointer flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {showRightArrow && (
          <div className="absolute right-0 top-0 bottom-0 flex items-center pl-8 bg-gradient-to-l from-gray-900/95 via-gray-900/60 to-transparent z-10 pointer-events-none animate-fadeIn">
            <button
              type="button"
              onClick={() => scrollTabs('right')}
              className="p-1.5 rounded-lg bg-gray-950 border border-gray-850 hover:border-gray-700 text-gray-400 hover:text-white transition-all shadow-md pointer-events-auto cursor-pointer flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div
          ref={tabsRef}
          className="flex border-b border-gray-800/60 overflow-x-auto pb-px gap-2 scrollbar-none"
        >
          {recommendations.map((rec, idx) => {
            const isActive = activeTab === rec.cluster_id;
            const details = editableDetails[rec.cluster_id] || { name: rec.playlist_name };
            const isOutlier = rec.cluster_id === -1;
            const activeBorder = isOutlier ? 'border-gray-500 text-gray-400' : colors[idx % colors.length];
            const activeBg = isOutlier ? 'bg-gray-500/10 text-gray-400' : bgColors[idx % bgColors.length];
            
            return (
              <button
                key={rec.cluster_id}
                data-active={isActive ? "true" : "false"}
                onClick={() => setActiveTab(rec.cluster_id)}
                className={`px-4 py-2 border-b-2 font-medium text-xs rounded-t-lg transition-all duration-300 whitespace-nowrap cursor-pointer ${
                  isActive 
                    ? `${activeBorder} ${activeBg} font-bold` 
                    : 'border-transparent text-gray-400 hover:text-gray-250 hover:bg-gray-950/20'
                }`}
              >
                {details.name || (isOutlier ? 'Wildcards' : `Vibe ${rec.cluster_id + 1}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Vibe Editor */}
      <div className="flex-1 flex flex-col min-h-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Playlist metadata editors */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Playlist Title</label>
              <div className="relative">
                <input
                  type="text"
                  value={currentDetails.name}
                  onChange={(e) => handleInputChange(activeTab, 'name', e.target.value)}
                  className="w-full bg-gray-950/40 border border-gray-850 rounded-xl px-3.5 py-2 text-sm font-semibold text-gray-150 focus:outline-none focus:border-violet-500/80 transition-colors"
                />
                <Edit2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-650" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Playlist Description</label>
              <textarea
                value={currentDetails.description}
                onChange={(e) => handleInputChange(activeTab, 'description', e.target.value)}
                rows={3}
                className="w-full bg-gray-950/40 border border-gray-850 rounded-xl px-3.5 py-2 text-sm text-gray-300 focus:outline-none focus:border-violet-500/80 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Vibe Explanation */}
          <div className="bg-gray-950/30 border border-gray-850/60 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-1">Vibe Analysis</span>
              <p className="text-xs text-gray-400 leading-relaxed font-normal">
                {currentRec?.vibe_explanation || "Analyzing acoustic similarity..."}
              </p>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500 font-semibold border-t border-gray-900 pt-2">
              <span>{activeTab === -1 ? 'Special Vibe: Wildcards' : `Cluster ID: #${activeTab}`}</span>
              <span>Total Songs: {currentClusterTracks.length}</span>
            </div>
          </div>
        </div>

        {/* Tracks List inside cluster */}
        <div className="flex-1 flex flex-col min-h-[160px]">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-2">Tracks in this split</span>
          <div className="flex-1 overflow-y-auto border border-gray-850/60 bg-gray-950/20 rounded-xl divide-y divide-gray-900/60 pr-1 max-h-[220px]">
            {currentClusterTracks.map((track) => (
              <div key={track.id} className="flex items-center space-x-3 p-2.5 hover:bg-gray-950/30 transition-colors">
                <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {track.album_images && track.album_images.length > 0 ? (
                    <img src={track.album_images[track.album_images.length - 1].url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-4 h-4 text-gray-650" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h5 className="text-xs font-semibold text-gray-250 truncate">{track.name}</h5>
                  <p className="text-[10px] text-gray-550 truncate mt-0.5">{track.artists}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button & Errors */}
        <div className="pt-3 border-t border-gray-800/40 flex flex-col gap-3">
          {/* DJ Flow Toggle */}
          <label
            htmlFor="dj-flow-toggle"
            className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer select-none ${
              djFlowOrder
                ? 'bg-emerald-950/30 border-emerald-500/30'
                : 'bg-gray-950/30 border-gray-850 hover:border-gray-700'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div className={`p-1.5 rounded-lg transition-colors duration-300 ${
                djFlowOrder
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-gray-800/60 text-gray-500'
              }`}>
                <Disc className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className={`text-xs font-bold transition-colors duration-300 ${
                  djFlowOrder ? 'text-emerald-300' : 'text-gray-300'
                }`}>DJ Flow Order</span>
                <p className={`text-[9px] font-medium transition-colors duration-300 ${
                  djFlowOrder ? 'text-emerald-500/70' : 'text-gray-550'
                }`}>Reorder each split by harmonic key compatibility before export</p>
              </div>
            </div>
            <div className="relative flex-shrink-0">
              <input
                id="dj-flow-toggle"
                type="checkbox"
                checked={djFlowOrder}
                onChange={(e) => setDjFlowOrder(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-9 h-5 rounded-full transition-colors duration-300 ${
                djFlowOrder ? 'bg-emerald-500' : 'bg-gray-700'
              }`}></div>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300 ${
                djFlowOrder ? 'translate-x-4' : 'translate-x-0'
              }`}></div>
            </div>
          </label>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {error && (
              <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-950/20 border border-red-900/40 p-2 rounded-xl">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex-1"></div>
          
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:from-emerald-800 disabled:to-teal-800 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating on Spotify...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Export Vibe Splits to Spotify</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

