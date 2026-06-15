import axios from 'axios';
import { spotifyAuth } from './spotifyAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
    pca: { x: number; y: number; z?: number };
    tsne: { x: number; y: number; z?: number };
    umap: { x: number; y: number; z?: number };
    circumplex: { x: number; y: number; z?: number };
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
  lyrical_valence?: number;
  lyrical_energy?: number;
  emotional_ambiguity?: number;
  sentiment_score?: number;
  emotions?: {
    joy: number;
    sadness: number;
    anger: number;
    fear_anxiety: number;
    love_romance: number;
    nostalgia_longing: number;
  };
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

export interface ExcludedTrack {
  id: string;
  name: string;
  artists: string;
  reason: string;
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
  excluded_tracks?: ExcludedTrack[];
}

export interface LlmConfigResponse {
  llm_active: boolean;
  llm_provider: string;
  llm_model: string;
  api_base?: string;
}

export interface DocItem {
  name: string;
  description: string;
  help_text: string;
  recommended_projections?: string[];
  recommended_algorithms?: string[];
}

export interface DocumentationMetadata {
  algorithms: Record<string, DocItem>;
  projections: Record<string, DocItem>;
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

export interface SearchPlaylistsResponse {
  playlists: PlaylistInfo[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const apiService = {
  async getPlaylists(): Promise<PlaylistInfo[]> {
    const response = await api.get<{ playlists: PlaylistInfo[] }>('/api/playlists');
    return response.data.playlists;
  },

  async searchPlaylists(query: string, offset = 0): Promise<SearchPlaylistsResponse> {
    const response = await api.get<SearchPlaylistsResponse>('/api/playlists/search', {
      params: { q: query, offset }
    });
    return response.data;
  },


  async getLlmConfig(): Promise<LlmConfigResponse> {
    const response = await api.get<LlmConfigResponse>('/api/config/llm');
    return response.data;
  },

  async getDocumentationMetadata(): Promise<DocumentationMetadata> {
    const response = await api.get<DocumentationMetadata>('/api/config/documentation');
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
    lyricsWeight?: number,
    includeLlm?: boolean,
    lyricsStrategy?: string
  ): Promise<AnalysisResponse> {
    const params: Record<string, any> = {};
    if (k !== undefined) params.k = k;
    if (algorithm !== undefined) params.algorithm = algorithm;
    if (genreWeight !== undefined) params.genre_weight = genreWeight;
    if (eraWeight !== undefined) params.era_weight = eraWeight;
    if (popularityWeight !== undefined) params.popularity_weight = popularityWeight;
    if (lyricsWeight !== undefined) params.lyrics_weight = lyricsWeight;
    if (lyricsStrategy !== undefined) params.lyrics_strategy = lyricsStrategy;
    if (includeLlm !== undefined) params.include_llm = includeLlm;
    const response = await api.get<AnalysisResponse>(`/api/analysis/playlist/${playlistId}`, { params });
    return response.data;
  },

  async streamAnalysis(
    playlistId: string,
    k?: number,
    algorithm?: string,
    genreWeight?: number,
    eraWeight?: number,
    popularityWeight?: number,
    lyricsWeight?: number,
    includeLlm?: boolean,
    lyricsStrategy?: string,
    onProgress?: (event: { stage: string; message: string; step: number; total_steps: number; current?: number; total?: number }) => void,
    onComplete?: (data: AnalysisResponse) => void,
    onError?: (error: any) => void
  ): Promise<void> {
    const params = new URLSearchParams();
    if (k !== undefined) params.append('k', k.toString());
    if (algorithm !== undefined) params.append('algorithm', algorithm);
    if (genreWeight !== undefined) params.append('genre_weight', genreWeight.toString());
    if (eraWeight !== undefined) params.append('era_weight', eraWeight.toString());
    if (popularityWeight !== undefined) params.append('popularity_weight', popularityWeight.toString());
    if (lyricsWeight !== undefined) params.append('lyrics_weight', lyricsWeight.toString());
    if (lyricsStrategy !== undefined) params.append('lyrics_strategy', lyricsStrategy);
    if (includeLlm !== undefined) params.append('include_llm', includeLlm.toString());

    const token = await spotifyAuth.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${API_BASE_URL}/api/analysis/playlist/${playlistId}/stream?${params.toString()}`;

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const text = await response.text();
        let errMsg = `Failed to connect: ${response.statusText}`;
        try {
          const errData = JSON.parse(text);
          errMsg = errData.detail || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'progress' && onProgress) {
              onProgress(event);
            } else if (event.type === 'complete' && onComplete) {
              onComplete(event.data);
            } else if (event.type === 'error' && onError) {
              onError(event);
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e, jsonStr);
          }
        }
      }
    } catch (err: any) {
      if (onError) {
        onError(err);
      } else {
        throw err;
      }
    }
  },

  async getRecommendations(
    playlistId: string, 
    k?: number, 
    algorithm?: string,
    genreWeight?: number,
    eraWeight?: number,
    popularityWeight?: number,
    lyricsWeight?: number,
    lyricsStrategy?: string
  ): Promise<{
    recommendations: Recommendation[];
    llm_active?: boolean;
    llm_provider?: string;
    llm_model?: string;
  }> {
    const params: Record<string, any> = {};
    if (k !== undefined) params.k = k;
    if (algorithm !== undefined) params.algorithm = algorithm;
    if (genreWeight !== undefined) params.genre_weight = genreWeight;
    if (eraWeight !== undefined) params.era_weight = eraWeight;
    if (popularityWeight !== undefined) params.popularity_weight = popularityWeight;
    if (lyricsWeight !== undefined) params.lyrics_weight = lyricsWeight;
    if (lyricsStrategy !== undefined) params.lyrics_strategy = lyricsStrategy;
    const response = await api.get<{
      recommendations: Recommendation[];
      llm_active?: boolean;
      llm_provider?: string;
      llm_model?: string;
    }>(`/api/analysis/playlist/${playlistId}/recommendations`, { params });
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
    energy: number,
    lyricsStrategy?: string
  ): Promise<TrackLyricAnalysis> {
    const params: Record<string, any> = {
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration_ms: durationMs,
      valence,
      energy
    };
    if (lyricsStrategy !== undefined) params.lyrics_strategy = lyricsStrategy;
    const response = await api.get<TrackLyricAnalysis>(`/api/analysis/track/${trackId}/lyrics`, { params });
    return response.data;
  },

  async getPlaylistLyricsAnalysis(playlistId: string, lyricsStrategy?: string): Promise<LyricsAnalysisData> {
    const params: Record<string, any> = {};
    if (lyricsStrategy !== undefined) params.lyrics_strategy = lyricsStrategy;
    const response = await api.get<LyricsAnalysisData>(`/api/analysis/playlist/${playlistId}/lyrics`, { params });
    return response.data;
  }
};
