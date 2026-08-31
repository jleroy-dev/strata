import { describe, expect, it } from 'vitest';
import { POLL_MS, RETRY_MS, pollAfter } from './sim.js';

describe('pollAfter', () => {
  it('stops asking a server that has refused', () => {
    expect(pollAfter(403)).toBeUndefined();
  });

  it('settles into the slow poll while the server answers', () => {
    expect(pollAfter(200)).toBe(POLL_MS);
    expect(pollAfter(204)).toBe(POLL_MS);
  });

  it('asks again soon after anything that might yet pass', () => {
    expect(pollAfter(404)).toBe(RETRY_MS);
    expect(pollAfter(500)).toBe(RETRY_MS);
    expect(RETRY_MS).toBeLessThan(POLL_MS);
  });
});
