import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportSuccessModal } from './ExportSuccessModal';

describe('ExportSuccessModal Component', () => {
  const mockPlaylists = [
    { playlist_id: 'p1', name: 'Chill Vibes Splitted', track_count: 15 },
    { playlist_id: 'p2', name: 'Upbeat Rock Splitted', track_count: 22 }
  ];

  it('renders success headers, count of playlists, list items, and external links', () => {
    const mockClose = vi.fn();
    render(<ExportSuccessModal exportedPlaylists={mockPlaylists} onClose={mockClose} />);

    expect(screen.getByText('Playlists Created!')).toBeInTheDocument();
    expect(screen.getByText(/successfully split your playlist and exported 2 new vibe groupings/i)).toBeInTheDocument();
    expect(screen.getByText('New Playlists')).toBeInTheDocument();

    // Check playlist details
    expect(screen.getByText('Chill Vibes Splitted')).toBeInTheDocument();
    expect(screen.getByText('Upbeat Rock Splitted')).toBeInTheDocument();

    // Check links
    const links = screen.getAllByRole('link', { name: /open/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://open.spotify.com/playlist/p1');
    expect(links[1]).toHaveAttribute('href', 'https://open.spotify.com/playlist/p2');

    // Click Return button
    const button = screen.getByRole('button', { name: /return to playlists list/i });
    fireEvent.click(button);

    expect(mockClose).toHaveBeenCalled();
  });
});

