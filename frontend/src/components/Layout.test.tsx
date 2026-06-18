import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from './Layout';
import { spotifyAuth } from '../services/spotifyAuth';

// Mock spotifyAuth
vi.mock('../services/spotifyAuth', () => ({
  spotifyAuth: {
    logout: vi.fn(),
  },
}));

describe('Layout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children, header, and footer correctly', () => {
    render(
      <Layout onLogout={vi.fn()}>
        <div data-testid="test-child">Child Content</div>
      </Layout>
    );

    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByText('VIBE SPLITTER')).toBeInTheDocument();
    expect(screen.getByText(/Spotify Playlist Vibe Analyzer/i)).toBeInTheDocument();
    expect(screen.getByText(/© 2026 Spotify Vibe Splitter/i)).toBeInTheDocument();
  });

  it('renders sign out button and triggers logout flow when clicked', () => {
    const mockLogoutCallback = vi.fn();
    render(
      <Layout onLogout={mockLogoutCallback} showLogout={true}>
        <div>Content</div>
      </Layout>
    );

    const logoutButton = screen.getByRole('button', { name: /sign out/i });
    expect(logoutButton).toBeInTheDocument();

    fireEvent.click(logoutButton);

    expect(spotifyAuth.logout).toHaveBeenCalled();
    expect(mockLogoutCallback).toHaveBeenCalled();
  });

  it('does not render sign out button if showLogout is false', () => {
    render(
      <Layout onLogout={vi.fn()} showLogout={false}>
        <div>Content</div>
      </Layout>
    );

    const logoutButton = screen.queryByRole('button', { name: /sign out/i });
    expect(logoutButton).not.toBeInTheDocument();
  });
});

