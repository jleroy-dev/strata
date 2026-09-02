import { describe, expect, it } from 'vitest';
import { REPO, at } from './fixtures/ids.js';
import { pathOf, type BlockId } from './qualified.js';
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

const known = (id: BlockId): boolean => pathOf(id).startsWith('src/');

describe('eventOf', () => {
  it('maps the signal kinds to facts', () => {
    expect(eventOf({ repo: REPO, session: 's1', at: 0, kind: 'start' }, known)).toEqual({
      kind: 'agent.arrived',
      repo: REPO,
      agentId: 's1',
    });
    expect(eventOf({ repo: REPO, session: 's1', at: 0, kind: 'turn-end' }, known)).toEqual({
      kind: 'agent.waiting',
      repo: REPO,
      agentId: 's1',
    });
    expect(eventOf({ repo: REPO, session: 's1', at: 0, kind: 'end' }, known)).toEqual({
      kind: 'agent.left',
      repo: REPO,
      agentId: 's1',
    });
    expect(
      eventOf({ repo: REPO, session: 's1', at: 0, kind: 'tool', tool: 'shell' }, known),
    ).toEqual({
      kind: 'agent.running',
      repo: REPO,
      agentId: 's1',
    });
  });

  it('reports a tool it has no name for as work with no place', () => {
    expect(
      eventOf({ repo: REPO, session: 's1', at: 0, kind: 'tool', tool: 'other' }, known),
    ).toEqual({
      kind: 'agent.running',
      repo: REPO,
      agentId: 's1',
    });
  });

  it('folds a prompt and the end of a tool into the same unfocused state', () => {
    for (const kind of ['prompt', 'tool-end'] as const) {
      expect(eventOf({ repo: REPO, session: 's1', at: 0, kind }, known)).toEqual({
        kind: 'agent.thinking',
        repo: REPO,
        agentId: 's1',
      });
    }
    expect(eventOf({ repo: REPO, session: 's1', at: 0, kind: 'blocked' }, known)).toEqual({
      kind: 'agent.blocked',
      repo: REPO,
      agentId: 's1',
    });
  });

  it('lights a known block and keeps the verb for an unknown path', () => {
    expect(
      eventOf(
        { repo: REPO, session: 's1', at: 0, kind: 'tool', tool: 'read', path: at('src/a.ts') },
        known,
      ),
    ).toEqual({
      kind: 'agent.reading',
      repo: REPO,
      agentId: 's1',
      id: at('src/a.ts'),
    });
    expect(
      eventOf(
        {
          repo: REPO,
          session: 's1',
          at: 0,
          kind: 'tool',
          tool: 'edit',
          path: at('node_modules/x.js'),
        },
        known,
      ),
    ).toEqual({
      kind: 'agent.editing',
      repo: REPO,
      agentId: 's1',
    });
  });
});

