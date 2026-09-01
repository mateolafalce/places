export const TABLE_IDS = ['table-1', 'table-2', 'table-3', 'table-4'] as const;

export type TableId = (typeof TABLE_IDS)[number];
export type GuestTag =
  | 'adult'
  | 'grandparent'
  | 'kid'
  | 'wheelchair'
  | 'plus_one';
export type EventActor = 'agent' | 'human' | 'system';

export interface Guest {
  id: string;
  name: string;
  note: string;
  tags: GuestTag[];
  generated?: boolean;
}

export interface RoomTable {
  id: TableId;
  label: string;
  capacity: number;
  reservedEmptySeats: number;
  x: number;
  y: number;
  zones: Array<'window' | 'kitchen' | 'door'>;
}

export type Selection =
  | { type: 'guest'; id: string }
  | { type: 'table'; id: TableId }
  | null;

export interface TimelineEvent {
  id: string;
  actor: EventActor;
  message: string;
  detail: string;
}

export interface RoomState {
  guests: Record<string, Guest>;
  tables: Record<TableId, RoomTable>;
  seats: Record<TableId, Array<string | null>>;
  scenario: {
    id: string;
    absentGuest: Guest;
  };
  pinnedGuestIds: string[];
  selection: Selection;
  timeline: TimelineEvent[];
  revision: number;
  nextGuestNumber: number;
}

export interface ConstraintViolation {
  id: string;
  type:
    | 'window_preference'
    | 'kitchen_preference'
    | 'must_sit_together'
    | 'must_not_share_table'
    | 'wheelchair_access'
    | 'reserved_empty_seats';
  severity: 'hard' | 'preference';
  message: string;
  guestIds: string[];
  tableIds: TableId[];
}

export type RoomCommand =
  | {
      type: 'move_guest';
      guestId: string;
      tableId: TableId;
      seatIndex?: number;
    }
  | { type: 'seat_guest_here'; guestId: string; tableId: TableId }
  | { type: 'swap_guests'; guestId: string; otherGuestId: string }
  | { type: 'pin_guest'; guestId: string }
  | { type: 'unpin_guest'; guestId: string }
  | { type: 'set_capacity'; tableId: TableId; capacity: number }
  | { type: 'leave_empty_seats'; tableId: TableId; count: number }
  | { type: 'add_guest'; name?: string; tags?: GuestTag[] }
  | { type: 'fix_violations' }
  | { type: 'reset_seed'; scenarioSeed?: number };

