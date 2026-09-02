'use client';

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
import { PixelIcon } from '@/components/places/pixel-icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/lib/places';
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
  /* Some browsers cancel a download whose blob URL is revoked in the same
   * task as the click, so let the click settle first. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const EXPORT_WIDTH = 1200;
const EXPORT_HEIGHT = 960;
const FONT_URL_PATTERN =
  /url\(\s*(['"]?)([^'")]+\.(?:woff2?|ttf|otf))\1\s*\)/gi;

/* An SVG rasterised through an <img> renders with every external fetch
 * blocked: the hall art, the cast sprites and the pixel faces only reach the
 * canvas if they travel inside the markup, so each one is read back as a data
 * URI before the clone is serialised. */
async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error(`Could not read ${url}`));
    reader.readAsDataURL(blob);
  });
}

/* One asset that fails to inline costs its own sprite, not the whole export,
 * so misses are dropped from the map and the original href is left alone. */
async function inlineAssets(hrefs: string[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    [...new Set(hrefs)].map(async (href) => {
      try {
        const absolute = new URL(href, window.location.href).href;
        return [href, await toDataUrl(absolute)] as const;
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

async function inlineFontFaces(css: string): Promise<string> {
  const hrefs = [...css.matchAll(FONT_URL_PATTERN)].map((match) => match[2]);
  if (hrefs.length === 0) return css;
  const inlined = await inlineAssets(hrefs);
  return css.replace(
    FONT_URL_PATTERN,
    (whole: string, _quote: string, href: string) => {
      const data = inlined.get(href);
      return data ? `url("${data}")` : whole;
    },
  );
}

function collectStyleRules(): string {
  return [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join('\n');
}

function rasterize(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    /* The clone carries its own width and height, so the <img> takes its
     * intrinsic size from the markup. */
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('The floorplan could not be drawn.'));
    image.src = url;
  });
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
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestNameDraft, setGuestNameDraft] = useState('');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const guestNameInputRef = useRef<HTMLInputElement | null>(null);
  const violations = useMemo(() => evaluateConstraints(state), [state]);
  const randomizedInitialState = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (randomizedInitialState.current) return;
    randomizedInitialState.current = true;
    const seed = window.crypto.getRandomValues(new Uint32Array(1))[0];
    const initialState = createInitialState(seed);
    stateRef.current = initialState;
    dispatch({ type: 'replace', state: initialState });
  }, []);

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
    /* Height follows the viewBox so a future room shape cannot squash the
     * export into the wrong aspect ratio. */
    const view = source.viewBox.baseVal;
    const height =
      view.width > 0
        ? Math.round((view.height / view.width) * EXPORT_WIDTH)
        : EXPORT_HEIGHT;
    try {
      const clone = source.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(EXPORT_WIDTH));
      clone.setAttribute('height', String(height));

      const images = [...clone.querySelectorAll('image')];
      const inlined = await inlineAssets(
        images
          .map((image) => image.getAttribute('href') ?? '')
          .filter((href) => href !== '' && !href.startsWith('data:')),
      );
      images.forEach((image) => {
        const data = inlined.get(image.getAttribute('href') ?? '');
        if (data) image.setAttribute('href', data);
      });

      const style = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'style',
      );
      style.textContent = await inlineFontFaces(collectStyleRules());
      clone.insertBefore(style as unknown as Node, clone.firstChild);

      const markup = new XMLSerializer().serializeToString(clone);
      const imageUrl = URL.createObjectURL(
        new Blob([markup], { type: 'image/svg+xml' }),
      );
      try {
        const image = await rasterize(imageUrl);
        const canvas = document.createElement('canvas');
        canvas.width = EXPORT_WIDTH;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This browser has no 2D canvas.');
        context.fillStyle = '#1b0d06';
        context.fillRect(0, 0, canvas.width, canvas.height);
        /* Pixel art must not be resampled on the way to the canvas. */
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
        if (!blob) throw new Error('The PNG came back empty.');
        downloadBlob(blob, 'orchard-house-floorplan.png');
        setNotice({
          ok: true,
          code: 'png_exported',
          message: 'The room was exported as a PNG.',
        });
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    } catch {
      setNotice({
        ok: false,
        code: 'png_export_failed',
        message: 'The PNG export could not be created.',
      });
    }
  };

  const addGuest = () => {
    setGuestNameDraft(`Late Guest ${stateRef.current.nextGuestNumber}`);
    setGuestDialogOpen(true);
  };

  const confirmAddGuest = () => {
    setGuestDialogOpen(false);
    runCommand({ type: 'add_guest', name: guestNameDraft }, 'human');
  };

  const confirmResetSeed = () => {
    setResetDialogOpen(false);
    const scenarioSeed = window.crypto.getRandomValues(new Uint32Array(1))[0];
    runCommand({ type: 'reset_seed', scenarioSeed }, 'human');
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
            <PixelIcon name="pin" size={18} />
          </span>
          <div>
            <h1>Places</h1>
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
            <PixelIcon name="sparkle" /> {WEB_MCP_LABELS[webMcpStatus]}
          </Badge>
          <Button variant="outline" size="sm" onClick={addGuest}>
            <PixelIcon name="plus" /> Add guest
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson}>
            <PixelIcon name="json" /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPng()}>
            <PixelIcon name="png" /> PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetDialogOpen(true)}
          >
            <PixelIcon name="reroll" /> New challenge
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
              <PixelIcon name="pin" size={13} /> Select or drag a guest. Press P
              to pin.
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
                <PixelIcon name="close" size={13} />
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
                  <PixelIcon name="pin" size={16} />
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
                  <PixelIcon name="wand" /> Fix
                </Button>
              </div>
              {violations.slice(0, 2).map((violation) => (
                <p key={violation.id}>{violation.message}</p>
              ))}
            </section>
          )}

          <ol className="timeline-list">
            {state.timeline.slice(0, 8).map((event) => (
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

      <Dialog open={guestDialogOpen} onOpenChange={setGuestDialogOpen}>
        <DialogContent initialFocus={guestNameInputRef}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              confirmAddGuest();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a guest</DialogTitle>
              <DialogDescription>
                They take the first open seat in the room.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-guest-name">Guest name</Label>
              <Input
                id="new-guest-name"
                value={guestNameDraft}
                onChange={(event) => setGuestNameDraft(event.target.value)}
                ref={guestNameInputRef}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit">Add guest</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              This deals a different missing guest and a new seating problem.
              The current room is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetSeed}>
              New challenge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          <PixelIcon name="close" size={14} />
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
        <PixelIcon name={pinned ? 'pin-off' : 'pin'} />
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
          <PixelIcon name="close" size={14} />
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
            <PixelIcon name="minus" />
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
            <PixelIcon name="plus" />
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
            <PixelIcon name="minus" />
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
            <PixelIcon name="plus" />
          </Button>
        </div>
      </div>
    </>
  );
}
