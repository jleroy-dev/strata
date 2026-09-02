# Drone free flight

## Description

A fourth camera mode, flown rather than aimed, entered by `D` and never by the `C` cycle. The
one mode that serves no read: it exists because the panel is worth enjoying, and it is the
first thing in Strata that is a toy rather than an instrument.

Settled on the board `docs/mockups/2026-08-31-1604-drone.html`, which flies the real layout of
two mounted repos. DESIGN.md · Camera carries the decisions; ENGINEERING_NOTES §6 carries the
four they overturned.

## Acceptance Criteria

- [ ] `V` enters Drone from any mode and `Esc` or `Home` leaves it; it is absent from `NEXT_MODE`
      so the `C` cycle stays three stops. Not `D`, which the hand needs for strafe
- [ ] Leaving returns the bearing to the canonical yaw; the mode never survives a reload and is
      never the state the panel opens in
- [ ] Helicopter control: `WASD` moves on the horizontal plane relative to the nose, `E` and `Q`
      take altitude, `Shift` boosts, `Ctrl` is the precision hand
- [ ] The gimbal is locked to the nose: the view turns at the machine's yaw rate and never
      faster, and the tilt is rate limited too, at half the yaw and derived from it
- [ ] The tilt runs from straight down to 35 degrees above the horizon, so a tower can be looked
      up at from its foot
- [ ] The turn carries long after the hand lets go: the nose works through whatever lead was
      banked, about 70 degrees in the first second and five seconds to settle from full deflection.
      The aim must never be pulled back towards the nose to cut that short, and the tail ends on a
      brake rather than a fade
- [ ] Speed is proportional to height above the ground, floored and capped, so the ground crosses
      the frame at the same rate at any altitude and one control covers the world and a single
      district
- [ ] The body noses over into a push and settles to a cruise attitude, rolls into a strafe and
      banks into a turn, a few degrees and more under boost, decayed fast
- [ ] The nose-over costs a bounded slice of height and nothing more: the machine never sinks
      while it cruises, because height is its throttle
- [ ] Climbing runs at a third of cruise and diving at half, each floored and capped
- [ ] A dive with the nose over banks speed past what the altitude allows and bleeds it over a
      few seconds; a straight drop banks nothing
- [ ] The lens opens from the map's 30 degrees to 50 on entry and closes again on leaving, eased
      both ways, and on top of that the field of view opens with the fraction of the speed the
      altitude allows and closes at rest. Without both the same speed reads as slower, which is
      most of what "it feels slow" is
- [ ] Thrust and drag integrate per axis in the drone's own frame; the altitude speed is a cap,
      never a target
- [ ] Ground effect: the permitted descent shrinks to nothing as the floor rises, so a dive
      settles rather than clamping
- [ ] Towers are slid along, not bounced off: the position eases out of the cell and only the
      velocity heading into the wall is cancelled. No crash, no damage, no fail state
- [ ] `T` locks the look onto the nearest agent while travel stays free; any look input releases it
- [ ] Striker on `Space`, full auto: hitscan resolution with a tracer drawn travelling, spawned
      clear of the lens but never so far that a close shot is over before it is drawn. A short
      round flies slower so it lasts a few frames whatever the range
- [ ] A hit rings the tower: it leans about its foot for one or two oscillations, its cap flashes,
      a shock ring crosses the platform and sparks come off the contact
- [ ] Grapple on `F`: bites a tower and pulls, as a force added to the flight rather than a path
      the drone is put on. Whatever speed it already had survives and composes with the pull, the
      stick keeps working while the cable is out, and `F` again cuts it early
- [ ] The cable lets go at the standoff with the speed intact, so the drone flies past and coasts
      to rest on its own. It never arrives stopped
- [ ] A miss flies to the weapon's range and expires, with no penalty of any kind
- [ ] Nothing a weapon does changes a block, outlives its own effect, or reaches the stream, the
      roster or the timeline
- [ ] Sound on the shot, the hit and the cable release, and nowhere else in the product. The hit
      is pitched by the tower's height
- [ ] HUD names the way back on entry rather than after a delay; the block at frame centre is
      labelled in place of the hover label
