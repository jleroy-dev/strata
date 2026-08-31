import * as THREE from 'three';
import {
  INITIAL_UI,
  TRACE_MS,
  countryActivity,
  hookStateOf,
  memoryOf,
  motions,
  reduce,
  repoActivity,
  repoWarmth,
  roster,
  rosterStateOf,
  type Agent,
  type Intent,
  type BlockId,
  type Motion,
  type RepoId,
  type RosterState,
  type StrataEvent,
  type Ui,
  type World,
} from '@strata/core';
import {
  INITIAL_ATTENTION,
  attend,
  centreOf,
  type AttentionState,
  type Point as Ndc,
} from './attention.js';
import { FOLLOW_ZOOM_FLOOR, type View } from './view.js';
import { Beacons } from './beacons.js';
import { MapCamera, type Patch } from './camera.js';
import { districtFrame, type Framed } from './framing.js';
import { drawCaption } from './caption.js';
import { Effects } from './effects.js';
import { ago } from './dom.js';
import { ADRIFT_MS, drawHud, drawLabel } from './hud.js';
import { bindInput } from './input.js';
import { Lines } from './lines.js';
import { Ground } from './ground.js';
import { Ribbons } from './ribbons.js';
import { drawRoster } from './roster.js';
import { mountSim, type Forced } from './sim.js';
import { createStage } from './stage.js';
import { Strip } from './strip.js';
import { PLATFORM_LIFT, paint } from './theme.js';
import { emptyWorld, fold, type Folded } from './world.js';
import { INITIAL_CHASE, chase, standoffZoom, type Chase } from './chase.js';
import type { Moment } from '@strata/core';

export const SERVER = `127.0.0.1:${new URLSearchParams(window.location.search).get('server') ?? '4747'}`;

const stage = createStage(document.body);
const effects = new Effects(stage.scene, stage.camera);
const lines = new Lines(stage.scene);
const ribbons = new Ribbons((agentId) => dim(agentId));
const ground = new Ground(stage, effects, ribbons, lines);
const beacons = new Beacons(stage, ground, effects, ribbons);
lines.register(ribbons);

let state: Folded = {
  renames: new Map(),
  folders: new Map(),
  hooks: new Map(),
  mounts: [],
  connected: false,
  lastFrameAt: 0,
};
let shown: World = emptyWorld();
let moment: Moment | undefined;
let ui: Ui = INITIAL_UI;
let queue: StrataEvent[] = [];
let rows: Agent[] = [];
let everConnected = false;
let disconnectedAt = 0;
let hudAt = 0;
let frameSelection = false;
let overviewView: View | undefined;
let recompose = true;
let activity: ReadonlyMap<RepoId, number> = new Map();
let attention: AttentionState = INITIAL_ATTENTION;
let stranded = false;
let cameraTouchedAt = 0;
/** How long an agent may be missing from the roster before Follow gives up on it. */
const LOST_MS = 2500;
let chased: Chase = INITIAL_CHASE;
let chasedId: string | undefined;
let chasedRepo: RepoId | undefined;
let chasedAt = 0;
let lastFrameAt = 0;
let warmth: ReadonlyMap<RepoId, number> = new Map();
let lastMode: Ui['mode'] = ui.mode;
interface Debug {
  motions: readonly Motion[];
  ribbons: () => number;
  oldestRibbonMs: () => number;
  lines: () => ReturnType<Lines['stats']>;
  windowed: () => { towers: number; half: number };
  agents: () => { id: string; block: string | undefined; known: boolean }[];
  ground: () => ReturnType<typeof groundStats>;
  camera: () => ReturnType<typeof cameraStats>;
}

const cameraStats = (): {
  target: [number, number, number];
  eye: [number, number, number];
  elevation: number;
  distance: number;
  moves: number;
  stranded: boolean;
  centre: Ndc | undefined;
} => {
  const v = camera.view;
  const e = stage.camera.position;
  const t = [v.focus.x, ground.surface.groundAt(v.focus.x, v.focus.z), v.focus.z] as const;
  const flat = Math.hypot(e.x - t[0], e.z - t[2]);
  return {
    target: [t[0], t[1], t[2]],
    eye: [e.x, e.y, e.z],
    elevation: (Math.atan2(e.y - t[1], flat) * 180) / Math.PI,
    distance: camera.distance,
    moves: attention.moves,
    stranded,
    centre: activityCentre(),
  };
};

const groundStats = (): {
  repos: number;
  towers: number;
  plates: number;
  districts: number;
  live: string[];
} => ({ ...ground.stats, live: ground.live(warmth).map((r) => r.repo) });

