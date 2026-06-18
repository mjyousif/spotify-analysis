import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ScatterPlotWidget } from './ScatterPlotWidget';

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

// Declare mock functions inside vi.hoisted to prevent hoisting errors
const { mockNewPlot, mockReact, mockPurge, getRegisteredClickHandler } = vi.hoisted(() => {
  let clickHandler: any;
  const mockNewPlotFn = vi.fn().mockImplementation((el, _data, _layout, _config) => {
    el.on = vi.fn((event, handler) => {
      if (event === 'plotly_click') {
        clickHandler = handler;
      }
    });
    return Promise.resolve();
  });
  return {
    mockNewPlot: mockNewPlotFn,
    mockReact: vi.fn().mockResolvedValue(undefined),
    mockPurge: vi.fn(),
    getRegisteredClickHandler: () => clickHandler,
  };
});

vi.mock('plotly.js/dist/plotly', () => ({
  default: {
    newPlot: mockNewPlot,
    react: mockReact,
    purge: mockPurge,
    Plots: {
      resize: vi.fn(),
    }
  }
}));

describe('ScatterPlotWidget Component', () => {
  const mockTracks = [
    {
      id: 't1',
      name: 'Song Alpha',
      uri: 'spotify:track:t1',
      artists: 'Artist A',
      album_images: [{ url: 'http://image' }],
      cluster: 0,
      x: 1,
      y: 2,
      popularity: 80,
      release_date: '2020',
      duration_ms: 180000,
      features: {
        tempo: 120,
        energy: 0.8,
        valence: 0.9,
        acousticness: 0.1,
        danceability: 0.7,
        instrumentalness: 0.0,
        speechiness: 0.05,
        liveness: 0.1,
        mode: 1,
        key: 5,
      },
      genres: [],
      coords: {
        pca: { x: 10, y: 20 },
        tsne: { x: 100, y: 200 },
        umap: { x: 50, y: 60 },
        circumplex: { x: 0.9, y: 0.8 },
      }
    },
    {
      id: 't2',
      name: 'Song Beta',
      uri: 'spotify:track:t2',
      artists: 'Artist B',
      album_images: [],
      cluster: 1,
      x: -1,
      y: -2,
      popularity: 30,
      release_date: '2018',
      duration_ms: 220000,
      features: {
        tempo: 95,
        energy: 0.4,
        valence: 0.3,
        acousticness: 0.7,
        danceability: 0.5,
        instrumentalness: 0.2,
        speechiness: 0.04,
        liveness: 0.12,
        mode: 0,
        key: 7,
      },
      genres: [],
      coords: {
        pca: { x: -10, y: -20 },
        tsne: { x: -100, y: -200 },
        umap: { x: -50, y: -60 },
        circumplex: { x: 0.3, y: 0.4 },
      }
    }
  ];

  const mockClusters = [
    {
      cluster_id: 0,
      count: 1,
      averages: { tempo: 120, energy: 0.8, valence: 0.9, acousticness: 0.1, danceability: 0.7 },
      top_genres: [],
      representative_songs: []
    },
    {
      cluster_id: 1,
      count: 1,
      averages: { tempo: 95, energy: 0.4, valence: 0.3, acousticness: 0.7, danceability: 0.5 },
      top_genres: [],
      representative_songs: []
    }
  ];

  const mockRecommendations = [
    { cluster_id: 0, playlist_name: 'Chill Hype', description: 'desc', vibe_explanation: 'vibe' },
    { cluster_id: 1, playlist_name: 'Acoustic Calm', description: 'desc', vibe_explanation: 'vibe' }
  ];

  const mockOnSelectTrack = vi.fn();
  const mockSetProjectionMode = vi.fn();
  const mockOnOpenDocs = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders message when there are no tracks', () => {
    render(
      <ScatterPlotWidget
        tracks={[]}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    expect(screen.getByText('No tracks to visualize')).toBeInTheDocument();
  });

  it('initializes Plotly chart and renders components', async () => {
    render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
        onOpenDocs={mockOnOpenDocs}
      />
    );

    expect(screen.getByText('Vibe Similarity Map')).toBeInTheDocument();
    expect(screen.getByText('PCA reduction of track acoustics. Preserves global feature structure (2D Projection).')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockNewPlot).toHaveBeenCalled();
    });
  });

  it('updates Plotly react when selectedTrack changes', async () => {
    const { rerender } = render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    await waitFor(() => {
      expect(mockNewPlot).toHaveBeenCalled();
    });

    // Rerender with a selected track
    rerender(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={mockTracks[0]}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    expect(mockReact).toHaveBeenCalled();
    expect(screen.getByText('Song Alpha')).toBeInTheDocument();
    expect(screen.getByText('Artist A')).toBeInTheDocument();
  });

  it('toggles 2D / 3D dimensions and updates descriptions', async () => {
    render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="circumplex"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    expect(screen.getByText(/Russell Circumplex mapping/)).toBeInTheDocument();

    const btn3D = screen.getByText('3D');
    fireEvent.click(btn3D);

    expect(screen.getByText(/Russell Circumplex mapping \(Valence vs. Energy vs. Danceability\)/)).toBeInTheDocument();

    const btn2D = screen.getByText('2D');
    fireEvent.click(btn2D);

    expect(screen.getByText(/Russell Circumplex mapping \(Valence vs. Energy\)/)).toBeInTheDocument();
  });

  it('triggers setProjectionMode when dropdown changes', () => {
    render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'tsne' } });

    expect(mockSetProjectionMode).toHaveBeenCalledWith('tsne');
  });

  it('triggers onOpenDocs when help button is clicked', () => {
    render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="umap"
        setProjectionMode={mockSetProjectionMode}
        onOpenDocs={mockOnOpenDocs}
      />
    );

    const helpBtn = screen.getByTitle('View Projection Documentation');
    fireEvent.click(helpBtn);

    expect(mockOnOpenDocs).toHaveBeenCalledWith('projections', 'umap');
  });

  it('handles node click callback and selects track via curve and point indices', async () => {
    render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    await waitFor(() => {
      expect(mockNewPlot).toHaveBeenCalled();
    });

    const clickHandler = getRegisteredClickHandler();
    expect(clickHandler).toBeDefined();

    // Trigger registered click handler simulating click on trace 0, index 0 (which maps to mockTracks[0])
    act(() => {
      clickHandler({
        points: [
          {
            curveNumber: 0,
            pointIndex: 0,
            customdata: 't1'
          }
        ]
      });
    });

    expect(mockOnSelectTrack).toHaveBeenCalledWith(mockTracks[0]);
  });

  it('handles node click callback fallback via customdata (trackId)', async () => {
    render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    await waitFor(() => {
      expect(mockNewPlot).toHaveBeenCalled();
    });

    const clickHandler = getRegisteredClickHandler();
    expect(clickHandler).toBeDefined();

    // Simulate curveNumber matching nothing but customdata pointing to 't2'
    act(() => {
      clickHandler({
        points: [
          {
            curveNumber: 99,
            pointIndex: 99,
            customdata: ['t2']
          }
        ]
      });
    });

    expect(mockOnSelectTrack).toHaveBeenCalledWith(mockTracks[1]);
  });

  it('purges plot and disconnects observers on unmount', async () => {
    const { unmount } = render(
      <ScatterPlotWidget
        tracks={mockTracks}
        clusters={mockClusters}
        recommendations={mockRecommendations}
        selectedTrack={null}
        onSelectTrack={mockOnSelectTrack}
        projectionMode="pca"
        setProjectionMode={mockSetProjectionMode}
      />
    );

    await waitFor(() => {
      expect(mockNewPlot).toHaveBeenCalled();
    });

    unmount();

    expect(mockPurge).toHaveBeenCalled();
  });
});

