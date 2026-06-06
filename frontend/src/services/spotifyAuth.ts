// Spotify PKCE OAuth Helper Services

const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin.replace("localhost", "[::1]")}/callback`;
const SCOPES = "playlist-read-private playlist-modify-private";

// Helper to generate a random string for code verifier
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values).map((x) => possible[x % possible.length]).join('');
}

// Helper to SHA-256 hash the verifier to create the challenge
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // timestamp in ms
}

let refreshPromise: Promise<string> | null = null;

export const spotifyAuth = {
  getClientId(): string {
    return localStorage.getItem("spotify_client_id") || import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
  },

  setClientId(clientId: string) {
    localStorage.setItem("spotify_client_id", clientId);
  },

  isLoggedIn(): boolean {
    const sessionStr = localStorage.getItem("spotify_session");
    if (!sessionStr) return false;
    
    try {
      const session: AuthSession = JSON.parse(sessionStr);
      // We are logged in if we have a refresh token (can refresh dynamically)
      // or if the access token hasn't expired yet
      return !!session.refreshToken || Date.now() < session.expiresAt - 60000;
    } catch {
      return false;
    }
  },

  async getAccessToken(): Promise<string | null> {
    const sessionStr = localStorage.getItem("spotify_session");
    if (!sessionStr) return null;
    try {
      const session: AuthSession = JSON.parse(sessionStr);
      // Check if token has expired or is about to expire (within 60 seconds)
      if (Date.now() >= session.expiresAt - 60000) {
        if (session.refreshToken) {
          try {
            return await this.refreshAccessToken();
          } catch (e) {
            console.error("Failed to automatically refresh access token:", e);
            return null;
          }
        }
        return null;
      }
      return session.accessToken;
    } catch {
      return null;
    }
  },

  async refreshAccessToken(): Promise<string> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const sessionStr = localStorage.getItem("spotify_session");
        if (!sessionStr) throw new Error("No session found to refresh.");
        
        const session: AuthSession = JSON.parse(sessionStr);
        const refreshToken = session.refreshToken;
        if (!refreshToken) throw new Error("No refresh token available.");
        
        const clientId = this.getClientId();
        if (!clientId) throw new Error("Spotify Client ID is required to refresh token.");

        const payload = new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        });

        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: payload,
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logout();
          throw new Error(`Failed to refresh token: ${errorText}`);
        }

        const data = await response.json();
        const newSession: AuthSession = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken,
          expiresAt: Date.now() + data.expires_in * 1000,
        };

        localStorage.setItem("spotify_session", JSON.stringify(newSession));
        return data.access_token;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  async login(customClientId?: string) {
    const clientId = customClientId || this.getClientId();
    if (!clientId) {
      throw new Error("Spotify Client ID is required to log in.");
    }
    
    // Save Client ID in case they input it manually
    this.setClientId(clientId);

    const codeVerifier = generateRandomString(64);
    window.sessionStorage.setItem('spotify_code_verifier', codeVerifier);

    const challenge = await generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      redirect_uri: REDIRECT_URI,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  },

  async handleCallback(code: string): Promise<void> {
    const clientId = this.getClientId();
    const codeVerifier = window.sessionStorage.getItem('spotify_code_verifier');

    if (!codeVerifier) {
      throw new Error("OAuth verifier missing from session storage.");
    }

    const payload = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to retrieve token: ${errorText}`);
    }

    const data = await response.json();
    
    const session: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    localStorage.setItem("spotify_session", JSON.stringify(session));
    window.sessionStorage.removeItem('spotify_code_verifier');
  },

  logout() {
    localStorage.removeItem("spotify_session");
    // We keep the client ID saved in localStorage so they don't have to re-type it
  }
};
