import { createInitialState } from './room';
import {
  CONSTRAINT_KINDS,
  ROOM_ZONES,
  TABLE_IDS,
  type Guest,
  type GuestTag,
  type RoomState,
  type SeatingConstraint,
  type TimelineEvent,
} from './types';

export const ROOM_SCHEMA_VERSION = 1;
export const ROOM_SESSION_KEY = 'places.room.v1';

export interface RoomExport {
  schemaVersion: typeof ROOM_SCHEMA_VERSION;
  state: RoomState;
}

export type RoomImportResult =
  | { ok: true; state: RoomState }
  | { ok: false; error: string };

const GUEST_TAGS: GuestTag[] = [
  'adult',
  'grandparent',
  'kid',
  'wheelchair',
  'plus_one',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown, minimum = 0): value is number {
  return Number.isInteger(value) && Number(value) >= minimum;
}

function isGuest(value: unknown): value is Guest {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.note === 'string' &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => GUEST_TAGS.includes(tag as GuestTag)) &&
    (value.generated === undefined || typeof value.generated === 'boolean')
  );
}

function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.actor === 'agent' ||
      value.actor === 'human' ||
      value.actor === 'system') &&
    typeof value.message === 'string' &&
    typeof value.detail === 'string'
  );
}

function isConstraint(
  value: unknown,
  allowedGuestIds: Set<string>,
): value is SeatingConstraint {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    !CONSTRAINT_KINDS.includes(value.kind as SeatingConstraint['kind']) ||
    (value.severity !== 'hard' && value.severity !== 'preference') ||
    !Array.isArray(value.guestIds) ||
    value.guestIds.length === 0 ||
    !value.guestIds.every(
      (guestId) => typeof guestId === 'string' && allowedGuestIds.has(guestId),
    ) ||
    (value.message !== undefined && typeof value.message !== 'string')
  ) {
    return false;
  }
  return (
    value.kind !== 'prefer_zone' ||
    ROOM_ZONES.includes(value.zone as (typeof ROOM_ZONES)[number])
  );
}

