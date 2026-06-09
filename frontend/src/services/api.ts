import axios from 'axios';
import { spotifyAuth } from './spotifyAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Request interceptor to attach Spotify access token
api.interceptors.request.use(
  async (config) => {
    const token = await spotifyAuth.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export interface TrackData {
  id: string;
  name: string;
  uri: string;
  artists: string;
  album_images: Array<{ url: string; height?: number; width?: number }>;
  cluster: number;
  x: number;
  y: number;
  popularity: number;
  release_date: string;
  duration_ms: number;
  features: {
    tempo: number;
    energy: number;
    valence: number;
    acousticness: number;
    danceability: number;
    instrumentalness: number;
    speechiness: number;
    liveness: number;
    mode: number;
    key: number;
  };
  genres: string[];
  coords?: {
    pca: { x: number; y: number };
    tsne: { x: number; y: number };
    umap: { x: number; y: number };
    circumplex: { x: number; y: number };
  };
}

export interface ClusterProfile {
  cluster_id: number;
  count: number;
  averages: {
    tempo: number;
    energy: number;
    valence: number;
    acousticness: number;
    danceability: number;
  };
  top_genres: string[];
  representative_songs: string[];
}

export interface Recommendation {
  cluster_id: number;
  playlist_name: string;
  description: string;
  vibe_explanation: string;
}

export interface TrackLyricAnalysis {
  lyrics: string;
  mood: string;
  sentiment_score: number;
  key_themes: string[];
  prominent_words: string[];
  summary: string;
  instrumental: boolean;
  synced_lyrics: string | null;
}

export interface PlaylistSentiment {
  mood_distribution: Record<string, number>;
  top_words: Array<{ text: string; value: number }>;
  average_sentiment: number;
}

export interface LyricsAnalysisData {
  tracks: Record<string, TrackLyricAnalysis>;
  playlist_sentiment: PlaylistSentiment;
}

export interface AnalysisResponse {
  tracks: TrackData[];
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
  llm_active?: boolean;
  llm_provider?: string;
  llm_model?: string;
  recommended_k?: number;
  default_projection?: 'pca' | 'tsne' | 'umap' | 'circumplex';
  lyrics_analysis?: LyricsAnalysisData;
}

export interface LlmConfigResponse {
  llm_active: boolean;
  llm_provider: string;
  llm_model: string;
  api_base?: string;
}

export interface SpotifyLoginUrlResponse {
  url: string;
}

export interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface PlaylistInfo {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string }>;
  tracks: { total: number };
  owner: { display_name: string };
}

export const apiService = {
  async getPlaylists(): Promise<PlaylistInfo[]> {
    const response = await api.get<{ playlists: PlaylistInfo[] }>('/api/playlists');
    return response.data.playlists;
  },

  async getLlmConfig(): Promise<LlmConfigResponse> {
    const response = await api.get<LlmConfigResponse>('/api/config/llm');
    return response.data;
  },

  async getLoginUrl(): Promise<SpotifyLoginUrlResponse> {
    const response = await api.get<SpotifyLoginUrlResponse>('/api/auth/login-url');
    return response.data;
  },

  async exchangeToken(code: string): Promise<SpotifyTokenResponse> {
    const response = await api.post<SpotifyTokenResponse>('/api/auth/token', { code });
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    const response = await api.post<SpotifyTokenResponse>('/api/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  },

  async analyzePlaylist(
    playlistId: string, 
    k?: number, 
    algorithm?: string,
    genreWeight?: number,
    eraWeight?: number,
    popularityWeight?: number,
    lyricsWeight?: number
  ): Promise<AnalysisResponse> {
    const params: Record<string, any> = {};
    if (k !== undefined) params.k = k;
    if (algorithm !== undefined) params.algorithm = algorithm;
    if (genreWeight !== undefined) params.genre_weight = genreWeight;
    if (eraWeight !== undefined) params.era_weight = eraWeight;
    if (popularityWeight !== undefined) params.popularity_weight = popularityWeight;
    if (lyricsWeight !== undefined) params.lyrics_weight = lyricsWeight;
    const response = await api.get<AnalysisResponse>(`/api/analysis/playlist/${playlistId}`, { params });
    return response.data;
  },

  async createSplits(splits: Array<{ playlist_name: string; description: string; track_uris: string[] }>): Promise<any> {
    const response = await api.post('/api/playlist/create-split', { splits });
    return response.data;
  },

  async getTrackLyrics(
    trackId: string,
    trackName: string,
    artistName: string,
    albumName: string,
    durationMs: number,
    valence: number,
    energy: number
  ): Promise<TrackLyricAnalysis> {
    const params = {
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration_ms: durationMs,
      valence,
      energy
    };
    const response = await api.get<TrackLyricAnalysis>(`/api/analysis/track/${trackId}/lyrics`, { params });
    return response.data;
  },

  async getPlaylistLyricsAnalysis(playlistId: string): Promise<LyricsAnalysisData> {
    const response = await api.get<LyricsAnalysisData>(`/api/analysis/playlist/${playlistId}/lyrics`);
    return response.data;
  }
};
