import { describe, expect, it } from 'vitest';
import type { Block } from './events.js';
import { FIXTURE_FILES } from './fixtures/repo.js';
import { placeBlocks } from './hierarchy.js';
import { applyTerrain, layoutOf } from './layout.js';
import {
  DISSOLVE_MS,
  RIBBON_RETRACT_MS,
  flightFor,
  motions,
  ribbonPhase,
  type World,
} from './motion.js';
import { foldWeather, type Session, type Sessions } from './weather.js';

const files = (): Block[] =>
  placeBlocks(
    FIXTURE_FILES.map(([id]) => id),
    new Map(FIXTURE_FILES),
  );
const block = (id: string, size = 1000): Block =>
  placeBlocks([id, ...FIXTURE_FILES.map(([f]) => f)], new Map([[id, size]])).find(
    (b) => b.id === id,
  )!;
const base: World = { layout: layoutOf(files()), sessions: new Map() };
const kinds = (ms: ReturnType<typeof motions>): string[] => ms.map((m) => m.kind);

describe('motions', () => {
  it('is empty between identical worlds', () => {
    expect(motions(base, base)).toEqual([]);
  });

  it('rises an arrival and sinks a departure', () => {
    const added = block('docs/GLOSSARY.md');
    const next = {
      ...base,
      layout: applyTerrain(base.layout, { kind: 'block.added', block: added }).layout,
    };
    expect(motions(base, next)).toEqual([
      { kind: 'rise', id: added.id, cell: next.layout.blocks.get(added.id)!.cell },
    ]);
    const gone = {
      ...base,
      layout: applyTerrain(base.layout, { kind: 'block.removed', id: 'docs/NOTES.md' }).layout,
    };
    expect(kinds(motions(base, gone))).toEqual(['sink']);
  });

  it('blinks a rename in place and flies a move across districts', () => {
    const renamed = block('docs/NOTES-2.md', 6400);
    const inPlace = {
      ...base,
      layout: applyTerrain(base.layout, {
        kind: 'block.moved',
        from: 'docs/NOTES.md',
        block: renamed,
      }).layout,
    };
    expect(motions(base, inPlace, new Map([[renamed.id, 'docs/NOTES.md']]))).toEqual([
      { kind: 'blink', id: renamed.id, from: 'docs/NOTES.md' },
    ]);
    const moved = block('apps/api/src/NOTES.md', 6400);
    const across = {
      ...base,
      layout: applyTerrain(base.layout, {
        kind: 'block.moved',
        from: 'docs/NOTES.md',
        block: moved,
      }).layout,
    };
    const ms = motions(base, across, new Map([[moved.id, 'docs/NOTES.md']]));
    expect(
      ms.some((m) => m.kind === 'flight' && m.from === 'docs/NOTES.md' && m.id === moved.id),
    ).toBe(true);
    expect(kinds(ms)).not.toContain('sink');
  });

  it('flies a whole district as one platform', () => {
    const ids = [...base.layout.blocks]
      .filter(([, p]) => p.country === 'libs/shared/models' && p.district === 'src/lib')
      .map(([id]) => id);
    let layout = base.layout;
    const renames = new Map<string, string>();
    for (const id of ids) {
      const to = block(id.replace('src/lib/', 'src/model/'));
      layout = applyTerrain(layout, { kind: 'block.moved', from: id, block: to }).layout;
      renames.set(to.id, id);
    }
    const ms = motions(base, { ...base, layout }, renames);
    const platform = ms.find((m) => m.kind === 'platform');
    expect(platform).toMatchObject({
      kind: 'platform',
      country: 'libs/shared/models',
      district: 'src/model',
    });
    expect(kinds(ms).filter((k) => k === 'flight')).toEqual([]);
  });

  it('reports ground only when rects changed', () => {
    let layout = base.layout;
    for (let i = 0; i < 8; i++) {
      layout = applyTerrain(layout, {
        kind: 'block.added',
        block: block(`libs/shared/models/src/lib/e${String(i)}.ts`),
      }).layout;
    }
    expect(kinds(motions(base, { ...base, layout }))).toContain('ground');
  });

  it('follows sessions: arrive with a trip, trips between blocks, depart', () => {
    let sessions: Sessions = new Map();
    sessions = foldWeather(sessions, { kind: 'agent.arrived', agentId: 'a' }, 1);
    const arrived = { ...base, sessions };
    expect(motions(base, arrived)).toEqual([{ kind: 'arrive', agentId: 'a' }]);
    sessions = foldWeather(
      sessions,
      { kind: 'agent.reading', agentId: 'a', id: 'docs/NOTES.md' },
      2,
    );
    const reading = { ...base, sessions };
    expect(motions(arrived, reading)).toEqual([
      { kind: 'trip', agentId: 'a', to: 'docs/NOTES.md' },
    ]);
    sessions = foldWeather(sessions, { kind: 'agent.editing', agentId: 'a', id: 'README.md' }, 3);
    expect(motions(reading, { ...base, sessions })).toEqual([
      { kind: 'trip', agentId: 'a', from: 'docs/NOTES.md', to: 'README.md' },
    ]);
    const left = foldWeather(sessions, { kind: 'agent.left', agentId: 'a' }, 4);
    expect(motions({ ...base, sessions }, { ...base, sessions: left })).toEqual([
      { kind: 'depart', agentId: 'a' },
    ]);
  });
});

