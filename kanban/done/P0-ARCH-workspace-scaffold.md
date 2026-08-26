# Workspace scaffold

## Description

The repository as a place to work: packages, tooling, the gate, the documents and the board.

## Acceptance Criteria

- [x] npm workspaces with `core`, `server`, `web`, `vscode`
- [x] TypeScript strict with project references; ESLint flat config; Prettier; Vitest
- [x] `npm run gate` runs typecheck, lint, format check and tests, and CI runs the same
- [x] `core` exports the event schema and `placeBlocks`, with specs
- [x] `server` answers a WebSocket connection with a snapshot of `git ls-files`
- [x] `web` draws the snapshot as instanced boxes
- [x] `docs/DESIGN.md`, `docs/ENGINEERING_NOTES.md`, `CLAUDE.md`, `COMMIT.md`, `kanban/`
- [x] `.claude/` commands ported from TellMeAStory and rewritten for this domain

## Technical Notes

- TypeScript pinned to 5.9: typescript-eslint 8.68 refuses 7 as a peer
- `.npmrc` sets `save-exact`; every dependency is pinned to the installed version
- `dist-types` is `web`'s declaration output and is ignored by git, ESLint and Prettier

## Definition of Done

- [x] `npm run gate` green
- [x] Snapshot witnessed against TellMeAStory: 1165 blocks, 30 countries, drawn at :4746
