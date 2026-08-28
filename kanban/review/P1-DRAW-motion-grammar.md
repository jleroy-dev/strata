# Motion grammar

## Description

Rise, sink, travel and pulse as written in DESIGN.md · Motion, with per-frame coalescing.

## Acceptance Criteria

- [x] Add rises over ~600 ms with a fading crown glow
- [x] Remove sinks and leaves a scar that fades over ~10 s
- [x] Move: dip, lift, arc, squash, ripple, colour crossfade, one ribbon retracting along its
      path with the scar, hover arc for a minute, agent hue when attributed; rename in place
      blinks the cap; a folder move flies the district with one ribbon; beacons ride moving
      blocks and platforms, pulses re-route, a removed block lifts its beacon
- [x] Edit strikes (pop, shock wave, column, sparks), then a worksite loop (aftershocks, cap
      flicker, spark drizzle, standing work light); read loops (sweep band); running turns
      (orbiting arc, lifted beacon); idle after 20 s; DESIGN.md · Motion
- [x] 200 events in one tick read as one breath, not 200 animations
- [x] Heat decays over ~20 s, trace over 1 h with the last toucher's tint; no blending
- [x] Contested cap split between two agents' colours, static, within a 5 min window
- [x] Beacons sized in screen space, breathing, ping ring on a fresh touch
- [x] Agents travel the streets between blocks (route computed in core), trail fades ~45 s
- [ ] Imports hidden at rest, lit along the streets for the selected block (moved to
      P2-ROADS: roads are not resolved yet and selection is P1-NAV)
- [x] Bloom, neon caps, plate rims, shockwave pulse on edit (DESIGN.md · Look)

## Technical Notes

- Motions are the diff between two worlds (`motions()` in core), never a reading of event
  kinds: a burst is one diff, a reconnect eases to the snapshot, a scrub is the same animator
- `strata demo <dir>` (or `npm run demo`) seeds a scratch repo and drives file operations and
  two fake sessions against a server watching that dir; start the server first

## Definition of Done

- [ ] Witnessed on a real repo through the dev server
- [x] `npm run gate` green
