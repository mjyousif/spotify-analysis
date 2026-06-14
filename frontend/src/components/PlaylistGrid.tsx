import React, { useState } from 'react';
import { Search, Music, Play, Globe, Library, Info, AlertTriangle, Link } from 'lucide-react';
import { apiService } from '../services/api';
import type { PlaylistInfo } from '../services/api';

interface PlaylistGridProps {
  playlists: PlaylistInfo[];
  onSelectPlaylist: (playlistId: string) => void;
  loading: boolean;
}

const SkeletonCard = () => (
  <div className="bg-gray-900/40 border border-gray-850 rounded-2xl p-4 animate-pulse flex flex-col justify-between h-72">
    <div>
      <div className="aspect-square w-full rounded-xl bg-gray-800/60 mb-4" />
      <div className="h-4 bg-gray-800/60 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-800/60 rounded w-1/2" />
    </div>
    <div className="flex items-center justify-between mt-4 border-t border-gray-800/40 pt-3">
      <div className="h-3 bg-gray-800/60 rounded w-1/4" />
      <div className="h-3 bg-gray-800/60 rounded w-1/3" />
    </div>
  </div>
);

export const PlaylistGrid: React.FC<PlaylistGridProps> = ({ playlists, onSelectPlaylist, loading }) => {
  const [activeTab, setActiveTab] = useState<'library' | 'search'>('library');
  
  // Library States
  const [searchTerm, setSearchTerm] = useState('');

  // Public Search States
  const [publicSearchTerm, setPublicSearchTerm] = useState('');
  const [publicPlaylists, setPublicPlaylists] = useState<PlaylistInfo[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [publicOffset, setPublicOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);

  // Filter local playlists
  const filteredPlaylists = playlists.filter(playlist => 
    playlist && (
      playlist.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (playlist.description && playlist.description.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  const handlePublicSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = publicSearchTerm.trim();
    if (!query) return;

    setPublicLoading(true);
    setPublicError(null);
    setHasSearched(true);
    setPublicOffset(0);

    try {
      const response = await apiService.searchPlaylists(query, 0);
      setPublicPlaylists(response.playlists ? response.playlists.filter(Boolean) : []);
      setHasMore(response.has_more);
    } catch (err: any) {
      console.error(err);
      setPublicError(
        err.response?.data?.detail || 
        err.message || 
        "Failed to fetch public playlist. Make sure it exists and is public."
      );
      setPublicPlaylists([]);
      setHasMore(false);
    } finally {
      setPublicLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadMoreLoading || !hasMore) return;
    const query = publicSearchTerm.trim();
    if (!query) return;

    setLoadMoreLoading(true);
    setPublicError(null);

    const nextOffset = publicOffset + 20;

    try {
      const response = await apiService.searchPlaylists(query, nextOffset);
      const newPlaylists = response.playlists ? response.playlists.filter(Boolean) : [];
      setPublicPlaylists(prev => [...prev, ...newPlaylists]);
      setPublicOffset(nextOffset);
      setHasMore(response.has_more);
    } catch (err: any) {
      console.error(err);
      setPublicError(
        err.response?.data?.detail || 
        err.message || 
        "Failed to fetch more playlists."
      );
    } finally {
      setLoadMoreLoading(false);
    }
  };


  const renderPlaylistCard = (playlist: PlaylistInfo) => {
    if (!playlist) return null;
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
          <span className="text-xs text-violet-400 font-semibold">{playlist.tracks?.total ?? 0} songs</span>
          <span className="text-[10px] text-gray-500 font-medium truncate max-w-[120px]">
            by {playlist.owner?.display_name || 'Spotify'}
          </span>
        </div>
      </div>
    );
  };

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
      {/* Header and Tab Selection */}
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-gray-800/60 pb-1 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Select a Playlist</h2>
          <p className="text-sm text-gray-400 mt-1">Choose a playlist from your account or import any public playlist to analyze its vibe distribution.</p>
        </div>

        {/* Premium Segmented Controls */}
        <div className="flex bg-gray-950/80 p-1 border border-gray-850 rounded-xl">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-xs transition-all duration-300 ${
              activeTab === 'library'
                ? 'bg-violet-650 text-white shadow-md shadow-violet-650/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span>My Library</span>
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-xs transition-all duration-300 ${
              activeTab === 'search'
                ? 'bg-violet-650 text-white shadow-md shadow-violet-650/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Search Spotify</span>
          </button>
        </div>
      </div>

      {/* Tab: My Library */}
      {activeTab === 'library' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-300">My Saved Playlists</h3>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Filter library playlists..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-900/60 border border-gray-850 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-550 focus:outline-none focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/30 transition-all duration-300"
              />
            </div>
          </div>

          {filteredPlaylists.length === 0 ? (
            <div className="text-center py-16 bg-gray-900/20 border border-gray-850/40 rounded-2xl">
              <p className="text-gray-550 font-medium">No playlists found matching "{searchTerm}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredPlaylists.map(renderPlaylistCard)}
            </div>
          )}
        </div>
      )}

      {/* Tab: Search Spotify */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Global Search Bar */}
          <form onSubmit={handlePublicSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search playlists, or paste a Spotify playlist URL, URI, or ID..."
                value={publicSearchTerm}
                onChange={(e) => setPublicSearchTerm(e.target.value)}
                className="w-full bg-gray-900/60 border border-gray-850 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-100 placeholder-gray-550 focus:outline-none focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/30 transition-all duration-300"
              />
            </div>
            <button
              type="submit"
              disabled={publicLoading || !publicSearchTerm.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:bg-violet-850 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all duration-300 shadow-lg shadow-violet-600/10 hover:shadow-violet-600/20 active:scale-[0.98]"
            >
              Search
            </button>
          </form>

          {/* Error Banner */}
          {publicError && (
            <div className="flex items-start gap-3 p-4 bg-red-950/20 border border-red-900/30 rounded-xl text-red-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
              <div className="text-sm">
                <span className="font-semibold">Import/Search Failed: </span>
                <span>{publicError}</span>
              </div>
            </div>
          )}

          {/* State Content */}
          {publicLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : !hasSearched ? (
            /* Search Landing State */
            <div className="max-w-2xl mx-auto text-center py-16 px-4 space-y-6">
              <div className="inline-flex p-4 bg-violet-950/20 border border-violet-900/20 rounded-2xl text-violet-400 shadow-inner">
                <Globe className="w-10 h-10 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-white tracking-tight">Explore Spotify's Public Library</h4>
                <p className="text-sm text-gray-450 max-w-md mx-auto leading-relaxed">
                  Analyze any public playlist on Spotify. Search for keywords, curators, genres, or import one directly using its details.
                </p>
              </div>

              {/* Direct Paste Info Panel */}
              <div className="bg-gray-950/40 border border-gray-850 rounded-2xl p-5 text-left max-w-lg mx-auto">
                <h5 className="flex items-center gap-2 text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">
                  <Link className="w-3.5 h-3.5" />
                  Direct Import Formats
                </h5>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li className="flex justify-between items-center gap-4">
                    <span className="font-semibold text-gray-300 shrink-0">Web URL</span>
                    <span className="font-mono text-gray-500 break-all select-all text-right">https://open.spotify.com/playlist/...</span>
                  </li>
                  <li className="flex justify-between items-center gap-4">
                    <span className="font-semibold text-gray-300 shrink-0">Spotify URI</span>
                    <span className="font-mono text-gray-500 break-all select-all text-right">spotify:playlist:37i9dQZF1...</span>
                  </li>
                  <li className="flex justify-between items-center gap-4">
                    <span className="font-semibold text-gray-300 shrink-0">Playlist ID</span>
                    <span className="font-mono text-gray-500 break-all select-all text-right">37i9dQZF1DXcBWIGmq5BmE</span>
                  </li>
                </ul>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800/40 text-[11px] text-gray-500">
                  <Info className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                  <span>Only public Spotify playlists can be imported using these formats.</span>
                </div>
              </div>
            </div>
          ) : publicPlaylists.length === 0 ? (
            <div className="text-center py-16 bg-gray-900/20 border border-gray-850/40 rounded-2xl">
              <p className="text-gray-550 font-medium">No public playlists found for "{publicSearchTerm}"</p>
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {publicPlaylists.map(renderPlaylistCard)}
              </div>
              
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadMoreLoading}
                    className="flex items-center space-x-2 bg-gray-900/60 hover:bg-gray-900 border border-gray-850 hover:border-violet-500/40 text-gray-300 hover:text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg shadow-black/10 active:scale-[0.98]"
                  >
                    {loadMoreLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading...</span>
                      </>
                    ) : (
                      <span>Load More</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
