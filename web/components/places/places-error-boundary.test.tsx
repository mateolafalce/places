// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlacesErrorBoundary } from './places-error-boundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlacesErrorBoundary', () => {
  it('shows a recoverable room error and retries the render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Room() {
      if (shouldThrow) throw new Error('floor failed');
      return <p>The room is back.</p>;
    }

    render(
      <PlacesErrorBoundary>
        <Room />
      </PlacesErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('The room is back.')).toBeTruthy();
  });
});
