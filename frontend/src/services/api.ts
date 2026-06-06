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
  album_images: Array<{ url: string; height: number; width: number }>;
  cluster: number;
  x: number;
  y: number;
  features: {
    tempo: number;
    energy: number;
    valence: number;
    acousticness: number;
    danceability: number;
    instrumentalness: number;
  };
  genres: string[];
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

export interface AnalysisResponse {
  tracks: TrackData[];
  clusters: ClusterProfile[];
  recommendations: Recommendation[];
  llm_active?: boolean;
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

  async analyzePlaylist(playlistId: string, k: number): Promise<AnalysisResponse> {
    const response = await api.get<AnalysisResponse>(`/api/analysis/playlist/${playlistId}`, {
      params: { k },
    });
    return response.data;
  },

  async createSplits(splits: Array<{ playlist_name: string; description: string; track_uris: string[] }>): Promise<any> {
    const response = await api.post('/api/playlist/create-split', { splits });
    return response.data;
  }
};
