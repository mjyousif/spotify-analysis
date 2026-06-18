import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSpotifyAuth } from './useSpotifyAuth';
import { spotifyAuth } from '../services/spotifyAuth';
import { apiService } from '../services/api';

// Mock dependencies
vi.mock('../services/spotifyAuth', () => ({
  spotifyAuth: {
    isLoggedIn: vi.fn(),
    handleCallback: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  apiService: {
    getPlaylists: vi.fn(),
    getLlmConfig: vi.fn(),
    getLoginUrl: vi.fn(),
  },
}));

describe('useSpotifyAuth Hook', () => {
  const originalLocation = window.location;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      search: '',
      pathname: '/',
      history: {
        replaceState: vi.fn(),
      }
    } as any;
    // Mock default window.history.replaceState
    window.history.replaceState = vi.fn();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('initializes with default login state and verifies backend config', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(false);
    vi.mocked(apiService.getLoginUrl).mockResolvedValue({ url: 'http://login' });

    const { result } = renderHook(() => useSpotifyAuth());

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.authLoading).toBe(false);
    expect(result.current.playlists).toEqual([]);

    await waitFor(() => {
      expect(apiService.getLoginUrl).toHaveBeenCalled();
      expect(result.current.isBackendConfigured).toBe(true);
    });
  });

  it('handles callback parameter parsing and logs in successfully', async () => {
    // Mock URL search containing 'code' parameter
    window.location.search = '?code=code123';
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(false);
    vi.mocked(spotifyAuth.handleCallback).mockResolvedValue(undefined);
    vi.mocked(apiService.getPlaylists).mockResolvedValue([]);
    vi.mocked(apiService.getLlmConfig).mockResolvedValue({ llm_active: true, llm_provider: 'gemini', llm_model: 'gemini' });

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(spotifyAuth.handleCallback).toHaveBeenCalledWith('code123');
      expect(window.history.replaceState).toHaveBeenCalled();
      expect(result.current.isLoggedIn).toBe(true);
    });
  });

  it('handles callback parameter parsing failure', async () => {
    window.location.search = '?code=badcode';
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(false);
    vi.mocked(spotifyAuth.handleCallback).mockRejectedValue(new Error('Failed login'));
    vi.mocked(apiService.getLoginUrl).mockResolvedValue({ url: 'url' });

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(spotifyAuth.handleCallback).toHaveBeenCalledWith('badcode');
      expect(result.current.authError).toBe('Failed login');
    });
  });

  it('loads playlists and LLM config when isLoggedIn is true', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(true);
    const mockPlaylists = [{ id: 'p1', name: 'Playlist A', description: 'desc', images: [], tracks: { total: 10 }, owner: { display_name: 'owner' } }];
    const mockLlmConfig = { llm_active: true, llm_provider: 'openai', llm_model: 'gpt4' };

    vi.mocked(apiService.getPlaylists).mockResolvedValue(mockPlaylists);
    vi.mocked(apiService.getLlmConfig).mockResolvedValue(mockLlmConfig);

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(apiService.getPlaylists).toHaveBeenCalled();
      expect(apiService.getLlmConfig).toHaveBeenCalled();
      expect(result.current.playlists).toEqual(mockPlaylists);
      expect(result.current.llmConfig).toEqual(mockLlmConfig);
    });
  });

  it('handles 401 unauthorized when loading playlists', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(true);
    const apiError = { response: { status: 401 } };
    vi.mocked(apiService.getPlaylists).mockRejectedValue(apiError);
    vi.mocked(apiService.getLlmConfig).mockResolvedValue({ llm_active: false, llm_provider: '', llm_model: '' });

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(apiService.getPlaylists).toHaveBeenCalled();
      expect(spotifyAuth.logout).toHaveBeenCalled();
      expect(result.current.isLoggedIn).toBe(false);
    });
  });

  it('handles non-401 error when loading playlists', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(true);
    const apiError = { response: { status: 500 } };
    vi.mocked(apiService.getPlaylists).mockRejectedValue(apiError);
    vi.mocked(apiService.getLlmConfig).mockResolvedValue({ llm_active: false, llm_provider: '', llm_model: '' });

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(apiService.getPlaylists).toHaveBeenCalled();
      expect(spotifyAuth.logout).not.toHaveBeenCalled();
      expect(result.current.isLoggedIn).toBe(true);
    });
  });

  it('handles LLM config fetch error', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(true);
    vi.mocked(apiService.getPlaylists).mockResolvedValue([]);
    vi.mocked(apiService.getLlmConfig).mockRejectedValue(new Error('LLM fetch failed'));

    renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(apiService.getLlmConfig).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching LLM config:', expect.any(Error));
    });
  });

  it('handles backend not configured error on initialization', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(false);
    vi.mocked(apiService.getLoginUrl).mockRejectedValue(new Error('Config error'));

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(apiService.getLoginUrl).toHaveBeenCalled();
      expect(result.current.isBackendConfigured).toBe(false);
      expect(result.current.authError).toContain('Spotify Client ID & Secret are not configured');
    });
  });

  it('initiates OAuth redirect on login submit successfully', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(false);
    vi.mocked(spotifyAuth.login).mockResolvedValue(undefined);
    vi.mocked(apiService.getLoginUrl).mockResolvedValue({ url: 'url' });

    const { result } = renderHook(() => useSpotifyAuth());

    await act(async () => {
      result.current.handleLogin({ preventDefault: vi.fn() } as any);
    });

    expect(spotifyAuth.login).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.authLoading).toBe(false);
    });
  });

  it('handles login initialization failure', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(false);
    vi.mocked(spotifyAuth.login).mockRejectedValue(new Error('Login URL failed'));
    vi.mocked(apiService.getLoginUrl).mockResolvedValue({ url: 'url' });

    const { result } = renderHook(() => useSpotifyAuth());

    await act(async () => {
      result.current.handleLogin({ preventDefault: vi.fn() } as any);
    });

    await waitFor(() => {
      expect(result.current.authError).toBe('Login URL failed');
      expect(result.current.authLoading).toBe(false);
    });
  });

  it('triggers logout clears the session', async () => {
    vi.mocked(spotifyAuth.isLoggedIn).mockReturnValue(true);
    vi.mocked(apiService.getPlaylists).mockResolvedValue([]);
    vi.mocked(apiService.getLlmConfig).mockResolvedValue({ llm_active: false, llm_provider: '', llm_model: '' });

    const { result } = renderHook(() => useSpotifyAuth());

    await waitFor(() => {
      expect(apiService.getPlaylists).toHaveBeenCalled();
      expect(apiService.getLlmConfig).toHaveBeenCalled();
    });

    await act(async () => {
      result.current.logout();
    });

    expect(spotifyAuth.logout).toHaveBeenCalled();
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.playlists).toEqual([]);
    expect(result.current.llmConfig).toBeNull();
  });
});

