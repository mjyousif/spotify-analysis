import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaylistGrid } from './PlaylistGrid';
import { apiService } from '../services/api';

// Mock apiService
vi.mock('../services/api', () => ({
  apiService: {
    searchPlaylists: vi.fn(),
  },
}));

describe('PlaylistGrid Component', () => {
  const mockPlaylists = [
    {
      id: 'p1',
      name: 'Vibe Playlist One',
      description: 'Lofi chill beats',
      images: [],
      tracks: { total: 25 },
      owner: { display_name: 'User A' }
    },
    {
      id: 'p2',
      name: 'Rock Classics',
      description: 'Golden age of rock',
      images: [],
      tracks: { total: 50 },
      owner: { display_name: 'User B' }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render skeleton loader cards when loading is true', () => {
    const { container } = render(
      <PlaylistGrid playlists={[]} onSelectPlaylist={vi.fn()} loading={true} />
    );
    const skeletonElements = container.getElementsByClassName('animate-pulse');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('should render playlists correctly when loading is false', () => {
    render(
      <PlaylistGrid playlists={mockPlaylists} onSelectPlaylist={vi.fn()} loading={false} />
    );

    expect(screen.getByText('Vibe Playlist One')).toBeInTheDocument();
    expect(screen.getByText('Lofi chill beats')).toBeInTheDocument();
    expect(screen.getByText('Rock Classics')).toBeInTheDocument();
    expect(screen.getByText('Golden age of rock')).toBeInTheDocument();
  });

  it('should filter playlists locally when searching in the library', () => {
    render(
      <PlaylistGrid playlists={mockPlaylists} onSelectPlaylist={vi.fn()} loading={false} />
    );

    const searchInput = screen.getByPlaceholderText(/filter library playlists/i);
    fireEvent.change(searchInput, { target: { value: 'Rock' } });

    expect(screen.queryByText('Vibe Playlist One')).not.toBeInTheDocument();
    expect(screen.getByText('Rock Classics')).toBeInTheDocument();
  });

  it('should call onSelectPlaylist when a playlist card is clicked', () => {
    const mockSelect = vi.fn();
    render(
      <PlaylistGrid playlists={mockPlaylists} onSelectPlaylist={mockSelect} loading={false} />
    );

    const card = screen.getByText('Vibe Playlist One');
    fireEvent.click(card);

    expect(mockSelect).toHaveBeenCalledWith('p1');
  });

  it('should support tab switching and public Spotify search', async () => {
    const mockSearchPlaylists = vi.mocked(apiService.searchPlaylists);
    mockSearchPlaylists.mockResolvedValue({
      playlists: [
        {
          id: 'pub1',
          name: 'Public Synthwave',
          description: 'Outrun and retrowave',
          images: [],
          tracks: { total: 100 },
          owner: { display_name: 'Public DJ' }
        }
      ],
      has_more: false,
      total: 1,
      limit: 10,
      offset: 0
    });

    render(
      <PlaylistGrid playlists={mockPlaylists} onSelectPlaylist={vi.fn()} loading={false} />
    );

    // Click on Search Spotify tab (using exact regex boundary to avoid matching just "Search")
    const searchTab = screen.getByRole('button', { name: /^search spotify$/i });
    fireEvent.click(searchTab);

    const publicSearchInput = screen.getByPlaceholderText(/search playlists, or paste a spotify/i);
    fireEvent.change(publicSearchInput, { target: { value: 'Synthwave' } });

    // Click on Search form submit button (using exact regex boundary)
    const searchButton = screen.getByRole('button', { name: /^search$/i });
    fireEvent.click(searchButton);

    expect(mockSearchPlaylists).toHaveBeenCalledWith('Synthwave', 0);

    await waitFor(() => {
      expect(screen.getByText('Public Synthwave')).toBeInTheDocument();
      expect(screen.getByText('Outrun and retrowave')).toBeInTheDocument();
    });
  });
});

