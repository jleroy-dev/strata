import type { BlockId, StrataEvent } from './events.js';
import { withAtlas, type Layout, type Placement } from './layout.js';
import { TRACE_MS, foldTouch, type Touches } from './memory.js';
import type { World } from './motion.js';
import { repoOf } from './qualified.js';
import { foldWeather, type Sessions } from './weather.js';

export const KEYFRAME_EVERY = 64;
export const MAX_EVENTS = 4000;

export interface Moment {
  layout: Layout;
  sessions: Sessions;
  touches: Touches;
}

type Blocks = Map<BlockId, Placement>;

/** The events that rewrite the block table, and so the only ones worth copying it for. */
function movesBlocks(event: StrataEvent): boolean {
  switch (event.kind) {
    case 'block.added':
    case 'block.changed':
    case 'block.moved':
    case 'block.removed':
    case 'layout.repacked':
      return true;
    default:
      return false;
  }
}

/** Writes one event into `blocks` and returns the layout built around it. */
function terrainInto(layout: Layout, event: StrataEvent, blocks: Blocks): Layout {
  switch (event.kind) {
    case 'block.added':
      blocks.set(event.block.id, event.placement);
      return { ...layout, blocks };
    case 'block.changed':
      blocks.set(event.id, event.placement);
      return { ...layout, blocks };
    case 'block.moved':
      blocks.delete(event.from);
      blocks.set(event.block.id, event.placement);
      return { ...layout, blocks };
    case 'block.removed':
      blocks.delete(event.id);
      return { ...layout, blocks };
    case 'layout.repacked': {
      for (const [id, placement] of event.blocks) blocks.set(id, placement);
      const others = (country: string): boolean => repoOf(country as BlockId) !== event.repo;
      return withAtlas({
        ...layout,
        blocks,
        districts: [...layout.districts.filter((d) => others(d.country)), ...event.districts],
        countries: [...layout.countries.filter((c) => others(c.country)), ...event.countries],
        continents: [
          ...layout.continents.filter((c) => c.repo !== event.repo),
          ...event.continents,
        ],
      });
    }
    default:
      return layout;
  }
}

/** Applies a terrain event's placements to a layout; the server and the panel share it. */
export function foldTerrain(layout: Layout, event: StrataEvent): Layout {
  return movesBlocks(event) ? terrainInto(layout, event, new Map(layout.blocks)) : layout;
}

export function foldMoment(moment: Moment, event: StrataEvent): Moment {
  return foldWith(moment, event, undefined);
}

/**
 * Folds a run onto `from` with one copy of the block table rather than one per event. `from` is
 * never written to: the copy is taken before the first event that moves a block, and the
 * moments in between are never handed out.
 */
function foldRun(from: Moment, events: readonly StrataEvent[]): Moment {
  let moment = from;
  let reuse: Blocks | undefined;
  for (const event of events) {
    if (reuse === undefined && movesBlocks(event)) reuse = new Map(moment.layout.blocks);
    moment = foldWith(moment, event, reuse);
  }
  return moment;
}

function foldWith(moment: Moment, event: StrataEvent, reuse: Blocks | undefined): Moment {
  const terrain = (): Layout =>
    movesBlocks(event)
      ? terrainInto(moment.layout, event, reuse ?? new Map(moment.layout.blocks))
      : moment.layout;
  switch (event.kind) {
    case 'agent.arrived':
    case 'agent.reading':
    case 'agent.editing':
    case 'agent.running':
    case 'agent.thinking':
    case 'agent.blocked':
    case 'agent.waiting':
    case 'agent.left':
      return {
        ...moment,
        sessions: foldWeather(moment.sessions, event, event.at),
        touches: foldTouch(moment.touches, event, event.at),
      };
    case 'snapshot':
      return moment;
    case 'history':
      return moment;
    case 'block.moved': {
      const layout = terrain();
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
      return { ...moment, layout: terrain() };
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
  ) {
    this.base = {
      layout: baseline,
      sessions: new Map(),
      touches: new Map(),
    };
    this.baseAt = at;
    this.current = this.base;
  }

  /**
   * Adopts a baseline and the events since it. `now()` is what folding them gives: the server
   * sends the past and the panel derives the present, rather than being sent both.
   */
  restore(baseline: Layout, at: number, events: readonly StrataEvent[]): void {
    this.base = {
      layout: baseline,
      sessions: new Map(),
      touches: new Map(),
    };
    this.baseAt = at;
    this.events = [...events];
    this.keyframes = [];
    this.indexed = false;
    this.current = foldRun(this.base, this.events);
  }

  get baseline(): Layout {
    return this.base.layout;
  }

  get baselineAt(): number {
    return this.baseAt;
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
    this.base = foldRun(this.base, this.events.slice(0, dropped));
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
    let end = start;
    while (end < this.events.length && (this.events[end]?.at ?? Infinity) <= t) end++;
    return foldRun(moment, this.events.slice(start, end));
  }

  private index(): void {
    this.keyframes = [];
    let moment = this.base;
    for (let i = 0; i + KEYFRAME_EVERY <= this.events.length; i += KEYFRAME_EVERY) {
      moment = foldRun(moment, this.events.slice(i, i + KEYFRAME_EVERY));
      this.keyframes.push({ index: i + KEYFRAME_EVERY, moment });
    }
    this.indexed = true;
  }

  world(moment: Moment = this.current): World {
    return { layout: moment.layout, sessions: moment.sessions };
  }

  touchesOf(moment: Moment, id: BlockId): ReturnType<Touches['get']> {
    return moment.touches.get(id);
  }
}
