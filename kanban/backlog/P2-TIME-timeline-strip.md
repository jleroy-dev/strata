# Timeline strip

## Description

The last hour along the bottom edge, one lane per agent, a mark per touch. Dragging scrubs the
map to that moment, rebuilt from the event log (DESIGN.md · Timeline).

## Acceptance Criteria

- [ ] Strip covers the trace horizon (1 h) and shares that number with trace decay
- [ ] Marks are in the agent's colour; hovering a roster row dims the other lanes
- [ ] Scrubbing rebuilds terrain and weather as of that time; beacons hidden while scrubbed
- [ ] `Esc` returns to now; the strip composes with any camera mode

## Technical Notes

- The server keeps the last hour of `StrataEvent`s and serves a range on request; the web
  package replays into a second state, it never diffs
- Scrolling past the hour fetches older ranges on demand

## Definition of Done

- [ ] `npm run gate` green
