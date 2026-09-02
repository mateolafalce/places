'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ROOM_SESSION_KEY } from '@/lib/places';

interface PlacesErrorBoundaryProps {
  children: ReactNode;
}

interface PlacesErrorBoundaryState {
  failed: boolean;
}

export class PlacesErrorBoundary extends Component<
  PlacesErrorBoundaryProps,
  PlacesErrorBoundaryState
> {
  state: PlacesErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PlacesErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Places could not render the room.', error, info);
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  private startFresh = () => {
    try {
      for (
        let index = window.sessionStorage.length - 1;
        index >= 0;
        index -= 1
      ) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(ROOM_SESSION_KEY)) {
          window.sessionStorage.removeItem(key);
        }
      }
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-shell error-shell">
        <section className="error-card" role="alert">
          <p className="eyebrow">Room interrupted</p>
          <h1>The floorplan could not be drawn.</h1>
          <p>
            Your latest saved room is still in this tab. Try rendering it again,
            or start a fresh challenge if the saved snapshot is damaged.
          </p>
          <div className="error-actions">
            <Button onClick={this.retry}>Try again</Button>
            <Button variant="outline" onClick={this.startFresh}>
              Start fresh
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
