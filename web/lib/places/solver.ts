import { evaluateConstraints, violationScore } from './constraints';
import {
  accessibleSeatCount,
  activeSeatSlots,
  cloneSeats,
  countMovedSeats,
  findSeatIn,
} from './seating';
import {
  TABLE_IDS,
  type ConstraintViolation,
  type RoomState,
  type SeatingConstraint,
} from './types';

const MAX_PASSES = 64;
const RESTARTS = 4;
const PERTURBATION_SWAPS = 3;

export type ReflowStatus =
  /* Every rule is satisfied. */
  | 'solved'
  /* A better arrangement exists, but it requires moving a pinned guest. */
  | 'blocked_by_pins'
  /* No arrangement can satisfy the hard rules, pins or not. */
  | 'infeasible'
  /* The search did not find a better arrangement; one may still exist. */
  | 'no_arrangement_found';

export interface ReflowResult {
  status: ReflowStatus;
  seats: RoomState['seats'];
  violations: ConstraintViolation[];
  score: number;
  movedSeats: number;
  /* Pins that a strictly better arrangement would have to move. */
  blockingPinIds: string[];
  /* Proofs of infeasibility, in plain sentences. */
  reasons: string[];
}

type Movable = (guestId: string) => boolean;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/* The search is randomized but deterministic: the same room always produces
 * the same reflow, which keeps the tests and the UI reproducible. */
