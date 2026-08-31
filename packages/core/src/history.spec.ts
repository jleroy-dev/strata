import { describe, expect, it } from 'vitest';
import { REPO, at } from './fixtures/ids.js';
import { pathOf, type BlockId } from './qualified.js';
import type { Block, StrataEvent } from './events.js';
import { FIXTURE_FILES } from './fixtures/repo.js';
import { placeBlocks } from './hierarchy.js';
import { History, KEYFRAME_EVERY, foldTerrain } from './history.js';
import {
  applyTerrain,
  groundOf,
  layoutOf,
  placementDelta,
  serializeLayout,
  type Layout,
} from './layout.js';

const files = (): Block[] =>
  placeBlocks(
    REPO,
    FIXTURE_FILES.map(([id]) => id),
    new Map(FIXTURE_FILES),
  );
const block = (path: string, size = 1000): Block =>
  placeBlocks(REPO, [path, ...FIXTURE_FILES.map(([f]) => f)], new Map([[path, size]])).find(
    (b) => b.id === at(path),
  )!;

/** What the server emits for one change, placements included. */
function emit(
  layout: Layout,
  change: Parameters<typeof applyTerrain>[1],
  at: number,
): { layout: Layout; events: StrataEvent[] } {
  const result = applyTerrain(layout, change);
  const events: StrataEvent[] = [];
  if (change.kind === 'block.removed' || change.kind === 'folder.moved')
    events.push({ ...change, at });
  else if (result.placement) events.push({ ...change, placement: result.placement, at });
  if (result.repack) {
    events.push({
      kind: 'layout.repacked',
      repo: REPO,
      ...result.repack,
      blocks: placementDelta(layout, result.layout),
      ...groundOf(result.layout),
      at,
    });
  }
  return { layout: result.layout, events };
}

describe('foldTerrain reproduces applyTerrain from its events', () => {
  it('holds over adds, edits, renames, moves, removals and repacks', () => {
    let layout = layoutOf(files());
    let folded = layout;
    let seed = 11;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ids = (): BlockId[] => [...layout.blocks.keys()];
    for (let i = 0; i < 300; i++) {
      const roll = rnd();
      const pick = ids()[Math.floor(rnd() * ids().length)]!;
      let change: Parameters<typeof applyTerrain>[1];
      if (roll < 0.45) {
        const dir = pick.slice(0, pick.lastIndexOf('/') + 1);
        change = {
          kind: 'block.added',
          block: block(`${dir}new-${String(i)}.ts`, 200 + Math.floor(rnd() * 5000)),
        };
      } else if (roll < 0.6)
        change = { kind: 'block.changed', id: pick, size: Math.floor(rnd() * 9000) };
      else if (roll < 0.75)
        change = {
          kind: 'block.moved',
          from: pick,
          block: block(pathOf(pick).replace(/\.[a-z]+$/, `-r${String(i)}.ts`)),
        };
      else if (roll < 0.85)
        change = { kind: 'block.moved', from: pick, block: block(`docs/moved-${String(i)}.md`) };
      else change = { kind: 'block.removed', id: pick };
      const step = emit(layout, change, i);
      layout = step.layout;
      for (const event of step.events) folded = foldTerrain(folded, event);
      expect(serializeLayout(folded)).toEqual(serializeLayout(layout));
      for (const c of layout.countries) {
        const ds = layout.districts.filter((d) => d.country === c.country);
        expect(ds.length).toBeGreaterThan(0);
        expect(Math.min(...ds.map((d) => d.x))).toBe(c.x);
        expect(Math.min(...ds.map((d) => d.z))).toBe(c.z);
        expect(Math.max(...ds.map((d) => d.x + d.w))).toBe(c.x + c.w);
        expect(Math.max(...ds.map((d) => d.z + d.h))).toBe(c.z + c.h);
      }
    }
  });
});

describe('foldMoment on a move', () => {
  it('carries the sessions and touches of a renamed block to its new id', () => {
    const h = new History(base0, 0);
    const from = at('docs/NOTES.md');
    const moved = block('docs/NOTES-2.md', 6400);
    const step = emit(base0, { kind: 'block.moved', from, block: moved }, 10);
    h.push({ kind: 'agent.arrived', repo: REPO, agentId: 'a', at: 1 });
    h.push({ kind: 'agent.editing', repo: REPO, agentId: 'a', id: from, at: 2 });
    for (const e of step.events) h.push(e);
    const now = h.now();
    expect(now.sessions.get('a')?.block).toBe(moved.id);
    expect(now.touches.get(moved.id)).toHaveLength(1);
    expect(now.touches.has(from)).toBe(false);
  });
});

