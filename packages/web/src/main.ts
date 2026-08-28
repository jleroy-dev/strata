import * as THREE from 'three';
import {
  INITIAL_UI,
  TRACE_MS,
  memoryOf,
  motions,
  reduce,
  roster,
  type Agent,
  type Intent,
  type Motion,
  type StrataEvent,
  type Ui,
  type World,
} from '@strata/core';
import { Beacons } from './beacons.js';
import { CameraRig, type Pose } from './camera.js';
import { drawCaption } from './caption.js';
import { Effects } from './effects.js';
import { ago } from './dom.js';
import { drawHud, drawLabel } from './hud.js';
import { bindInput } from './input.js';
import { Lines } from './lines.js';
import { Ribbons } from './ribbons.js';
import { RoadLights } from './roadlights.js';
import { drawRoster, type RosterState } from './roster.js';
import { mountSim, type Forced } from './sim.js';
import { createStage } from './stage.js';
import { Strip } from './strip.js';
import { Terrain } from './terrain.js';
import { PLATFORM_LIFT, accentOf, paint } from './theme.js';
import { emptyWorld, fold, type Folded } from './world.js';
import type { Moment } from '@strata/core';

export const SERVER = '127.0.0.1:4747';

const stage = createStage(document.body);
const effects = new Effects(stage.scene, stage.camera);
const lines = new Lines(stage.scene);
const ribbons = new Ribbons((agentId) => dim(agentId));
const terrain = new Terrain(stage, effects, ribbons);
const beacons = new Beacons(stage, terrain, effects, ribbons);
const roadLights = new RoadLights(stage, terrain);
lines.register(ribbons);
lines.register(terrain.flights);
lines.register(roadLights);

let state: Folded = {
  renames: new Map(),
  folders: new Map(),
  root: '',
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
interface Debug {
  motions: readonly Motion[];
  ribbons: () => number;
  oldestRibbonMs: () => number;
  ribbonGap: () => number;
  audit: () => ReturnType<Terrain['audit']>;
  lines: () => ReturnType<Lines['stats']>;
  windowed: () => { towers: number; half: number };
  agents: () => { id: string; block: string | undefined; known: boolean }[];
  ground: () => { meshes: number; rects: number };
}

const debug: Debug | undefined = new URLSearchParams(window.location.search).has('dev')
  ? ((window as unknown as { strata: Debug }).strata = {
      motions: [],
      ribbons: () => terrain.flights.count,
      oldestRibbonMs: () => terrain.flights.oldest(Date.now()),
      ribbonGap: () => terrain.flights.gap,
      audit: () => terrain.audit(),
      lines: () => lines.stats(),
      windowed: () => terrain.windowed,
      agents: () =>
        rows.map((r) => ({
          id: r.id,
          block: r.block,
          known: r.block === undefined || shown.layout.blocks.has(r.block),
        })),
      ground: () => ({
        meshes: terrain.plateCount,
        rects: shown.layout.districts.length + shown.layout.countries.length,
      }),
    })
  : undefined;
let forced: Forced;
mountSim((state) => {
  forced = state;
  hudAt = 0;
});

const dispatch = (intent: Intent): void => {
  const next = reduce(ui, intent);
  if (intent.kind === 'key' && intent.key === 'F' && next !== ui) frameSelection = true;
  ui = next;
  hudAt = 0;
};

const strip = new Strip((intent) => {
  dispatch(intent);
});

const rig = new CameraRig(stage.camera, stage.dom, (x, z) => stage.world(x, z));

const input = bindInput(stage.dom, dispatch, (x, y) => {
  const { width, height } = stage.size();
  const agent = beacons.hit(x, y, width, height, stage.camera);
  if (agent !== undefined) return { agent };
  const block = terrain.pick(
    new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1),
    stage.camera,
  );
  return block === undefined ? {} : { block };
});

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

function districtPose(
  id: string,
  bias: THREE.Vector3 | undefined,
  include: readonly THREE.Vector3[] = [],
): Pose | undefined {
  const placed = shown.layout.blocks.get(id);
  if (!placed) return undefined;
  const district = shown.layout.districts.find(
    (d) => d.country === placed.country && d.district === placed.district,
  );
  if (!district) return undefined;
  let rect = { x: district.x, z: district.z, w: district.w, h: district.h };
  for (const p of include) {
    const c = stage.cell(p);
    const x0 = Math.min(rect.x, c.x - 1);
    const z0 = Math.min(rect.z, c.z - 1);
    const x1 = Math.max(rect.x + rect.w, c.x + 2);
    const z1 = Math.max(rect.z + rect.h, c.z + 2);
    rect = { x: x0, z: z0, w: x1 - x0, h: z1 - z0 };
  }
  return rig.district({
    rect,
    top: terrain.tallest(placed.country, placed.district),
    ...(bias && { bias }),
  });
}

