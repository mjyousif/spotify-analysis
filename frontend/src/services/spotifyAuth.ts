// Spotify Backend-Driven OAuth Helper Services

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // timestamp in ms
}

let refreshPromise: Promise<string> | null = null;

export const spotifyAuth = {
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

        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
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

  async login() {
    const response = await fetch(`${API_BASE_URL}/api/auth/login-url`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch login URL from backend: ${errorText}`);
    }
    const data = await response.json();
    if (!data.url) {
      throw new Error("Authorization URL missing from backend response.");
    }
    window.location.href = data.url;
  },

  async handleCallback(code: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
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
  },

  logout() {
    localStorage.removeItem("spotify_session");
  }
};
