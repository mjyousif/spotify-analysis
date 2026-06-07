import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import Plot from 'react-plotly.js';
import type { TrackData, ClusterProfile, Recommendation } from '../../services/api';
import { Music, ExternalLink } from 'lucide-react';

// Resolve Vite ESM/CommonJS wrapper mismatch for react-plotly.js
const PlotComponent = (Plot as any).default || Plot;

interface ScatterPlotWidgetProps {
  tracks: TrackData[];
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
  selectedTrack: TrackData | null;
  onSelectTrack: (track: TrackData) => void;
}

export const ScatterPlotWidget: React.FC<ScatterPlotWidgetProps> = ({
  tracks,
  clusters,
  recommendations,
  selectedTrack,
  onSelectTrack
}) => {

  // Custom premium color palette for clusters
  const colors = [
    '#a855f7', // Violet
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f43f5e', // Rose
  ];

  // Memoize plotData WITHOUT selectedTrack so Plotly never fully re-renders on click.
  // Re-rendering on every click detaches Plotly's internal event listeners, breaking
  // consecutive clicks. Selection highlighting is handled by a separate trace below.
  const plotData = useMemo(() => clusters.map((cluster, idx) => {
    const clusterTracks = tracks.filter(t => t.cluster === cluster.cluster_id);
    const rec = recommendations.find(r => r.cluster_id === cluster.cluster_id);
    const isOutlier = cluster.cluster_id === -1;
    const displayName = rec ? rec.playlist_name : (isOutlier ? 'Wildcards / Outliers' : `Vibe ${cluster.cluster_id + 1}`);
    const color = isOutlier ? '#6b7280' : colors[idx % colors.length];

    return {
      x: clusterTracks.map(t => t.x),
      y: clusterTracks.map(t => t.y),
      text: clusterTracks.map(t => `<b>${t.name}</b><br>${t.artists}`),
      customdata: clusterTracks.map(t => t.id),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: displayName,
      hoverinfo: 'text' as const,
      marker: {
        size: 10,
        color: color,
        opacity: 0.75,
        line: { width: 1, color: '#111218' }
      }
    };
  }), [tracks, clusters, recommendations]);

  // Separate trace just for the selected point – updating this does NOT
  // trigger a full Plotly re-render, so native event listeners stay attached.
  const selectedTrace = useMemo(() => {
    if (!selectedTrack) return null;
    return {
      x: [selectedTrack.x],
      y: [selectedTrack.y],
      text: [`<b>${selectedTrack.name}</b><br>${selectedTrack.artists}`],
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: 'Selected',
      hoverinfo: 'text' as const,
      showlegend: false,
      marker: {
        size: 17,
        color: '#ffffff',
        opacity: 1.0,
        symbol: 'circle-open',
        line: { width: 2.5, color: '#ffffff' }
      }
    };
  }, [selectedTrack]);

  // ── Native Plotly event binding ──────────────────────────────────────────────
  // react-plotly.js 2.x passes onClick via props, but this is unreliable in
  // React 19 because React's synthetic event system changed. Instead we capture
  // the raw Plotly graphDiv and attach plotly_click directly via Plotly's own
  // EventEmitter. This persists across re-renders and React version changes.
  const graphDivRef = useRef<any>(null);

  // Keep a stable ref to the handler so useEffect deps don't churn.
  const handleClickRef = useRef<(data: any) => void>(() => {});

  // Rebuild the click handler whenever tracks/clusters/onSelectTrack change.
  // We write to the ref so the Plotly listener below always calls the latest version
  // without needing to be re-attached.
  useEffect(() => {
    handleClickRef.current = (data: any) => {
      if (!data.points || data.points.length === 0) return;
      const point = data.points[0];
      const curveNumber = point.curveNumber;
      const pointIndex = point.pointIndex;

      // Primary resolution: curveNumber maps to a cluster trace, pointIndex to track
      if (typeof curveNumber === 'number' && typeof pointIndex === 'number') {
        const cluster = clusters[curveNumber];
        if (cluster) {
          const clusterTracks = tracks.filter(t => t.cluster === cluster.cluster_id);
          const clickedTrack = clusterTracks[pointIndex];
          if (clickedTrack) {
            onSelectTrack(clickedTrack);
            return;
          }
        }
      }

      // Fallback: resolve via customdata (track id)
      const rawCustomData = point.customdata;
      const trackId = Array.isArray(rawCustomData) ? rawCustomData[0] : rawCustomData;
      if (trackId) {
        const clickedTrack = tracks.find(t => t.id === trackId);
        if (clickedTrack) onSelectTrack(clickedTrack);
      }
    };
  }, [tracks, clusters, onSelectTrack]);

  // Attach the listener once the graphDiv is captured, and clean up on unmount.
  const attachNativeListener = useCallback((graphDiv: any) => {
    if (!graphDiv || graphDivRef.current === graphDiv) return;
    // Remove any previously attached listener on the old div
    if (graphDivRef.current) {
      try { graphDivRef.current.removeAllListeners('plotly_click'); } catch (_) {}
    }
    graphDivRef.current = graphDiv;
    // Use a stable wrapper that delegates to the ref so we never need to re-attach
    graphDiv.on('plotly_click', (data: any) => handleClickRef.current(data));
  }, []);

  return (
    <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-6 flex flex-col h-full shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Vibe Similarity Map</h3>
          <p className="text-xs text-gray-500">PCA reduction of track acoustics. Similiar tracks gather close together.</p>
        </div>
      </div>

      {/* Plotly Chart Container */}
      <div className="flex-1 min-h-[350px] relative overflow-hidden bg-gray-950/30 rounded-xl border border-gray-900 flex items-center justify-center">
        {tracks.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No tracks to visualize</div>
        ) : (
          <PlotComponent
            data={selectedTrace ? [...plotData, selectedTrace] : plotData}
            layout={{
              autosize: true,
              hovermode: 'closest' as const,
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              margin: { l: 20, r: 20, t: 20, b: 20 },
              xaxis: {
                showgrid: true,
                gridcolor: 'rgba(255,255,255,0.03)',
                zeroline: false,
                showticklabels: false,
                linecolor: 'rgba(255,255,255,0.05)'
              },
              yaxis: {
                showgrid: true,
                gridcolor: 'rgba(255,255,255,0.03)',
                zeroline: false,
                showticklabels: false,
                linecolor: 'rgba(255,255,255,0.05)'
              },
              legend: {
                orientation: 'h',
                y: -0.1,
                font: { color: '#9ca3af', size: 11 }
              },
              hoverlabel: {
                bgcolor: '#1f2937',
                bordercolor: '#374151',
                font: { color: '#ffffff', family: 'Inter, sans-serif' }
              }
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%', minHeight: '380px' }}
            config={{ displayModeBar: false, scrollZoom: true }}
            onInitialized={(_figure: any, graphDiv: any) => attachNativeListener(graphDiv)}
            onUpdate={(_figure: any, graphDiv: any) => attachNativeListener(graphDiv)}
          />
        )}
      </div>

      {/* Selected Track Details Footer */}
      <div className="mt-4 border-t border-gray-800/40 pt-4">
        {selectedTrack ? (
          <div className="flex items-center justify-between gap-4 p-3 bg-gray-950/40 border border-gray-800/60 rounded-xl animate-fadeIn">
            <div className="flex items-center space-x-3 truncate">
              <div className="w-11 h-11 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
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
              <div className="truncate">
                <h4 className="font-bold text-sm text-gray-100 truncate">{selectedTrack.name}</h4>
                <p className="text-xs text-gray-500 truncate">{selectedTrack.artists}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <a
                href={`https://open.spotify.com/track/${selectedTrack.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg border border-gray-800 transition-colors"
                title="Open in Spotify"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 bg-gray-950/20 border border-dashed border-gray-850 rounded-xl text-xs text-gray-500 font-medium">
            💡 Click on a node in the scatter plot to inspect the track
          </div>
        )}
      </div>
    </div>
  );
};
