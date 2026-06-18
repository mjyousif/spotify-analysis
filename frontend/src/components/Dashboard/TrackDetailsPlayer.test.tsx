import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackDetailsPlayer } from './TrackDetailsPlayer';
import type { TrackData } from '../../services/api';

describe('TrackDetailsPlayer Component', () => {
  const mockTrack: TrackData = {
    id: 'track123',
    name: 'Lo-Fi Chill Beats',
    uri: 'spotify:track:123',
    artists: 'Chill Producer',
    album_images: [
      { url: 'http://img.url/large.jpg', width: 300, height: 300 },
      { url: 'http://img.url/small.jpg', width: 64, height: 64 }
    ],
    cluster: 1,
    x: 0.5,
    y: 0.5,
    coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
    popularity: 50,
    release_date: '2023-01-01',
    duration_ms: 180000,
    features: {
      key: 5,
      mode: 1,
      energy: 0.45,
      tempo: 95.0,
      valence: 0.65,
      acousticness: 0.8,
      danceability: 0.75,
      instrumentalness: 0.9,
      speechiness: 0.05,
      liveness: 0.12
    },
    genres: ['lo-fi', 'ambient']
  };

  it('renders track title, artist name, and album thumbnail', () => {
    render(
      <TrackDetailsPlayer
        selectedTrack={mockTrack}
        loadSpotifyEmbed={false}
        setLoadSpotifyEmbed={vi.fn()}
      />
    );

    expect(screen.getByText('Lo-Fi Chill Beats')).toBeInTheDocument();
    expect(screen.getByText('by Chill Producer')).toBeInTheDocument();

    const img = screen.getByRole('img', { name: 'Lo-Fi Chill Beats' });
    expect(img).toHaveAttribute('src', 'http://img.url/small.jpg');
  });

  it('renders a default icon if album_images is empty', () => {
    const trackNoImages = { ...mockTrack, album_images: [] };
    const { container } = render(
      <TrackDetailsPlayer
        selectedTrack={trackNoImages}
        loadSpotifyEmbed={false}
        setLoadSpotifyEmbed={vi.fn()}
      />
    );

    const img = screen.queryByRole('img');
    expect(img).not.toBeInTheDocument();
    // Check that the lucide Music icon is rendered
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('calls setLoadSpotifyEmbed with true when Play Preview button is clicked', () => {
    const mockSetLoad = vi.fn();
    render(
      <TrackDetailsPlayer
        selectedTrack={mockTrack}
        loadSpotifyEmbed={false}
        setLoadSpotifyEmbed={mockSetLoad}
      />
    );

    const playButton = screen.getByRole('button', { name: /play preview/i });
    fireEvent.click(playButton);

    expect(mockSetLoad).toHaveBeenCalledWith(true);
  });

  it('renders Spotify iframe player when loadSpotifyEmbed is true', () => {
    const { container } = render(
      <TrackDetailsPlayer
        selectedTrack={mockTrack}
        loadSpotifyEmbed={true}
        setLoadSpotifyEmbed={vi.fn()}
      />
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://open.spotify.com/embed/track/track123?utm_source=generator&theme=0');
    expect(screen.queryByRole('button', { name: /play preview/i })).not.toBeInTheDocument();
  });

  it('renders genre tags and feature progress bars correctly', () => {
    render(
      <TrackDetailsPlayer
        selectedTrack={mockTrack}
        loadSpotifyEmbed={false}
        setLoadSpotifyEmbed={vi.fn()}
      />
    );

    // Genre tags (the text content is lowercase, case styling is CSS only)
    expect(screen.getByText('lo-fi')).toBeInTheDocument();
    expect(screen.getByText('ambient')).toBeInTheDocument();

    // Feature values
    expect(screen.getByText('ENERGY')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument(); // energy: 0.45

    expect(screen.getByText('TEMPO')).toBeInTheDocument();
    expect(screen.getByText('95 BPM')).toBeInTheDocument(); // tempo: 95.0

    expect(screen.getByText('VALENCE')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument(); // valence: 0.65

    expect(screen.getByText('ACOUSTICNESS')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument(); // acousticness: 0.8
  });
});

