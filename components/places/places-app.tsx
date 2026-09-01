'use client';

import {
  FileJson,
  ImageDown,
  Minus,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import NextImage from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { FloorPlan } from '@/components/places/floor-plan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  createInitialState,
  evaluateConstraints,
  executeCommand,
  getGuestSeat,
  getRoomSnapshot,
  selectItem,
  TABLE_IDS,
  type CommandResult,
  type EventActor,
  type RoomCommand,
  type RoomState,
  type Selection,
  type TableId,
} from '@/lib/places/domain';
import {
  registerContextTools,
  registerStableTools,
  type WebMcpStatus,
} from '@/lib/places/webmcp';

type AppAction =
  | { type: 'replace'; state: RoomState }
  | { type: 'select'; selection: Selection };

function appReducer(state: RoomState, action: AppAction): RoomState {
  if (action.type === 'replace') return action.state;
  return selectItem(state, action.selection);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const WEB_MCP_LABELS: Record<WebMcpStatus, string> = {
  unavailable: 'Browser tools unavailable',
  registering: 'Updating tools',
  ready: 'Agent ready',
  error: 'Tool registration error',
};

export function PlacesApp() {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    createInitialState,
  );
  const stateRef = useRef(state);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>('registering');
  const [notice, setNotice] = useState<CommandResult | null>(null);
  const violations = useMemo(() => evaluateConstraints(state), [state]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const runCommand = useCallback(
    (command: RoomCommand, actor: EventActor): CommandResult => {
      const outcome = executeCommand(stateRef.current, command, actor);
      stateRef.current = outcome.state;
      dispatch({ type: 'replace', state: outcome.state });
      setNotice(outcome.result);
      return outcome.result;
    },
    [],
  );

  const getCurrentState = useCallback(() => stateRef.current, []);

  useEffect(
    () =>
      registerStableTools({
        getState: getCurrentState,
        runCommand,
        setStatus: setWebMcpStatus,
      }),
    [getCurrentState, runCommand],
  );

  const contextKey = `${state.selection?.type ?? 'none'}:${state.selection?.id ?? ''}:${
    state.selection?.type === 'guest' &&
    state.pinnedGuestIds.includes(state.selection.id)
      ? 'pinned'
      : 'free'
  }:${violations.length > 0 ? 'violations' : 'clear'}`;

  useEffect(
    () =>
      registerContextTools({
        getState: getCurrentState,
        runCommand,
        setStatus: setWebMcpStatus,
      }),
    [contextKey, getCurrentState, runCommand],
  );

  const setSelection = (selection: Selection) => {
    const same =
      state.selection?.type === selection?.type &&
      state.selection?.id === selection?.id;
    dispatch({ type: 'select', selection: same ? null : selection });
  };

  const togglePin = (guestId: string) => {
    const pinned = stateRef.current.pinnedGuestIds.includes(guestId);
    runCommand(
      { type: pinned ? 'unpin_guest' : 'pin_guest', guestId },
      'human',
    );
  };

  const exportJson = () => {
    const payload = JSON.stringify(getRoomSnapshot(stateRef.current), null, 2);
    downloadBlob(
      new Blob([payload], { type: 'application/json' }),
      'orchard-house-seating.json',
    );
    setNotice({
      ok: true,
      code: 'json_exported',
      message: 'The room was exported as JSON.',
    });
  };

  const exportPng = async () => {
    const source = svgRef.current;
    if (!source) return;
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '1200');
    clone.setAttribute('height', '960');
    clone.querySelectorAll('image').forEach((image) => {
      const href = image.getAttribute('href');
      if (href?.startsWith('/'))
        image.setAttribute('href', `${window.location.origin}${href}`);
    });
    const css = [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join('\n');
    const style = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'style',
    );
    style.textContent = css;
    clone.insertBefore(style as unknown as Node, clone.firstChild);
    const markup = new XMLSerializer().serializeToString(clone);
    const imageUrl = URL.createObjectURL(
      new Blob([markup], { type: 'image/svg+xml' }),
    );
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 960;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#1b0d06';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, 'orchard-house-floorplan.png');
        URL.revokeObjectURL(imageUrl);
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      setNotice({
        ok: false,
        code: 'png_export_failed',
        message: 'The PNG export could not be created.',
      });
    };
    image.src = imageUrl;
  };

  const addGuest = () => {
    const name = window.prompt(
      'What is the guest’s name?',
      `Late Guest ${stateRef.current.nextGuestNumber}`,
    );
    if (name === null) return;
    runCommand({ type: 'add_guest', name }, 'human');
  };

  const resetSeed = () => {
    if (
      window.confirm(
        'Reset every seat, pin, and timeline event to the Orchard House seed?',
      )
    ) {
      runCommand({ type: 'reset_seed' }, 'human');
    }
  };

  const selectedGuest =
    state.selection?.type === 'guest' ? state.guests[state.selection.id] : null;
  const selectedGuestSeat = selectedGuest
    ? getGuestSeat(state, selectedGuest.id)
    : null;
  const selectedTable =
    state.selection?.type === 'table' ? state.tables[state.selection.id] : null;
  const totalEmptySeats = TABLE_IDS.reduce((count, tableId) => {
    const table = state.tables[tableId];
    return (
      count +
      state.seats[tableId]
        .slice(0, table.capacity)
        .filter((seat) => seat === null).length
    );
  }, 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Pin size={18} />
          </span>
          <div>
            <h1>Places</h1>
            <p>
              Orchard House <span>·</span> Saturday
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Badge
            variant="outline"
            className={`agent-badge status-${webMcpStatus}`}
            title={
              webMcpStatus === 'unavailable'
                ? 'This browser does not expose document.modelContext. Human controls still work.'
                : undefined
            }
          >
            <Sparkles /> {WEB_MCP_LABELS[webMcpStatus]}
          </Badge>
          <Button variant="outline" size="sm" onClick={addGuest}>
            <Plus /> Add guest
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson}>
            <FileJson /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPng()}>
            <ImageDown /> PNG
          </Button>
          <Button variant="outline" size="sm" onClick={resetSeed}>
            <RotateCcw /> Reset seed
          </Button>
        </div>
      </header>

      <section className="workspace" aria-label="Seating workspace">
        <section className="room-card">
          <div className="room-heading">
            <div>
              <p className="eyebrow">Saturday dinner</p>
              <h2>
                {violations.length === 0
                  ? 'The room is in balance.'
                  : 'The room needs a hand.'}
              </h2>
            </div>
            <p className="instruction">
              <Pin size={13} /> Select or drag a guest. Press P to pin.
            </p>
          </div>
          <div className="floor-wrap">
            <FloorPlan
              state={state}
              violations={violations}
              svgRef={svgRef}
              onSelectGuest={(guestId) =>
                setSelection({ type: 'guest', id: guestId })
              }
              onSelectTable={(tableId) =>
                setSelection({ type: 'table', id: tableId })
              }
              onMoveGuest={(guestId, tableId) =>
                runCommand({ type: 'move_guest', guestId, tableId }, 'human')
              }
              onTogglePin={togglePin}
            />
          </div>
          {notice && (
            <output
              className={`room-notice ${notice.ok ? 'is-success' : 'is-error'}`}
              aria-live="polite"
            >
              {notice.message}
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss message"
              >
                <X size={13} />
              </button>
            </output>
          )}
        </section>

        <aside
          className="timeline-card"
          aria-label="Room controls and activity timeline"
        >
          <div className="timeline-heading">
            <div>
              <p className="eyebrow">Shared history</p>
              <h2>Timeline</h2>
            </div>
            <span className="live-dot" aria-label="Live" />
          </div>

          <section className="selection-card" aria-label="Current selection">
            {selectedGuest ? (
              <GuestControls
                state={state}
                guestId={selectedGuest.id}
                currentTableId={selectedGuestSeat?.tableId ?? null}
                onCommand={(command) => runCommand(command, 'human')}
                onClose={() => setSelection(null)}
              />
            ) : selectedTable ? (
              <TableControls
                state={state}
                tableId={selectedTable.id}
                onCommand={(command) => runCommand(command, 'human')}
                onClose={() => setSelection(null)}
              />
            ) : (
              <div className="selection-empty">
                <span className="selection-icon">
                  <Pin size={16} />
                </span>
                <div>
                  <strong>Select a guest or table</strong>
                  <p>The agent’s available tools follow your selection.</p>
                </div>
              </div>
            )}
          </section>

          {violations.length > 0 && (
            <section className="violations-panel" aria-label="Open violations">
              <div className="violations-title">
                <strong>
                  {violations.length} open{' '}
                  {violations.length === 1 ? 'violation' : 'violations'}
                </strong>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() =>
                    runCommand({ type: 'fix_violations' }, 'human')
                  }
                >
                  <WandSparkles /> Fix
                </Button>
              </div>
              {violations.slice(0, 2).map((violation) => (
                <p key={violation.id}>{violation.message}</p>
              ))}
            </section>
          )}

          <ol className="timeline-list">
            {state.timeline.slice(0, 5).map((event) => (
              <li
                key={event.id}
                className={`timeline-item ${event.actor}-event`}
              >
                <span className="event-dot" />
                <div>
                  <strong>{event.message}</strong>
                  <p>{event.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div
            className={`status-card ${violations.length > 0 ? 'has-violations' : ''}`}
          >
            <span className="status-zero">{violations.length}</span>
            <div>
              <strong>
                {violations.length === 1 ? 'violation' : 'violations'}
              </strong>
              <p>
                {state.pinnedGuestIds.length}{' '}
                {state.pinnedGuestIds.length === 1 ? 'pin' : 'pins'} ·{' '}
                {totalEmptySeats} empty seats
              </p>
            </div>
          </div>
          <blockquote>“One state. Two hands.”</blockquote>
        </aside>
      </section>
    </main>
  );
}

interface GuestControlsProps {
  state: RoomState;
  guestId: string;
  currentTableId: TableId | null;
  onCommand: (command: RoomCommand) => void;
  onClose: () => void;
}

function GuestControls({
  state,
  guestId,
  currentTableId,
  onCommand,
  onClose,
}: GuestControlsProps) {
  const guest = state.guests[guestId];
  const pinned = state.pinnedGuestIds.includes(guestId);
  return (
    <>
      <div className="selection-title">
        <div className="selection-person">
          {guest.generated ? (
            <span className="portrait-placeholder">
              {guest.name.slice(0, 2).toUpperCase()}
            </span>
          ) : (
            <NextImage
              src={`/cast/${guest.id}-front.png`}
              alt=""
              width={27}
              height={48}
              unoptimized
            />
          )}
          <div>
            <strong>{guest.name}</strong>
            <p>{guest.note}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Clear selection">
          <X size={14} />
        </button>
      </div>
      <div className="tag-row">
        {guest.tags.map((tag) => (
          <span key={tag}>{tag.replace('_', ' ')}</span>
        ))}
        {pinned && <span className="pin-tag">pinned</span>}
      </div>
      <Button
        variant={pinned ? 'outline' : 'default'}
        size="sm"
        className="pin-action"
        onClick={() =>
          onCommand({ type: pinned ? 'unpin_guest' : 'pin_guest', guestId })
        }
      >
        {pinned ? <PinOff /> : <Pin />}
        {pinned ? 'Unpin guest' : 'Pin this seat'}
      </Button>
      <div className="move-row" aria-label={`Move ${guest.name} to a table`}>
        <span>Move to</span>
        {TABLE_IDS.map((tableId) => (
          <Button
            key={tableId}
            variant="outline"
            size="icon-xs"
            disabled={pinned || currentTableId === tableId}
            onClick={() => onCommand({ type: 'move_guest', guestId, tableId })}
            aria-label={`Move ${guest.name} to ${state.tables[tableId].label}`}
          >
            {tableId.slice(-1)}
          </Button>
        ))}
      </div>
    </>
  );
}

interface TableControlsProps {
  state: RoomState;
  tableId: TableId;
  onCommand: (command: RoomCommand) => void;
  onClose: () => void;
}

function TableControls({
  state,
  tableId,
  onCommand,
  onClose,
}: TableControlsProps) {
  const table = state.tables[tableId];
  const seated = state.seats[tableId]
    .slice(0, table.capacity)
    .filter(Boolean).length;
  return (
    <>
      <div className="selection-title">
        <div>
          <strong>{table.label}</strong>
          <p>
            {seated} seated ·{' '}
            {table.zones.length > 0 ? table.zones.join(' · ') : 'center room'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Clear selection">
          <X size={14} />
        </button>
      </div>
      <div className="stepper-row">
        <span>Capacity</span>
        <div>
          <Button
            size="icon-xs"
            variant="outline"
            disabled={table.capacity <= 2}
            onClick={() =>
              onCommand({
                type: 'set_capacity',
                tableId,
                capacity: table.capacity - 1,
              })
            }
          >
            <Minus />
          </Button>
          <strong>{table.capacity}</strong>
          <Button
            size="icon-xs"
            variant="outline"
            disabled={table.capacity >= 6}
            onClick={() =>
              onCommand({
                type: 'set_capacity',
                tableId,
                capacity: table.capacity + 1,
              })
            }
          >
            <Plus />
          </Button>
        </div>
      </div>
      <div className="stepper-row">
        <span>Hold empty</span>
        <div>
          <Button
            size="icon-xs"
            variant="outline"
            disabled={table.reservedEmptySeats <= 0}
            onClick={() =>
              onCommand({
                type: 'leave_empty_seats',
                tableId,
                count: table.reservedEmptySeats - 1,
              })
            }
          >
            <Minus />
          </Button>
          <strong>{table.reservedEmptySeats}</strong>
          <Button
            size="icon-xs"
            variant="outline"
            disabled={table.reservedEmptySeats >= table.capacity}
            onClick={() =>
              onCommand({
                type: 'leave_empty_seats',
                tableId,
                count: table.reservedEmptySeats + 1,
              })
            }
          >
            <Plus />
          </Button>
        </div>
      </div>
    </>
  );
}
