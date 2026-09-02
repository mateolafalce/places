'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG groups are the interactive floorplan controls. */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import {
  getGuestSeat,
  TABLE_IDS,
  type ConstraintViolation,
  type RoomState,
  type TableId,
} from '@/lib/places';

const SEAT_OFFSETS = [
  { x: 0, y: -86, labelPlacement: 'above' },
  { x: 72, y: -43, labelPlacement: 'above' },
  { x: 72, y: 43, labelPlacement: 'below' },
  { x: 0, y: 86, labelPlacement: 'below' },
  { x: -72, y: 43, labelPlacement: 'below' },
  { x: -72, y: -43, labelPlacement: 'above' },
] as const;

/* A 9x9 wheelchair sprite. The old marker was the ♿ character, which the
 * system font drew smooth and full-colour in the middle of pixel art. */
const ACCESSIBLE_SPRITE =
  'M3 0h1v1h-1zM4 0h1v1h-1zM3 1h1v1h-1zM4 1h1v1h-1zM2 3h1v1h-1zM3 3h1v1h-1zM4 3h1v1h-1zM5 3h1v1h-1zM6 3h1v1h-1zM2 4h1v1h-1zM6 4h1v1h-1zM1 5h1v1h-1zM7 5h1v1h-1zM1 6h1v1h-1zM4 6h1v1h-1zM7 6h1v1h-1zM1 7h1v1h-1zM7 7h1v1h-1zM2 8h1v1h-1zM3 8h1v1h-1zM4 8h1v1h-1zM5 8h1v1h-1zM6 8h1v1h-1z';

/* Guests glance over their shoulder now and then: one turns their back for a
 * beat, then faces the table again. Each guest keeps their own timer, so the
 * room never turns in unison. */
const TURN_DELAY_MIN_MS = 0;
const TURN_DELAY_MAX_MS = 120_000;
const TURN_DURATION_MS = 1_000;

const NO_TURNED_GUESTS: ReadonlySet<string> = new Set();

type Facing = 'front' | 'back';

function castSprite(guestId: string, facing: Facing): string {
  return `/cast/${guestId}-${facing}.png`;
}

/* The set of guests currently showing their back. Guests without cast art are
 * not passed in: they are drawn as initials and have nothing to turn. */
function useTurnedGuests(guestIds: string[]): ReadonlySet<string> {
  const [turned, setTurned] = useState(NO_TURNED_GUESTS);
  /* The roster matters only as a value, and sorted: a fresh array every render
   * -- or a reseated guest -- would otherwise restart everybody's timer. */
  const roster = [...guestIds].sort().join(' ');

  useEffect(() => {
    const ids = roster.split(' ').filter(Boolean);
    if (ids.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /* The back sprite must be in cache before the turn, or the guest blinks
     * out of the room for as long as that first fetch takes. */
    for (const guestId of ids) {
      const preload = new Image();
      preload.src = castSprite(guestId, 'back');
    }

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (delay: number, run: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, delay);
      timers.add(timer);
    };
    const setFacing = (guestId: string, facingBack: boolean) =>
      setTurned((current) => {
        const next = new Set(current);
        if (facingBack) next.add(guestId);
        else next.delete(guestId);
        return next;
      });
    const scheduleTurn = (guestId: string) => {
      const delay =
        TURN_DELAY_MIN_MS +
        Math.random() * (TURN_DELAY_MAX_MS - TURN_DELAY_MIN_MS);
      after(delay, () => {
        setFacing(guestId, true);
        after(TURN_DURATION_MS, () => {
          setFacing(guestId, false);
          scheduleTurn(guestId);
        });
      });
    };

    for (const guestId of ids) scheduleTurn(guestId);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      setTurned(NO_TURNED_GUESTS);
    };
  }, [roster]);

  return turned;
}

/* Pointer travel that separates a click from a drag, and how close to a table
 * centre the pointer must be for that table to accept the drop. */
const DRAG_THRESHOLD = 8;
const DROP_RADIUS = 120;

/* The live drag: where the pointer is in floorplan coordinates, and the table
 * that would receive the guest if it were released now. */
interface DragState {
  guestId: string;
  x: number;
  y: number;
  tableId: TableId | null;
  blocked: boolean;
  moved: boolean;
}

interface GuestSpriteProps {
  guest: RoomState['guests'][string];
  guestId: string;
  x: number;
  y: number;
  facing: Facing;
}

