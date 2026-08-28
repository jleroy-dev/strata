# Engineering notes

## 1. Shape

```
packages/
  core/     event schema, hierarchy, layout. Pure TS, no I/O, unit-tested. Everything
            deterministic lives here so it can be pinned by a test.
  server/   Node. git + fs watcher (native, recursive) + Claude Code hook receiver, fanned out as
            one WebSocket stream of StrataEvent. The only package that touches disk.
  web/      Vite + TS + three. Reads the event stream and nothing else; never touches git or
            the file system. Events fold into a world (core types); once per frame the web
            diffs the previous world against the next with `motions()` from core and animates
            the motion list. Effects are records drawn by kind; tweens are data on a clock.
            Every transient visual carries its own deadline (`ribbonPhase`, effect
            lifetimes, scar ages); nothing waits for a callback to end.
            Towers and ground are projections of the layout: each has one target derived
            from it on every apply and eases towards it; a flight is a timed override of
            the position, never a second target.
            Bloom is one HDR threshold over the scene: anything drawn unmapped above 1.0
            blooms, nothing else does. Controls reduce intents into one `Ui` record (core);
            camera, HUD, caption and roster read it.
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

- Layout: `layoutOf(blocks)` for the snapshot, `applyTerrain(layout, change)` per structural
  event; the server keeps the current `Layout` and sends placements on `block.added`,
  `block.moved`, `block.changed`, and a `layout.repacked` when ground changed.
- Terrain: git is the oracle and the watcher is a doorbell. `fs.watch(root, { recursive })`
  rings a tick after 50 ms of quiet or 250 ms into a burst; the tick lists the repo again
  (`git ls-files -s`, `--deleted`, `--others --exclude-standard`) and `reconcile(previous,
next)` in core turns the difference into `block.*` changes: a departure and an arrival pair
  into a move on equal blob sha (the index sha for a tracked file, refreshed with
  `git hash-object` whenever a file is new or changes size), then
  on equal basename and size, never on size alone; untracked files are hashed at startup so
  their renames pair too. A directory whose every file paired to the same new directory is
  reported as `folder.moved` (top folder only), so a folder move is a fact in the stream, not a
  guess from the picture. A never-listed path is emitted as added only once it has been
  listed twice, so an editor's temporary file never rises; moves, edits and removals go out
  on the first tick. Ignore rules are git's
  own, exactly.
- Roads: a `Language` in core (extensions, `specifiersOf`, `resolve`) per language, picked by
  extension; TypeScript is the one entry, a regex over `from '...'`, `require('...')` and
  `import('...')`, resolved through relative paths, tsconfig `paths` and workspace package
  names. `RoadIndex` in core diffs the road set; the server reads files and re-resolves the
  edited ones per tick, everything on a structural tick. Roads are in `Moment` and scrub.
- History: `History` in core is a baseline layout plus the events since, kept by the server
  (fed by its broadcast, expired past the trace hour or `MAX_EVENTS` into the baseline) and by
  the panel. A new client gets one message: the `snapshot` of now (drawn at once), a `history`
  event (baseline and log, indexed lazily for the scrub), then `hook.state`. `layout.repacked`
  carries only the placements that changed plus the rects. A spec pins that folding the
  emitted events reproduces `applyTerrain`. Each server tick is one WebSocket message, so a
  burst is diffed as one batch.
- Weather: Claude Code hooks of type `http` (`SessionStart`, `PreToolUse` on
  `Read|Edit|Write|MultiEdit|NotebookEdit|Bash`, `Stop`, `SessionEnd`) POST their payload to
  `/hook` on the server; `npx strata hook install <dir>` writes them into `.claude/settings.local.json`
  (`--shared` for `settings.json`). A vendor adapter in the server turns a payload into an
  `AgentSignal`; core turns signals into facts (`agent.arrived`, `reading`, `editing`,
  `running`, `waiting`, `left`). Idle, silence, hue and label are never on the wire: `verbOf`,
  `hueFor` and `roster` in core derive them from the facts and the clock, the same way live and
  in replay. The server keeps the last hour of weather and sends it to a client after the
  snapshot, then `hook.state` (installed: a strata hook found in a settings file; heard: one
  has posted since start). No transcript scraping; without the hook there is no weather.

## 4. Working agreements

- Commit only when Julien asks, in that turn, straight to `main`; stage by path.
- Gate before calling anything green: `npm run gate` (typecheck, lint, format, test). Jest-style
  transforms do not typecheck; `tsc -b` does.
- Visual decisions: build a mockup in `docs/mockups/`, offer options and a recommendation, wait.
  A mockup file is named by its creation time, `YYYY-MM-DD-HHMM-<name>.html`, so the folder
  reads as the history of the design.
- No em or en dashes in anything kept.
- Witnessing: `npm run demo -- <dir>` drives a scratch repo and fake sessions against a server
  watching it; `STRATA_DEV=1` on the server (npm swallows a `--dev` flag) enables
  `POST /dev/<action>` (rename, move-file,
  move-folder, add, remove, burst, third, touch) and the panel shows a sim bar when opened
  with `?dev`, with a select to preview the empty states.

## 5. Open

- Road resolution beyond TS/JS: one more `Language` entry per language.
- VS Code adapter: CSP for the webview, message bridge for `open`.
