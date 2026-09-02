import {
  cloneConstraints,
  evaluateConstraints,
  normalizeConstraint,
} from './constraints';
import { actorLabel, createInitialState, eventFor, withEvent } from './room';
import { INITIAL_SCENARIOS } from './roster';
import { cloneSeats, cloneTables, getGuestSeat } from './seating';
import { reflowSeating } from './solver';
import {
  TABLE_IDS,
  type CommandOutcome,
  type EventActor,
  type Guest,
  type RoomCommand,
  type RoomState,
  type TableId,
} from './types';

function failure(
  state: RoomState,
  code: string,
  message: string,
  data?: Record<string, unknown>,
): CommandOutcome {
  return { state, result: { ok: false, code, message, data } };
}

function success(
  state: RoomState,
  code: string,
  message: string,
  data?: Record<string, unknown>,
): CommandOutcome {
  return { state, result: { ok: true, code, message, data } };
}

function moveGuest(
  state: RoomState,
  guestId: string,
  tableId: TableId,
  actor: EventActor,
  requestedSeatIndex?: number,
): CommandOutcome {
  const guest = state.guests[guestId];
  if (!guest)
    return failure(
      state,
      'guest_not_found',
      `Guest "${guestId}" was not found.`,
    );
  if (!state.tables[tableId])
    return failure(
      state,
      'table_not_found',
      `Table "${tableId}" was not found.`,
    );
  if (state.pinnedGuestIds.includes(guestId)) {
    return failure(
      state,
      'pinned_by_human',
      `${guest.name} is pinned and cannot be moved.`,
    );
  }

  const currentSeat = getGuestSeat(state, guestId);
  const table = state.tables[tableId];
  const availableSeat = state.seats[tableId].findIndex(
    (occupant, index) => index < table.capacity && occupant === null,
  );
  const destination = requestedSeatIndex ?? availableSeat;

  if (destination < 0 || destination >= table.capacity) {
    return failure(
      state,
      'table_full',
      `${table.label} has no available seats.`,
    );
  }
  if (
    state.seats[tableId][destination] !== null &&
    state.seats[tableId][destination] !== guestId
  ) {
    return failure(
      state,
      'seat_occupied',
      `Seat ${destination + 1} at ${table.label} is occupied.`,
    );
  }
  if (
    currentSeat?.tableId === tableId &&
    currentSeat.seatIndex === destination
  ) {
    return success(
      state,
      'already_seated',
      `${guest.name} is already in that seat.`,
    );
  }

  const seats = cloneSeats(state.seats);
  if (currentSeat) seats[currentSeat.tableId][currentSeat.seatIndex] = null;
  seats[tableId][destination] = guestId;
  const next = withEvent(
    { ...state, seats },
    actor,
    `${actorLabel(actor)} moved ${guest.name}.`,
    `${guest.name} is now at ${table.label}.`,
  );
  return success(
    next,
    'guest_moved',
    `${guest.name} moved to ${table.label}.`,
    {
      guestId,
      tableId,
      seatIndex: destination,
    },
  );
}

function swapGuests(
  state: RoomState,
  guestId: string,
  otherGuestId: string,
  actor: EventActor,
): CommandOutcome {
  const guest = state.guests[guestId];
  const other = state.guests[otherGuestId];
  if (!guest || !other)
    return failure(
      state,
      'guest_not_found',
      'Both guests must exist before a swap.',
    );
  if (
    state.pinnedGuestIds.includes(guestId) ||
    state.pinnedGuestIds.includes(otherGuestId)
  ) {
    return failure(
      state,
      'pinned_by_human',
      'Pinned guests cannot be swapped.',
    );
  }
  const seat = getGuestSeat(state, guestId);
  const otherSeat = getGuestSeat(state, otherGuestId);
  if (!seat || !otherSeat)
    return failure(
      state,
      'guest_not_seated',
      'Both guests must be seated before a swap.',
    );

  const seats = cloneSeats(state.seats);
  seats[seat.tableId][seat.seatIndex] = otherGuestId;
  seats[otherSeat.tableId][otherSeat.seatIndex] = guestId;
  const next = withEvent(
    { ...state, seats },
    actor,
    `${actorLabel(actor)} swapped ${guest.name} and ${other.name}.`,
    `${guest.name} is at ${state.tables[otherSeat.tableId].label}; ${other.name} is at ${state.tables[seat.tableId].label}.`,
  );
  return success(
    next,
    'guests_swapped',
    `${guest.name} and ${other.name} swapped seats.`,
  );
}

function guestNames(state: RoomState, guestIds: string[]): string {
  return guestIds
    .map((guestId) => state.guests[guestId]?.name ?? guestId)
    .join(', ');
}

