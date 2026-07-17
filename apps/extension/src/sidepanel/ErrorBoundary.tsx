import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Last-resort guard for the side panel. Without it, a render error in any
 * panel component blanks the whole side panel with no way to recover short of
 * reopening it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Clickspex side panel crashed:", error, errorInfo.componentStack);
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold">Clickspex ran into an unexpected error.</p>
        <p className="max-w-xs break-words text-xs opacity-70">{this.state.error.message}</p>
        <button
          type="button"
          onClick={this.handleReset}
          className="rounded border border-current px-3 py-1 text-xs"
        >
          Reload panel
        </button>
      </div>
    );
  }
}
