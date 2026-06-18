import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import App from './App';
import { useSpotifyAuth } from './hooks/useSpotifyAuth';
import { apiService } from './services/api';

// Mock useSpotifyAuth hook
vi.mock('./hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: vi.fn(),
}));

// Mock apiService
vi.mock('./services/api', () => ({
  apiService: {
    getDocumentationMetadata: vi.fn(),
    streamAnalysis: vi.fn(),
    getRecommendations: vi.fn(),
    createSplits: vi.fn(),
    getTrackLyrics: vi.fn(),
  },
}));

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

// Mock Plotly
vi.mock('plotly.js/dist/plotly', () => ({
  default: {
    newPlot: vi.fn().mockImplementation((el) => {
      el.on = el.on || vi.fn();
      return Promise.resolve();
    }),
    react: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn(),
    Plots: { resize: vi.fn() },
  },
}));

describe('App Root Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders LoginScreen when isLoggedIn is false', async () => {
    vi.mocked(useSpotifyAuth).mockReturnValue({
      isLoggedIn: false,
      authLoading: false,
      authError: null,
      isBackendConfigured: true,
      playlists: [],
      playlistsLoading: false,
      llmConfig: null,
      handleLogin: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(apiService.getDocumentationMetadata).mockResolvedValue({
      algorithms: {},
      projections: {},
    });

    render(<App />);

    expect(screen.getByText(/Login with Spotify/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(apiService.getDocumentationMetadata).toHaveBeenCalled();
    });
  });

  it('renders PlaylistGrid when isLoggedIn is true and no playlist is selected', async () => {
    vi.mocked(useSpotifyAuth).mockReturnValue({
      isLoggedIn: true,
      authLoading: false,
      authError: null,
      isBackendConfigured: true,
      playlists: [
        {
          id: 'p123',
          name: 'Alternative Rock',
          description: 'A collection of rock songs',
          images: [],
          tracks: { total: 15 },
          owner: { display_name: 'Spotify User' }
        }
      ],
      playlistsLoading: false,
      llmConfig: { llm_active: true, llm_provider: 'gemini', llm_model: 'gemini-1.5' },
      handleLogin: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(apiService.getDocumentationMetadata).mockResolvedValue({
      algorithms: {},
      projections: {},
    });

    render(<App />);

    expect(screen.getByText('Alternative Rock')).toBeInTheDocument();
    expect(screen.getByText(/AI Vibe Engine Active/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(apiService.getDocumentationMetadata).toHaveBeenCalled();
    });
  });

  it('runs analysis and displays dashboard widgets when a playlist is selected', async () => {
    vi.mocked(useSpotifyAuth).mockReturnValue({
      isLoggedIn: true,
      authLoading: false,
      authError: null,
      isBackendConfigured: true,
      playlists: [
        {
          id: 'p123',
          name: 'Alternative Rock',
          description: 'A collection of rock songs',
          images: [],
          tracks: { total: 15 },
          owner: { display_name: 'Spotify User' }
        }
      ],
      playlistsLoading: false,
      llmConfig: { llm_active: true, llm_provider: 'gemini', llm_model: 'gemini-1.5' },
      handleLogin: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(apiService.getDocumentationMetadata).mockResolvedValue({
      algorithms: {},
      projections: {},
    });

    const mockAnalysisResponse = {
      tracks: [
        {
          id: 't1',
          name: 'Rock Anthem',
          uri: 'spotify:track:t1',
          artists: 'Artist Rocker',
          album_images: [],
          cluster: 0,
          x: 1,
          y: 2,
          popularity: 70,
          release_date: '2005',
          duration_ms: 210000,
          features: {
            tempo: 140,
            energy: 0.9,
            valence: 0.6,
            acousticness: 0.05,
            danceability: 0.5,
            instrumentalness: 0.1,
            speechiness: 0.07,
            liveness: 0.25,
            mode: 1,
            key: 2,
          },
          genres: ['rock'],
        }
      ],
      clusters: [
        {
          cluster_id: 0,
          count: 1,
          averages: { tempo: 140, energy: 0.9, valence: 0.6, acousticness: 0.05, danceability: 0.5 },
          top_genres: ['rock'],
          representative_songs: ['Rock Anthem']
        }
      ],
      recommendations: [
        { cluster_id: 0, playlist_name: 'Split Rocker', description: 'rock vibe split', vibe_explanation: 'heavy' }
      ],
      recommended_k: 1,
      default_projection: 'pca' as const,
      excluded_tracks: [],
    };

    // Mock streamAnalysis to immediately invoke the completion callback
    vi.mocked(apiService.streamAnalysis).mockImplementation(async (
      id, k, algo, gw, ew, pw, lw, includeLlm, lStrategy, onProgress, onComplete, onError
    ) => {
      onProgress?.({ stage: 'processing', message: 'Analyzing...', step: 3, total_steps: 6 });
      onComplete?.(mockAnalysisResponse);
      return Promise.resolve();
    });

    // Mock getTrackLyrics to avoid crashes in lazy loaded lyric widget
    vi.mocked(apiService.getTrackLyrics).mockResolvedValue({
      lyrics: 'Song lyrics text',
      mood: 'energetic',
      summary: 'summary text',
      instrumental: false,
    } as any);

    render(<App />);

    const playlistItem = screen.getByText('Alternative Rock');
    fireEvent.click(playlistItem);

    await waitFor(() => {
      expect(apiService.streamAnalysis).toHaveBeenCalled();
      expect(screen.getByText('Analysis: Alternative Rock')).toBeInTheDocument();
    });

    expect(screen.getByText('Vibe Similarity Map')).toBeInTheDocument();
    expect(screen.getAllByText('Split Rocker').length).toBeGreaterThan(0);
  });
});
