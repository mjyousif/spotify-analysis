import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TracksList } from './TracksList';
import type { TrackData } from '../../../services/api';

describe('TracksList Component', () => {
  const mockTracks: TrackData[] = [
    {
      id: 't1',
      name: 'Song A',
      artists: 'Artist A',
      uri: 'spotify:track:1',
      album_images: [{ url: 'http://img.url/t1.jpg', width: 64, height: 64 }],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 50,
      release_date: '2023',
      duration_ms: 200000,
      features: { key: 0, mode: 1, energy: 0.5, tempo: 120, valence: 0.5, acousticness: 0.5, danceability: 0.5, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    },
    {
      id: 't2',
      name: 'Song B',
      artists: 'Artist B',
      uri: 'spotify:track:2',
      album_images: [], // No images to test fallback icon
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 40,
      release_date: '2022',
      duration_ms: 180000,
      features: { key: 0, mode: 1, energy: 0.6, tempo: 125, valence: 0.6, acousticness: 0.4, danceability: 0.6, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    }
  ];

  it('renders list header and tracks correctly', () => {
    const mockRef = React.createRef<HTMLDivElement>();
    render(
      <TracksList
        tracks={mockTracks}
        selectedTrack={null}
        onSelectTrack={vi.fn()}
        tracksListRef={mockRef}
      />
    );

    expect(screen.getByText('Tracks in this split')).toBeInTheDocument();
    expect(screen.getByText('Song A')).toBeInTheDocument();
    expect(screen.getByText('Artist A')).toBeInTheDocument();
    expect(screen.getByText('Song B')).toBeInTheDocument();
    expect(screen.getByText('Artist B')).toBeInTheDocument();

    // Verify Song A has image
    const songAButton = screen.getByRole('button', { name: /song a/i });
    const img = songAButton.querySelector('img');
    expect(img).toHaveAttribute('src', 'http://img.url/t1.jpg');

    // Verify Song B renders Music icon (svg) instead of image
    const songBButton = screen.getByRole('button', { name: /song b/i });
    expect(songBButton.querySelector('img')).toBeNull();
    expect(songBButton.querySelector('svg')).toBeInTheDocument();
  });

  it('calls onSelectTrack callback when a track row is clicked', () => {
    const mockSelect = vi.fn();
    const mockRef = React.createRef<HTMLDivElement>();
    render(
      <TracksList
        tracks={mockTracks}
        selectedTrack={null}
        onSelectTrack={mockSelect}
        tracksListRef={mockRef}
      />
    );

    const songAButton = screen.getByRole('button', { name: /song a/i });
    fireEvent.click(songAButton);

    expect(mockSelect).toHaveBeenCalledWith(mockTracks[0]);
  });

  it('applies selection highlights to the selected track', () => {
    const mockRef = React.createRef<HTMLDivElement>();
    render(
      <TracksList
        tracks={mockTracks}
        selectedTrack={mockTracks[0]}
        onSelectTrack={vi.fn()}
        tracksListRef={mockRef}
      />
    );

    const songAButton = screen.getByRole('button', { name: /song a/i });
    expect(songAButton.className).toContain('bg-violet-500/10');
    expect(songAButton.className).toContain('border-l-violet-500');

    const songBButton = screen.getByRole('button', { name: /song b/i });
    expect(songBButton.className).toContain('border-l-transparent');
    expect(songBButton.className).not.toContain('bg-violet-500/10');
  });
});

