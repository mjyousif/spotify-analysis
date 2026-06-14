import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Music } from 'lucide-react';
import type { ExcludedTrack } from '../../services/api';

interface ExcludedTracksAlertProps {
  excludedTracks?: ExcludedTrack[];
}

export const ExcludedTracksAlert: React.FC<ExcludedTracksAlertProps> = ({ excludedTracks }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  if (!excludedTracks || excludedTracks.length === 0) {
    return null;
  }

  const count = excludedTracks.length;

  return (
    <div className="bg-amber-950/10 border border-amber-500/20 rounded-2xl p-4 mb-6 shadow-xl animate-fadeIn transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/25 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-white tracking-tight">
              {count} {count === 1 ? 'Track' : 'Tracks'} Excluded From Clustering
            </h4>
            <p className="text-xs text-gray-400 mt-1 font-medium leading-relaxed">
              These tracks were omitted because their audio features could not be retrieved from ReccoBeats.
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-1.5 self-start sm:self-center px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-300 hover:text-amber-250 font-bold text-xs rounded-xl transition-all select-none cursor-pointer"
        >
          <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 border-t border-amber-500/15 pt-4 animate-slideDown">
          <div className="overflow-x-auto rounded-xl border border-gray-850/50 bg-gray-950/30">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-850/60 bg-gray-900/40 text-gray-500 font-bold tracking-wider uppercase text-[10px]">
                  <th className="px-4 py-3">Track</th>
                  <th className="px-4 py-3">Artist</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850/30">
                {excludedTracks.map((track) => (
                  <tr 
                    key={track.id} 
                    className="hover:bg-amber-500/5 transition-colors duration-150 group"
                  >
                    <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                      <Music className="w-3.5 h-3.5 text-amber-500/60 group-hover:text-amber-400 shrink-0" />
                      <span className="truncate max-w-[200px] sm:max-w-xs">{track.name}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-medium">
                      <span className="truncate max-w-[150px] sm:max-w-xs block">{track.artists}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        {track.reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
