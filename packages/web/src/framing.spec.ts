import { describe, expect, it } from 'vitest';
import { blockId, type Agent, type Layout } from '@strata/core';
import { INITIAL_FOLLOW, districtFrame, follow } from './framing.js';

const id = (path: string) => blockId(`repo:${path}`);

const country = id('apps/ui');
const layout = {
  blocks: new Map([
    [id('apps/ui/src/a.ts'), { cell: { x: 21, z: 11 }, country, district: 'src' }],
    [id('apps/ui/lib/b.ts'), { cell: { x: 40, z: 30 }, country, district: 'lib' }],
  ]),
  districts: [
    { country, district: 'src', x: 20, z: 10, w: 6, h: 4 },
    { country, district: 'lib', x: 38, z: 28, w: 4, h: 4 },
  ],
  countries: [],
  continents: [],
  planets: [],
} as unknown as Layout;

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: 'a',
  repo: 'repo' as Agent['repo'],
  label: 'claude-a',
  hue: 100,
  verb: 'editing',
  lastAt: 0,
  ...over,
});

const tallest = (): number => 3;
const input = { layout, tallest };

describe('follow', () => {
  it('frames the district of an agent that is on a block, biased to its cell', () => {
    const state = follow(INITIAL_FOLLOW, {
      ...input,
      agent: agent({ block: id('apps/ui/src/a.ts') }),
    });
    expect(state.followed).toBe('a');
    expect(state.framed?.country).toBe(country);
    expect(state.framed?.rect).toMatchObject({ x: 20, z: 10, w: 6, h: 4 });
    expect(state.framed?.top).toBe(3);
    expect(state.framed?.bias).toEqual({ x: 21, z: 11 });
  });

  it('widens the frame to where the beacon set off from', () => {
    const state = follow(INITIAL_FOLLOW, {
      ...input,
      agent: agent({ block: id('apps/ui/src/a.ts') }),
      origin: id('apps/ui/lib/b.ts'),
    });
    const r = state.framed!.rect;
    expect(r.x).toBe(20);
    expect(r.x + r.w).toBeGreaterThanOrEqual(42);
    expect(r.z + r.h).toBeGreaterThanOrEqual(32);
  });

  it('keeps the last frame while the same agent is between blocks', () => {
    const framed = follow(INITIAL_FOLLOW, {
      ...input,
      agent: agent({ block: id('apps/ui/src/a.ts') }),
    });
    const between = follow(framed, { ...input, agent: agent() });
    expect(between.framed).toBe(framed.framed);
  });

  it('drops the frame when the followed agent changes and has no block', () => {
    const framed = follow(INITIAL_FOLLOW, {
      ...input,
      agent: agent({ block: id('apps/ui/src/a.ts') }),
    });
    const other = follow(framed, { ...input, agent: agent({ id: 'b' }) });
    expect(other.followed).toBe('b');
    expect(other.framed).toBeUndefined();
  });

  it('frames nothing with no agent', () => {
    expect(follow(INITIAL_FOLLOW, input)).toEqual({});
  });
});

describe('districtFrame', () => {
  it('is undefined for a block the layout does not hold', () => {
    expect(districtFrame(layout, id('nope.ts'), tallest)).toBeUndefined();
  });
});
