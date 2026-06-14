import React from 'react';
import { AlertCircle } from 'lucide-react';

interface LlmErrorModalProps {
  error: string;
  onClose: () => void;
}

export const LlmErrorModal: React.FC<LlmErrorModalProps> = ({ error, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-850 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl relative">
        <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4 animate-bounce" />
        
        <h3 className="text-xl font-black text-white tracking-tight">AI Semantic Split Failed</h3>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          The AI clustering engine encountered an error while trying to process your playlist.
        </p>

        <div className="mt-4 p-4 bg-red-950/20 border border-red-900/30 rounded-2xl text-left max-h-40 overflow-y-auto">
          <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block mb-1">Error Details</span>
          <p className="text-xs text-red-300 font-mono break-words leading-relaxed">{error}</p>
        </div>

        <p className="text-xs text-violet-400 font-bold mt-4 animate-pulse">
          Switching explicitly to K-Means (Balanced)...
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full bg-violet-650 hover:bg-violet-550 text-white font-bold py-3.5 rounded-xl shadow-lg transition-colors cursor-pointer text-sm active:scale-[0.98]"
        >
          Got It
        </button>
      </div>
    </div>
  );
};
