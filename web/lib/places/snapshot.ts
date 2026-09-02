import { constraintsForGuest, evaluateConstraints } from './constraints';
import { getGuestSeat, isAccessibleSeat } from './seating';
import { TABLE_IDS, type RoomState } from './types';

/* The read model an agent or the UI sees. Rules travel as the same records
 * that the solver reads, so what an agent is told is what is enforced. */
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
            guest: guestId ? (state.guests[guestId] ?? null) : null,
            pinned: guestId ? state.pinnedGuestIds.includes(guestId) : false,
            accessible: isAccessibleSeat(seatIndex),
          })),
      };
    }),
    constraints: state.constraints,
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
    rules: constraintsForGuest(state, guestId),
    activeViolations: evaluateConstraints(state).filter((violation) =>
      violation.guestIds.includes(guestId),
    ),
    explanation: guest.note,
  };
}
