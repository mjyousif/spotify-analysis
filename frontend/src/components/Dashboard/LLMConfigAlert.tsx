import React from 'react';
import { Sparkles } from 'lucide-react';

interface LLMConfig {
  llm_active: boolean;
  llm_provider: string;
  llm_model: string;
}

interface LLMConfigAlertProps {
  llmConfig: LLMConfig;
}

export const LLMConfigAlert: React.FC<LLMConfigAlertProps> = ({ llmConfig }) => {
  return (
    <div className="mb-6 flex items-center justify-between p-4 bg-gray-900/20 border border-gray-850 rounded-2xl animate-fadeIn">
      <div className="flex items-center space-x-3">
        <div className={`p-2.5 rounded-xl ${llmConfig.llm_active ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="text-left">
          <h4 className="text-xs font-bold text-white">
            {llmConfig.llm_active ? 'AI Vibe Engine Active' : 'AI Vibe Engine Standby'}
          </h4>
          <p className="text-[10px] text-gray-550 mt-0.5 font-medium leading-relaxed text-left">
            {llmConfig.llm_active 
              ? `Powered by ${llmConfig.llm_provider.replace('_', ' ')} (${llmConfig.llm_model && llmConfig.llm_model.includes('/') ? llmConfig.llm_model.split('/')[1] : llmConfig.llm_model || 'default'})`
              : 'Setup local LLM (LM Studio / Ollama) or cloud API keys to enable automatic, creative playlist descriptors.'}
          </p>
        </div>
      </div>
      {llmConfig.llm_active ? (
        <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline-block">
          Online
        </span>
      ) : (
        <span className="text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline-block">
          Offline Mode
        </span>
      )}
    </div>
  );
};
