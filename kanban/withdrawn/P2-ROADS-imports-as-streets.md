# Imports as roads

## Description

Resolve in-repo imports into `Road`s on the server and light them along the streets for the
selected block; nothing is drawn at rest (DESIGN.md · The vocabulary).

## Acceptance Criteria

- [x] `import ... from` and `require(...)` resolved with tsconfig paths; only in-repo targets
      become roads; `road.added` / `road.removed` follow file changes
- [x] Selecting a block (P1-NAV) lights its imports along `route()` for as long as it stays
      selected; nothing is drawn at rest

## Technical Notes

- A `Language` in core owns specifier extraction and resolution for its extensions; TypeScript
  is the one entry (relative with extension probing and the `.js` to `.ts` swap, tsconfig
  `paths` exact and wildcard, workspace package names to `src/index`). Externals are not roads
- `RoadIndex` in core keeps specifiers per file and diffs the road set; the server only reads
  files (bounded concurrency, binaries and files over 512 KB skipped). An edit tick re-resolves
  the edited files; a structural tick re-resolves everything, so a road appears when its target
  arrives
- Roads live in `Moment`, so they replay and scrub like everything else
- On selection the panel routes one road per frame along the streets; outgoing bright,
  incoming dimmer; nothing at rest

## Definition of Done

- [x] Specs on resolution (pure parts in core)
- [x] `npm run gate` green

## Withdrawn 2026-08-31

Built, shipped, and taken back out the same week. Nothing but the selection highlight ever
read a road, and the highlight is not wanted: what the map needs between two blocks is the
street an agent walks, which `route()` derives from the layout alone and never needed an
import. The resolver, the scan, the `roads.seeded` baseline and the `~/.strata` cache went
with it. See ENGINEERING_NOTES section 6.
