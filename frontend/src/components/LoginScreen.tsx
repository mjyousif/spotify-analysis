import React from 'react';
import { Sparkles, Layers, Shuffle, AlertCircle, Music } from 'lucide-react';
import { Layout } from './Layout';

interface LoginScreenProps {
  authLoading: boolean;
  authError: string | null;
  isBackendConfigured: boolean;
  handleLogin: (e: React.FormEvent) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authLoading,
  authError,
  isBackendConfigured,
  handleLogin,
}) => {
  return (
    <Layout showLogout={false} onLogout={() => {}}>
      <div className="flex flex-col lg:flex-row items-center justify-between gap-12 py-10">
        
        {/* Left Text Pitch */}
        <div className="flex-1 space-y-6 text-left max-w-xl">
          <div className="inline-flex items-center space-x-2 bg-violet-500/10 border border-violet-500/20 px-3.5 py-1.5 rounded-full text-xs text-violet-400 font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 fill-violet-400/20" />
            <span>Smart Playlist Curation</span>
          </div>
          
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-[1.1]">
            Unclutter Your Playlists. <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent">
              Match the Vibes.
            </span>
          </h2>
          
          <p className="text-gray-400 text-base leading-relaxed">
            Vibe Splitter analyzes your Spotify playlist's acoustic DNA—tempo, energy, valence, and genres. It clusters similar songs using machine learning and splits them into distinct, cohesive playlists. No more jarring transitions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="flex items-start space-x-3 p-3 bg-gray-900/30 border border-gray-850 rounded-xl">
              <Layers className="w-5 h-5 text-violet-400 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-gray-200">Acoustic Clustering</h4>
                <p className="text-[10px] text-gray-550 mt-0.5">Analyze tracks based on BPM, energy, valence, and genre tags.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-gray-900/30 border border-gray-850 rounded-xl">
              <Shuffle className="w-5 h-5 text-emerald-400 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-gray-200">Interactive Split Mapping</h4>
                <p className="text-[10px] text-gray-550 mt-0.5">Plot playlists on a 2D canvas and rename vibe splits prior to export.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Login Widget */}
        <div className="w-full max-w-md bg-gray-900/40 border border-gray-800 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl shadow-violet-500/5 relative overflow-hidden flex flex-col justify-center">
          <div className="absolute top-0 left-0 w-32 h-32 bg-violet-600/5 rounded-full blur-3xl -ml-10 -mt-10"></div>
          
          <h3 className="text-lg font-bold text-white mb-2">Connect Spotify</h3>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            We authenticate securely via Spotify OAuth. Once connected, you can import and split your playlists directly.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-950/25 border border-red-900/40 p-3 rounded-xl text-left">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !isBackendConfigured}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-2 text-sm"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Music className="w-4 h-4" />
                  <span>Login with Spotify Account</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
};
