import React from 'react';
import type { ClusterProfile, Recommendation } from '../../services/api';
import { BarChart3 } from 'lucide-react';

interface FeatureAveragesWidgetProps {
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
}

export const FeatureAveragesWidget: React.FC<FeatureAveragesWidgetProps> = ({
  clusters,
  recommendations
}) => {
  const colors = [
    'bg-violet-500',
    'bg-emerald-500',
    'bg-blue-500',
    'bg-amber-500',
    'bg-pink-500',
  ];

  if (clusters.length === 0) {
    return null;
  }

  // Feature labels to display
  const metrics = [
    { key: 'energy', label: 'Energy 🔥', formatter: (val: number) => `${Math.round(val * 100)}%` },
    { key: 'valence', label: 'Valence (Happiness) ☀️', formatter: (val: number) => `${Math.round(val * 100)}%` },
    { key: 'acousticness', label: 'Acousticness 🎻', formatter: (val: number) => `${Math.round(val * 100)}%` },
    { key: 'danceability', label: 'Danceability 💃', formatter: (val: number) => `${Math.round(val * 100)}%` },
    { key: 'tempo', label: 'BPM (Tempo) ⚡', formatter: (val: number) => `${Math.round(val)} BPM` },
  ];

  return (
    <div className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-6 shadow-lg backdrop-blur-md">
      <div className="flex items-center space-x-2.5 mb-4">
        <BarChart3 className="w-5 h-5 text-violet-400" />
        <h3 className="text-lg font-bold text-white tracking-tight">Acoustic Profiles Comparison</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {metrics.map((metric) => {
          return (
            <div key={metric.key} className="bg-gray-950/20 border border-gray-850/60 p-4 rounded-xl flex flex-col justify-between">
              <span className="text-xs font-bold text-gray-300 block mb-3">{metric.label}</span>
              
              <div className="space-y-3">
                {clusters.map((cluster, idx) => {
                  const rec = recommendations.find(r => r.cluster_id === cluster.cluster_id);
                  const playlistName = rec ? rec.playlist_name : `Vibe ${cluster.cluster_id + 1}`;
                  const value = cluster.averages[metric.key as keyof typeof cluster.averages];
                  
                  // Scale width percentage (tempo is up to 200, others 0-1)
                  const percentage = metric.key === 'tempo' 
                    ? (value / 200) * 100 
                    : value * 100;
                    
                  const color = colors[idx % colors.length];

                  return (
                    <div key={cluster.cluster_id} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500 font-semibold truncate max-w-[120px]">{playlistName}</span>
                        <span className="text-gray-300 font-bold">{metric.formatter(value)}</span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${color}`} 
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
