import { describe, expect, it } from 'vitest';
import {
  PITCH_FAR,
  PITCH_NEAR,
  ZOOM_FAR,
  ZOOM_NEAR,
  ZOOM_STEP,
  EYE_CLEARANCE,
  clampFocus,
  clampPitch,
  clearingPitch,
  clampZoom,
  distanceOf,
  eyeOffset,
  groundOffsetAt,
  orbitBy,
  panBy,
  panVelocity,
  turnVelocity,
  pitchBandAt,
  settle,
  unitsPerPixel,
  zoomAt,
  zoomOf,
  type View,
} from './view.js';

const WORLD = { w: 760, h: 760 };
const PANEL = { width: 900, height: 700 };
const ASPECT = PANEL.width / PANEL.height;

const view = (over: Partial<View> = {}): View => ({
  focus: { x: 0, z: 0 },
  bearing: 0,
  pitch: Math.PI / 4,
  zoom: 0.5,
  ...over,
});

describe('zoom', () => {
  it('runs from standing on the map to seeing all of it', () => {
    expect(distanceOf(0)).toBe(ZOOM_NEAR);
    expect(distanceOf(1)).toBeCloseTo(ZOOM_FAR, 6);
  });

  it('is exponential, so every notch feels the same', () => {
    const step = (z: number) => distanceOf(z + ZOOM_STEP) / distanceOf(z);
    expect(step(0.2)).toBeCloseTo(step(0.8), 9);
  });

  it('round trips through a distance', () => {
    for (const d of [ZOOM_NEAR, 120, 800, ZOOM_FAR]) {
      expect(distanceOf(zoomOf(d))).toBeCloseTo(d, 6);
    }
  });

  it('cannot be pushed past either end', () => {
    expect(clampZoom(-3)).toBe(0);
    expect(clampZoom(9)).toBe(1);
    expect(distanceOf(-3)).toBe(ZOOM_NEAR);
  });
});

describe('the pitch band', () => {
  it('lets the eye drop low close in and flattens it far out', () => {
    expect(pitchBandAt(0).min).toBeCloseTo(PITCH_NEAR.min, 9);
    expect(pitchBandAt(1).min).toBeCloseTo(PITCH_FAR.min, 9);
    expect(pitchBandAt(1).min).toBeGreaterThan(pitchBandAt(0).min);
  });

  it('only ever tightens as the eye pulls back', () => {
    let previous = -Infinity;
    for (let z = 0; z <= 1; z += 0.02) {
      const min = pitchBandAt(z).min;
      expect(min).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = min;
    }
  });

  it('never lets the eye reach the horizontal or look straight down', () => {
    for (let z = 0; z <= 1; z += 0.05) {
      const band = pitchBandAt(z);
      expect(band.min).toBeGreaterThan(0);
      expect(band.max).toBeLessThan(Math.PI / 2);
    }
  });

  it('pulls a pitch that is now too low up when the eye pulls back', () => {
    const low = PITCH_NEAR.min;
    expect(clampPitch(low, 1)).toBeCloseTo(PITCH_FAR.min, 9);
    expect(clampPitch(low, 1)).toBeGreaterThan(clampPitch(low, 0));
  });

  it('takes whichever floor is higher, the band or the clearance', () => {
    for (let z = 0; z <= 1; z += 0.05) {
      const floor = Math.max(pitchBandAt(z).min, clearingPitch(z));
      expect(clampPitch(0, z)).toBeCloseTo(floor, 9);
    }
  });
});

describe('clearance', () => {
  it('never lets the eye stand inside what is built on the ground', () => {
    for (let z = 0; z <= 1; z += 0.02) {
      const pitch = clampPitch(0, z);
      expect(eyeOffset(view({ zoom: z, pitch })).y).toBeGreaterThanOrEqual(EYE_CLEARANCE - 1e-6);
    }
  });

  it('asks for a steeper angle the closer the eye stands', () => {
    expect(clearingPitch(0)).toBeGreaterThan(clearingPitch(0.5));
    expect(clearingPitch(0.5)).toBeGreaterThan(clearingPitch(1));
  });

  it('stops asking once the eye is far enough back for the band to be the only limit', () => {
    expect(clearingPitch(1)).toBeLessThan(pitchBandAt(1).min);
  });
});

