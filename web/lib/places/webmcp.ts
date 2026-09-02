import {
  CONSTRAINT_KINDS,
  evaluateConstraints,
  explainGuest,
  getRoomSnapshot,
  ROOM_ZONES,
  type CommandResult,
  type ConstraintInput,
  type ConstraintKind,
  type ConstraintSeverity,
  type GuestTag,
  type RoomCommand,
  type RoomState,
  type RoomZone,
  type TableId,
  TABLE_IDS,
} from './index';

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => unknown;
}

interface ModelContext {
  registerTool: (
    tool: ModelContextTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export type WebMcpStatus = 'unavailable' | 'registering' | 'ready' | 'error';

export interface WebMcpBridge {
  getState: () => RoomState;
  runCommand: (command: RoomCommand, actor: 'agent') => CommandResult;
  setStatus: (status: WebMcpStatus) => void;
}

const EMPTY_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

const TABLE_ID_SCHEMA = {
  type: 'string',
  enum: TABLE_IDS,
  description: 'The destination table identifier.',
} as const;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function constraintKind(value: unknown): ConstraintKind | null {
  return CONSTRAINT_KINDS.includes(value as ConstraintKind)
    ? (value as ConstraintKind)
    : null;
}

function roomZone(value: unknown): RoomZone | undefined {
  return ROOM_ZONES.includes(value as RoomZone)
    ? (value as RoomZone)
    : undefined;
}

function severity(value: unknown): ConstraintSeverity | undefined {
  return value === 'hard' || value === 'preference' ? value : undefined;
}

function tableId(value: unknown): TableId | null {
  return typeof value === 'string' && TABLE_IDS.includes(value as TableId)
    ? (value as TableId)
    : null;
}

function toolResponse(result: CommandResult, state: RoomState) {
  return {
    ...result,
    roomRevision: state.revision,
    violations: evaluateConstraints(state),
  };
}

async function registerTools(
  tools: ModelContextTool[],
  controller: AbortController,
  setStatus: (status: WebMcpStatus) => void,
) {
  if (!document.modelContext) {
    setStatus('unavailable');
    return;
  }
  setStatus('registering');
  try {
    await Promise.all(
      tools.map((tool) =>
        document.modelContext!.registerTool(tool, {
          signal: controller.signal,
        }),
      ),
    );
    if (!controller.signal.aborted) setStatus('ready');
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('WebMCP tool registration failed.', error);
      setStatus('error');
    }
  }
}

export function registerStableTools(bridge: WebMcpBridge): () => void {
  const controller = new AbortController();
  const tools: ModelContextTool[] = [
    {
      name: 'get_room_state',
      title: 'Get room state',
      description:
        'Read the current tables, seats, guests, human pins, room zones, selection, and constraint violations. The page is the source of truth.',
      inputSchema: EMPTY_SCHEMA,
      execute: () => getRoomSnapshot(bridge.getState()),
    },
    {
      name: 'list_violations',
      title: 'List seating violations',
      description:
        'List every active seating-rule violation, including the affected guests and tables.',
      inputSchema: EMPTY_SCHEMA,
      execute: () => ({ violations: evaluateConstraints(bridge.getState()) }),
    },
    {
      name: 'explain_guest',
      title: 'Explain a guest',
      description:
        'Explain where a guest is seated, whether the guest is pinned, and which preferences or rules apply.',
      inputSchema: {
        type: 'object',
        properties: {
          guestId: {
            type: 'string',
            description: 'A guest identifier from get_room_state.',
          },
        },
        required: ['guestId'],
        additionalProperties: false,
      },
      execute: (input) => {
        const guestId = text(input.guestId);
        if (!guestId)
          return {
            ok: false,
            code: 'invalid_guest_id',
            message: 'guestId is required.',
          };
        const explanation = explainGuest(bridge.getState(), guestId);
        return (
          explanation ?? {
            ok: false,
            code: 'guest_not_found',
            message: `Guest "${guestId}" was not found.`,
          }
        );
      },
    },
    {
      name: 'list_constraints',
      title: 'List seating rules',
      description:
        'List every seating rule in the room as data: its id, kind, severity and the guests it addresses. Rules are the model the reflow enforces.',
      inputSchema: EMPTY_SCHEMA,
      execute: () => ({ constraints: bridge.getState().constraints }),
    },
    {
      name: 'add_constraint',
      title: 'Add a seating rule',
      description:
        'Add a seating rule about guests who are in the room. Hard rules must hold; preferences are weighed against each other.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: CONSTRAINT_KINDS,
            description: 'The rule to apply to the listed guests.',
          },
          guestIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Guest identifiers from get_room_state. Sharing rules need two.',
          },
          zone: {
            type: 'string',
            enum: ROOM_ZONES,
            description: 'Required for prefer_zone.',
          },
          severity: { type: 'string', enum: ['hard', 'preference'] },
          message: {
            type: 'string',
            description: 'Optional sentence shown when the rule is broken.',
          },
        },
        required: ['kind', 'guestIds'],
        additionalProperties: false,
      },
      execute: (input) => {
        const kind = constraintKind(input.kind);
        if (!kind)
          return {
            ok: false,
            code: 'invalid_constraint_kind',
            message: `kind must be one of: ${CONSTRAINT_KINDS.join(', ')}.`,
          };
        if (!Array.isArray(input.guestIds))
          return {
            ok: false,
            code: 'invalid_constraint_guests',
            message: 'guestIds must be an array of guest identifiers.',
          };
        const constraint: ConstraintInput = {
          kind,
          guestIds: input.guestIds.map((guestId) => String(guestId)),
          zone: roomZone(input.zone),
          severity: severity(input.severity),
          message: text(input.message) ?? undefined,
        };
        const result = bridge.runCommand(
          { type: 'add_constraint', constraint },
          'agent',
        );
        return toolResponse(result, bridge.getState());
      },
    },
    {
      name: 'remove_constraint',
      title: 'Remove a seating rule',
      description:
        'Remove a seating rule by the id reported by list_constraints.',
      inputSchema: {
        type: 'object',
        properties: {
          constraintId: {
            type: 'string',
            description: 'A rule identifier from list_constraints.',
          },
        },
        required: ['constraintId'],
        additionalProperties: false,
      },
      execute: (input) => {
        const constraintId = text(input.constraintId);
        if (!constraintId)
          return {
            ok: false,
            code: 'invalid_constraint_id',
            message: 'constraintId is required.',
          };
        const result = bridge.runCommand(
          { type: 'remove_constraint', constraintId },
          'agent',
        );
        return toolResponse(result, bridge.getState());
      },
    },
    {
      name: 'add_guest',
      title: 'Add a last-minute guest',
      description:
        'Add and seat a last-minute guest in one of the held empty seats. The room updates immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The guest name. A placeholder is used when omitted.',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['adult', 'grandparent', 'kid', 'wheelchair', 'plus_one'],
            },
            description: 'Optional guest tags.',
          },
        },
        additionalProperties: false,
      },
      execute: (input) => {
        const tags = Array.isArray(input.tags)
          ? input.tags.filter((tag): tag is GuestTag =>
              [
                'adult',
                'grandparent',
                'kid',
                'wheelchair',
                'plus_one',
              ].includes(String(tag)),
            )
          : undefined;
        const result = bridge.runCommand(
          { type: 'add_guest', name: text(input.name) ?? undefined, tags },
          'agent',
        );
        return toolResponse(result, bridge.getState());
      },
    },
  ];

  void registerTools(tools, controller, bridge.setStatus);
  return () => controller.abort();
}

