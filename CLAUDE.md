# CLAUDE.md - Strata

Strata is an abstract, live 3D view of a codebase: terrain from the repo, weather from the
agents working on it. Read before touching anything:

1. `docs/DESIGN.md`: the visual grammar and what the thing is not.
2. `docs/ENGINEERING_NOTES.md`: package shape, the five laws, feeds, working agreements.
3. `kanban/`: the board. `review/` means implementation complete and awaiting Julien.

## Shape

npm workspaces, four packages: `core` (pure, tested), `server` (the only package that touches
disk), `web` (Vite + three, reads one event stream), `vscode` (milestone two, draws nothing).

## Commands

- `npm run dev:server -- <repo path>` then `npm run dev`: server on 4747, web on 4746.
- `npm run gate`: typecheck + lint + format check + test. Run it before calling work green.
- `npm run test:watch` while working in `core`.

## Agreements (long form in ENGINEERING_NOTES §4)

- Commit and push only when Julien asks for it, in that turn, straight to `master`. Stage by
  path, never `git add -A`.
- Visual decisions go through a mockup in `docs/mockups/` and a recommendation; wait for the
  pick. Mockups are named `YYYY-MM-DD-HHMM-<name>.html`, the time being their creation.
- Layout lives in `core` and is pinned by a spec. A component that computes layout is a bug.
- `web` never touches git or the file system.
- Do the work in the main loop; no sub-agents unless asked.
- Commit messages follow `COMMIT.md`; the `/strata-commit` command applies it.
