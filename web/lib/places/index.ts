/* The public surface of the seating domain. Each module owns one concern:
 * roster (seed data), seating (geometry), constraints (the rule model),
 * solver (search), commands (state transitions), room (lifecycle) and
 * snapshot (the read model). */
export {
  cloneConstraints,
  constraintsForGuest,
  evaluateConstraint,
  evaluateConstraints,
  normalizeConstraint,
  violationScore,
  type ConstraintValidation,
} from './constraints';
export { executeCommand } from './commands';
export {
  actorLabel,
  createInitialState,
  scenarioCount,
  selectItem,
  withEvent,
} from './room';
export { GUEST_LIST, SEED_CONSTRAINTS, TABLES } from './roster';
export {
  ACCESSIBLE_SEAT_INDEX,
  getGuestSeat,
  isAccessibleSeat,
} from './seating';
export { explainGuest, getRoomSnapshot } from './snapshot';
export {
  findInfeasibilities,
  reflowSeating,
  type ReflowResult,
  type ReflowStatus,
} from './solver';
export {
  CONSTRAINT_KINDS,
  ROOM_ZONES,
  TABLE_IDS,
  type CommandOutcome,
  type CommandResult,
  type ConstraintInput,
  type ConstraintKind,
  type ConstraintSeverity,
  type ConstraintViolation,
  type EventActor,
  type Guest,
  type GuestTag,
  type RoomCommand,
  type RoomState,
  type RoomTable,
  type RoomZone,
  type SeatingConstraint,
  type SeatPosition,
  type Selection,
  type TableId,
  type TimelineEvent,
  type ViolationType,
} from './types';
