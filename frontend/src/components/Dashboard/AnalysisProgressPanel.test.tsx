import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisProgressPanel } from './AnalysisProgressPanel';

describe('AnalysisProgressPanel Component', () => {
  it('renders pipeline step details and calculates percentage progress correctly', () => {
    const progress = {
      stage: 'audio_features',
      message: 'Fetching audio features for tracks...',
      step: 2,
      totalSteps: 6
    };

    render(<AnalysisProgressPanel progress={progress} />);

    expect(screen.getByText('Vibe Analysis Engine')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    expect(screen.getByText('audio features')).toBeInTheDocument(); // formats stage stage.replace('_', ' ') and uppercase
    expect(screen.getByText('33%')).toBeInTheDocument(); // Math.round((2 / 6) * 100) = 33%
    expect(screen.getByText('Fetching audio features for tracks...')).toBeInTheDocument();

    // Check step items checklist (Step 1 should be completed/emerald, Step 2 should be active/violet)
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Artist Genres')).toBeInTheDocument();

    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Audio Features')).toBeInTheDocument();

    expect(screen.getByText('Step 3')).toBeInTheDocument();
    expect(screen.getByText('Lyric Analysis')).toBeInTheDocument();
  });

  it('renders track counts badges when stage is lyrics and current/total are provided', () => {
    const progress = {
      stage: 'lyrics',
      message: 'Downloading track lyrics...',
      step: 3,
      totalSteps: 6,
      current: 12,
      total: 30
    };

    render(<AnalysisProgressPanel progress={progress} />);

    expect(screen.getByText('lyrics')).toBeInTheDocument();
    expect(screen.getByText('12 / 30 tracks')).toBeInTheDocument();
  });
});