export interface CommandResult {
  ok: boolean;
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CommandOutcome {
  state: RoomState;
  result: CommandResult;
}

const GUEST_LIST: Guest[] = [
  {
    id: 'mabel',
    name: 'Mabel',
    note: 'The window or bust.',
    tags: ['grandparent'],
  },
  {
    id: 'harold',
    name: 'Harold',
    note: 'Always sits with Mabel.',
    tags: ['grandparent'],
  },
  {
    id: 'ivy',
    name: 'Ivy',
    note: 'Sits with the host, period.',
    tags: ['adult'],
  },
  {
    id: 'jules',
    name: 'Jules',
    note: 'Keeps the stories moving.',
    tags: ['adult'],
  },
  {
    id: 'arthur',
    name: 'Arthur',
    note: 'Needs an accessible aisle seat.',
    tags: ['wheelchair'],
  },
  {
    id: 'pearl',
    name: 'Pearl',
    note: 'Knows everyone in the room.',
    tags: ['adult'],
  },
  {
    id: 'rex',
    name: 'Rex',
    note: 'Must not share a table with Vivian.',
    tags: ['adult'],
  },
  {
    id: 'kit',
    name: 'Kit',
    note: 'Otis brought Kit as a plus-one.',
    tags: ['plus_one'],
  },
  {
    id: 'marlo',
    name: 'Marlo',
    note: 'Likes a lively table.',
    tags: ['adult'],
  },
  { id: 'otis', name: 'Otis', note: 'Arrived with Kit.', tags: ['adult'] },
  {
    id: 'willa',
    name: 'Willa',
    note: 'Prefers the quieter side.',
    tags: ['adult'],
  },
  {
    id: 'vivian',
    name: 'Vivian',
    note: 'Must not share a table with Rex.',
    tags: ['adult'],
  },
  {
    id: 'quinn',
    name: 'Quinn',
    note: 'A generous conversationalist.',
    tags: ['adult'],
  },
  { id: 'sable', name: 'Sable', note: 'Happy near the door.', tags: ['adult'] },
  {
    id: 'felix',
    name: 'Felix',
    note: 'Makes room for late arrivals.',
    tags: ['adult'],
  },
  {
    id: 'nora',
    name: 'Nora',
    note: 'Wants to catch up with Pearl.',
    tags: ['adult'],
  },
  {
    id: 'pip',
    name: 'Pip',
    note: 'One of the kitchen-table kids.',
    tags: ['kid'],
  },
  {
    id: 'nell',
    name: 'Nell',
    note: 'One of the kitchen-table kids.',
    tags: ['kid'],
  },
  {
    id: 'theo',
    name: 'Theo',
    note: 'One of the kitchen-table kids.',
    tags: ['kid'],
  },
  {
    id: 'birdie',
    name: 'Birdie',
    note: 'Keeps an eye on the kids.',
    tags: ['adult'],
  },
  {
    id: 'cal',
    name: 'Cal',
    note: 'Keeps an eye on the kids.',
    tags: ['adult'],
  },
  {
    id: 'dot',
    name: 'Dot',
    note: 'One of the kitchen-table kids.',
    tags: ['kid'],
  },
];

const TABLES: Record<TableId, RoomTable> = {
  'table-1': {
    id: 'table-1',
    label: 'Table 1',
    capacity: 6,
    reservedEmptySeats: 0,
    x: 215,
    y: 225,
    zones: ['window'],
  },
  'table-2': {
    id: 'table-2',
    label: 'Table 2',
    capacity: 6,
    reservedEmptySeats: 1,
    x: 535,
    y: 225,
    zones: [],
  },
  'table-3': {
    id: 'table-3',
    label: 'Table 3',
    capacity: 6,
    reservedEmptySeats: 1,
    x: 215,
    y: 475,
    zones: ['door'],
  },
  'table-4': {
    id: 'table-4',
    label: 'Table 4',
    capacity: 6,
    reservedEmptySeats: 0,
    x: 535,
    y: 475,
    zones: ['kitchen'],
  },
};

const INITIAL_SEATS: RoomState['seats'] = {
  'table-1': ['mabel', 'harold', 'ivy', 'jules', 'arthur', 'pearl'],
  'table-2': ['rex', 'kit', 'marlo', null, 'otis', 'willa'],
  'table-3': ['vivian', 'quinn', 'sable', null, 'felix', 'nora'],
  'table-4': ['pip', 'nell', 'theo', 'birdie', 'cal', 'dot'],
};

interface InitialScenario {
  id: string;
  absentGuestId: string;
  swaps: Array<[string, string]>;
  detail: string;
}

const INITIAL_SCENARIOS: InitialScenario[] = [
  {
    id: 'old-rivals',
    absentGuestId: 'ivy',
    swaps: [['rex', 'quinn']],
    detail: 'Rex and Vivian have ended up together.',
  },
  {
    id: 'split-arrival',
    absentGuestId: 'jules',
    swaps: [['kit', 'sable']],
    detail: 'Kit and Otis were split between tables.',
  },
  {
    id: 'lost-window',
    absentGuestId: 'pearl',
    swaps: [['mabel', 'marlo']],
    detail: 'Mabel lost her place by the window.',
  },
  {
    id: 'kids-table',
    absentGuestId: 'cal',
    swaps: [['pip', 'willa']],
    detail: 'Pip landed away from the kitchen table.',
  },
];

function cloneSeats(seats: RoomState['seats']): RoomState['seats'] {
  return Object.fromEntries(
    TABLE_IDS.map((tableId) => [tableId, [...seats[tableId]]]),
  ) as RoomState['seats'];
}

function cloneTables(tables: RoomState['tables']): RoomState['tables'] {
  return Object.fromEntries(
    TABLE_IDS.map((tableId) => [
      tableId,
      { ...tables[tableId], zones: [...tables[tableId].zones] },
    ]),
  ) as RoomState['tables'];
}

function swapGuestSeats(
  seats: RoomState['seats'],
  firstGuestId: string,
  secondGuestId: string,
) {
  const entries = TABLE_IDS.flatMap((tableId) =>
    seats[tableId].map((guestId, seatIndex) => ({
      guestId,
      seatIndex,
      tableId,
    })),
  );
  const first = entries.find((entry) => entry.guestId === firstGuestId);
  const second = entries.find((entry) => entry.guestId === secondGuestId);
  if (!first || !second) return;
  seats[first.tableId][first.seatIndex] = secondGuestId;
  seats[second.tableId][second.seatIndex] = firstGuestId;
}

export function createInitialState(scenarioSeed = 0): RoomState {
  const scenarioIndex =
    Math.abs(Math.trunc(scenarioSeed)) % INITIAL_SCENARIOS.length;
  const scenario = INITIAL_SCENARIOS[scenarioIndex];
  const absentGuest = GUEST_LIST.find(
    (guest) => guest.id === scenario.absentGuestId,
  )!;
  const seats = cloneSeats(INITIAL_SEATS);
  const absentSeat = TABLE_IDS.flatMap((tableId) =>
    seats[tableId].map((guestId, seatIndex) => ({
      guestId,
      seatIndex,
      tableId,
    })),
  ).find((entry) => entry.guestId === absentGuest.id);
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

export function getGuestSeat(
  state: RoomState,
  guestId: string,
): { tableId: TableId; seatIndex: number } | null {
  for (const tableId of TABLE_IDS) {
    const seatIndex = state.seats[tableId].indexOf(guestId);
    if (seatIndex !== -1 && seatIndex < state.tables[tableId].capacity) {
      return { tableId, seatIndex };
    }
  }
  return null;
}

function isAccessibleSeat(seatIndex: number): boolean {
  return seatIndex === 4;
}

export function evaluateConstraints(state: RoomState): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const seatOf = (guestId: string) => getGuestSeat(state, guestId);
  const mabelSeat = seatOf('mabel');
  const haroldSeat = seatOf('harold');
  const kitSeat = seatOf('kit');
  const otisSeat = seatOf('otis');
  const rexSeat = seatOf('rex');
  const vivianSeat = seatOf('vivian');
  const arthurSeat = seatOf('arthur');

  if (mabelSeat?.tableId !== 'table-1') {
    violations.push({
      id: 'mabel-window',
      type: 'window_preference',
      severity: 'preference',
      message: 'Mabel wants the window table.',
      guestIds: ['mabel'],
      tableIds: mabelSeat ? [mabelSeat.tableId] : [],
    });
  }

  if (!mabelSeat || !haroldSeat || mabelSeat.tableId !== haroldSeat.tableId) {
    violations.push({
      id: 'mabel-harold-together',
      type: 'must_sit_together',
      severity: 'hard',
      message: 'Harold must sit with Mabel.',
      guestIds: ['mabel', 'harold'],
      tableIds: [mabelSeat?.tableId, haroldSeat?.tableId].filter(
        Boolean,
      ) as TableId[],
    });
  }

  if (!kitSeat || !otisSeat || kitSeat.tableId !== otisSeat.tableId) {
    violations.push({
      id: 'kit-otis-together',
      type: 'must_sit_together',
      severity: 'hard',
      message: 'Kit must sit with Otis.',
      guestIds: ['kit', 'otis'],
      tableIds: [kitSeat?.tableId, otisSeat?.tableId].filter(
        Boolean,
      ) as TableId[],
    });
  }

  if (rexSeat && vivianSeat && rexSeat.tableId === vivianSeat.tableId) {
    violations.push({
      id: 'rex-vivian-apart',
      type: 'must_not_share_table',
      severity: 'hard',
      message: 'Rex and Vivian cannot share a table.',
      guestIds: ['rex', 'vivian'],
      tableIds: [rexSeat.tableId],
    });
  }

  for (const guestId of ['pip', 'nell', 'theo', 'dot']) {
    const seat = seatOf(guestId);
    if (seat?.tableId !== 'table-4') {
      violations.push({
        id: `${guestId}-kitchen`,
        type: 'kitchen_preference',
        severity: 'preference',
        message: `${state.guests[guestId].name} wants to sit near the kitchen.`,
        guestIds: [guestId],
        tableIds: seat ? [seat.tableId] : [],
      });
    }
  }

  if (!arthurSeat || !isAccessibleSeat(arthurSeat.seatIndex)) {
    violations.push({
      id: 'arthur-accessible-seat',
      type: 'wheelchair_access',
      severity: 'hard',
      message: 'Arthur needs an accessible aisle seat.',
      guestIds: ['arthur'],
      tableIds: arthurSeat ? [arthurSeat.tableId] : [],
    });
  }

  for (const tableId of TABLE_IDS) {
    const table = state.tables[tableId];
    const emptySeats = state.seats[tableId]
      .slice(0, table.capacity)
      .filter((guestId) => guestId === null).length;
    if (emptySeats < table.reservedEmptySeats) {
      violations.push({
        id: `${tableId}-empty-seats`,
        type: 'reserved_empty_seats',
        severity: 'hard',
        message: `${table.label} must keep ${table.reservedEmptySeats} empty ${table.reservedEmptySeats === 1 ? 'seat' : 'seats'}.`,
        guestIds: [],
        tableIds: [tableId],
      });
    }
  }

  return violations;
}

function violationScore(state: RoomState): number {
  return evaluateConstraints(state).reduce(
    (score, violation) => score + (violation.severity === 'hard' ? 10 : 3),
    0,
  );
}

function eventFor(
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

function withEvent(
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

function failure(
  state: RoomState,
  code: string,
  message: string,
): CommandOutcome {
  return { state, result: { ok: false, code, message } };
}

function success(
  state: RoomState,
  code: string,
  message: string,
  data?: Record<string, unknown>,
): CommandOutcome {
  return { state, result: { ok: true, code, message, data } };
}

function actorLabel(actor: EventActor): string {
  return actor === 'agent' ? 'Agent' : actor === 'human' ? 'You' : 'Places';
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

function repairConstraints(
  state: RoomState,
  actor: EventActor,
): CommandOutcome {
  let candidate = { ...state, seats: cloneSeats(state.seats) };
  let score = violationScore(candidate);
  const pinned = new Set(state.pinnedGuestIds);

  for (let iteration = 0; iteration < 64 && score > 0; iteration += 1) {
    const slots = TABLE_IDS.flatMap((tableId) =>
      Array.from(
        { length: candidate.tables[tableId].capacity },
        (_, seatIndex) => ({ tableId, seatIndex }),
      ),
    );
    let bestState: RoomState | null = null;
    let bestScore = score;

    for (let first = 0; first < slots.length; first += 1) {
      for (let second = first + 1; second < slots.length; second += 1) {
        const a = slots[first];
        const b = slots[second];
        const aGuest = candidate.seats[a.tableId][a.seatIndex];
        const bGuest = candidate.seats[b.tableId][b.seatIndex];
        if (aGuest === bGuest) continue;
        if ((aGuest && pinned.has(aGuest)) || (bGuest && pinned.has(bGuest)))
          continue;

        const seats = cloneSeats(candidate.seats);
        seats[a.tableId][a.seatIndex] = bGuest;
        seats[b.tableId][b.seatIndex] = aGuest;
        const trial = { ...candidate, seats };
        const trialScore = violationScore(trial);
        if (trialScore < bestScore) {
          bestScore = trialScore;
          bestState = trial;
        }
      }
    }

    if (!bestState) break;
    candidate = bestState;
    score = bestScore;
  }

  const remaining = evaluateConstraints(candidate);
  const movedCount = TABLE_IDS.reduce(
    (count, tableId) =>
      count +
      candidate.seats[tableId].filter(
        (guestId, index) => guestId !== state.seats[tableId][index],
      ).length,
    0,
  );
  const next = withEvent(
    candidate,
    actor,
    remaining.length === 0
      ? `${actorLabel(actor)} cleared the room.`
      : `${actorLabel(actor)} improved the room.`,
    remaining.length === 0
      ? 'Every rule is satisfied. No pins were moved.'
      : `${remaining.length} ${remaining.length === 1 ? 'rule is' : 'rules are'} still blocked by the current pins.`,
  );

  if (remaining.length > 0) {
    return {
      state: next,
      result: {
        ok: false,
        code: 'blocked_by_pins',
        message: `Improved the room, but ${remaining.length} violations remain.`,
        data: { remainingViolations: remaining, movedSeats: movedCount },
      },
    };
  }
  return success(
    next,
    'violations_fixed',
    'All violations were fixed without moving pinned guests.',
    {
      movedSeats: movedCount,
    },
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

export function selectItem(state: RoomState, selection: Selection): RoomState {
  return { ...state, selection };
}

export function getRoomSnapshot(state: RoomState) {
  return {
    revision: state.revision,
    scenario: state.scenario,
    tables: TABLE_IDS.map((tableId) => {
      const table = state.tables[tableId];
      return {
        id: table.id,
        label: table.label,
        capacity: table.capacity,
        reservedEmptySeats: table.reservedEmptySeats,
        zones: table.zones,
        seats: state.seats[tableId]
          .slice(0, table.capacity)
          .map((guestId, seatIndex) => ({
            seatIndex,
            guest: guestId ? state.guests[guestId] : null,
            pinned: guestId ? state.pinnedGuestIds.includes(guestId) : false,
            accessible: isAccessibleSeat(seatIndex),
          })),
      };
    }),
    selection: state.selection,
    violations: evaluateConstraints(state),
  };
}

export function explainGuest(state: RoomState, guestId: string) {
  const guest = state.guests[guestId];
  if (!guest) return null;
  const seat = getGuestSeat(state, guestId);
  return {
    guest,
    seat: seat
      ? {
          ...seat,
          table: state.tables[seat.tableId].label,
        }
      : null,
    pinned: state.pinnedGuestIds.includes(guestId),
    activeViolations: evaluateConstraints(state).filter((violation) =>
      violation.guestIds.includes(guestId),
    ),
    explanation: guest.note,
  };
}
