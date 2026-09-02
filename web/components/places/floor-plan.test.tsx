// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createInitialState, evaluateConstraints } from '@/lib/places';

import { FloorPlan } from './floor-plan';

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? '';
  }
}

beforeAll(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(cleanup);

function renderFloorPlan() {
  const state = createInitialState(0);
  const svgRef = createRef<SVGSVGElement>();
  const onMoveGuest = vi.fn();
  const onTogglePin = vi.fn();
  render(
    <FloorPlan
      state={state}
      violations={evaluateConstraints(state)}
      svgRef={svgRef}
      onSelectGuest={vi.fn()}
      onSelectTable={vi.fn()}
      onMoveGuest={onMoveGuest}
      onTogglePin={onTogglePin}
    />,
  );
  const svg = screen.getByRole('img') as unknown as SVGSVGElement;
  Object.defineProperties(svg, {
    getScreenCTM: {
      value: () => ({ inverse: () => ({}) }),
    },
    createSVGPoint: {
      value: () => ({
        x: 0,
        y: 0,
        matrixTransform() {
          return { x: this.x, y: this.y };
        },
      }),
    },
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: vi.fn(() => false) },
    releasePointerCapture: { value: vi.fn() },
  });
  return { svg, onMoveGuest, onTogglePin };
}

describe('FloorPlan interactions', () => {
  it('toggles a focused guest pin with P', () => {
    const { onTogglePin } = renderFloorPlan();
    fireEvent.keyDown(screen.getByRole('button', { name: /^Mabel,/ }), {
      key: 'P',
    });
    expect(onTogglePin).toHaveBeenCalledWith('mabel');
  });

  it('drags a guest to the table coordinates from room state', () => {
    const { svg, onMoveGuest } = renderFloorPlan();
    const mabel = screen.getByRole('button', { name: /^Mabel,/ });
    fireEvent.pointerDown(mabel, {
      button: 0,
      clientX: 264,
      clientY: 105,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(svg, {
      clientX: 490,
      clientY: 191,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerUp(svg, {
      clientX: 490,
      clientY: 191,
      pointerId: 1,
      pointerType: 'mouse',
    });
    expect(onMoveGuest).toHaveBeenCalledWith('mabel', 'table-2');
  });
});
