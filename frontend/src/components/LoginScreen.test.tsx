import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginScreen } from './LoginScreen';

// Mock Layout to isolate LoginScreen tests
vi.mock('./Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-layout">{children}</div>,
}));

describe('LoginScreen Component', () => {
  it('renders all info text, pitch cards, and Connect Spotify widget', () => {
    render(
      <LoginScreen
        authLoading={false}
        authError={null}
        isBackendConfigured={true}
        handleLogin={vi.fn()}
      />
    );

    expect(screen.getByText('Smart Playlist Curation')).toBeInTheDocument();
    expect(screen.getByText(/Unclutter Your Playlists/i)).toBeInTheDocument();
    expect(screen.getByText('Acoustic Clustering')).toBeInTheDocument();
    expect(screen.getByText('Interactive Split Mapping')).toBeInTheDocument();
    expect(screen.getByText('Connect Spotify')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login with spotify account/i })).toBeInTheDocument();
  });

  it('triggers handleLogin when form is submitted', () => {
    const mockHandleLogin = vi.fn((e) => e.preventDefault());
    render(
      <LoginScreen
        authLoading={false}
        authError={null}
        isBackendConfigured={true}
        handleLogin={mockHandleLogin}
      />
    );

    const loginButton = screen.getByRole('button', { name: /login with spotify account/i });
    fireEvent.click(loginButton);

    expect(mockHandleLogin).toHaveBeenCalled();
  });

  it('displays loading spinner and disables login button when authLoading is true', () => {
    render(
      <LoginScreen
        authLoading={true}
        authError={null}
        isBackendConfigured={true}
        handleLogin={vi.fn()}
      />
    );

    const loginButton = screen.getByRole('button');
    expect(loginButton).toBeDisabled();
    
    // Check that spinner container exists inside the button
    const spinner = loginButton.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('disables login button if isBackendConfigured is false', () => {
    render(
      <LoginScreen
        authLoading={false}
        authError={null}
        isBackendConfigured={false}
        handleLogin={vi.fn()}
      />
    );

    const loginButton = screen.getByRole('button', { name: /login with spotify account/i });
    expect(loginButton).toBeDisabled();
  });

  it('renders error message when authError is provided', () => {
    render(
      <LoginScreen
        authLoading={false}
        authError="Spotify OAuth access denied"
        isBackendConfigured={true}
        handleLogin={vi.fn()}
      />
    );

    expect(screen.getByText('Spotify OAuth access denied')).toBeInTheDocument();
  });
});
