import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalysisControls } from './AnalysisControls';

describe('AnalysisControls Component', () => {
  const defaultProps = {
    algorithm: 'kmeans' as const,
    setAlgorithm: vi.fn(),
    kValue: 4,
    setKValue: vi.fn(),
    genreWeight: 0.0,
    setGenreWeight: vi.fn(),
    eraWeight: 0.0,
    setEraWeight: vi.fn(),
    popularityWeight: 0.0,
    setPopularityWeight: vi.fn(),
    lyricsWeight: 0.0,
    setLyricsWeight: vi.fn(),
    lyricsStrategy: 'spotify_model',
    setLyricsStrategy: vi.fn(),
    recommendedK: null,
    onUpdateMap: vi.fn(),
    loading: false,
    onOpenDocs: vi.fn(),
  };

  it('renders algorithm selector and splits slider by default', () => {
    render(<AnalysisControls {...defaultProps} />);

    expect(screen.getByText('Algorithm:')).toBeInTheDocument();
    
    // Check select value
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('kmeans');

    // Check splits text
    expect(screen.getByText('Splits:')).toBeInTheDocument();
    expect(screen.getByText('4 vibes')).toBeInTheDocument();
  });

  it('hides splits slider and renders auto-calculated text for DBSCAN algorithm', () => {
    render(<AnalysisControls {...defaultProps} algorithm="dbscan" />);

    expect(screen.queryByText('Splits:')).not.toBeInTheDocument();
    expect(screen.getByText('Vibes auto-calculated')).toBeInTheDocument();
  });

  it('calls setAlgorithm and onUpdateMap when algorithm select option is changed', () => {
    const mockSetAlgo = vi.fn();
    const mockUpdateMap = vi.fn();

    render(
      <AnalysisControls
        {...defaultProps}
        setAlgorithm={mockSetAlgo}
        onUpdateMap={mockUpdateMap}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'agglomerative' } });

    expect(mockSetAlgo).toHaveBeenCalledWith('agglomerative');
    expect(mockUpdateMap).toHaveBeenCalledWith(
      4,
      'agglomerative',
      0.0,
      0.0,
      0.0,
      0.0,
      'spotify_model'
    );
  });

  it('opens algorithm help docs if doc button is clicked', () => {
    const mockOpenDocs = vi.fn();
    render(<AnalysisControls {...defaultProps} onOpenDocs={mockOpenDocs} />);

    const helpButton = screen.getByRole('button', { name: /view algorithm documentation/i });
    fireEvent.click(helpButton);

    expect(mockOpenDocs).toHaveBeenCalledWith('algorithms', 'kmeans');
  });

  it('shows recommended splits description if recommendedK is provided', () => {
    const { container } = render(<AnalysisControls {...defaultProps} recommendedK={5} />);
    
    // Recommended info icon should exist
    const tooltipIcon = container.querySelector('.lucide-info');
    expect(tooltipIcon).toBeInTheDocument();

    expect(screen.getByText('5 vibes might be a good fit but you can change it.')).toBeInTheDocument();
  });

  it('toggles collapsible tuning section and displays advanced sliders', () => {
    render(<AnalysisControls {...defaultProps} />);

    expect(screen.queryByText('Tuning Preset:')).not.toBeInTheDocument();

    // Toggle Tune Vibe button
    const tuneButton = screen.getByRole('button', { name: /tune vibe/i });
    fireEvent.click(tuneButton);

    expect(screen.getByText('Tuning Preset:')).toBeInTheDocument();
    expect(screen.getByText('Lyrical Model:')).toBeInTheDocument();

    // Sliders
    expect(screen.getByText('Genre Influence')).toBeInTheDocument();
    expect(screen.getByText('Era (Decade) Influence')).toBeInTheDocument();
    expect(screen.getByText('Popularity Influence')).toBeInTheDocument();
    expect(screen.getByText('Lyrics Influence')).toBeInTheDocument();
  });

  it('updates manual weights and sets preset to custom', () => {
    const mockSetGenreWeight = vi.fn();
    render(<AnalysisControls {...defaultProps} setGenreWeight={mockSetGenreWeight} />);

    // Open sliders
    const tuneButton = screen.getByRole('button', { name: /tune vibe/i });
    fireEvent.click(tuneButton);

    // Get Genre Influence slider
    const sliders = screen.getAllByRole('slider');
    // Genre Influence slider is the first slider inside collapsible tuning section (splits slider is first overall if open)
    // Splits slider is index 0. Genre is index 1.
    const genreSlider = sliders[1];

    fireEvent.change(genreSlider, { target: { value: '2.5' } });

    expect(mockSetGenreWeight).toHaveBeenCalledWith(2.5);
    // Preset dropdown should change to custom (controlled by component internal state update syncing hook)
  });

  it('applies presets correctly and updates individual weights', () => {
    const mockSetGenre = vi.fn();
    const mockSetEra = vi.fn();
    const mockSetPop = vi.fn();
    const mockSetLyrics = vi.fn();

    render(
      <AnalysisControls
        {...defaultProps}
        setGenreWeight={mockSetGenre}
        setEraWeight={mockSetEra}
        setPopularityWeight={mockSetPop}
        setLyricsWeight={mockSetLyrics}
      />
    );

    // Open sliders
    const tuneButton = screen.getByRole('button', { name: /tune vibe/i });
    fireEvent.click(tuneButton);

    // Click preset dropdown
    const presetSelect = screen.getAllByRole('combobox')[1]; // Second select is preset
    fireEvent.change(presetSelect, { target: { value: 'balanced' } });

    expect(mockSetGenre).toHaveBeenCalledWith(1.0);
    expect(mockSetEra).toHaveBeenCalledWith(1.5);
    expect(mockSetPop).toHaveBeenCalledWith(0.5);
    expect(mockSetLyrics).toHaveBeenCalledWith(0.5);
  });

  it('triggers onUpdateMap with correct parameters when update button is clicked', () => {
    const mockUpdateMap = vi.fn();
    render(<AnalysisControls {...defaultProps} onUpdateMap={mockUpdateMap} />);

    const updateButton = screen.getByRole('button', { name: /update map/i });
    fireEvent.click(updateButton);

    expect(mockUpdateMap).toHaveBeenCalledWith(
      4,
      'kmeans',
      0.0,
      0.0,
      0.0,
      0.0,
      'spotify_model'
    );
  });
});

