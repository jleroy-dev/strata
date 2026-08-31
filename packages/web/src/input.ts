import type { BlockId, Intent } from '@strata/core';

/**
 * Wheel deltas arrive in pixels, lines or pages depending on the device, and a trackpad pinch
 * arrives as a wheel with the control key held.
 */
function notchesOf(event: WheelEvent): number {
  const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
  const pinch = event.ctrlKey ? 3 : 1;
  const pixels = event.deltaY * lines * pinch;
  return Math.max(-6, Math.min(6, pixels / 100));
}

/** How much of the drag's tail counts as the speed it was let go at. */
const WINDOW_MS = 60;
/** A hand that has been still this long is not throwing anything. */
const IDLE_MS = 90;

/**
 * The speed a drag was going when it ended, over the last of its movement rather than over the
 * last few events, so a fast gesture is not under-read just because its events came close together.
 */
function speedOf(trail: readonly [number, number, number][]): [number, number] {
  const first = trail[0];
  const last = trail[trail.length - 1];
  if (!first || !last || trail.length < 2) return [0, 0];
  const elapsed = Math.max(8, last[2] - first[2]);
  let dx = 0;
  let dy = 0;
  for (const [x, y] of trail.slice(1)) {
    dx += x;
    dy += y;
  }
  return [(dx / elapsed) * 1000, (dy / elapsed) * 1000];
}

export interface Pointer {
  x: number;
  y: number;
  moved: boolean;
}

/** Turns DOM events into intents; picking is asked of the scene once per frame. */
export function bindInput(
  dom: HTMLElement,
  dispatch: (intent: Intent) => void,
  pick: (x: number, y: number) => { block?: BlockId; agent?: string },
  gestures: {
    drag: (dx: number, dy: number, panning: boolean) => void;
    flick: (vx: number, vy: number, panning: boolean) => void;
    wheel: (notches: number, ndc: { x: number; y: number }) => void;
  },
  onPan?: (panning: boolean) => void,
): {
  pointer: () => Pointer | undefined;
  settle: () => void;
  setHover: (over: boolean) => void;
} {
  let pointer: Pointer | undefined;
  let down: [number, number] | undefined;
  let dragging = false;
  let panKey = false;
  let over = false;
  let last: [number, number, number] | undefined;
  let button = 0;
  let carried = false;
  let trail: [number, number, number][] = [];

  const cursor = (): void => {
    dom.style.cursor = dragging
      ? panKey
        ? 'grabbing'
        : 'move'
      : panKey
        ? 'grab'
        : over
          ? 'pointer'
          : 'default';
  };

  dom.addEventListener('mousemove', (e) => {
    pointer = { x: e.offsetX, y: e.offsetY, moved: true };
    if (down && !dragging && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) {
      dragging = true;
      dispatch({ kind: 'touch-camera' });
      cursor();
    }
    if (!dragging || !last) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    trail.push([dx, dy, e.timeStamp]);
    for (let head = trail[0]; head && trail.length > 1 && e.timeStamp - head[2] > WINDOW_MS;) {
      trail.shift();
      head = trail[0];
    }
    last = [e.clientX, e.clientY, e.timeStamp];
    carried = panKey || button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey;
    gestures.drag(dx, dy, carried);
  });
  dom.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      dispatch({ kind: 'touch-camera' });
      const rect = dom.getBoundingClientRect();
      gestures.wheel(notchesOf(e), {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      });
    },
    { passive: false },
  );
  dom.addEventListener('mouseleave', () => {
    pointer = undefined;
    over = false;
    cursor();
    dispatch({ kind: 'hover' });
  });
  dom.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  dom.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  dom.addEventListener('mousedown', (e) => {
    down = [e.clientX, e.clientY];
    last = [e.clientX, e.clientY, e.timeStamp];
    button = e.button;
    trail = [];
    dragging = false;
    if (e.button === 1) dispatch({ kind: 'touch-camera' });
    cursor();
  });
  const release = (at: number): void => {
    const stale = last === undefined || at - last[2] > IDLE_MS;
    if (dragging && !stale) {
      const speed = speedOf(trail);
      gestures.flick(speed[0], speed[1], carried);
    }
    trail = [];
    down = undefined;
    last = undefined;
    dragging = false;
    cursor();
  };
  window.addEventListener('mouseup', (e) => {
    release(e.timeStamp);
  });
  dom.addEventListener('mouseup', (e) => {
    const start = down;
    const wasDragging = dragging;
    release(e.timeStamp);
    if (!start || wasDragging || e.button !== 0) return;
    const hit = pick(e.offsetX, e.offsetY);
    if (hit.agent !== undefined) dispatch({ kind: 'click-beacon', agentId: hit.agent });
    else
      dispatch(
        hit.block === undefined ? { kind: 'click-block' } : { kind: 'click-block', id: hit.block },
      );
  });
  const setPan = (on: boolean): void => {
    if (panKey === on) return;
    panKey = on;
    onPan?.(on);
    cursor();
  };
  window.addEventListener('blur', () => {
    setPan(false);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') setPan(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      setPan(true);
      return;
    }
    const key =
      e.key === 'c' || e.key === 'C'
        ? 'C'
        : e.key === 'f' || e.key === 'F'
          ? 'F'
          : e.key === 'Home'
            ? 'Home'
            : e.key === 'Escape'
              ? 'Escape'
              : undefined;
    if (key === undefined) return;
    dispatch({ kind: 'key', key });
  });

  return {
    pointer: () => pointer,
    settle: () => {
      if (pointer) pointer.moved = false;
    },
    setHover: (on: boolean) => {
      if (over === on) return;
      over = on;
      cursor();
    },
  };
}
