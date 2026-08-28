# Camera and keyboard

## Description

Orbit, zoom, pan, and the keyboard map from DESIGN.md · Navigation. Hover labels, one caption
card on selection.

## Acceptance Criteria

- [x] Mouse: drag orbits, wheel zooms, shift-drag pans; any of these enters Free
- [x] Keys: C cycles modes, Home returns to Overview, F frames selection, Esc clears it; nothing on the keyboard moves the camera
- [x] Hover shows the block's path; click selects and shows the caption card (path, size,
      last three touches); the path is a `vscode://file/` link built from the repo root the
      server sends with the snapshot
- [x] HUD names the camera mode; roster row per agent (swatch, label, verb, district), path on
      hover, hover isolates the agent, click follows it
- [x] Empty states as in DESIGN.md · Empty: quiet, deaf, disconnected (veil, stale label),
      cold; light drift while empty
- [x] Overview, Follow and Auto-follow (Follow with no agent picked) as in DESIGN.md · Camera

## Technical Notes

- Interaction state is one `Ui` record reduced by intents in core (`reduce`), specced; the
  camera, HUD, caption and roster only read it
- The camera eases towards a pose computed each frame (Overview fits the extent, Follow fits
  the agent's district and its tallest tower); OrbitControls is updated only in Free and takes
  over on its `start` event
- `openInEditor` in `host.ts` is the seam the VS Code panel replaces (P2-IDE)

## Definition of Done

- [x] `npm run gate` green
