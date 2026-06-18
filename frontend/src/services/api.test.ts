import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Declare mocked axios instance and callback captures using vi.hoisted
const { mockAxiosInstance, getInterceptorCallbacks } = vi.hoisted(() => {
  let successCallback: any;
  let errorCallback: any;
  return {
    mockAxiosInstance: {
      get: vi.fn(),
      post: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((success, error) => {
            successCallback = success;
            errorCallback = error;
          }),
        },
      },
    },
    getInterceptorCallbacks: () => ({ successCallback, errorCallback })
  };
});

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
    },
  };
});

vi.mock('./spotifyAuth', () => ({
  spotifyAuth: {
    getAccessToken: vi.fn(),
  },
}));

// Import after mocking axios
import { apiService } from './api';
import { spotifyAuth } from './spotifyAuth';

describe('apiService', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Axios Request Interceptor', () => {
    it('attaches Authorization header if token exists', async () => {
      vi.mocked(spotifyAuth.getAccessToken).mockResolvedValue('token_abc');
      const config = { headers: {} } as any;
      const { successCallback } = getInterceptorCallbacks();

      const result = await successCallback(config);

      expect(result.headers.Authorization).toBe('Bearer token_abc');
    });

    it('does not attach Authorization header if no token exists', async () => {
      vi.mocked(spotifyAuth.getAccessToken).mockResolvedValue(null);
      const config = { headers: {} } as any;
      const { successCallback } = getInterceptorCallbacks();

      const result = await successCallback(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('passes through interceptor error rejection', async () => {
      const dummyError = new Error('interceptor error');
      const { errorCallback } = getInterceptorCallbacks();
      await expect(errorCallback(dummyError)).rejects.toThrow('interceptor error');
    });
  });

  describe('REST Endpoints', () => {
    it('getPlaylists calls /api/playlists', async () => {
      const playlistsData = [{ id: 'p1', name: 'Play A' }];
      mockAxiosInstance.get.mockResolvedValue({ data: { playlists: playlistsData } });

      const res = await apiService.getPlaylists();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/playlists');
      expect(res).toEqual(playlistsData);
    });

    it('searchPlaylists calls /api/playlists/search with query and default offset', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { playlists: [] } });

      await apiService.searchPlaylists('rock');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/playlists/search', {
        params: { q: 'rock', offset: 0 }
      });
    });

    it('searchPlaylists calls /api/playlists/search with explicit offset', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { playlists: [] } });

      await apiService.searchPlaylists('pop', 5);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/playlists/search', {
        params: { q: 'pop', offset: 5 }
      });
    });

    it('getLlmConfig calls /api/config/llm', async () => {
      const config = { llm_active: true };
      mockAxiosInstance.get.mockResolvedValue({ data: config });

      const res = await apiService.getLlmConfig();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/config/llm');
      expect(res).toEqual(config);
    });

    it('getDocumentationMetadata calls /api/config/documentation', async () => {
      const doc = { algorithms: {} };
      mockAxiosInstance.get.mockResolvedValue({ data: doc });

      const res = await apiService.getDocumentationMetadata();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/config/documentation');
      expect(res).toEqual(doc);
    });

    it('getLoginUrl calls /api/auth/login-url', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { url: 'auth_url' } });

      const res = await apiService.getLoginUrl();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/auth/login-url');
      expect(res).toEqual({ url: 'auth_url' });
    });

    it('exchangeToken calls /api/auth/token', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { access_token: 'ac' } });

      const res = await apiService.exchangeToken('code123');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/auth/token', { code: 'code123' });
      expect(res).toEqual({ access_token: 'ac' });
    });

    it('refreshToken calls /api/auth/refresh', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { access_token: 'new' } });

      const res = await apiService.refreshToken('ref123');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'ref123' });
      expect(res).toEqual({ access_token: 'new' });
    });

    it('analyzePlaylist calls /api/analysis/playlist/:id with parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { tracks: [] } });

      await apiService.analyzePlaylist('p123', 5, 'dbscan', 0.1, 0.2, 0.3, 0.4, true, 'all');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/analysis/playlist/p123', {
        params: {
          k: 5,
          algorithm: 'dbscan',
          genre_weight: 0.1,
          era_weight: 0.2,
          popularity_weight: 0.3,
          lyrics_weight: 0.4,
          lyrics_strategy: 'all',
          include_llm: true,
        }
      });
    });

    it('getRecommendations calls /api/analysis/playlist/:id/recommendations with parameters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { recommendations: [] } });

      await apiService.getRecommendations('p123', 4, 'kmeans', 0.5, 0.6, 0.7, 0.8, 'only_cached');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/analysis/playlist/p123/recommendations', {
        params: {
          k: 4,
          algorithm: 'kmeans',
          genre_weight: 0.5,
          era_weight: 0.6,
          popularity_weight: 0.7,
          lyrics_weight: 0.8,
          lyrics_strategy: 'only_cached',
        }
      });
    });

    it('createSplits calls /api/playlist/create-split', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      const splits = [{ playlist_name: 'S1', description: 'D1', track_uris: ['u1'] }];
      const res = await apiService.createSplits(splits);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/playlist/create-split', { splits });
      expect(res).toEqual({ success: true });
    });

    it('getTrackLyrics calls /api/analysis/track/:id/lyrics', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { lyrics: 'text' } });

      const res = await apiService.getTrackLyrics('t123', 'Song', 'Artist', 'Album', 180000, 0.5, 0.6, 'offline');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/analysis/track/t123/lyrics', {
        params: {
          track_name: 'Song',
          artist_name: 'Artist',
          album_name: 'Album',
          duration_ms: 180000,
          valence: 0.5,
          energy: 0.6,
          lyrics_strategy: 'offline',
        }
      });
      expect(res).toEqual({ lyrics: 'text' });
    });

    it('getPlaylistLyricsAnalysis calls /api/analysis/playlist/:id/lyrics', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { tracks: {} } });

      const res = await apiService.getPlaylistLyricsAnalysis('p123', 'skip');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/analysis/playlist/p123/lyrics', {
        params: {
          lyrics_strategy: 'skip',
        }
      });
      expect(res).toEqual({ tracks: {} });
    });
  });

  describe('streamAnalysis (SSE client)', () => {
    it('streams progress, completion, and error events successfully', async () => {
      vi.mocked(spotifyAuth.getAccessToken).mockResolvedValue('stream_token');

      const mockProgressEvent = { type: 'progress', stage: 'Embeddings', message: 'Generating', step: 2, total_steps: 5 };
      const mockCompleteEvent = { type: 'complete', data: { tracks: [] } };
      const mockErrorEvent = { type: 'error', message: 'LLM failed' };

      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode(`data: ${JSON.stringify(mockProgressEvent)}\n`),
        encoder.encode(`data: ${JSON.stringify(mockCompleteEvent)}\n`),
        encoder.encode(`data: ${JSON.stringify(mockErrorEvent)}\n`),
        encoder.encode(`data: invalid_json_here\n`), // should trigger console.error catch branch
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            return { value: chunks[chunkIndex++], done: false };
          }
          return { value: undefined, done: true };
        }),
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      } as any);

      const onProgress = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      await apiService.streamAnalysis(
        'p123',
        3,
        'umap',
        0.5,
        0.5,
        0.5,
        0.5,
        true,
        'all',
        onProgress,
        onComplete,
        onError
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analysis/playlist/p123/stream?k=3&algorithm=umap&genre_weight=0.5&era_weight=0.5&popularity_weight=0.5&lyrics_weight=0.5&lyrics_strategy=all&include_llm=true'),
        {
          headers: { Authorization: 'Bearer stream_token' }
        }
      );

      expect(onProgress).toHaveBeenCalledWith(mockProgressEvent);
      expect(onComplete).toHaveBeenCalledWith(mockCompleteEvent.data);
      expect(onError).toHaveBeenCalledWith(mockErrorEvent);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to parse SSE event:', expect.any(Error), 'invalid_json_here');
    });

    it('handles HTTP error connection response details', async () => {
      vi.mocked(spotifyAuth.getAccessToken).mockResolvedValue(null);

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ detail: 'Playlist has no tracks' }),
      } as any);

      const onError = vi.fn();

      await apiService.streamAnalysis('p123', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onError);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      const errorArg = onError.mock.calls[0][0];
      expect(errorArg.message).toBe('Playlist has no tracks');
    });

    it('handles HTTP error connection statusText fallback when text is not JSON', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Internal Error',
        text: async () => 'HTML Server Error Page',
      } as any);

      const onError = vi.fn();

      await apiService.streamAnalysis('p123', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onError);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      const errorArg = onError.mock.calls[0][0];
      expect(errorArg.message).toBe('Failed to connect: Internal Error');
    });

    it('throws error if response body is missing and no onError is supplied', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        body: null,
      } as any);

      await expect(apiService.streamAnalysis('p123')).rejects.toThrow('No response body');
    });

    it('calls onError if response body is missing and onError is supplied', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        body: null,
      } as any);

      const onError = vi.fn();
      await apiService.streamAnalysis('p123', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onError);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('No response body');
    });

    it('calls onError on stream reader loop failures', async () => {
      const mockReader = {
        read: vi.fn().mockRejectedValue(new Error('Buffer read failed')),
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      } as any);

      const onError = vi.fn();
      await apiService.streamAnalysis('p123', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, onError);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Buffer read failed');
    });
  });
});