describe('motions on a folder move', () => {
  it('flies a one-file folder as a platform when the folder fact is present', () => {
    const from = 'docs/mockups/board.html';
    const to = block('docs/boards/board.html', 18000);
    const layout = applyTerrain(base.layout, { kind: 'block.moved', from, block: to }).layout;
    const renames = new Map([[to.id, from]]);
    expect(motions(base, { ...base, layout }, renames).map((m) => m.kind)).toContain('flight');
    const ms = motions(
      base,
      { ...base, layout },
      renames,
      new Map([['docs/mockups', 'docs/boards']]),
    );
    const platform = ms.find((m) => m.kind === 'platform');
    expect(platform).toMatchObject({
      kind: 'platform',
      folder: 'docs/mockups',
      district: 'boards',
    });
    expect(ms.map((m) => m.kind)).not.toContain('flight');
  });
});

describe('motions on a rename', () => {
  it('does not send the agent on a trip when its block is renamed', () => {
    let sessions: Sessions = new Map();
    sessions = foldWeather(sessions, { kind: 'agent.arrived', agentId: 'a' }, 1);
    sessions = foldWeather(
      sessions,
      { kind: 'agent.editing', agentId: 'a', id: 'docs/NOTES.md' },
      2,
    );
    const renamed = block('docs/NOTES-2.md', 6400);
    const layout = applyTerrain(base.layout, {
      kind: 'block.moved',
      from: 'docs/NOTES.md',
      block: renamed,
    }).layout;
    const after = new Map<string, Session>(sessions);
    after.set('a', { ...sessions.get('a')!, block: renamed.id });
    const ms = motions(
      { layout: base.layout, sessions },
      { layout, sessions: after },
      new Map([[renamed.id, 'docs/NOTES.md']]),
    );
    expect(ms.map((m) => m.kind)).toEqual(['blink']);
  });
});

describe('flightFor', () => {
  it('grows with distance and clamps', () => {
    expect(flightFor(0).duration).toBe(300);
    expect(flightFor(10).duration).toBeGreaterThan(flightFor(2).duration);
    expect(flightFor(1000).duration).toBe(800);
  });
});

describe('ribbonPhase', () => {
  it('grows with the flight and is gone by itself after the retraction', () => {
    expect(ribbonPhase(1000, 500, 1000)).toEqual({ head: 0, retract: 0 });
    expect(ribbonPhase(1000, 500, 1500).head).toBe(1);
    expect(ribbonPhase(1000, 500, 1500).retract).toBe(0);
    expect(ribbonPhase(1000, 500, 1500 + RIBBON_RETRACT_MS / 2).retract).toBeCloseTo(0.5);
    expect(ribbonPhase(1000, 500, 1500 + RIBBON_RETRACT_MS).retract).toBe(1);
  });

  it('dissolves faster once abandoned, even mid-flight', () => {
    const phase = ribbonPhase(1000, 800, 1400 + DISSOLVE_MS, 1400);
    expect(phase.retract).toBe(1);
    expect(ribbonPhase(1000, 800, 1400 + DISSOLVE_MS / 2, 1400).retract).toBeCloseTo(0.5);
  });
});
