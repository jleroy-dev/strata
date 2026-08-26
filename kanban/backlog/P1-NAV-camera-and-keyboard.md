# Camera and keyboard

## Description

Orbit, zoom, pan, and the keyboard map from DESIGN.md · Navigation. Hover labels, one caption
card on selection.

## Acceptance Criteria

- [ ] Mouse: drag orbits, wheel zooms, shift-drag pans; any of these enters Free
- [ ] Keys: C cycles modes, Home returns to Overview, F frames selection, Esc clears it; nothing on the keyboard moves the camera
- [ ] Hover shows the block's path; click selects and shows the caption card (path, size,
      last three touches); the path is a `vscode://file/` link built from the repo root the
      server sends with the snapshot
- [ ] HUD names the camera mode; roster row per agent (swatch, label, verb, district), path on
      hover, hover isolates the agent, click follows it
- [ ] Empty states as in DESIGN.md · Empty: quiet, deaf, disconnected (veil, stale label),
      cold; light drift while empty
- [ ] Overview, Follow and Auto-follow (Follow with no agent picked) as in DESIGN.md · Camera

## Definition of Done

- [ ] `npm run gate` green
