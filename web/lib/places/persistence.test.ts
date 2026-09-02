import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  getRoomSessionKey,
  importRoom,
  loadInitialRoom,
  ROOM_SCHEMA_VERSION,
  serializeRoom,
} from './index';

describe('room import and export', () => {
  it('round-trips the complete state with a schema version', () => {
    const state = createInitialState(2);
    const json = serializeRoom(state);
    const payload = JSON.parse(json) as Record<string, unknown>;

    expect(payload.schemaVersion).toBe(ROOM_SCHEMA_VERSION);
    expect(importRoom(json)).toEqual({ ok: true, state });
  });

  it('rejects malformed, old and internally inconsistent snapshots', () => {
    expect(importRoom('{')).toMatchObject({ ok: false });
    expect(importRoom(JSON.stringify({ schemaVersion: 0, state: {} }))).toEqual(
      {
        ok: false,
        error: 'This file does not use Places schema version 1.',
      },
    );

    const payload = JSON.parse(serializeRoom(createInitialState(0)));
    payload.state.seats['table-1'][1] = 'mabel';
    expect(importRoom(JSON.stringify(payload))).toEqual({
      ok: false,
      error: 'Every guest must occupy exactly one seat.',
    });
  });

  it('loads a shareable seed and restores its isolated session', () => {
    const storedRoom = serializeRoom(createInitialState(1));
    expect(
      loadInitialRoom({ search: '?seed=3', storedRoom: null, fallbackSeed: 0 })
        .scenario.id,
    ).toBe('kids-table');
    expect(
      loadInitialRoom({ search: '?seed=3', storedRoom, fallbackSeed: 0 })
        .scenario.id,
    ).toBe('split-arrival');
    expect(getRoomSessionKey('?seed=3')).toBe('places.room.v1.seed-3');
    expect(getRoomSessionKey('')).toBe('places.room.v1');
    expect(
      loadInitialRoom({
        search: '?seed=not-a-number',
        storedRoom: 'bad json',
        fallbackSeed: 2,
      }).scenario.id,
    ).toBe('lost-window');
  });
});