const base0 = layoutOf(files());

describe('History', () => {
  const base = layoutOf(files());

  it('keeps now incrementally and rebuilds any past moment', () => {
    const h = new History(base, 0);
    let layout = base;
    const adds: BlockId[] = [];
    for (let i = 1; i <= KEYFRAME_EVERY * 2 + 5; i++) {
      const added = block(`docs/n${String(i)}.md`);
      adds.push(added.id);
      const step = emit(layout, { kind: 'block.added', block: added }, i * 1000);
      layout = step.layout;
      for (const e of step.events) h.push(e);
      if (i === 5) h.push({ kind: 'agent.arrived', repo: REPO, agentId: 'a', at: 5_500 });
      if (i === 6)
        h.push({ kind: 'agent.editing', repo: REPO, agentId: 'a', id: adds[2]!, at: 6_500 });
    }
    expect(serializeLayout(h.now().layout)).toEqual(serializeLayout(layout));
    const early = h.at(3_000);
    expect(early.layout.blocks.has(adds[2]!)).toBe(true);
    expect(early.layout.blocks.has(adds[3]!)).toBe(false);
    expect(early.sessions.size).toBe(0);
    const mid = h.at(KEYFRAME_EVERY * 1000 + 500);
    expect(mid.layout.blocks.size).toBe(base.blocks.size + KEYFRAME_EVERY);
    expect(mid.sessions.get('a')?.block).toBe(adds[2]);
    expect(mid.touches.get(adds[2]!)).toHaveLength(1);
  });

  it('derives now from the baseline and the log, the same world the server holds', () => {
    const server = new History(base, 0);
    let layout = base;
    for (let i = 1; i <= 6; i++) {
      const step = emit(
        layout,
        { kind: 'block.added', block: block(`docs/d${String(i)}.md`) },
        i * 1000,
      );
      layout = step.layout;
      for (const e of step.events) server.push(e);
    }
    server.push({ kind: 'agent.arrived', repo: REPO, agentId: 'a', at: 6_500 });

    const panel = new History(layoutOf([]), 0);
    panel.restore(server.baseline, server.baselineAt, server.log);
    expect(serializeLayout(panel.now().layout)).toEqual(serializeLayout(layout));
    expect(serializeLayout(panel.now().layout)).toEqual(serializeLayout(server.now().layout));
    expect(panel.now().sessions.size).toBe(1);
  });

  it('folds a run without writing into the moment it started from', () => {
    const h = new History(base, 0);
    let layout = base;
    const last = KEYFRAME_EVERY * 2 + 10;
    for (let i = 1; i <= last; i++) {
      const step = emit(
        layout,
        { kind: 'block.added', block: block(`docs/f${String(i)}.md`) },
        i * 1000,
      );
      layout = step.layout;
      for (const e of step.events) h.push(e);
    }
    const baselineSize = h.baseline.blocks.size;
    const early = serializeLayout(h.at(5_000).layout);
    const late = serializeLayout(h.at(last * 1000).layout);

    expect(h.baseline.blocks.size).toBe(baselineSize);
    expect(serializeLayout(h.at(5_000).layout)).toEqual(early);
    expect(late).toEqual(serializeLayout(h.now().layout));
    expect(h.at(5_000).layout.blocks.size).toBeLessThan(h.now().layout.blocks.size);
    expect(serializeLayout(h.at(5_000).layout)).toEqual(early);
  });

  it('expires old events into the baseline without changing now', () => {
    const h = new History(base, 0, 10_000);
    let layout = base;
    for (let i = 1; i <= 20; i++) {
      const step = emit(
        layout,
        { kind: 'block.added', block: block(`docs/e${String(i)}.md`) },
        i * 1000,
      );
      layout = step.layout;
      for (const e of step.events) h.push(e);
    }
    const before = serializeLayout(h.now().layout);
    h.expire(25_000);
    expect(h.log.length).toBeLessThan(20);
    expect(h.baselineAt).toBeGreaterThan(0);
    expect(serializeLayout(h.now().layout)).toEqual(before);
    expect(serializeLayout(h.at(30_000).layout)).toEqual(before);
    expect(h.baseline.blocks.has(at('docs/e5.md'))).toBe(true);
  });
});
