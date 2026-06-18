import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LlmErrorModal } from './LlmErrorModal';

describe('LlmErrorModal Component', () => {
  it('renders error title, message, details, and close button correctly', () => {
    const mockClose = vi.fn();
    const errorMessage = 'API Key limit exceeded';

    render(<LlmErrorModal error={errorMessage} onClose={mockClose} />);

    expect(screen.getByText('AI Semantic Split Failed')).toBeInTheDocument();
    expect(screen.getByText('Error Details')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByText('Switching explicitly to K-Means (Balanced)...')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /got it/i });
    fireEvent.click(button);

    expect(mockClose).toHaveBeenCalled();
  });
});