- [ ] Composes with the scrub: a frozen world can be flown
- [ ] A click while flying picks nothing, so a beacon under the cursor cannot throw the reader
      into Follow mid flight
- [ ] Fog is read from the drone's own height above the ground, not from the map camera's
      distance, which stops moving the moment Drone takes over
- [ ] Entering stands the drone exactly where the camera already was, at any distance, and
      leaving hands the eye back where it stood. Neither seam is a cut
- [ ] Leaving keeps the bearing and the position it had, and lets Overview ease the rest of the
      way to the canonical yaw, rather than cutting to it

## Technical Notes

- `drone.ts` beside the renderer, importing no `three`, with a spec, per law 6. Velocity
  integration, the altitude clamp, the wall slide and the speed curve are all pure
- Drone does not write the other modes' four numbers. It owns an eye pose and converts to a
  `View` on entry and exit, because `View.focus` is a point on the ground and a tilt above the
  horizon has none. The board's readout says `focus ahead none` the moment the nose comes up,
  which is the evidence for why the shared record could not hold
- The surface height under a cell is a pure function of the layout and belongs in `core` beside
  `footprint.ts`. The lattice is a grid, so it is a map lookup and never a raycast
- `movementX` is quantised to whole pixels and turns a slow drag into detents; the board reads
  fractional `clientX` deltas and `getCoalescedEvents()` instead. Under pointer lock there is no
  `clientX`, so that path keeps the detent and only damping softens it
- Pointer lock is an enhancement and never the requirement: VS Code webviews need the permission
  on the root document, not only `allow-pointer-lock` on the iframe, and milestone two hosts
  `web/` in a webview
- The look gain is a fixed angle per pixel, never a fraction of the viewport. Dividing by the
  screen height is the orbit convention, and it makes the same drag command less turn on a taller
  window, which reads as the camera refusing to move
- A struck tower is recomposed about its foot, not its centre, or it slides instead of leaning.
  The base quaternion and foot position of every tower have to be kept for that; the instance
  matrix alone cannot be leant
- Audio is synthesised rather than sampled, so no asset ships. The context can only be built
  after a gesture, which the click into the panel already provides
- Under pointer lock, read `movementX` off the top level event and never off the coalesced ones.
  Browsers disagree about whether a coalesced sample carries its own share of the movement or the
  whole aggregate, so summing them multiplies the turn. Dragging is immune because absolute
  positions cannot be double counted, which is the tell if this ever comes back
- The altitude speed limit caps what the drone can drive itself to, never what it is already
  carrying. Scaling the velocity down the instant the allowance drops confiscates momentum: at
  the end of a grapple it took 48 cells a second to 7 in a single frame, which is the whole of
  why the pull felt like a stop
- A taut cable counts as power, so the light air drag applies rather than the brake. Under the
  brake the pull reached only half the speed it was allowed
- The drone's cells are the layout's, uncentred, while a `View`'s focus is measured from the
  world's middle. Deriving the entry pose from the view therefore lands the drone half a world
  away. `Surface.cellAt` inverts the bend and hands back the cell a point in the scene stands
  over, so entry is taken from where the camera actually is rather than from where a view says
  it should be
- A round is geometry, not a sprite: two nested octahedra stretched along their travel, a lit
  flat shaded shell around an unlit core drawn above one so the bloom takes it, spinning on the
  travel axis so the facets flash as they turn through the key. The panel is flat shaded boxes
  throughout and a soft textured billboard was the only gradient in it, which is why it read as
  borrowed. Geometry also has volume from every angle, which is what a stretched quad and a thin
  box each failed at in their own way
- The striker alternates two muzzles that converge on what the reticle found, so a burst reads as
  a pair rather than a line
- The two weapons are told apart on four axes at once, because one is fragile: a spindle against a
  ring, magenta against cyan, a roll about the travel axis against a tumble about a cross one, and
  120 cells a second against 85. The rotation axis is the design's own trick, the one that already
  separates a read from an edit from a shell command
- Glow is a soft additive billboard behind the round, not a scaled copy of the round. A scaled
  solid has no falloff anywhere in it, so it thickens the shape instead of lighting the air around
  it. The geometry stays hard and the light around it is soft, which is the split that took three
  attempts to find
