import { panel } from './dom.js';
import type { RosterState } from './roster.js';

export type Forced = RosterState | undefined;

const ACTIONS = [
  'rename',
  'move-file',
  'move-folder',
  'add',
  'remove',
  'burst',
  'third',
  'touch',
] as const;

/** Debug actions against a server started with --dev; shown only with ?dev in the URL. */
export function mountSim(onForce: (state: Forced) => void): void {
  if (!new URLSearchParams(window.location.search).has('dev')) return;
  const bar = panel('sim');
  const post = (action: string): void => {
    void fetch(`http://127.0.0.1:4747/dev/${action}`, { method: 'POST' }).catch(() => undefined);
  };
  for (const action of ACTIONS) {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = action.replace('-', ' ');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      post(action);
    });
    bar.append(a);
  }
  const select = document.createElement('select');
  for (const [value, text] of [
    ['', 'live'],
    ['quiet', 'quiet'],
    ['deaf', 'deaf'],
    ['disconnected', 'disconnected'],
    ['cold', 'cold'],
  ]) {
    const option = document.createElement('option');
    option.value = value ?? '';
    option.textContent = text ?? '';
    select.append(option);
  }
  select.addEventListener('change', () => {
    onForce(select.value === '' ? undefined : (select.value as RosterState));
  });
  bar.append(select);
}
