import type { Layout } from './layout.js';
import { TRACE_MS, memoryOf, type Touches } from './memory.js';
import { repoOf, type RepoId } from './qualified.js';
import type { Sessions } from './weather.js';

/** How awake a repo is: 1 at the moment it was touched, 0 once the trace hour has passed. */
export function warmthOf(lastAt: number | undefined, now: number): number {
  if (lastAt === undefined) return 0;
  return Math.max(0, Math.min(1, 1 - (now - lastAt) / TRACE_MS));
}

/** The warmth of every repo the activity knows about, dropping the ones gone cold. */
export function repoWarmth(
  activity: ReadonlyMap<RepoId, number>,
  now: number,
): Map<RepoId, number> {
  const out = new Map<RepoId, number>();
  for (const [repo, at] of activity) {
    const warmth = warmthOf(at, now);
    if (warmth > 0) out.set(repo, warmth);
  }
  return out;
}

/** When each repo was last touched, by a session or a block touch. Absent means never. */
export function repoActivity(
  layout: Layout,
  sessions: Sessions,
  touches: Touches,
  now: number,
): Map<RepoId, number> {
  const out = new Map<RepoId, number>();
  const bump = (repo: RepoId, at: number): void => {
    if (at > now) return;
    const seen = out.get(repo);
    if (seen === undefined || at > seen) out.set(repo, at);
  };
  for (const s of sessions.values()) bump(s.repo, s.lastAt);
  for (const [id, list] of touches) {
    const last = list.filter((t) => t.at <= now).at(-1);
    if (last) bump(repoOf(id), last.at);
  }
  return out;
}

export interface CountryActivity {
  /** The trace of the country's freshest touch, 0 to 1. */
  trace: number;
  hue: number;
  /** An agent is on the city now. */
  present: boolean;
}

/** What each country carries at `now`: the freshest trace on it and whether an agent stands on it. */
export function countryActivity(
  layout: Layout,
  sessions: Sessions,
  touches: Touches,
  hueFor: (agentId: string) => number,
  now: number,
): Map<string, CountryActivity> {
  const out = new Map<string, CountryActivity>();
  for (const [id, list] of touches) {
    const placed = layout.blocks.get(id);
    if (!placed) continue;
    const memory = memoryOf(list, now);
    if (!memory.last || memory.trace <= 0) continue;
    const current = out.get(placed.country);
    if (!current || memory.trace > current.trace) {
      out.set(placed.country, {
        trace: memory.trace,
        hue: hueFor(memory.last.agentId),
        present: current?.present ?? false,
      });
    }
  }
  for (const s of sessions.values()) {
    if (s.leftAt !== undefined || s.block === undefined) continue;
    const placed = layout.blocks.get(s.block);
    if (!placed) continue;
    const current = out.get(placed.country);
    out.set(placed.country, {
      trace: Math.max(current?.trace ?? 0, 1),
      hue: hueFor(s.id),
      present: true,
    });
  }
  return out;
}
