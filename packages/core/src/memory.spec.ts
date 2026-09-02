import { describe, expect, it } from 'vitest';
import { CONTEST_MS, HEAT_MS, TRACE_MS, foldTouch, memoryOf, type Touches } from './memory.js';
import { REPO, at } from './fixtures/ids.js';

describe('memory', () => {
  const t0 = 1_000_000;
  let touches: Touches = new Map();
  touches = foldTouch(
    touches,
    { kind: 'agent.editing', repo: REPO, agentId: 'a', id: at('x.ts') },
    t0,
  );
  touches = foldTouch(touches, { kind: 'agent.running', repo: REPO, agentId: 'a' }, t0 + 1);
  touches = foldTouch(
    touches,
    { kind: 'agent.running', repo: REPO, agentId: 'a', id: at('y.ts') },
    t0 + 2,
  );
  touches = foldTouch(
    touches,
    { kind: 'agent.reading', repo: REPO, agentId: 'b', id: at('x.ts') },
    t0 + 1000,
  );

  it('records reads, edits and commands that name a block, and nothing without one', () => {
    expect(touches.get(at('x.ts'))).toHaveLength(2);
    expect(touches.get(at('y.ts'))).toEqual([{ agentId: 'a', at: t0 + 2, verb: 'running' }]);
  });

  it('decays heat over 20 s and trace over an hour', () => {
    const m = memoryOf(touches.get(at('x.ts')), t0 + 1000 + HEAT_MS / 2);
    expect(m.last?.agentId).toBe('b');
    expect(m.heat).toBeCloseTo(0.5);
    expect(m.trace).toBeGreaterThan(0.99);
    expect(memoryOf(touches.get(at('x.ts')), t0 + 1000 + TRACE_MS).trace).toBe(0);
  });

  it('is contested while two agents touched it within five minutes', () => {
    expect(memoryOf(touches.get(at('x.ts')), t0 + 2000).contested).toEqual(['a', 'b']);
    expect(memoryOf(touches.get(at('x.ts')), t0 + CONTEST_MS + 1).contested).toBeUndefined();
  });

  it('ignores touches after now, so a scrub can look back', () => {
    expect(memoryOf(touches.get(at('x.ts')), t0 + 500).last?.agentId).toBe('a');
  });
});