function seedFrom(state: RoomState): number {
  let hash = 2166136261;
  for (const tableId of TABLE_IDS) {
    for (const guestId of state.seats[tableId]) {
      const token = `${tableId}:${guestId ?? '-'}|`;
      for (let index = 0; index < token.length; index += 1) {
        hash ^= token.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    }
  }
  return hash >>> 0;
}

function scoreOf(state: RoomState, seats: RoomState['seats']): number {
  return violationScore({ ...state, seats });
}

function climb(
  state: RoomState,
  startSeats: RoomState['seats'],
  movable: Movable,
): { seats: RoomState['seats']; score: number } {
  const slots = activeSeatSlots(state.tables);
  let seats = cloneSeats(startSeats);
  let score = scoreOf(state, seats);

  for (let pass = 0; pass < MAX_PASSES && score > 0; pass += 1) {
    let bestSeats: RoomState['seats'] | null = null;
    let bestScore = score;

    for (let first = 0; first < slots.length; first += 1) {
      for (let second = first + 1; second < slots.length; second += 1) {
        const a = slots[first];
        const b = slots[second];
        const aGuest = seats[a.tableId][a.seatIndex];
        const bGuest = seats[b.tableId][b.seatIndex];
        if (aGuest === bGuest) continue;
        if ((aGuest && !movable(aGuest)) || (bGuest && !movable(bGuest)))
          continue;

        const trial = cloneSeats(seats);
        trial[a.tableId][a.seatIndex] = bGuest;
        trial[b.tableId][b.seatIndex] = aGuest;
        const trialScore = scoreOf(state, trial);
        if (trialScore < bestScore) {
          bestScore = trialScore;
          bestSeats = trial;
        }
      }
    }

    if (!bestSeats) break;
    seats = bestSeats;
    score = bestScore;
  }

  return { seats, score };
}

function perturb(
  state: RoomState,
  seats: RoomState['seats'],
  movable: Movable,
  random: () => number,
): RoomState['seats'] {
  const slots = activeSeatSlots(state.tables).filter((slot) => {
    const guestId = seats[slot.tableId][slot.seatIndex];
    return !guestId || movable(guestId);
  });
  if (slots.length < 2) return cloneSeats(seats);

  const shaken = cloneSeats(seats);
  for (let swap = 0; swap < PERTURBATION_SWAPS; swap += 1) {
    const a = slots[Math.floor(random() * slots.length)];
    const b = slots[Math.floor(random() * slots.length)];
    const aGuest = shaken[a.tableId][a.seatIndex];
    const bGuest = shaken[b.tableId][b.seatIndex];
    shaken[a.tableId][a.seatIndex] = bGuest;
    shaken[b.tableId][b.seatIndex] = aGuest;
  }
  return shaken;
}

/* Hill climbing alone gets stuck in local minima, so a stuck climb is
 * restarted from a shaken copy of the best arrangement so far. */
function search(state: RoomState, movable: Movable) {
  const random = mulberry32(seedFrom(state));
  let best = climb(state, state.seats, movable);

  for (let restart = 0; restart < RESTARTS && best.score > 0; restart += 1) {
    const candidate = climb(
      state,
      perturb(state, best.seats, movable, random),
      movable,
    );
    if (candidate.score < best.score) best = candidate;
  }

  return best;
}

function activeGuestIds(
  state: RoomState,
  constraint: SeatingConstraint,
): string[] {
  return constraint.guestIds.filter((guestId) => state.guests[guestId]);
}

/* Only proofs live here: each reason rules out every possible arrangement,
 * so the solver can say "impossible" instead of "I gave up". */
export function findInfeasibilities(state: RoomState): string[] {
  const reasons: string[] = [];

  const usableSeats = TABLE_IDS.reduce((total, tableId) => {
    const table = state.tables[tableId];
    return total + Math.max(0, table.capacity - table.reservedEmptySeats);
  }, 0);
  const guestCount = Object.keys(state.guests).length;
  if (guestCount > usableSeats) {
    reasons.push(
      `${guestCount} guests cannot fit in ${usableSeats} seats once the held seats are kept free.`,
    );
  }

  const needsAccessible = new Set(
    state.constraints
      .filter(
        (constraint) =>
          constraint.kind === 'require_accessible_seat' &&
          constraint.severity === 'hard',
      )
      .flatMap((constraint) => activeGuestIds(state, constraint)),
  );
  const accessibleSeats = accessibleSeatCount(state.tables);
  if (needsAccessible.size > accessibleSeats) {
    reasons.push(
      `${needsAccessible.size} guests need an accessible seat and the room has ${accessibleSeats}.`,
    );
  }

  const parent = new Map<string, string>();
  const find = (guestId: string): string => {
    const seen = parent.get(guestId);
    if (!seen || seen === guestId) {
      parent.set(guestId, guestId);
      return guestId;
    }
    const root = find(seen);
    parent.set(guestId, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  for (const constraint of state.constraints) {
    if (
      constraint.kind !== 'must_share_table' ||
      constraint.severity !== 'hard'
    )
      continue;
    const members = activeGuestIds(state, constraint);
    for (const guestId of members.slice(1)) union(members[0], guestId);
  }

  const groups = new Map<string, string[]>();
  for (const guestId of parent.keys()) {
    const root = find(guestId);
    groups.set(root, [...(groups.get(root) ?? []), guestId]);
  }
  const largestTable = Math.max(
    ...TABLE_IDS.map((tableId) => state.tables[tableId].capacity),
  );
  for (const members of groups.values()) {
    if (members.length > largestTable) {
      reasons.push(
        `${members.length} guests must share a table and the largest table seats ${largestTable}.`,
      );
    }
  }

  for (const constraint of state.constraints) {
    if (
      constraint.kind !== 'must_not_share_table' ||
      constraint.severity !== 'hard'
    )
      continue;
    const members = activeGuestIds(state, constraint);
    for (let first = 0; first < members.length; first += 1) {
      for (let second = first + 1; second < members.length; second += 1) {
        if (!parent.has(members[first]) || !parent.has(members[second]))
          continue;
        if (find(members[first]) !== find(members[second])) continue;
        reasons.push(
          `${state.guests[members[first]].name} and ${state.guests[members[second]].name} are required to share a table and to stay apart.`,
        );
      }
    }
  }

  return reasons;
}

function movedPins(
  state: RoomState,
  seats: RoomState['seats'],
  pinnedGuestIds: string[],
): string[] {
  return pinnedGuestIds.filter((guestId) => {
    const before = findSeatIn(state.seats, state.tables, guestId);
    const after = findSeatIn(seats, state.tables, guestId);
    return (
      before?.tableId !== after?.tableId ||
      before?.seatIndex !== after?.seatIndex
    );
  });
}

function result(
  state: RoomState,
  status: ReflowStatus,
  seats: RoomState['seats'],
  score: number,
  extra: { blockingPinIds?: string[]; reasons?: string[] } = {},
): ReflowResult {
  return {
    status,
    seats,
    score,
    violations: evaluateConstraints({ ...state, seats }),
    movedSeats: countMovedSeats(state.seats, seats),
    blockingPinIds: extra.blockingPinIds ?? [],
    reasons: extra.reasons ?? [],
  };
}

/* Reflows the room and reports honestly why it stopped where it did. */
export function reflowSeating(state: RoomState): ReflowResult {
  const pinned = new Set(state.pinnedGuestIds);
  const withPins = search(state, (guestId) => !pinned.has(guestId));
  if (withPins.score === 0) {
    return result(state, 'solved', withPins.seats, withPins.score);
  }

  const reasons = findInfeasibilities(state);
  if (reasons.length > 0) {
    return result(state, 'infeasible', withPins.seats, withPins.score, {
      reasons,
    });
  }

  if (pinned.size > 0) {
    const relaxed = search(state, () => true);
    if (relaxed.score < withPins.score) {
      const blockingPinIds = movedPins(
        state,
        relaxed.seats,
        state.pinnedGuestIds,
      );
      if (blockingPinIds.length === 0) {
        /* The better arrangement leaves every pin where it is, so it is legal
         * here: the pinned search simply missed it. */
        return result(
          state,
          relaxed.score === 0 ? 'solved' : 'no_arrangement_found',
          relaxed.seats,
          relaxed.score,
        );
      }
      return result(state, 'blocked_by_pins', withPins.seats, withPins.score, {
        blockingPinIds,
      });
    }
  }

  return result(state, 'no_arrangement_found', withPins.seats, withPins.score);
}