- A lit material is tone mapped and can never cross the bloom threshold, so anything meant to
  glow has to be drawn unmapped above one. That is what the unlit core is for
- The round is long and thin, five cells to a sixth of one. The reference reads because its camera
  sits behind and above its ship and sees the pair three quarter on; ours sits directly behind, so
  the muzzle spread is what buys the same lateral travel and matters more than the shape does
- The round is a hot magenta and the cable and impacts stay the instrument cyan. The hue wheel is
  full, so a saturated round does sit near an agent slot, which is allowed because it is transient
  and moving and nothing else in the panel behaves that way. What a weapon leaves on the world
  stays neutral, so it is never read as weather
- The recoil impulse is tuned against the peak it produces, not copied from the board. The board
  integrates the kick explicitly and the panel implicitly, and the same impulse through the two
  gives a 60 per cent bigger nose lift under sustained fire, because the explicit form sheds more
  of the impulse in its first step. Constants do not port between integrators; results do
- The long tail on the turn is the feel, not a defect. It was once read as a bug and damped with
  a self-centring aim, which cut the carry to under a second and was wrong
- Rotation keeps no velocity at all. The lead is the stick deflection and the turn rate is a
  shaped function of it, `(1 - expo) * u + expo * u^3` over the deflection band, with the frame's
  step clamped to the lead so it can never overshoot whatever the frame length was. Springs on
  the rotation were tried twice, explicit then implicit, and both carried a whole class of bug
  that this shape cannot express
- With the gimbal locked, how far the aim may lead the nose has to be capped, at a fixed number
  of seconds of travel so it scales with the yaw rate. Unbounded, a sweep banks far more turn
  than the machine can deliver, and the moment the gap passes half a turn the shortest path flips
  and the nose runs away from where it was sent. The cap has to be applied before the locked
  branch returns, not after it
- Hit stop must not reach the gimbal, and must not fire on an automatic weapon. It froze the
  camera's own rotation for about a third of every second under sustained fire, which reads as
  the gimbal fighting the hand
- Both rotation axes are a critically damped spring under a rate cap, the same shape `spring.ts`
  already gives the other four numbers. A proportional chase through a lagged rate is a second
  order system with no damping term: at any inertia worth feeling it rings, and two axes ringing
  out of phase read as the view spiralling. The cap only ever reduces the velocity, so it cannot
  put the overshoot back
- Reuse rather than build: `window.ts` for occlusion at low altitude, `caption.ts` for the centre
  label, `detail.ts` for the tower budget as the eye descends
- Settle time is set by the lead alone, `leadSeconds / (1 - expo)` as a time constant, whatever
  the yaw rate; the carry in degrees is the product of the two. The two knobs are separable, so a
  retune can trade tail against turn without touching the curve
- The lead cap, yaw rate times lead, must stay under half a turn: 150 by 1.2 lands on it exactly
  and the wrap flips. It is enforced before every step, so any cap short of 180 holds by
  construction; a spec pins it under 165 for margin, because nothing else stops a future retune
  from breaking the machine
- The dead zone has to be smaller than a pixel's worth of look, or a one pixel drag never moves
  the nose and the nose always parks a dead zone short of the aim. At one degree against 0.58 a
  pixel that was half a cell of aim error at thirty cells, and it read as detents. Pinned too
- A key is held from its keydown to its keyup and nothing else decides. The OS only autorepeats
  the last key pressed, so a timer that expired a key without a fresh keydown killed every chord
  after 2.5 seconds: forward and fire, forward and strafe, forward and climb. `keys.ts` holds the
  set, and the window's blur, visibility and pointer lock changes clear it
- The turn curve's floor and brake did not port from 40 to 130 either. The same 4 degree brake
  that took 1.3 seconds from a 6 deg/s floor took 0.4 from 19.5, eleven times the deceleration,
  and the smoothstep it used never arrives, it crawls until the dead zone catches it. The brake is
  20 degrees now and the rate falls with the square root of the remaining lead, a constant
  deceleration, so the nose arrives in a finite time; the board's readout shows the deceleration
