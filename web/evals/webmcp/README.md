# Places WebMCP evals

These fixtures describe representative agent decisions for the live Places
WebMCP surface. They complement the deterministic domain and component tests;
they do not replace them.

## What runs in CI

`npm run test:evals` validates every JSON fixture and replays its reference tool
trace against the actual tool implementations. The suite checks:

- the complete tool catalog exposed by the fixture's room state;
- tool availability after each state transition;
- arguments against the registered JSON schema;
- expected result codes and final room state;
- forbidden calls and preservation of human pins;
- duplicate fixture identifiers.

The fixtures construct real room state from a scenario seed, optional setup
commands, and an optional selection. Tool descriptions and schemas are read
from `lib/places/webmcp.ts`; they are not duplicated in fixture JSON.

## What remains probabilistic

The committed `expectedCall` sequence is the reference trace for a model or
browser runner. Pass the calls produced by that runner to `gradeToolTrace()` to
measure tool selection, argument accuracy, safety, and final outcome.

CI intentionally does not call a model, require an API key, or incur usage
costs. Run model-backed or live-browser trials separately and feed their tool
traces to the same grader. Repeat each fixture several times because model
selection is probabilistic.

## Fixture shape

- `messages`: conversation presented to the agent.
- `applicationState.scenarioSeed`: reproducible opening room.
- `applicationState.setup`: deterministic commands applied before the prompt.
- `applicationState.selection`: selected guest, table, or `null`.
- `applicationState.expectedTools`: exact initial tool names, including
  contextual tools.
- `expectedCall`: ordered reference calls, arguments, and optional result
  subsets.
- `forbiddenCalls`: unsafe or irrelevant calls for the journey.
- `expectedState`: assertions over violations, pins, guests, tables, and held
  seats after replay.

## Commands

From `web/`:

```bash
npm run test:evals
npm test
```
