import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary Component', () => {
  // Suppress expected console.error logs for throwing component tests
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error('Test crash error');
    }
    return <div>Normal Content</div>;
  };

  it('should render children normally when no error occurs', () => {
    render(
      <ErrorBoundary name="TestWidget">
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('should catch errors and render fallback UI with retry button', () => {
    render(
      <ErrorBoundary name="TestWidget">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('TestWidget failed')).toBeInTheDocument();
    expect(screen.getByText('Test crash error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry widget/i })).toBeInTheDocument();
  });

  it('should reset error state and try to re-render when retry is clicked', () => {
    // We use a component wrapper to toggle the throw condition outside the ErrorBoundary
    const TestWrapper = () => {
      const [doThrow, setDoThrow] = React.useState(true);
      return (
        <div>
          <button onClick={() => setDoThrow(false)}>Fix Error</button>
          <ErrorBoundary name="TestWidget">
            <ThrowingComponent shouldThrow={doThrow} />
          </ErrorBoundary>
        </div>
      );
    };

    render(<TestWrapper />);
    expect(screen.getByText('TestWidget failed')).toBeInTheDocument();
    
    // Fix error source, then click retry
    fireEvent.click(screen.getByRole('button', { name: /fix error/i }));
    fireEvent.click(screen.getByRole('button', { name: /retry widget/i }));
    
    expect(screen.queryByText('TestWidget failed')).not.toBeInTheDocument();
    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });
});

