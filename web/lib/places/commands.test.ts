import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  evaluateConstraints,
  executeCommand,
  getGuestSeat,
} from './index';

describe('Orchard House seating domain', () => {
  it('starts every scenario with one absent guest and an open problem', () => {
    for (let scenarioSeed = 0; scenarioSeed < 4; scenarioSeed += 1) {
      const state = createInitialState(scenarioSeed);
      const seated = Object.values(state.seats).flat().filter(Boolean);
      const held = Object.values(state.tables).reduce(
        (count, table) => count + table.reservedEmptySeats,
        0,
      );

      expect(Object.keys(state.guests)).toHaveLength(21);
      expect(state.guests[state.scenario.absentGuest.id]).toBeUndefined();
      expect(seated).toHaveLength(21);
      expect(held).toBe(2);
      expect(evaluateConstraints(state).length).toBeGreaterThan(0);
    }
  });

  it('can repair every initial challenge', () => {
    for (let scenarioSeed = 0; scenarioSeed < 4; scenarioSeed += 1) {
      const state = createInitialState(scenarioSeed);
      const repaired = executeCommand(
        state,
        { type: 'fix_violations' },
        'agent',
      );

      expect(repaired.result.ok).toBe(true);
      expect(evaluateConstraints(repaired.state)).toEqual([]);
    }
  });

  it('treats a human pin as an absolute movement rule', () => {
    const state = createInitialState(0);
    const pinned = executeCommand(
      state,
      { type: 'pin_guest', guestId: 'mabel' },
      'human',
    );
    const moved = executeCommand(
      pinned.state,
      { type: 'move_guest', guestId: 'mabel', tableId: 'table-2' },
      'agent',
    );

    expect(moved.result).toMatchObject({ ok: false, code: 'pinned_by_human' });
    expect(getGuestSeat(moved.state, 'mabel')).toEqual({
      tableId: 'table-1',
      seatIndex: 0,
    });
  });

  it('repairs an incompatible Rex and Vivian table without moving a pin', () => {
    const state = executeCommand(
      createInitialState(3),
      { type: 'fix_violations' },
      'agent',
    ).state;
    const moved = executeCommand(
      state,
      { type: 'move_guest', guestId: 'rex', tableId: 'table-3' },
      'human',
    );
    expect(
      evaluateConstraints(moved.state).some(
        (violation) => violation.id === 'rex-vivian-apart',
      ),
    ).toBe(true);

    const repaired = executeCommand(
      moved.state,
      { type: 'fix_violations' },
      'agent',
    );
    expect(repaired.result).toMatchObject({
      ok: true,
      code: 'violations_fixed',
    });
    expect(evaluateConstraints(repaired.state)).toEqual([]);
  });

  it('improves the room but reports a preference blocked by a relocated pin', () => {
    const state = executeCommand(
      createInitialState(0),
      { type: 'fix_violations' },
      'agent',
    ).state;
    const moved = executeCommand(
      state,
      { type: 'move_guest', guestId: 'mabel', tableId: 'table-2' },
      'human',
    );
    const pinned = executeCommand(
      moved.state,
      { type: 'pin_guest', guestId: 'mabel' },
      'human',
    );
    const repaired = executeCommand(
      pinned.state,
      { type: 'fix_violations' },
      'agent',
    );

    expect(repaired.result).toMatchObject({
      ok: false,
      code: 'blocked_by_pins',
    });
    expect(getGuestSeat(repaired.state, 'mabel')?.tableId).toBe('table-2');
    expect(
      evaluateConstraints(repaired.state).map((violation) => violation.id),
    ).toEqual(['mabel-window']);
  });

  it('uses a held seat when a last-minute guest arrives', () => {
    const state = executeCommand(
      createInitialState(0),
      { type: 'fix_violations' },
      'agent',
    ).state;
    const added = executeCommand(
      state,
      { type: 'add_guest', name: 'Rowan' },
      'agent',
    );

    expect(added.result).toMatchObject({ ok: true, code: 'guest_added' });
    expect(added.state.guests.rowan.name).toBe('Rowan');
    expect(added.state.tables['table-2'].reservedEmptySeats).toBe(0);
    expect(evaluateConstraints(added.state)).toEqual([]);
  });

  it('does not reduce capacity while occupied seats would be removed', () => {
    const state = createInitialState(0);
    const outcome = executeCommand(
      state,
      { type: 'set_capacity', tableId: 'table-4', capacity: 5 },
      'human',
    );

    expect(outcome.result).toMatchObject({
      ok: false,
      code: 'capacity_in_use',
    });
    expect(outcome.state.tables['table-4'].capacity).toBe(6);
  });

  it('swaps two unpinned seated guests and rejects invalid swaps', () => {
    const state = createInitialState(0);
    const mabelSeat = getGuestSeat(state, 'mabel');
    const rexSeat = getGuestSeat(state, 'rex');
    const swapped = executeCommand(
      state,
      { type: 'swap_guests', guestId: 'mabel', otherGuestId: 'rex' },
      'human',
    );

    expect(swapped.result).toMatchObject({ ok: true, code: 'guests_swapped' });
    expect(getGuestSeat(swapped.state, 'mabel')).toEqual(rexSeat);
    expect(getGuestSeat(swapped.state, 'rex')).toEqual(mabelSeat);

    const missing = executeCommand(
      state,
      { type: 'swap_guests', guestId: 'mabel', otherGuestId: 'nobody' },
      'human',
    );
    expect(missing.result).toMatchObject({
      ok: false,
      code: 'guest_not_found',
    });
    expect(missing.state).toBe(state);
  });

  it('reserves empty seats and validates table ids and counts', () => {
    const state = createInitialState(0);
    const held = executeCommand(
      state,
      { type: 'leave_empty_seats', tableId: 'table-1', count: 2 },
      'human',
    );
    expect(held.result).toMatchObject({
      ok: true,
      code: 'empty_seats_reserved',
    });
    expect(held.state.tables['table-1'].reservedEmptySeats).toBe(2);

    const invalidCount = executeCommand(
      state,
      { type: 'leave_empty_seats', tableId: 'table-1', count: 7 },
      'human',
    );
    expect(invalidCount.result).toMatchObject({
      ok: false,
      code: 'invalid_empty_seat_count',
    });

    const invalidTable = executeCommand(
      state,
      {
        type: 'leave_empty_seats',
        tableId: 'table-9' as 'table-1',
        count: 1,
      },
      'human',
    );
    expect(invalidTable.result).toMatchObject({
      ok: false,
      code: 'table_not_found',
    });
  });

  it('reports room_full without mutating the room', () => {
    const state = createInitialState(0);
    for (const tableId of Object.keys(state.tables) as Array<
      keyof typeof state.tables
    >) {
      const seated = state.seats[tableId].filter(
        (guestId): guestId is string => guestId !== null,
      );
      state.seats[tableId] = [
        ...seated,
        ...Array<string | null>(6 - seated.length).fill(null),
      ];
      state.tables[tableId].capacity = seated.length;
      state.tables[tableId].reservedEmptySeats = 0;
    }
    const outcome = executeCommand(
      state,
      { type: 'add_guest', name: 'No Chair' },
      'agent',
    );

    expect(outcome.result).toMatchObject({ ok: false, code: 'room_full' });
    expect(outcome.state).toBe(state);
    expect(outcome.state.guests['no-chair']).toBeUndefined();
  });

  it('rejects invalid guest, table and seat ids', () => {
    const state = createInitialState(0);
    const missingGuest = executeCommand(
      state,
      { type: 'move_guest', guestId: 'nobody', tableId: 'table-1' },
      'agent',
    );
    const missingTable = executeCommand(
      state,
      {
        type: 'move_guest',
        guestId: 'mabel',
        tableId: 'table-9' as 'table-1',
      },
      'agent',
    );
    const invalidSeat = executeCommand(
      state,
      {
        type: 'move_guest',
        guestId: 'mabel',
        tableId: 'table-2',
        seatIndex: 99,
      },
      'agent',
    );

    expect(missingGuest.result.code).toBe('guest_not_found');
    expect(missingTable.result.code).toBe('table_not_found');
    expect(invalidSeat.result.code).toBe('table_full');
    expect(missingGuest.state).toBe(state);
    expect(missingTable.state).toBe(state);
    expect(invalidSeat.state).toBe(state);
  });

  it('reset_seed recreates the requested scenario with a fresh history', () => {
    const changed = executeCommand(
      createInitialState(0),
      { type: 'pin_guest', guestId: 'mabel' },
      'human',
    ).state;
    const reset = executeCommand(
      changed,
      { type: 'reset_seed', scenarioSeed: 2 },
      'human',
    );

    expect(reset.result).toMatchObject({ ok: true, code: 'seed_reset' });
    expect(reset.state.scenario.id).toBe('lost-window');
    expect(reset.state.pinnedGuestIds).toEqual([]);
    expect(reset.state.revision).toBe(1);
    expect(reset.state.timeline[0].message).toContain('new challenge');
  });
});
