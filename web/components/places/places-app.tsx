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
  getRoomSessionKey,
  importRoom,
  loadInitialRoom,
  ROOM_SESSION_KEY,
  selectItem,
  serializeRoom,
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

interface RoomHistory {
  past: RoomState[];
  future: RoomState[];
}

const HISTORY_LIMIT = 50;

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

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The selected file is not text.'));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('The selected file could not be read.'));
    reader.readAsText(file);
  });
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
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const historyRef = useRef<RoomHistory>({ past: [], future: [] });
  const sessionKeyRef = useRef(ROOM_SESSION_KEY);
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [restored, setRestored] = useState(false);
  const violations = useMemo(() => evaluateConstraints(state), [state]);
  const initialized = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fallbackSeed = window.crypto.getRandomValues(new Uint32Array(1))[0];
    let storedRoom: string | null = null;
    sessionKeyRef.current = getRoomSessionKey(window.location.search);
    try {
      storedRoom = window.sessionStorage.getItem(sessionKeyRef.current);
    } catch {
      // Storage can be disabled. The room remains usable for this page view.
    }
    const initialState = loadInitialRoom({
      search: window.location.search,
      storedRoom,
      fallbackSeed,
    });
    stateRef.current = initialState;
    dispatch({ type: 'replace', state: initialState });
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(
        sessionKeyRef.current,
        serializeRoom(state),
      );
    } catch {
      // A private browser may reject storage; commands still work in memory.
    }
  }, [restored, state]);

  const replaceState = useCallback(
    (nextState: RoomState, rememberCurrent: boolean) => {
      const currentState = stateRef.current;
      if (nextState === currentState) return;
      if (rememberCurrent) {
        historyRef.current = {
          past: [...historyRef.current.past, currentState].slice(
            -HISTORY_LIMIT,
          ),
          future: [],
        };
      }
      stateRef.current = nextState;
      dispatch({ type: 'replace', state: nextState });
      setHistoryAvailability({
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      });
    },
    [],
  );

  const runCommand = useCallback(
    (command: RoomCommand, actor: EventActor): CommandResult => {
      const outcome = executeCommand(stateRef.current, command, actor);
      replaceState(outcome.state, true);
      setNotice(outcome.result);
      return outcome.result;
    },
    [replaceState],
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
    const nextState = selectItem(stateRef.current, same ? null : selection);
    stateRef.current = nextState;
    dispatch({ type: 'replace', state: nextState });
  };

  const undo = useCallback(() => {
    const previous = historyRef.current.past.at(-1);
    if (!previous) return;
    historyRef.current = {
      past: historyRef.current.past.slice(0, -1),
      future: [stateRef.current, ...historyRef.current.future].slice(
        0,
        HISTORY_LIMIT,
      ),
    };
    stateRef.current = previous;
    dispatch({ type: 'replace', state: previous });
    setHistoryAvailability({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });
    setNotice({
      ok: true,
      code: 'undo',
      message: 'The last change was undone.',
    });
  }, []);

  const redo = useCallback(() => {
    const next = historyRef.current.future[0];
    if (!next) return;
    historyRef.current = {
      past: [...historyRef.current.past, stateRef.current].slice(
        -HISTORY_LIMIT,
      ),
      future: historyRef.current.future.slice(1),
    };
    stateRef.current = next;
    dispatch({ type: 'replace', state: next });
    setHistoryAvailability({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });
    setNotice({ ok: true, code: 'redo', message: 'The change was restored.' });
  }, []);

  useEffect(() => {
    const handleHistoryKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleHistoryKey);
    return () => window.removeEventListener('keydown', handleHistoryKey);
  }, [redo, undo]);

  const togglePin = (guestId: string) => {
    const pinned = stateRef.current.pinnedGuestIds.includes(guestId);
    runCommand(
      { type: pinned ? 'unpin_guest' : 'pin_guest', guestId },
      'human',
    );
  };

  const exportJson = () => {
    const payload = serializeRoom(stateRef.current);
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

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = importRoom(await readFileText(file));
      if (!imported.ok) {
        setNotice({
          ok: false,
          code: 'json_import_failed',
          message: imported.error,
        });
        return;
      }
      replaceState(imported.state, true);
      setNotice({
        ok: true,
        code: 'json_imported',
        message: 'The saved room was restored.',
      });
    } catch {
      setNotice({
        ok: false,
        code: 'json_import_failed',
        message: 'The selected file could not be read.',
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const exportPng = async () => {
    const source = svgRef.current;
    if (!source) {
      setNotice({
        ok: false,
        code: 'png_export_failed',
        message: 'The floorplan is not ready to export yet.',
      });
      return;
    }
    try {
      /* Height follows the viewBox so a future room shape cannot squash the
       * export into the wrong aspect ratio. */
      const view = source.viewBox.baseVal;
      const height =
        view.width > 0
          ? Math.round((view.height / view.width) * EXPORT_WIDTH)
          : EXPORT_HEIGHT;
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
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(scenarioSeed));
    window.history.replaceState(null, '', url);
    sessionKeyRef.current = getRoomSessionKey(url.search);
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
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label="Import room JSON"
            onChange={(event) => void importJson(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
          >
            <PixelIcon name="import" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPng()}>
            <PixelIcon name="png" /> PNG
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!historyAvailability.canUndo}
            onClick={undo}
            aria-label="Undo last change"
            title="Undo (Ctrl/⌘ Z)"
          >
            <PixelIcon name="undo" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!historyAvailability.canRedo}
            onClick={redo}
            aria-label="Redo change"
            title="Redo (Ctrl/⌘ Shift Z)"
          >
            <PixelIcon name="redo" />
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
            {state.timeline.length === 0 && (
              <li className="timeline-empty">No room activity yet.</li>
            )}
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
              You can undo the change afterward.
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
