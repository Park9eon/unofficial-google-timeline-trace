# Contributing

## Development

Use Node.js 24 and the pnpm version declared in `package.json`. Personal Timeline exports and `.timeline` map assets must remain outside version control.

Changes to runtime schemas require matching migration and regression tests. Changes to motion constants require updates to `docs/MOTION_MODEL.md` and the synthetic scenario matrix.

## Validation

Before submitting a change, run the unit tests, typecheck, ESLint, and static build. UI or rendering changes also require the Chrome UI and browser-render checks described in `docs/TESTING.md`.

Do not include screenshots, logs, fixtures, or performance output derived from real location history.

## Commit messages

Use the repository convention documented in `AGENTS.md`. Keep changes scoped and explain any public contract or migration impact.
