import type { BlockId, Road, StrataEvent } from './events.js';
import { parseLayout, type Layout } from './layout.js';
import { TRACE_MS, foldTouch, type Touches } from './memory.js';
import type { World } from './motion.js';
import { roadKey } from './roads.js';
import { foldWeather, type Sessions } from './weather.js';

export const KEYFRAME_EVERY = 64;
export const MAX_EVENTS = 4000;

export interface Moment {
  layout: Layout;
  sessions: Sessions;
  touches: Touches;
  roads: ReadonlySet<string>;
}

/** Applies a terrain event's placements to a layout; the server and the panel share it. */
export function foldTerrain(layout: Layout, event: StrataEvent): Layout {
  switch (event.kind) {
    case 'snapshot':
      return parseLayout(event.layout);
    case 'block.added':
    case 'block.changed':
    case 'block.moved': {
      const blocks = new Map(layout.blocks);
      if (event.kind === 'block.moved') blocks.delete(event.from);
      blocks.set(event.kind === 'block.changed' ? event.id : event.block.id, event.placement);
      return { ...layout, blocks };
    }
    case 'block.removed': {
      const blocks = new Map(layout.blocks);
      blocks.delete(event.id);
      return { ...layout, blocks };
    }
    case 'layout.repacked': {
      const blocks = new Map(layout.blocks);
      for (const [id, placement] of event.blocks) blocks.set(id, placement);
      return {
        blocks,
        districts: event.districts,
        countries: event.countries,
        extent: event.extent,
      };
    }
    default:
      return layout;
  }
}

export function foldMoment(moment: Moment, event: StrataEvent): Moment {
  switch (event.kind) {
    case 'agent.arrived':
    case 'agent.reading':
    case 'agent.editing':
    case 'agent.running':
    case 'agent.waiting':
    case 'agent.left':
      return {
        ...moment,
        sessions: foldWeather(moment.sessions, event, event.at),
        touches: foldTouch(moment.touches, event, event.at),
      };
    case 'road.added':
    case 'road.removed': {
      const roads = new Set(moment.roads);
      if (event.kind === 'road.added') roads.add(roadKey(event.road));
      else roads.delete(roadKey(event.road));
      return { ...moment, roads };
    }
    case 'snapshot':
      return {
        ...moment,
        layout: foldTerrain(moment.layout, event),
        roads: new Set(event.roads.map(roadKey)),
      };
    case 'history':
      return moment;
    case 'block.moved': {
      const layout = foldTerrain(moment.layout, event);
      const to = event.block.id;
      let sessions = moment.sessions;
      for (const [id, session] of moment.sessions) {
        if (session.block !== event.from) continue;
        const next = new Map(sessions);
        next.set(id, { ...session, block: to });
        sessions = next;
      }
      let touches = moment.touches;
      const carried = moment.touches.get(event.from);
      if (carried) {
        const next = new Map(touches);
        next.delete(event.from);
        next.set(to, carried);
        touches = next;
      }
      return { ...moment, layout, sessions, touches };
    }
    default:
      return { ...moment, layout: foldTerrain(moment.layout, event) };
  }
}

interface Keyframe {
  index: number;
  moment: Moment;
}

/**
 * A baseline and the events since, the same on the server and in the panel. `now()` is kept
 * as events arrive; `at(t)` refolds from the nearest keyframe before `t`.
 */
export class History {
  private events: StrataEvent[] = [];
  private keyframes: Keyframe[] = [];
  private indexed = true;
  private current: Moment;
  private base: Moment;
  private baseAt: number;

  constructor(
    baseline: Layout,
    at: number,
    private readonly horizon = TRACE_MS,
    roads: readonly Road[] = [],
  ) {
    this.base = {
      layout: baseline,
      sessions: new Map(),
      touches: new Map(),
      roads: new Set(roads.map(roadKey)),
    };
    this.baseAt = at;
    this.current = this.base;
  }

  /** Adopts a baseline and the events since it, keeping the layout of `now()` as it stands. */
  restore(
    baseline: Layout,
    roads: readonly Road[],
    at: number,
    events: readonly StrataEvent[],
  ): void {
    this.base = {
      layout: baseline,
      sessions: new Map(),
      touches: new Map(),
      roads: new Set(roads.map(roadKey)),
    };
    this.baseAt = at;
    this.events = [...events];
    this.keyframes = [];
    this.indexed = false;
    let moment = this.base;
    for (const event of this.events) moment = foldMoment(moment, event);
    this.current = {
      ...this.current,
      sessions: moment.sessions,
      touches: moment.touches,
      roads: moment.roads,
    };
  }

  get baseline(): Layout {
    return this.base.layout;
  }

  get baselineAt(): number {
    return this.baseAt;
  }

  get baselineRoads(): ReadonlySet<string> {
    return this.base.roads;
  }

  get log(): readonly StrataEvent[] {
    return this.events;
  }

  push(event: StrataEvent): void {
    this.events.push(event);
    this.current = foldMoment(this.current, event);
    if (this.indexed && this.events.length % KEYFRAME_EVERY === 0) {
      this.keyframes.push({ index: this.events.length, moment: this.current });
    }
  }

  /** Drops events older than the horizon before `now`, folding them into the baseline. */
  expire(now: number): void {
    const floor = now - this.horizon;
    let dropped = 0;
    while (dropped < this.events.length && (this.events[dropped]?.at ?? 0) < floor) dropped++;
    dropped = Math.max(dropped, this.events.length - MAX_EVENTS);
    if (dropped <= 0) return;
    for (let i = 0; i < dropped; i++) {
      const event = this.events[i];
      if (event) this.base = foldMoment(this.base, event);
    }
    this.baseAt = this.events[dropped - 1]?.at ?? this.baseAt;
    this.events.splice(0, dropped);
    this.keyframes = this.keyframes
      .filter((k) => k.index > dropped)
      .map((k) => ({ index: k.index - dropped, moment: k.moment }));
  }

  now(): Moment {
    return this.current;
  }

  /** The moment as of `t`: events at or before `t` folded onto the baseline. */
  at(t: number): Moment {
    if (!this.indexed) this.index();
    let start = 0;
    let moment = this.base;
    for (const k of this.keyframes) {
      const last = this.events[k.index - 1];
      if (last && last.at <= t) {
        start = k.index;
        moment = k.moment;
      } else break;
    }
    for (let i = start; i < this.events.length; i++) {
      const event = this.events[i];
      if (!event || event.at > t) break;
      moment = foldMoment(moment, event);
    }
    return moment;
  }

  private index(): void {
    this.keyframes = [];
    let moment = this.base;
    this.events.forEach((event, i) => {
      moment = foldMoment(moment, event);
      if ((i + 1) % KEYFRAME_EVERY === 0) this.keyframes.push({ index: i + 1, moment });
    });
    this.indexed = true;
  }

  world(moment: Moment = this.current): World {
    return { layout: moment.layout, sessions: moment.sessions };
  }

  touchesOf(moment: Moment, id: BlockId): ReturnType<Touches['get']> {
    return moment.touches.get(id);
  }
}
