import type { BlockId, WeatherEvent } from './events.js';
import { hueFor } from './hue.js';
import type { AgentSignal } from './signal.js';

export const IDLE_MS = 20_000;
export const DONE_MS = 5_000;
export const GONE_MS = 30 * 60_000;

export type Verb = 'reading' | 'editing' | 'running' | 'waiting' | 'idle' | 'done';

export interface Session {
  id: string;
  order: number;
  arrivedAt: number;
  lastAt: number;
  verb: Exclude<Verb, 'idle' | 'done'>;
  block?: BlockId;
  leftAt?: number;
}

export type Sessions = ReadonlyMap<string, Session>;

/** A roster row: everything the panel shows for one agent, derived at `now`. */
export interface Agent {
  id: string;
  label: string;
  hue: number;
  verb: Verb;
  block?: BlockId;
  lastAt: number;
}

/** Folds one reported fact into the session table. */
export function foldWeather(sessions: Sessions, event: WeatherEvent, at: number): Sessions {
  const next = new Map(sessions);
  const current = sessions.get(event.agentId);
  if (event.kind === 'agent.arrived') {
    if (current && current.leftAt === undefined) return sessions;
    next.set(event.agentId, arrival(event.agentId, current?.order ?? sessions.size, at));
    return next;
  }
  if (!current && event.kind === 'agent.left') return sessions;
  const session: Session = current
    ? { ...current, lastAt: at }
    : arrival(event.agentId, sessions.size, at);
  if (event.kind === 'agent.left') {
    next.set(event.agentId, { ...session, leftAt: at });
    return next;
  }
  delete session.leftAt;
  switch (event.kind) {
    case 'agent.reading':
    case 'agent.editing':
      session.verb = event.kind === 'agent.reading' ? 'reading' : 'editing';
      if (event.id === undefined) delete session.block;
      else session.block = event.id;
      break;
    case 'agent.running':
      session.verb = 'running';
      break;
    case 'agent.waiting':
      session.verb = 'waiting';
      break;
  }
  next.set(event.agentId, session);
  return next;
}

function arrival(id: string, order: number, at: number): Session {
  return { id, order, arrivedAt: at, lastAt: at, verb: 'waiting' };
}

/** The verb the roster shows at `now`, or undefined once the row has dropped. */
export function verbOf(session: Session, now: number): Verb | undefined {
  if (session.leftAt !== undefined) return now - session.leftAt < DONE_MS ? 'done' : undefined;
  const quiet = now - session.lastAt;
  if (quiet >= GONE_MS) return undefined;
  if (quiet >= IDLE_MS && (session.verb === 'reading' || session.verb === 'editing')) return 'idle';
  return session.verb;
}

export function labelOf(order: number): string {
  let suffix = '';
  let n = order;
  do {
    suffix = String.fromCharCode(97 + (n % 26)) + suffix;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `claude-${suffix}`;
}

/** The roster at `now`: live rows in arrival order, each with its derived hue and verb. */
export function roster(sessions: Sessions, now: number): Agent[] {
  const live = [...sessions.values()]
    .filter((s) => verbOf(s, now) !== undefined)
    .sort((a, b) => a.order - b.order);
  const taken = new Set<number>();
  return live.map((s) => {
    const hue = hueFor(s.id, taken);
    taken.add(hue);
    const verb = verbOf(s, now) ?? 'done';
    return {
      id: s.id,
      label: labelOf(s.order),
      hue,
      verb,
      lastAt: s.lastAt,
      ...(s.block && { block: s.block }),
    };
  });
}

/** The fact a signal reports, or nothing when it reports none the panel draws. */
export function eventOf(
  signal: AgentSignal,
  known: (path: string) => boolean,
): WeatherEvent | undefined {
  const agentId = signal.session;
  switch (signal.kind) {
    case 'start':
      return { kind: 'agent.arrived', agentId };
    case 'turn-end':
      return { kind: 'agent.waiting', agentId };
    case 'end':
      return { kind: 'agent.left', agentId };
    case 'tool': {
      const id = signal.path !== undefined && known(signal.path) ? signal.path : undefined;
      switch (signal.tool) {
        case 'read':
          return { kind: 'agent.reading', agentId, ...(id !== undefined && { id }) };
        case 'edit':
          return { kind: 'agent.editing', agentId, ...(id !== undefined && { id }) };
        case 'shell':
          return { kind: 'agent.running', agentId };
        default:
          return undefined;
      }
    }
  }
}
