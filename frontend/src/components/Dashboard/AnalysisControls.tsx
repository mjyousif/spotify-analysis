import React from 'react';
import { Sliders, Info } from 'lucide-react';

interface AnalysisControlsProps {
  algorithm: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic';
  setAlgorithm: (algo: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic') => void;
  kValue: number;
  setKValue: (k: number) => void;
  recommendedK?: number | null;
  onUpdateMap: (customK?: number, customAlgo?: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic') => void;
  loading: boolean;
}

export const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  algorithm,
  setAlgorithm,
  kValue,
  setKValue,
  recommendedK,
  onUpdateMap,
  loading,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-4 bg-gray-900/40 border border-gray-800/80 px-4 py-3 rounded-2xl backdrop-blur-md">
      {/* Algorithm Select */}
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-400 font-bold">Algorithm:</span>
        <select
          value={algorithm}
          onChange={(e) => {
            const val = e.target.value as 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic';
            setAlgorithm(val);
            onUpdateMap(undefined, val);
          }}
          className="bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1 text-xs text-gray-250 font-bold focus:outline-none focus:border-violet-500 transition-colors"
        >
          <option value="kmeans">K-Means (Balanced)</option>
          <option value="agglomerative">Hierarchical (Deterministic)</option>
          <option value="dbscan">DBSCAN (Outliers Filter)</option>
          <option value="mood_mapping">Mood Mapping (2D Circumplex)</option>
          <option value="genre_first">Genre-First Hierarchical</option>
          <option value="llm_semantic">AI Semantic Splitting</option>
        </select>
      </div>

      {/* Split controls if not DBSCAN */}
      {algorithm !== 'dbscan' && (
        <div className="flex items-center space-x-4 border-l border-gray-800/80 pl-4">
          <div className="flex items-center space-x-2 text-xs text-gray-400 font-bold">
            <Sliders className="w-4 h-4 text-violet-400" />
            <span>Splits:</span>
          </div>
          <div className="flex items-center space-x-2 relative group">
            <input
              type="range"
              min="2"
              max="6"
              value={kValue}
              onChange={(e) => setKValue(parseInt(e.target.value))}
              className="w-36 h-2 bg-transparent rounded-lg cursor-pointer"
            />
            {recommendedK && (
              <div className="relative flex items-center">
                <Info className="w-3.5 h-3.5 text-gray-450 hover:text-violet-400 cursor-pointer transition-colors" />
                <div className="absolute bottom-full mb-2.5 right-1/2 translate-x-1/2 hidden group-hover:block w-48 bg-gray-950/95 border border-gray-800 text-[10px] text-gray-300 p-2.5 rounded-xl shadow-xl z-20 text-center leading-normal backdrop-blur-sm">
                  {recommendedK} vibes might be a good fit but you can change it.
                </div>
              </div>
            )}
          </div>
          <span className="text-xs font-bold text-white min-w-[50px]">{kValue} vibes</span>
          <button
            onClick={() => onUpdateMap(kValue, algorithm)}
            disabled={loading}
            className="bg-violet-650 hover:bg-violet-500 disabled:bg-violet-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Update Map
          </button>
        </div>
      )}
      
      {algorithm === 'dbscan' && (
        <div className="flex items-center space-x-2 border-l border-gray-800/80 pl-4">
          <span className="text-xs font-semibold text-gray-450 italic bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-850">
            Vibes auto-calculated
          </span>
        </div>
      )}
    </div>
  );
};
