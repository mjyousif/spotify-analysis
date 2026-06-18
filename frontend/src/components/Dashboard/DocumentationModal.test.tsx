import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentationModal } from './DocumentationModal';

describe('DocumentationModal Component', () => {
  const mockMetadata = {
    algorithms: {
      kmeans: {
        name: 'K-Means (Balanced)',
        description: 'Standard distance-based grouping.',
        help_text: 'Tries to form equal circular clusters.',
        recommended_projections: ['circumplex']
      },
      dbscan: {
        name: 'DBSCAN (Density)',
        description: 'Finds clusters by density.',
        help_text: 'Isolates outliers and wildcards.',
        recommended_projections: ['circumplex']
      },
      llm_semantic: {
        name: 'AI Semantic Split',
        description: 'AI-driven grouping.',
        help_text: 'Uses LLM to group tracks.',
        recommended_projections: ['circumplex']
      }
    },
    projections: {
      circumplex: {
        name: 'Circumplex (Emotion)',
        description: 'Maps energy and valence.',
        help_text: 'Divides tracks into 4 emotional quadrants.',
        recommended_algorithms: ['kmeans']
      }
    }
  };

  it('renders null when isOpen is false', () => {
    const { container } = render(
      <DocumentationModal
        isOpen={false}
        onClose={vi.fn()}
        metadata={mockMetadata}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal content correctly when isOpen is true', () => {
    render(
      <DocumentationModal
        isOpen={true}
        onClose={vi.fn()}
        metadata={mockMetadata}
        initialTab="algorithms"
        initialKey="kmeans"
      />
    );

    expect(screen.getByText('System Documentation')).toBeInTheDocument();
    expect(screen.getAllByText('K-Means (Balanced)')[0]).toBeInTheDocument();
    expect(screen.getByText('Standard distance-based grouping.')).toBeInTheDocument();
    expect(screen.getByText('Tries to form equal circular clusters.')).toBeInTheDocument();
    expect(screen.getByText('When to choose K-Means:')).toBeInTheDocument(); // custom kmeans tip box
  });

  it('switches tabs and active item correctly', () => {
    render(
      <DocumentationModal
        isOpen={true}
        onClose={vi.fn()}
        metadata={mockMetadata}
        initialTab="algorithms"
        initialKey="kmeans"
      />
    );

    // Click Projections tab button
    const projectionsTab = screen.getByRole('button', { name: /projections/i });
    fireEvent.click(projectionsTab);

    expect(screen.getAllByText('Circumplex (Emotion)')[0]).toBeInTheDocument();
    expect(screen.getByText('Maps energy and valence.')).toBeInTheDocument();
  });

  it('calls onClose when backdrop or close button is clicked', () => {
    const mockClose = vi.fn();
    const { container } = render(
      <DocumentationModal
        isOpen={true}
        onClose={mockClose}
        metadata={mockMetadata}
      />
    );

    // Clicking close button
    const closeButton = screen.getByTitle('Close Documentation');
    fireEvent.click(closeButton);
    expect(mockClose).toHaveBeenCalledTimes(1);

    // Clicking backdrop (first child of overlay container is usually backdrop or sibling element)
    const backdrop = container.querySelector('.absolute.inset-0.bg-black\\/75');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it('triggers onApplySetting when recommended pairings buttons are clicked', () => {
    const mockApplySetting = vi.fn();
    const mockClose = vi.fn();
    render(
      <DocumentationModal
        isOpen={true}
        onClose={mockClose}
        metadata={mockMetadata}
        initialTab="algorithms"
        initialKey="kmeans"
        onApplySetting={mockApplySetting}
      />
    );

    // Recommended pairings section
    expect(screen.getByText('Recommended Pairings')).toBeInTheDocument();
    
    const pairingButton = screen.getByRole('button', { name: /use map: circumplex/i });
    fireEvent.click(pairingButton);

    expect(mockApplySetting).toHaveBeenCalledWith('projection', 'circumplex');
    expect(mockClose).toHaveBeenCalled();
  });

  it('triggers onApplySetting when recommended algorithms pairing is clicked under projections tab', () => {
    const mockApplySetting = vi.fn();
    const mockClose = vi.fn();
    render(
      <DocumentationModal
        isOpen={true}
        onClose={mockClose}
        metadata={mockMetadata}
        initialTab="projections"
        initialKey="circumplex"
        onApplySetting={mockApplySetting}
      />
    );

    const pairingButton = screen.getByRole('button', { name: /use algo: k-means \(balanced\)/i });
    fireEvent.click(pairingButton);

    expect(mockApplySetting).toHaveBeenCalledWith('algorithm', 'kmeans');
    expect(mockClose).toHaveBeenCalled();
  });

  it('renders LLM requirements box when llm_semantic is selected', () => {
    render(
      <DocumentationModal
        isOpen={true}
        onClose={vi.fn()}
        metadata={mockMetadata}
        initialTab="algorithms"
        initialKey="llm_semantic"
      />
    );

    expect(screen.getByText('LLM Requirements:')).toBeInTheDocument();
    expect(screen.getByText(/Requires a valid API key/i)).toBeInTheDocument();
  });
});
