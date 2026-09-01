import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  evaluateConstraints,
  executeCommand,
  getGuestSeat,
} from './domain';

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
});
