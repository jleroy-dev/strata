import type { BlockId, WeatherEvent } from './events.js';

export const HEAT_MS = 20_000;
export const TRACE_MS = 60 * 60_000;
export const CONTEST_MS = 5 * 60_000;

export interface Touch {
  agentId: string;
  at: number;
  verb: 'reading' | 'editing';
}

export type Touches = ReadonlyMap<BlockId, readonly Touch[]>;

export interface Memory {
  last?: Touch;
  heat: number;
  trace: number;
  contested?: [string, string];
}

/** Records a read or an edit on its block and forgets touches older than the trace. */
export function foldTouch(touches: Touches, event: WeatherEvent, at: number): Touches {
  if (
    (event.kind !== 'agent.reading' && event.kind !== 'agent.editing') ||
    event.id === undefined
  ) {
    return touches;
  }
  const verb = event.kind === 'agent.reading' ? 'reading' : 'editing';
  const next = new Map(touches);
  const kept = (touches.get(event.id) ?? []).filter((t) => at - t.at < TRACE_MS);
  next.set(event.id, [...kept, { agentId: event.agentId, at, verb }]);
  return next;
}

/** What a block remembers at `now`: its last touch, heat, trace, and a split when two agents share it. */
export function memoryOf(touches: readonly Touch[] | undefined, now: number): Memory {
  const past = (touches ?? []).filter((t) => t.at <= now);
  const last = past.at(-1);
  if (!last) return { heat: 0, trace: 0 };
  const heat = Math.max(0, 1 - (now - last.at) / HEAT_MS);
  const trace = Math.max(0, 1 - (now - last.at) / TRACE_MS);
  const recent: string[] = [];
  for (const t of past) {
    if (now - t.at >= CONTEST_MS) continue;
    if (!recent.includes(t.agentId)) recent.push(t.agentId);
  }
  const a = recent.at(-2);
  const b = recent.at(-1);
  return { last, heat, trace, ...(a !== undefined && b !== undefined && { contested: [a, b] }) };
}
