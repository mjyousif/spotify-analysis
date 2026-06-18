import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureAveragesWidget } from './FeatureAveragesWidget';

describe('FeatureAveragesWidget Component', () => {
  const mockClusters = [
    {
      cluster_id: 0,
      count: 10,
      averages: {
        tempo: 120.0,
        energy: 0.8,
        valence: 0.6,
        acousticness: 0.15,
        danceability: 0.7
      },
      top_genres: ['pop'],
      representative_songs: []
    },
    {
      cluster_id: -1, // Outlier/Wildcards
      count: 2,
      averages: {
        tempo: 90.0,
        energy: 0.4,
        valence: 0.3,
        acousticness: 0.8,
        danceability: 0.5
      },
      top_genres: ['classical'],
      representative_songs: []
    }
  ];

  const mockRecommendations = [
    {
      cluster_id: 0,
      playlist_name: 'Summer Vibes',
      description: 'Upbeat summer tracks',
      vibe_explanation: 'Energetic and sunny'
    }
  ];

  it('should render null when clusters list is empty', () => {
    const { container } = render(
      <FeatureAveragesWidget clusters={[]} recommendations={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render profiles comparison header and labels', () => {
    render(
      <FeatureAveragesWidget clusters={mockClusters} recommendations={mockRecommendations} />
    );

    expect(screen.getByText('Acoustic Profiles Comparison')).toBeInTheDocument();
    expect(screen.getByText('Energy 🔥')).toBeInTheDocument();
    expect(screen.getByText('Valence (Happiness) ☀️')).toBeInTheDocument();
    expect(screen.getByText('Acousticness 🎻')).toBeInTheDocument();
    expect(screen.getByText('Danceability 💃')).toBeInTheDocument();
    expect(screen.getByText('BPM (Tempo) ⚡')).toBeInTheDocument();
  });

  it('should display formatting values and playlist names correctly', () => {
    render(
      <FeatureAveragesWidget clusters={mockClusters} recommendations={mockRecommendations} />
    );

    // Vibe 0 name should resolve to 'Summer Vibes' from recommendations
    expect(screen.getAllByText('Summer Vibes').length).toBe(5); // Appears once per metric column
    
    // Outlier name should resolve to 'Wildcards'
    expect(screen.getAllByText('Wildcards').length).toBe(5);

    // Verify formatted metric numbers (80% exists for energy and acousticness)
    expect(screen.getAllByText('80%').length).toBe(2);
    expect(screen.getByText('40%')).toBeInTheDocument(); // Energy cluster -1 (0.4)
    expect(screen.getByText('120 BPM')).toBeInTheDocument(); // Tempo cluster 0 (120)
    expect(screen.getByText('90 BPM')).toBeInTheDocument(); // Tempo cluster -1 (90)
  });
});

