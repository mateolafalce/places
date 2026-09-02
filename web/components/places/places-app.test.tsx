// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitialState, serializeRoom } from '@/lib/places';

import { PlacesApp } from './places-app';

interface RegisteredTool {
  name: string;
}

interface Registration {
  tool: RegisteredTool;
  signal?: AbortSignal;
}

let createdObjects: Array<Blob | MediaSource> = [];

function installModelContext(registrations: Registration[]) {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool: async (
        tool: RegisteredTool,
        options?: { signal?: AbortSignal },
      ) => {
        registrations.push({ tool, signal: options?.signal });
      },
    },
  });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Blob did not contain text.'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  createdObjects = [];
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((object: Blob | MediaSource) => {
      createdObjects.push(object);
      return 'blob:places-test';
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'modelContext');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PlacesApp workflows', () => {
  it('adds through the dialog and supports undo and redo', async () => {
    const user = userEvent.setup();
    render(<PlacesApp />);

    await user.click(screen.getByRole('button', { name: 'Add guest' }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Guest name');
    await user.clear(input);
    await user.type(input, 'Rowan');
    await user.click(within(dialog).getByRole('button', { name: 'Add guest' }));

    expect(await screen.findByText('Rowan was added and seated.')).toBeTruthy();
    expect(screen.getByText('You added Rowan.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo last change' }));
    expect(screen.queryByText('You added Rowan.')).toBeNull();
    expect(screen.getByText('The last change was undone.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Redo change' }));
    expect(screen.getByText('You added Rowan.')).toBeTruthy();
    expect(screen.getByText('The change was restored.')).toBeTruthy();
  });

  it('exports versioned JSON and imports a saved room', async () => {
    const user = userEvent.setup();
    render(<PlacesApp />);

    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(createdObjects).toHaveLength(1);
    expect(createdObjects[0]).toBeInstanceOf(Blob);
    const exported = JSON.parse(await readBlob(createdObjects[0] as Blob));
    expect(exported.schemaVersion).toBe(1);

    const saved = serializeRoom(createInitialState(2));
    const file = new File([saved], 'room.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Import room JSON'), file);
    expect(
      await screen.findByText('The saved room was restored.'),
    ).toBeTruthy();
    expect(screen.getByText('Pearl cannot make dinner.')).toBeTruthy();
  });

  it('surfaces PNG export failures instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    class BrokenImage {
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', BrokenImage);
    const user = userEvent.setup();
    render(<PlacesApp />);
    await user.click(screen.getByRole('button', { name: 'PNG' }));
    expect(
      await screen.findByText('The PNG export could not be created.'),
    ).toBeTruthy();
  });

  it('re-registers contextual tools when UI selection and pins change', async () => {
    const registrations: Registration[] = [];
    installModelContext(registrations);
    render(<PlacesApp />);

    await waitFor(() =>
      expect(
        registrations.some(({ tool }) => tool.name === 'get_room_state'),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Mabel,/ }));
    await waitFor(() =>
      expect(registrations.some(({ tool }) => tool.name === 'move_guest')).toBe(
        true,
      ),
    );
    const moveRegistration = registrations.find(
      ({ tool }) => tool.name === 'move_guest',
    );

    fireEvent.keyDown(screen.getByRole('button', { name: /^Mabel,/ }), {
      key: 'P',
    });
    await waitFor(() =>
      expect(
        registrations.some(({ tool }) => tool.name === 'unpin_guest'),
      ).toBe(true),
    );
    expect(moveRegistration?.signal?.aborted).toBe(true);
  });
});