function repairConstraints(
  state: RoomState,
  actor: EventActor,
): CommandOutcome {
  const reflow = reflowSeating(state);
  const remaining = reflow.violations;
  const ruleWord = remaining.length === 1 ? 'rule' : 'rules';
  const data = {
    status: reflow.status,
    remainingViolations: remaining,
    movedSeats: reflow.movedSeats,
    blockingPinIds: reflow.blockingPinIds,
    reasons: reflow.reasons,
  };

  if (reflow.status === 'solved') {
    const next = withEvent(
      { ...state, seats: reflow.seats },
      actor,
      `${actorLabel(actor)} cleared the room.`,
      'Every rule is satisfied. No pins were moved.',
    );
    return success(
      next,
      'violations_fixed',
      'All violations were fixed without moving pinned guests.',
      { movedSeats: reflow.movedSeats },
    );
  }

  if (reflow.status === 'blocked_by_pins') {
    const next = withEvent(
      { ...state, seats: reflow.seats },
      actor,
      `${actorLabel(actor)} improved the room.`,
      `${remaining.length} ${ruleWord} need ${guestNames(
        state,
        reflow.blockingPinIds,
      )} to move, and that seat is pinned.`,
    );
    return failure(
      next,
      'blocked_by_pins',
      `Improved the room, but ${remaining.length} ${ruleWord} cannot be satisfied while ${guestNames(
        state,
        reflow.blockingPinIds,
      )} stays pinned.`,
      data,
    );
  }

  if (reflow.status === 'infeasible') {
    const next = withEvent(
      { ...state, seats: reflow.seats },
      actor,
      `${actorLabel(actor)} improved the room.`,
      reflow.reasons[0],
    );
    return failure(
      next,
      'infeasible',
      `${remaining.length} ${ruleWord} cannot all be satisfied: ${reflow.reasons.join(
        ' ',
      )}`,
      data,
    );
  }

  const next = withEvent(
    { ...state, seats: reflow.seats },
    actor,
    `${actorLabel(actor)} improved the room.`,
    `${remaining.length} ${ruleWord} remain; no better arrangement was found.`,
  );
  return failure(
    next,
    'no_arrangement_found',
    `Improved the room, but ${remaining.length} ${ruleWord} remain and no better arrangement was found.`,
    data,
  );
}

