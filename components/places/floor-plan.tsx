'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG groups are the interactive floorplan controls. */

import {
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
} from '@/lib/places/domain';

const SEAT_OFFSETS = [
  { x: 0, y: -86, labelPlacement: 'above' },
  { x: 72, y: -43, labelPlacement: 'above' },
  { x: 72, y: 43, labelPlacement: 'below' },
  { x: 0, y: 86, labelPlacement: 'below' },
  { x: -72, y: 43, labelPlacement: 'below' },
  { x: -72, y: -43, labelPlacement: 'above' },
] as const;

const TABLE_LAYOUT: Record<TableId, { x: number; y: number }> = {
  'table-1': { x: 264, y: 191 },
  'table-2': { x: 490, y: 191 },
  'table-3': { x: 264, y: 409 },
  'table-4': { x: 490, y: 409 },
};

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
  const dragStart = useRef<{
    guestId: string;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [draggingGuestId, setDraggingGuestId] = useState<string | null>(null);
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

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const started = dragStart.current;
    dragStart.current = null;
    setDraggingGuestId(null);
    if (!started) return;

    const distance = Math.hypot(
      event.clientX - started.clientX,
      event.clientY - started.clientY,
    );
    if (distance < 8) {
      onSelectGuest(started.guestId);
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    const target = TABLE_IDS.map((tableId) => {
      const table = TABLE_LAYOUT[tableId];
      return {
        tableId,
        distance: Math.hypot(local.x - table.x, local.y - table.y),
      };
    }).sort((a, b) => a.distance - b.distance)[0];
    if (target && target.distance < 120)
      onMoveGuest(started.guestId, target.tableId);
  };

  return (
    <svg
      ref={svgRef}
      className={`floor-plan ${draggingGuestId ? 'is-dragging' : ''}`}
      viewBox="0 0 760 608"
      role="img"
      aria-label="Interactive Orchard House floorplan with guests at four tables"
      onPointerUp={finishDrag}
      onPointerCancel={() => {
        dragStart.current = null;
        setDraggingGuestId(null);
      }}
      onPointerLeave={(event) => {
        if (dragStart.current && event.buttons === 0) finishDrag(event);
      }}
    >
      <defs>
        <radialGradient id="tableWood" cx="46%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#925521" />
          <stop offset="66%" stopColor="#704016" />
          <stop offset="100%" stopColor="#3f210d" />
        </radialGradient>
        <radialGradient id="candleGlow">
          <stop offset="0%" stopColor="#ffd879" stopOpacity=".72" />
          <stop offset="44%" stopColor="#e79225" stopOpacity=".22" />
          <stop offset="100%" stopColor="#e79225" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="numberDisc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dca956" />
          <stop offset="100%" stopColor="#9a5c24" />
        </linearGradient>
        <filter id="tableShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="5"
            stdDeviation="4"
            floodColor="#130803"
            floodOpacity=".58"
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
        const position = TABLE_LAYOUT[tableId];
        const selected = selectedTableId === tableId;
        const invalid = violationTableIds.has(tableId);
        return (
          <g
            key={tableId}
            className={`table-group ${selected ? 'is-selected' : ''} ${invalid ? 'has-violation' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${table.label}, capacity ${table.capacity}`}
            onClick={() => onSelectTable(tableId)}
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
                    <circle cx={x} cy={y} r="12" />
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
                  className={`guest ${pinned ? 'is-pinned' : ''} ${selectedGuest ? 'is-selected' : ''} ${guestInvalid ? 'has-violation' : ''} ${draggingGuestId === guestId ? 'is-dragging' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${guest.name}, ${table.label}${pinned ? ', pinned' : ''}`}
                  transform={selectedGuest ? `translate(0 -2)` : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectGuest(guestId);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragStart.current = {
                      guestId,
                      clientX: event.clientX,
                      clientY: event.clientY,
                    };
                    setDraggingGuestId(guestId);
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
                  {selectedGuest && (
                    <circle cx={x} cy={y} r="27" className="guest-selection" />
                  )}
                  {guestInvalid && (
                    <circle cx={x} cy={y} r="24" className="guest-violation" />
                  )}
                  {guest.generated ? (
                    <g className="generated-avatar">
                      <circle cx={x} cy={y} r="17" />
                      <text x={x} y={y + 4} textAnchor="middle">
                        {initials(guest.name)}
                      </text>
                    </g>
                  ) : (
                    <image
                      href={`/cast/${guestId}-front.png`}
                      x={x - 18}
                      y={y - 32}
                      width="36"
                      height="64"
                      imageRendering="pixelated"
                    />
                  )}
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
                      <circle r="8" className="pin-head" />
                      <circle cx="-2" cy="-2" r="2.5" className="pin-shine" />
                    </g>
                  )}
                  {currentSeat?.seatIndex === 4 &&
                    guest.tags.includes('wheelchair') && (
                      <text x={x - 23} y={y + 3} className="accessible-mark">
                        ♿
                      </text>
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
    </svg>
  );
}
