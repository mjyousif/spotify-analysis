import React from 'react';
import { LogOut, Music } from 'lucide-react';
import { spotifyAuth } from '../services/spotifyAuth';

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  showLogout?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, onLogout, showLogout = true }) => {
  const handleLogout = () => {
    spotifyAuth.logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-[#0d0e12] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(124,58,237,0.12),rgba(255,255,255,0))] text-gray-100 flex flex-col font-sans">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0d0e12]/70 border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 group">
          <div className="bg-gradient-to-tr from-violet-600 to-emerald-500 p-2.5 rounded-xl shadow-lg shadow-violet-500/20 group-hover:shadow-emerald-500/20 transition-all duration-300">
            <Music className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              VIBE SPLITTER
            </h1>
            <p className="text-xs text-gray-500 font-medium">Spotify Playlist Vibe Analyzer</p>
          </div>
        </div>

        {showLogout && (
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 bg-gray-900/60 hover:bg-red-950/30 text-gray-400 hover:text-red-400 border border-gray-800 hover:border-red-900/50 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
        {children}
      </main>

      {/* Premium Glass Footer */}
      <footer className="border-t border-gray-800/40 bg-gray-950/20 py-6 text-center text-sm text-gray-500">
        <p>© 2026 Spotify Vibe Splitter. Sourced via ReccoBeats & Spotify API.</p>
      </footer>
    </div>
  );
};