describe('the eye', () => {
  it('stands its distance from the focus', () => {
    const v = view({ zoom: 0.3, pitch: 0.6, bearing: 1.2 });
    const e = eyeOffset(v);
    expect(Math.hypot(e.x, e.y, e.z)).toBeCloseTo(distanceOf(v.zoom), 6);
  });

  it('is always above the ground it looks at, at every pitch the band allows', () => {
    for (let z = 0; z <= 1; z += 0.1) {
      const band = pitchBandAt(z);
      for (const pitch of [band.min, (band.min + band.max) / 2, band.max]) {
        expect(eyeOffset(view({ zoom: z, pitch })).y).toBeGreaterThan(0);
      }
    }
  });

  it('swings round the focus with bearing and never changes its height', () => {
    const a = eyeOffset(view({ bearing: 0 }));
    const b = eyeOffset(view({ bearing: Math.PI / 2 }));
    expect(b.y).toBeCloseTo(a.y, 9);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(Math.hypot(a.x, a.z), 9);
  });
});

describe('groundOffsetAt', () => {
  it('puts the middle of the frame on the focus', () => {
    const at = groundOffsetAt(view(), { x: 0, y: 0 }, ASPECT)!;
    expect(at.x).toBeCloseTo(0, 6);
    expect(at.z).toBeCloseTo(0, 6);
  });

  it('finds ground below the middle of the frame nearer than ground above it', () => {
    const v = view();
    const low = groundOffsetAt(v, { x: 0, y: -0.5 }, ASPECT)!;
    const high = groundOffsetAt(v, { x: 0, y: 0.5 }, ASPECT)!;
    expect(Math.hypot(low.x, low.z)).toBeLessThan(Math.hypot(high.x, high.z));
  });

  it('has nothing to report for a ray that leaves over the horizon', () => {
    expect(groundOffsetAt(view({ pitch: PITCH_NEAR.min }), { x: 0, y: 1 }, ASPECT)).toBeUndefined();
  });
});

describe('panBy', () => {
  /** Where the ground that started under the middle sits after a drag, in screen terms. */
  const followed = (v: View, dx: number, dy: number) => {
    const after = panBy(v, dx, dy, PANEL, WORLD);
    const ndc = { x: (2 * dx) / PANEL.width, y: (-2 * dy) / PANEL.height };
    const seen = groundOffsetAt(after, ndc, ASPECT)!;
    return {
      x: after.focus.x + seen.x - v.focus.x,
      z: after.focus.z + seen.z - v.focus.z,
    };
  };

  it('keeps the ground under the hand, on both axes', () => {
    for (const [dx, dy] of [
      [120, 0],
      [0, 120],
      [-90, -70],
      [80, -60],
    ]) {
      const off = followed(view({ bearing: 0, pitch: Math.PI / 4 }), dx!, dy!);
      expect(Math.hypot(off.x, off.z)).toBeLessThan(6);
    }
  });

  it('goes forward when the hand drags down and back when it drags up', () => {
    const v = view({ bearing: 0 });
    const forward = { x: -Math.sin(v.bearing), z: -Math.cos(v.bearing) };
    const down = panBy(v, 0, 100, PANEL, WORLD);
    const up = panBy(v, 0, -100, PANEL, WORLD);
    expect(down.focus.x * forward.x + down.focus.z * forward.z).toBeGreaterThan(0);
    expect(up.focus.x * forward.x + up.focus.z * forward.z).toBeLessThan(0);
  });

  it('moves the map with the drag rather than against it', () => {
    const v = view({ bearing: 0 });
    const dragged = panBy(v, 100, 0, PANEL, WORLD);
    expect(dragged.focus.x).toBeLessThan(v.focus.x);
  });

  it('covers more ground per pixel the further back the eye stands', () => {
    const near = unitsPerPixel(view({ zoom: 0.1 }), PANEL);
    const far = unitsPerPixel(view({ zoom: 0.9 }), PANEL);
    expect(far).toBeGreaterThan(near * 5);
  });

  it('turns with the bearing, so a drag always moves the map the way it points', () => {
    const east = panBy(view({ bearing: 0 }), 100, 0, PANEL, WORLD);
    const turned = panBy(view({ bearing: Math.PI / 2 }), 100, 0, PANEL, WORLD);
    expect(Math.abs(east.focus.x)).toBeGreaterThan(Math.abs(east.focus.z));
    expect(Math.abs(turned.focus.z)).toBeGreaterThan(Math.abs(turned.focus.x));
  });

  it('cannot be dragged off the edge of the world', () => {
    let v = view({ zoom: 0.2 });
    for (let i = 0; i < 400; i++) v = panBy(v, 200, 200, PANEL, WORLD);
    expect(Math.abs(v.focus.x)).toBeLessThanOrEqual(WORLD.w);
    expect(Math.abs(v.focus.z)).toBeLessThanOrEqual(WORLD.h);
  });
});

