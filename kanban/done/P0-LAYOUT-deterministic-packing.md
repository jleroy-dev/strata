# Deterministic packing

## Description

Replace the placeholder rows in `web` with a layout computed in `core`: one sticky cell per
block on a slack grid per district, districts shelved on their country's plate, countries
shelved on a stable grid.

## Acceptance Criteria

- [x] Same input, same coordinates, pinned by a snapshot spec
- [x] Slots are sticky: a block keeps its cell while it exists, a rename in place moves nothing,
      an arrival takes the first free cell, a removal frees one
- [x] Districts are packed with ~20% slack; growth beyond it re-packs that district once, and
      the country only if the platform edge reaches a neighbour
- [x] Adding one file within slack moves nothing else
- [x] Removing a country leaves the others where they were
- [x] Binary files (extension list in core) get the minimum height; text files read size
- [x] The web package reads positions off the event and computes nothing
- [x] The country grid aims for a square aspect (DESIGN.md · Layout); no other panel
      constraint reaches the layout

## Technical Notes

- Layout is a pure function `(blocks) -> Map<BlockId, Placement>` in core
- Placement is on an integer lattice: one empty cell between districts, three between
  countries; a `route(from, to)` in core walks the lattice corners (A*, alleys cost more)
- Accents: a hue band per family (top-level folder), variants assigned by greedy colouring on
  the plate-adjacency graph so touching plates differ; deterministic, pinned by the spec
- Countries are shelf-packed by family first, then footprint, into rows aiming for a square; the widest district
  floors its country's width. Checked on TellMeAStory (1178 files, 30 countries): an 84 x 76
  lattice; on a 14 000-file monorepo, 309 x 302
- The server sends placements with the snapshot and with each structural event
- Force-directed layouts are refused (DESIGN.md · Layout)

## Definition of Done

- [x] Snapshot spec committed with a fixture repo listing
- [x] `npm run gate` green
- [x] DESIGN.md · Layout updated with what was chosen
