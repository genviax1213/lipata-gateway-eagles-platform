import { Component, type ErrorInfo, type ReactNode } from "react";

type RouteErrorBoundaryProps = {
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
};

export default class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route render error", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-6 py-8 text-offwhite shadow-lg">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Portal failed to load</h2>
          <p className="mb-4 text-sm text-mist/90">
            A browser-side error interrupted this page. Reload the page and try again.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md border border-gold/60 bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold-soft"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
