import {
  TRACE_MS,
  labelOf,
  type Agent,
  type Intent,
  type Session,
  type StrataEvent,
} from '@strata/core';
import { ago } from './dom.js';

const HEIGHT = 30;
const LANE = 7;

/** The last hour along the bottom edge: a lane per session, a mark per touch. */
export class Strip {
  private readonly canvas = document.createElement('canvas');
  private readonly label = document.createElement('div');
  private dragging = false;

  constructor(private readonly dispatch: (intent: Intent) => void) {
    this.canvas.className = 'strip';
    this.canvas.height = HEIGHT;
    this.label.className = 'panel strip-label';
    const back = document.createElement('div');
    back.className = 'panel strip-back';
    document.body.append(back, this.canvas, this.label);
    const scrubAt = (clientX: number): void => {
      const { left, width } = this.canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(width, clientX - left));
      if (x >= width - 2) this.dispatch({ kind: 'scrub' });
      else this.dispatch({ kind: 'scrub', at: Date.now() - (1 - x / width) * TRACE_MS });
    };
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      scrubAt(e.clientX);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) scrubAt(e.clientX);
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
  }

  draw(
    log: readonly StrataEvent[],
    sessions: ReadonlyMap<string, Session>,
    hues: readonly Agent[],
    scrub: number | undefined,
    isolate: string | undefined,
    quiet: string,
    now: number,
    since: number,
  ): void {
    const width = window.innerWidth;
    if (this.canvas.width !== width) this.canvas.width = width;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 6, width, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let m = 0; m <= 6; m++) ctx.fillRect(width - (m * width) / 6, 6, 1, 24);
    const lanes = [...sessions.values()].sort((a, b) => a.order - b.order);
    const hueOf = new Map(hues.map((r) => [r.id, r.hue]));
    for (const event of log) {
      if (event.kind !== 'agent.reading' && event.kind !== 'agent.editing') continue;
      if (now - event.at > TRACE_MS) continue;
      const lane = lanes.findIndex((s) => s.id === event.agentId);
      if (lane < 0) continue;
      const hue = hueOf.get(event.agentId) ?? 220;
      const dim =
        isolate !== undefined && isolate !== event.agentId
          ? 0.2
          : event.kind === 'agent.editing'
            ? 0.95
            : 0.5;
      ctx.fillStyle = `hsla(${String(hue)},85%,62%,${String(dim)})`;
      ctx.fillRect(width - ((now - event.at) / TRACE_MS) * width, 8 + (lane % 3) * LANE, 2, 6);
    }
    if (scrub !== undefined) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(width - ((now - scrub) / TRACE_MS) * width - 1, 2, 2, 28);
    }
    this.label.replaceChildren();
    if (scrub !== undefined) {
      const b = document.createElement('b');
      b.textContent = `${ago(now - scrub)} ago`;
      this.label.append('as of ', b, ' · Esc returns to now');
    } else {
      const covered = now - since;
      this.label.textContent =
        quiet || (covered < TRACE_MS - 60_000 ? `last ${ago(covered)}` : 'last hour');
    }
    void labelOf;
  }
}
