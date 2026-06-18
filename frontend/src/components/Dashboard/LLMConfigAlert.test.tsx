import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LLMConfigAlert } from './LLMConfigAlert';

describe('LLMConfigAlert Component', () => {
  it('should render active state correctly', () => {
    const activeConfig = {
      llm_active: true,
      llm_provider: 'openai',
      llm_model: 'gpt-4o-mini'
    };
    render(<LLMConfigAlert llmConfig={activeConfig} />);
    expect(screen.getByText('AI Vibe Engine Active')).toBeInTheDocument();
    expect(screen.getByText(/Powered by openai/)).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('should render standby state correctly', () => {
    const standbyConfig = {
      llm_active: false,
      llm_provider: 'none',
      llm_model: 'none'
    };
    render(<LLMConfigAlert llmConfig={standbyConfig} />);
    expect(screen.getByText('AI Vibe Engine Standby')).toBeInTheDocument();
    expect(screen.getByText(/Setup local LLM/)).toBeInTheDocument();
    expect(screen.getByText('Offline Mode')).toBeInTheDocument();
  });
});

