import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DJDeckWidget } from './DJDeckWidget';
import type { TrackData } from '../../services/api';

describe('DJDeckWidget Component', () => {
  const mockTracks: TrackData[] = [
    {
      id: 'track1',
      name: 'Energetic Anthems',
      uri: 'spotify:track:1',
      artists: 'Artist X',
      album_images: [{ url: 'http://img.url/thumb.jpg', width: 64, height: 64 }],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 70,
      release_date: '2020-01-01',
      duration_ms: 180000,
      features: {
        key: 0,
        mode: 1,
        energy: 0.9,
        tempo: 122.0,
        valence: 0.5,
        acousticness: 0.1,
        danceability: 0.6,
        instrumentalness: 0,
        speechiness: 0,
        liveness: 0.1
      },
      genres: []
    },
    {
      id: 'track2',
      name: 'Smooth Flow',
      uri: 'spotify:track:2',
      artists: 'Artist Y',
      album_images: [],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 60,
      release_date: '2021-01-01',
      duration_ms: 200000,
      features: {
        key: 0, // 8B (compatible with 8B)
        mode: 1,
        energy: 0.5,
        tempo: 120.0,
        valence: 0.6,
        acousticness: 0.2,
        danceability: 0.7,
        instrumentalness: 0,
        speechiness: 0,
        liveness: 0.1
      },
      genres: []
    },
    {
      id: 'track3',
      name: 'Outlier Song',
      uri: 'spotify:track:3',
      artists: 'Artist Z',
      album_images: [],
      cluster: -1, // Outlier
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 30,
      release_date: '2019-01-01',
      duration_ms: 150000,
      features: {
        key: 5, // 7B (compatible with 8B)
        mode: 1,
        energy: 0.7,
        tempo: 121.0,
        valence: 0.4,
        acousticness: 0.3,
        danceability: 0.5,
        instrumentalness: 0.1,
        speechiness: 0.05,
        liveness: 0.2
      },
      genres: []
    }
  ];

  it('should render null when tracks list is empty', () => {
    const { container } = render(<DJDeckWidget tracks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render header and blend flow calculations', () => {
    render(<DJDeckWidget tracks={mockTracks} />);

    expect(screen.getByText('DJ Flow & Key Mix')).toBeInTheDocument();
    expect(screen.getByText('Harmonic transitions analysis')).toBeInTheDocument();
    
    // With 3 tracks, both transitions are harmonic (122 -> 121 and 122 -> 120 are compatible, let's see.
    // 8B (track2) -> 8B (track1) is compatible.
    // 8B (track1) -> 7B (track3) is compatible.
    // So 2 out of 2 transitions are harmonic (100% Blend Flow).
    expect(screen.getByText('100% Blend Flow')).toBeInTheDocument();
  });

  it('should render all track titles and key metadata', () => {
    render(<DJDeckWidget tracks={mockTracks} />);

    expect(screen.getByText('Energetic Anthems')).toBeInTheDocument();
    expect(screen.getByText('by Artist X')).toBeInTheDocument();
    expect(screen.getByText('122 BPM')).toBeInTheDocument();

    expect(screen.getByText('Smooth Flow')).toBeInTheDocument();
    expect(screen.getByText('by Artist Y')).toBeInTheDocument();
    expect(screen.getByText('120 BPM')).toBeInTheDocument();

    expect(screen.getByText('Outlier Song')).toBeInTheDocument();
  });
});

