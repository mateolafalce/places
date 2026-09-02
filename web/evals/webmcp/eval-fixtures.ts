import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  createInitialState,
  evaluateConstraints,
  executeCommand,
  getGuestSeat,
  selectItem,
  type EventActor,
  type RoomCommand,
  type RoomState,
  type Selection,
  type TableId,
} from '../../lib/places';
import {
  createContextTools,
  createStableTools,
  type ModelContextTool,
  type WebMcpBridge,
} from '../../lib/places/webmcp';

export interface EvalMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface EvalSetupStep {
  actor: EventActor;
  command: RoomCommand;
}

export interface EvalApplicationState {
  scenarioSeed: number;
  setup?: EvalSetupStep[];
  selection?: Selection;
  expectedTools: string[];
}

export interface ExpectedToolCall {
  functionName: string;
  arguments?: Record<string, unknown>;
  expectedResult?: Record<string, unknown>;
}

export interface ExpectedEvalState {
  violationCount?: number;
  pinnedGuestIds?: string[];
  guestIdsPresent?: string[];
  guestTables?: Record<string, TableId>;
  reservedEmptySeats?: Partial<Record<TableId, number>>;
  preserveInitialPins?: boolean;
}

export interface WebMcpEvalFixture {
  id: string;
  description: string;
  messages: EvalMessage[];
  applicationState: EvalApplicationState;
  expectedCall: ExpectedToolCall[];
  forbiddenCalls?: string[];
  expectedState?: ExpectedEvalState;
}

export interface EvalTraceGrade {
  passed: boolean;
  score: number;
  errors: string[];
  metrics: {
    toolSelection: number;
    arguments: number;
    safety: number;
    outcome: number;
  };
}

interface EvalSession {
  getState: () => RoomState;
  getTools: () => ModelContextTool[];
  call: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  initialPinnedSeats: Map<string, ReturnType<typeof getGuestSeat>>;
}

const COMMAND_TYPES = new Set<RoomCommand['type']>([
  'move_guest',
  'seat_guest_here',
  'swap_guests',
  'pin_guest',
  'unpin_guest',
  'set_capacity',
  'leave_empty_seats',
  'add_guest',
  'add_constraint',
  'remove_constraint',
  'fix_violations',
  'reset_seed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(file: string, message: string): never {
  throw new Error(`${file}: ${message}`);
}

function stringArray(value: unknown, file: string, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(file, `${field} must be an array of strings`);
  }
  return value;
}

function parseSelection(value: unknown, file: string): Selection | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    !isRecord(value) ||
    (value.type !== 'guest' && value.type !== 'table') ||
    typeof value.id !== 'string'
  ) {
    fail(file, 'applicationState.selection is invalid');
  }
  return value as Selection;
}