let lastFollowPose: Pose | undefined;

function desiredPose(): Pose | undefined {
  if (ui.mode === 'free') return undefined;
  if (ui.mode === 'overview') return rig.overview(shown.layout.extent);
  const agent = followed();
  if (agent?.block !== undefined) {
    const at = beacons.positionOf(agent.id);
    const origin = beacons.tripOrigin(agent.id);
    const include = [at, origin].filter((p): p is THREE.Vector3 => p !== undefined);
    const pose = districtPose(agent.block, at ? at.clone().setY(0.5) : undefined, include);
    if (pose) lastFollowPose = pose;
  }
  return lastFollowPose ?? rig.overview(shown.layout.extent);
}

function currentMoment(now: number): Moment | undefined {
  const h = state.history;
  if (!h) return undefined;
  return ui.scrub === undefined ? h.now() : h.at(Math.min(ui.scrub, now));
}

function touchesOf(id: string): ReturnType<Moment['touches']['get']> {
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
  if (batch.length > 0 || next.layout !== previous.layout || next.sessions !== previous.sessions) {
    const ms = motions(previous, next, state.renames, state.folders);
    state.renames.clear();
    state.folders.clear();
    if (debug) debug.motions = ms;
    shown = next;
    rows = roster(shown.sessions, now);
    const cold = previous.layout.blocks.size === 0 && next.layout.blocks.size > 0;
    if (snapshot || cold) {
      stage.setExtent(shown.layout.extent);
      beacons.setSky(Math.max(shown.layout.extent.w, shown.layout.extent.h));
    }
    terrain.apply(shown.layout, ms, now, cold);
    beacons.apply(ms, shown.layout, rows, now);
    for (const m of ms) {
      if (m.kind === 'sink') dispatch({ kind: 'block-gone', id: m.id });
      if (m.kind === 'depart') dispatch({ kind: 'agent-gone', agentId: m.agentId });
    }
    if (cold) rig.snap(rig.overview(shown.layout.extent));
  }
  beacons.setVisible(ui.scrub === undefined);

  const pointer = input.pointer();
  if (pointer?.moved) {
    input.settle();
    const { width, height } = stage.size();
    const id = terrain.pick(
      new THREE.Vector2((pointer.x / width) * 2 - 1, -(pointer.y / height) * 2 + 1),
      stage.camera,
    );
    if (id !== ui.hover) dispatch(id === undefined ? { kind: 'hover' } : { kind: 'hover', id });
    drawLabel(id, pointer.x, pointer.y);
  } else if (!pointer) {
    drawLabel(undefined, 0, 0);
  }

  if (frameSelection && ui.selected !== undefined) {
    frameSelection = false;
    const pose = districtPose(ui.selected, undefined);
    if (pose) rig.snap(pose);
  }
  if (ui.follow !== undefined && !rows.some((r) => r.id === ui.follow))
    dispatch({ kind: 'agent-gone', agentId: ui.follow });

  rig.update(desiredPose(), now);
  stage.fog(rig.distance(), Math.max(shown.layout.extent.w, shown.layout.extent.h, 8));

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
    drawHud(ui, rows, ui.mode === 'follow' ? followed() : undefined);
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
      state.root,
      now,
    );
  }

  const selectedCountry =
    ui.selected === undefined ? undefined : shown.layout.blocks.get(ui.selected)?.country;
  const plate =
    selectedCountry === undefined
      ? undefined
      : shown.layout.countries.find((c) => c.country === selectedCountry);
  roadLights.select(
    ui.selected !== undefined && shown.layout.blocks.has(ui.selected) ? ui.selected : undefined,
    moment?.roads ?? new Set(),
    shown.layout,
    plate ? paint.cap(accentOf(plate.family, plate.variant)) : paint.agent(220),
  );
  roadLights.update(ui.isolate === undefined ? 1 : 0.5);
  const presence = ui.scrub === undefined ? beacons.presenceOf(rows) : new Map();
  const subject = (() => {
    if (ui.mode !== 'follow' || ui.scrub !== undefined) return undefined;
    const agent = followed();
    if (agent?.block === undefined) return undefined;
    const foot = terrain.foot(agent.block);
    const beacon = beacons.positionOf(agent.id);
    return foot && beacon ? { id: agent.block, foot, beacon } : undefined;
  })();
  terrain.update(
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
  if (!state.connected) return everConnected ? 'disconnected' : 'connecting';
  if (rows.length > 0) return 'live';
  if (state.hook && !state.hook.installed && !state.hook.heard) return 'deaf';
  const last = lastSession();
  if (last && now - last.lastAt > TRACE_MS) return 'cold';
  return 'quiet';
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