export function registerContextTools(bridge: WebMcpBridge): () => void {
  const controller = new AbortController();
  const state = bridge.getState();
  const tools: ModelContextTool[] = [];

  if (state.selection?.type === 'table') {
    const selectedTableId = state.selection.id;
    const selectedTable = state.tables[selectedTableId];
    tools.push(
      {
        name: 'seat_guest_here',
        title: `Seat a guest at ${selectedTable.label}`,
        description: `Move an unpinned guest to the currently selected ${selectedTable.label}.`,
        inputSchema: {
          type: 'object',
          properties: {
            guestId: {
              type: 'string',
              description: 'A guest identifier from get_room_state.',
            },
          },
          required: ['guestId'],
          additionalProperties: false,
        },
        execute: (input) => {
          const guestId = text(input.guestId);
          if (!guestId)
            return {
              ok: false,
              code: 'invalid_guest_id',
              message: 'guestId is required.',
            };
          const result = bridge.runCommand(
            { type: 'seat_guest_here', guestId, tableId: selectedTableId },
            'agent',
          );
          return toolResponse(result, bridge.getState());
        },
      },
      {
        name: 'set_capacity',
        title: `Set ${selectedTable.label} capacity`,
        description: `Set the number of active seats at the currently selected ${selectedTable.label}.`,
        inputSchema: {
          type: 'object',
          properties: { capacity: { type: 'integer', minimum: 2, maximum: 6 } },
          required: ['capacity'],
          additionalProperties: false,
        },
        execute: (input) => {
          const capacity = integer(input.capacity);
          if (capacity === null)
            return {
              ok: false,
              code: 'invalid_capacity',
              message: 'capacity must be an integer.',
            };
          const result = bridge.runCommand(
            { type: 'set_capacity', tableId: selectedTableId, capacity },
            'agent',
          );
          return toolResponse(result, bridge.getState());
        },
      },
      {
        name: 'leave_empty_seats',
        title: `Hold seats at ${selectedTable.label}`,
        description: `Reserve empty seats at the currently selected ${selectedTable.label}; reflow must preserve them.`,
        inputSchema: {
          type: 'object',
          properties: { count: { type: 'integer', minimum: 0, maximum: 6 } },
          required: ['count'],
          additionalProperties: false,
        },
        execute: (input) => {
          const count = integer(input.count);
          if (count === null)
            return {
              ok: false,
              code: 'invalid_empty_seat_count',
              message: 'count must be an integer.',
            };
          const result = bridge.runCommand(
            { type: 'leave_empty_seats', tableId: selectedTableId, count },
            'agent',
          );
          return toolResponse(result, bridge.getState());
        },
      },
    );
  }

  if (state.selection?.type === 'guest') {
    const selectedGuestId = state.selection.id;
    const selectedGuest = state.guests[selectedGuestId];
    const pinned = state.pinnedGuestIds.includes(selectedGuestId);
    tools.push({
      name: pinned ? 'unpin_guest' : 'pin_guest',
      title: `${pinned ? 'Unpin' : 'Pin'} ${selectedGuest.name}`,
      description: pinned
        ? `Release the human pin protecting ${selectedGuest.name}.`
        : `Pin ${selectedGuest.name} to the current seat so reflow cannot move them.`,
      inputSchema: EMPTY_SCHEMA,
      execute: () => {
        const result = bridge.runCommand(
          {
            type: pinned ? 'unpin_guest' : 'pin_guest',
            guestId: selectedGuestId,
          },
          'agent',
        );
        return toolResponse(result, bridge.getState());
      },
    });

    if (!pinned) {
      tools.push(
        {
          name: 'move_guest',
          title: `Move ${selectedGuest.name}`,
          description: `Move the currently selected ${selectedGuest.name} to a table with an open seat.`,
          inputSchema: {
            type: 'object',
            properties: { tableId: TABLE_ID_SCHEMA },
            required: ['tableId'],
            additionalProperties: false,
          },
          execute: (input) => {
            const destination = tableId(input.tableId);
            if (!destination)
              return {
                ok: false,
                code: 'invalid_table_id',
                message: 'tableId is invalid.',
              };
            const result = bridge.runCommand(
              {
                type: 'move_guest',
                guestId: selectedGuestId,
                tableId: destination,
              },
              'agent',
            );
            return toolResponse(result, bridge.getState());
          },
        },
        {
          name: 'swap_guests',
          title: `Swap ${selectedGuest.name}`,
          description: `Swap the currently selected ${selectedGuest.name} with another unpinned guest.`,
          inputSchema: {
            type: 'object',
            properties: {
              otherGuestId: {
                type: 'string',
                description: 'The other guest identifier.',
              },
            },
            required: ['otherGuestId'],
            additionalProperties: false,
          },
          execute: (input) => {
            const otherGuestId = text(input.otherGuestId);
            if (!otherGuestId)
              return {
                ok: false,
                code: 'invalid_guest_id',
                message: 'otherGuestId is required.',
              };
            const result = bridge.runCommand(
              { type: 'swap_guests', guestId: selectedGuestId, otherGuestId },
              'agent',
            );
            return toolResponse(result, bridge.getState());
          },
        },
      );
    }
  }

  if (evaluateConstraints(state).length > 0) {
    tools.push({
      name: 'fix_violations',
      title: 'Fix seating violations',
      description:
        'Reflow unpinned guests to reduce or clear every active violation. Human pins are absolute and are never moved. The result says why the reflow stopped: solved, blocked_by_pins (with the pins at fault), infeasible (with a proof) or no_arrangement_found.',
      inputSchema: EMPTY_SCHEMA,
      execute: () => {
        const result = bridge.runCommand({ type: 'fix_violations' }, 'agent');
        return toolResponse(result, bridge.getState());
      },
    });
  }

  void registerTools(tools, controller, bridge.setStatus);
  return () => controller.abort();
}