export function parseEvalFixture(
  raw: unknown,
  file = 'fixture',
): WebMcpEvalFixture {
  if (!isRecord(raw)) fail(file, 'fixture must be an object');
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    fail(file, 'id must be a non-empty string');
  }
  if (typeof raw.description !== 'string' || raw.description.trim() === '') {
    fail(file, 'description must be a non-empty string');
  }
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    fail(file, 'messages must contain at least one message');
  }
  for (const [index, message] of raw.messages.entries()) {
    if (
      !isRecord(message) ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.trim() === ''
    ) {
      fail(file, `messages[${index}] is invalid`);
    }
  }

  if (!isRecord(raw.applicationState)) {
    fail(file, 'applicationState must be an object');
  }
  const scenarioSeed = raw.applicationState.scenarioSeed;
  if (typeof scenarioSeed !== 'number' || !Number.isInteger(scenarioSeed)) {
    fail(file, 'applicationState.scenarioSeed must be an integer');
  }
  const expectedTools = stringArray(
    raw.applicationState.expectedTools,
    file,
    'applicationState.expectedTools',
  );
  const selection = parseSelection(raw.applicationState.selection, file);
  const setupRaw = raw.applicationState.setup;
  const setup: EvalSetupStep[] = [];
  if (setupRaw !== undefined) {
    if (!Array.isArray(setupRaw)) {
      fail(file, 'applicationState.setup must be an array');
    }
    for (const [index, step] of setupRaw.entries()) {
      if (
        !isRecord(step) ||
        (step.actor !== 'agent' &&
          step.actor !== 'human' &&
          step.actor !== 'system') ||
        !isRecord(step.command) ||
        typeof step.command.type !== 'string' ||
        !COMMAND_TYPES.has(step.command.type as RoomCommand['type'])
      ) {
        fail(file, `applicationState.setup[${index}] is invalid`);
      }
      setup.push(step as unknown as EvalSetupStep);
    }
  }

  if (!Array.isArray(raw.expectedCall)) {
    fail(file, 'expectedCall must be an array');
  }
  const expectedCall: ExpectedToolCall[] = raw.expectedCall.map(
    (call, index) => {
      if (
        !isRecord(call) ||
        typeof call.functionName !== 'string' ||
        (call.arguments !== undefined && !isRecord(call.arguments)) ||
        (call.expectedResult !== undefined && !isRecord(call.expectedResult))
      ) {
        fail(file, `expectedCall[${index}] is invalid`);
      }
      return call as unknown as ExpectedToolCall;
    },
  );

  let forbiddenCalls: string[] | undefined;
  if (raw.forbiddenCalls !== undefined) {
    forbiddenCalls = stringArray(raw.forbiddenCalls, file, 'forbiddenCalls');
  }
  if (raw.expectedState !== undefined && !isRecord(raw.expectedState)) {
    fail(file, 'expectedState must be an object');
  }

  return {
    id: raw.id,
    description: raw.description,
    messages: raw.messages as EvalMessage[],
    applicationState: {
      scenarioSeed,
      setup: setup.length > 0 ? setup : undefined,
      selection,
      expectedTools,
    },
    expectedCall,
    forbiddenCalls,
    expectedState: raw.expectedState as ExpectedEvalState | undefined,
  };
}

function createEvalSession(fixture: WebMcpEvalFixture): EvalSession {
  let state = createInitialState(fixture.applicationState.scenarioSeed);

  for (const [index, step] of (
    fixture.applicationState.setup ?? []
  ).entries()) {
    const outcome = executeCommand(state, step.command, step.actor);
    if (!outcome.result.ok) {
      throw new Error(
        `${fixture.id}: setup step ${index + 1} failed with ${outcome.result.code}`,
      );
    }
    state = outcome.state;
  }

  if (fixture.applicationState.selection !== undefined) {
    const selection = fixture.applicationState.selection;
    if (
      selection?.type === 'guest' &&
      state.guests[selection.id] === undefined
    ) {
      throw new Error(`${fixture.id}: selected guest does not exist`);
    }
    if (
      selection?.type === 'table' &&
      state.tables[selection.id] === undefined
    ) {
      throw new Error(`${fixture.id}: selected table does not exist`);
    }
    state = selectItem(state, selection);
  }

  const bridge: WebMcpBridge = {
    getState: () => state,
    runCommand: (command, actor) => {
      const outcome = executeCommand(state, command, actor);
      state = outcome.state;
      return outcome.result;
    },
    setStatus: () => undefined,
  };
  const getTools = () => [
    ...createStableTools(bridge),
    ...createContextTools(bridge),
  ];
  const initialPinnedSeats = new Map(
    state.pinnedGuestIds.map((guestId) => [
      guestId,
      getGuestSeat(state, guestId),
    ]),
  );

  return {
    getState: () => state,
    getTools,
    initialPinnedSeats,
    call: async (functionName, args) => {
      const tool = getTools().find(
        (candidate) => candidate.name === functionName,
      );
      if (!tool) {
        throw new Error(
          `${fixture.id}: tool "${functionName}" is unavailable in the current state`,
        );
      }
      const schemaErrors = validateAgainstSchema(tool.inputSchema, args);
      if (schemaErrors.length > 0) {
        throw new Error(
          `${fixture.id}: invalid arguments for ${functionName}: ${schemaErrors.join('; ')}`,
        );
      }
      return Promise.resolve(tool.execute(args));
    },
  };
}

