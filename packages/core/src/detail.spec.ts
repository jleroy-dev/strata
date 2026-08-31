import { describe, expect, it } from 'vitest';
import { TOWERS_AT, TOWERS_UNTIL, admit, tierOf } from './detail.js';

describe('tierOf', () => {
  it('grows towers at the threshold and keeps them a little under it', () => {
    expect(tierOf(TOWERS_AT - 0.1)).toBe('body');
    expect(tierOf(TOWERS_AT)).toBe('towers');
    expect(tierOf(TOWERS_UNTIL + 0.1, 'towers')).toBe('towers');
    expect(tierOf(TOWERS_UNTIL - 0.1, 'towers')).toBe('body');
  });
});

describe('admit', () => {
  const country = (key: string, pxPerCell: number, towers: number) => ({
    key,
    pxPerCell,
    towers,
  });

  it('takes the largest on screen first and skips what the budget cannot hold', () => {
    const chosen = admit(
      [country('a', 4, 500), country('b', 12, 800), country('c', 6, 300), country('d', 5, 700)],
      new Set(),
      1200,
    );
    expect([...chosen]).toEqual(['b', 'c']);
  });

  it('ignores countries too small on screen', () => {
    expect(admit([country('small', 1, 10)], new Set()).size).toBe(0);
  });

  it('keeps a country that already has towers slightly under the threshold', () => {
    expect(admit([country('a', 2.6, 10)], new Set(['a'])).has('a')).toBe(true);
    expect(admit([country('a', 2.6, 10)], new Set()).has('a')).toBe(false);
  });
});
