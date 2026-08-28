# Strata: the design

Strata is an abstract, live 3D view of one codebase. It sits in a side panel and is read in a
glance, not played. Every decision below serves a two-second read.

## The primary use

Strata is a companion: it runs beside the terminal and shows the state of one repo with
whatever agents are on it, zero, one or several, and it is read from the corner of the eye.
The question it answers first is "where are the agents right now, and what are they doing".
The unit is time, not a session: a session is a beacon that arrives and leaves, and nothing on
screen is scoped to its lifetime. Two other uses exist and are served by the same picture, in
this order of priority:

1. Companion (primary): agents are running, the user is reading a terminal, the panel earns
   attention through motion in peripheral vision.
2. Map: the terrain is stable enough that after a while the user knows where things live. A
   consequence of the layout law, not a feature to build for.
3. Timeline: the same events fed from the log, scrubbed back along a strip. A control that
   composes with the companion, never a mode of its own.

Any control or feature that only serves 2 or 3 is weighed against what it costs 1.

## What it is not

Not a town. No roofs, windows, trees or people. The moment it looks like a place it is read as
a place. It is volumes and light, seen from a drone at night.

Not a game, though it borrows a game's feel. The borrowing is two things and stops there:

- Presentation: the spectator vocabulary. A fixed frame, a HUD roster, ping rings, a mode key,
  a selection reticle, minimap-grade legibility.
- Juice: feedback that reads as alive. Eased rises and sinks, bloom on a pulse, a ping that
  ripples, a beacon that breathes.

No game systems. No score, streak, level, progress bar or achievement, ever. A number on the
panel becomes a thing to optimise, and nothing the companion is for asks for one.

Silent by default. One audio cue exists, for an agent finishing its turn and waiting for the
user, because that is the one moment the user is meant to come back for and the one event
peripheral vision cannot deliver once the eye has left the panel. It is off until enabled.

## The vocabulary

Three channels, and nothing else gets one until these are earned:

| channel  | means     | read as                                              |
| -------- | --------- | ---------------------------------------------------- |
| colour   | family    | a hue band per top-level folder; neighbours differ   |
| height   | magnitude | text size (later: churn); a binary is a slab         |
| distance | hierarchy | streets between districts, avenues between countries |

Colour cannot name a country: a person tells ten hues apart, a monorepo has a hundred
countries. So colour says what kind of thing a country is, read off its top-level folder and
never configured: apps warm, libs cool, docs green, plumbing (tooling, dot-folders, the root)
grey. Inside a band, countries take variants assigned so that no two touching plates match.
Countries are also packed by family first, so hue and place say the same thing from far:
"the apps are there, the libraries are the big cool mass, the plumbing is the grey fringe".
Identity is position and name, in the roster and on hover; it always was.

Height reads the magnitude of text. A binary file (image, font, media, archive: an extension
list in `core`, read off the repo and never configured) is a slab at the minimum height: its
byte count is not a magnitude of anything the panel is about, and a folder of images is a
floor of tiles, not a wall taller than the codebase.

Depth is hierarchy: a country is a land plate, a district a raised platform on it, a block a
tower on that. The gaps are streets: one cell between districts, three between countries. They
are never drawn as lines; they are the ground the lights travel on.

Imports are not drawn at rest. They are data behind a selected block: select one and its
imports light along the streets for as long as it stays selected. A resting map criss-crossed
by lines that cut through towers is a wiring diagram, not a place.

## Terrain and weather

- **Terrain** is the repo: `git ls-files` plus untracked-but-not-ignored files, resolved
  imports as roads. The file system and git are the only source; the town exists on cold open.
- **Weather** is the agents: a Claude Code session is a light with its own colour derived from
  its id. Reading a block is a soft light on it; editing is a pulse. Weather never changes
  colour or height; structure owns those.

## Motion

A static view is a treemap with extra steps. The change is the product.

