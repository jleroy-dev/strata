# The shore, and every plate on the one under it

## Description

A country plate is drawn 0.8 cells past its rect and a continent's land was exactly the
bounding box of its countries, so every country touching an edge hung over the water: 11 of 19
on two mounted repos. The drawn footprint of a plate lived in `web` and the rects in `core`, so
no spec could see the two together. Give the land a shore, move the skirts into `core`, and pin
containment at every tier.

Board: `docs/mockups/2026-08-31-1104-shoreline.html`, card C for the shore, card F for the
floor.

## Acceptance Criteria

- [x] Every plate's drawn footprint contains the footprints of everything standing on it, at
      every tier, held by a property over generated repos and mutation chains
- [x] The shore is derived from the constants beside it, not chosen: `COUNTRY_GAP` less the
      country skirt, so the coast is as wide as the land between two neighbouring countries
- [x] The margins run outward: 0.40 round a tower, 0.50 round a platform, 1.40 between two
      plates, 2.20 at the shore
- [x] The land hugs its extent at any size; the minimum plate applies to the reservation, so a
      seven-file repo still has water and a place of its own
- [x] `land` inside `claim` holds by construction, pinned rather than incidental
- [x] A continent's own cell zero stays put while its land grows around it
- [x] The renderer takes its skirts from `core` and decides no geometry of its own
- [x] The coast reads: a band at the land's rim, a wall under it, and a shadow where each plate
      meets what it stands on (board card I)
- [x] One clock and one easing law for the whole ground, so no two tiers of it are ever a frame
      apart and a plate is never off its land mid-settle
- [x] A plate seen for the first time grows out of the one it stands on rather than arriving at
      full size, and is inside it every frame on the way

## Technical Notes

- `core/footprint.ts` is the one place the three gaps, the two skirts and `SHORE` are decided,
  with `skirted()` and `contains()` beside them
- `atlas.ts` derives from one input: `landOf(extent)` is the extent with a shore all round,
  `claimOf` steps over the land, `at` is the land's corner plus a shore
- `ContinentPlate.plate: Extent` became `land: Rect` in world cells; `Surface`, `Body`,
  `Ground` and `motion.ts` follow, and `Body`'s continent mesh stops being called a plate
- `terrain.ts` carries a `skirt` rather than a `pad`; the dead `U = 1` is gone
- The land is a slab between `GROUND.continent.top` and `.bottom`, its grid carrying a line at
  each coast so the rim can be painted without tessellating the middle; `COAST` in `theme.ts`
  is the shore less the country skirt, so the band ends where a country's skirt begins
- `shade.ts` builds a frame of cells around a plate's footprint, clear at its outer ring and
  opaque at the plate's edge, rebuilt with the plate and hidden while it flies
- `settle.ts` holds where every plate of the ground is this frame, keyed by tier, and owns the
  clock; `Body` and `Terrain` read it and neither keeps a rect of its own. A newborn starts with
  no size at the point of its parent nearest its target, which is what makes containment hold
  through the whole ease rather than only at the ends
- `Body` sizes the land grid from the target and rewrites its positions in place while the
  ground travels, so a settle costs no allocation
- Measured on this repo through the built core: land 36.4 x 37.4, 0 platforms off their plate,
  0 plates over water. Same on the live server for both mounts.

## Not in this card

- Nothing outstanding.

## Definition of Done

- [x] Containment property in `pipeline.props.spec.ts`, the chain pinned in `atlas.spec.ts`, and
      the settling law and its containment pinned in `settle.spec.ts`
- [x] `npm run gate` green
- [x] DESIGN.md · The world and · Layout updated, ENGINEERING_NOTES §3 updated