const debug: Debug | undefined = new URLSearchParams(window.location.search).has('dev')
  ? ((window as unknown as { strata: Debug }).strata = {
      motions: [],
      ribbons: () => ground.flightCount,
      oldestRibbonMs: () => ground.oldestFlight(Date.now()),
      lines: () => lines.stats(),
      windowed: () => ground.windowed,
      agents: () =>
        rows.map((r) => ({
          id: r.id,
          block: r.block,
          known: r.block === undefined || shown.layout.blocks.has(r.block),
        })),
      ground: groundStats,
      camera: cameraStats,
    })
  : undefined;
let forced: Forced;
mountSim((state) => {
  forced = state;
  hudAt = 0;
});

const dispatch = (intent: Intent): void => {
  if (intent.kind === 'touch-camera') cameraTouchedAt = Date.now();
  const next = reduce(ui, intent);
  if (intent.kind === 'key' && intent.key === 'F' && next !== ui) frameSelection = true;
  if (intent.kind === 'key' && intent.key === 'Home') recompose = true;
  ui = next;
  hudAt = 0;
};

const strip = new Strip((intent) => {
  dispatch(intent);
});

const camera = new MapCamera(stage.camera);
camera.standOn((x: number, z: number) => ground.surface.groundAt(x, z));

const input = bindInput(
  stage.dom,
  dispatch,
  (x: number, y: number) => {
    const { width, height } = stage.size();
    const agent = beacons.hit(x, y, width, height, stage.camera);
    if (agent !== undefined) return { agent };
    const block = ground.pick(
      new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1),
      stage.camera,
    );
    return block === undefined ? {} : { block };
  },
  {
    drag: (dx: number, dy: number, panning: boolean) => {
      if (panning) camera.panBy(dx, dy, stage.size());
      else camera.orbitBy(dx, dy, stage.size());
    },
    flick: (vx: number, vy: number, panning: boolean) => {
      camera.flickBy(vx, vy, panning, stage.size());
    },
    wheel: (notches: number, ndc: Ndc) => {
      camera.zoomAt(notches, ndc);
    },
  },
);

function connect(): void {
  const socket = new WebSocket(`ws://${SERVER}`);
  socket.addEventListener('open', () => {
    state = { ...state, connected: true };
    everConnected = true;
  });
  socket.addEventListener('message', (message: MessageEvent<string>) => {
    const parsed = JSON.parse(message.data) as StrataEvent | StrataEvent[];
    queue.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  });
  socket.addEventListener('close', () => {
    state = { ...state, connected: false };
    disconnectedAt = Date.now();
    setTimeout(connect, 2000);
  });
}
connect();

const hueOf = (id: string): number | undefined => rows.find((r) => r.id === id)?.hue;
const agentColor = (id: string): THREE.Color | undefined => {
  const hue = hueOf(id);
  return hue === undefined ? undefined : paint.agent(hue);
};
const dim = (agentId: string | undefined): number =>
  ui.isolate !== undefined && agentId !== ui.isolate ? 0.4 : 1;

function followed(): Agent | undefined {
  if (ui.follow !== undefined) return rows.find((r) => r.id === ui.follow);
  return [...rows].sort((a, b) => b.lastAt - a.lastAt)[0];
}

/** A district frame: the rect's corners at ground and at its top, world units. */
function frameView(framed: Framed): View | undefined {
  const surface = ground.surface;
  if (!surface.knows(framed.country)) return undefined;
  const { rect, top, country } = framed;
  const corners: THREE.Vector3[] = [];
  for (const x of [rect.x - 0.8, rect.x + rect.w + 0.8])
    for (const z of [rect.z - 0.8, rect.z + rect.h + 0.8])
      for (const y of [0, top]) corners.push(surface.world(country, x, z, y));
  const centreLocal = surface.local(country, rect.x + rect.w / 2, rect.z + rect.h / 2, 0.5);
  const target = surface.toWorld(centreLocal);
  const up = surface.upAt(centreLocal);
  const bias = framed.bias && surface.world(country, framed.bias.x + 0.5, framed.bias.z + 0.5, 0.5);
  return camera.frameCorners({ corners, target, up, ...(bias && { bias }) }, FOLLOW_ZOOM_FLOOR);
}

function overview(): View {
  if (recompose || !overviewView) {
    const framed = ground.live(warmth);
    const set: Patch[] = framed.length > 0 ? framed : ground.all();
    overviewView = camera.frameRegions(set);
    recompose = false;
  }
  return overviewView;
}

