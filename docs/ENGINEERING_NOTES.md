# Engineering notes

## 1. Shape

```
packages/
  core/     event schema, hierarchy, layout. Pure TS, no I/O, unit-tested. Everything
            deterministic lives here so it can be pinned by a test.
  server/   Node. git + fs watcher (chokidar) + Claude Code hook receiver, fanned out as
            one WebSocket stream of StrataEvent. The only package that touches disk.
  web/      Vite + TS + three. A canvas and one caption card. Reads the event stream and
            nothing else; never touches git or the file system.
  vscode/   milestone two: hosts web/ in a webview, forwards clicks to vscode.open.
```

npm workspaces, no Nx: four packages do not need task graphs or a cache. TypeScript project
references (`tsc -b`) give cross-package typechecking; `vitest` runs specs from the root.

## 2. Laws

1. **Layout is deterministic and stable.** Same input, same picture, on every machine; a
   change repositions only what changed. Pinned by snapshot specs in `core`.
2. **Rendering reads one event stream.** `web` receives `StrataEvent`s and nothing else, so
   replaying git history is the same events fed from the log.
3. **Structure owns colour and height; weather owns light.** An agent's presence is emissive,
   never a colour or a scale, or "Claude is here" and "this file is big" collide.
4. **Hierarchy is read off the repo, never configured.** Country = deepest folder holding a
   project marker (`PROJECT_MARKERS` in core), district = folder, block = file. The file set is
   `git ls-files --cached --others --exclude-standard`; there is no include list.
5. **Nothing moves because something else changed state.** A district that shifts because a
   sibling grew is the map fidgeting.

## 3. Feeds

- Terrain: `git ls-files` for the snapshot, chokidar for live changes, `git diff --name-status`
  to tell a rename from a remove + add. Imports resolved by a cheap regex over
  `import ... from '...'` / `require('...')` with tsconfig paths; only in-repo targets become
  roads.
- Weather: Claude Code hooks (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`) POST a small
  JSON event to the server. No transcript scraping; if the hook is not installed there is no
  weather, and that is fine.

## 4. Working agreements

- Commit only when Julien asks, in that turn, straight to `master`; stage by path.
- Gate before calling anything green: `npm run gate` (typecheck, lint, format, test). Jest-style
  transforms do not typecheck; `tsc -b` does.
- Visual decisions: build a mockup in `docs/mockups/`, offer options and a recommendation, wait.
  A mockup file is named by its creation time, `YYYY-MM-DD-HHMM-<name>.html`, so the folder
  reads as the history of the design.
- No em or en dashes in anything kept.

## 5. Open

- Layout algorithm (treemap per district; how countries are placed relative to each other).
- Road resolution beyond TS/JS.
- Timeline: the server keeps an hour of events and serves ranges for the scrub (P2-TIME).
- VS Code adapter: CSP for the webview, message bridge for `open`.
