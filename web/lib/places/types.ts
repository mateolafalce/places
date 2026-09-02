export const TABLE_IDS = ['table-1', 'table-2', 'table-3', 'table-4'] as const;

export type TableId = (typeof TABLE_IDS)[number];
export const ROOM_ZONES = ['window', 'kitchen', 'door'] as const;

export type RoomZone = (typeof ROOM_ZONES)[number];
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
  zones: RoomZone[];
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

export type ConstraintSeverity = 'hard' | 'preference';

/* Seating rules are data, not code: every rule in the room is one of these
 * records, addressed by guest id, so a guest added at runtime can take part
 * in the same model as a seed guest. */
export const CONSTRAINT_KINDS = [
  'must_share_table',
  'must_not_share_table',
  'prefer_zone',
  'require_accessible_seat',
] as const;

export type ConstraintKind =
  | 'must_share_table'
  | 'must_not_share_table'
  | 'prefer_zone'
  | 'require_accessible_seat';

interface ConstraintBase {
  id: string;
  severity: ConstraintSeverity;
  guestIds: string[];
  /* Optional flavour copy; a generated sentence is used when absent. */
  message?: string;
}

export interface MustShareTableConstraint extends ConstraintBase {
  kind: 'must_share_table';
}

export interface MustNotShareTableConstraint extends ConstraintBase {
  kind: 'must_not_share_table';
}

export interface PreferZoneConstraint extends ConstraintBase {
  kind: 'prefer_zone';
  zone: RoomZone;
}

export interface RequireAccessibleSeatConstraint extends ConstraintBase {
  kind: 'require_accessible_seat';
}

export type SeatingConstraint =
  | MustShareTableConstraint
  | MustNotShareTableConstraint
  | PreferZoneConstraint
  | RequireAccessibleSeatConstraint;

/* The shape an agent or the UI may hand in; normalized before it enters
 * state. */
export interface ConstraintInput {
  id?: string;
  kind: ConstraintKind;
  guestIds: string[];
  zone?: RoomZone;
  severity?: ConstraintSeverity;
  message?: string;
}

export interface RoomState {
  guests: Record<string, Guest>;
  tables: Record<TableId, RoomTable>;
  seats: Record<TableId, Array<string | null>>;
  constraints: SeatingConstraint[];
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

/* `reserved_empty_seats` is derived from table data rather than from the
 * constraint list, so it carries no constraintId. */
export type ViolationType = ConstraintKind | 'reserved_empty_seats';

export interface ConstraintViolation {
  id: string;
  type: ViolationType;
  severity: ConstraintSeverity;
  message: string;
  guestIds: string[];
  tableIds: TableId[];
  constraintId: string | null;
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
  | { type: 'add_constraint'; constraint: ConstraintInput }
  | { type: 'remove_constraint'; constraintId: string }
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

export interface SeatPosition {
  tableId: TableId;
  seatIndex: number;
}
