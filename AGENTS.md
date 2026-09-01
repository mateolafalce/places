# Repository Guidelines

## Project Structure & Module Organization

The application lives in `web/`, a Vinext/React 19 single-page site. Route and
global styling files are in `web/app/`; feature components belong in
`web/components/places/`, while reusable primitives live in
`web/components/ui/`. Seating rules and WebMCP integration are isolated under
`web/lib/places/`. Static browser assets are stored in `web/public/`.

Project documentation and source artwork live in `docs/`. The
`scripts/orchard_cast.py` utility regenerates cast and floor-plan assets. Run
Python only through the repository `.venv` (create it with
`python -m venv .venv` if absent).

## Build, Test, and Development Commands

Run JavaScript commands from `web/`:

- `npm install` installs the locked dependency set; use Node 22.13 or newer.
- `npm run dev` starts the local Vinext development server.
- `npm run build` creates the production Cloudflare-compatible build.
- `npm start` serves the built worker through Wrangler.
- `npm test` runs the Vitest suite once.
- `npm run typecheck` performs strict TypeScript checking without emitting files.
- `npm run lint` applies Oxlint correctness and React rules.
- `npm run format` formats supported files with Oxfmt.
- `npm run format:check` verifies formatting without modifying files.

For asset regeneration, use `.venv/bin/python scripts/orchard_cast.py` from the
repository root after installing its dependencies with `.venv/bin/pip`.

## Coding Style & Naming Conventions

Use TypeScript and functional React components. Oxfmt enforces single quotes
and an 80-column target; run formatting before review. Use two-space
indentation, `PascalCase` for components and types, `camelCase` for functions
and variables, and kebab-case filenames such as `floor-plan.tsx`. Prefer the
`@/` import alias and compose existing `components/ui` primitives rather than
duplicating controls. Keep domain logic pure and separate from rendering.

## Testing Guidelines

Vitest discovers `web/lib/**/*.test.ts` in a Node environment. Name tests after
observable behavior, colocate them with the module, and cover successful moves,
constraint failures, pin behavior, and edge cases. Run `npm test`,
`npm run typecheck`, `npm run lint`, and `npm run format:check` before opening a
PR. No numeric coverage threshold is currently configured.

## Commit & Pull Request Guidelines

The existing history uses short, imperative subjects (for example, `Build
interactive Places floorplan`). Keep commits focused. End commit messages with
a blank line followed by `Co-authored-by: Michael
<265398295+lafalce-assistant@users.noreply.github.com>`.

PRs should explain the user-visible change, list validation performed, link any
issue, and include screenshots for layout or visual updates. Call out WebMCP,
state-model, asset, or configuration changes explicitly.
