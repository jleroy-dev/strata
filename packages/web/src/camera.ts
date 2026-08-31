import * as THREE from 'three';
import { ELEVATION, YAW, fit, patchCorners, type Framing } from './frame.js';
import {
  PAN_FRICTION,
  PAN_STOP,
  TURN_FRICTION,
  TURN_MAX_CARRY,
  TURN_STOP,
  capped,
  decay,
  stopped as glideStopped,
} from './glide.js';
import { TRAVEL_MIN, isJourney, journeyAt, journeyMs, spanOf } from './journey.js';
import { at, settled, smoothDamp, smoothDampAngle, type Damped } from './spring.js';
import {
  distanceOf,
  eyeOffset,
  groundOffsetAt,
  orbitBy,
  ZOOM_STEP,
  clampFocus,
  clampZoom,
  focusHolding,
  followFocus,
  panBy,
  panVelocity,
  shiftBy,
  turnVelocity,
  settle,
  zoomOf,
  type Ndc,
  type Point,
  type View,
  type Viewport,
} from './view.js';

export { ELEVATION, YAW } from './frame.js';
export type { Framing } from './frame.js';

/** How long each channel takes to cover most of its distance. */
export const SMOOTH = { move: 0.05, turn: 0.055, zoom: 0.07 };

/** The lag a camera operator carries while following, and how slowly it changes its standing. */
export const FOLLOW_SMOOTH = { move: 0.42, zoom: 1.1 };

/** How far an agent may wander in frame before the camera answers at all. */
export const FOLLOW_DEAD = { x: 0.26, y: 0.22 };

/** The pace of the one move the camera makes on its own, which is not a pace a hand sets. */
export const DRIFT_SMOOTH = 0.62;
export const DRIFT_MS = 2400;

/** Ground the camera must fit: a footprint round `centre` and how tall it stands. */
export interface Patch {
  centre: THREE.Vector3;
  radius: number;
  height: number;
}

const UP = new THREE.Vector3(0, 1, 0);

const REST: View = {
  focus: { x: 0, z: 0 },
  bearing: YAW,
  pitch: ELEVATION,
  zoom: 0.8,
};

/**
 * The one camera. Four numbers say where it stands, a spring per channel carries it there, and
 * every mode writes the same four numbers, so there is no handover between them.
 */
export class MapCamera {
  private want: View = REST;
  private x: Damped = at(REST.focus.x);
  private z: Damped = at(REST.focus.z);
  private bearing: Damped = at(REST.bearing);
  private pitch: Damped = at(REST.pitch);
  private zoom: Damped = at(REST.zoom);
  private world = { w: 0, h: 0 };
  private groundAt: (x: number, z: number) => number = () => 0;
  private driftUntil = 0;
  private anchor: { world: Point; ndc: Ndc } | undefined;
  private pan: Point | undefined;
  private turn: { bearing: number; pitch: number } | undefined;
  private trip: { from: View; to: View; startedAt: number; ms: number } | undefined;
  private following = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  standOn(groundAt: (x: number, z: number) => number): void {
    this.groundAt = groundAt;
  }

  setWorld(world: { w: number; h: number }): void {
    this.world = world;
    this.want = settle(this.want, world);
  }

  /** Where the camera is heading. */
  get target(): View {
    return this.want;
  }

  /** Where the camera stands this frame. */
  get view(): View {
    return {
      focus: { x: this.x.value, z: this.z.value },
      bearing: this.bearing.value,
      pitch: this.pitch.value,
      zoom: this.zoom.value,
    };
  }

  get distance(): number {
    return distanceOf(this.zoom.value);
  }

  private get lens(): { fov: number; aspect: number } {
    return { fov: this.camera.fov, aspect: this.camera.aspect };
  }

  /** A mode says where to be. A long way off becomes a journey, a short way a correction. */
  aim(view: View, now = 0): void {
    this.following = false;
    const next = settle(view, this.world);
    const trip = this.trip;
    if (trip) {
      if (spanOf(trip.to, next) < TRAVEL_MIN) {
        this.trip = { ...trip, to: next };
        this.want = next;
        return;
      }
      this.trip = undefined;
    }
    if (isJourney(this.view, next)) {
      this.trip = { from: this.view, to: next, startedAt: now, ms: journeyMs(this.view, next) };
      this.pan = undefined;
      this.turn = undefined;
      this.anchor = undefined;
    }
    this.want = next;
  }

