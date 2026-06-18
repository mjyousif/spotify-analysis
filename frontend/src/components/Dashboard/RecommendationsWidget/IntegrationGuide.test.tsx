import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrationGuide } from './IntegrationGuide';

describe('IntegrationGuide Component', () => {
  it('renders collapsed state description and triggers setIsGuideCollapsed when header is clicked', () => {
    const mockSetCollapsed = vi.fn();
    render(
      <IntegrationGuide
        isGuideCollapsed={true}
        setIsGuideCollapsed={mockSetCollapsed}
        guideTab="cloud"
        setGuideTab={vi.fn()}
      />
    );

    expect(screen.getByText('AI Vibe Summaries Disabled')).toBeInTheDocument();
    expect(screen.getByText(/No active LLM provider configured/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cloud apis/i })).not.toBeInTheDocument();

    const toggleButton = screen.getByRole('button');
    fireEvent.click(toggleButton);

    expect(mockSetCollapsed).toHaveBeenCalledWith(false);
  });

  it('renders expanded state with provider tabs and cloud instructions', () => {
    render(
      <IntegrationGuide
        isGuideCollapsed={false}
        setIsGuideCollapsed={vi.fn()}
        guideTab="cloud"
        setGuideTab={vi.fn()}
      />
    );

    expect(screen.getByText(/No active LLM provider is configured. The application is using rule-based/i).textContent).toContain('No active LLM provider is configured');
    expect(screen.getByRole('button', { name: /cloud apis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lm studio/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ollama/i })).toBeInTheDocument();

    // Cloud instructions
    expect(screen.getByText(/To use cloud models/i)).toBeInTheDocument();
    expect(screen.getByText(/GEMINI_API_KEY/i)).toBeInTheDocument();
  });

  it('triggers setGuideTab with appropriate tab names when tab buttons are clicked', () => {
    const mockSetTab = vi.fn();
    render(
      <IntegrationGuide
        isGuideCollapsed={false}
        setIsGuideCollapsed={vi.fn()}
        guideTab="cloud"
        setGuideTab={mockSetTab}
      />
    );

    const lmstudioTabButton = screen.getByRole('button', { name: /lm studio/i });
    fireEvent.click(lmstudioTabButton);

    expect(mockSetTab).toHaveBeenCalledWith('lmstudio');
  });

  it('renders LM Studio instructions when guideTab is lmstudio', () => {
    render(
      <IntegrationGuide
        isGuideCollapsed={false}
        setIsGuideCollapsed={vi.fn()}
        guideTab="lmstudio"
        setGuideTab={vi.fn()}
      />
    );

    expect(screen.getByText(/To run local models using LM Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/LLM_PROVIDER=lm_studio/i)).toBeInTheDocument();
  });

  it('renders Ollama instructions when guideTab is ollama', () => {
    render(
      <IntegrationGuide
        isGuideCollapsed={false}
        setIsGuideCollapsed={vi.fn()}
        guideTab="ollama"
        setGuideTab={vi.fn()}
      />
    );

    expect(screen.getByText(/To run local models using Ollama/i)).toBeInTheDocument();
    expect(screen.getByText(/ollama run llama3.2/i)).toBeInTheDocument();
  });
});
