import React, { useState } from 'react';
import { Search, Music, Play } from 'lucide-react';
import type { PlaylistInfo } from '../services/api';

interface PlaylistGridProps {
  playlists: PlaylistInfo[];
  onSelectPlaylist: (playlistId: string) => void;
  loading: boolean;
}

export const PlaylistGrid: React.FC<PlaylistGridProps> = ({ playlists, onSelectPlaylist, loading }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPlaylists = playlists.filter(playlist => 
    playlist.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (playlist.description && playlist.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 font-medium animate-pulse">Loading playlists from Spotify...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Select a Playlist</h2>
          <p className="text-sm text-gray-400">Choose a playlist from your account to analyze its vibe distribution.</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search playlists..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900/60 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/30 transition-all duration-300"
          />
        </div>
      </div>

      {/* Grid of Playlists */}
      {filteredPlaylists.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/20 border border-gray-800/40 rounded-2xl">
          <p className="text-gray-500 font-medium">No playlists found matching "{searchTerm}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredPlaylists.map((playlist) => {
            const imageUrl = playlist.images && playlist.images.length > 0 ? playlist.images[0].url : '';
            return (
              <div
                key={playlist.id}
                onClick={() => onSelectPlaylist(playlist.id)}
                className="group relative bg-gray-900/40 hover:bg-gray-900/70 border border-gray-850 hover:border-violet-500/40 rounded-2xl p-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-500/5 flex flex-col justify-between"
              >
                <div>
                  {/* Playlist Cover Image */}
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-gray-800 mb-4 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={playlist.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <Music className="w-12 h-12 text-gray-650" />
                    )}
                    
                    {/* Hover Play/Analyze Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="bg-violet-600 p-3.5 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300 text-white">
                        <Play className="w-5 h-5 fill-current" />
                      </div>
                    </div>
                  </div>

                  {/* Playlist metadata */}
                  <h3 className="font-bold text-gray-200 group-hover:text-white line-clamp-1 transition-colors duration-300">
                    {playlist.name}
                  </h3>
                  
                  {playlist.description && (
                    <p className="text-xs text-gray-550 line-clamp-1 mt-1 font-normal" dangerouslySetInnerHTML={{ __html: playlist.description }} />
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 border-t border-gray-800/40 pt-3">
                  <span className="text-xs text-violet-400 font-semibold">{playlist.tracks.total} songs</span>
                  <span className="text-[10px] text-gray-500 font-medium truncate max-w-[120px]">
                    by {playlist.owner.display_name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