function validateAgainstSchema(
  schema: Record<string, unknown> | undefined,
  value: unknown,
  path = 'arguments',
): string[] {
  if (!schema) return [];
  const errors: string[] = [];
  const type = schema.type;

  if (type === 'object') {
    if (!isRecord(value)) return [`${path} must be an object`];
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    for (const property of required) {
      if (!(property in value)) errors.push(`${path}.${property} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const property of Object.keys(value)) {
        if (!(property in properties)) {
          errors.push(`${path}.${property} is not allowed`);
        }
      }
    }
    for (const [property, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[property];
      if (isRecord(propertySchema)) {
        errors.push(
          ...validateAgainstSchema(
            propertySchema,
            propertyValue,
            `${path}.${property}`,
          ),
        );
      }
    }
  } else if (type === 'string') {
    if (typeof value !== 'string') errors.push(`${path} must be a string`);
  } else if (type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push(`${path} must be an integer`);
    }
    if (typeof value === 'number' && typeof schema.minimum === 'number') {
      if (value < schema.minimum) errors.push(`${path} is below minimum`);
    }
    if (typeof value === 'number' && typeof schema.maximum === 'number') {
      if (value > schema.maximum) errors.push(`${path} is above maximum`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    const itemSchema = schema.items;
    if (isRecord(itemSchema)) {
      value.forEach((item, index) => {
        errors.push(
          ...validateAgainstSchema(itemSchema, item, `${path}[${index}]`),
        );
      });
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path} is not an allowed value`);
  }
  return errors;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      deepEqual(leftKeys, rightKeys) &&
      leftKeys.every((key) => deepEqual(left[key], right[key]))
    );
  }
  return false;
}

function partialMatch(actual: unknown, expected: unknown): boolean {
  if (isRecord(expected)) {
    return (
      isRecord(actual) &&
      Object.entries(expected).every(([key, value]) =>
        partialMatch(actual[key], value),
      )
    );
  }
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => partialMatch(actual[index], value))
    );
  }
  return Object.is(actual, expected);
}

function stateErrors(
  fixture: WebMcpEvalFixture,
  session: EvalSession,
): string[] {
  const expected = fixture.expectedState;
  if (!expected) return [];
  const state = session.getState();
  const errors: string[] = [];

  if (
    expected.violationCount !== undefined &&
    evaluateConstraints(state).length !== expected.violationCount
  ) {
    errors.push(
      `expected ${expected.violationCount} violation(s), got ${evaluateConstraints(state).length}`,
    );
  }
  if (
    expected.pinnedGuestIds !== undefined &&
    !deepEqual(
      [...state.pinnedGuestIds].sort(),
      [...expected.pinnedGuestIds].sort(),
    )
  ) {
    errors.push('pinned guest ids do not match');
  }
  for (const guestId of expected.guestIdsPresent ?? []) {
    if (!state.guests[guestId]) errors.push(`guest ${guestId} is missing`);
  }
  for (const [guestId, tableId] of Object.entries(expected.guestTables ?? {})) {
    if (getGuestSeat(state, guestId)?.tableId !== tableId) {
      errors.push(`guest ${guestId} is not seated at ${tableId}`);
    }
  }
  for (const [tableId, count] of Object.entries(
    expected.reservedEmptySeats ?? {},
  )) {
    if (state.tables[tableId as TableId].reservedEmptySeats !== count) {
      errors.push(`${tableId} does not reserve ${count} empty seat(s)`);
    }
  }
  if (expected.preserveInitialPins) {
    for (const [guestId, seat] of session.initialPinnedSeats) {
      if (!state.pinnedGuestIds.includes(guestId)) {
        errors.push(`initial pin for ${guestId} was removed`);
      } else if (!deepEqual(getGuestSeat(state, guestId), seat)) {
        errors.push(`initially pinned guest ${guestId} moved`);
      }
    }
  }

  return errors;
}

