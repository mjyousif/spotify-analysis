import React, { useMemo } from 'react';
import type { TrackData } from '../../services/api';
import { Disc, CheckCircle2 } from 'lucide-react';
import { computeHarmonicSequence } from '../../utils/harmonicSort';

interface DJDeckWidgetProps {
  tracks: TrackData[];
}

export const DJDeckWidget: React.FC<DJDeckWidgetProps> = ({ tracks }) => {
  const djFlow = useMemo(() => {
    return computeHarmonicSequence(tracks);
  }, [tracks]);

  // Calculate stats
  const harmonicTransitionsCount = useMemo(() => {
    return djFlow.filter(item => item.transitionType === 'harmonic').length;
  }, [djFlow]);

  const percentageHarmonic = djFlow.length > 1
    ? Math.round((harmonicTransitionsCount / (djFlow.length - 1)) * 100)
    : 100;

  if (!tracks || tracks.length === 0) return null;

  return (
    <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-between h-full min-h-[360px] text-left">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <Disc className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">DJ Flow & Key Mix</h3>
              <p className="text-[10px] text-gray-550">Harmonic transitions analysis</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 bg-emerald-950/20 border border-emerald-900/40 text-[9px] font-bold text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{percentageHarmonic}% Blend Flow</span>
          </div>
        </div>

        {/* Info panel */}
        <p className="text-xs text-gray-400 leading-relaxed mb-4">
          By sequencing songs using their Camelot Wheel signatures, you get a smoother flow without key clashes. We've compiled your songs into a harmonically matched DJ set:
        </p>

        {/* DJ sequence list */}
        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 select-none custom-scrollbar">
          {djFlow.map((item, idx) => {
            const isOutlier = item.track.cluster === -1;
            return (
              <React.Fragment key={item.track.id}>
                {/* Transition marker */}
                {idx > 0 && (
                  <div className="flex items-center pl-8 py-0.5">
                    {item.transitionType === 'harmonic' ? (
                      <div className="flex items-center space-x-1.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-900/30">
                        <span>Harmonic Match</span>
                        {item.tempoDiff !== undefined && item.tempoDiff !== 0 && (
                          <span className="text-emerald-500/70">({item.tempoDiff > 0 ? '+' : ''}{item.tempoDiff} BPM)</span>
                        )}
                      </div>
                    ) : item.transitionType === 'tempo' ? (
                      <div className="flex items-center space-x-1.5 text-[8px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-900/30">
                        <span>Tempo Beat-Match</span>
                        {item.tempoDiff !== undefined && (
                          <span className="text-amber-500/70">({item.tempoDiff > 0 ? '+' : ''}{item.tempoDiff} BPM)</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-[8px] font-bold uppercase tracking-wider text-gray-500 bg-gray-950 px-2 py-0.5 rounded-full border border-gray-850">
                        <span>Vibe Shift Transition</span>
                        {item.tempoDiff !== undefined && (
                          <span className="text-gray-650">({item.tempoDiff > 0 ? '+' : ''}{item.tempoDiff} BPM)</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Track Row */}
                <div className={`flex items-center justify-between p-2 rounded-xl border transition-all ${isOutlier ? 'bg-gray-950/30 border-gray-900/50 opacity-70' : 'bg-gray-950/60 border-gray-850/80 hover:border-gray-800'}`}>
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-7 h-7 rounded bg-gray-900 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-850">
                      {item.track.album_images && item.track.album_images.length > 0 ? (
                        <img 
                          src={item.track.album_images[item.track.album_images.length - 1].url} 
                          alt={item.track.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Disc className="w-3.5 h-3.5 text-gray-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[10px] font-bold text-gray-200 truncate">{item.track.name}</h4>
                      <p className="text-[9px] text-gray-450 truncate">by {item.track.artists}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0 pl-2">
                    <span className="text-[9px] bg-gray-900 border border-gray-800 text-gray-400 font-bold px-1.5 py-0.5 rounded">
                      {Math.round(item.track.features.tempo)} BPM
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      item.camelotKey.endsWith('A') 
                        ? 'bg-violet-500/10 border border-violet-500/20 text-violet-400' 
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    }`}>
                      {item.camelotKey}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