/* Shared by the seated guest and by the ghost that follows the cursor. */
function GuestSprite({ guest, guestId, x, y, facing }: GuestSpriteProps) {
  if (guest.generated) {
    return (
      <g className="generated-avatar guest-sprite">
        <rect x={x - 16} y={y - 16} width="32" height="32" />
        <text x={x} y={y + 4} textAnchor="middle">
          {initials(guest.name)}
        </text>
      </g>
    );
  }
  return (
    <image
      href={castSprite(guestId, facing)}
      className="guest-sprite"
      x={x - 18}
      y={y - 32}
      width="36"
      height="64"
      imageRendering="pixelated"
    />
  );
}

interface FloorPlanProps {
  state: RoomState;
  violations: ConstraintViolation[];
  svgRef: RefObject<SVGSVGElement | null>;
  onSelectGuest: (guestId: string) => void;
  onSelectTable: (tableId: TableId) => void;
  onMoveGuest: (guestId: string, tableId: TableId) => void;
  onTogglePin: (guestId: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function FloorPlan({
  state,
  violations,
  svgRef,
  onSelectGuest,
  onSelectTable,
  onMoveGuest,
  onTogglePin,
}: FloorPlanProps) {
  const dragOrigin = useRef<{
    guestId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  /* A drop ends with a click event on whatever sits under the pointer. That
   * click must not re-select or reselect anything behind the guest. */
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const selectedGuestId =
    state.selection?.type === 'guest' ? state.selection.id : null;
  const selectedTableId =
    state.selection?.type === 'table' ? state.selection.id : null;
  const violationGuestIds = new Set(
    violations.flatMap((violation) => violation.guestIds),
  );
  const violationTableIds = new Set(
    violations.flatMap((violation) => violation.tableIds),
  );
  const turnedGuestIds = useTurnedGuests(
    TABLE_IDS.flatMap((tableId) =>
      state.seats[tableId].filter(
        (guestId): guestId is string =>
          guestId !== null && !state.guests[guestId]?.generated,
      ),
    ),
  );
  const facingOf = (guestId: string): Facing =>
    turnedGuestIds.has(guestId) ? 'back' : 'front';

  const toLocalPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(matrix.inverse());
  };

  /* The nearest table within reach, ignoring the one the guest already sits
   * at: releasing over its own table is a cancelled drag, not a move. */
  const dropTargetFor = (guestId: string, local: { x: number; y: number }) => {
    const nearest = TABLE_IDS.map((tableId) => ({
      tableId,
      distance: Math.hypot(
        local.x - state.tables[tableId].x,
        local.y - state.tables[tableId].y,
      ),
    })).sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > DROP_RADIUS) return null;
    if (getGuestSeat(state, guestId)?.tableId === nearest.tableId) return null;
    return nearest.tableId;
  };

  /* Previews the outcome while the pointer is still down. The drop is still
   * dispatched when blocked, so the room explains why it was refused. */
  const isDropBlocked = (guestId: string, tableId: TableId) => {
    if (state.pinnedGuestIds.includes(guestId)) return true;
    const table = state.tables[tableId];
    return !state.seats[tableId].some(
      (occupant, index) => index < table.capacity && occupant === null,
    );
  };

  const cancelDrag = () => {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setDrag(null);
    const svg = svgRef.current;
    if (origin && svg?.hasPointerCapture(origin.pointerId))
      svg.releasePointerCapture(origin.pointerId);
  };

  const updateDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const local = toLocalPoint(event.clientX, event.clientY);
    if (!local) return;
    const moved =
      Math.hypot(
        event.clientX - origin.clientX,
        event.clientY - origin.clientY,
      ) >= DRAG_THRESHOLD;
    const tableId = moved ? dropTargetFor(origin.guestId, local) : null;
    setDrag({
      guestId: origin.guestId,
      x: local.x,
      y: local.y,
      tableId,
      blocked: tableId !== null && isDropBlocked(origin.guestId, tableId),
      moved,
    });
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const origin = dragOrigin.current;
    cancelDrag();
    if (!origin) return;

    const distance = Math.hypot(
      event.clientX - origin.clientX,
      event.clientY - origin.clientY,
    );
    if (distance < DRAG_THRESHOLD) {
      onSelectGuest(origin.guestId);
      return;
    }

    suppressClick.current = true;
    const local = toLocalPoint(event.clientX, event.clientY);
    const tableId = local ? dropTargetFor(origin.guestId, local) : null;
    if (tableId) onMoveGuest(origin.guestId, tableId);
  };

  /* Escape returns the guest to its seat, the way every drag surface does. */
  const isDragging = drag !== null;
  useEffect(() => {
    if (!isDragging) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const origin = dragOrigin.current;
      dragOrigin.current = null;
      setDrag(null);
      const svg = svgRef.current;
      if (origin && svg?.hasPointerCapture(origin.pointerId))
        svg.releasePointerCapture(origin.pointerId);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isDragging, svgRef]);

