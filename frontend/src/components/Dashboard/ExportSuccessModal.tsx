import React from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';

interface ExportedPlaylist {
  playlist_id: string;
  name: string;
  track_count: number;
}

interface ExportSuccessModalProps {
  exportedPlaylists: ExportedPlaylist[];
  onClose: () => void;
}

export const ExportSuccessModal: React.FC<ExportSuccessModalProps> = ({
  exportedPlaylists,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-850 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl relative">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4 animate-scaleUp" />
        
        <h3 className="text-2xl font-black text-white tracking-tight">Playlists Created!</h3>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          We successfully split your playlist and exported {exportedPlaylists.length} new vibe groupings onto your Spotify account.
        </p>

        <div className="mt-6 space-y-3 bg-gray-950/40 p-4 rounded-2xl border border-gray-850 text-left">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-2">New Playlists</span>
          {exportedPlaylists.map((playlist) => (
            <div key={playlist.playlist_id} className="flex items-center justify-between text-xs py-1">
              <span className="font-semibold text-gray-200 truncate max-w-[200px]">{playlist.name}</span>
              <a
                href={`https://open.spotify.com/playlist/${playlist.playlist_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 text-violet-400 hover:text-violet-300 font-bold"
              >
                <span>Open</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-violet-650 hover:bg-violet-550 text-white font-bold py-3.5 rounded-xl shadow-lg transition-colors cursor-pointer text-sm"
        >
          Return to Playlists List
        </button>
      </div>
    </div>
  );
};
