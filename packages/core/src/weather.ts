import type { BlockId, WeatherEvent } from './events.js';
import { hueFor } from './hue.js';
import type { RepoId } from './qualified.js';
import type { AgentSignal } from './signal.js';

export const IDLE_MS = 20_000;
export const DONE_MS = 5_000;
export const GONE_MS = 30 * 60_000;

export type Verb =
  'reading' | 'editing' | 'running' | 'thinking' | 'blocked' | 'waiting' | 'idle' | 'done';

export interface Session {
  id: string;
  repo: RepoId;
  order: number;
  /** When this session was first seen, which is its start only when `origin` is `announced`. */
  arrivedAt: number;
  lastAt: number;
  verb: Exclude<Verb, 'idle' | 'done'>;
  /** `announced` came from a start; `inferred` was first seen already at work. */
  origin: SessionOrigin;
  block?: BlockId;
  leftAt?: number;
}

export type SessionOrigin = 'announced' | 'inferred';

export type Sessions = ReadonlyMap<string, Session>;

/** A roster row: everything the panel shows for one agent, derived at `now`. */
export interface Agent {
  id: string;
  repo: RepoId;
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
    next.set(event.agentId, {
      id: event.agentId,
      repo: event.repo,
      order: current?.order ?? sessions.size,
      arrivedAt: at,
      lastAt: at,
      verb: 'waiting',
      origin: 'announced',
    });
    return next;
  }
  if (event.kind === 'agent.left') {
    if (!current) return sessions;
    next.set(event.agentId, { ...current, lastAt: at, leftAt: at });
    return next;
  }
  const verb = verbReported(event.kind);
  const session: Session = current
    ? { ...current, repo: event.repo, lastAt: at, verb }
    : {
        id: event.agentId,
        repo: event.repo,
        order: sessions.size,
        arrivedAt: at,
        lastAt: at,
        verb,
        origin: 'inferred',
      };
  delete session.leftAt;
  if (event.kind === 'agent.reading' || event.kind === 'agent.editing') {
    if (event.id === undefined) delete session.block;
    else session.block = event.id;
  }
  if (event.kind === 'agent.running' && event.id !== undefined) session.block = event.id;
  next.set(event.agentId, session);
  return next;
}

function verbReported(
  kind: Exclude<WeatherEvent['kind'], 'agent.arrived' | 'agent.left'>,
): Exclude<Verb, 'idle' | 'done'> {
  switch (kind) {
    case 'agent.reading':
      return 'reading';
    case 'agent.editing':
      return 'editing';
    case 'agent.running':
      return 'running';
    case 'agent.thinking':
      return 'thinking';
    case 'agent.blocked':
      return 'blocked';
    case 'agent.waiting':
      return 'waiting';
  }
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
      repo: s.repo,
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
  known: (id: BlockId) => boolean,
): WeatherEvent | undefined {
  const agentId = signal.session;
  const repo = signal.repo;
  switch (signal.kind) {
    case 'start':
      return { kind: 'agent.arrived', agentId, repo };
    case 'prompt':
    case 'tool-end':
      return { kind: 'agent.thinking', agentId, repo };
    case 'blocked':
      return { kind: 'agent.blocked', agentId, repo };
    case 'turn-end':
      return { kind: 'agent.waiting', agentId, repo };
    case 'end':
      return { kind: 'agent.left', agentId, repo };
    case 'tool': {
      const id = signal.path !== undefined && known(signal.path) ? signal.path : undefined;
      switch (signal.tool) {
        case 'read':
          return { kind: 'agent.reading', agentId, repo, ...(id !== undefined && { id }) };
        case 'edit':
          return { kind: 'agent.editing', agentId, repo, ...(id !== undefined && { id }) };
        case 'shell':
          return { kind: 'agent.running', agentId, repo, ...(id !== undefined && { id }) };
        case 'other':
          return { kind: 'agent.running', agentId, repo };
        default:
          return undefined;
      }
    }
  }
}
