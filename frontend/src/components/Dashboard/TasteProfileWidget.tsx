import React from 'react';
import type { TrackData } from '../../services/api';
import { Compass, Music, Flame, Sparkles } from 'lucide-react';

interface TasteProfileWidgetProps {
  tracks: TrackData[];
}

export const TasteProfileWidget: React.FC<TasteProfileWidgetProps> = ({ tracks }) => {
  if (!tracks || tracks.length === 0) return null;

  // Calculate average popularity
  const validPopularityTracks = tracks.filter(t => t.popularity !== undefined);
  const avgPopularity = validPopularityTracks.length > 0
    ? Math.round(validPopularityTracks.reduce((acc, t) => acc + t.popularity, 0) / validPopularityTracks.length)
    : 50;

  // Determine taste description
  let tasteLabel = "Balanced / Cultured";
  let tasteColor = "text-fuchsia-400";
  let tasteDesc = "You enjoy a healthy mix of secret gems and popular anthems.";

  if (avgPopularity < 35) {
    tasteLabel = "Deeply Indie / Underground";
    tasteColor = "text-violet-400";
    tasteDesc = "You have an obscure, sub-radar taste, preferring hidden diamonds over radio hits.";
  } else if (avgPopularity > 70) {
    tasteLabel = "Mainstream / Billboard";
    tasteColor = "text-emerald-400";
    tasteDesc = "You love chart-topping anthems, high-production hits, and popular culture.";
  }

  // Find underground diamond (lowest popularity, prioritizing > 0 if available)
  const nonZeroPopularityTracks = validPopularityTracks.filter(t => t.popularity > 0);
  const searchList = nonZeroPopularityTracks.length > 0 ? nonZeroPopularityTracks : validPopularityTracks;
  const undergroundDiamond = searchList.length > 0
    ? searchList.reduce((min, t) => t.popularity < min.popularity ? t : min, searchList[0])
    : null;

  // Find crowd pleaser (highest popularity)
  const crowdPleaser = validPopularityTracks.length > 0
    ? validPopularityTracks.reduce((max, t) => t.popularity > max.popularity ? t : max, validPopularityTracks[0])
    : null;

  return (
    <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-between h-full min-h-[360px] text-left">
      <div>
        <div className="flex items-center space-x-2.5 mb-4">
          <div className="p-2 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 rounded-xl">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Taste Profile</h3>
            <p className="text-[10px] text-gray-500">Popularity & taste index</p>
          </div>
        </div>

        {/* Hipster Meter Slider */}
        <div className="space-y-3 mt-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] text-gray-450 uppercase font-bold tracking-wider">Hipster Meter</span>
            <span className={`text-xs font-black ${tasteColor}`}>{tasteLabel} ({avgPopularity}%)</span>
          </div>

          {/* Slider bar */}
          <div className="relative pt-4 pb-2">
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-emerald-500 relative">
              {/* Tracker pin */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-gray-950 shadow-md shadow-black/50 transition-all duration-500 -ml-2"
                style={{ left: `${avgPopularity}%` }}
              >
                <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 bg-gray-950 text-white font-bold text-[8px] px-1.5 py-0.5 rounded border border-gray-800 shadow whitespace-nowrap">
                  {avgPopularity}
                </div>
              </div>
            </div>
            <div className="flex justify-between text-[8px] text-gray-500 font-bold uppercase mt-3">
              <span>Indie (0)</span>
              <span>Balanced (50)</span>
              <span>Mainstream (100)</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-2 leading-relaxed">{tasteDesc}</p>
        </div>
      </div>

      {/* Highlights Grid */}
      <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-gray-850">
        {/* Diamond */}
        {undergroundDiamond && (
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-violet-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Underground Diamond</span>
            </div>
            <div className="flex items-center space-x-2.5 bg-gray-950/40 p-2 rounded-xl border border-gray-850">
              <div className="w-8 h-8 rounded bg-gray-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800">
                {undergroundDiamond.album_images && undergroundDiamond.album_images.length > 0 ? (
                  <img 
                    src={undergroundDiamond.album_images[undergroundDiamond.album_images.length - 1].url} 
                    alt={undergroundDiamond.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-bold text-gray-200 truncate">{undergroundDiamond.name}</h4>
                <p className="text-[9px] text-gray-450 truncate">Pop: {undergroundDiamond.popularity}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Pleaser */}
        {crowdPleaser && (
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5 text-emerald-400">
              <Flame className="w-3.5 h-3.5 fill-emerald-400/15" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Crowd Pleaser</span>
            </div>
            <div className="flex items-center space-x-2.5 bg-gray-950/40 p-2 rounded-xl border border-gray-850">
              <div className="w-8 h-8 rounded bg-gray-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800">
                {crowdPleaser.album_images && crowdPleaser.album_images.length > 0 ? (
                  <img 
                    src={crowdPleaser.album_images[crowdPleaser.album_images.length - 1].url} 
                    alt={crowdPleaser.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-bold text-gray-200 truncate">{crowdPleaser.name}</h4>
                <p className="text-[9px] text-gray-450 truncate">Pop: {crowdPleaser.popularity}%</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