/** Where the followed agent stands on the ground, in world cells. */
function agentGround(agent: Agent): { x: number; z: number } | undefined {
  if (agent.block !== undefined) {
    const placed = shown.layout.blocks.get(agent.block);
    if (placed) {
      const cell = ground.surface.cellOf(placed.country, placed.cell.x + 0.5, placed.cell.z + 0.5);
      const centre = ground.surface.centre;
      return { x: cell.x - centre.x, z: cell.z - centre.z };
    }
  }
  const region = ground.regionOf(agent.repo);
  return region ? { x: region.centre.x, z: region.centre.z } : undefined;
}

/** Follow carries the reader with an agent; a journey is only for where it cannot be carried. */
function keepUp(now: number): boolean {
  const agent = followed();
  const at = agent && agentGround(agent);
  if (!agent || !at) return chasedId !== undefined && now - chasedAt < LOST_MS;
  chasedAt = now;
  const fresh = agent.id !== chasedId || agent.repo !== chasedRepo;
  if (fresh) {
    chased = chase(INITIAL_CHASE, at, now);
    chasedId = agent.id;
    chasedRepo = agent.repo;
    camera.aim({ ...camera.target, focus: chased.at, zoom: standoffZoom(chased.range) }, now);
    return true;
  }
  chased = chase(chased, at, now);
  camera.follow(chased.at, standoffZoom(chased.range));
  return true;
}

function desiredView(): View | undefined {
  if (ui.mode === 'free') return undefined;
  if (ui.mode === 'overview') return overview();
  return undefined;
}

/** Where the live agents are on screen, averaged, in normalised device coordinates. */
function activityCentre(): Ndc | undefined {
  const points: Ndc[] = [];
  for (const row of rows) {
    const at = beacons.positionOf(row.id);
    if (!at) continue;
    const q = at.clone().project(stage.camera);
    points.push({ x: q.x, y: q.y });
  }
  return centreOf(points);
}

/** The one case the camera moves on its own: once, when activity has left the dead zone. */
function attendActivity(now: number): void {
  if (ui.mode !== 'overview' || !overviewView) {
    stranded = false;
    return;
  }
  const centre = activityCentre();
  const next = attend(attention, { now, ...(centre && { centre }) });
  attention = next.state;
  stranded = next.stranded;
  if (next.began) {
    camera.aim(overviewView);
    camera.driftToCentre({ x: next.began.x, y: next.began.y }, now);
    overviewView = camera.target;
  }
}

function currentMoment(now: number): Moment | undefined {
  const h = state.history;
  if (!h) return undefined;
  return ui.scrub === undefined ? h.now() : h.at(Math.min(ui.scrub, now));
}

function touchesOf(id: BlockId): ReturnType<Moment['touches']['get']> {
  return moment?.touches.get(id);
}

