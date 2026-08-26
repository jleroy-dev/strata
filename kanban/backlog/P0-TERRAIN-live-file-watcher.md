# Live file watcher

## Description

The server watches the repo and emits `block.added`, `block.removed`, `block.changed` and
`block.moved` after the snapshot, so the map moves as files do.

## Acceptance Criteria

- [ ] Creating, deleting and editing a tracked or untracked-not-ignored file emits one event
- [ ] A rename emits `block.moved`, not a remove and an add (git diff --name-status, or a
      same-size same-content heuristic within one tick)
- [ ] Ignored paths never emit
- [ ] Bursts are coalesced per 50 ms tick

## Technical Notes

- chokidar 5, `ignored` fed from `git check-ignore` rather than a hand list
- Events are `StrataEvent`s from `@strata/core`; the server adds `at`
- The snapshot's `git ls-files` call needs a `maxBuffer` well above Node's 1 MB default: a
  14 000-file repo already overflows it (ENOBUFS)

## Definition of Done

- [ ] Specs on the coalescing and rename logic (pure parts in core)
- [ ] `npm run gate` green
- [ ] ENGINEERING_NOTES §3 updated
