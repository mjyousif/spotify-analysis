import { useState, useEffect } from 'react';
import { spotifyAuth } from '../services/spotifyAuth';
import { apiService } from '../services/api';
import type { PlaylistInfo } from '../services/api';

export function useSpotifyAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(spotifyAuth.isLoggedIn());
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isBackendConfigured, setIsBackendConfigured] = useState<boolean>(true);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState<boolean>(false);
  const [llmConfig, setLlmConfig] = useState<{ llm_active: boolean; llm_provider: string; llm_model: string } | null>(null);

  // 1. Handle OAuth Callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthLoading(true);
      spotifyAuth.handleCallback(code)
        .then(() => {
          setIsLoggedIn(true);
          window.history.replaceState({}, document.title, window.location.pathname); // clear params
        })
        .catch(err => {
          console.error(err);
          setAuthError(err.message || "Failed to log in with Spotify.");
        })
        .finally(() => {
          setAuthLoading(false);
        });
    }
  }, []);

  // 2. Load Playlists if logged in
  useEffect(() => {
    if (isLoggedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaylistsLoading(true);
      apiService.getPlaylists()
        .then(data => {
          setPlaylists(data);
        })
        .catch(err => {
          console.error(err);
          // If token expired, log out
          if (err.response?.status === 401) {
            spotifyAuth.logout();
            setIsLoggedIn(false);
          }
        })
        .finally(() => {
          setPlaylistsLoading(false);
        });
    }
  }, [isLoggedIn]);

  // 3. Fetch LLM configuration status on login status change
  useEffect(() => {
    if (isLoggedIn) {
      apiService.getLlmConfig()
        .then(data => {
          setLlmConfig(data);
        })
        .catch(err => {
          console.error("Error fetching LLM config:", err);
        });
    }
  }, [isLoggedIn]);

  // 4. Verify that Spotify is configured on the backend
  useEffect(() => {
    if (!isLoggedIn) {
      apiService.getLoginUrl()
        .then(() => {
          setIsBackendConfigured(true);
        })
        .catch(err => {
          console.error("Spotify credentials check failed:", err);
          setIsBackendConfigured(false);
          setAuthError("Spotify Client ID & Secret are not configured in backend/.env. Please configure them on the backend server to enable login.");
        });
    }
  }, [isLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    spotifyAuth.login()
      .catch(err => {
        setAuthError(err.message || "Failed to initiate Spotify login.");
      })
      .finally(() => {
        setAuthLoading(false);
      });
  };

  const logout = () => {
    spotifyAuth.logout();
    setIsLoggedIn(false);
    setPlaylists([]);
    setLlmConfig(null);
  };

  return {
    isLoggedIn,
    authLoading,
    authError,
    isBackendConfigured,
    playlists,
    playlistsLoading,
    llmConfig,
    handleLogin,
    logout,
  };
}
