# Motion grammar

## Description

Rise, sink, travel and pulse as written in DESIGN.md · Motion, with per-frame coalescing.

## Acceptance Criteria

- [ ] Add rises over ~600 ms with a fading crown glow
- [ ] Remove sinks and leaves a scar that fades over ~10 s
- [ ] Move: dip, lift, arc, squash, ripple, colour crossfade, one ribbon retracting along its
      path with the scar, hover arc for a minute, agent hue when attributed; rename in place
      blinks the cap; a folder move flies the district with one ribbon; beacons ride moving
      blocks and platforms, pulses re-route, a removed block lifts its beacon
- [ ] Edit strikes (pop, shock wave, column, sparks), then a worksite loop (aftershocks, cap
      flicker, spark drizzle, standing work light); read loops (sweep band); running turns
      (orbiting arc, lifted beacon); idle after 20 s; DESIGN.md · Motion
- [ ] 200 events in one tick read as one breath, not 200 animations
- [ ] Heat decays over ~20 s, trace over 1 h with the last toucher's tint; no blending
- [ ] Contested cap split between two agents' colours, static, within a 5 min window
- [ ] Beacons sized in screen space, breathing, ping ring on a fresh touch
- [ ] Agents travel the streets between blocks (route computed in core), trail fades ~45 s
- [ ] Imports hidden at rest, lit along the streets for the selected block
- [ ] Bloom, neon caps, plate rims, shockwave pulse on edit (DESIGN.md · Look)

## Definition of Done

- [ ] Witnessed on a real repo through the dev server
- [ ] `npm run gate` green
