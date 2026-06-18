import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spotifyAuth } from './spotifyAuth';

describe('spotifyAuth service', () => {
  const originalLocation = window.location;
  let consoleErrorSpy: any;

  beforeEach(() => {
    localStorage.clear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mock global fetch
    global.fetch = vi.fn();
    // Mock window.location.href
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      href: '',
      pathname: '/callback'
    } as any;
  });

  afterEach(async () => {
    window.location = originalLocation;
    consoleErrorSpy.mockRestore();
    // Yield to the event loop to ensure any pending finally blocks in spotifyAuth clear refreshPromise
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('isLoggedIn returns false when session does not exist', () => {
    expect(spotifyAuth.isLoggedIn()).toBe(false);
  });

  it('isLoggedIn returns true when valid session exists', () => {
    const session = {
      accessToken: 'acc123',
      refreshToken: 'ref123',
      expiresAt: Date.now() + 120000 // 2 minutes from now
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    expect(spotifyAuth.isLoggedIn()).toBe(true);
  });

  it('isLoggedIn returns false when session has expired', () => {
    const session = {
      accessToken: 'acc123',
      expiresAt: Date.now() - 5000 // expired 5s ago
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    expect(spotifyAuth.isLoggedIn()).toBe(false);
  });

  it('isLoggedIn returns false on invalid JSON', () => {
    localStorage.setItem('spotify_session', 'invalid-json');
    expect(spotifyAuth.isLoggedIn()).toBe(false);
  });

  it('getAccessToken returns null if session does not exist', async () => {
    const token = await spotifyAuth.getAccessToken();
    expect(token).toBeNull();
  });

  it('getAccessToken returns null on invalid JSON', async () => {
    localStorage.setItem('spotify_session', 'invalid-json');
    const token = await spotifyAuth.getAccessToken();
    expect(token).toBeNull();
  });

  it('getAccessToken returns token if not expired', async () => {
    const session = {
      accessToken: 'token123',
      expiresAt: Date.now() + 120000
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    const token = await spotifyAuth.getAccessToken();
    expect(token).toBe('token123');
  });

  it('getAccessToken triggers refresh and updates localStorage if expired', async () => {
    const session = {
      accessToken: 'old_token',
      refreshToken: 'refresh_123',
      expiresAt: Date.now() - 5000
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    // Mock fetch for token refresh
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new_token',
        expires_in: 3600
      })
    } as Response);

    const token = await spotifyAuth.getAccessToken();
    expect(token).toBe('new_token');

    // Verify localStorage has been updated
    const updated = JSON.parse(localStorage.getItem('spotify_session') || '{}');
    expect(updated.accessToken).toBe('new_token');
    expect(updated.refreshToken).toBe('refresh_123'); // retains old refresh token
  });

  it('getAccessToken returns null if expired and no refresh token exists', async () => {
    const session = {
      accessToken: 'old_token',
      expiresAt: Date.now() - 5000
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    const token = await spotifyAuth.getAccessToken();
    expect(token).toBeNull();
  });

  it('getAccessToken returns null if token refresh fails', async () => {
    const session = {
      accessToken: 'old_token',
      refreshToken: 'refresh_123',
      expiresAt: Date.now() - 5000
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const token = await spotifyAuth.getAccessToken();
    expect(token).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to automatically refresh access token:', expect.any(Error));
  });

  it('refreshAccessToken throws if no session exists', async () => {
    await expect(spotifyAuth.refreshAccessToken()).rejects.toThrow('No session found to refresh.');
  });

  it('refreshAccessToken throws if refresh token is missing in session', async () => {
    const session = {
      accessToken: 'old_token',
      expiresAt: Date.now()
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));
    await expect(spotifyAuth.refreshAccessToken()).rejects.toThrow('No refresh token available.');
  });

  it('refreshAccessToken handles non-ok response and logs out', async () => {
    const session = {
      accessToken: 'old_token',
      refreshToken: 'refresh_123',
      expiresAt: Date.now()
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => 'Unauthorized request'
    } as Response);

    await expect(spotifyAuth.refreshAccessToken()).rejects.toThrow('Failed to refresh token: Unauthorized request');
    expect(localStorage.getItem('spotify_session')).toBeNull(); // should be cleared by logout
  });

  it('refreshAccessToken reuses promise when called concurrently', async () => {
    const session = {
      accessToken: 'old_token',
      refreshToken: 'refresh_123',
      expiresAt: Date.now()
    };
    localStorage.setItem('spotify_session', JSON.stringify(session));

    let resolveFetch: any;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = () => resolve({
        ok: true,
        json: async () => ({
          access_token: 'concurrent_token',
          expires_in: 3600
        })
      } as Response);
    });

    vi.mocked(fetch).mockReturnValue(fetchPromise);

    const p1 = spotifyAuth.refreshAccessToken();
    const p2 = spotifyAuth.refreshAccessToken();

    resolveFetch();

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('concurrent_token');
    expect(t2).toBe('concurrent_token');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('login fetches auth URL from backend and redirects', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://spotify.auth.url' })
    } as Response);

    await spotifyAuth.login();

    expect(fetch).toHaveBeenCalledWith('/api/auth/login-url');
    expect(window.location.href).toBe('https://spotify.auth.url');
  });

  it('login throws if response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => 'Service Unavailable'
    } as Response);

    await expect(spotifyAuth.login()).rejects.toThrow('Failed to fetch login URL from backend: Service Unavailable');
  });

  it('login throws if URL is missing in response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({})
    } as Response);

    await expect(spotifyAuth.login()).rejects.toThrow('Authorization URL missing from backend response.');
  });

  it('handleCallback exchanges auth code for session tokens', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'ac_token_code',
        refresh_token: 'rf_token_code',
        expires_in: 3600
      })
    } as Response);

    await spotifyAuth.handleCallback('code123');

    expect(fetch).toHaveBeenCalledWith('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'code123' })
    });

    const saved = JSON.parse(localStorage.getItem('spotify_session') || '{}');
    expect(saved.accessToken).toBe('ac_token_code');
    expect(saved.refreshToken).toBe('rf_token_code');
    expect(saved.expiresAt).toBeGreaterThan(Date.now());
  });

  it('handleCallback throws if exchange fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => 'Invalid Authorization Code'
    } as Response);

    await expect(spotifyAuth.handleCallback('bad_code')).rejects.toThrow('Failed to retrieve token: Invalid Authorization Code');
  });

  it('logout removes session from localStorage', () => {
    localStorage.setItem('spotify_session', 'dummy');
    spotifyAuth.logout();
    expect(localStorage.getItem('spotify_session')).toBeNull();
  });
});

