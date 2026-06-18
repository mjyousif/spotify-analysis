import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TasteProfileWidget } from './TasteProfileWidget';
import type { TrackData } from '../../services/api';

describe('TasteProfileWidget Component', () => {
  const mockTracks: TrackData[] = [
    {
      id: 't1',
      name: 'Indie Hit',
      artists: 'Lofi Maker',
      uri: 'spotify:track:1',
      album_images: [{ url: 'http://img.url/t1.jpg', width: 64, height: 64 }],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 20, // Low popularity
      release_date: '2023',
      duration_ms: 180000,
      features: { key: 0, mode: 1, energy: 0.5, tempo: 120, valence: 0.5, acousticness: 0.5, danceability: 0.5, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    },
    {
      id: 't2',
      name: 'Mainstream Anthem',
      artists: 'Superstar DJ',
      uri: 'spotify:track:2',
      album_images: [], // Fallback test
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 80, // High popularity
      release_date: '2022',
      duration_ms: 220000,
      features: { key: 0, mode: 1, energy: 0.7, tempo: 125, valence: 0.7, acousticness: 0.3, danceability: 0.7, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    }
  ];

  it('renders null if tracks list is empty', () => {
    const { container } = render(<TasteProfileWidget tracks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('calculates average popularity and classifies as Balanced', () => {
    render(<TasteProfileWidget tracks={mockTracks} />);

    expect(screen.getByText('Taste Profile')).toBeInTheDocument();
    
    // Average popularity = (20 + 80) / 2 = 50. Classifies as Balanced / Cultured
    expect(screen.getByText('Balanced / Cultured (50%)')).toBeInTheDocument();
    expect(screen.getByText('You enjoy a healthy mix of secret gems and popular anthems.')).toBeInTheDocument();
  });

  it('classifies as Deeply Indie if average popularity is low', () => {
    const indieTracks = [mockTracks[0]]; // Pop: 20
    render(<TasteProfileWidget tracks={indieTracks} />);

    expect(screen.getByText('Deeply Indie / Underground (20%)')).toBeInTheDocument();
    expect(screen.getByText('You have an obscure, sub-radar taste, preferring hidden diamonds over radio hits.')).toBeInTheDocument();
  });

  it('classifies as Mainstream if average popularity is high', () => {
    const mainstreamTracks = [mockTracks[1]]; // Pop: 80
    render(<TasteProfileWidget tracks={mainstreamTracks} />);

    expect(screen.getByText('Mainstream / Billboard (80%)')).toBeInTheDocument();
    expect(screen.getByText('You love chart-topping anthems, high-production hits, and popular culture.')).toBeInTheDocument();
  });

  it('identifies and renders Underground Diamond and Crowd Pleaser correctly', () => {
    render(<TasteProfileWidget tracks={mockTracks} />);

    expect(screen.getByText('Underground Diamond')).toBeInTheDocument();
    expect(screen.getByText('Indie Hit')).toBeInTheDocument();
    expect(screen.getByText('Pop: 20%')).toBeInTheDocument();

    expect(screen.getByText('Crowd Pleaser')).toBeInTheDocument();
    expect(screen.getByText('Mainstream Anthem')).toBeInTheDocument();
    expect(screen.getByText('Pop: 80%')).toBeInTheDocument();

    // Verify Diamond has thumbnail image (by alt text)
    const img = screen.getByAltText('Indie Hit');
    expect(img).toHaveAttribute('src', 'http://img.url/t1.jpg');

    // Verify Pleaser renders fallback Music icon (svg)
    const pleaserSection = screen.getByText('Crowd Pleaser').closest('.space-y-2');
    expect(pleaserSection?.querySelector('img')).toBeNull();
    expect(pleaserSection?.querySelector('svg')).toBeInTheDocument();
  });
});

