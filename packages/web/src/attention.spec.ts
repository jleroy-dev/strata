import { describe, expect, it } from 'vitest';
import {
  DEAD_ZONE,
  EASE_MS,
  INITIAL_ATTENTION,
  SETTLE_MS,
  attend,
  centreOf,
  offFrame,
  outside,
} from './attention.js';

const NOW = 500_000;
const middle = { x: 0.1, y: -0.2 };
const far = { x: DEAD_ZONE.x + 0.2, y: 0 };

describe('centreOf', () => {
  it('is nothing when nothing is live', () => {
    expect(centreOf([])).toBeUndefined();
  });

  it('averages what is live', () => {
    expect(
      centreOf([
        { x: -1, y: 0 },
        { x: 1, y: 0.5 },
      ]),
    ).toEqual({ x: 0, y: 0.25 });
  });
});

describe('the dead zone', () => {
  it('holds while activity is anywhere near the middle', () => {
    expect(outside({ x: DEAD_ZONE.x - 0.01, y: DEAD_ZONE.y - 0.01 })).toBe(false);
  });

  it('answers once activity passes it on either axis', () => {
    expect(outside({ x: DEAD_ZONE.x + 0.01, y: 0 })).toBe(true);
    expect(outside({ x: 0, y: DEAD_ZONE.y + 0.01 })).toBe(true);
  });

  it('knows the difference between off the middle and off the frame', () => {
    expect(offFrame(far)).toBe(false);
    expect(offFrame({ x: 1.4, y: 0 })).toBe(true);
  });
});

describe('attend', () => {
  it('does nothing while activity sits in the dead zone', () => {
    const a = attend(INITIAL_ATTENTION, { centre: middle, now: NOW });
    expect(a.moving).toBe(false);
    expect(a.began).toBeUndefined();
    expect(a.state.moves).toBe(0);
  });

  it('does nothing at all when nothing is live', () => {
    const a = attend(INITIAL_ATTENTION, { now: NOW });
    expect(a.moving).toBe(false);
    expect(a.stranded).toBe(false);
  });

  it('eases once when activity leaves the dead zone', () => {
    const a = attend(INITIAL_ATTENTION, { centre: far, now: NOW });
    expect(a.began).toEqual(far);
    expect(a.moving).toBe(true);
    expect(a.state.moves).toBe(1);
  });

  it('never starts a second move while the first is running', () => {
    const first = attend(INITIAL_ATTENTION, { centre: far, now: NOW });
    for (const t of [1, EASE_MS / 2, EASE_MS - 1]) {
      const next = attend(first.state, { centre: far, now: NOW + t });
      expect(next.began).toBeUndefined();
      expect(next.moving).toBe(true);
      expect(next.state.moves).toBe(1);
    }
  });

  it('holds still after the ease rather than tracking frame by frame', () => {
    const first = attend(INITIAL_ATTENTION, { centre: far, now: NOW });
    let state = first.state;
    for (let t = EASE_MS; t < SETTLE_MS; t += 250) {
      const next = attend(state, { centre: far, now: NOW + t });
      expect(next.began).toBeUndefined();
      expect(next.moving).toBe(false);
      state = next.state;
    }
    expect(state.moves).toBe(1);
  });

  it('will move again once it has held long enough and activity is still away', () => {
    const first = attend(INITIAL_ATTENTION, { centre: far, now: NOW });
    const again = attend(first.state, { centre: far, now: NOW + SETTLE_MS });
    expect(again.began).toEqual(far);
    expect(again.state.moves).toBe(2);
  });

  it('spends a few moves a day once each move has recentred what it moved for', () => {
    const day = 24 * 60 * 60_000;
    const drifts = [0.2, 0.35, 0.5, 0.62].map((h) => h * day);
    let state = INITIAL_ATTENTION;
    let centre = { x: 0, y: 0 };
    for (let t = 0; t < day; t += 500) {
      const now = NOW + t;
      if (drifts.some((d) => Math.abs(t - d) < 250)) centre = far;
      const next = attend(state, { centre, now });
      if (next.began) centre = { x: 0, y: 0 };
      state = next.state;
    }
    expect(state.moves).toBe(drifts.length);
  });

  it('says so rather than chasing when activity has left the frame', () => {
    const first = attend(INITIAL_ATTENTION, { centre: far, now: NOW });
    const gone = attend(first.state, { centre: { x: 1.6, y: 0 }, now: NOW + EASE_MS + 10 });
    expect(gone.began).toBeUndefined();
    expect(gone.stranded).toBe(true);
  });

  it('is not stranded while it is on its way', () => {
    const first = attend(INITIAL_ATTENTION, { centre: { x: 1.6, y: 0 }, now: NOW });
    expect(first.moving).toBe(true);
    expect(first.stranded).toBe(false);
  });
});
