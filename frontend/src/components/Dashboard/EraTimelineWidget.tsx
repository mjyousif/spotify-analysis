import React, { useMemo } from 'react';
import type { TrackData } from '../../services/api';
import { CalendarDays, Music } from 'lucide-react';

interface EraTimelineWidgetProps {
  tracks: TrackData[];
}

export const EraTimelineWidget: React.FC<EraTimelineWidgetProps> = ({ tracks }) => {
  const stats = useMemo<{
    decadeCounts: Record<string, number>;
    oldest: TrackData | null;
    newest: TrackData | null;
  } | null>(() => {
    if (!tracks || tracks.length === 0) return null;

    const decadeCounts: Record<string, number> = {
      'Pre-70s': 0,
      '70s': 0,
      '80s': 0,
      '90s': 0,
      '00s': 0,
      '10s': 0,
      '20s': 0
    };

    let oldest: TrackData | null = null;
    let newest: TrackData | null = null;

    for (const track of tracks) {
      if (!track.release_date) continue;
      
      // Extract year (first 4 characters)
      const year = parseInt(track.release_date.substring(0, 4));
      if (isNaN(year)) continue;

      // Track oldest & newest
      if (!oldest || year < parseInt(oldest.release_date.substring(0, 4))) {
        oldest = track;
      }
      if (!newest || year > parseInt(newest.release_date.substring(0, 4))) {
        newest = track;
      }

      // Decade bucket
      if (year < 1970) {
        decadeCounts['Pre-70s']++;
      } else if (year < 1980) {
        decadeCounts['70s']++;
      } else if (year < 1990) {
        decadeCounts['80s']++;
      } else if (year < 2000) {
        decadeCounts['90s']++;
      } else if (year < 2010) {
        decadeCounts['00s']++;
      } else if (year < 2020) {
        decadeCounts['10s']++;
      } else {
        decadeCounts['20s']++;
      }
    }

    return {
      decadeCounts,
      oldest,
      newest
    };
  }, [tracks]);

  if (!stats) return null;

  const totalDecadeTracks = Object.values(stats.decadeCounts).reduce((acc, count) => acc + count, 0);
  const maxCount = Math.max(...Object.values(stats.decadeCounts), 1);

  return (
    <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-between h-full min-h-[360px] text-left">
      <div>
        <div className="flex items-center space-x-2.5 mb-4">
          <div className="p-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Era Timeline</h3>
            <p className="text-[10px] text-gray-550">Release year distribution</p>
          </div>
        </div>

        {/* Decade Distribution Bars */}
        <div className="space-y-2 mt-4 select-none">
          {Object.entries(stats.decadeCounts).map(([decade, count]) => {
            const percentage = totalDecadeTracks > 0 ? Math.round((count / totalDecadeTracks) * 100) : 0;
            const barWidth = Math.round((count / maxCount) * 100);

            // Hide decade if there are no songs from it (keep it clean unless empty overall)
            if (count === 0) return null;

            return (
              <div key={decade} className="flex items-center text-xs">
                <span className="w-16 text-[10px] text-gray-400 font-bold uppercase tracking-wider">{decade}</span>
                <div className="flex-1 bg-gray-950 h-3.5 rounded-full overflow-hidden border border-gray-850/50 relative flex items-center">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-full transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  ></div>
                  {count > 0 && (
                    <span className="absolute left-2.5 text-[8px] font-black text-white/90">
                      {count} {count === 1 ? 'song' : 'songs'} ({percentage}%)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Extremes highlights */}
      <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-gray-850">
        {/* Oldest */}
        {stats.oldest && (
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Oldest Classic</span>
            <div className="flex items-center space-x-2.5 bg-gray-950/40 p-2 rounded-xl border border-gray-850">
              <div className="w-8 h-8 rounded bg-gray-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800">
                {stats.oldest.album_images && stats.oldest.album_images.length > 0 ? (
                  <img 
                    src={stats.oldest.album_images[stats.oldest.album_images.length - 1].url} 
                    alt={stats.oldest.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-bold text-gray-200 truncate">{stats.oldest.name}</h4>
                <p className="text-[9px] text-gray-450 truncate">Released: {stats.oldest.release_date.substring(0, 4)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Newest */}
        {stats.newest && (
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Newest Release</span>
            <div className="flex items-center space-x-2.5 bg-gray-950/40 p-2 rounded-xl border border-gray-850">
              <div className="w-8 h-8 rounded bg-gray-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800">
                {stats.newest.album_images && stats.newest.album_images.length > 0 ? (
                  <img 
                    src={stats.newest.album_images[stats.newest.album_images.length - 1].url} 
                    alt={stats.newest.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-bold text-gray-200 truncate">{stats.newest.name}</h4>
                <p className="text-[9px] text-gray-450 truncate">Released: {stats.newest.release_date.substring(0, 4)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
