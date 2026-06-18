import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EraTimelineWidget } from './EraTimelineWidget';
import type { TrackData } from '../../services/api';

describe('EraTimelineWidget Component', () => {
  const mockTracks: TrackData[] = [
    {
      id: 't1',
      name: 'Oldie Goldie',
      artists: 'Retro Artist',
      uri: 'spotify:track:1',
      album_images: [{ url: 'http://img.url/old.jpg', width: 64, height: 64 }],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 30,
      release_date: '1975-06-01',
      duration_ms: 240000,
      features: { key: 0, mode: 1, energy: 0.5, tempo: 120, valence: 0.5, acousticness: 0.5, danceability: 0.5, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    },
    {
      id: 't2',
      name: 'Modern Jam',
      artists: 'Fresh Artist',
      uri: 'spotify:track:2',
      album_images: [],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 80,
      release_date: '2021-08-15',
      duration_ms: 180000,
      features: { key: 0, mode: 1, energy: 0.8, tempo: 128, valence: 0.8, acousticness: 0.2, danceability: 0.8, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    }
  ];

  it('renders null if tracks list is empty', () => {
    const { container } = render(<EraTimelineWidget tracks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('calculates decades counts and renders list of eras', () => {
    render(<EraTimelineWidget tracks={mockTracks} />);

    expect(screen.getByText('Era Timeline')).toBeInTheDocument();
    expect(screen.getByText('Release year distribution')).toBeInTheDocument();

    // Check decades
    expect(screen.getByText('70s')).toBeInTheDocument();
    expect(screen.getByText('20s')).toBeInTheDocument();
    expect(screen.getAllByText('1 song (50%)')).toHaveLength(2);

    // Verification that other empty decades (like 80s, 90s) are not rendered/hidden
    expect(screen.queryByText('80s')).toBeNull();
  });

  it('displays oldest and newest tracks highlights correctly', () => {
    render(<EraTimelineWidget tracks={mockTracks} />);

    expect(screen.getByText('Oldest Classic')).toBeInTheDocument();
    expect(screen.getByText('Oldie Goldie')).toBeInTheDocument();
    expect(screen.getByText('Released: 1975')).toBeInTheDocument();

    expect(screen.getByText('Newest Release')).toBeInTheDocument();
    expect(screen.getByText('Modern Jam')).toBeInTheDocument();
    expect(screen.getByText('Released: 2021')).toBeInTheDocument();
  });
});
