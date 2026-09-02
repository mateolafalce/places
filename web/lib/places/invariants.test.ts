import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  evaluateConstraints,
  executeCommand,
  findInfeasibilities,
  getGuestSeat,
  reflowSeating,
  scenarioCount,
  TABLE_IDS,
  violationScore,
  type RoomCommand,
  type RoomState,
  type SeatPosition,
  type TableId,
} from './index';

/* A tiny deterministic generator: the same seed always replays the same
 * session, so a failure here is reproducible from its seed alone. */
function randomFrom(seed: number) {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

function guestIds(state: RoomState): string[] {
  return Object.keys(state.guests);
}

function seatedIds(state: RoomState): string[] {
  return TABLE_IDS.flatMap((tableId) =>
    state.seats[tableId].filter((guestId): guestId is string =>
      Boolean(guestId),
    ),
  );
}

function emptySeatsAt(state: RoomState, tableId: TableId): number {
  return state.seats[tableId]
    .slice(0, state.tables[tableId].capacity)
    .filter((guestId) => guestId === null).length;
}

function samePosition(a: SeatPosition | null, b: SeatPosition | null): boolean {
  return a?.tableId === b?.tableId && a?.seatIndex === b?.seatIndex;
}

function randomCommand(random: () => number, state: RoomState): RoomCommand {
  const ids = guestIds(state);
  const guestId = pick(random, ids);
  const otherGuestId = pick(random, ids);
  const tableId = pick(random, TABLE_IDS);

  switch (Math.floor(random() * 10)) {
    case 0:
      return { type: 'move_guest', guestId, tableId };
    case 1:
      return { type: 'swap_guests', guestId, otherGuestId };
    case 2:
      return { type: 'pin_guest', guestId };
    case 3:
      return { type: 'unpin_guest', guestId };
    case 4:
      return {
        type: 'set_capacity',
        tableId,
        capacity: 2 + Math.floor(random() * 5),
      };
    case 5:
      return {
        type: 'leave_empty_seats',
        tableId,
        count: Math.floor(random() * 3),
      };
    case 6:
      return { type: 'add_guest' };
    case 7:
      return {
        type: 'add_constraint',
        constraint: {
          kind: pick(random, [
            'must_share_table',
            'must_not_share_table',
            'prefer_zone',
            'require_accessible_seat',
          ] as const),
          guestIds: [guestId, otherGuestId],
          zone: pick(random, ['window', 'kitchen', 'door'] as const),
          severity: 'preference',
        },
      };
    case 8:
      return {
        type: 'remove_constraint',
        constraintId: pick(random, [
          ...state.constraints.map((constraint) => constraint.id),
          'not-a-rule',
        ]),
      };
    default:
      return { type: 'fix_violations' };
  }
}

const SESSIONS = 16;
const COMMANDS_PER_SESSION = 30;
/* The reflow search dominates the runtime, so this suite gets its own
 * budget rather than the 5s default. */
const FUZZ_TIMEOUT_MS = 60_000;

describe('room invariants under arbitrary command sequences', () => {
  it(
    'keeps every seat, rule and pin consistent',
    () => {
      for (let seed = 0; seed < SESSIONS; seed += 1) {
        const random = randomFrom(seed + 1);
        let state = createInitialState(seed % scenarioCount());
        /* Where each guest sat at the moment it was pinned. */
        const pinnedSeats = new Map<string, SeatPosition | null>();

        for (let step = 0; step < COMMANDS_PER_SESSION; step += 1) {
          const command = randomCommand(random, state);
          const before = state;
          const outcome = executeCommand(state, command, 'agent');
          state = outcome.state;
          const trace = `seed ${seed}, step ${step}, ${command.type}`;

          for (const guestId of state.pinnedGuestIds) {
            if (!pinnedSeats.has(guestId)) {
              pinnedSeats.set(guestId, getGuestSeat(before, guestId));
            }
          }
          for (const guestId of pinnedSeats.keys()) {
            if (!state.pinnedGuestIds.includes(guestId)) {
              pinnedSeats.delete(guestId);
            }
          }

          /* A pin is absolute: no command may move a pinned guest. */
          for (const [guestId, seat] of pinnedSeats) {
            expect(
              samePosition(getGuestSeat(state, guestId), seat),
              `pin moved: ${guestId} (${trace})`,
            ).toBe(true);
          }

          /* No seat ever holds an id that is not a guest in the room, and no
           * guest is seated twice. */
          const seated = seatedIds(state);
          for (const guestId of seated) {
            expect(
              state.guests[guestId],
              `ghost seat ${guestId} (${trace})`,
            ).toBeDefined();
          }
          expect(new Set(seated).size, `duplicate seat (${trace})`).toBe(
            seated.length,
          );

          /* Evaluation only ever names guests who are in the room, so a rule
           * about an absent guest stays inert instead of throwing. */
          for (const violation of evaluateConstraints(state)) {
            for (const guestId of violation.guestIds) {
              expect(
                state.guests[guestId],
                `violation ${violation.id} names a missing guest (${trace})`,
              ).toBeDefined();
            }
          }

          /* Rule ids stay unique, so removing one is unambiguous. */
          const ruleIds = state.constraints.map((constraint) => constraint.id);
          expect(new Set(ruleIds).size, `duplicate rule id (${trace})`).toBe(
            ruleIds.length,
          );

          /* A failed command leaves the room untouched, except when it is a
           * reflow that improved the room without finishing it. */
          if (!outcome.result.ok && command.type !== 'fix_violations') {
            expect(state, `failed command mutated the room (${trace})`).toBe(
              before,
            );
          }

          /* Reflow never makes the room worse. */
          if (command.type === 'fix_violations') {
            expect(
              violationScore(state),
              `reflow regressed (${trace})`,
            ).toBeLessThanOrEqual(violationScore(before));
          }
        }
      }
    },
    FUZZ_TIMEOUT_MS,
  );
});

describe('reflow reports why it stopped', () => {
  it('is deterministic for a given room', () => {
    for (let seed = 0; seed < scenarioCount(); seed += 1) {
      const state = createInitialState(seed);
      expect(reflowSeating(state).seats).toEqual(reflowSeating(state).seats);
    }
  });

  it('only blames pins when a legal arrangement really needs them to move', () => {
    const state = createInitialState(0);
    const reflow = reflowSeating(state);
    expect(reflow.status).toBe('solved');
    expect(reflow.blockingPinIds).toEqual([]);

    const pinned = executeCommand(
      executeCommand(
        state,
        { type: 'move_guest', guestId: 'mabel', tableId: 'table-2' },
        'human',
      ).state,
      { type: 'pin_guest', guestId: 'mabel' },
      'human',
    ).state;
    const blocked = reflowSeating(pinned);
    expect(blocked.status).toBe('blocked_by_pins');
    expect(blocked.blockingPinIds).toContain('mabel');
  });

  it('proves an impossible room instead of blaming the search', () => {
    const contradictory = executeCommand(
      createInitialState(0),
      {
        type: 'add_constraint',
        constraint: {
          id: 'mabel-rex-together',
          kind: 'must_share_table',
          guestIds: ['mabel', 'rex'],
          severity: 'hard',
        },
      },
      'agent',
    ).state;
    const impossible = executeCommand(
      contradictory,
      {
        type: 'add_constraint',
        constraint: {
          id: 'mabel-rex-apart',
          kind: 'must_not_share_table',
          guestIds: ['mabel', 'rex'],
          severity: 'hard',
        },
      },
      'agent',
    ).state;

    const reflow = reflowSeating(impossible);
    expect(reflow.status).toBe('infeasible');
    expect(reflow.reasons.length).toBeGreaterThan(0);
    expect(reflow.blockingPinIds).toEqual([]);
  });

  it('finds no proof for a room that is merely hard', () => {
    expect(findInfeasibilities(createInitialState(0))).toEqual([]);
  });
});

describe('rules are data addressed by guest id', () => {
  it('lets a guest added at runtime join the same rule model', () => {
    const added = executeCommand(
      createInitialState(0),
      { type: 'add_guest', name: 'Rowan' },
      'agent',
    );
    expect(added.result.ok).toBe(true);

    const ruled = executeCommand(
      added.state,
      {
        type: 'add_constraint',
        constraint: {
          id: 'rowan-with-mabel',
          kind: 'must_share_table',
          guestIds: ['rowan', 'mabel'],
          severity: 'hard',
        },
      },
      'agent',
    );
    expect(ruled.result.ok).toBe(true);

    const repaired = executeCommand(
      ruled.state,
      { type: 'fix_violations' },
      'agent',
    );
    expect(repaired.result.ok).toBe(true);
    expect(getGuestSeat(repaired.state, 'rowan')?.tableId).toBe(
      getGuestSeat(repaired.state, 'mabel')?.tableId,
    );
  });

  it('refuses a rule about a guest who is not in the room', () => {
    const state = createInitialState(0);
    const outcome = executeCommand(
      state,
      {
        type: 'add_constraint',
        constraint: {
          kind: 'must_share_table',
          guestIds: ['mabel', 'nobody'],
        },
      },
      'agent',
    );

    expect(outcome.result).toMatchObject({
      ok: false,
      code: 'guest_not_found',
    });
    expect(outcome.state).toBe(state);
  });

  it('keeps a rule about the absent guest inert rather than broken', () => {
    /* Scenario 0 seats everyone but Ivy; her rules stay in the room. */
    const state = createInitialState(0);
    expect(state.guests.ivy).toBeUndefined();
    expect(() => evaluateConstraints(state)).not.toThrow();
    expect(
      evaluateConstraints(state).every((violation) =>
        violation.guestIds.every((guestId) => state.guests[guestId]),
      ),
    ).toBe(true);
  });

  it('keeps reserved empty seats out of the solver reach', () => {
    const held = executeCommand(
      createInitialState(0),
      { type: 'leave_empty_seats', tableId: 'table-3', count: 2 },
      'human',
    ).state;
    const repaired = executeCommand(held, { type: 'fix_violations' }, 'agent');

    expect(emptySeatsAt(repaired.state, 'table-3')).toBeGreaterThanOrEqual(
      repaired.state.tables['table-3'].reservedEmptySeats,
    );
  });
});
