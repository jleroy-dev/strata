# Engineering notes

## How to read this

Nothing in these two documents is a rule for its own sake. Every line is a decision with the
reasoning attached, and a decision is worth exactly what its reasoning is worth. When evidence
contradicts one it changes, and the change is written down with what forced it. That is the
reason the reasoning is on the page at all, rather than the conclusion alone.

Two kinds of thing are written here and they do not move at the same speed.

**The laws in section 2 are pinned.** Each is held by a snapshot spec, a branded type or a
package boundary, so changing the sentence is not enough: a law changes in the same edit as the
spec or the type that enforces it, or it has not been changed, it has only been broken. A law
can still be wrong. Law 4 gained a tier above the country and law 5 gained a reservation,
neither by being weakened.

**Everything in `DESIGN.md` is provisional until it has been seen.** Most of it was reasoned on
paper, for a panel nobody had yet lived beside for a fortnight, and the design's own central
claim, that the sky is learnable, is the one thing a day of use cannot check. Where a decision
has met a real repo the number is in the line: 14,000 files, 129 countries, 271 days, sixty
mounted. Where there is no number there is no evidence, and the line is a guess with a reason,
which is worth keeping and worth overturning the moment something contradicts it.

Section 6 is the record of what has already been overturned, and by what.

## 1. Shape

```
packages/
  core/     event schema, hierarchy, layout. Pure TS, no I/O, unit-tested. Everything
            deterministic lives here so it can be pinned by a test. Examples say what a change
            looks like; `pipeline.props.spec.ts` says what is always true of one, generating
            repos and mutations with fast-check: no motion goes nowhere, every block is
            accounted for once, folding the emitted changes rebuilds the layout, and a listing
            places the same whatever order it arrives in.
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
            camera, HUD, caption and roster read it. One `Surface` turns a cell into a point on
            the bent ground, one `Terrain` draws every admitted country and one `Body` draws
            the continents and their districts at every distance, so a repo nobody has admitted
            is still land. The camera is four numbers, a
            point on the ground with a bearing, a pitch and a zoom: `view.ts` holds them and
            every limit on them, `spring.ts` carries them, `frame.ts` solves what to frame, and
            `camera.ts` turns them into a matrix. Overview, Follow and Free all write the same
            four numbers, so there is no handover between modes. `attention.ts`, `light.ts` and
            `slab.ts` are the other modules that decide without drawing.
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
   sibling grew is the map fidgeting. At the world tier the same law holds through a
   reservation: a continent claims ground on a stepped ladder, so files arriving grow its land
   inside that claim and move nothing, and only crossing a step re-shelves the world. The world
   is a pure function of what is mounted and how big each one is, in that order, so it does not
   depend on the order things were mounted in and cannot drift between the server and a client
   that folded its way there.
6. **`web` draws, it does not decide.** Anything computable from the data without a GPU belongs
   in `core`, or in a pure module beside the renderer that imports no `three`: camera framing,
   which agent to follow, which empty state to show, where a beacon stands. The panel is the
   largest package and the one a spec cannot reach through a canvas, so a decision that lands
   there is a decision nothing will ever check.
7. **A block id carries its repo.** `RepoId`, `RepoPath` and `BlockId` are branded, so mixing a
   qualified id with a bare path is a compile error rather than a silent one. `BlockId` is
   `repo:path`, split on the first separator, and only `qualified.ts` mints one. Each repo's
   pipeline works in `RepoPath` throughout; ids are qualified once, where they enter the shared
   `Layout` and the event stream. `Mounts` in the server is the one place a block becomes a path
   on disk. `core` never sees a root; `web` receives the mount table for the editor bridge alone,
   because that link needs an absolute path in the browser. A weather event carries its repo
   too, because an agent with no block still has a continent, and `hook.state` is one per watched
   mount: the dev scratch is a fixture and reports none, since `hookStateOf` folds the mounts into
   one state and a fixture claiming a hook would mask a repo that has none.
8. **Strata never writes inside a repo it watches, and never reads inside a file.** The
   observer works off git metadata alone: names, sizes and shas. The one file it opens in a
   watched repo is the settings file the hook lives in, asked for by name by `strata hook
