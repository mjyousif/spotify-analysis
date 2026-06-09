import React from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface IntegrationGuideProps {
  isGuideCollapsed: boolean;
  setIsGuideCollapsed: (collapsed: boolean) => void;
  guideTab: 'cloud' | 'lmstudio' | 'ollama';
  setGuideTab: (tab: 'cloud' | 'lmstudio' | 'ollama') => void;
}

export const IntegrationGuide: React.FC<IntegrationGuideProps> = ({
  isGuideCollapsed,
  setIsGuideCollapsed,
  guideTab,
  setGuideTab,
}) => {
  return (
    <div className={`mb-4 bg-gray-950/40 border border-gray-850 rounded-2xl p-4 flex flex-col transition-all duration-300 animate-fadeIn ${isGuideCollapsed ? 'space-y-0 py-3' : 'space-y-3'}`}>
      <button
        type="button"
        onClick={() => setIsGuideCollapsed(!isGuideCollapsed)}
        className="flex items-start justify-between w-full text-left text-amber-400 hover:text-amber-300 transition-colors focus:outline-none cursor-pointer"
      >
        <div className="flex items-start space-x-2.5 flex-1">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="text-xs flex-1">
            <p className="font-bold text-gray-200">AI Vibe Summaries Disabled</p>
            {isGuideCollapsed ? (
              <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed font-medium">
                No active LLM provider configured. Click to show configuration guide.
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed font-medium">
                No active LLM provider is configured. The application is using rule-based descriptors. Follow one of the tabs below to enable creative vibe analysis.
              </p>
            )}
          </div>
        </div>
        <div className="text-gray-500 hover:text-gray-300 mt-0.5 ml-2 flex-shrink-0">
          {isGuideCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </div>
      </button>
      
      {!isGuideCollapsed && (
        <>
          {/* Guide Tabs */}
          <div className="flex border-b border-gray-900 pb-px gap-1">
            {(['cloud', 'lmstudio', 'ollama'] as const).map((tab) => {
              const isActive = guideTab === tab;
              const labels = {
                cloud: 'Cloud APIs',
                lmstudio: 'LM Studio (Local)',
                ollama: 'Ollama (Local)'
              };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setGuideTab(tab)}
                  className={`px-3 py-1.5 border-b-2 text-[10px] font-bold transition-all cursor-pointer ${
                    isActive 
                      ? 'border-violet-500 text-violet-400 bg-violet-500/5' 
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Guide Tab Content */}
          <div className="text-[10px] text-gray-400 leading-normal font-medium space-y-2 pt-1">
            {guideTab === 'cloud' && (
              <div className="space-y-1 text-left">
                <p>To use cloud models (Gemini, OpenAI, Anthropic):</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9px] text-gray-500">
                  <li>Open <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">backend/.env</code> in your editor.</li>
                  <li>Provide your API key: e.g. <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">GEMINI_API_KEY=AIzaSy...</code></li>
                  <li>Restart the backend server. The app automatically detects keys.</li>
                </ol>
              </div>
            )}
            {guideTab === 'lmstudio' && (
              <div className="space-y-1 text-left">
                <p>To run local models using LM Studio:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9px] text-gray-500">
                  <li>Download and launch <a href="https://lmstudio.ai" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">LM Studio</a>.</li>
                  <li>Download a model (e.g. Qwen 2.5 7B, Llama 3.2 3B) and load it.</li>
                  <li>Enable the **Local Server** option in LM Studio (typically port <code className="text-gray-450">1234</code>).</li>
                  <li>Update your <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">backend/.env</code>:
                    <pre className="bg-gray-950 p-1.5 rounded text-[8px] text-gray-400 mt-1 block font-mono">
                      LLM_PROVIDER=lm_studio{"\n"}
                      LLM_MODEL=your-loaded-model-id  # Optional
                    </pre>
                  </li>
                  <li>Restart the backend server. No API keys are required.</li>
                </ol>
              </div>
            )}
            {guideTab === 'ollama' && (
              <div className="space-y-1 text-left">
                <p>To run local models using Ollama:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9px] text-gray-500">
                  <li>Download and install <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">Ollama</a>.</li>
                  <li>Pull and run a model from your terminal: <code className="bg-gray-950 px-1.5 py-0.5 rounded text-gray-400 block mt-1 w-fit font-mono">ollama run llama3.2</code></li>
                  <li>Verify Ollama is running (typically port <code className="text-gray-450">11434</code>).</li>
                  <li>Update your <code className="bg-gray-950 px-1 py-0.5 rounded text-gray-400">backend/.env</code>:
                    <pre className="bg-gray-950 p-1.5 rounded text-[8px] text-gray-400 mt-1 block font-mono">
                      LLM_PROVIDER=ollama{"\n"}
                      LLM_MODEL=llama3.2  # Matches pulled model
                    </pre>
                  </li>
                  <li>Restart the backend server. No API keys are required.</li>
                </ol>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
