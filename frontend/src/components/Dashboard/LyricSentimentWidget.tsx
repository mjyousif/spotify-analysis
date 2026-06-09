import React, { useState, useMemo, useEffect } from 'react';
import { apiService } from '../../services/api';
import type { TrackData, LyricsAnalysisData, TrackLyricAnalysis } from '../../services/api';
import { 
  BookOpen, Sparkles, Smile, Heart, Frown, Flame, 
  HelpCircle, ChevronDown, AlignLeft, Info, RefreshCw
} from 'lucide-react';

interface LyricSentimentWidgetProps {
  playlistId: string;
  tracks: TrackData[];
  selectedTrack: TrackData | null;
  onSelectTrack: (track: TrackData) => void;
}

export const LyricSentimentWidget: React.FC<LyricSentimentWidgetProps> = ({
  playlistId,
  tracks,
  selectedTrack,
  onSelectTrack
}) => {
  const [activeTab, setActiveTab] = useState<'playlist' | 'track'>('playlist');
  const [localSelectedTrackId, setLocalSelectedTrackId] = useState<string>('');
  
  // Dynamic Loading States
  const [loadedTracks, setLoadedTracks] = useState<Record<string, TrackLyricAnalysis>>({});
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Playlist Vibe states
  const [playlistAnalysis, setPlaylistAnalysis] = useState<LyricsAnalysisData | null>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState<boolean>(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);

  // Sync local selection with parent global selected track and trigger fetch
  useEffect(() => {
    if (selectedTrack) {
      setLocalSelectedTrackId(selectedTrack.id);
      setActiveTab('track'); // Auto-switch to track tab to display lyrics on selection
    } else if (tracks && tracks.length > 0 && !localSelectedTrackId) {
      setLocalSelectedTrackId(tracks[0].id);
    }
  }, [selectedTrack, tracks]);

  // Trigger single track lyrics fetch when local selection changes
  useEffect(() => {
    if (!localSelectedTrackId || !playlistId) return;

    // Return if already loaded
    if (loadedTracks[localSelectedTrackId]) {
      return;
    }

    const track = tracks.find(t => t.id === localSelectedTrackId);
    if (!track) return;

    setLoadingTrackId(localSelectedTrackId);
    setTrackError(null);

    // Call dynamic on-demand track lyrics API
    apiService.getTrackLyrics(
      track.id,
      track.name,
      track.artists,
      '', // album name is resolved backend-side
      track.duration_ms || 0,
      track.features.valence,
      track.features.energy
    )
      .then((data) => {
        setLoadedTracks(prev => ({
          ...prev,
          [localSelectedTrackId]: data
        }));
      })
      .catch((err) => {
        console.error("Failed to lazy load lyrics:", err);
        setTrackError(err.message || "Failed to load lyrics.");
      })
      .finally(() => {
        setLoadingTrackId(null);
      });

  }, [localSelectedTrackId, playlistId, tracks, loadedTracks]);

  // Run playlist-wide batch analysis on demand
  const handleAnalyzePlaylistVibe = () => {
    if (!playlistId) return;
    setLoadingPlaylist(true);
    setPlaylistError(null);

    apiService.getPlaylistLyricsAnalysis(playlistId)
      .then((data) => {
        setPlaylistAnalysis(data);
        // Pre-fill local loaded tracks with batch data to save network calls
        if (data.tracks) {
          setLoadedTracks(prev => ({
            ...prev,
            ...data.tracks
          }));
        }
      })
      .catch((err) => {
        console.error("Failed to run batch lyrics analysis:", err);
        setPlaylistError(err.message || "Failed to analyze playlist vibe.");
      })
      .finally(() => {
        setLoadingPlaylist(false);
      });
  };

  // Handle local track selection dropdown changes
  const handleLocalTrackChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = e.target.value;
    setLocalSelectedTrackId(tid);
    const track = tracks.find(t => t.id === tid);
    if (track) {
      onSelectTrack(track);
    }
  };

  // Find analysis details for the focused track
  const trackAnalysis = useMemo<TrackLyricAnalysis | null>(() => {
    if (!localSelectedTrackId) return null;
    return loadedTracks[localSelectedTrackId] || null;
  }, [loadedTracks, localSelectedTrackId]);

  // Map mood names to colors, icons, and labels
  const getMoodMeta = (mood: string) => {
    const norm = mood.toLowerCase().trim();
    if (norm.includes('joy') || norm.includes('happy') || norm.includes('uplift')) {
      return {
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10 border-emerald-500/20',
        icon: <Smile className="w-4 h-4 text-emerald-400" />,
        label: 'Joyful'
      };
    }
    if (norm.includes('romance') || norm.includes('love') || norm.includes('passion')) {
      return {
        color: 'text-fuchsia-400',
        bg: 'bg-fuchsia-500/10 border-fuchsia-500/20',
        icon: <Heart className="w-4 h-4 text-fuchsia-400" />,
        label: 'Romantic'
      };
    }
    if (norm.includes('melanchol') || norm.includes('sad') || norm.includes('blue') || norm.includes('grief')) {
      return {
        color: 'text-violet-400',
        bg: 'bg-violet-500/10 border-violet-500/20',
        icon: <Frown className="w-4 h-4 text-violet-400" />,
        label: 'Melancholic'
      };
    }
    if (norm.includes('angr') || norm.includes('rage') || norm.includes('intense') || norm.includes('aggress')) {
      return {
        color: 'text-red-400',
        bg: 'bg-red-500/10 border-red-500/20',
        icon: <Flame className="w-4 h-4 text-red-400" />,
        label: 'Intense/Angry'
      };
    }
    if (norm.includes('peace') || norm.includes('calm') || norm.includes('reflect')) {
      return {
        color: 'text-teal-400',
        bg: 'bg-teal-500/10 border-teal-500/20',
        icon: <Sparkles className="w-4 h-4 text-teal-400" />,
        label: 'Peaceful'
      };
    }
    if (norm.includes('instrumental')) {
      return {
        color: 'text-slate-400',
        bg: 'bg-slate-500/10 border-slate-500/20',
        icon: <BookOpen className="w-4 h-4 text-slate-400" />,
        label: 'Instrumental'
      };
    }
    return {
      color: 'text-gray-400',
      bg: 'bg-gray-500/10 border-gray-500/20',
      icon: <HelpCircle className="w-4 h-4 text-gray-400" />,
      label: mood ? mood.charAt(0).toUpperCase() + mood.slice(1) : 'Unknown'
    };
  };

  // Color classes map for word cloud styling
  const cloudColors = [
    'text-violet-400 hover:text-violet-300 hover:scale-105',
    'text-fuchsia-400 hover:text-fuchsia-300 hover:scale-105',
    'text-emerald-400 hover:text-emerald-300 hover:scale-105',
    'text-teal-400 hover:text-teal-300 hover:scale-105',
    'text-red-400 hover:text-red-300 hover:scale-105',
    'text-sky-400 hover:text-sky-300 hover:scale-105',
    'text-amber-400 hover:text-amber-300 hover:scale-105'
  ];

  // Prepare Donut Chart segments if batch analysis exists
  const segmentsData = useMemo(() => {
    if (!playlistAnalysis || !playlistAnalysis.playlist_sentiment) return { segments: [], total: 0, average: 0 };
    const sentiment = playlistAnalysis.playlist_sentiment;
    const moodDistribution = sentiment.mood_distribution || {};

    const donutData = Object.entries(moodDistribution)
      .filter(([_, count]) => count > 0)
      .map(([mood, count]) => ({
        name: mood,
        count,
        meta: getMoodMeta(mood)
      }));

    const total = donutData.reduce((acc, d) => acc + d.count, 0);

    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    
    let accumulatedPercent = 0;
    const segments = donutData.map((d) => {
      const fraction = total > 0 ? d.count / total : 0;
      const strokeDash = fraction * circumference;
      const strokeOffset = circumference - strokeDash + (accumulatedPercent * circumference);
      accumulatedPercent += fraction;
      return {
        ...d,
        strokeDash,
        strokeOffset
      };
    });

    return {
      segments,
      total,
      average: sentiment.average_sentiment
    };
  }, [playlistAnalysis]);

  return (
    <div className="bg-gray-900/40 border border-gray-800/60 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col h-full min-h-[420px] text-left select-none">
      
      {/* Widget Header & Tab Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-850 pb-3.5">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Lyrical Analysis</h3>
            <p className="text-[10px] text-gray-550">Lyrical mood & sentiment scanner</p>
          </div>
        </div>
        
        {/* Tab Controls */}
        <div className="flex p-0.5 bg-gray-950 border border-gray-850 rounded-xl max-w-fit self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('playlist')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === 'playlist' 
                ? 'bg-violet-650 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Playlist Vibe
          </button>
          <button
            onClick={() => setActiveTab('track')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              activeTab === 'track' 
                ? 'bg-violet-650 text-white shadow-md' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Track Focus
          </button>
        </div>
      </div>

      {/* TAB 1: Playlist Vibe Summary */}
      {activeTab === 'playlist' && (
        <div className="flex flex-col justify-between flex-1">
          {loadingPlaylist ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-10">
              <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
              <span className="text-xs text-gray-500 animate-pulse">Running Batch Lyrical Analysis...</span>
            </div>
          ) : playlistAnalysis ? (
            <div className="flex flex-col justify-between flex-1 space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                
                {/* SVG Donut Chart */}
                <div className="flex items-center justify-center relative py-2">
                  {segmentsData.total > 0 ? (
                    <>
                      <svg width="120" height="120" viewBox="0 0 100 100" className="transform -rotate-90">
                        <circle
                          cx="50"
                          cy="50"
                          r="36"
                          fill="transparent"
                          stroke="#111827"
                          strokeWidth="10"
                        />
                        {segmentsData.segments.map((seg, idx) => {
                          let strokeColor = '#6b7280';
                          const label = seg.name.toLowerCase();
                          if (label.includes('joy') || label.includes('happy')) strokeColor = '#10b981';
                          else if (label.includes('roman') || label.includes('love')) strokeColor = '#d946ef';
                          else if (label.includes('melan') || label.includes('sad')) strokeColor = '#8b5cf6';
                          else if (label.includes('angr') || label.includes('rage')) strokeColor = '#ef4444';
                          else if (label.includes('peace') || label.includes('calm')) strokeColor = '#14b8a6';
                          else if (label.includes('instr')) strokeColor = '#64748b';

                          return (
                            <circle
                              key={idx}
                              cx="50"
                              cy="50"
                              r="36"
                              fill="transparent"
                              stroke={strokeColor}
                              strokeWidth="10"
                              strokeDasharray={`${seg.strokeDash} 226.19`}
                              strokeDashoffset={seg.strokeOffset}
                              strokeLinecap="round"
                              className="transition-all duration-1000 ease-out"
                            />
                          );
                        })}
                      </svg>
                      
                      {/* Inside Text Center */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[9px] text-gray-550 uppercase font-black tracking-wider">Avg Score</span>
                        <span className="text-sm font-extrabold text-white">
                          {segmentsData.average >= 0 ? '+' : ''}
                          {segmentsData.average.toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">No mood data to display</div>
                  )}
                </div>

                {/* Legend */}
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {segmentsData.segments.map((seg, idx) => {
                    const pct = segmentsData.total > 0 ? Math.round((seg.count / segmentsData.total) * 100) : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            seg.name.includes('joy') ? 'bg-emerald-500' :
                            seg.name.includes('roman') ? 'bg-fuchsia-500' :
                            seg.name.includes('melan') ? 'bg-violet-500' :
                            seg.name.includes('angr') ? 'bg-red-500' :
                            seg.name.includes('peace') ? 'bg-teal-500' : 'bg-slate-500'
                          }`}></div>
                          <span className="font-bold text-gray-300">{seg.meta.label}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-semibold">{seg.count} songs ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Emotional Tag Cloud */}
              <div className="pt-3 border-t border-gray-850/50">
                <span className="text-[9px] text-gray-550 font-black uppercase tracking-wider block mb-2">Dominant Emotional Words</span>
                <div className="flex flex-wrap gap-2 max-h-[90px] overflow-y-auto select-none p-1">
                  {playlistAnalysis.playlist_sentiment.top_words && playlistAnalysis.playlist_sentiment.top_words.length > 0 ? (
                    playlistAnalysis.playlist_sentiment.top_words.slice(0, 15).map((w, idx) => {
                      const maxVal = Math.max(...playlistAnalysis.playlist_sentiment.top_words.map(x => x.value), 1);
                      const scale = w.value / maxVal;
                      const fontSizeClass = scale > 0.7 ? 'text-xs font-black' : scale > 0.4 ? 'text-[11px] font-extrabold' : 'text-[10px] font-bold';
                      const colorClass = cloudColors[idx % cloudColors.length];

                      return (
                        <span 
                          key={idx} 
                          className={`px-2 py-0.5 bg-gray-950 border border-gray-850/60 rounded-lg tracking-wide shadow-sm transform transition-all cursor-default ${fontSizeClass} ${colorClass}`}
                          title={`Frequency: ${w.value}`}
                        >
                          {w.text}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-gray-550 italic">No emotional tags extracted</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Standby State: click to analyze */
            <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4">
              <Sparkles className="w-8 h-8 text-violet-400 animate-pulse" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Analyze Playlist Lyrical Vibe</h4>
                <p className="text-[10px] text-gray-500 mt-1 max-w-xs leading-relaxed">
                  Triggers batch processing of all track lyrics to build the mood distribution donut chart and word cloud.
                </p>
              </div>
              
              {playlistError && (
                <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-900/40 p-2 rounded-xl">
                  {playlistError}
                </div>
              )}

              <button
                onClick={handleAnalyzePlaylistVibe}
                className="bg-violet-650 hover:bg-violet-550 text-white font-bold py-2 px-4 rounded-xl text-[10px] uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-violet-650/10"
              >
                Scan Playlist Vibe
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Individual Track Lyrics Focus */}
      {activeTab === 'track' && (
        <div className="flex flex-col justify-between flex-1 space-y-3">
          
          {/* Dropdown Selector */}
          <div className="flex items-center space-x-2.5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider flex-shrink-0">Track:</span>
            <div className="relative flex-1">
              <select
                value={localSelectedTrackId}
                onChange={handleLocalTrackChange}
                className="w-full bg-gray-950 border border-gray-850 hover:border-gray-755 text-xs font-bold text-gray-250 py-1.5 pl-3 pr-8 rounded-xl appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
              >
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (by {t.artists})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-450 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {loadingTrackId === localSelectedTrackId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 space-y-2">
              <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
              <span className="text-[10px] text-gray-500 animate-pulse">Loading Lyrical Analysis...</span>
            </div>
          ) : trackError && !trackAnalysis ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 space-y-2">
              <HelpCircle className="w-6 h-6 text-red-400" />
              <span className="text-[10px] text-gray-400">{trackError}</span>
            </div>
          ) : trackAnalysis ? (
            <div className="space-y-3 animate-fadeIn flex-1 flex flex-col justify-between">
              
              {/* Vibe Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                
                {/* Mood Badge & Themes */}
                <div className="space-y-2 text-left">
                  <div className="flex items-center space-x-2">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Vibe:</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getMoodMeta(trackAnalysis.mood).bg} ${getMoodMeta(trackAnalysis.mood).color}`}>
                      {getMoodMeta(trackAnalysis.mood).icon}
                      <span>{getMoodMeta(trackAnalysis.mood).label}</span>
                    </span>
                  </div>
                  
                  {trackAnalysis.key_themes && trackAnalysis.key_themes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[9px] text-gray-550 font-bold uppercase tracking-wider self-center mr-1">Themes:</span>
                      {trackAnalysis.key_themes.map((t, idx) => (
                        <span key={idx} className="bg-gray-950 border border-gray-850 text-gray-400 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sentiment Gauge */}
                <div className="space-y-1 text-left">
                  <div className="flex items-center justify-between text-[9px] text-gray-550 font-bold uppercase tracking-wider">
                    <span>Sentiment Balance</span>
                    <span className={trackAnalysis.sentiment_score >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {trackAnalysis.sentiment_score >= 0 ? 'Joyful' : 'Heavy'} ({trackAnalysis.sentiment_score.toFixed(1)})
                    </span>
                  </div>
                  <div className="w-full bg-gray-950 h-2.5 rounded-full border border-gray-850 overflow-hidden relative flex items-center">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        trackAnalysis.sentiment_score >= 0 
                          ? 'bg-gradient-to-r from-violet-500 to-emerald-500' 
                          : 'bg-gradient-to-r from-red-500 to-violet-500'
                      }`}
                      style={{ 
                        width: `${Math.round(((trackAnalysis.sentiment_score + 1) / 2) * 100)}%` 
                      }}
                    ></div>
                  </div>
                </div>

              </div>

              {/* Analysis Summary */}
              {trackAnalysis.summary && (
                <div className="bg-violet-950/5 border border-violet-900/10 p-2.5 rounded-xl text-[11px] text-gray-300 leading-normal flex items-start space-x-2 select-text">
                  <Info className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                  <p>{trackAnalysis.summary}</p>
                </div>
              )}

              {/* Lyrics Scrollpane */}
              <div className="flex-1 flex flex-col min-h-[140px]">
                <div className="flex items-center space-x-1.5 mb-1.5 text-gray-500">
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Lyrics Display</span>
                </div>
                <div className="flex-1 max-h-[160px] overflow-y-auto bg-gray-950/50 rounded-xl p-3 text-xs leading-relaxed text-gray-300 font-mono border border-gray-850/80 whitespace-pre-line select-text relative scrollbar-thin">
                  {trackAnalysis.instrumental ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 select-none">
                      <BookOpen className="w-6 h-6 text-gray-650 mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Instrumental Track</span>
                      <span className="text-[8px] mt-0.5">No lyrical components</span>
                    </div>
                  ) : trackAnalysis.lyrics ? (
                    trackAnalysis.lyrics
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 select-none">
                      <HelpCircle className="w-6 h-6 text-gray-650 mb-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Lyrics not found</span>
                      <span className="text-[8px] mt-0.5">Unavailable on database</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <BookOpen className="w-8 h-8 text-gray-700 mb-2" />
              <span className="text-xs text-gray-500">Select a song above to load lyrics</span>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
