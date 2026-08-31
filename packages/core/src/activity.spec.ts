import { describe, expect, it } from 'vitest';
import { repoWarmth, warmthOf } from './activity.js';
import { TRACE_MS } from './memory.js';
import { repoId } from './qualified.js';

const NOW = 1_000_000;

describe('warmthOf', () => {
  it('is full at the moment of the touch', () => {
    expect(warmthOf(NOW, NOW)).toBe(1);
  });

  it('falls to nothing over the trace hour', () => {
    expect(warmthOf(NOW - TRACE_MS / 2, NOW)).toBeCloseTo(0.5, 9);
    expect(warmthOf(NOW - TRACE_MS, NOW)).toBe(0);
    expect(warmthOf(NOW - TRACE_MS * 3, NOW)).toBe(0);
  });

  it('is nothing for a repo nobody has touched', () => {
    expect(warmthOf(undefined, NOW)).toBe(0);
  });

  it('never runs hotter than full for a touch in the future', () => {
    expect(warmthOf(NOW + 5_000, NOW)).toBe(1);
  });
});

describe('repoWarmth', () => {
  const web2 = repoId('web2');
  const credx = repoId('credx');
  const lookups = repoId('lookups');

  it('keeps the warm ones and drops the ones gone cold', () => {
    const warmth = repoWarmth(
      new Map([
        [web2, NOW],
        [credx, NOW - TRACE_MS / 4],
        [lookups, NOW - TRACE_MS - 1],
      ]),
      NOW,
    );
    expect(warmth.get(web2)).toBe(1);
    expect(warmth.get(credx)).toBeCloseTo(0.75, 9);
    expect(warmth.has(lookups)).toBe(false);
  });

  it('is empty when nothing has been touched', () => {
    expect(repoWarmth(new Map(), NOW).size).toBe(0);
  });
});