- Height is the throttle, so anything that sinks the drone under forward thrust bleeds its own
  speed cap. The first helicopter sketch sank it continuously and it spiralled from 20 cells to
  the floor in four seconds at 5 cells a second. The sink is a nose-over dip only, the transient
  while speed is still building, and vertical velocity brakes rather than drags when no lift is
  commanded so the dip ends when the nose settles
- Dive energy banks only while the lift stick is down and the nose is moving forward. Banked from
  any descent, the nose-over dip itself fed it and a vertical drop stored a surge for the next
  push, which is a strange landing. The allowance extends the cap rule rather than breaking it:
  the cap still bounds what the drone drives itself to, and energy raises it for a while
- The nose-over needs a faster attack than release, or the surge closes before the lean arrives
  and a six degree nose-over peaks at three
- Speed that grows slower than height makes the ground cross the frame ever more slowly as the eye
  climbs, so the mode felt slowest at map altitude, where it crosses the most ground. Proportional
  speed holds the optic flow constant. The lens is the other half: through a 30 degree telephoto
  the same speed reads as slower, so Drone opens it to 50 and eases it back on leaving
- The tower budget saturates before Drone does. On Web2 the 6000 tower cap is reached in Follow at
  55 cells out (38 fps against 61 at Overview) and Drone at street level draws the same 6000 at
  36 fps. Admission ranks countries by pixels per cell at their centre, so a low eye admits
  distant countries whose towers are under a pixel wide. That is a `DRAW` card, not this one

## Open

- Whether the plate skirts, the painted contact dark and the tower margins hold up at six cells,
  where every seam is visible. They were composed for 38 degrees and at least 45 cells back

## Landed

- `web/drone.ts`, pure and free of `three`: the eye pose, the thrust and drag flight, the ground
  cushion, the wall slide, and the gimbal as a shaped rate curve on the lead. 26 specs
- The gimbal rates, picked by flying three presets on the board against the old pair: yaw 130
  deg/s, tilt derived at half, lead 1.2 s, dead zone a quarter degree. The old 40 came from
  gimbal pan guidance, which governs nothing once the gimbal is bolted to the nose
- The HUD names the mode; it read `Follow · auto` in Drone because the name had no drone branch
- Speed proportional to height, the lens opened to 50 degrees, a harder lean under boost, and the
  turn's tail ending on a constant deceleration brake. The chord stall is fixed: keys are held to
  their keyup, in `keys.ts`, with a spec
- The helicopter feel: nose-over with a bounded dip, vertical caps at a third and a half of
  cruise, dive energy that bleeds, and a bank into turns. 60 specs on `drone.ts`
- `core/ui.ts` carries `drone` as a fourth mode, absent from `NEXT_MODE`, entered and left by its
  own key, left by `Home` and by `Escape` before `Escape` means anything else, and deaf to the
  keys that would take the camera somewhere else. 7 specs
- The HUD names the way back for it

## Still missing

Soft lock on `T` and the centre of frame label. Pointer lock is also unported; the panel is drag
look only.

The hit reaction reuses the effects vocabulary rather than leaning the tower about its foot. A
struck tower flashes, throws sparks and sends a wave across its platform, but it does not sway:
the tower matrices belong to `terrain.ts` and reaching into them for one instance was not worth
it against effects that already exist and are already drawn.

## Left to verify

Everything is wired and the gate is green, but none of it has been flown in the running panel.
`D` enters and leaves, `Esc` and `Home` leave, drag looks, `WASD` moves, `E` and `Q` climb.

- The entry pose comes from `camera.view`, so entering from Overview starts high and far back.
  Whether that reads as a descent or as a jolt is a question for the dev server
- `dronecam.ts` builds the local frame by sampling the bent surface a twentieth of a cell along
  x. Near the world's centre that is stable; it has not been checked at the rim
- Leaving jumps rather than eases, and recomposes Overview. DESIGN.md asks for the bearing to
  spring back over about a second, which is not built
- The weapons are not built at all: no striker, no grapple, no audio

## Definition of Done

- [ ] `npm run gate` green
