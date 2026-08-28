import { describe, expect, it } from 'vitest';
import { WEATHER_HUES, hueFor } from './hue.js';
import {
  DONE_MS,
  GONE_MS,
  IDLE_MS,
  eventOf,
  foldWeather,
  labelOf,
  roster,
  verbOf,
  type Sessions,
} from './weather.js';

const known = (path: string): boolean => path.startsWith('src/');

describe('eventOf', () => {
  it('maps the signal kinds to facts', () => {
    expect(eventOf({ session: 's1', at: 0, kind: 'start' }, known)).toEqual({
      kind: 'agent.arrived',
      agentId: 's1',
    });
    expect(eventOf({ session: 's1', at: 0, kind: 'turn-end' }, known)).toEqual({
      kind: 'agent.waiting',
      agentId: 's1',
    });
    expect(eventOf({ session: 's1', at: 0, kind: 'end' }, known)).toEqual({
      kind: 'agent.left',
      agentId: 's1',
    });
    expect(eventOf({ session: 's1', at: 0, kind: 'tool', tool: 'shell' }, known)).toEqual({
      kind: 'agent.running',
      agentId: 's1',
    });
  });

  it('lights a known block and keeps the verb for an unknown path', () => {
    expect(
      eventOf({ session: 's1', at: 0, kind: 'tool', tool: 'read', path: 'src/a.ts' }, known),
    ).toEqual({
      kind: 'agent.reading',
      agentId: 's1',
      id: 'src/a.ts',
    });
    expect(
      eventOf(
        { session: 's1', at: 0, kind: 'tool', tool: 'edit', path: 'node_modules/x.js' },
        known,
      ),
    ).toEqual({
      kind: 'agent.editing',
      agentId: 's1',
    });
  });

  it('ignores tools the panel has no word for', () => {
    expect(eventOf({ session: 's1', at: 0, kind: 'tool', tool: 'other' }, known)).toBeUndefined();
  });
});

describe('foldWeather and verbOf', () => {
  const t0 = 1_000_000;
  let sessions: Sessions = new Map();
  sessions = foldWeather(sessions, { kind: 'agent.arrived', agentId: 'a' }, t0);
  sessions = foldWeather(sessions, { kind: 'agent.arrived', agentId: 'b' }, t0 + 10);
  sessions = foldWeather(
    sessions,
    { kind: 'agent.editing', agentId: 'a', id: 'src/a.ts' },
    t0 + 100,
  );

  it('keeps arrival order and the last block', () => {
    expect(sessions.get('a')).toMatchObject({ order: 0, verb: 'editing', block: 'src/a.ts' });
    expect(sessions.get('b')).toMatchObject({ order: 1, verb: 'waiting' });
  });

  it('ignores a second arrival of a live session and a departure of an unknown one', () => {
    expect(foldWeather(sessions, { kind: 'agent.arrived', agentId: 'a' }, t0 + 200)).toBe(sessions);
    expect(foldWeather(sessions, { kind: 'agent.left', agentId: 'zz' }, t0 + 200)).toBe(sessions);
  });

  it('treats the first fact from an unknown session as its arrival', () => {
    const late = foldWeather(sessions, { kind: 'agent.running', agentId: 'zz' }, t0 + 200);
    expect(late.get('zz')).toMatchObject({ order: 2, verb: 'running', arrivedAt: t0 + 200 });
  });

  it('derives idle after 20 s for reading and editing only', () => {
    const a = sessions.get('a')!;
    const b = sessions.get('b')!;
    expect(verbOf(a, t0 + 100 + IDLE_MS - 1)).toBe('editing');
    expect(verbOf(a, t0 + 100 + IDLE_MS)).toBe('idle');
    expect(verbOf(b, t0 + 10 + IDLE_MS)).toBe('waiting');
  });

  it('drops a row after a long silence', () => {
    expect(verbOf(sessions.get('b')!, t0 + 10 + GONE_MS)).toBeUndefined();
  });

  it('reads done for a moment after leaving, then drops', () => {
    const left = foldWeather(sessions, { kind: 'agent.left', agentId: 'a' }, t0 + 500);
    expect(verbOf(left.get('a')!, t0 + 500)).toBe('done');
    expect(verbOf(left.get('a')!, t0 + 500 + DONE_MS)).toBeUndefined();
    const back = foldWeather(left, { kind: 'agent.arrived', agentId: 'a' }, t0 + 900);
    expect(back.get('a')).toMatchObject({ order: 0, verb: 'waiting', arrivedAt: t0 + 900 });
  });

  it('builds the roster with labels and distinct hues', () => {
    const rows = roster(sessions, t0 + 200);
    expect(rows.map((r) => r.label)).toEqual(['claude-a', 'claude-b']);
    expect(rows[0]!.hue).not.toBe(rows[1]!.hue);
    expect(rows[0]).toMatchObject({ verb: 'editing', block: 'src/a.ts' });
  });
});

describe('labelOf', () => {
  it('counts a, b, ... z, aa', () => {
    expect([0, 1, 25, 26, 27].map(labelOf)).toEqual([
      'claude-a',
      'claude-b',
      'claude-z',
      'claude-aa',
      'claude-ab',
    ]);
  });
});

describe('hueFor', () => {
  it('is deterministic and avoids taken slots', () => {
    const h = hueFor('session-1', new Set());
    expect(hueFor('session-1', new Set())).toBe(h);
    expect(hueFor('session-1', new Set([h]))).not.toBe(h);
  });

  it('keeps every slot at least 12 degrees from the accent bands', () => {
    const bands = [
      [14, 42],
      [198, 226],
      [81, 109],
    ];
    for (const hue of WEATHER_HUES) {
      for (const [lo, hi] of bands) expect(hue < lo! - 12 || hue > hi! + 12).toBe(true);
    }
  });
});
