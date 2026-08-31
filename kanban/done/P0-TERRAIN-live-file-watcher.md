# Live file watcher

## Description

The server watches the repo and emits `block.added`, `block.removed`, `block.changed` and
`block.moved` after the snapshot, so the map moves as files do.

## Acceptance Criteria

- [x] Creating, deleting and editing a tracked or untracked-not-ignored file emits one event
- [x] A rename emits `block.moved`, not a remove and an add (blob sha against the index, or
      same basename and size within one tick)
- [x] Ignored paths never emit
- [x] Bursts are coalesced per tick (50 ms quiet, 250 ms cap)

## Technical Notes

- Native `fs.watch` recursive as the trigger; git re-listed on every tick as the truth, so
  ignore rules are git's own and unstaged renames are paired by content
- Events are `StrataEvent`s from `@strata/core`; the server adds `at`
- An arrival is emitted once it has been listed on two consecutive ticks
- The snapshot's `git ls-files` call needs a `maxBuffer` well above Node's 1 MB default: a
  14 000-file repo already overflows it (ENOBUFS)

## Definition of Done

- [x] Specs on the reconcile and rename logic (pure parts in core)
- [x] `npm run gate` green
- [x] ENGINEERING_NOTES §3 updated
