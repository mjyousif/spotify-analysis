import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ErrorBoundary caught an error in component [${this.props.name || 'Unknown'}]:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="bg-red-950/10 border border-red-900/30 rounded-2xl p-6 text-center flex flex-col items-center justify-center min-h-[220px] backdrop-blur-md">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3 text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h4 className="text-white font-bold text-sm">
            {this.props.name ? `${this.props.name} failed` : 'Widget failed to load'}
          </h4>
          <p className="text-xs text-gray-400 mt-2 max-w-xs leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred while rendering this component."}
          </p>
          <button
            onClick={this.handleRetry}
            className="mt-4 px-4 py-2 bg-gray-900 hover:bg-gray-850 text-gray-300 hover:text-white font-semibold border border-gray-800 rounded-xl text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Widget</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
