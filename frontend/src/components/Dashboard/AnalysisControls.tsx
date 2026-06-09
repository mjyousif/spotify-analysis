import React, { useState, useEffect } from 'react';
import { Sliders, Info, Settings, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface AnalysisControlsProps {
  algorithm: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic';
  setAlgorithm: (algo: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic') => void;
  kValue: number;
  setKValue: (k: number) => void;
  genreWeight: number;
  setGenreWeight: (w: number) => void;
  eraWeight: number;
  setEraWeight: (w: number) => void;
  popularityWeight: number;
  setPopularityWeight: (w: number) => void;
  lyricsWeight: number;
  setLyricsWeight: (w: number) => void;
  recommendedK?: number | null;
  onUpdateMap: (
    customK?: number, 
    customAlgo?: 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic',
    genreWeight?: number,
    eraWeight?: number,
    popularityWeight?: number,
    lyricsWeight?: number
  ) => void;
  loading: boolean;
}

type PresetName = 'audio' | 'balanced' | 'genre' | 'lyrics' | 'custom';

export const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  algorithm,
  setAlgorithm,
  kValue,
  setKValue,
  genreWeight,
  setGenreWeight,
  eraWeight,
  setEraWeight,
  popularityWeight,
  setPopularityWeight,
  lyricsWeight,
  setLyricsWeight,
  recommendedK,
  onUpdateMap,
  loading,
}) => {
  const [showTuning, setShowTuning] = useState<boolean>(false);
  const [preset, setPreset] = useState<PresetName>('audio');

  // Sync preset name when weights change
  useEffect(() => {
    if (genreWeight === 0.0 && eraWeight === 0.0 && popularityWeight === 0.0 && lyricsWeight === 0.0) {
      setPreset('audio');
    } else if (genreWeight === 1.0 && eraWeight === 1.5 && popularityWeight === 0.5 && lyricsWeight === 0.5) {
      setPreset('balanced');
    } else if (genreWeight === 2.0 && eraWeight === 0.5 && popularityWeight === 0.2 && lyricsWeight === 0.2) {
      setPreset('genre');
    } else if (genreWeight === 0.5 && eraWeight === 0.5 && popularityWeight === 0.2 && lyricsWeight === 2.0) {
      setPreset('lyrics');
    } else {
      setPreset('custom');
    }
  }, [genreWeight, eraWeight, popularityWeight, lyricsWeight]);

  const handleApplyPreset = (name: PresetName) => {
    setPreset(name);
    if (name === 'audio') {
      setGenreWeight(0.0);
      setEraWeight(0.0);
      setPopularityWeight(0.0);
      setLyricsWeight(0.0);
    } else if (name === 'balanced') {
      setGenreWeight(1.0);
      setEraWeight(1.5);
      setPopularityWeight(0.5);
      setLyricsWeight(0.5);
    } else if (name === 'genre') {
      setGenreWeight(2.0);
      setEraWeight(0.5);
      setPopularityWeight(0.2);
      setLyricsWeight(0.2);
    } else if (name === 'lyrics') {
      setGenreWeight(0.5);
      setEraWeight(0.5);
      setPopularityWeight(0.2);
      setLyricsWeight(2.0);
    }
  };

  const triggerUpdate = () => {
    onUpdateMap(kValue, algorithm, genreWeight, eraWeight, popularityWeight, lyricsWeight);
  };

  return (
    <div className="flex flex-col gap-3 bg-gray-900/40 border border-gray-800/80 px-4 py-3.5 rounded-2xl backdrop-blur-md shadow-lg w-full md:w-auto">
      {/* Primary controls row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Algorithm Select */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400 font-bold">Algorithm:</span>
          <select
            value={algorithm}
            onChange={(e) => {
              const val = e.target.value as 'kmeans' | 'agglomerative' | 'dbscan' | 'mood_mapping' | 'genre_first' | 'llm_semantic';
              setAlgorithm(val);
              onUpdateMap(kValue, val, genreWeight, eraWeight, popularityWeight, lyricsWeight);
            }}
            className="bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1.5 text-xs text-gray-250 font-bold focus:outline-none focus:border-violet-500 transition-colors"
          >
            <option value="kmeans">K-Means (Balanced)</option>
            <option value="agglomerative">Hierarchical (Deterministic)</option>
            <option value="dbscan">DBSCAN (Outliers Filter)</option>
            <option value="mood_mapping">Mood Mapping (2D Circumplex)</option>
            <option value="genre_first">Genre-First Hierarchical</option>
            <option value="llm_semantic">AI Semantic Splitting</option>
          </select>
        </div>

        {/* Splits slider if not DBSCAN */}
        {algorithm !== 'dbscan' && (
          <div className="flex flex-wrap items-center gap-4 border-l border-gray-800/80 pl-4">
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
                className="w-28 md:w-36 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
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
          </div>
        )}

        {algorithm === 'dbscan' && (
          <div className="flex items-center space-x-2 border-l border-gray-800/80 pl-4">
            <span className="text-xs font-semibold text-gray-450 italic bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-850">
              Vibes auto-calculated
            </span>
          </div>
        )}

        {/* Advanced Settings Toggle & Update Trigger */}
        <div className="flex items-center gap-2 border-l border-gray-800/80 pl-4 ml-auto">
          <button
            onClick={() => setShowTuning(!showTuning)}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
              showTuning || preset !== 'audio'
                ? 'bg-violet-950/30 border-violet-850/80 text-violet-300'
                : 'bg-gray-950 border-gray-850 text-gray-400 hover:text-gray-250'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Tune Vibe</span>
            {showTuning ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={triggerUpdate}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-violet-850 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-all shadow-md shadow-violet-500/10 cursor-pointer hover:shadow-violet-500/20 active:scale-[0.98]"
          >
            Update Map
          </button>
        </div>
      </div>

      {/* Advanced Weights Collapsible Section */}
      {showTuning && (
        <div className="mt-1.5 pt-3.5 border-t border-gray-800/60 flex flex-col gap-4 animate-fadeIn">
          {/* Preset selector */}
          <div className="flex items-center space-x-3 bg-gray-950/40 p-2.5 rounded-xl border border-gray-850/65">
            <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <span className="text-xs font-bold text-gray-300">Tuning Preset:</span>
            <select
              value={preset}
              onChange={(e) => handleApplyPreset(e.target.value as PresetName)}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1 text-xs text-gray-250 font-bold focus:outline-none focus:border-violet-500 transition-colors ml-auto cursor-pointer"
            >
              <option value="audio">Pure Audio (Classic)</option>
              <option value="balanced">Balanced Mix (Recommended)</option>
              <option value="genre">Genre-Focused</option>
              <option value="lyrics">Lyric/Sentiment Focus</option>
              <option value="custom" disabled>Custom (Modified Sliders)</option>
            </select>
          </div>

          {/* Sliders Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 px-1">
            {/* Genre weight */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-gray-400">
                <span>Genre Influence</span>
                <span className={`${genreWeight > 0 ? 'text-violet-400' : 'text-gray-500'}`}>{genreWeight.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={genreWeight}
                onChange={(e) => {
                  setGenreWeight(parseFloat(e.target.value));
                  setPreset('custom');
                }}
                className="h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <span className="text-[9px] text-gray-550 leading-tight">Separates distinct music genres</span>
            </div>

            {/* Era weight */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-gray-400">
                <span>Era (Decade) Influence</span>
                <span className={`${eraWeight > 0 ? 'text-violet-400' : 'text-gray-500'}`}>{eraWeight.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={eraWeight}
                onChange={(e) => {
                  setEraWeight(parseFloat(e.target.value));
                  setPreset('custom');
                }}
                className="h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <span className="text-[9px] text-gray-550 leading-tight">Separates 75s, 90s, modern eras</span>
            </div>

            {/* Popularity weight */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-gray-400">
                <span>Popularity Influence</span>
                <span className={`${popularityWeight > 0 ? 'text-violet-400' : 'text-gray-500'}`}>{popularityWeight.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={popularityWeight}
                onChange={(e) => {
                  setPopularityWeight(parseFloat(e.target.value));
                  setPreset('custom');
                }}
                className="h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <span className="text-[9px] text-gray-550 leading-tight">Separates hits from underground tracks</span>
            </div>

            {/* Lyrics weight */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-gray-400">
                <span>Lyrics Influence</span>
                <span className={`${lyricsWeight > 0 ? 'text-violet-400' : 'text-gray-500'}`}>{lyricsWeight.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={lyricsWeight}
                onChange={(e) => {
                  setLyricsWeight(parseFloat(e.target.value));
                  setPreset('custom');
                }}
                className="h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <span className="text-[9px] text-gray-550 leading-tight">Separates sad, joyful, angry lyrics</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
