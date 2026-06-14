import React, { useState, useEffect } from 'react';
import { X, BookOpen, Layers, Map, Info, HelpCircle, Sparkles } from 'lucide-react';
import type { DocumentationMetadata } from '../../services/api';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: DocumentationMetadata | null;
  initialTab?: 'algorithms' | 'projections';
  initialKey?: string;
  onApplySetting?: (type: 'algorithm' | 'projection', value: any) => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({
  isOpen,
  onClose,
  metadata,
  initialTab = 'algorithms',
  initialKey,
  onApplySetting,
}) => {
  const [activeTab, setActiveTab] = useState<'algorithms' | 'projections'>(initialTab);
  const [selectedKey, setSelectedKey] = useState<string>('');

  // Update selection when modal opens or initial values change
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialKey) {
        setSelectedKey(initialKey);
      } else if (metadata) {
        const firstKey = Object.keys(metadata[initialTab])[0];
        setSelectedKey(firstKey || '');
      }
    }
  }, [isOpen, initialTab, initialKey, metadata]);

  // Handle tab change
  const handleTabChange = (tab: 'algorithms' | 'projections') => {
    setActiveTab(tab);
    if (metadata) {
      const keys = Object.keys(metadata[tab]);
      if (keys.length > 0) {
        setSelectedKey(keys[0]);
      }
    }
  };

  if (!isOpen) return null;

  const currentTabItems = metadata ? metadata[activeTab] : {};
  const currentItem = currentTabItems ? currentTabItems[selectedKey] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-gray-950 border border-gray-850 rounded-2xl shadow-2xl overflow-hidden w-full max-w-4xl h-[80vh] flex flex-col md:flex-row z-10 animate-slideUp">
        
        {/* Mobile Header (Tabs) */}
        <div className="md:hidden flex items-center justify-between border-b border-gray-900 bg-gray-950 px-4 py-3">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-violet-400" />
            <span className="font-bold text-sm text-white">Documentation</span>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 hover:bg-gray-900 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-80 border-r border-gray-900 bg-gray-950/60 flex flex-col h-1/3 md:h-full">
          {/* Desktop Title */}
          <div className="hidden md:flex items-center space-x-2.5 px-6 py-5 border-b border-gray-900">
            <BookOpen className="w-5.5 h-5.5 text-violet-400" />
            <h3 className="text-base font-bold text-white tracking-tight">System Documentation</h3>
          </div>

          {/* Tab Selection */}
          <div className="flex p-2 gap-1 border-b border-gray-900">
            <button
              onClick={() => handleTabChange('algorithms')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'algorithms'
                  ? 'bg-violet-600/20 border border-violet-500/30 text-violet-350'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900/60 border border-transparent'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Algorithms
            </button>
            <button
              onClick={() => handleTabChange('projections')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'projections'
                  ? 'bg-violet-600/20 border border-violet-500/30 text-violet-350'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900/60 border border-transparent'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              Projections
            </button>
          </div>

          {/* List of items */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-row md:flex-col gap-1.5 scrollbar-thin scrollbar-thumb-gray-800">
            {metadata ? (
              Object.entries(currentTabItems).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-auto md:w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap md:whitespace-normal transition-all duration-200 border ${
                    selectedKey === key
                      ? 'bg-violet-500/10 border-violet-500/35 text-violet-350 font-bold'
                      : 'border-transparent text-gray-400 hover:text-gray-250 hover:bg-gray-900/30'
                  }`}
                >
                  {item.name}
                </button>
              ))
            ) : (
              <div className="text-gray-500 text-xs p-4 text-center">Loading metadata...</div>
            )}
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 bg-gray-950 flex flex-col h-2/3 md:h-full relative overflow-y-auto p-6 md:p-8 scrollbar-thin scrollbar-thumb-gray-800">
          
          {/* Close button (Desktop) */}
          <button 
            onClick={onClose}
            className="hidden md:flex absolute top-6 right-6 text-gray-400 hover:text-white p-1.5 hover:bg-gray-900 rounded-lg transition-colors border border-transparent hover:border-gray-850"
            title="Close Documentation"
          >
            <X className="w-5 h-5" />
          </button>

          {currentItem ? (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] bg-violet-950/40 border border-violet-900 text-violet-400 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                  {activeTab === 'algorithms' ? 'Clustering Algorithm' : '2D Map Projection'}
                </span>
                <h2 className="text-2xl font-bold text-white tracking-tight mt-3 mb-2">
                  {currentItem.name}
                </h2>
                <p className="text-sm text-gray-300 leading-relaxed font-medium bg-gray-900/40 border border-gray-850/60 p-4 rounded-xl">
                  {currentItem.description}
                </p>
              </div>

              <div className="space-y-3.5">
                <h4 className="text-xs font-bold uppercase text-gray-500 tracking-widest flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-violet-400" />
                  Detailed Explanation
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed bg-gray-900/10 border border-gray-900/50 p-4 rounded-xl">
                  {currentItem.help_text}
                </p>
              </div>

              {/* Specific custom widgets/tips for math or concept representation */}
              {selectedKey === 'kmeans' && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl text-xs text-emerald-400/90 leading-normal flex gap-3">
                  <HelpCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">When to choose K-Means:</span>
                    Best for average playlists with clearly defined vibes. It will try to group similar tempos and energies into equal-sized circular groups. If your playlist has heavy outliers, consider using DBSCAN.
                  </div>
                </div>
              )}

              {selectedKey === 'dbscan' && (
                <div className="p-4 bg-amber-950/20 border border-amber-900/30 rounded-xl text-xs text-amber-400/90 leading-normal flex gap-3">
                  <HelpCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">Handling Outliers:</span>
                    DBSCAN separates dense clusters from background noise. Tracks categorized as "Wildcards / Outliers" (Cluster -1) do not match the density requirement of any main vibe cluster. Use this to isolate off-theme songs!
                  </div>
                </div>
              )}

              {selectedKey === 'circumplex' && (
                <div className="p-4 bg-violet-950/20 border border-violet-900/30 rounded-xl text-xs text-violet-400/90 leading-normal flex gap-3">
                  <HelpCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">Emotional Quadrants mapping:</span>
                    <ul className="space-y-1 mt-1">
                      <li>• <b>Top-Right (High E, High V)</b>: Joyful, Upbeat, Danceable.</li>
                      <li>• <b>Bottom-Right (Low E, High V)</b>: Chill, Relaxing, Melodic.</li>
                      <li>• <b>Bottom-Left (Low E, Low V)</b>: Sad, Moody, Melancholic.</li>
                      <li>• <b>Top-Left (High E, Low V)</b>: Angry, Dark, Intense.</li>
                    </ul>
                  </div>
                </div>
              )}

              {selectedKey === 'llm_semantic' && (
                <div className="p-4 bg-cyan-950/20 border border-cyan-900/30 rounded-xl text-xs text-cyan-400/90 leading-normal flex gap-3">
                  <HelpCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">LLM Requirements:</span>
                    Requires a valid API key (Gemini, OpenAI, or Claude) or local model (LM Studio/Ollama) configured on the backend. If inactive, the system will fall back to K-Means.
                  </div>
                </div>
              )}

              {/* Recommended Pairings Section */}
              {onApplySetting && metadata && (
                <div className="pt-4 border-t border-gray-900 mt-6 space-y-3">
                  <h4 className="text-xs font-bold uppercase text-gray-500 tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Recommended Pairings
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeTab === 'algorithms' && currentItem.recommended_projections?.map((projKey) => {
                      const proj = metadata.projections[projKey];
                      if (!proj) return null;
                      return (
                        <button
                          key={projKey}
                          onClick={() => {
                            onApplySetting('projection', projKey);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-800 hover:border-violet-500/60 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                          title={`Click to switch map representation to ${proj.name}`}
                        >
                          Use Map: <span className="text-violet-405">{proj.name}</span>
                        </button>
                      );
                    })}
                    {activeTab === 'projections' && currentItem.recommended_algorithms?.map((algoKey) => {
                      const algo = metadata.algorithms[algoKey];
                      if (!algo) return null;
                      return (
                        <button
                          key={algoKey}
                          onClick={() => {
                            onApplySetting('algorithm', algoKey);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-gray-800 hover:border-violet-500/60 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                          title={`Click to switch clustering algorithm to ${algo.name}`}
                        >
                          Use Algo: <span className="text-violet-405">{algo.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 py-10">
              <BookOpen className="w-12 h-12 text-gray-800 mb-3 animate-pulse" />
              <p className="text-sm">Select a topic from the sidebar to view documentation.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
