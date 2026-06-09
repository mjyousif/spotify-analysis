import React from 'react';
import { Music } from 'lucide-react';
import type { TrackData } from '../../services/api';

interface TrackDetailsPlayerProps {
  selectedTrack: TrackData;
  loadSpotifyEmbed: boolean;
  setLoadSpotifyEmbed: (load: boolean) => void;
}

export const TrackDetailsPlayer: React.FC<TrackDetailsPlayerProps> = ({
  selectedTrack,
  loadSpotifyEmbed,
  setLoadSpotifyEmbed,
}) => {
  return (
    <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 flex flex-col lg:flex-row items-stretch justify-between gap-6">
      {/* Spotify Embed Player & Genre Tags */}
      <div className="flex flex-col justify-between gap-3 w-full lg:max-w-md">
        {loadSpotifyEmbed ? (
          <iframe
            src={`https://open.spotify.com/embed/track/${selectedTrack.id}?utm_source=generator&theme=0`}
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="rounded-xl border-0 bg-transparent"
          />
        ) : (
          <div className="flex items-center space-x-4 h-[80px]">
            <div className="w-16 h-16 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-850">
              {selectedTrack.album_images && selectedTrack.album_images.length > 0 ? (
                <img
                  src={selectedTrack.album_images[selectedTrack.album_images.length - 1].url}
                  alt={selectedTrack.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-5 h-5 text-gray-550" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-white text-sm truncate">{selectedTrack.name}</h4>
              <p className="text-xs text-gray-400 truncate">by {selectedTrack.artists}</p>
            </div>
            <button
              onClick={() => setLoadSpotifyEmbed(true)}
              className="bg-violet-650 hover:bg-violet-550 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-violet-550/10 hover:shadow-violet-555/25 transition-all cursor-pointer flex items-center space-x-1.5 flex-shrink-0"
            >
              <Music className="w-3.5 h-3.5" />
              <span>Play Preview</span>
            </button>
          </div>
        )}
        {selectedTrack.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedTrack.genres.map((g, idx) => (
              <span key={idx} className="bg-gray-950 text-gray-500 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Simple Feature Radar/Progress bars for this track */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 bg-gray-950/20 border border-gray-850/60 p-4 rounded-xl flex-1 items-center max-w-xl">
        {Object.entries(selectedTrack.features)
          .filter(([key]) => key !== 'key' && key !== 'mode')
          .map(([key, val]) => {
            const label = key.toUpperCase();
            const pct = key === 'tempo' ? (val / 200) * 100 : val * 100;
            const displayVal = key === 'tempo' ? `${Math.round(val)} BPM` : `${Math.round(val * 100)}%`;

            return (
              <div key={key} className="text-center space-y-1">
                <span className="text-[8px] text-gray-500 font-bold tracking-wider block">{label}</span>
                <span className="text-[10px] text-gray-250 font-bold block">{displayVal}</span>
                <div className="w-full bg-gray-900 h-1 rounded-full overflow-hidden">
                  <div className="bg-violet-500 h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
