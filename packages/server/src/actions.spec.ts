import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { eventOf, foldWeather, repoId, repoPath, roster, type Sessions } from '@strata/core';
import {
  random,
  ScratchActions,
  Signals,
  SCRATCH_ACTIONS,
  type ScratchAction,
  type SignalAction,
} from './actions.js';
import { FIXTURE } from './fixture.js';
import { MARKER, seedScratch } from './scratch.js';

const SEED: [string, number][] = [
  ['packages/core/a.ts', 900],
  ['packages/core/b.ts', 900],
  ['packages/core/c.ts', 900],
  ['packages/web/x.ts', 900],
  ['packages/web/y.ts', 900],
  ['packages/web/use-it.ts', 900],
  ['docs/notes.md', 900],
];
const REPO = repoId('probe');
const GIT_MS = 30_000;

const made: string[] = [];

/** Walks the tree without descending into `.git`, which dwarfs a seeded fixture. */
function walk(root: string, rel: string): ReturnType<typeof repoPath>[] {
  const out: ReturnType<typeof repoPath>[] = [];
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(root, path));
    else out.push(repoPath(path));
  }
  return out;
}

afterAll(() => {
  for (const base of made) rmSync(base, { recursive: true, force: true });
});

function scratchAt(seed = 7, files: [string, number][] = SEED): ScratchActions {
  const base = mkdtempSync(join(tmpdir(), 'strata-actions-'));
  made.push(base);
  const root = join(base, 'repo');
  const scratch = seedScratch(root, files);
  const listed = (): ReturnType<typeof repoPath>[] => walk(root, '').filter((p) => p !== MARKER);
  return new ScratchActions(scratch, REPO, listed, random(seed));
}

function drive(actions: SignalAction[]): string[] {
  let sessions: Sessions = new Map();
  let at = 1_000_000;
  const runner = new Signals(
    REPO,
    () => SEED.map(([path]) => repoPath(path)),
    (signal) => {
      const event = eventOf({ ...signal, at }, () => true);
      if (event) sessions = foldWeather(sessions, event, at);
    },
    random(7),
  );
  for (const action of actions) {
    at += 10;
    runner.run(action);
  }
  return roster(sessions, at).map((row) => row.verb);
}

describe('signal actions', () => {
  it('drives the third agent into the states no fixture can reach', () => {
    expect(drive(['third', 'block'])).toEqual(['blocked']);
    expect(drive(['third', 'think'])).toEqual(['thinking']);
    expect(drive(['third', 'block', 'think'])).toEqual(['thinking']);
  });

  it('reaches blocked even for a session it never saw start', () => {
    expect(drive(['block'])).toEqual(['blocked']);
  });
});

describe('the shipped fixture', () => {
  it(
    'gives every file action something distinct to choose from',
    () => {
      const actions = scratchAt(1, [...FIXTURE]);
      const projects = FIXTURE.filter(([p]) => p.endsWith('package.json')).map(([p]) =>
        p.slice(0, Math.max(0, p.lastIndexOf('/'))),
      );
      for (const project of projects) expect(actions.countries()).toContain(project);
      for (const area of ['apps', 'libs', 'tools']) {
        expect(actions.countries()).not.toContain(area);
      }
      expect(actions.countries().length).toBeGreaterThanOrEqual(5);
      expect(actions.movable().length).toBeGreaterThanOrEqual(6);
      for (const folder of actions.folders()) {
        for (const file of folder.files) {
          const home = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
          expect([file, home]).toEqual([file, folder.dir]);
        }
      }
      for (const action of SCRATCH_ACTIONS) {
        expect([action, actions.run(action)?.action]).toEqual([action, action]);
      }
    },
    GIT_MS,
  );

  it(
    'moves a folder to another country rather than renaming it in place',
    () => {
      const actions = scratchAt(3, [...FIXTURE]);
      for (let round = 0; round < 6; round++) {
        const before = actions.folders();
        const moved = actions.run('move-folder');
        if (!moved) continue;
        const [from, to] = moved.paths;
        const home = before.find((f) => f.dir === from)?.country ?? '';
        const host = String(to).slice(0, String(to).lastIndexOf('/'));
        expect([from, host]).not.toEqual([
          from,
          String(from).slice(0, String(from).lastIndexOf('/')),
        ]);
        expect(home).not.toBe(host === '' ? '' : before.find((f) => f.dir === host)?.country);
      }
    },
    GIT_MS,
  );
});

describe('scratch actions', () => {
  it(
    'runs every listed action against a scratch repo without throwing',
    () => {
      const actions = scratchAt();
      expect(() => {
        for (const action of SCRATCH_ACTIONS) actions.run(action);
      }).not.toThrow();
    },
    GIT_MS,
  );

  it(
    'replays the same targets for the same seed',
    () => {
      const order: ScratchAction[] = [...SCRATCH_ACTIONS, ...SCRATCH_ACTIONS];
      const run = (): unknown[] => {
        const actions = scratchAt();
        return order.map((action) => actions.run(action) ?? null);
      };
      expect(run()).toEqual(run());
    },
    GIT_MS,
  );
});
