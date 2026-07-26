"use client";

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Contains any render/lifecycle throw from the map subtree so a single map or
// WebGL failure degrades to a card instead of blanking the whole SPA (Next's
// production "Application error" page). It also surfaces the error text directly
// in the UI — the production error page hides it, and a mobile Safari user has no
// console — so a failure is diagnosable from a screenshot alone.
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("map subtree crashed", error, info.componentStack);
  }

  private readonly reload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg p-4">
        <div role="alert" className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-bg p-4 text-center">
          <AlertTriangle size={24} className="text-muted" />
          <p className="text-[15px] font-semibold">The map failed to load.</p>
          <p className="max-h-24 overflow-auto break-words font-mono text-[11px] leading-snug text-muted">
            {error.name}: {error.message}
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="rounded-lg bg-accent px-3 py-2 text-[14px] font-semibold text-accent-text"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