- Add: a tower rises over ~600 ms, a glow at its top fades.
- Remove: the tower sinks, the footprint stays as a faint scar for a while.
- Move: the block is picked up and put down, never slid. A dip of anticipation, a lift with a
  stretch, a parabolic arc whose apex and duration grow with the distance (0.3 to 0.8 s), a
  squash on landing, a dim neutral ripple, and a scar where it stood. Colour crossfades from
  the old country's tint to the new one in the air, because colour is ownership and ownership
  changes in flight. The flight leaves a ribbon along the arc, the same additive ribbon the
  agents leave on the streets, brightest at the head; after landing it retracts from the
  origin towards the destination over about 1.5 s, and the scar fades with it. Nothing is
  drawn after that: a line that stays is a diagram annotation, and the map is not a diagram.
  Hovering the landed block within a minute shows a thin arc back to where it came from. If
  an agent is on the block, ribbon and arc take that agent's hue: "Claude moved this" is a
  better read than "this moved". This is the animation that makes a refactor legible.
- An agent on a moving block rides it: the beacon sits on the tower through the flight and
  lands with it, and rides the platform through a folder move. Nothing teleports to meet
  anything, and a beacon that stays behind over a scar is a broken promise. A pulse in transit
  towards a block that moves re-routes to the new cell at once. A beacon whose block is
  removed lifts to hover height and waits for the next event: the ground went away.
- Rename in place: with sticky slots nothing travels; the cap blinks white once and the label
  updates. Enough to say "something changed here" without pretending it moved.
- Folder move: a burst of moves that mostly share a destination is one move of the district:
  its platform lifts with its towers as one body, flies the same arc, leaves one ribbon and
  lands once. Below
  that threshold the blocks fly individually with a 30 ms stagger, a flock rather than a
  burst.
- Edit: a strike, not a colour change. On the contact frame the beacon pops and the cap
  flashes; a thin shock wave crosses the cap and dies before the neighbours; a light column
  fades to nothing at its top; a few sparks. Half a second, then only heat remains.
- Read: a loop, not a strike. A thin band in the agent's colour sweeps the tower from base to
  cap on a 0.8 s cycle, faded at both ends, for as long as the agent's verb is `reading`.
  A state loops and an event strikes; that difference in time, not in size, is what makes a
  read and an edit legible from the corner of the eye.
- Editing, sustained: after the strike the block is a worksite. Low-energy aftershock waves on
  an uneven beat, the cap's glow flickering like a welding light, a spark or two every couple
  of seconds. Radial and bursty where the read sweep is vertical and metronomic, and quieter
  than the strike so arrival still lands. A faint standing column over the block, its
  intensity riding the flicker, is the part of the state that reads from Overview, where the
  waves and sparks are a few pixels.
- Arrival: a session starts with nothing touched, so the beacon has no place. It comes from
  outside the terrain: a line of light descends from above the map centre, the core ignites at
  its end with a ping, the halo blooms in, the roster row slides in as `idle`. It hovers there
  until its first event, then drops to the streets and travels like any trip. About 0.7 s.
- Waiting: the turn is over and the next move is the user's (`Stop`). The beacon stays on its
  last block, the halo dims to half, the breathe slows, cap dark, no loop. The quietest live
  state, and the sound cue's moment. `idle` looks the same and differs only in the roster word.
- Departure (`SessionEnd`, or a long silence): the reverse of arrival. The halo tightens into
  the core, the core rises along a fading line and is gone, about 0.8 s. Trace stays, the
  ribbon finishes fading on its own clock, the roster row reads `done` for a moment and drops.
  Nothing else on the map reacts.
- Running: a shell command has no block and no known length. A third of a circle orbits the
  beacon's core at a fixed screen radius, one turn every 1.5 s, the universal "working" sign,
  and rotation is an axis no other state uses. The beacon lifts a little and the cap under it
  goes dark: the agent is at the terminal, not on the file. The arc stops on the next event.
- Idle: twenty seconds without an event ends `reading` or `editing`; the loop stops and the
  beacon just breathes. A stalled session must not look busy.

Three states, three kinds of motion, no shared axis: read sweeps (vertical), edit bursts
(radial), running turns (around the beacon). That is what tells them apart from the corner
of the eye without reading the roster.

Weather leaves two kinds of memory, so a glance back answers "what did it touch since I last
looked":

- Heat: bright and short. A touch tints the tower body; heat decays over about 20 seconds.
  Longer and an active session lights everything, and a map that is all lit says nothing.
