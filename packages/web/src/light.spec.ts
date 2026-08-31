import { describe, expect, it } from 'vitest';
import { KEY_ELEVATION, LIGHT_DRIFT_MS, LIGHT_SWING, keyLightAt } from './light.js';

const bearing = (at: number): number => {
  const p = keyLightAt(at);
  return Math.atan2(p.z, p.x);
};

describe('keyLightAt', () => {
  it('holds the key light above the map at every moment', () => {
    for (const t of [0, LIGHT_DRIFT_MS / 4, LIGHT_DRIFT_MS / 2, LIGHT_DRIFT_MS * 0.75]) {
      expect(keyLightAt(t).y).toBeCloseTo(KEY_ELEVATION * 100, 9);
    }
  });

  it('comes back to where it started every drift', () => {
    expect(keyLightAt(LIGHT_DRIFT_MS)).toEqual(keyLightAt(0));
    expect(keyLightAt(LIGHT_DRIFT_MS * 3 + 1234)).toEqual(keyLightAt(1234));
  });

  it('swings and comes back rather than circling the map', () => {
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const b = bearing((LIGHT_DRIFT_MS * i) / 400);
      low = Math.min(low, b);
      high = Math.max(high, b);
    }
    const sweep = ((high - low) * 180) / Math.PI;
    expect(sweep).toBeGreaterThan(4);
    expect(sweep).toBeLessThan(90);
  });

  it('moves far too slowly to read as an event', () => {
    let fastest = 0;
    for (let i = 0; i < 600; i++) {
      const at = (LIGHT_DRIFT_MS * i) / 600;
      fastest = Math.max(fastest, Math.abs(bearing(at + 1000) - bearing(at)) * (180 / Math.PI));
    }
    expect(fastest).toBeLessThan(1);
  });

  it('reaches its full swing and never overshoots it', () => {
    const x = [];
    for (let i = 0; i <= 400; i++) x.push(keyLightAt((LIGHT_DRIFT_MS * i) / 400).x / 100);
    expect(Math.max(...x)).toBeCloseTo(-0.6 + LIGHT_SWING, 4);
    expect(Math.min(...x)).toBeCloseTo(-0.6 - LIGHT_SWING, 4);
  });
});
