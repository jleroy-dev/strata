import { describe, expect, it } from 'vitest';
import { INITIAL_UI, reduce, type Ui } from './ui.js';

describe('reduce', () => {
  it('cycles C through overview, follow with no agent, free', () => {
    const follow = reduce(INITIAL_UI, { kind: 'key', key: 'C' });
    expect(follow).toEqual({ mode: 'follow' });
    const free = reduce(follow, { kind: 'key', key: 'C' });
    expect(free).toEqual({ mode: 'free' });
    expect(reduce(free, { kind: 'key', key: 'C' })).toEqual({ mode: 'overview' });
  });

  it('follows a clicked beacon or roster row and returns home on Home', () => {
    const following = reduce(INITIAL_UI, { kind: 'click-beacon', agentId: 'a' });
    expect(following).toEqual({ mode: 'follow', follow: 'a' });
    const row = reduce(INITIAL_UI, { kind: 'roster-click', agentId: 'b' });
    expect(row).toEqual({ mode: 'follow', follow: 'b' });
    expect(reduce(row, { kind: 'roster-click', agentId: 'b' })).toEqual({ mode: 'overview' });
    expect(reduce(row, { kind: 'roster-click', agentId: 'c' })).toEqual({
      mode: 'follow',
      follow: 'c',
    });
    expect(reduce(following, { kind: 'key', key: 'Home' })).toEqual({ mode: 'overview' });
  });

  it('enters free when the camera is touched and keeps the selection', () => {
    const selected: Ui = { mode: 'follow', follow: 'a', selected: 'x.ts' };
    expect(reduce(selected, { kind: 'touch-camera' })).toEqual({ mode: 'free', selected: 'x.ts' });
  });

  it('frames the selection with F only when there is one', () => {
    expect(reduce(INITIAL_UI, { kind: 'key', key: 'F' })).toBe(INITIAL_UI);
    expect(
      reduce({ mode: 'follow', follow: 'a', selected: 'x.ts' }, { kind: 'key', key: 'F' }),
    ).toEqual({
      mode: 'free',
      selected: 'x.ts',
    });
  });

  it('clears the selection with Escape and keeps the mode', () => {
    expect(
      reduce({ mode: 'free', selected: 'x.ts', hover: 'y.ts' }, { kind: 'key', key: 'Escape' }),
    ).toEqual({
      mode: 'free',
      hover: 'y.ts',
    });
  });

  it('scrubs to a time and Escape clears the scrub before the selection', () => {
    let ui: Ui = reduce({ mode: 'free', selected: 'x.ts' }, { kind: 'scrub', at: 1000 });
    expect(ui).toEqual({ mode: 'free', selected: 'x.ts', scrub: 1000 });
    ui = reduce(ui, { kind: 'key', key: 'Escape' });
    expect(ui).toEqual({ mode: 'free', selected: 'x.ts' });
    expect(reduce(ui, { kind: 'key', key: 'Escape' })).toEqual({ mode: 'free' });
    expect(reduce({ mode: 'free', scrub: 5 }, { kind: 'scrub' })).toEqual({ mode: 'free' });
  });

  it('tracks hover, selection and isolation', () => {
    let ui = reduce(INITIAL_UI, { kind: 'hover', id: 'x.ts' });
    ui = reduce(ui, { kind: 'click-block', id: 'x.ts' });
    ui = reduce(ui, { kind: 'roster-hover', agentId: 'a' });
    expect(ui).toEqual({ mode: 'overview', hover: 'x.ts', selected: 'x.ts', isolate: 'a' });
    ui = reduce(ui, { kind: 'roster-hover' });
    ui = reduce(ui, { kind: 'click-block' });
    ui = reduce(ui, { kind: 'hover' });
    expect(ui).toEqual({ mode: 'overview' });
  });

  it('falls back to auto-follow when the followed agent leaves and forgets a removed block', () => {
    const ui: Ui = { mode: 'follow', follow: 'a', isolate: 'a', selected: 'x.ts', hover: 'x.ts' };
    expect(reduce(ui, { kind: 'agent-gone', agentId: 'a' })).toEqual({
      mode: 'follow',
      selected: 'x.ts',
      hover: 'x.ts',
    });
    expect(reduce(ui, { kind: 'block-gone', id: 'x.ts' })).toEqual({
      mode: 'follow',
      follow: 'a',
      isolate: 'a',
    });
    expect(reduce(ui, { kind: 'agent-gone', agentId: 'zz' })).toBe(ui);
  });
});