- Trace: a touched tower body keeps a faint tint of the colour of the last agent that touched it,
  dimming on the clock over a longer horizon. Fog of war in reverse: the revealed ground is
  the shape of recent change, whoever made it and whether or not they are still here. One
  agent leaving changes nothing for the others.

Heat lasts about 20 seconds and trace one hour, dimming linearly so the last ten minutes are
clearly brighter than the rest. The hour is the same number the timeline strip covers.

Two agents on one block never blend: a mix of two hues is a third hue, and a third hue is what
a third agent looks like. The tint is the last touch. Two agents touching the same block
within five minutes make it contested: its cap is split between the two agents' colours,
static, at the cap's normal weight. Two owners is a fact about the last five minutes, not an
event, and it gets colour, never motion: on this panel motion means "happening now", and a
record that moves teaches the eye to ignore motion. The split closes when the window passes
and the last touch owns the cap again. Presence wins over the split: while an agent is on
the block the cap is fully lit in that agent's colour and the split is hidden. Nothing about
it reaches the roster or the timeline.

Agent hues are derived from the session id but snapped to a set of slots kept apart from each
other and from the country accent palette, or an agent's trace on its own country reads as
nothing.

A session ending is a small event, not a screen: the beacon derezzes, its roster row reads
`done` for a short while and drops. What you come back to is whatever heat and trace the clock
has left.

- Travel: an agent does not teleport between blocks. Its light leaves the tower, takes the
  streets (never through a tower: a Manhattan route along the gutters, alleys between towers
  at a cost, avenues preferred), and lands on the next tower; the block lights on landing.
  Behind it a ribbon in its colour lies on the street and fades over about two seconds, tail
  first, so the light reads as a comet. A refactor across two countries reads as a trip.
  A hop within a district is a blink, an avenue crossing a glance: the trip is animation, not
  latency, and the event is already in the log when the light sets off.
- Everything eases, nothing teleports, and a burst of 200 events is not 200 animations:
  coalesce per frame; a commit that touches half the map makes the map breathe once.

## Look

Volumes and light at night, with the juice a game would give it:

- Bloom on everything emissive: beacons, trails, strikes, and the cap of a tower an agent is
  on right now. A cap is lit only while it is being read or edited, in that agent's colour;
  heat and trace never reach the cap. At rest a cap is the country hue and nothing more, so a
  lit top always means "an agent is here". Plate rims stay under the bloom threshold.
- A beacon is a comet, not a dot: a screen-space glow with a point light under it that spills
  on the towers it passes, a ping ring when it lands.
- An edit is a shockwave ring on the platform in the agent's colour, expanding and fading.
- A removal sinks and leaves a scar; an addition rises with its cap lit.
- Faint ground grid, exponential fog at the horizon, a vignette on the panel edge.
- Nothing figurative: no particles that look like weather, no lens flares, no lettering on the
  terrain.

## Camera framing

Overview sits at about 38 degrees of elevation, yawed 15 degrees so streets run slightly
off-axis without the map's footprint turning into a diamond that wastes the panel's width, at
the distance that fits the map's bounding box in the panel with a small margin.
Steeper reads as a floor plan, flatter hides districts behind towers. Follow uses the same
angle over one district, framing the whole district including its tallest tower, the agent's
position biasing the frame only a little; the agent stays in view because the district does.
`F` frames the selection at that angle.

