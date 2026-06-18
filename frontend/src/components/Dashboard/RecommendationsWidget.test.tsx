import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecommendationsWidget } from './RecommendationsWidget';
import { apiService } from '../../services/api';

// Mock apiService
vi.mock('../../services/api', () => ({
  apiService: {
    createSplits: vi.fn(),
  },
}));

// Mock ResizeObserver globally for jsdom environment
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('RecommendationsWidget Component', () => {
  const mockTracks = [
    {
      id: 't1',
      name: 'Chill Song',
      artists: 'Chill DJ',
      uri: 'spotify:track:1',
      album_images: [],
      cluster: 0,
      x: 0,
      y: 0,
      coords: { pca: {x:0,y:0,z:0}, tsne: {x:0,y:0,z:0}, umap: {x:0,y:0,z:0}, circumplex: {x:0,y:0,z:0} },
      popularity: 50,
      release_date: '2023',
      duration_ms: 180000,
      features: { key: 0, mode: 1, energy: 0.4, tempo: 115, valence: 0.5, acousticness: 0.5, danceability: 0.5, instrumentalness: 0, speechiness: 0, liveness: 0 },
      genres: []
    }
  ];

  const mockClusters = [
    {
      cluster_id: 0,
      count: 1,
      averages: { tempo: 115, energy: 0.4, valence: 0.5, acousticness: 0.5, danceability: 0.5 },
      top_genres: ['ambient'],
      representative_songs: []
    }
  ];

  const mockRecommendations = [
    {
      cluster_id: 0,
      playlist_name: 'Ambient Chill Out',
      description: 'Cozy ambient vibes',
      vibe_explanation: 'Slow tempo relaxing sounds'
    }
  ];

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
  });

  it('renders instructions to run analysis when clusters list is empty', () => {
    render(
      <RecommendationsWidget
        tracks={[]}
        clusters={[]}
        recommendations={[]}
        onExportSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Run analysis to generate splits.')).toBeInTheDocument();
  });

  it('renders vibe tabs, integration guide, and tracks lists correctly', () => {
    render(
      <RecommendationsWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        onExportSuccess={vi.fn()}
        llm_active={false} // show disabled integration guide
      />
    );

    expect(screen.getByText('Ambient Chill Out')).toBeInTheDocument();
    expect(screen.getByText('AI Vibe Summaries Disabled')).toBeInTheDocument(); // IntegrationGuide renders
    expect(screen.getByText('Tracks in this split')).toBeInTheDocument(); // TracksList renders
    expect(screen.getByText('Chill Song')).toBeInTheDocument();
  });

  it('allows editing playlist name and description details in input fields', () => {
    render(
      <RecommendationsWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        onExportSuccess={vi.fn()}
      />
    );

    // Edit Name
    const nameInput = screen.getByDisplayValue('Ambient Chill Out');
    fireEvent.change(nameInput, { target: { value: 'Super Ambient chill' } });
    expect(nameInput).toHaveValue('Super Ambient chill');

    // Edit Description
    const descInput = screen.getByDisplayValue('Cozy ambient vibes');
    fireEvent.change(descInput, { target: { value: 'New description here' } });
    expect(descInput).toHaveValue('New description here');
  });

  it('toggles DJ Flow transition order option', () => {
    const { container } = render(
      <RecommendationsWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        onExportSuccess={vi.fn()}
      />
    );

    const checkbox = container.querySelector('#dj-flow-toggle') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    expect(checkbox.checked).toBe(true);
  });

  it('submits payload and exports splits successfully when clicking export button', async () => {
    const mockExportSuccess = vi.fn();
    const mockCreateSplits = vi.mocked(apiService.createSplits);
    mockCreateSplits.mockResolvedValue({
      status: 'success',
      created_playlists: [{ playlist_id: 'pl123', name: 'Ambient Chill Out', track_count: 1 }]
    });

    render(
      <RecommendationsWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        onExportSuccess={mockExportSuccess}
      />
    );

    const exportButton = screen.getByRole('button', { name: /export vibe splits/i });
    fireEvent.click(exportButton);

    expect(mockCreateSplits).toHaveBeenCalledWith([
      {
        playlist_name: 'Ambient Chill Out',
        description: 'Cozy ambient vibes',
        track_uris: ['spotify:track:1']
      }
    ]);

    await waitFor(() => {
      expect(mockExportSuccess).toHaveBeenCalledWith([
        { playlist_id: 'pl123', name: 'Ambient Chill Out', track_count: 1 }
      ]);
    });
  });
});

