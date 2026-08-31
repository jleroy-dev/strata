import type { RosterState } from '@strata/core';
import { panel } from './dom.js';

export type Forced = RosterState | undefined;

interface DevState {
  seed: number;
  scratch: string | null;
  signal: string[];
  mutating: string[];
}

const NO_SCRATCH = 'file actions need a scratch repo; the watched repo is never written to';
export const RETRY_MS = 2000;
export const POLL_MS = 10_000;

/**
 * How long before asking again, or nothing at all: a server started without `--dev` answers 403
 * for as long as it runs, so asking it twice a second only fills the console.
 */
export function pollAfter(status: number): number | undefined {
  if (status === 403) return undefined;
  return status >= 200 && status < 300 ? POLL_MS : RETRY_MS;
}

/** Debug actions against a server started with --dev; shown only with ?dev in the URL. */
export function mountSim(onForce: (state: Forced) => void): void {
  if (!new URLSearchParams(window.location.search).has('dev')) return;
  const bar = panel('sim');
  const port = new URLSearchParams(window.location.search).get('server') ?? '4747';
  const dev = `http://127.0.0.1:${port}/dev`;
  const notice = document.createElement('span');
  notice.className = 'notice';
  const actions = document.createElement('span');
  actions.className = 'actions';

  const reasonOf = async (response: Response): Promise<string> => {
    const body = (await response.json().catch(() => ({}))) as { reason?: string };
    return body.reason ?? '';
  };

  const post = (action: string, mutating: boolean): void => {
    void fetch(`${dev}/${action}`, { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) {
          notice.textContent = await reasonOf(response);
          return;
        }
        const done = (await response.json()) as { paths?: string[] };
        notice.textContent =
          mutating && (done.paths?.length ?? 0) === 0 ? `${action}: nothing to move` : '';
      })
      .catch(() => {
        notice.textContent = `no server on :${port}`;
        resolve();
      });
  };

  const button = (action: string, enabled: boolean, mutating = false): HTMLAnchorElement => {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = action.replace('-', ' ');
    if (!enabled) {
      a.className = 'off';
      a.title = NO_SCRATCH;
    }
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (enabled) post(action, mutating);
      else notice.textContent = NO_SCRATCH;
    });
    return a;
  };

  let shown = '';
  const render = (state: DevState): void => {
    const next = JSON.stringify(state);
    if (next === shown) return;
    shown = next;
    actions.replaceChildren();
    for (const action of state.mutating) {
      actions.append(button(action, state.scratch !== null, true));
    }
    for (const action of state.signal) actions.append(button(action, true));
    notice.textContent = state.scratch === null ? NO_SCRATCH : '';
  };

  let refused = false;
  const resolve = (): void => {
    void fetch(`${dev}/state`)
      .then(async (response) => {
        const again = pollAfter(response.status);
        refused = again === undefined;
        if (response.ok) render((await response.json()) as DevState);
        else {
          shown = '';
          actions.replaceChildren();
          notice.textContent = await reasonOf(response);
        }
        if (again !== undefined) setTimeout(resolve, again);
      })
      .catch(() => {
        shown = '';
        actions.replaceChildren();
        notice.textContent = `no server on :${port}`;
        refused = false;
        setTimeout(resolve, RETRY_MS);
      });
  };
  resolve();
  window.addEventListener('focus', () => {
    if (refused) resolve();
  });

  const select = document.createElement('select');
  for (const [value, text] of [
    ['', 'live'],
    ['quiet', 'quiet'],
    ['deaf', 'deaf'],
    ['unheard', 'unheard'],
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
  bar.append(actions, select, notice);
}
