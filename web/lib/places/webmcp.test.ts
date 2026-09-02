import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInitialState, executeCommand, type RoomState } from './index';
import {
  registerContextTools,
  registerStableTools,
  type WebMcpBridge,
  type WebMcpStatus,
} from './webmcp';

interface RegisteredTool {
  name: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown;
}

interface Registration {
  tool: RegisteredTool;
  signal?: AbortSignal;
}

function installModelContext() {
  const registrations: Registration[] = [];
  const registerTool = vi.fn(
    async (tool: RegisteredTool, options?: { signal?: AbortSignal }) => {
      registrations.push({ tool, signal: options?.signal });
    },
  );
  vi.stubGlobal('document', { modelContext: { registerTool } });
  return { registrations, registerTool };
}

function makeBridge(initialState = createInitialState(0)) {
  let state: RoomState = initialState;
  const statuses: WebMcpStatus[] = [];
  const bridge: WebMcpBridge = {
    getState: () => state,
    runCommand: (command, actor) => {
      const outcome = executeCommand(state, command, actor);
      state = outcome.state;
      return outcome.result;
    },
    setStatus: (status) => statuses.push(status),
  };
  return { bridge, statuses, getState: () => state };
}

async function registeredTools(registrations: Registration[]) {
  await vi.waitFor(() => expect(registrations.length).toBeGreaterThan(0));
  return new Map(registrations.map(({ tool }) => [tool.name, tool]));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('stable WebMCP contract', () => {
  it('registers stable tools with closed schemas and aborts them on cleanup', async () => {
    const { registrations } = installModelContext();
    const { bridge, statuses } = makeBridge();
    const cleanup = registerStableTools(bridge);
    const tools = await registeredTools(registrations);

    expect([...tools.keys()]).toEqual([
      'get_room_state',
      'list_violations',
      'explain_guest',
      'list_constraints',
      'add_constraint',
      'remove_constraint',
      'add_guest',
    ]);
    for (const tool of tools.values()) {
      expect(tool.inputSchema?.additionalProperties).toBe(false);
    }
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('ready'));

    cleanup();
    expect(registrations.every(({ signal }) => signal?.aborted)).toBe(true);
  });

  it('returns stable validation and domain error codes', async () => {
    const { registrations } = installModelContext();
    const { bridge, getState } = makeBridge();
    registerStableTools(bridge);
    const tools = await registeredTools(registrations);

    expect(tools.get('explain_guest')?.execute({ guestId: '' })).toMatchObject({
      ok: false,
      code: 'invalid_guest_id',
    });
    expect(
      tools.get('explain_guest')?.execute({ guestId: 'nobody' }),
    ).toMatchObject({ ok: false, code: 'guest_not_found' });
    expect(
      tools.get('add_constraint')?.execute({ kind: 'invented', guestIds: [] }),
    ).toMatchObject({ ok: false, code: 'invalid_constraint_kind' });
    expect(tools.get('remove_constraint')?.execute({})).toMatchObject({
      ok: false,
      code: 'invalid_constraint_id',
    });

    const added = tools
      .get('add_guest')
      ?.execute({ name: 'Rowan', tags: ['plus_one', 'invalid'] });
    expect(added).toMatchObject({ ok: true, code: 'guest_added' });
    expect(getState().guests.rowan.tags).toEqual(['plus_one']);
  });

  it('reports unavailable and registration-error states', async () => {
    vi.stubGlobal('document', {});
    const unavailable = makeBridge();
    registerStableTools(unavailable.bridge);
    expect(unavailable.statuses).toEqual(['unavailable']);

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.stubGlobal('document', {
      modelContext: {
        registerTool: vi.fn().mockRejectedValue(new Error('no')),
      },
    });
    const failed = makeBridge();
    registerStableTools(failed.bridge);
    await vi.waitFor(() => expect(failed.statuses.at(-1)).toBe('error'));
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe('context WebMCP contract', () => {
  it('changes table, guest and violation tools with the selection and pin', async () => {
    const tableContext = installModelContext();
    const tableState = createInitialState(0);
    tableState.selection = { type: 'table', id: 'table-2' };
    registerContextTools(makeBridge(tableState).bridge);
    const tableTools = await registeredTools(tableContext.registrations);
    expect([...tableTools.keys()]).toEqual([
      'seat_guest_here',
      'set_capacity',
      'leave_empty_seats',
      'fix_violations',
    ]);
    expect(
      tableTools.get('set_capacity')?.execute({ capacity: 3.5 }),
    ).toMatchObject({
      ok: false,
      code: 'invalid_capacity',
    });

    const guestContext = installModelContext();
    const guestState = createInitialState(0);
    guestState.selection = { type: 'guest', id: 'mabel' };
    registerContextTools(makeBridge(guestState).bridge);
    const guestTools = await registeredTools(guestContext.registrations);
    expect([...guestTools.keys()]).toEqual([
      'pin_guest',
      'move_guest',
      'swap_guests',
      'fix_violations',
    ]);
    expect(
      guestTools.get('move_guest')?.execute({ tableId: 'table-9' }),
    ).toMatchObject({
      ok: false,
      code: 'invalid_table_id',
    });

    const pinnedContext = installModelContext();
    const pinnedState = executeCommand(
      guestState,
      { type: 'pin_guest', guestId: 'mabel' },
      'human',
    ).state;
    registerContextTools(makeBridge(pinnedState).bridge);
    const pinnedTools = await registeredTools(pinnedContext.registrations);
    expect([...pinnedTools.keys()]).toEqual(['unpin_guest', 'fix_violations']);
  });
});
