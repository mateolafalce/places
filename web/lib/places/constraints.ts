import { getGuestSeat, isAccessibleSeat } from './seating';
import {
  CONSTRAINT_KINDS,
  ROOM_ZONES,
  TABLE_IDS,
  type ConstraintInput,
  type ConstraintKind,
  type ConstraintSeverity,
  type ConstraintViolation,
  type RoomState,
  type RoomZone,
  type SeatingConstraint,
  type TableId,
} from './types';

const DEFAULT_SEVERITY: Record<ConstraintKind, ConstraintSeverity> = {
  must_share_table: 'hard',
  must_not_share_table: 'hard',
  prefer_zone: 'preference',
  require_accessible_seat: 'hard',
};

export function cloneConstraints(
  constraints: SeatingConstraint[],
): SeatingConstraint[] {
  return constraints.map((constraint) => ({
    ...constraint,
    guestIds: [...constraint.guestIds],
  }));
}

function guestName(state: RoomState, guestId: string): string {
  return state.guests[guestId]?.name ?? guestId;
}

function nameList(state: RoomState, guestIds: string[]): string {
  const names = guestIds.map((guestId) => guestName(state, guestId));
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* Guests referenced by a rule may be absent from this scenario, or may have
 * been removed after the rule was written. Such a reference is inert, never
 * an error, and never a lookup on a guest that is not there. */
function seatedScope(state: RoomState, constraint: SeatingConstraint) {
  return constraint.guestIds
    .filter((guestId) => state.guests[guestId])
    .map((guestId) => ({ guestId, seat: getGuestSeat(state, guestId) }));
}

function violation(
  constraint: SeatingConstraint,
  fields: {
    id: string;
    message: string;
    guestIds: string[];
    tableIds: TableId[];
  },
): ConstraintViolation {
  return {
    id: fields.id,
    type: constraint.kind,
    severity: constraint.severity,
    message: fields.message,
    guestIds: fields.guestIds,
    tableIds: fields.tableIds,
    constraintId: constraint.id,
  };
}

function perGuestViolationId(
  constraint: SeatingConstraint,
  guestId: string,
): string {
  return constraint.guestIds.length === 1
    ? constraint.id
    : `${constraint.id}:${guestId}`;
}

export function evaluateConstraint(
  state: RoomState,
  constraint: SeatingConstraint,
): ConstraintViolation[] {
  const scope = seatedScope(state, constraint);

  if (constraint.kind === 'must_share_table') {
    if (scope.length < 2) return [];
    const tableIds = scope.map((entry) => entry.seat?.tableId);
    const shared = tableIds.every(
      (tableId) => tableId && tableId === tableIds[0],
    );
    if (shared) return [];
    return [
      violation(constraint, {
        id: constraint.id,
        message:
          constraint.message ??
          `${nameList(
            state,
            scope.map((entry) => entry.guestId),
          )} must share a table.`,
        guestIds: scope.map((entry) => entry.guestId),
        tableIds: [...new Set(tableIds.filter(Boolean) as TableId[])],
      }),
    ];
  }

  if (constraint.kind === 'must_not_share_table') {
    const violations: ConstraintViolation[] = [];
    for (let first = 0; first < scope.length; first += 1) {
      for (let second = first + 1; second < scope.length; second += 1) {
        const a = scope[first];
        const b = scope[second];
        if (!a.seat || !b.seat || a.seat.tableId !== b.seat.tableId) continue;
        violations.push(
          violation(constraint, {
            id:
              scope.length === 2
                ? constraint.id
                : `${constraint.id}:${a.guestId}-${b.guestId}`,
            message:
              constraint.message ??
              `${nameList(state, [a.guestId, b.guestId])} cannot share a table.`,
            guestIds: [a.guestId, b.guestId],
            tableIds: [a.seat.tableId],
          }),
        );
      }
    }
    return violations;
  }

  if (constraint.kind === 'prefer_zone') {
    return scope
      .filter(
        (entry) =>
          !entry.seat ||
          !state.tables[entry.seat.tableId].zones.includes(constraint.zone),
      )
      .map((entry) =>
        violation(constraint, {
          id: perGuestViolationId(constraint, entry.guestId),
          message:
            constraint.message ??
            `${guestName(state, entry.guestId)} wants to sit near the ${
              constraint.zone
            }.`,
          guestIds: [entry.guestId],
          tableIds: entry.seat ? [entry.seat.tableId] : [],
        }),
      );
  }

  return scope
    .filter((entry) => !entry.seat || !isAccessibleSeat(entry.seat.seatIndex))
    .map((entry) =>
      violation(constraint, {
        id: perGuestViolationId(constraint, entry.guestId),
        message:
          constraint.message ??
          `${guestName(state, entry.guestId)} needs an accessible aisle seat.`,
        guestIds: [entry.guestId],
        tableIds: entry.seat ? [entry.seat.tableId] : [],
      }),
    );
}

function evaluateReservedSeats(state: RoomState): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const tableId of TABLE_IDS) {
    const table = state.tables[tableId];
    const emptySeats = state.seats[tableId]
      .slice(0, table.capacity)
      .filter((guestId) => guestId === null).length;
    if (emptySeats >= table.reservedEmptySeats) continue;
    violations.push({
      id: `${tableId}-empty-seats`,
      type: 'reserved_empty_seats',
      severity: 'hard',
      message: `${table.label} must keep ${table.reservedEmptySeats} empty ${
        table.reservedEmptySeats === 1 ? 'seat' : 'seats'
      }.`,
      guestIds: [],
      tableIds: [tableId],
      constraintId: null,
    });
  }
  return violations;
}