function frame(): void {
  const now = Date.now();
  const batch = queue;
  queue = [];
  const previous: World = shown;
  const snapshot = batch.some((e) => e.kind === 'snapshot');
  for (const event of batch) state = fold(state, event);
  moment = currentMoment(now);
  const next: World = moment ? { layout: moment.layout, sessions: moment.sessions } : emptyWorld();
  if (ui.mode !== lastMode) {
    if (ui.mode === 'overview') recompose = true;
    lastMode = ui.mode;
  }
  if (batch.length > 0 || next.layout !== previous.layout || next.sessions !== previous.sessions) {
    const ms = motions(previous, next, state.renames, state.folders);
    state.renames.clear();
    state.folders.clear();
    if (debug) debug.motions = ms;
    shown = next;
    rows = roster(shown.sessions, now);
    const cold = previous.layout.blocks.size === 0 && next.layout.blocks.size > 0;
    ground.apply(shown.layout, ms, now, snapshot || cold);
    activity = repoActivity(shown.layout, shown.sessions, moment?.touches ?? new Map(), now);
    warmth = repoWarmth(activity, now);
    ground.admission(now);
    beacons.apply(ms, shown.layout, rows, now);
    for (const m of ms) {
      if (m.kind === 'sink') dispatch({ kind: 'block-gone', id: m.id });
      if (m.kind === 'depart') dispatch({ kind: 'agent-gone', agentId: m.agentId });
    }
    if (cold) {
      recompose = true;
      camera.setWorld(shown.layout.world);
      camera.jump(overview());
    }
  } else {
    activity = repoActivity(shown.layout, shown.sessions, moment?.touches ?? new Map(), now);
    warmth = repoWarmth(activity, now);
    ground.admission(now);
  }
  beacons.setVisible(ui.scrub === undefined);

  const pointer = input.pointer();
  if (pointer?.moved) {
    input.settle();
    const { width, height } = stage.size();
    const id = ground.pick(
      new THREE.Vector2((pointer.x / width) * 2 - 1, -(pointer.y / height) * 2 + 1),
      stage.camera,
    );
    if (id !== ui.hover) dispatch(id === undefined ? { kind: 'hover' } : { kind: 'hover', id });
    input.setHover(id !== undefined);
    drawLabel(id, pointer.x, pointer.y);
  } else if (!pointer) {
    drawLabel(undefined, 0, 0);
  }

  if (frameSelection && ui.selected !== undefined) {
    frameSelection = false;
    const framed = districtFrame(shown.layout, ui.selected, (country, district) =>
      ground.tallest(country, district),
    );
    const view = framed && frameView(framed);
    if (view) camera.jump(view);
  }
  if (ui.follow !== undefined && !rows.some((r) => r.id === ui.follow))
    dispatch({ kind: 'agent-gone', agentId: ui.follow });

  attendActivity(now);
  if (ui.mode === 'follow') {
    if (!keepUp(now)) camera.aim(overview(), now);
  } else {
    chasedId = undefined;
    const want = desiredView();
    if (want) camera.aim(want, now);
  }
  camera.update(now - (lastFrameAt || now - 16), now);
  lastFrameAt = now;
  const extent = ground.surface.extent;
  stage.fog(camera.distance, Math.max(20, Math.max(extent.w, extent.h)));

  if (now - hudAt > 500) {
    hudAt = now;
    rows = roster(shown.sessions, now);
    drawRoster(
      forced ? [] : rows,
      rosterState(now),
      rosterDetail(now),
      ui.mode === 'follow' ? followed()?.id : undefined,
      dispatch,
    );
    drawHud(
      ui,
      rows,
      ui.mode === 'follow' ? followed() : undefined,
      stranded,
      ui.mode === 'free' && now - cameraTouchedAt > ADRIFT_MS,
    );
    strip.draw(
      state.history?.log ?? [],
      shown.sessions,
      rows,
      ui.scrub,
      ui.isolate,
      rosterState(now) === 'cold' ? `quiet for ${rosterDetail(now)}` : '',
      now,
      state.history?.baselineAt ?? now,
    );
    drawCaption(
      ui.selected,
      ui.selected === undefined ? undefined : shown.layout.blocks.get(ui.selected),
      ui.selected === undefined ? undefined : touchesOf(ui.selected),
      shown.sessions,
      hueOf,
      state.mounts,
      now,
    );
    ground.paint(
      countryActivity(
        shown.layout,
        shown.sessions,
        moment?.touches ?? new Map(),
        (agentId: string) => hueOf(agentId) ?? 220,
        now,
      ),
      warmth,
    );
  }

  const presence = ui.scrub === undefined ? beacons.presenceOf(rows) : new Map();
  const subject = (() => {
    if (ui.mode !== 'follow' || ui.scrub !== undefined) return undefined;
    const agent = followed();
    if (agent?.block === undefined) return undefined;
    const foot = ground.foot(agent.block);
    const beacon = beacons.positionOf(agent.id);
    return foot && beacon ? { id: agent.block, foot, beacon } : undefined;
  })();
  ground.update(
    now,
    (id) => memoryOf(touchesOf(id), now),
    presence,
    agentColor,
    dim,
    ui.hover,
    subject,
  );
  beacons.update(now, rows, dim);
  effects.update(now);
  const { width, height } = stage.size();
  lines.update(now, width, height);
  stage.render(now);
}

function rosterState(now: number): RosterState {
  if (forced) return forced;
  const last = lastSession();
  const hook = hookStateOf(state.hooks);
  return rosterStateOf({
    connected: state.connected,
    everConnected,
    agents: rows.length,
    now,
    ...(hook && { hook }),
    ...(last && { lastAgentAt: last.lastAt }),
  });
}

function lastSession(): { lastAt: number } | undefined {
  return [...shown.sessions.values()].sort((a, b) => b.lastAt - a.lastAt)[0];
}

function rosterDetail(now: number): string {
  if (!state.connected && everConnected) return `${ago(now - disconnectedAt)} ago`;
  const last = lastSession();
  if (!last) return '';
  const quiet = now - last.lastAt;
  return quiet > TRACE_MS ? ago(quiet) : `${ago(quiet)} since the last agent`;
}

void PLATFORM_LIFT;

const loop = (): void => {
  frame();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
