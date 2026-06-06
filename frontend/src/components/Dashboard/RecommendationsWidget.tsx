import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import type { TrackData, ClusterProfile, Recommendation } from '../../services/api';
import { Music, Check, ArrowRight, Loader2, Sparkles, Edit2, AlertCircle } from 'lucide-react';

interface RecommendationsWidgetProps {
  tracks: TrackData[];
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
  onExportSuccess: (created: Array<{ playlist_id: string; name: string; track_count: number }>) => void;
  llm_active?: boolean;
}

export const RecommendationsWidget: React.FC<RecommendationsWidgetProps> = ({
  tracks,
  clusters,
  recommendations,
  onExportSuccess,
  llm_active = true
}) => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
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
          name: `Vibe Split ${clusterId + 1}`,
          description: `Automatically split playlist.`
        };
        const clusterTrackUris = tracks
          .filter(t => t.cluster === clusterId)
          .map(t => t.uri);

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
  const currentClusterTracks = tracks.filter(t => t.cluster === activeTab);

  // Cluster colors
  const colors = ['border-violet-500 text-violet-400', 'border-emerald-500 text-emerald-400', 'border-blue-500 text-blue-400', 'border-amber-500 text-amber-400', 'border-pink-500 text-pink-400'];
  const bgColors = ['bg-violet-500/10 text-violet-400', 'bg-emerald-500/10 text-emerald-400', 'bg-blue-500/10 text-blue-400', 'bg-amber-500/10 text-amber-400', 'bg-pink-500/10 text-pink-400'];

  return (
    <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-6 flex flex-col h-full shadow-lg backdrop-blur-md relative overflow-hidden">
      
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-650/5 rounded-full blur-2xl -mr-10 -mt-10"></div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400 fill-violet-400/20" />
            Vibe Splits & Recommendations
          </h3>
          <p className="text-xs text-gray-500">Edit titles and export each vibe group as a separate Spotify playlist.</p>
        </div>
      </div>

      {/* LiteLLM/Gemini API Key warning notice */}
      {!llm_active && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start space-x-2.5 text-amber-400 animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold">AI Vibe Summaries Disabled</p>
            <p className="text-[10px] text-amber-500/85 mt-0.5 leading-relaxed font-medium">
              No valid Gemini or OpenAI API key was found in the backend configuration. The application is falling back to rule-based acoustic descriptors. Setup an LLM API key in the backend environment to enable creative vibe analysis.
            </p>
          </div>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-gray-800/60 overflow-x-auto pb-px gap-2 mb-4 scrollbar-none">
        {recommendations.map((rec, idx) => {
          const isActive = activeTab === rec.cluster_id;
          const details = editableDetails[rec.cluster_id] || { name: rec.playlist_name };
          const activeBorder = colors[idx % colors.length];
          const activeBg = bgColors[idx % bgColors.length];
          
          return (
            <button
              key={rec.cluster_id}
              onClick={() => setActiveTab(rec.cluster_id)}
              className={`px-4 py-2 border-b-2 font-medium text-xs rounded-t-lg transition-all duration-300 whitespace-nowrap ${
                isActive 
                  ? `${activeBorder} ${activeBg} font-bold` 
                  : 'border-transparent text-gray-400 hover:text-gray-250 hover:bg-gray-950/20'
              }`}
            >
              {details.name || `Vibe ${rec.cluster_id + 1}`}
            </button>
          );
        })}
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
              <span>Cluster ID: #{activeTab}</span>
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
        <div className="pt-2 border-t border-gray-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
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
  );
};