export function executeCommand(
  state: RoomState,
  command: RoomCommand,
  actor: EventActor,
): CommandOutcome {
  if (command.type === 'reset_seed') {
    const scenarioSeed =
      command.scenarioSeed ??
      Math.floor(Math.random() * INITIAL_SCENARIOS.length);
    const reset = createInitialState(scenarioSeed);
    reset.timeline = [
      eventFor(
        actor,
        `${actorLabel(actor)} started a new challenge.`,
        `${reset.scenario.absentGuest.name} is out and the room needs rebalancing.`,
        1,
      ),
      ...reset.timeline,
    ];
    reset.revision = 1;
    return success(reset, 'seed_reset', 'A new seating challenge is ready.');
  }

  if (command.type === 'move_guest' || command.type === 'seat_guest_here') {
    return moveGuest(
      state,
      command.guestId,
      command.tableId,
      actor,
      command.type === 'move_guest' ? command.seatIndex : undefined,
    );
  }

  if (command.type === 'swap_guests') {
    return swapGuests(state, command.guestId, command.otherGuestId, actor);
  }

  if (command.type === 'pin_guest' || command.type === 'unpin_guest') {
    const guest = state.guests[command.guestId];
    if (!guest)
      return failure(
        state,
        'guest_not_found',
        `Guest "${command.guestId}" was not found.`,
      );
    const isPinned = state.pinnedGuestIds.includes(command.guestId);
    if (command.type === 'pin_guest' && isPinned) {
      return success(
        state,
        'already_pinned',
        `${guest.name} is already pinned.`,
      );
    }
    if (command.type === 'unpin_guest' && !isPinned) {
      return success(state, 'not_pinned', `${guest.name} is not pinned.`);
    }
    const pinnedGuestIds =
      command.type === 'pin_guest'
        ? [...state.pinnedGuestIds, command.guestId]
        : state.pinnedGuestIds.filter((id) => id !== command.guestId);
    const verb = command.type === 'pin_guest' ? 'pinned' : 'unpinned';
    const next = withEvent(
      { ...state, pinnedGuestIds },
      actor,
      `${actorLabel(actor)} ${verb} ${guest.name}.`,
      command.type === 'pin_guest'
        ? 'This seat is now protected.'
        : 'The agent may move this guest again.',
    );
    return success(next, verb, `${guest.name} was ${verb}.`);
  }

  if (command.type === 'set_capacity') {
    const table = state.tables[command.tableId];
    if (!table)
      return failure(
        state,
        'table_not_found',
        `Table "${command.tableId}" was not found.`,
      );
    const capacity = Math.round(command.capacity);
    if (capacity < 2 || capacity > 6) {
      return failure(
        state,
        'invalid_capacity',
        'Table capacity must be between 2 and 6.',
      );
    }
    const displaced = state.seats[command.tableId]
      .slice(capacity)
      .filter(Boolean);
    if (displaced.length > 0) {
      return failure(
        state,
        'capacity_in_use',
        'Move guests out of the removed seats before reducing capacity.',
      );
    }
    const tables = cloneTables(state.tables);
    tables[command.tableId].capacity = capacity;
    tables[command.tableId].reservedEmptySeats = Math.min(
      tables[command.tableId].reservedEmptySeats,
      capacity,
    );
    const next = withEvent(
      { ...state, tables },
      actor,
      `${actorLabel(actor)} set ${table.label} to ${capacity}.`,
      `${capacity} seats are now available at this table.`,
    );
    return success(
      next,
      'capacity_set',
      `${table.label} now has ${capacity} seats.`,
    );
  }

  if (command.type === 'leave_empty_seats') {
    const table = state.tables[command.tableId];
    if (!table)
      return failure(
        state,
        'table_not_found',
        `Table "${command.tableId}" was not found.`,
      );
    const count = Math.round(command.count);
    if (count < 0 || count > table.capacity) {
      return failure(
        state,
        'invalid_empty_seat_count',
        `Empty seats must be between 0 and ${table.capacity}.`,
      );
    }
    const tables = cloneTables(state.tables);
    tables[command.tableId].reservedEmptySeats = count;
    const next = withEvent(
      { ...state, tables },
      actor,
      `${actorLabel(actor)} held ${count} ${count === 1 ? 'seat' : 'seats'} at ${table.label}.`,
      count === 0
        ? 'No seats are reserved.'
        : 'The agent will preserve this space while reflowing.',
    );
    return success(
      next,
      'empty_seats_reserved',
      `${count} empty seats are reserved at ${table.label}.`,
    );
  }

  if (command.type === 'add_guest') {
    const name = command.name?.trim() || `Late Guest ${state.nextGuestNumber}`;
    const slug =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `late-guest-${state.nextGuestNumber}`;
    let guestId = slug;
    let suffix = 2;
    while (state.guests[guestId]) guestId = `${slug}-${suffix++}`;

    const tableHasOpenSeat = (tableId: TableId) => {
      const table = state.tables[tableId];
      return state.seats[tableId]
        .slice(0, table.capacity)
        .some((occupant) => occupant === null);
    };
    const destinationTableId =
      TABLE_IDS.find(
        (tableId) =>
          state.tables[tableId].reservedEmptySeats > 0 &&
          tableHasOpenSeat(tableId),
      ) ?? TABLE_IDS.find(tableHasOpenSeat);
    if (!destinationTableId)
      return failure(
        state,
        'room_full',
        'There are no open seats for another guest.',
      );
    const seatIndex = state.seats[destinationTableId].findIndex(
      (occupant) => occupant === null,
    );
    const tags = command.tags?.filter(
      (tag, index, list) => list.indexOf(tag) === index,
    ) ?? ['adult'];
    const guest: Guest = {
      id: guestId,
      name,
      note: 'A last-minute arrival.',
      tags,
      generated: true,
    };
    const guests = { ...state.guests, [guestId]: guest };
    const seats = cloneSeats(state.seats);
    seats[destinationTableId][seatIndex] = guestId;
    const tables = cloneTables(state.tables);
    if (tables[destinationTableId].reservedEmptySeats > 0) {
      tables[destinationTableId].reservedEmptySeats -= 1;
    }
    const next = withEvent(
      {
        ...state,
        guests,
        seats,
        tables,
        nextGuestNumber: state.nextGuestNumber + 1,
      },
      actor,
      `${actorLabel(actor)} added ${name}.`,
      `${name} took a held seat at ${state.tables[destinationTableId].label}.`,
    );
    return success(next, 'guest_added', `${name} was added and seated.`, {
      guestId,
      tableId: destinationTableId,
      seatIndex,
    });
  }

  if (command.type === 'add_constraint') {
    const validation = normalizeConstraint(state, command.constraint);
    if (!validation.ok)
      return failure(state, validation.code, validation.message);
    const constraint = validation.constraint;
    const next = withEvent(
      {
        ...state,
        constraints: [...cloneConstraints(state.constraints), constraint],
      },
      actor,
      `${actorLabel(actor)} added a seating rule.`,
      `${guestNames(state, constraint.guestIds)} · ${constraint.kind.replace(
        /_/g,
        ' ',
      )}`,
    );
    return success(next, 'constraint_added', 'The seating rule was added.', {
      constraint,
    });
  }

  if (command.type === 'remove_constraint') {
    const constraint = state.constraints.find(
      (entry) => entry.id === command.constraintId,
    );
    if (!constraint)
      return failure(
        state,
        'constraint_not_found',
        `Rule "${command.constraintId}" was not found.`,
      );
    const next = withEvent(
      {
        ...state,
        constraints: cloneConstraints(state.constraints).filter(
          (entry) => entry.id !== command.constraintId,
        ),
      },
      actor,
      `${actorLabel(actor)} removed a seating rule.`,
      `${guestNames(state, constraint.guestIds)} · ${constraint.kind.replace(
        /_/g,
        ' ',
      )}`,
    );
    return success(
      next,
      'constraint_removed',
      'The seating rule was removed.',
      {
        constraintId: constraint.id,
      },
    );
  }

  if (command.type === 'fix_violations') {
    if (evaluateConstraints(state).length === 0) {
      return success(
        state,
        'no_violations',
        'The room already satisfies every constraint.',
      );
    }
    return repairConstraints(state, actor);
  }

  return failure(
    state,
    'unsupported_command',
    'This command is not supported.',
  );
}
