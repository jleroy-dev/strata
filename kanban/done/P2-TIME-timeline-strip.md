# Timeline strip

## Description

The last hour along the bottom edge, one lane per agent, a mark per touch. Dragging scrubs the
map to that moment, rebuilt from the event log (DESIGN.md · Timeline).

## Acceptance Criteria

- [x] Strip covers the trace horizon (1 h) and shares that number with trace decay
- [x] Marks are in the agent's colour; hovering a roster row dims the other lanes
- [x] Scrubbing rebuilds terrain and weather as of that time; beacons hidden while scrubbed
- [x] `Esc` returns to now; the strip composes with any camera mode

## Technical Notes

- `History` in core holds a baseline layout and the events since; the server keeps one, fed
  by its own broadcast, and sends a new client the baseline snapshot plus the log; the panel
  keeps the same class and folds `at(t)` from keyframes every 64 events
- The scrubbed moment is animated with `motions(shown, at(t))`, the same path as live; the
  beacons are hidden while scrubbed
- A core spec pins that folding the emitted events reproduces `applyTerrain`; the server
  checks the same once a minute outside production
- The hour is the horizon; older history is `git log`

## Definition of Done

- [x] `npm run gate` green
