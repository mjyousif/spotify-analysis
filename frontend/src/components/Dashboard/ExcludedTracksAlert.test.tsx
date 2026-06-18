import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExcludedTracksAlert } from './ExcludedTracksAlert';

describe('ExcludedTracksAlert Component', () => {
  const mockExcluded = [
    { id: '1', name: 'Track One', artists: 'Artist A', reason: 'Missing features' },
    { id: '2', name: 'Track Two', artists: 'Artist B', reason: 'Rate limited' }
  ];

  it('should render null when no excluded tracks are provided', () => {
    const { container } = render(<ExcludedTracksAlert excludedTracks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render header with correct count of excluded tracks', () => {
    render(<ExcludedTracksAlert excludedTracks={mockExcluded} />);
    expect(screen.getByText('2 Tracks Excluded From Clustering')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('should toggle table visibility when details button is clicked', async () => {
    render(<ExcludedTracksAlert excludedTracks={mockExcluded} />);
    
    const button = screen.getByRole('button', { name: /show details/i });
    expect(button).toBeInTheDocument();
    
    // Click to show details
    fireEvent.click(button);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Track One')).toBeInTheDocument();
    expect(screen.getByText('Track Two')).toBeInTheDocument();
    expect(screen.getByText('Missing features')).toBeInTheDocument();
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
    
    // Click to hide details
    const hideButton = screen.getByRole('button', { name: /hide details/i });
    fireEvent.click(hideButton);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

