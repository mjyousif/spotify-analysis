import React from 'react';
import { Check, Loader2, Music, Tag, FileText, LayoutGrid, Compass, Sparkles } from 'lucide-react';

export interface ProgressState {
  stage: string;
  message: string;
  step: number;
  totalSteps?: number;
  total_steps?: number;
  current?: number;
  total?: number;
}

interface AnalysisProgressPanelProps {
  progress: ProgressState;
}

const STEPS = [
  { id: 1, name: 'Artist Genres', icon: Tag, description: 'Fetching artist genre profiles' },
  { id: 2, name: 'Audio Features', icon: Music, description: 'Retrieving acoustic features' },
  { id: 3, name: 'Lyric Analysis', icon: FileText, description: 'Fetching lyrics & analyzing mood' },
  { id: 4, name: 'Clustering', icon: LayoutGrid, description: 'Grouping tracks by musical vibe' },
  { id: 5, name: 'Map Projections', icon: Compass, description: 'Computing 2D/3D visual mappings' },
  { id: 6, name: 'AI Recommender', icon: Sparkles, description: 'Generating LLM recommendations' },
];

export const AnalysisProgressPanel: React.FC<AnalysisProgressPanelProps> = ({ progress }) => {
  const currentStep = progress.step;
  const totalSteps = progress.totalSteps ?? progress.total_steps ?? 6;
  
  // Calculate percentage progress through the whole pipeline
  // Step 0 is starting, step 6 is final complete
  const percentage = Math.min(
    100,
    Math.max(5, Math.round((currentStep / totalSteps) * 100))
  );

  return (
    <div className="w-full max-w-2xl mx-auto bg-gray-900/60 backdrop-blur-xl border border-gray-800/80 rounded-2xl p-6 md:p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.15)] transition-all duration-300">
      {/* Header section with pulsating neon bubble */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="space-y-1">
          <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
            </span>
            Vibe Analysis Engine
          </h3>
          <p className="text-xs text-gray-400 font-medium">
            Building your custom music landscape, please wait.
          </p>
        </div>
        <div className="bg-violet-950/30 border border-violet-800/40 rounded-full px-4 py-1.5 flex items-center gap-2 text-xs font-semibold text-violet-300 shadow-sm self-start md:self-auto">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
          <span>Step {currentStep} of {totalSteps}</span>
        </div>
      </div>

      {/* Modern custom animated progress bar */}
      <div className="mb-10 space-y-2">
        <div className="flex justify-between items-end text-xs font-bold tracking-wide text-gray-400 px-1">
          <span className="text-violet-400 uppercase tracking-widest">{progress.stage.replace('_', ' ')}</span>
          <span className="font-mono text-white text-sm">{percentage}%</span>
        </div>
        <div className="h-2.5 w-full bg-gray-950/80 rounded-full overflow-hidden border border-gray-800/50 p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-500 shadow-[0_0_12px_rgba(167,139,250,0.5)] transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        {/* Dynamic description message */}
        <div className="bg-gray-950/30 border border-gray-800/30 rounded-xl p-3 mt-3 flex items-center justify-between text-xs text-gray-300">
          <span className="font-medium animate-pulse">{progress.message}</span>
          {progress.stage === 'lyrics' && progress.current !== undefined && progress.total !== undefined && (
            <span className="font-mono bg-violet-900/20 border border-violet-850/40 text-violet-300 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
              {progress.current} / {progress.total} tracks
            </span>
          )}
        </div>
      </div>

      {/* Vertical steps map on mobile, horizontal on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STEPS.map((step) => {
          const StepIcon = step.icon;
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;
          
          let stateStyle = "border-gray-800/80 bg-gray-950/20 text-gray-500";
          let iconContainerStyle = "bg-gray-900 border-gray-850 text-gray-600";
          
          if (isCompleted) {
            stateStyle = "border-emerald-500/20 bg-emerald-950/10 text-gray-300";
            iconContainerStyle = "bg-emerald-950/30 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]";
          } else if (isActive) {
            stateStyle = "border-violet-500/30 bg-violet-950/10 text-white shadow-[0_0_20px_-5px_rgba(139,92,246,0.1)]";
            iconContainerStyle = "bg-violet-950/50 border-violet-500/50 text-violet-400 animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.3)]";
          }

          return (
            <div 
              key={step.id} 
              className={`flex items-start gap-3 border rounded-xl p-3.5 transition-all duration-300 ${stateStyle}`}
            >
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-300 ${iconContainerStyle}`}>
                {isCompleted ? (
                  <Check className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <StepIcon className="w-4 h-4" />
                )}
              </div>
              <div className="text-left space-y-0.5">
                <span className={`block text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-violet-400' : isCompleted ? 'text-emerald-400' : 'text-gray-500'}`}>
                  Step {step.id}
                </span>
                <span className="block text-xs font-bold text-white leading-tight">
                  {step.name}
                </span>
                <span className="block text-[10px] text-gray-400 truncate max-w-[150px]">
                  {step.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