export async function gradeToolTrace(
  fixture: WebMcpEvalFixture,
  actualCalls: ExpectedToolCall[],
): Promise<EvalTraceGrade> {
  const session = createEvalSession(fixture);
  const errors: string[] = [];
  const expectedNames = fixture.expectedCall.map((call) => call.functionName);
  const actualNames = actualCalls.map((call) => call.functionName);
  const comparedCalls = Math.max(expectedNames.length, actualNames.length, 1);
  const matchingNames = Array.from({ length: comparedCalls }).filter(
    (_, index) => expectedNames[index] === actualNames[index],
  ).length;
  const toolSelection = matchingNames / comparedCalls;
  if (!deepEqual(actualNames, expectedNames)) {
    errors.push(
      `expected calls [${expectedNames.join(', ')}], got [${actualNames.join(', ')}]`,
    );
  }

  let matchingArguments = 0;
  for (const [index, actualCall] of actualCalls.entries()) {
    const expectedCall = fixture.expectedCall[index];
    if (
      expectedCall &&
      expectedCall.functionName === actualCall.functionName &&
      deepEqual(actualCall.arguments ?? {}, expectedCall.arguments ?? {})
    ) {
      matchingArguments += 1;
    } else if (expectedCall?.functionName === actualCall.functionName) {
      errors.push(`arguments for call ${index + 1} do not match`);
    }

    if (fixture.forbiddenCalls?.includes(actualCall.functionName)) {
      errors.push(`forbidden tool ${actualCall.functionName} was called`);
    }
    try {
      const result = await session.call(
        actualCall.functionName,
        actualCall.arguments ?? {},
      );
      if (
        expectedCall?.expectedResult &&
        !partialMatch(result, expectedCall.expectedResult)
      ) {
        errors.push(`result for call ${index + 1} does not match`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const argumentsScore =
    expectedNames.length === 0 ? 1 : matchingArguments / expectedNames.length;
  const safety = errors.some((error) => error.startsWith('forbidden tool'))
    ? 0
    : 1;
  const outcomeErrors = stateErrors(fixture, session);
  errors.push(...outcomeErrors);
  const outcome = outcomeErrors.length === 0 ? 1 : 0;
  const score = (toolSelection + argumentsScore + safety + outcome) / 4;

  return {
    passed: errors.length === 0,
    score,
    errors,
    metrics: {
      toolSelection,
      arguments: argumentsScore,
      safety,
      outcome,
    },
  };
}

export async function validateEvalFixture(
  raw: unknown,
  file = 'fixture',
): Promise<WebMcpEvalFixture> {
  const fixture = parseEvalFixture(raw, file);
  const session = createEvalSession(fixture);
  const actualTools = session.getTools().map((tool) => tool.name);
  if (!deepEqual(actualTools, fixture.applicationState.expectedTools)) {
    fail(
      file,
      `expected tools [${fixture.applicationState.expectedTools.join(', ')}], got [${actualTools.join(', ')}]`,
    );
  }
  const grade = await gradeToolTrace(fixture, fixture.expectedCall);
  if (!grade.passed) fail(file, grade.errors.join('; '));
  return fixture;
}

export async function validateFixtureDirectory(
  directory: string,
): Promise<WebMcpEvalFixture[]> {
  const entries = (await readdir(directory))
    .filter((entry) => entry.endsWith('.json'))
    .sort();
  if (entries.length === 0) {
    throw new Error(`No WebMCP eval fixtures found in ${directory}`);
  }
  const fixtures: WebMcpEvalFixture[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const file = join(directory, entry);
    const fixture = await validateEvalFixture(
      JSON.parse(await readFile(file, 'utf8')),
      file,
    );
    if (ids.has(fixture.id)) fail(file, `duplicate fixture id ${fixture.id}`);
    ids.add(fixture.id);
    fixtures.push(fixture);
  }
  return fixtures;
}