describe('foldWeather and verbOf', () => {
  const t0 = 1_000_000;
  let sessions: Sessions = new Map();
  sessions = foldWeather(sessions, { kind: 'agent.arrived', repo: REPO, agentId: 'a' }, t0);
  sessions = foldWeather(sessions, { kind: 'agent.arrived', repo: REPO, agentId: 'b' }, t0 + 10);
  sessions = foldWeather(
    sessions,
    { kind: 'agent.editing', repo: REPO, agentId: 'a', id: at('src/a.ts') },
    t0 + 100,
  );

  it('keeps arrival order and the last block', () => {
    expect(sessions.get('a')).toMatchObject({ order: 0, verb: 'editing', block: at('src/a.ts') });
    expect(sessions.get('b')).toMatchObject({ order: 1, verb: 'waiting' });
  });

  it('ignores a second arrival of a live session and a departure of an unknown one', () => {
    expect(
      foldWeather(sessions, { kind: 'agent.arrived', repo: REPO, agentId: 'a' }, t0 + 200),
    ).toBe(sessions);
    expect(foldWeather(sessions, { kind: 'agent.left', repo: REPO, agentId: 'zz' }, t0 + 200)).toBe(
      sessions,
    );
  });

  it('treats the first fact from an unknown session as its arrival', () => {
    const late = foldWeather(
      sessions,
      { kind: 'agent.running', repo: REPO, agentId: 'zz' },
      t0 + 200,
    );
    expect(late.get('zz')).toMatchObject({ order: 2, verb: 'running', arrivedAt: t0 + 200 });
  });

  it('marks a session inferred unless a start announced it', () => {
    expect(sessions.get('a')).toMatchObject({ origin: 'announced' });
    for (const event of [
      { kind: 'agent.running' as const, repo: REPO, agentId: 'p' },
      { kind: 'agent.reading' as const, repo: REPO, agentId: 'q', id: at('src/a.ts') },
      { kind: 'agent.waiting' as const, repo: REPO, agentId: 'r' },
    ]) {
      const seen = foldWeather(sessions, event, t0 + 200);
      expect(seen.get(event.agentId)).toMatchObject({ origin: 'inferred' });
    }
  });

  it('never reports a verb an inferred session did not report', () => {
    const running = foldWeather(new Map(), { kind: 'agent.running', repo: REPO, agentId: 'p' }, t0);
    expect(running.get('p')!.verb).toBe('running');
    const reading = foldWeather(
      new Map(),
      { kind: 'agent.reading', repo: REPO, agentId: 'q', id: at('src/a.ts') },
      t0,
    );
    expect(reading.get('q')!.verb).toBe('reading');
  });

  it('derives idle after 20 s for reading and editing only', () => {
    const a = sessions.get('a')!;
    const b = sessions.get('b')!;
    expect(verbOf(a, t0 + 100 + IDLE_MS - 1)).toBe('editing');
    expect(verbOf(a, t0 + 100 + IDLE_MS)).toBe('idle');
    expect(verbOf(b, t0 + 10 + IDLE_MS)).toBe('waiting');
  });

  it('stands a command on the block it names and stays put for one that names none', () => {
    expect(
      eventOf(
        { repo: REPO, session: 's1', at: 0, kind: 'tool', tool: 'shell', path: at('src/a.ts') },
        known,
      ),
    ).toEqual({ kind: 'agent.running', repo: REPO, agentId: 's1', id: at('src/a.ts') });
    let s: Sessions = new Map();
    s = foldWeather(s, { kind: 'agent.editing', repo: REPO, agentId: 'r', id: at('src/a.ts') }, t0);
    s = foldWeather(
      s,
      { kind: 'agent.running', repo: REPO, agentId: 'r', id: at('src/b.ts') },
      t0 + 10,
    );
    expect(s.get('r')).toMatchObject({ verb: 'running', block: at('src/b.ts') });
    s = foldWeather(s, { kind: 'agent.running', repo: REPO, agentId: 'r' }, t0 + 20);
    expect(s.get('r')).toMatchObject({ verb: 'running', block: at('src/b.ts') });
  });

  it('ends running on a tool-end and keeps the block it was last on', () => {
    let s: Sessions = new Map();
    s = foldWeather(s, { kind: 'agent.editing', repo: REPO, agentId: 'r', id: at('src/a.ts') }, t0);
    s = foldWeather(s, { kind: 'agent.running', repo: REPO, agentId: 'r' }, t0 + 10);
    expect(s.get('r')).toMatchObject({ verb: 'running', block: at('src/a.ts') });
    s = foldWeather(s, { kind: 'agent.thinking', repo: REPO, agentId: 'r' }, t0 + 20);
    expect(s.get('r')).toMatchObject({ verb: 'thinking', block: at('src/a.ts') });
  });

  it('never lets a long tool or a blocked agent decay into idle', () => {
    let s: Sessions = new Map();
    s = foldWeather(s, { kind: 'agent.running', repo: REPO, agentId: 'b' }, t0);
    s = foldWeather(s, { kind: 'agent.blocked', repo: REPO, agentId: 'c' }, t0);
    s = foldWeather(s, { kind: 'agent.thinking', repo: REPO, agentId: 'd' }, t0);
    expect(verbOf(s.get('b')!, t0 + IDLE_MS * 30)).toBe('running');
    expect(verbOf(s.get('c')!, t0 + IDLE_MS * 30)).toBe('blocked');
    expect(verbOf(s.get('d')!, t0 + IDLE_MS * 30)).toBe('thinking');
  });

  it("tells blocked apart from waiting, because only one of them is the user's move", () => {
    let s: Sessions = new Map();
    s = foldWeather(s, { kind: 'agent.blocked', repo: REPO, agentId: 'x' }, t0);
    expect(verbOf(s.get('x')!, t0)).toBe('blocked');
    s = foldWeather(s, { kind: 'agent.waiting', repo: REPO, agentId: 'x' }, t0 + 10);
    expect(verbOf(s.get('x')!, t0 + 10)).toBe('waiting');
  });

  it('drops a row after a long silence', () => {
    expect(verbOf(sessions.get('b')!, t0 + 10 + GONE_MS)).toBeUndefined();
  });

  it('reads done for a moment after leaving, then drops', () => {
    const left = foldWeather(sessions, { kind: 'agent.left', repo: REPO, agentId: 'a' }, t0 + 500);
    expect(verbOf(left.get('a')!, t0 + 500)).toBe('done');
    expect(verbOf(left.get('a')!, t0 + 500 + DONE_MS)).toBeUndefined();
    const back = foldWeather(left, { kind: 'agent.arrived', repo: REPO, agentId: 'a' }, t0 + 900);
    expect(back.get('a')).toMatchObject({ order: 0, verb: 'waiting', arrivedAt: t0 + 900 });
  });

  it('builds the roster with labels and distinct hues', () => {
    const rows = roster(sessions, t0 + 200);
    expect(rows.map((r) => r.label)).toEqual(['claude-a', 'claude-b']);
    expect(rows[0]!.hue).not.toBe(rows[1]!.hue);
    expect(rows[0]).toMatchObject({ verb: 'editing', block: at('src/a.ts') });
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
