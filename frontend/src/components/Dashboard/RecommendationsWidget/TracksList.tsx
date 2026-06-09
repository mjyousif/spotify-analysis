import React from 'react';
import { Music } from 'lucide-react';
import type { TrackData } from '../../../services/api';

interface TracksListProps {
  tracks: TrackData[];
  selectedTrack?: TrackData | null;
  onSelectTrack?: (track: TrackData) => void;
  tracksListRef: React.RefObject<HTMLDivElement | null>;
}

export const TracksList: React.FC<TracksListProps> = ({
  tracks,
  selectedTrack,
  onSelectTrack,
  tracksListRef,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-[160px]">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold block mb-2 text-left">Tracks in this split</span>
      <div
        ref={tracksListRef}
        className="flex-1 overflow-y-auto border border-gray-850/60 bg-gray-950/20 rounded-xl divide-y divide-gray-900/60 pr-1 max-h-[220px]"
      >
        {tracks.map((track) => {
          const isSelected = selectedTrack?.id === track.id;
          return (
            <button
              key={track.id}
              data-track-id={track.id}
              onClick={() => onSelectTrack?.(track)}
              className={`w-full text-left flex items-center space-x-3 p-2.5 transition-all duration-200 cursor-pointer focus:outline-none ${
                isSelected
                  ? 'bg-violet-500/10 border-l-2 border-l-violet-500 text-white'
                  : 'hover:bg-gray-950/30 border-l-2 border-l-transparent'
              }`}
            >
              <div className="w-8 h-8 bg-gray-800 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-850">
                {track.album_images && track.album_images.length > 0 ? (
                  <img src={track.album_images[track.album_images.length - 1].url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-4 h-4 text-gray-650" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h5 className={`text-xs font-semibold truncate ${isSelected ? 'text-violet-300' : 'text-gray-250'}`}>{track.name}</h5>
                <p className="text-[10px] text-gray-550 truncate mt-0.5">{track.artists}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
