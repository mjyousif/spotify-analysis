import React, { useState, useMemo, useEffect } from 'react';
import { apiService } from '../../services/api';
import type { TrackData, LyricsAnalysisData, TrackLyricAnalysis } from '../../services/api';
import { 
  BookOpen, Sparkles, Smile, Heart, Frown, Flame, 
  HelpCircle, ChevronDown, AlignLeft, Info, RefreshCw,
  Zap, CloudRain
} from 'lucide-react';

interface LyricSentimentWidgetProps {
  playlistId: string;
  tracks: TrackData[];
  selectedTrack: TrackData | null;
  onSelectTrack: (track: TrackData) => void;
  lyricsStrategy: string;
}

export const LyricSentimentWidget: React.FC<LyricSentimentWidgetProps> = ({
  playlistId,
  tracks,
  selectedTrack,
  onSelectTrack,
  lyricsStrategy
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
      track.features.energy,
      lyricsStrategy
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

    apiService.getPlaylistLyricsAnalysis(playlistId, lyricsStrategy)
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
    if (
      norm.includes('joy') || 
      norm.includes('happy') || 
      norm.includes('uplift') || 
      norm.includes('cheerful') || 
      norm.includes('bright') || 
      norm.includes('celebrate') || 
      norm.includes('excited') || 
      norm.includes('optimistic')
    ) {
      return {
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10 border-emerald-500/20',
        icon: <Smile className="w-4 h-4 text-emerald-400" />,
        label: 'Joyful'
      };
    }
    if (
      norm.includes('romance') || 
      norm.includes('romantic') || 
      norm.includes('love') || 
      norm.includes('passion') || 
      norm.includes('intimate') || 
      norm.includes('affection')
    ) {
      return {
        color: 'text-fuchsia-400',
        bg: 'bg-fuchsia-500/10 border-fuchsia-500/20',
        icon: <Heart className="w-4 h-4 text-fuchsia-400" />,
        label: 'Romantic'
      };
    }
    if (
      norm.includes('melanchol') || 
      norm.includes('sad') || 
      norm.includes('blue') || 
      norm.includes('grief') || 
      norm.includes('heartbreak') || 
      norm.includes('sorrow')
    ) {
      return {
        color: 'text-violet-400',
        bg: 'bg-violet-500/10 border-violet-500/20',
        icon: <Frown className="w-4 h-4 text-violet-400" />,
        label: 'Melancholic'
      };
    }
    if (
      norm.includes('angr') || 
      norm.includes('rage') || 
      norm.includes('intense') || 
      norm.includes('aggress') || 
      norm.includes('hate') || 
      norm.includes('rebel') || 
      norm.includes('dark') || 
      norm.includes('heavy')
    ) {
      return {
        color: 'text-red-400',
        bg: 'bg-red-500/10 border-red-500/20',
        icon: <Flame className="w-4 h-4 text-red-400" />,
        label: 'Intense/Angry'
      };
    }
    if (
      norm.includes('peace') || 
      norm.includes('calm') || 
      norm.includes('reflect') || 
      norm.includes('ambient') || 
      norm.includes('dream') || 
      norm.includes('chill') || 
      norm.includes('serene')
    ) {
      return {
        color: 'text-teal-400',
        bg: 'bg-teal-500/10 border-teal-500/20',
        icon: <Sparkles className="w-4 h-4 text-teal-400" />,
        label: 'Peaceful'
      };
    }
    if (
      norm.includes('energetic') || 
      norm.includes('energy') || 
      norm.includes('hype') || 
      norm.includes('upbeat') || 
      norm.includes('workout') || 
      norm.includes('loud') || 
      norm.includes('fast') || 
      norm.includes('triumphant')
    ) {
      return {
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/20',
        icon: <Zap className="w-4 h-4 text-amber-400" />,
        label: 'Energetic'
      };
    }
    if (
      norm.includes('desperate') || 
      norm.includes('despair') || 
      norm.includes('anxious') || 
      norm.includes('anxiety') || 
      norm.includes('fear') || 
      norm.includes('hopeless') || 
      norm.includes('lonely') || 
      norm.includes('struggle')
    ) {
      return {
        color: 'text-slate-400',
        bg: 'bg-slate-500/10 border-slate-500/20',
        icon: <CloudRain className="w-4 h-4 text-slate-400" />,
        label: 'Desperate'
      };
    }
    if (norm.includes('instrumental')) {
      return {
        color: 'text-slate-500',
        bg: 'bg-slate-500/10 border-slate-500/20',
        icon: <BookOpen className="w-4 h-4 text-slate-500" />,
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

  // Calculate playlist wide averages of strategy dimensions
  const strategyAverages = useMemo(() => {
    if (!playlistAnalysis || !playlistAnalysis.tracks) return null;
    const trackList = Object.values(playlistAnalysis.tracks);
    const count = trackList.length;
    if (count === 0) return null;

    if (lyricsStrategy === 'spotify_model') {
      let sumValence = 0;
      let sumEnergy = 0;
      let sumAmbiguity = 0;
      let validCountValence = 0;
      let validCountEnergy = 0;
      let validCountAmbiguity = 0;

      trackList.forEach(t => {
        if (t.lyrical_valence !== undefined) {
          sumValence += t.lyrical_valence;
          validCountValence++;
        }
        if (t.lyrical_energy !== undefined) {
          sumEnergy += t.lyrical_energy;
          validCountEnergy++;
        }
        if (t.emotional_ambiguity !== undefined) {
          sumAmbiguity += t.emotional_ambiguity;
          validCountAmbiguity++;
        }
      });

      return {
        lyrical_valence: validCountValence > 0 ? sumValence / validCountValence : 0.5,
        lyrical_energy: validCountEnergy > 0 ? sumEnergy / validCountEnergy : 0.5,
        emotional_ambiguity: validCountAmbiguity > 0 ? sumAmbiguity / validCountAmbiguity : 0.0,
        average_sentiment: playlistAnalysis.playlist_sentiment?.average_sentiment ?? 0.0,
        total_songs: count
      };
    } else {
      let sumJoy = 0;
      let sumSadness = 0;
      let sumAnger = 0;
      let sumFear = 0;
      let sumLove = 0;
      let sumNostalgia = 0;
      
      let valCount = 0;

      trackList.forEach(t => {
        if (t.emotions) {
          sumJoy += t.emotions.joy;
          sumSadness += t.emotions.sadness;
          sumAnger += t.emotions.anger;
          sumFear += t.emotions.fear_anxiety;
          sumLove += t.emotions.love_romance;
          sumNostalgia += t.emotions.nostalgia_longing;
          valCount++;
        }
      });

      return {
        joy: valCount > 0 ? sumJoy / valCount : 0.0,
        sadness: valCount > 0 ? sumSadness / valCount : 0.0,
        anger: valCount > 0 ? sumAnger / valCount : 0.0,
        fear_anxiety: valCount > 0 ? sumFear / valCount : 0.0,
        love_romance: valCount > 0 ? sumLove / valCount : 0.0,
        nostalgia_longing: valCount > 0 ? sumNostalgia / valCount : 0.0,
        average_sentiment: playlistAnalysis.playlist_sentiment?.average_sentiment ?? 0.0,
        total_songs: count
      };
    }
  }, [playlistAnalysis, lyricsStrategy]);

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
              {strategyAverages ? (
                <div className="space-y-4 text-left">
                  {/* Playlist Lyrical Sentiment Banner */}
                  <div className="flex items-center justify-between bg-violet-950/10 border border-violet-900/10 px-4 py-3 rounded-2xl select-text">
                    <div>
                      <span className="text-[9px] text-gray-550 font-black uppercase tracking-wider block">Average Playlist Sentiment</span>
                      <span className="text-[10px] text-gray-400 font-medium leading-tight">Average sentiment of lyrics across all {strategyAverages.total_songs} tracks.</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-extrabold block ${strategyAverages.average_sentiment >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {strategyAverages.average_sentiment >= 0 ? '+' : ''}
                        {strategyAverages.average_sentiment.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-gray-500 uppercase font-black tracking-wider">
                        {strategyAverages.average_sentiment >= 0.1 ? 'Joyful Bias' : strategyAverages.average_sentiment <= -0.1 ? 'Heavy Bias' : 'Neutral Vibe'}
                      </span>
                    </div>
                  </div>

                  {/* Lyrical Dimension Averages */}
                  <div className="bg-gray-950/50 border border-gray-850 p-4 rounded-2xl space-y-4">
                    <span className="text-[9px] text-gray-550 font-bold uppercase tracking-wider block border-b border-gray-850/60 pb-2">
                      Playlist Lyrical Averages ({lyricsStrategy === 'spotify_model' ? 'Spotify Model' : '6D Emotions'})
                    </span>

                    {lyricsStrategy === 'spotify_model' ? (
                      <div className="space-y-3">
                        {/* Valence */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Lyrical Valence (Happiness)</span>
                            <span className="text-emerald-450">{((strategyAverages as any).lyrical_valence * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-2 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).lyrical_valence * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Energy */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Lyrical Energy (Intensity)</span>
                            <span className="text-fuchsia-450">{((strategyAverages as any).lyrical_energy * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-2 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).lyrical_energy * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Ambiguity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Emotional Ambiguity (Complexity)</span>
                            <span className="text-violet-400">{((strategyAverages as any).emotional_ambiguity * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-2 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-gradient-to-r from-gray-700 to-violet-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).emotional_ambiguity * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // emotional_profile_6d
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {/* Joy */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Joy</span>
                            <span className="text-emerald-400 font-extrabold">{((strategyAverages as any).joy * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).joy * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Sadness */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Sadness</span>
                            <span className="text-indigo-400 font-extrabold">{((strategyAverages as any).sadness * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).sadness * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Anger */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Anger</span>
                            <span className="text-red-400 font-extrabold">{((strategyAverages as any).anger * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-red-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).anger * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Fear */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Fear/Anxiety</span>
                            <span className="text-purple-400 font-extrabold">{((strategyAverages as any).fear_anxiety * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-purple-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).fear_anxiety * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Love */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Love</span>
                            <span className="text-fuchsia-400 font-extrabold">{((strategyAverages as any).love_romance * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-fuchsia-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).love_romance * 100)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Nostalgia */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                            <span>Nostalgia</span>
                            <span className="text-amber-500 font-extrabold">{((strategyAverages as any).nostalgia_longing * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-amber-500 transition-all duration-700"
                              style={{ width: `${Math.round((strategyAverages as any).nostalgia_longing * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-10 text-center select-text">No mood averages to display.</div>
              )}

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

                {/* Lyrical Dimensions */}
                <div className="space-y-2 text-left sm:col-span-1">
                  {lyricsStrategy === 'spotify_model' ? (
                    <div className="space-y-2">
                      {/* Lyrical Valence */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Lyrical Valence (Happiness)</span>
                          <span className="text-emerald-400">{(trackAnalysis.lyrical_valence ?? 0.5).toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.lyrical_valence ?? 0.5) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Lyrical Energy */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Lyrical Energy (Intensity)</span>
                          <span className="text-fuchsia-400">{(trackAnalysis.lyrical_energy ?? 0.5).toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.lyrical_energy ?? 0.5) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Emotional Ambiguity */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Emotional Ambiguity</span>
                          <span className="text-violet-400">{(trackAnalysis.emotional_ambiguity ?? 0.0).toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1.5 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-gray-700 to-violet-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotional_ambiguity ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // emotional_profile_6d
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {/* Joy */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Joy</span>
                          <span className="text-emerald-400 font-extrabold">{(trackAnalysis.emotions?.joy ?? 0.0).toFixed(1)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotions?.joy ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Sadness */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Sadness</span>
                          <span className="text-indigo-400 font-extrabold">{(trackAnalysis.emotions?.sadness ?? 0.0).toFixed(1)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotions?.sadness ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Anger */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Anger</span>
                          <span className="text-red-400 font-extrabold">{(trackAnalysis.emotions?.anger ?? 0.0).toFixed(1)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-red-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotions?.anger ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Fear */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Fear/Anxiety</span>
                          <span className="text-purple-400 font-extrabold">{(trackAnalysis.emotions?.fear_anxiety ?? 0.0).toFixed(1)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-purple-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotions?.fear_anxiety ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Love */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Love</span>
                          <span className="text-fuchsia-400 font-extrabold">{(trackAnalysis.emotions?.love_romance ?? 0.0).toFixed(1)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-fuchsia-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotions?.love_romance ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Nostalgia */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Nostalgia</span>
                          <span className="text-amber-500 font-extrabold">{(trackAnalysis.emotions?.nostalgia_longing ?? 0.0).toFixed(1)}</span>
                        </div>
                        <div className="w-full bg-gray-950 h-1 rounded-full border border-gray-850 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-amber-500 transition-all duration-700"
                            style={{ width: `${Math.round((trackAnalysis.emotions?.nostalgia_longing ?? 0.0) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
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
