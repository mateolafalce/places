import type {
  Guest,
  RoomState,
  RoomTable,
  SeatingConstraint,
  TableId,
} from './types';

export interface InitialScenario {
  id: string;
  absentGuestId: string;
  swaps: Array<[string, string]>;
  detail: string;
}

export const GUEST_LIST: Guest[] = [
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

export const TABLES: Record<TableId, RoomTable> = {
  'table-1': {
    id: 'table-1',
    label: 'Table 1',
    capacity: 6,
    reservedEmptySeats: 0,
    x: 264,
    y: 191,
    zones: ['window'],
  },
  'table-2': {
    id: 'table-2',
    label: 'Table 2',
    capacity: 6,
    reservedEmptySeats: 1,
    x: 490,
    y: 191,
    zones: [],
  },
  'table-3': {
    id: 'table-3',
    label: 'Table 3',
    capacity: 6,
    reservedEmptySeats: 1,
    x: 264,
    y: 465,
    zones: ['door'],
  },
  'table-4': {
    id: 'table-4',
    label: 'Table 4',
    capacity: 6,
    reservedEmptySeats: 0,
    x: 490,
    y: 465,
    zones: ['kitchen'],
  },
};

export const INITIAL_SEATS: RoomState['seats'] = {
  'table-1': ['mabel', 'harold', 'ivy', 'jules', 'arthur', 'pearl'],
  'table-2': ['rex', 'kit', 'marlo', null, 'otis', 'willa'],
  'table-3': ['vivian', 'quinn', 'sable', null, 'felix', 'nora'],
  'table-4': ['pip', 'nell', 'theo', 'birdie', 'cal', 'dot'],
};

export const INITIAL_SCENARIOS: InitialScenario[] = [
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

/* The seed rules. Ids match the violation ids the UI has always shown, and
 * every rule is addressed by guest id, so it survives a guest being absent
 * and it can be joined by a guest added at runtime. */
export const SEED_CONSTRAINTS: SeatingConstraint[] = [
  {
    id: 'mabel-window',
    kind: 'prefer_zone',
    severity: 'preference',
    guestIds: ['mabel'],
    zone: 'window',
    message: 'Mabel wants the window table.',
  },
  {
    id: 'mabel-harold-together',
    kind: 'must_share_table',
    severity: 'hard',
    guestIds: ['mabel', 'harold'],
    message: 'Harold must sit with Mabel.',
  },
  {
    id: 'kit-otis-together',
    kind: 'must_share_table',
    severity: 'hard',
    guestIds: ['kit', 'otis'],
    message: 'Kit must sit with Otis.',
  },
  {
    id: 'rex-vivian-apart',
    kind: 'must_not_share_table',
    severity: 'hard',
    guestIds: ['rex', 'vivian'],
    message: 'Rex and Vivian cannot share a table.',
  },
  ...['pip', 'nell', 'theo', 'dot'].map((guestId): SeatingConstraint => ({
    id: `${guestId}-kitchen`,
    kind: 'prefer_zone',
    severity: 'preference',
    guestIds: [guestId],
    zone: 'kitchen',
  })),
  {
    id: 'arthur-accessible-seat',
    kind: 'require_accessible_seat',
    severity: 'hard',
    guestIds: ['arthur'],
    message: 'Arthur needs an accessible aisle seat.',
  },
];