function validateRoomState(value: unknown): RoomImportResult {
  if (!isRecord(value))
    return { ok: false, error: 'The export has no room state.' };
  if (!isRecord(value.guests))
    return { ok: false, error: 'The guest list is invalid.' };

  const guestEntries = Object.entries(value.guests);
  if (
    guestEntries.length === 0 ||
    guestEntries.some(
      ([guestId, guest]) => !isGuest(guest) || guest.id !== guestId,
    )
  ) {
    return { ok: false, error: 'One or more guests are invalid.' };
  }
  const guests = Object.fromEntries(guestEntries) as RoomState['guests'];
  const guestIds = new Set(Object.keys(guests));

  if (!isRecord(value.scenario) || !isGuest(value.scenario.absentGuest))
    return { ok: false, error: 'The challenge information is invalid.' };
  if (
    typeof value.scenario.id !== 'string' ||
    guestIds.has(value.scenario.absentGuest.id)
  ) {
    return { ok: false, error: 'The absent guest is invalid.' };
  }
  const allowedConstraintGuests = new Set([
    ...guestIds,
    value.scenario.absentGuest.id,
  ]);

  if (!isRecord(value.tables) || !isRecord(value.seats))
    return { ok: false, error: 'The table layout is invalid.' };

  const tables = {} as RoomState['tables'];
  const seats = {} as RoomState['seats'];
  const seatedGuestIds: string[] = [];
  for (const tableId of TABLE_IDS) {
    const table = value.tables[tableId];
    const tableSeats = value.seats[tableId];
    if (
      !isRecord(table) ||
      table.id !== tableId ||
      typeof table.label !== 'string' ||
      !isInteger(table.capacity, 2) ||
      table.capacity > 6 ||
      !isInteger(table.reservedEmptySeats) ||
      table.reservedEmptySeats > table.capacity ||
      typeof table.x !== 'number' ||
      !Number.isFinite(table.x) ||
      typeof table.y !== 'number' ||
      !Number.isFinite(table.y) ||
      !Array.isArray(table.zones) ||
      !table.zones.every((zone) =>
        ROOM_ZONES.includes(zone as (typeof ROOM_ZONES)[number]),
      )
    ) {
      return { ok: false, error: `The data for ${tableId} is invalid.` };
    }
    if (
      !Array.isArray(tableSeats) ||
      tableSeats.length !== 6 ||
      !tableSeats.every(
        (guestId) =>
          guestId === null ||
          (typeof guestId === 'string' && guestIds.has(guestId)),
      )
    ) {
      return { ok: false, error: `The seats for ${tableId} are invalid.` };
    }
    tables[tableId] = {
      id: tableId,
      label: table.label,
      capacity: table.capacity,
      reservedEmptySeats: table.reservedEmptySeats,
      x: table.x,
      y: table.y,
      zones: [...table.zones] as RoomState['tables'][typeof tableId]['zones'],
    };
    seats[tableId] = tableSeats.map((guestId) => guestId as string | null);
    seatedGuestIds.push(
      ...tableSeats.filter((guestId): guestId is string => guestId !== null),
    );
  }
  if (
    new Set(seatedGuestIds).size !== seatedGuestIds.length ||
    seatedGuestIds.length !== guestIds.size
  ) {
    return { ok: false, error: 'Every guest must occupy exactly one seat.' };
  }

  if (
    !Array.isArray(value.pinnedGuestIds) ||
    !value.pinnedGuestIds.every(
      (guestId) => typeof guestId === 'string' && guestIds.has(guestId),
    ) ||
    new Set(value.pinnedGuestIds).size !== value.pinnedGuestIds.length
  ) {
    return { ok: false, error: 'The pinned guest list is invalid.' };
  }

  const selection = value.selection;
  if (
    selection !== null &&
    (!isRecord(selection) ||
      (selection.type === 'guest'
        ? typeof selection.id !== 'string' || !guestIds.has(selection.id)
        : selection.type === 'table'
          ? !TABLE_IDS.includes(selection.id as (typeof TABLE_IDS)[number])
          : true))
  ) {
    return { ok: false, error: 'The current selection is invalid.' };
  }

  if (
    !Array.isArray(value.constraints) ||
    !value.constraints.every((constraint) =>
      isConstraint(constraint, allowedConstraintGuests),
    ) ||
    new Set(
      value.constraints.map((constraint) =>
        isRecord(constraint) ? constraint.id : null,
      ),
    ).size !== value.constraints.length
  ) {
    return { ok: false, error: 'One or more seating rules are invalid.' };
  }
  if (
    !Array.isArray(value.timeline) ||
    !value.timeline.every(isTimelineEvent) ||
    !isInteger(value.revision) ||
    !isInteger(value.nextGuestNumber, 1)
  ) {
    return { ok: false, error: 'The room history is invalid.' };
  }

  return {
    ok: true,
    state: {
      guests,
      tables,
      seats,
      constraints: value.constraints.map((constraint) => ({
        ...constraint,
        guestIds: [...constraint.guestIds],
      })) as SeatingConstraint[],
      scenario: {
        id: value.scenario.id,
        absentGuest: {
          ...value.scenario.absentGuest,
          tags: [...value.scenario.absentGuest.tags],
        },
      },
      pinnedGuestIds: [...value.pinnedGuestIds] as string[],
      selection: selection as RoomState['selection'],
      timeline: value.timeline.slice(0, 30),
      revision: value.revision,
      nextGuestNumber: value.nextGuestNumber,
    },
  };
}

export function serializeRoom(state: RoomState): string {
  const exported: RoomExport = { schemaVersion: ROOM_SCHEMA_VERSION, state };
  return JSON.stringify(exported, null, 2);
}

export function importRoom(json: string): RoomImportResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The selected file is not valid JSON.' };
  }
  if (!isRecord(value) || value.schemaVersion !== ROOM_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This file does not use Places schema version ${ROOM_SCHEMA_VERSION}.`,
    };
  }
  return validateRoomState(value.state);
}

export function getRoomSessionKey(search: string): string {
  const seedValue = new URLSearchParams(search).get('seed');
  return seedValue !== null && /^-?\d+$/.test(seedValue)
    ? `${ROOM_SESSION_KEY}.seed-${seedValue}`
    : ROOM_SESSION_KEY;
}

interface InitialRoomOptions {
  search: string;
  storedRoom: string | null;
  fallbackSeed: number;
}

export function loadInitialRoom({
  search,
  storedRoom,
  fallbackSeed,
}: InitialRoomOptions): RoomState {
  if (storedRoom) {
    const restored = importRoom(storedRoom);
    if (restored.ok) return restored.state;
  }
  const seedValue = new URLSearchParams(search).get('seed');
  if (seedValue !== null && /^-?\d+$/.test(seedValue)) {
    return createInitialState(Number(seedValue));
  }
  return createInitialState(fallbackSeed);
}