In Follow, the towers between the eye and the followed block open a soft window: which towers
is decided per tower on the ground (between the eye and the subject, with hysteresis, eased
over a quarter second), where the window opens is decided per pixel (a soft band from the
block's foot up past its beacon), and the opened parts keep their own lighting at a low
alpha. Nothing behind the subject ever fades, platforms and plates never do, and the camera
does not move for it. Mockup: `docs/mockups/2026-08-26-1652-occlusion-window.html`.

## Layout

Deterministic and stable. The same repo state draws the same picture on every machine, and a
change repositions only what changed. Every block is one cell on an integer lattice; a
district is a rectangle of cells with about 20% spare, a country a shelf of districts, the map
a shelf of countries. Districts and countries are placed once and re-packed only on
structural change, with animated transitions. Force-directed layouts are refused: they never
settle and they reorder on every change, which destroys "I know where things live".
Stability beats beauty. A treemap is refused for the same reason: it re-flows every sibling
on every insert, and a footprint that reads size says twice what height already says.

Slots are sticky and districts keep slack. A block holds its cell for as long as it exists;
a renamed file keeps its cell; an arriving file takes the first free cell; a removed file
leaves its cell free, and the scar is that empty cell. Every district is packed with about
20% headroom, so arrivals fill holes and spare cells before anything has to grow. When slack
runs out the district grows by one column or one row: the platform widens and nothing on it
moves. A platform arriving in a country or leaving it re-shelves that country's platforms,
in their existing order and at the plate's current width, so rows close and the newcomer
joins the last row: an explicit, animated event, the one the eye is meant to follow on a
folder move. Only when the plate no longer fits where it stands does it relocate to the
nearest free ground, rarer still; the other plates never move for it. An emptied district's platform goes with its files: it flies on a folder move and
fades to a scar on deletion, and an emptied country's plate goes the same way; nothing else
moves for it. Order
inside a district means nothing; nobody reads order off a grid.

When ground re-packs, the light lying on it goes with it: ribbon segments inside the repacked
area dissolve over about half a second as the streets move. Carrying them along would invent
a trip nobody made, and leaving them would put light on ground that is no longer there. The
timeline keeps the record.

The country grid aims for a square. That is the one constraint the panel puts on the layout:
Overview frames the whole map in a narrow panel, and a repo laid out as a strip is a strip of
empty space. Each shelf is packed at the width, among a dozen candidates around the square
root of its area, whose result is closest to square. The layout stays a pure function of the
repo; it is only steered towards a compact shape. Minimum block size on screen is the
camera's problem, not the layout's.

## Camera framing

Overview sits at about 38 degrees of elevation, yawed 15 degrees so streets run slightly
off-axis without the map's footprint turning into a diamond that wastes the panel's width, at
the distance that fits the map's bounding box in the panel with a small margin.
Steeper reads as a floor plan, flatter hides districts behind towers. Follow uses the same
angle over one district, framing the whole district including its tallest tower, the agent's
position biasing the frame only a little; the agent stays in view because the district does.
`F` frames the selection at that angle.

In Follow, the towers between the eye and the followed block open a soft window: which towers
is decided per tower on the ground (between the eye and the subject, with hysteresis, eased
over a quarter second), where the window opens is decided per pixel (a soft band from the
block's foot up past its beacon), and the opened parts keep their own lighting at a low
alpha. Nothing behind the subject ever fades, platforms and plates never do, and the camera
does not move for it. Mockup: `docs/mockups/2026-08-26-1652-occlusion-window.html`.

## Layout

Deterministic and stable. The same repo state draws the same picture on every machine, and a
change repositions only what changed. Packing is treemap-style per district; districts and
countries are placed once and re-packed only on structural change, with animated transitions.
Force-directed layouts are refused: they never settle and they reorder on every change, which
destroys "I know where things live". Stability beats beauty.

Slots are sticky and districts keep slack. A block holds its cell for as long as it exists;
a renamed file keeps its cell; an arriving file takes the first free cell; a removed file
leaves its cell free, and the scar is that empty cell. Every district is packed with about
20% headroom, so arrivals fill holes and spare cells before anything has to grow. When slack
runs out the district re-packs: an explicit, animated, rare event where its platform widens
and its blocks shuffle once, together. Only if the platform's edge reaches a neighbour does
the country re-pack the same way, rarer still. Order inside a district means nothing; nobody
reads order off a grid.

When ground re-packs, the light lying on it goes with it: ribbon segments inside the repacked
area dissolve over about half a second as the streets move. Carrying them along would invent
a trip nobody made, and leaving them would put light on ground that is no longer there. The
timeline keeps the record.

The country grid aims for a square. That is the one constraint the panel puts on the layout:
Overview frames the whole map in a narrow panel, and a repo laid out as a strip is a strip of
empty space. The layout stays a pure function of the repo; it is only steered towards a
compact shape. Minimum block size on screen is the camera's problem, not the layout's.

## Camera

Three modes, the spectator trio every game converges on. `C` cycles them; the HUD names the
current one.

| mode     | camera                                                     | serves                    |
| -------- | ---------------------------------------------------------- | ------------------------- |
| Overview | fixed frame on the whole map; the resting state            | companion, corner of eye  |
| Follow   | eases with one agent, zoomed to its district               | companion, wanting detail |
| Free     | orbit, zoom, pan; entered the moment the camera is touched | map                       |

Follow with no agent picked follows whichever agent acted last, which covers several agents
without a fourth mode. Clicking an agent beacon enters Follow on that agent.

The camera never moves on its own to return: `Home` or `C` brings it back to Overview and
nothing else does. A camera that drifts under a reader is the map fidgeting (law 5). A
stranded camera is made obvious by the HUD, not fixed by a timeout.

Weather is sized in screen space: an agent beacon is as many pixels in Overview as in Follow,
so it reads at any zoom. An agent touching a district the eye has not been near for a while
gets a brief ping ring, so the peripheral read is "activity over there".

## On screen at rest

Overview, no input: the map, the agent beacons, and one HUD element, the roster. Nothing
else. There is no event ticker; the terminal beside the panel is the ticker.

The roster is one row per session, in a corner: colour swatch, label, verb, district.

```
● claude-a   editing   packages/core
● claude-b   running
```

Hovering a row isolates that agent: everything else on the map and the strip dims. That is
how "what is this session editing" is answered with five agents on screen and nothing added
to the resting picture. Clicking a row enters Follow on that agent.

Rows appear with `agent.arrived` and drop shortly after `agent.left`; with no agent the roster
is empty and the map stands alone. Verbs: `reading`, `editing`, `running` (a shell command,
no block to light), `waiting` (turn over, the user's move), `idle` (no event for 20 s),
`done`. The file
path is deliberately absent from the row: it wraps in a narrow panel and text competes with
the map for the two-second read. It appears on hover of the row, and in Follow mode, where the
block is large enough that its caption card carries it.

## Empty

No agent is four different states, and the roster row says which, because the map alone
cannot:

- Quiet: hook installed, nothing running. One dim row with the last agent's colour and how
  long since it left; its trace still fades on the map; the strip still shows the last hour.
- Deaf: no hook in this project. The row names the command, copyable: the one empty state
  with a call to action, because without the hook there will never be weather.
- Disconnected: the panel cannot reach the server. The map desaturates a notch under a veil
  and the row gives the time of the last frame: the picture is a photograph, and says so.
- Cold: quiet for longer than the map remembers. No trace, an empty strip labelled with the
  quiet duration, and the map as a map.

While empty, nothing on the map moves except the light: the key light drifts a few degrees
over ten minutes, shadows lengthening as in a room where nobody is moving. Global, far too
slow to be an event, and the truthful signal that time passes. No breathing, no drifting
particles, no attract orbit: localised motion is the event vocabulary and the camera never
moves on its own.

## Timeline

A strip along the bottom edge: the last hour, one lane per agent, a mark per touch in the
agent's colour. With no interaction it already reads "quiet for forty minutes, then two agents
for twenty". Dragging it scrubs the map to that moment, terrain and weather both, rebuilt from
the log; beacons are "now" and vanish while scrubbing. `Esc` returns to now. The strip is a
time control, not a camera mode, and composes with all three. Scrolling further back than the
hour is possible on demand; yesterday is what `git log` is for.

## Controls

Keyboard focus lives in the terminal, so the panel is driven by the mouse and a handful of
keys pressed after clicking into it. Nothing on the keyboard moves the camera.

Mouse: wheel zooms, drag orbits, shift-drag pans; any of these enters Free. Hover labels a
block. Click selects it and shows the caption card. Click a beacon to Follow that agent. Click
the path in the caption card to open the file in the editor, the single bridge back to the
IDE.

Keys: `C` cycles camera modes, `Home` returns to Overview, `F` frames the selection, `Esc`
clears the selection and the scrub. Four keys, all about getting back or getting to something.

Labels appear on hover or selection only. The selected block gets one caption card: path,
size, the last three touches (agent and how long ago). In the browser the path is a
`vscode://file/<absolute path>` link, so the bridge to the editor works without the panel;
inside the VS Code panel the same click is forwarded to `vscode.open`.

## Delivery

Browser first (`packages/web`, served beside `packages/server`); the VS Code panel is a thin
adapter that arrives second and draws nothing itself.