  /**
   * Keeps an agent in frame without chasing it: while it stays inside the dead zone nothing
   * moves, and outside it the camera brings it back at an operator's pace rather than a hand's.
   */
  follow(target: Point, zoom: number): void {
    this.following = true;
    this.trip = undefined;
    const shown = this.view;
    const focus = clampFocus(
      followFocus(shown, target, FOLLOW_DEAD, this.camera.aspect),
      this.world,
    );
    this.want = settle({ ...this.want, focus, zoom }, this.world);
  }

  private travel(now: number): boolean {
    const trip = this.trip;
    if (!trip) return false;
    const k = trip.ms <= 0 ? 1 : (now - trip.startedAt) / trip.ms;
    const view = journeyAt(trip.from, trip.to, k);
    this.x = at(view.focus.x);
    this.z = at(view.focus.z);
    this.bearing = at(view.bearing);
    this.pitch = at(view.pitch);
    this.zoom = at(view.zoom);
    if (k >= 1) this.trip = undefined;
    return true;
  }

  jump(view: View): void {
    this.driftUntil = 0;
    this.anchor = undefined;
    this.pan = undefined;
    this.turn = undefined;
    this.trip = undefined;
    this.want = settle(view, this.world);
    this.x = at(this.want.focus.x);
    this.z = at(this.want.focus.z);
    this.bearing = at(this.want.bearing);
    this.pitch = at(this.want.pitch);
    this.zoom = at(this.want.zoom);
  }

  panBy(dx: number, dy: number, viewport: Viewport): void {
    this.driftUntil = 0;
    this.following = false;
    this.trip = undefined;
    this.anchor = undefined;
    this.pan = undefined;
    this.want = panBy(this.want, dx, dy, viewport, this.world);
  }

  /** Lets a drag carry on after the hand leaves, losing speed to friction until it stops. */
  flickBy(vx: number, vy: number, panning: boolean, viewport: Viewport): void {
    if (panning) {
      this.pan = panVelocity(this.want, vx, vy, viewport);
      return;
    }
    const turn = turnVelocity(vx, vy, viewport);
    this.turn = {
      bearing: capped(turn.bearing, TURN_FRICTION, TURN_STOP, TURN_MAX_CARRY),
      pitch: capped(turn.pitch, TURN_FRICTION, TURN_STOP, TURN_MAX_CARRY),
    };
  }

  private carry(dt: number): void {
    const pan = this.pan;
    if (pan) {
      this.want = shiftBy(this.want, pan.x * dt, pan.z * dt, this.world);
      const next = { x: decay(pan.x, PAN_FRICTION, dt), z: decay(pan.z, PAN_FRICTION, dt) };
      this.pan = glideStopped(Math.hypot(next.x, next.z), PAN_STOP) ? undefined : next;
    }
    const turn = this.turn;
    if (turn) {
      this.want = settle(
        {
          ...this.want,
          bearing: this.want.bearing + turn.bearing * dt,
          pitch: this.want.pitch + turn.pitch * dt,
        },
        this.world,
      );
      const next = {
        bearing: decay(turn.bearing, TURN_FRICTION, dt),
        pitch: decay(turn.pitch, TURN_FRICTION, dt),
      };
      this.turn = glideStopped(Math.hypot(next.bearing, next.pitch), TURN_STOP) ? undefined : next;
    }
  }

  orbitBy(dx: number, dy: number, viewport: Viewport): void {
    this.anchor = undefined;
    this.following = false;
    this.trip = undefined;
    this.turn = undefined;
    this.want = settle(orbitBy(this.want, dx, dy, viewport), this.world);
  }