describe('panVelocity', () => {
  it('turns a screen speed into a ground speed that grows with height', () => {
    const near = panVelocity(view({ zoom: 0.1 }), 1000, 0, PANEL);
    const far = panVelocity(view({ zoom: 0.9 }), 1000, 0, PANEL);
    expect(Math.hypot(far.x, far.z)).toBeGreaterThan(Math.hypot(near.x, near.z) * 5);
  });

  it('sends the ground the same way a held drag would', () => {
    const v = view({ bearing: 0.4 });
    const held = panBy(v, 100, 60, PANEL, WORLD);
    const thrown = panVelocity(v, 100, 60, PANEL);
    const heldDir = Math.atan2(held.focus.z - v.focus.z, held.focus.x - v.focus.x);
    expect(Math.atan2(thrown.z, thrown.x)).toBeCloseTo(heldDir, 6);
  });

  it('is still when the hand is still', () => {
    const still = panVelocity(view(), 0, 0, PANEL);
    expect(Math.hypot(still.x, still.z)).toBe(0);
  });
});

describe('turnVelocity', () => {
  it('turns the way the drag went and stops when it stops', () => {
    expect(turnVelocity(500, 0, PANEL).bearing).toBeLessThan(0);
    expect(turnVelocity(-500, 0, PANEL).bearing).toBeGreaterThan(0);
    expect(Math.abs(turnVelocity(0, 0, PANEL).bearing)).toBe(0);
  });
});

describe('orbitBy', () => {
  it('carries nothing: two half turns land where one whole one does', () => {
    const v = view();
    const twice = orbitBy(orbitBy(v, 50, 20, PANEL), 50, 20, PANEL);
    const once = orbitBy(v, 100, 40, PANEL);
    expect(twice.bearing).toBeCloseTo(once.bearing, 9);
    expect(twice.pitch).toBeCloseTo(once.pitch, 9);
  });

  it('never travels past the drag it was given', () => {
    const v = view();
    const turned = orbitBy(v, 200, 0, PANEL);
    const expected = (2 * Math.PI * 200) / PANEL.height;
    expect(Math.abs(turned.bearing - v.bearing)).toBeCloseTo(expected, 9);
  });

  it('leaves the focus exactly where it was, so the frame turns about its middle', () => {
    const v = view();
    const turned = orbitBy(v, 120, 40, PANEL);
    expect(turned.focus).toEqual(v.focus);
    expect(turned.zoom).toBe(v.zoom);
  });

  it('keeps pitch inside the band for the zoom it is at', () => {
    const v = view({ zoom: 1 });
    const shoved = orbitBy(v, 0, -5000, PANEL);
    expect(shoved.pitch).toBeGreaterThanOrEqual(pitchBandAt(1).min - 1e-12);
  });
});

describe('zoomAt', () => {
  it('holds the ground under the pointer still', () => {
    const v = view({ zoom: 0.6 });
    const ndc = { x: 0.6, y: -0.35 };
    const aspect = ASPECT;
    const before = groundOffsetAt(v, ndc, aspect)!;
    const next = zoomAt(v, -4, ndc, PANEL, WORLD);
    const after = groundOffsetAt(next, ndc, aspect)!;
    const anchorBefore = { x: v.focus.x + before.x, z: v.focus.z + before.z };
    const anchorAfter = { x: next.focus.x + after.x, z: next.focus.z + after.z };
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
    expect(anchorAfter.z).toBeCloseTo(anchorBefore.z, 6);
  });

  it('leaves the focus alone when the pointer is in the middle', () => {
    const v = view();
    const next = zoomAt(v, -3, { x: 0, y: 0 }, PANEL, WORLD);
    expect(next.focus.x).toBeCloseTo(v.focus.x, 6);
    expect(next.focus.z).toBeCloseTo(v.focus.z, 6);
    expect(next.zoom).toBeLessThan(v.zoom);
  });

  it('never lets the focus wander off the ground, however hard it is zoomed', () => {
    let v = view({ zoom: 1, pitch: pitchBandAt(1).min });
    for (let i = 0; i < 60; i++) v = zoomAt(v, -2, { x: 0.9, y: 0.9 }, PANEL, WORLD);
    expect(Number.isFinite(v.focus.x)).toBe(true);
    expect(Math.abs(v.focus.x)).toBeLessThanOrEqual(WORLD.w);
    expect(Math.abs(v.focus.z)).toBeLessThanOrEqual(WORLD.h);
    expect(v.zoom).toBe(0);
  });
});

describe('settle', () => {
  it('brings every number inside its limits at once', () => {
    const wild = settle({ focus: { x: 9e5, z: -9e5 }, bearing: 12, pitch: 3, zoom: 4 }, WORLD);
    expect(wild.zoom).toBe(1);
    expect(wild.pitch).toBeLessThanOrEqual(pitchBandAt(1).max);
    expect(wild.focus).toEqual(clampFocus({ x: 9e5, z: -9e5 }, WORLD));
  });

  it('leaves a view that is already inside them untouched', () => {
    const v = view();
    expect(settle(v, WORLD)).toEqual(v);
  });
});
