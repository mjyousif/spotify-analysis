import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
// Import the pre-built dist bundle to avoid Vite/Rolldown issues
// with Node.js built-ins (buffer, stream, etc.) in plotly.js source
import Plotly from 'plotly.js/dist/plotly';
import type { TrackData, ClusterProfile, Recommendation } from '../../services/api';
import { Music, ExternalLink, HelpCircle } from 'lucide-react';

interface ScatterPlotWidgetProps {
  tracks: TrackData[];
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
  selectedTrack: TrackData | null;
  onSelectTrack: (track: TrackData) => void;
  projectionMode: 'pca' | 'tsne' | 'umap' | 'circumplex';
  setProjectionMode: (mode: 'pca' | 'tsne' | 'umap' | 'circumplex') => void;
  onOpenDocs?: (tab: 'algorithms' | 'projections', key?: string) => void;
}

export const ScatterPlotWidget: React.FC<ScatterPlotWidgetProps> = ({
  tracks,
  clusters,
  recommendations,
  selectedTrack,
  onSelectTrack,
  projectionMode,
  setProjectionMode,
  onOpenDocs
}) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const isPlotInitialized = useRef(false);
  const [is3D, setIs3D] = useState(false);

  // Keep a mutable ref to the latest callback so we don't need to re-bindlisteners
  const onSelectTrackRef = useRef(onSelectTrack);
  onSelectTrackRef.current = onSelectTrack;

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const clustersRef = useRef(clusters);
  clustersRef.current = clusters;

  // Custom premium color palette for clusters
  const colors = [
    '#a855f7', '#10b981', '#3b82f6', '#f59e0b',
    '#ec4899', '#14b8a6', '#f43f5e',
  ];

  // Build traces (memoized, stable until data changes)
  const plotTraces = useMemo(() => {
    return clusters.map((cluster, idx) => {
      const clusterTracks = tracks.filter(t => t.cluster === cluster.cluster_id);
      const rec = recommendations.find(r => r.cluster_id === cluster.cluster_id);
      const isOutlier = cluster.cluster_id === -1;
      const displayName = rec ? rec.playlist_name : (isOutlier ? 'Wildcards / Outliers' : `Vibe ${cluster.cluster_id + 1}`);
      const color = isOutlier ? '#6b7280' : colors[idx % colors.length];

      const baseTrace: any = {
        x: clusterTracks.map(t => t.coords?.[projectionMode]?.x ?? t.x),
        y: clusterTracks.map(t => t.coords?.[projectionMode]?.y ?? t.y),
        text: clusterTracks.map(t => `<b>${t.name}</b><br>${t.artists}`),
        customdata: clusterTracks.map(t => t.id),
        mode: 'markers' as const,
        type: is3D ? ('scatter3d' as const) : ('scatter' as const),
        name: displayName,
        hoverinfo: 'text' as const,
        marker: {
          size: is3D ? 7 : 10,
          color: color,
          opacity: 0.75,
          line: { width: 1, color: '#111218' }
        }
      };

      if (is3D) {
        baseTrace.z = clusterTracks.map(t => t.coords?.[projectionMode]?.z ?? 0);
      }

      return baseTrace;
    });
  }, [tracks, clusters, recommendations, projectionMode, is3D]);

  // Build a highlight trace for the selected point
  const selectedTrace = useMemo(() => {
    if (!selectedTrack) return null;
    const baseTrace: any = {
      x: [selectedTrack.coords?.[projectionMode]?.x ?? selectedTrack.x],
      y: [selectedTrack.coords?.[projectionMode]?.y ?? selectedTrack.y],
      text: [`<b>${selectedTrack.name}</b><br>${selectedTrack.artists}`],
      mode: 'markers' as const,
      type: is3D ? ('scatter3d' as const) : ('scatter' as const),
      name: 'Selected',
      hoverinfo: 'text' as const,
      showlegend: false,
      marker: {
        size: is3D ? 12 : 17,
        color: '#ffffff',
        opacity: 0.95,
        line: { width: 2, color: '#3b82f6' }
      }
    };

    if (is3D) {
      baseTrace.z = [selectedTrack.coords?.[projectionMode]?.z ?? 0];
    } else {
      baseTrace.marker.symbol = 'circle-open';
      baseTrace.marker.line = { width: 2.5, color: '#ffffff' };
      baseTrace.marker.opacity = 1.0;
    }

    return baseTrace;
  }, [selectedTrack, projectionMode, is3D]);

  const getAxisLabels = useCallback(() => {
    if (projectionMode === 'circumplex') {
      return { x: 'Valence (Positivity)', y: 'Energy (Intensity)', z: 'Danceability' };
    }
    if (projectionMode === 'pca') {
      return { x: 'Principal Component 1', y: 'Principal Component 2', z: 'Principal Component 3' };
    }
    const modeName = projectionMode.toUpperCase();
    return { x: `${modeName} Axis 1`, y: `${modeName} Axis 2`, z: `${modeName} Axis 3` };
  }, [projectionMode]);

  const layout = useMemo(() => {
    const baseLayout: any = {
      autosize: true,
      hovermode: 'closest' as const,
      paper_bgcolor: 'rgba(0,0,0,0)',
      margin: is3D ? { l: 0, r: 0, t: 0, b: 0 } : { l: 20, r: 20, t: 20, b: 20 },
      legend: {
        orientation: 'h' as const,
        y: -0.1,
        font: { color: '#9ca3af', size: 11 }
      },
      hoverlabel: {
        bgcolor: '#1f2937',
        bordercolor: '#374151',
        font: { color: '#ffffff', family: 'Inter, sans-serif' }
      }
    };

    if (is3D) {
      const labels = getAxisLabels();
      baseLayout.scene = {
        xaxis: {
          showgrid: true,
          gridcolor: 'rgba(255,255,255,0.05)',
          zeroline: false,
          showticklabels: false,
          title: { text: labels.x, font: { color: '#9ca3af', size: 10 } },
          backgroundcolor: 'rgba(0,0,0,0)',
          showbackground: false
        },
        yaxis: {
          showgrid: true,
          gridcolor: 'rgba(255,255,255,0.05)',
          zeroline: false,
          showticklabels: false,
          title: { text: labels.y, font: { color: '#9ca3af', size: 10 } },
          backgroundcolor: 'rgba(0,0,0,0)',
          showbackground: false
        },
        zaxis: {
          showgrid: true,
          gridcolor: 'rgba(255,255,255,0.05)',
          zeroline: false,
          showticklabels: false,
          title: { text: labels.z, font: { color: '#9ca3af', size: 10 } },
          backgroundcolor: 'rgba(0,0,0,0)',
          showbackground: false
        },
        camera: {
          eye: { x: 1.5, y: 1.5, z: 1.25 }
        }
      };
    } else {
      baseLayout.plot_bgcolor = 'rgba(0,0,0,0)';
      baseLayout.xaxis = {
        showgrid: true,
        gridcolor: 'rgba(255,255,255,0.03)',
        zeroline: false,
        showticklabels: false,
        linecolor: 'rgba(255,255,255,0.05)'
      };
      baseLayout.yaxis = {
        showgrid: true,
        gridcolor: 'rgba(255,255,255,0.03)',
        zeroline: false,
        showticklabels: false,
        linecolor: 'rgba(255,255,255,0.05)'
      };
    }

    return baseLayout;
  }, [is3D, getAxisLabels]);

  const config = useMemo(() => ({
    displayModeBar: false,
    scrollZoom: true,
    responsive: true,
  }), []);

  // Click handler — uses refs so it never goes stale
  const handleClick = useCallback((eventData: any) => {
    if (!eventData.points || eventData.points.length === 0) return;
    const point = eventData.points[0];
    const curveNumber = point.curveNumber;
    const pointIndex = point.pointIndex;
    const currentTracks = tracksRef.current;
    const currentClusters = clustersRef.current;

    // Primary: resolve via curveNumber (trace index) → cluster → track
    if (typeof curveNumber === 'number' && typeof pointIndex === 'number') {
      const cluster = currentClusters[curveNumber];
      if (cluster) {
        const clusterTracks = currentTracks.filter(t => t.cluster === cluster.cluster_id);
        const clickedTrack = clusterTracks[pointIndex];
        if (clickedTrack) {
          onSelectTrackRef.current(clickedTrack);
          return;
        }
      }
    }

    // Fallback: resolve via customdata (track id)
    const rawCustomData = point.customdata;
    const trackId = Array.isArray(rawCustomData) ? rawCustomData[0] : rawCustomData;
    if (trackId) {
      const clickedTrack = currentTracks.find(t => t.id === trackId);
      if (clickedTrack) onSelectTrackRef.current(clickedTrack);
    }
  }, []);

  // ── Create / update the Plotly chart ────────────────────────────────
  // Initial plot + event binding (runs once on mount)
  useEffect(() => {
    const el = plotRef.current;
    if (!el || tracks.length === 0) return;

    const allTraces: any[] = [...plotTraces];
    if (selectedTrace) allTraces.push(selectedTrace);

    Plotly.newPlot(el, allTraces, layout, config).then(() => {
      isPlotInitialized.current = true;
      // Attach click handler directly on the Plotly div — no React wrapper
      (el as any).on('plotly_click', handleClick);
    });

    // Resize observer so the chart fills its container
    const ro = new ResizeObserver(() => {
      if (isPlotInitialized.current) Plotly.Plots.resize(el);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      Plotly.purge(el);
      isPlotInitialized.current = false;
    };
    // Only re-create from scratch when core data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotTraces, layout, config, handleClick]);

  // React to selection changes without full re-plot — just swap traces
  useEffect(() => {
    const el = plotRef.current;
    if (!el || !isPlotInitialized.current) return;

    const allTraces: any[] = [...plotTraces];
    if (selectedTrace) allTraces.push(selectedTrace);

    Plotly.react(el, allTraces, layout, config);
  }, [selectedTrace, plotTraces, layout, config]);

  const getDescription = (mode: 'pca' | 'tsne' | 'umap' | 'circumplex') => {
    const suffix = is3D ? ' (3D Projection)' : ' (2D Projection)';
    switch (mode) {
      case 'pca':
        return 'PCA reduction of track acoustics. Preserves global feature structure' + suffix + '.';
      case 'tsne':
        return 't-SNE projection of track acoustics. Groups similar tracks into tight clusters' + suffix + '.';
      case 'umap':
        return 'UMAP projection of track acoustics. Balances local and global structural similarity' + suffix + '.';
      case 'circumplex':
        return (is3D
          ? 'Russell Circumplex mapping (Valence vs. Energy vs. Danceability).'
          : 'Russell Circumplex mapping (Valence vs. Energy). Natural emotional coordinate representation.') + suffix + '.';
      default:
        return 'Dimensionality reduction of track acoustics' + suffix + '.';
    }
  };

  return (
    <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-6 flex flex-col h-full shadow-lg backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Vibe Similarity Map</h3>
          <p className="text-xs text-gray-500">{getDescription(projectionMode)}</p>
        </div>
        <div className="flex items-center space-x-2 self-start sm:self-center">
          {/* Dimension toggle button group */}
          <div className="flex bg-gray-950 border border-gray-850 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setIs3D(false)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                !is3D
                  ? 'bg-violet-600/90 text-white shadow-sm font-extrabold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              2D
            </button>
            <button
              type="button"
              onClick={() => setIs3D(true)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                is3D
                  ? 'bg-violet-600/90 text-white shadow-sm font-extrabold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              3D
            </button>
          </div>

          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider pl-1">Map:</span>
          <select
            value={projectionMode}
            onChange={(e) => setProjectionMode(e.target.value as any)}
            className="bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1 text-xs text-gray-250 font-bold focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
          >
            <option value="pca">PCA</option>
            <option value="tsne">t-SNE</option>
            <option value="umap">UMAP</option>
            <option value="circumplex">Emotion (Circumplex)</option>
          </select>
          {onOpenDocs && (
            <button
              type="button"
              onClick={() => onOpenDocs('projections', projectionMode)}
              className="text-gray-400 hover:text-violet-450 p-1 hover:bg-gray-950 rounded-lg transition-colors border border-transparent hover:border-gray-850 cursor-pointer"
              title="View Projection Documentation"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Plotly Chart Container */}
      <div className="flex-1 min-h-[350px] relative bg-gray-950/30 rounded-xl border border-gray-900 flex items-center justify-center">
        {tracks.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No tracks to visualize</div>
        ) : (
          <div
            ref={plotRef}
            style={{ width: '100%', height: '100%', minHeight: '380px' }}
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