  /**
   * The ground under the pointer is taken once and then held every frame, so the anchor is
   * still while the motion runs rather than only once it has stopped.
   */
  zoomAt(notches: number, ndc: Ndc): void {
    this.driftUntil = 0;
    this.following = false;
    this.trip = undefined;
    if (!this.anchor || Math.hypot(this.anchor.ndc.x - ndc.x, this.anchor.ndc.y - ndc.y) > 0.05) {
      const shown = this.view;
      const off = groundOffsetAt(shown, ndc, this.camera.aspect);
      this.anchor = off
        ? { world: { x: shown.focus.x + off.x, z: shown.focus.z + off.z }, ndc }
        : undefined;
    }
    const zoom = clampZoom(this.want.zoom + notches * ZOOM_STEP);
    this.want = settle({ ...this.want, zoom }, this.world);
  }

  private holdAnchor(): void {
    const anchor = this.anchor;
    if (!anchor) return;
    if (settled(this.zoom, this.want.zoom, 1e-4)) {
      this.anchor = undefined;
      return;
    }
    const focus = clampFocus(
      focusHolding(this.view, anchor.world, anchor.ndc, this.camera.aspect),
      this.world,
    );
    this.x = at(focus.x);
    this.z = at(focus.z);
    this.want = { ...this.want, focus };
  }

  /** Brings the ground under a point of the frame to the middle, at the pace of a drift. */
  driftToCentre(ndc: Ndc, now: number): void {
    this.bringToCentre(ndc);
    this.driftUntil = now + DRIFT_MS;
  }

  /** Brings the ground under a point of the frame to the middle of it. */
  bringToCentre(ndc: Ndc): void {
    const offset = groundOffsetAt(this.want, ndc, this.camera.aspect);
    if (!offset) return;
    this.want = settle(
      {
        ...this.want,
        focus: { x: this.want.focus.x + offset.x, z: this.want.focus.z + offset.z },
      },
      this.world,
    );
  }

  update(dt: number, now = 0): void {
    const seconds = Math.min(0.1, Math.max(0, dt) / 1000);
    if (!this.travel(now)) {
      this.carry(seconds);
      const move =
        now < this.driftUntil ? DRIFT_SMOOTH : this.following ? FOLLOW_SMOOTH.move : SMOOTH.move;
      const zoomPace = this.following ? FOLLOW_SMOOTH.zoom : SMOOTH.zoom;
      this.x = smoothDamp(this.x, this.want.focus.x, move, seconds);
      this.z = smoothDamp(this.z, this.want.focus.z, move, seconds);
      this.bearing = smoothDampAngle(this.bearing, this.want.bearing, SMOOTH.turn, seconds);
      this.pitch = smoothDamp(this.pitch, this.want.pitch, SMOOTH.turn, seconds);
      this.zoom = smoothDamp(this.zoom, this.want.zoom, zoomPace, seconds);
      this.holdAnchor();
    }
    const view = this.view;
    const focus = new THREE.Vector3(
      view.focus.x,
      this.groundAt(view.focus.x, view.focus.z),
      view.focus.z,
    );
    const eye = eyeOffset(view);
    this.camera.up.copy(UP);
    this.camera.position.set(focus.x + eye.x, focus.y + eye.y, focus.z + eye.z);
    this.camera.lookAt(focus);
  }

  /** A view that holds a set of patches of ground in frame, from the resting angle. */
  frameRegions(patches: readonly Patch[]): View {
    if (patches.length === 0) return settle(REST, this.world);
    const corners: THREE.Vector3[] = [];
    const box = new THREE.Box3();
    for (const p of patches) {
      corners.push(...patchCorners(p.centre, p.radius, p.height));
      box.expandByPoint(p.centre);
    }
    const target = box.getCenter(new THREE.Vector3());
    return this.viewOf(fit({ corners, target, up: UP }, 0.9, 0.86, this.lens));
  }

  /** A view that holds one rect of ground in frame, biased towards a point on it. */
  frameCorners(framing: Framing, floor = 0): View {
    const framed = fit(framing, 0.82, 0.82, this.lens);
    if (framing.bias) framed.target.lerp(framing.bias, 0.2);
    const view = this.viewOf(framed);
    return settle({ ...view, zoom: Math.max(view.zoom, floor) }, this.world);
  }

  private viewOf(framed: { target: THREE.Vector3; distance: number }): View {
    return settle(
      {
        focus: { x: framed.target.x, z: framed.target.z },
        bearing: YAW,
        pitch: ELEVATION,
        zoom: zoomOf(framed.distance),
      },
      this.world,
    );
  }
}
