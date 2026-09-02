import {
  TABLE_IDS,
  type RoomState,
  type SeatPosition,
  type TableId,
} from './types';

/* Every table exposes one accessible aisle seat, at this index. */
export const ACCESSIBLE_SEAT_INDEX = 4;

export function isAccessibleSeat(seatIndex: number): boolean {
  return seatIndex === ACCESSIBLE_SEAT_INDEX;
}

export function cloneSeats(seats: RoomState['seats']): RoomState['seats'] {
  return Object.fromEntries(
    TABLE_IDS.map((tableId) => [tableId, [...seats[tableId]]]),
  ) as RoomState['seats'];
}

export function cloneTables(tables: RoomState['tables']): RoomState['tables'] {
  return Object.fromEntries(
    TABLE_IDS.map((tableId) => [
      tableId,
      { ...tables[tableId], zones: [...tables[tableId].zones] },
    ]),
  ) as RoomState['tables'];
}

export function seatEntries(seats: RoomState['seats']) {
  return TABLE_IDS.flatMap((tableId) =>
    seats[tableId].map((guestId, seatIndex) => ({
      guestId,
      seatIndex,
      tableId,
    })),
  );
}

export function findSeatIn(
  seats: RoomState['seats'],
  tables: RoomState['tables'],
  guestId: string,
): SeatPosition | null {
  for (const tableId of TABLE_IDS) {
    const seatIndex = seats[tableId].indexOf(guestId);
    if (seatIndex !== -1 && seatIndex < tables[tableId].capacity) {
      return { tableId, seatIndex };
    }
  }
  return null;
}

export function getGuestSeat(
  state: RoomState,
  guestId: string,
): SeatPosition | null {
  return findSeatIn(state.seats, state.tables, guestId);
}

export function swapGuestSeats(
  seats: RoomState['seats'],
  firstGuestId: string,
  secondGuestId: string,
) {
  const entries = seatEntries(seats);
  const first = entries.find((entry) => entry.guestId === firstGuestId);
  const second = entries.find((entry) => entry.guestId === secondGuestId);
  if (!first || !second) return;
  seats[first.tableId][first.seatIndex] = secondGuestId;
  seats[second.tableId][second.seatIndex] = firstGuestId;
}

export function activeSeatSlots(
  tables: RoomState['tables'],
): Array<{ tableId: TableId; seatIndex: number }> {
  return TABLE_IDS.flatMap((tableId) =>
    Array.from({ length: tables[tableId].capacity }, (_, seatIndex) => ({
      tableId,
      seatIndex,
    })),
  );
}

export function accessibleSeatCount(tables: RoomState['tables']): number {
  return TABLE_IDS.filter(
    (tableId) => tables[tableId].capacity > ACCESSIBLE_SEAT_INDEX,
  ).length;
}

export function countMovedSeats(
  before: RoomState['seats'],
  after: RoomState['seats'],
): number {
  return TABLE_IDS.reduce(
    (count, tableId) =>
      count +
      after[tableId].filter(
        (guestId, index) => guestId !== before[tableId][index],
      ).length,
    0,
  );
}