export function evaluateConstraints(state: RoomState): ConstraintViolation[] {
  return [
    ...state.constraints.flatMap((constraint) =>
      evaluateConstraint(state, constraint),
    ),
    ...evaluateReservedSeats(state),
  ];
}

export function violationScore(state: RoomState): number {
  return evaluateConstraints(state).reduce(
    (score, violation) => score + (violation.severity === 'hard' ? 10 : 3),
    0,
  );
}

export function constraintsForGuest(
  state: RoomState,
  guestId: string,
): SeatingConstraint[] {
  return state.constraints.filter((constraint) =>
    constraint.guestIds.includes(guestId),
  );
}

export type ConstraintValidation =
  | { ok: true; constraint: SeatingConstraint }
  | { ok: false; code: string; message: string };

function invalid(code: string, message: string): ConstraintValidation {
  return { ok: false, code, message };
}

function uniqueConstraintId(state: RoomState, candidate: string): string {
  let id = candidate;
  let suffix = 2;
  while (state.constraints.some((constraint) => constraint.id === id)) {
    id = `${candidate}-${suffix++}`;
  }
  return id;
}

export function normalizeConstraint(
  state: RoomState,
  input: ConstraintInput,
): ConstraintValidation {
  if (!CONSTRAINT_KINDS.includes(input.kind)) {
    return invalid(
      'invalid_constraint_kind',
      `Unknown rule kind "${input.kind}".`,
    );
  }
  if (!Array.isArray(input.guestIds)) {
    return invalid('invalid_constraint_guests', 'guestIds must be an array.');
  }

  const guestIds = [...new Set(input.guestIds.map((id) => String(id).trim()))];
  const missing = guestIds.filter((guestId) => !state.guests[guestId]);
  if (missing.length > 0) {
    return invalid(
      'guest_not_found',
      `A rule cannot reference guests who are not in the room: ${missing.join(
        ', ',
      )}.`,
    );
  }

  const pairKind =
    input.kind === 'must_share_table' || input.kind === 'must_not_share_table';
  if (guestIds.length < (pairKind ? 2 : 1)) {
    return invalid(
      'invalid_constraint_guests',
      pairKind
        ? 'This rule needs at least two distinct guests.'
        : 'This rule needs at least one guest.',
    );
  }

  let zone: RoomZone | undefined;
  if (input.kind === 'prefer_zone') {
    if (!input.zone || !ROOM_ZONES.includes(input.zone)) {
      return invalid(
        'invalid_zone',
        `A zone preference needs one of: ${ROOM_ZONES.join(', ')}.`,
      );
    }
    zone = input.zone;
  }

  if (
    input.severity &&
    input.severity !== 'hard' &&
    input.severity !== 'preference'
  ) {
    return invalid(
      'invalid_severity',
      'Severity must be "hard" or "preference".',
    );
  }

  const requestedId = input.id?.trim();
  if (
    requestedId &&
    state.constraints.some((constraint) => constraint.id === requestedId)
  ) {
    return invalid(
      'constraint_exists',
      `A rule with id "${requestedId}" already exists.`,
    );
  }

  const id =
    requestedId ??
    uniqueConstraintId(state, `${guestIds.join('-')}-${input.kind}`);
  const severity = input.severity ?? DEFAULT_SEVERITY[input.kind];
  const message = input.message?.trim() || undefined;
  const base = { id, severity, guestIds, message };

  return {
    ok: true,
    constraint:
      input.kind === 'prefer_zone'
        ? { ...base, kind: 'prefer_zone', zone: zone! }
        : { ...base, kind: input.kind },
  };
}
