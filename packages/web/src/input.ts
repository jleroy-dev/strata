import type { Intent } from '@strata/core';

export interface Pointer {
  x: number;
  y: number;
  moved: boolean;
}

/** Turns DOM events into intents; picking is asked of the scene once per frame. */
export function bindInput(
  dom: HTMLElement,
  dispatch: (intent: Intent) => void,
  pick: (x: number, y: number) => { block?: string; agent?: string },
): { pointer: () => Pointer | undefined; settle: () => void } {
  let pointer: Pointer | undefined;
  let down: [number, number] | undefined;
  let dragging = false;

  dom.addEventListener('mousemove', (e) => {
    pointer = { x: e.offsetX, y: e.offsetY, moved: true };
    if (down && !dragging && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) {
      dragging = true;
      dispatch({ kind: 'touch-camera' });
    }
  });
  dom.addEventListener('wheel', () => {
    dispatch({ kind: 'touch-camera' });
  });
  dom.addEventListener('mouseleave', () => {
    pointer = undefined;
    dispatch({ kind: 'hover' });
  });
  dom.addEventListener('mousedown', (e) => {
    down = [e.clientX, e.clientY];
    dragging = false;
  });
  dom.addEventListener('mouseup', (e) => {
    const start = down;
    down = undefined;
    if (!start || dragging) return;
    const hit = pick(e.offsetX, e.offsetY);
    if (hit.agent !== undefined) dispatch({ kind: 'click-beacon', agentId: hit.agent });
    else
      dispatch(
        hit.block === undefined ? { kind: 'click-block' } : { kind: 'click-block', id: hit.block },
      );
  });
  window.addEventListener('keydown', (e) => {
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
  };
}
