import {
  labelOf,
  pathOf,
  type BlockId,
  type Mount,
  type Placement,
  type Sessions,
  type Touch,
} from '@strata/core';
import { ago, panel } from './dom.js';
import { fileOf, openInEditor } from './host.js';

const card = panel('caption');
card.style.display = 'none';

export function drawCaption(
  id: BlockId | undefined,
  placement: Placement | undefined,
  touches: readonly Touch[] | undefined,
  sessions: Sessions,
  hueOf: (agentId: string) => number | undefined,
  mounts: readonly Mount[],
  now: number,
): void {
  if (id === undefined) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  card.replaceChildren();
  const file = fileOf(mounts, id);
  const link = document.createElement('a');
  if (file !== undefined) {
    link.href = `vscode://file${file}`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openInEditor(file);
    });
  }
  link.textContent = pathOf(id);
  card.append(link);
  const meta = document.createElement('div');
  meta.className = 'm';
  meta.textContent = placement
    ? `${(placement.size / 1024).toFixed(1)} kB${placement.binary ? ' · binary' : ''}`
    : 'removed';
  card.append(meta);
  const last = (touches ?? []).slice(-3).reverse();
  if (last.length > 0) {
    const list = document.createElement('div');
    list.className = 'm';
    for (const t of last) {
      const line = document.createElement('div');
      const swatch = document.createElement('span');
      swatch.textContent = '● ';
      const hue = hueOf(t.agentId);
      swatch.style.color = hue === undefined ? '#6a7182' : `hsl(${String(hue)} 80% 65%)`;
      const order = sessions.get(t.agentId)?.order;
      line.append(
        swatch,
        `${order === undefined ? t.agentId.slice(0, 8) : labelOf(order)} ${t.verb} ${ago(now - t.at)} ago`,
      );
      list.append(line);
    }
    card.append(list);
  }
}
