import { describe, expect, it } from 'vitest';
import { TRACE_MS } from './memory.js';
import type { HookState } from './events.js';
import { repoId } from './qualified.js';
import { INITIAL_UI, hookStateOf, reduce, rosterStateOf, type Ui } from './ui.js';
import { at } from './fixtures/ids.js';

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
    const selected: Ui = { mode: 'follow', follow: 'a', selected: at('x.ts') };
    expect(reduce(selected, { kind: 'touch-camera' })).toEqual({
      mode: 'free',
      selected: at('x.ts'),
    });
  });

  it('frames the selection with F only when there is one', () => {
    expect(reduce(INITIAL_UI, { kind: 'key', key: 'F' })).toBe(INITIAL_UI);
    expect(
      reduce({ mode: 'follow', follow: 'a', selected: at('x.ts') }, { kind: 'key', key: 'F' }),
    ).toEqual({
      mode: 'free',
      selected: at('x.ts'),
    });
  });

  it('clears the selection with Escape and keeps the mode', () => {
    expect(
      reduce(
        { mode: 'free', selected: at('x.ts'), hover: at('y.ts') },
        { kind: 'key', key: 'Escape' },
      ),
    ).toEqual({
      mode: 'free',
      hover: at('y.ts'),
    });
  });

  it('scrubs to a time and Escape clears the scrub before the selection', () => {
    let ui: Ui = reduce({ mode: 'free', selected: at('x.ts') }, { kind: 'scrub', at: 1000 });
    expect(ui).toEqual({ mode: 'free', selected: at('x.ts'), scrub: 1000 });
    ui = reduce(ui, { kind: 'key', key: 'Escape' });
    expect(ui).toEqual({ mode: 'free', selected: at('x.ts') });
    expect(reduce(ui, { kind: 'key', key: 'Escape' })).toEqual({ mode: 'free' });
    expect(reduce({ mode: 'free', scrub: 5 }, { kind: 'scrub' })).toEqual({ mode: 'free' });
  });

  it('tracks hover, selection and isolation', () => {
    let ui = reduce(INITIAL_UI, { kind: 'hover', id: at('x.ts') });
    ui = reduce(ui, { kind: 'click-block', id: at('x.ts') });
    ui = reduce(ui, { kind: 'roster-hover', agentId: 'a' });
    expect(ui).toEqual({ mode: 'overview', hover: at('x.ts'), selected: at('x.ts'), isolate: 'a' });
    ui = reduce(ui, { kind: 'roster-hover' });
    ui = reduce(ui, { kind: 'click-block' });
    ui = reduce(ui, { kind: 'hover' });
    expect(ui).toEqual({ mode: 'overview' });
  });

  it('falls back to auto-follow when the followed agent leaves and forgets a removed block', () => {
    const ui: Ui = {
      mode: 'follow',
      follow: 'a',
      isolate: 'a',
      selected: at('x.ts'),
      hover: at('x.ts'),
    };
    expect(reduce(ui, { kind: 'agent-gone', agentId: 'a' })).toEqual({
      mode: 'follow',
      selected: at('x.ts'),
      hover: at('x.ts'),
    });
    expect(reduce(ui, { kind: 'block-gone', id: at('x.ts') })).toEqual({
      mode: 'follow',
      follow: 'a',
      isolate: 'a',
    });
    expect(reduce(ui, { kind: 'agent-gone', agentId: 'zz' })).toBe(ui);
  });
});

describe('hookStateOf', () => {
  const of = (...states: HookState[]): HookState | undefined =>
    hookStateOf(new Map(states.map((state, i) => [repoId(`r${String(i)}`), state])));

  it('has nothing to say before any repo has reported', () => {
    expect(hookStateOf(new Map())).toBeUndefined();
  });

  it('lets drift outrank a repo that is posting', () => {
    expect(of('heard', 'installed-stale')).toBe('installed-stale');
    expect(of('heard', 'installed-unheard', 'no-hook')).toBe('heard');
    expect(of('installed-unheard', 'no-hook')).toBe('installed-unheard');
    expect(of('no-hook', 'no-hook')).toBe('no-hook');
  });
});

describe('rosterStateOf', () => {
  const base = { connected: true, everConnected: true, agents: 0, now: 10 * TRACE_MS };

  it('reports the connection before anything else', () => {
    expect(rosterStateOf({ ...base, connected: false, everConnected: false })).toBe('connecting');
    expect(rosterStateOf({ ...base, connected: false })).toBe('disconnected');
    expect(rosterStateOf({ ...base, connected: false, agents: 3, hook: 'heard' })).toBe(
      'disconnected',
    );
  });

  it('gives each hook state its own row while no agent is on screen', () => {
    expect(rosterStateOf({ ...base, hook: 'no-hook' })).toBe('deaf');
    expect(rosterStateOf({ ...base, hook: 'installed-stale' })).toBe('stale');
    expect(rosterStateOf({ ...base, hook: 'installed-unheard' })).toBe('unheard');
    expect(rosterStateOf({ ...base, hook: 'heard' })).toBe('quiet');
  });

  it('says the hooks are out of date even while an agent is on screen', () => {
    expect(rosterStateOf({ ...base, agents: 2, hook: 'installed-stale' })).toBe('stale');
    expect(rosterStateOf({ ...base, agents: 2, connected: false, hook: 'installed-stale' })).toBe(
      'disconnected',
    );
  });

  it('never claims there is no agent when there is one', () => {
    for (const hook of ['no-hook', 'installed-unheard', 'heard'] as const) {
      expect(rosterStateOf({ ...base, agents: 1, hook })).toBe('live');
    }
  });

  it('separates a repo with no hook from a server that has heard nothing yet', () => {
    expect(rosterStateOf({ ...base, hook: 'no-hook' })).not.toBe(
      rosterStateOf({ ...base, hook: 'installed-unheard' }),
    );
  });

  it('reads cold past the trace hour and quiet inside it', () => {
    const heard = { ...base, hook: 'heard' as const };
    expect(rosterStateOf({ ...heard, lastAgentAt: heard.now - TRACE_MS - 1 })).toBe('cold');
    expect(rosterStateOf({ ...heard, lastAgentAt: heard.now - TRACE_MS + 1 })).toBe('quiet');
    expect(rosterStateOf(heard)).toBe('quiet');
  });
});