install` and by the audit that reports drift. Terrain is a listing, weather is a hook post,
   and nothing in either needs the contents of the work. A feature that has to parse a file is
   a different product, and this is the law that says so. Two things write where the operator
   points them: `strata hook install` and the scratch driver, which owns the directory it
   created. The only thing strata keeps for itself is the hook token under `~/.strata`.
   A `Scratch` is minted by `seedScratch` or
   `cloneScratch` alone and marked with `.strata-scratch` on disk; `ScratchActions` takes one
   and nothing else, so the file actions cannot be aimed at a real tree by a later edit rather
   than by deleting a guard. A scratch path is refused when it overlaps a watched root once
   symlinked ancestors are resolved, because a lexical comparison misses `/tmp` against
   `/private/tmp`. A scratch is built in a sibling and renamed into place, so the path only ever
   exists complete and marked: a run killed partway through a clone leaves staging behind, which
   the next run reaps, rather than an unmarked directory that refuses to start.

## 3. Feeds

- Layout: `layoutOf(blocks)` for the snapshot, `applyTerrain(layout, change)` per structural
  event; the server keeps one `Layout` per mount, merges them with `mergeLayouts` for the
  stream, and sends placements on `block.added`, `block.moved`, `block.changed`, and a
  `layout.repacked` carrying its repo when ground changed. One continent is one repo, its
  countries shelved inside it by family, so a cell is local to its continent and only means
  something beside `repoOfName(country)`; `route` walks one continent's streets and returns
  nothing across the water. `atlas.ts` decides where continents stand: `claimOf` puts a
  continent's reservation on a stepped ladder and `placeContinents` shelves the claims largest
  first, name breaking ties. `withAtlas` is the single place that runs, so `layoutOf`,
  `mergeLayouts` and the repacked fold all reach the same world and the server's divergence
  check stays meaningful. A `ContinentPlate` carries the `extent` its countries reach, the
  `land` it shows in world cells, the `claim` it reserves and the world cell `at` which its own
  cell zero sits, a shore in from the corner of its land. `footprint.ts` is the one place the
  gaps, the skirt each plate is drawn with and the shore are decided, so a spec in `core` can
  hold every tier inside the one it stands on. `sphere.ts` bends a cell over the one world sphere (`bendAt`, `bendNormal`,
  `dropAt`, `chordFor`), `detail.ts` admits countries to the tower tier under a budget, and
  `activity.ts` derives what each repo and country carries, including `warmthOf` over the trace
  hour; `web` only stands things on the points these give it.
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
- Streets: `route(layout, from, to)` in core walks the gaps between plates, a pure function of
  the layout and nothing else, at three costs: a street, a kerb, an alley. `beacons.ts` routes a
  travelling agent along it and `Ribbons` lays the light behind it; two blocks on different
  continents are flown over the water instead. Streets are the only thing drawn between blocks.
- History: `History` in core is a baseline layout plus the events since, kept by the server
  (fed by its broadcast, expired past the trace hour or `MAX_EVENTS` into the baseline) and by
  the panel. A new client gets one message: a `snapshot` naming the mounts, a `history` event
  (baseline and log, indexed lazily for the scrub), then `hook.state`. The snapshot
  carries no world of its own. The server sends the past and the panel derives the present by
  folding the log onto the baseline, which is the fold `restore` runs anyway for sessions
  and touches; sending the layout of now beside the baseline it folds to is four megabytes
  spent on something the client already computed and threw away. A run of events is folded with
  one copy of the block table rather than one per event, and the copy is taken before the first
  event that moves a block, so `foldRun` never writes into the moment it started from and a
  keyframe stays the world it was. Folding four thousand events over fourteen thousand blocks one
  at a time is fifty-eight million map insertions and three and a half seconds; as a run it is
  one. `layout.repacked`
  carries only the placements that changed plus the rects. A spec pins that folding the
  emitted events reproduces `applyTerrain`. Each server tick is one WebSocket message, so a
  burst is diffed as one batch.
- Weather: Claude Code hooks of type `http` (`SessionStart`, `UserPromptSubmit`, `PreToolUse` on
  every tool, `PostToolUse` on `Bash` alone, `Notification`,
  `Stop`, `SessionEnd`) POST their payload to
  `/hook` on the server; `npx strata hook install <dir>` writes them into `.claude/settings.local.json`
  (`--shared` for `settings.json`), and `hook uninstall` takes them out again. Install replaces
  any strata hook already in the file, at any port, so entries never accumulate. The URL carries
  a per-machine token from `~/.strata/token` (0600, minted on first use) and the server rejects
  any post without it, because a payload carries shell commands and written file contents and the
  port is open to every local process. A stale hook aimed at a dead or foreign port is inert.
  Everything Claude Code specific lives in `server/adapters/`: the payload mapping in
  `claude-code.ts` and the settings file it is installed through in `claude-code-hooks.ts`.
  `hooks.ts` keeps only what any vendor would need, the endpoint path, the token and the URL.
  A vendor adapter in the server turns a payload into an
  `AgentSignal`; core turns signals into facts (`agent.arrived`, `reading`, `editing`,
  `running`, `thinking`, `blocked`, `waiting`, `left`). `PreToolUse` carries no matcher, so the
  vendor's tool list never enters strata's configuration: the adapter names the read, edit and
  shell families and everything else is `other`, which reads as `running`, work with no place.
  A tool nobody has taught strata about is an agent doing something, not an agent absent, and an
  enumeration on someone else's disk goes stale every time the vendor ships a tool.
  `PostToolUse` is narrowed to `Bash`
  because it is the only tool whose length is unknown, and a wider matcher would post the
  contents of every file read; a `Notification` counts as blocked only for `permission_prompt`
  and `agent_needs_input`, since `idle_prompt` is waiting by another name. The adapter drops the
  prompt text, the tool output and the transcript path that arrive with these payloads, pinned
  by a spec: an `AgentSignal` carries a session, a time, a kind and at most a path. The root is
  `realpathSync`d at startup, because Claude Code reports `cwd` resolved and a repo reached
  through a symlink would otherwise match nothing and report no agents. Idle, silence, hue and label are never on the wire: `verbOf`,
  `hueFor` and `roster` in core derive them from the facts and the clock, the same way live and
  in replay. The server keeps the last hour of weather and sends it to a client after the
  snapshot, then `hook.state`, one of `no-hook`, `installed-stale`, `installed-unheard` or
  `heard`; a post outranks a settings file, because a post is proof and a file is a guess, and
  drift outranks a post, because a hook that posts is still blind to every event it was never
  given. `auditHooks` reads the three settings files that reach a repo and compares the strata
  entries at this port against the ones `installHooks` writes, so a file left by an older build
  reads as stale and names the events it lacks instead of passing as installed. The server
  reports drift and never repairs it, because a write inside a watched repo is asked for by name.
  `GET /health` is the instrument on the intake: per mount the hook state and the drift it
  names, plus `heard` as a count and a last time rather than a flag, since a repo that posted
  once an hour ago and a repo posting now are not the same repo. Posts are counted whole, and a
  payload that produces no signal is counted by the reason the adapter gives, which separates
  the ones it chooses to ignore from the ones it could not read. Tool names are not counted,
  because they belong to the vendor and the seam is the point.
  No transcript scraping; without the hook there is no weather.

## 4. Working agreements

- Commit only when Julien asks, in that turn, straight to `main`; stage by path.
- Gate before calling anything green: `npm run gate` (typecheck, lint, format, test). Jest-style
  transforms do not typecheck; `tsc -b` does.
- Visual decisions: build a mockup in `docs/mockups/`, offer options and a recommendation, wait.
  A mockup file is named by its creation time, `YYYY-MM-DD-HHMM-<name>.html`, so the folder
  reads as the history of the design.
- No em or en dashes in anything kept.
- Record an overturned decision in section 6 as it is overturned, with what forced it, and edit
  the line it contradicts in the same change rather than leaving the two to disagree.
- Witnessing: `npm run demo -- <dir>` seeds a scratch repo and drives fake sessions against a
  server watching it; `STRATA_DEV=1` on the server (npm swallows a `--dev` flag) seeds
  `<tmp>/strata-scratch` from `FIXTURE`, mounts it beside the real ones and enables
  `POST /dev/<action>`. The scratch is the invented 22-file workspace, not a copy of your repo:
  what a file action is for is watching a folder fly and the ground repack, which reads better on
  a corner you can see whole than on a near-identical twin of the repo beside it, and 22 files
  reseed instantly on every `tsx watch` restart. `--scratch-from=<repo>` clones a real repo
  instead, for when the terrain has to be yours; that clone is kept and reused, since a monorepo
  costs seconds and hundreds of megabytes to copy, and its marker records where it came from so
  a different source rebuilds it and `--scratch-reset` forces a fresh one. `--scratch=<path>`
  moves the scratch, and either way a path overlapping a watched root is refused.
  `GET /dev/state` names the two groups and the panel draws what it is given, so the bar cannot
  drift from the server. The signal actions (third, touch, think, block) write nothing and run
  against the watched repo; the file actions (rename, move-file, rename-folder, move-folder, add,
  remove, burst) run against the scratch alone and answer 409 when there is no scratch. They pick
  their targets from `placeBlocks`, not from path strings, so `move-folder` always crosses into
  another country and `rename-folder` always stays put: one button per visual path, since a path
  no button reaches is a path nobody watches. The panel shows a sim bar
  when opened with `?dev`, with a select to preview the empty states. `think` and `block` drive
  the third agent into the two states no fixture can reach, since one needs a prompt and the
  other a permission dialog. `--scratch=<path>` names the throwaway and `--dev-seed=<n>` fixes
  the sequence, so a glitch seen once can be witnessed again.

## 5. Open

- VS Code adapter: CSP for the webview, message bridge for `open`.
- Cast shadows are off everywhere. The contact dark under a plate is painted by `shade.ts`, half
  a cell out and deepest at the edge, so it never moves with the key. A tight shadow camera in
  Follow is the follow-up if a skyline wants real ones there.

## 6. Overturned

Every row is a decision that was written down, believed, and then contradicted. The right-hand
column is the part worth reading: what did the overturning matters more than what was overturned.

| Was                                                      | Became                                                            | Overturned by                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A view of one codebase                                   | One world, a continent per repo                                   | Measurement. Across 271 days of one QuartzX folder the median day touches six distinct repos and the peak twenty, against sixty mounted, and the whole portfolio lays out at twice the span of its largest member.                                                                                                           |
| One audio cue, for the moment an agent waits             | Silent, and none planned                                          | A distinction. `blocked` arrived and split the moment the cue was for: waiting and blocked are both "come back now", and choosing between them is worth doing with the sound in hand.                                                                                                                                        |
| Follow frames the agent's district                       | Follow travels with the agent inside a dead zone                  | The terrain quantising the camera. Framing a district gives nothing at all while the agent works inside one folder, then a lurch a district wide the moment it steps out.                                                                                                                                                    |
| The camera never moves on its own                        | One bounded ease when activity leaves the dead zone               | Measurement. Against an agent working across QuartzX.Web2 at Overview the centre of activity never left the zone and the move never fired once, so the budget is a few a day and not a few a minute.                                                                                                                         |
| Nothing on the keyboard moves the camera                 | `Space` held turns a drag into a pan                              | The hardware. A trackpad has no middle button, so the city builder's binding on its own leaves a whole class of hand unserved.                                                                                                                                                                                               |
| `PreToolUse` on a named list of tools                    | `PreToolUse` on every tool, families named in the adapter         | The vendor's surface. The list sits in a settings file on someone else's disk and goes stale every time Claude Code ships a tool, and a tool nobody taught strata about is an agent working, not an agent absent.                                                                                                            |
| Hook state is two flags, installed and heard             | Four states, and an audit that names the drift                    | A settings file left by an older build. It passed as installed while blind to every event it was never given, so a post outranks a file and drift outranks a post.                                                                                                                                                           |
| Imports resolved into roads, lit on the block you select | No import graph at all                                            | A question: do I actually need this? Nothing but the selection highlight ever read a road, and the beacon walks streets, which are a pure function of the layout. The resolver, the whole-repo scan, the `roads.seeded` baseline and the `~/.strata` cache all went with it, and strata stopped opening source files at all. |
| The snapshot carries the layout of now                   | It carries the mounts, and the panel folds the present            | Redundancy the panel was already paying for. `restore` folded every event and then discarded the layout it had just built, in favour of a copy sent beside it, so 4.17 MB of a 14.62 MB first message was a thing the client had already computed and thrown away. Sending the past alone leaves 10.44 MB.                   |
| The fold copies the block table per event                | One copy per run, taken before the first event that moves a block | Scale. 4,000 events over 14,614 blocks is 58 million map insertions and three and a half seconds on every connect, and folded as a run it is one millisecond. A keyframe is still the world it was, because `foldRun` never writes into the moment it started from.                                                          |
| The dev scratch is a copy of your repo                   | An invented 22-file workspace, `--scratch-from` for a real one    | What the actions are for. A folder flying and the ground repacking read better on a corner you can see whole than on a near-identical twin of the repo beside it, and 22 files reseed instantly on every restart.                                                                                                            |
| A cast shadow carries "sitting on" at every tier         | A painted dark carries it, at the two plate tiers                 | Scale. One directional shadow map cannot resolve a one-cell tower across a world hundreds of cells wide, so `shade.ts` paints the cue half a cell out from each plate's footprint and it never moves with the key light.                                                                                                     |
| The key light drifts a few degrees over ten minutes      | It swings close to forty and comes back                           | The implementation, which went wider than the design asked and reads better for it. The design names the amplitude now rather than the swing being brought back down.                                                                                                                                                        |

Six kinds of thing did the overturning, and they are the ones worth watching for:

- **A question**, usually "do we actually need this?". The cheapest of the six and the one that
  removes rather than adds: it took the whole import graph out in an afternoon. It was also the
  last to appear, because a question needs someone to ask it and the other five arrive on their
  own.
- **Measurement**, and always against a real repo rather than a fixture. Every number in
  `DESIGN.md` that came off Web2 or the 271-day folder either confirmed a rule or moved it.
- **Scale.** Several decisions were right on 22 files and wrong on 14,000: the block fold, the
  shadow map, the cost of cloning a scratch.
- **Someone else's surface**: a vendor's tool list, a trackpad with no middle button, a `cwd`
  reported through a symlink. None of these are ours to fix, and a rule that assumes one of them
  is a rule with an expiry date on it.
- **Seeing it drawn.** The light's swing was found in `light.ts` and not in the design, and the
  occlusion window and the world's resting state each went through a mockup before a line about
  them was written.
- **The code already answering.** The panel folded the whole log and threw the layout away; the
  block table was copied once an event where a run needed one copy. Neither wanted a measurement
  to find, only a reading of the thing already running. The measurement came after, to size the
  win rather than to notice it.

A row lands here in the edit that overturns the decision, not afterwards. The reason is only in
hand while the thing is being changed.
