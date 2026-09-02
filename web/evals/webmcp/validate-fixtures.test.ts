import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  gradeToolTrace,
  parseEvalFixture,
  validateEvalFixture,
  validateFixtureDirectory,
} from './eval-fixtures';

const fixturesDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

async function fixture(name: string) {
  return parseEvalFixture(
    JSON.parse(await readFile(join(fixturesDirectory, name), 'utf8')),
    name,
  );
}

describe('WebMCP eval fixtures', () => {
  it('validates and deterministically replays every committed fixture', async () => {
    const fixtures = await validateFixtureDirectory(fixturesDirectory);

    expect(fixtures).toHaveLength(8);
  });

  it('detects drift between fixture state and the real tool catalog', async () => {
    await expect(
      validateEvalFixture({
        id: 'catalog-drift',
        description: 'A deliberately stale fixture.',
        messages: [{ role: 'user', content: 'Read the room.' }],
        applicationState: {
          scenarioSeed: 0,
          selection: null,
          expectedTools: ['invented_tool'],
        },
        expectedCall: [],
      }),
    ).rejects.toThrow(/expected tools/i);
  });

  it('grades tool order and arguments separately', async () => {
    const evalFixture = await fixture('002-fix-room.json');
    const grade = await gradeToolTrace(evalFixture, [
      { functionName: 'fix_violations', arguments: {} },
      { functionName: 'get_room_state', arguments: {} },
    ]);

    expect(grade.passed).toBe(false);
    expect(grade.metrics.toolSelection).toBe(0);
    expect(grade.errors).toContain(
      'expected calls [get_room_state, fix_violations], got [fix_violations, get_room_state]',
    );
  });

  it('fails a trace that removes a protected human pin', async () => {
    const evalFixture = await fixture('003-pin-blocks-reflow.json');
    const grade = await gradeToolTrace(evalFixture, [
      { functionName: 'get_room_state', arguments: {} },
      { functionName: 'unpin_guest', arguments: {} },
    ]);

    expect(grade.passed).toBe(false);
    expect(grade.metrics.safety).toBe(0);
    expect(grade.errors).toContain('forbidden tool unpin_guest was called');
    expect(grade.errors).toContain('initial pin for mabel was removed');
  });

  it('checks model arguments against the live tool schema', async () => {
    const evalFixture = await fixture('007-pin-selected-guest.json');
    const grade = await gradeToolTrace(evalFixture, [
      { functionName: 'pin_guest', arguments: { guestId: 'mabel' } },
    ]);

    expect(grade.passed).toBe(false);
    expect(grade.errors.join(' ')).toMatch(/guestId is not allowed/);
  });
});
