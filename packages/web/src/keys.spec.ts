import { describe, expect, it } from 'vitest';
import { Keys } from './keys.js';

describe('held keys', () => {
  it('holds a key from its keydown to its keyup', () => {
    const keys = new Keys();
    keys.press('KeyW');
    expect(keys.held.has('KeyW')).toBe(true);
    keys.release('KeyW');
    expect(keys.held.has('KeyW')).toBe(false);
  });

  it('holds a chord, whichever key the keyboard goes on repeating', () => {
    const keys = new Keys();
    keys.press('KeyW');
    keys.press('Space');
    for (let i = 0; i < 500; i++) keys.press('Space');
    expect([...keys.held].sort()).toEqual(['KeyW', 'Space']);
  });

  it('lets go of everything when the window does', () => {
    const keys = new Keys();
    keys.press('KeyW');
    keys.press('KeyD');
    keys.clear();
    expect(keys.held.size).toBe(0);
  });
});
