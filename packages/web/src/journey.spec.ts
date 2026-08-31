import { describe, expect, it } from 'vitest';
import {
  TRAVEL_MAX_MS,
  TRAVEL_MIN,
  TRAVEL_MIN_MS,
  arcOf,
  isJourney,
  journeyAt,
  journeyMs,
  peakDistance,
  spanOf,
} from './journey.js';
import { distanceOf, type View } from './view.js';

const view = (over: Partial<View> = {}): View => ({
  focus: { x: 0, z: 0 },
  bearing: 0.26,
  pitch: Math.PI / 5,
  zoom: 0.3,
  ...over,
});

const near = view({ focus: { x: 20, z: 0 } });
const far = view({ focus: { x: 500, z: 120 } });

describe('isJourney', () => {
  it('treats a small correction as no journey at all', () => {
    expect(isJourney(view(), near)).toBe(false);
    expect(spanOf(view(), near)).toBeLessThan(TRAVEL_MIN);
  });

  it('treats a hop across the map as one', () => {
    expect(isJourney(view(), far)).toBe(true);
  });
});

describe('journeyMs', () => {
  it('takes longer the further it goes, within bounds', () => {
    const short = journeyMs(view(), view({ focus: { x: 60, z: 0 } }));
    const long = journeyMs(view(), far);
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(TRAVEL_MIN_MS);
    expect(long).toBeLessThanOrEqual(TRAVEL_MAX_MS);
  });

  it('never makes the reader wait, however far it goes', () => {
    const across = view({ focus: { x: 40_000, z: 40_000 } });
    expect(journeyMs(view(), across)).toBe(TRAVEL_MAX_MS);
  });
});

describe('journeyAt', () => {
  it('starts where it started and ends where it was sent', () => {
    const from = view();
    expect(journeyAt(from, far, 0).focus).toEqual(from.focus);
    expect(journeyAt(from, far, 1).focus.x).toBeCloseTo(far.focus.x, 9);
    expect(journeyAt(from, far, 1).focus.z).toBeCloseTo(far.focus.z, 9);
    expect(journeyAt(from, far, 1).zoom).toBeCloseTo(far.zoom, 9);
  });

  it('holds at both ends rather than running past them', () => {
    expect(journeyAt(view(), far, -1)).toEqual(journeyAt(view(), far, 0));
    expect(journeyAt(view(), far, 5)).toEqual(journeyAt(view(), far, 1));
  });

  it('stands back on the way and comes down again, so the ground never races past', () => {
    const from = view();
    const middle = journeyAt(from, far, 0.5);
    expect(middle.zoom).toBeGreaterThan(Math.max(from.zoom, far.zoom));
    expect(peakDistance(from, far)).toBeGreaterThan(distanceOf(from.zoom) * 1.4);
  });

  it('stands back further for a longer journey', () => {
    const middling = view({ focus: { x: 120, z: 0 } });
    expect(arcOf(view(), far)).toBeGreaterThan(arcOf(view(), middling));
  });

  it('does not arc at all for a correction', () => {
    expect(arcOf(view(), near)).toBe(0);
    expect(journeyAt(view(), near, 0.5).zoom).toBeCloseTo(view().zoom, 9);
  });

  it('moves smoothly, with no frame carrying a large part of the trip', () => {
    const from = view();
    const ms = journeyMs(from, far);
    const step = 16 / ms;
    let biggest = 0;
    for (let k = 0; k + step <= 1; k += step) {
      const a = journeyAt(from, far, k);
      const b = journeyAt(from, far, k + step);
      biggest = Math.max(biggest, Math.hypot(b.focus.x - a.focus.x, b.focus.z - a.focus.z));
    }
    expect(biggest / spanOf(from, far)).toBeLessThan(0.05);
  });

  it('eases in and out rather than starting at full speed', () => {
    const from = view();
    const first = spanOf(from, journeyAt(from, far, 0.05));
    const middle = spanOf(journeyAt(from, far, 0.45), journeyAt(from, far, 0.55));
    expect(first).toBeLessThan(middle);
  });

  it('turns the short way round', () => {
    const from = view({ bearing: 0.1 });
    const to = view({ focus: far.focus, bearing: Math.PI * 2 - 0.1 });
    expect(journeyAt(from, to, 0.5).bearing).toBeLessThan(0.1);
  });
});