  return (
    <svg
      ref={svgRef}
      className={`floor-plan ${drag?.moved ? 'is-dragging' : ''} ${
        drag?.blocked ? 'is-drop-blocked' : ''
      }`}
      viewBox="0 0 760 608"
      role="img"
      aria-label="Interactive Orchard House floorplan with guests at four tables"
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    >
      <defs>
        {/* Doubled stops give hard bands: sprite shading, not an airbrush. */}
        <radialGradient id="tableWood" cx="46%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#9c5c24" />
          <stop offset="34%" stopColor="#9c5c24" />
          <stop offset="34%" stopColor="#7f4a1b" />
          <stop offset="62%" stopColor="#7f4a1b" />
          <stop offset="62%" stopColor="#65390f" />
          <stop offset="84%" stopColor="#65390f" />
          <stop offset="84%" stopColor="#4a280c" />
          <stop offset="100%" stopColor="#4a280c" />
        </radialGradient>
        <radialGradient id="candleGlow">
          <stop offset="0%" stopColor="#ffe6a2" stopOpacity=".6" />
          <stop offset="34%" stopColor="#ffe6a2" stopOpacity=".6" />
          <stop offset="34%" stopColor="#ffc65a" stopOpacity=".28" />
          <stop offset="66%" stopColor="#ffc65a" stopOpacity=".28" />
          <stop offset="66%" stopColor="#e79225" stopOpacity=".1" />
          <stop offset="100%" stopColor="#e79225" stopOpacity=".1" />
        </radialGradient>
        <linearGradient id="numberDisc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8bb68" />
          <stop offset="50%" stopColor="#e8bb68" />
          <stop offset="50%" stopColor="#b3701f" />
          <stop offset="100%" stopColor="#b3701f" />
        </linearGradient>
        <filter id="tableShadow" x="-30%" y="-30%" width="160%" height="160%">
          {/* stdDeviation 0: an offset copy, the way a sprite casts shade. */}
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="0"
            floodColor="#0d0602"
            floodOpacity=".6"
          />
        </filter>
      </defs>

      <image
        href="/orchard-hall.png"
        x="0"
        y="0"
        width="760"
        height="608"
        preserveAspectRatio="none"
        className="room-background"
      />

      {TABLE_IDS.map((tableId) => {
        const table = state.tables[tableId];
        const position = state.tables[tableId];
        const selected = selectedTableId === tableId;
        const invalid = violationTableIds.has(tableId);
        const dropState =
          drag?.tableId === tableId
            ? drag.blocked
              ? 'is-drop-blocked'
              : 'is-drop-target'
            : '';
        return (
          <g
            key={tableId}
            className={`table-group ${selected ? 'is-selected' : ''} ${invalid ? 'has-violation' : ''} ${dropState}`}
            role="button"
            tabIndex={0}
            aria-label={`${table.label}, capacity ${table.capacity}`}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onSelectTable(tableId);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectTable(tableId);
              }
            }}
          >
            <circle
              cx={position.x}
              cy={position.y}
              r="70"
              className="table-glow"
            />
            <circle
              cx={position.x}
              cy={position.y}
              r="58"
              fill="url(#tableWood)"
              className="table"
              filter="url(#tableShadow)"
            />
            <circle
              cx={position.x}
              cy={position.y}
              r="46"
              className="table-inlay"
            />
            <circle
              cx={position.x}
              cy={position.y - 8}
              r="28"
              fill="url(#candleGlow)"
              className="candle-glow"
            />
            <circle
              cx={position.x}
              cy={position.y}
              r="17"
              fill="url(#numberDisc)"
              className="table-number-disc"
            />
            <text
              x={position.x}
              y={position.y + 5}
              textAnchor="middle"
              className="table-number"
            >
              {tableId.slice(-1)}
            </text>
            {table.reservedEmptySeats > 0 && (
              <text
                x={position.x}
                y={position.y + 30}
                textAnchor="middle"
                className="held-seat-count"
              >
                {table.reservedEmptySeats} held
              </text>
            )}

            {state.seats[tableId].map((guestId, index) => {
              const seat = SEAT_OFFSETS[index];
              const x = position.x + seat.x;
              const y = position.y + seat.y;
              if (index >= table.capacity) {
                return (
                  <g key={`closed-${tableId}-${index}`} className="closed-seat">
                    <rect x={x - 12} y={y - 12} width="24" height="24" />
                    <path
                      d={`M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`}
                    />
                  </g>
                );
              }
              if (!guestId) {
                return (
                  <text
                    key={`empty-${tableId}-${index}`}
                    x={x}
                    y={y + 4}
                    textAnchor="middle"
                    className="empty-seat"
                  >
                    empty
                  </text>
                );
              }

              const guest = state.guests[guestId];
              const isLabelAbove = seat.labelPlacement === 'above';
              const pinned = state.pinnedGuestIds.includes(guestId);
              const guestInvalid = violationGuestIds.has(guestId);
              const selectedGuest = selectedGuestId === guestId;
              const currentSeat = getGuestSeat(state, guestId);
              return (
                <g
                  key={guestId}
                  className={`guest ${pinned ? 'is-pinned' : ''} ${selectedGuest ? 'is-selected' : ''} ${guestInvalid ? 'has-violation' : ''} ${drag?.guestId === guestId ? 'is-dragging' : ''} ${drag?.moved && drag.guestId === guestId ? 'is-lifted' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${guest.name}, ${table.label}${pinned ? ', pinned' : ''}`}
                  transform={selectedGuest ? `translate(0 -2)` : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onSelectGuest(guestId);
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse' && event.button !== 0)
                      return;
                    event.stopPropagation();
                    suppressClick.current = false;
                    dragOrigin.current = {
                      guestId,
                      pointerId: event.pointerId,
                      clientX: event.clientX,
                      clientY: event.clientY,
                    };
                    /* Capturing on the root keeps the drag alive when the
                     * pointer leaves the guest, the table or the floorplan. */
                    svgRef.current?.setPointerCapture(event.pointerId);
                    setDrag({
                      guestId,
                      x,
                      y,
                      tableId: null,
                      blocked: false,
                      moved: false,
                    });
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectGuest(guestId);
                    }
                    if (event.key.toLowerCase() === 'p') onTogglePin(guestId);
                  }}
                >
                  {/* Transparent hit area: the sprite itself ignores pointer
                   * events, so without this the character body is not
                   * hoverable, clickable or draggable. */}
                  <rect
                    x={x - 19}
                    y={y - 34}
                    width="38"
                    height="68"
                    className="guest-hit"
                  />
                  {selectedGuest && (
                    <rect
                      x={x - 21}
                      y={y - 35}
                      width="42"
                      height="70"
                      className="guest-selection"
                    />
                  )}
                  {guestInvalid && (
                    <rect
                      x={x - 25}
                      y={y - 39}
                      width="50"
                      height="78"
                      className="guest-violation"
                    />
                  )}
                  <GuestSprite
                    guest={guest}
                    guestId={guestId}
                    x={x}
                    y={y}
                    facing={facingOf(guestId)}
                  />
                  <text
                    x={x}
                    y={isLabelAbove ? y - 39 : y + 44}
                    textAnchor="middle"
                    className="guest-name"
                  >
                    {guest.name}
                  </text>
                  {pinned && (
                    <g
                      transform={`translate(${x + 16} ${y - 29})`}
                      className="guest-pin"
                    >
                      <rect
                        x="-8"
                        y="-8"
                        width="16"
                        height="16"
                        className="pin-head"
                      />
                      <rect
                        x="-5"
                        y="-5"
                        width="4"
                        height="4"
                        className="pin-shine"
                      />
                    </g>
                  )}
                  {currentSeat?.seatIndex === 4 &&
                    guest.tags.includes('wheelchair') && (
                      <g
                        className="accessible-mark"
                        transform={`translate(${x - 30} ${y - 6}) scale(1.4)`}
                      >
                        <rect x="-1" y="-1" width="11" height="11" />
                        <path d={ACCESSIBLE_SPRITE} />
                      </g>
                    )}
                </g>
              );
            })}
            {tableId === 'table-4' && (
              <text
                x={position.x}
                y={position.y + 113}
                textAnchor="middle"
                className="zone-note"
              >
                kids · kitchen
              </text>
            )}
          </g>
        );
      })}

      {/* The dragged copy rides above every table and never takes the pointer,
       * so the table under it stays the drop target. */}
      {drag?.moved && state.guests[drag.guestId] && (
        <g
          className={`drag-ghost ${drag.tableId ? 'is-over-table' : ''} ${
            drag.blocked ? 'is-blocked' : ''
          }`}
          transform={`translate(${drag.x} ${drag.y})`}
          aria-hidden="true"
        >
          <ellipse
            className="drag-ghost-shadow"
            cx="0"
            cy="36"
            rx="17"
            ry="5"
          />
          <GuestSprite
            guest={state.guests[drag.guestId]}
            guestId={drag.guestId}
            x={0}
            y={0}
            facing={facingOf(drag.guestId)}
          />
          <text className="guest-name" x="0" y="-40" textAnchor="middle">
            {state.guests[drag.guestId].name}
          </text>
        </g>
      )}
    </svg>
  );
}
