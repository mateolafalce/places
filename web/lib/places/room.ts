import { cloneConstraints } from './constraints';
import {
  GUEST_LIST,
  INITIAL_SCENARIOS,
  INITIAL_SEATS,
  SEED_CONSTRAINTS,
  TABLES,
} from './roster';
import {
  cloneSeats,
  cloneTables,
  seatEntries,
  swapGuestSeats,
} from './seating';
import type { EventActor, RoomState, Selection, TimelineEvent } from './types';

export function scenarioCount(): number {
  return INITIAL_SCENARIOS.length;
}

export function createInitialState(scenarioSeed = 0): RoomState {
  const scenarioIndex =
    Math.abs(Math.trunc(scenarioSeed)) % INITIAL_SCENARIOS.length;
  const scenario = INITIAL_SCENARIOS[scenarioIndex];
  const absentGuest = GUEST_LIST.find(
    (guest) => guest.id === scenario.absentGuestId,
  )!;
  const seats = cloneSeats(INITIAL_SEATS);
  const absentSeat = seatEntries(seats).find(
    (entry) => entry.guestId === absentGuest.id,
  );
  if (absentSeat) seats[absentSeat.tableId][absentSeat.seatIndex] = null;
  for (const [firstGuestId, secondGuestId] of scenario.swaps) {
    swapGuestSeats(seats, firstGuestId, secondGuestId);
  }

  return {
    guests: Object.fromEntries(
      GUEST_LIST.filter((guest) => guest.id !== absentGuest.id).map((guest) => [
        guest.id,
        { ...guest, tags: [...guest.tags] },
      ]),
    ),
    tables: cloneTables(TABLES),
    seats,
    /* Rules about the absent guest stay in the room; they are simply inert
     * until that guest is back. */
    constraints: cloneConstraints(SEED_CONSTRAINTS),
    scenario: {
      id: scenario.id,
      absentGuest: { ...absentGuest, tags: [...absentGuest.tags] },
    },
    pinnedGuestIds: [],
    selection: null,
    timeline: [
      {
        id: 'seed-ready',
        actor: 'system',
        message: `${absentGuest.name} cannot make dinner.`,
        detail: '21 guests · 4 tables · 3 open seats',
      },
      {
        id: 'constraints-ready',
        actor: 'agent',
        message: 'The seating plan needs a hand.',
        detail: scenario.detail,
      },
    ],
    revision: 0,
    nextGuestNumber: 1,
  };
}

export function actorLabel(actor: EventActor): string {
  return actor === 'agent' ? 'Agent' : actor === 'human' ? 'You' : 'Places';
}

export function eventFor(
  actor: EventActor,
  message: string,
  detail: string,
  revision: number,
): TimelineEvent {
  return {
    id: `${revision}-${actor}-${message}`,
    actor,
    message,
    detail,
  };
}

export function withEvent(
  state: RoomState,
  actor: EventActor,
  message: string,
  detail: string,
): RoomState {
  const revision = state.revision + 1;
  return {
    ...state,
    revision,
    timeline: [
      eventFor(actor, message, detail, revision),
      ...state.timeline,
    ].slice(0, 30),
  };
}

export function selectItem(state: RoomState, selection: Selection): RoomState {
  return { ...state, selection };
}
