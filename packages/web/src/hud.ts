import type { Agent, Ui } from '@strata/core';
import { panel } from './dom.js';

const mode = panel('hud');
const label = panel('label');
label.style.display = 'none';

/** How long Free may sit untouched before the way back is made loud. */
export const ADRIFT_MS = 45_000;

const HINTS: Record<Ui['mode'], string> = {
  overview: 'C cycles · Home returns',
  follow: 'click a beacon to switch · Home returns',
  free: 'Home returns to Overview',
  drone: 'WASD flies · E and Q climb · Esc returns to Overview',
};

export function drawHud(
  ui: Ui,
  rows: readonly Agent[],
  following: Agent | undefined,
  stranded = false,
  adrift = false,
): void {
  const name =
    ui.mode === 'overview'
      ? 'Overview'
      : ui.mode === 'drone'
        ? 'Drone'
        : ui.mode === 'free'
          ? 'Free'
          : `Follow · ${ui.follow === undefined ? `auto${following ? ` (${following.label})` : ''}` : (following?.label ?? ui.follow.slice(0, 8))}`;
  void rows;
  mode.replaceChildren();
  const b = document.createElement('b');
  b.textContent = name;
  if (adrift) {
    const back = document.createElement('b');
    back.className = 'away';
    back.textContent = 'Home';
    mode.append('camera ', b, ' · ', back, ' returns to Overview');
    return;
  }
  mode.append('camera ', b, ` · ${HINTS[ui.mode]}`);
  if (!stranded) return;
  const away = document.createElement('b');
  away.className = 'away';
  away.textContent = 'activity is off frame';
  mode.append(' · ', away, ' · Home reframes');
}

export function drawLabel(id: string | undefined, x: number, y: number): void {
  if (id === undefined) {
    label.style.display = 'none';
    return;
  }
  label.style.display = 'block';
  label.style.left = `${String(x)}px`;
  label.style.top = `${String(y)}px`;
  label.textContent = id.slice(id.lastIndexOf('/') + 1);
}
