import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { repoId, repoPath } from '@strata/core';
import { ScratchActions, type ScratchResult } from './actions.js';
import { FIXTURE, listing } from './fixture.js';
import { openScratch, seedScratch, type Scratch } from './scratch.js';

/** The scratch repo the demo drives, seeded on first run and reused after. */
export function seedDemo(dir: string): Scratch {
  const open = openScratch(dir);
  if (open) return open;
  const files = listing();
  console.log(
    `strata demo: seeding ${String(files.length)} files${files === FIXTURE ? '' : ' from the mockup listing'}`,
  );
  return seedScratch(dir, files);
}

interface Session {
  id: string;
  at: string;
}

/** Drives the scratch repo and two sessions against a running server, forever. */
export async function runDemo(dir: string, port: number): Promise<void> {
  const scratch = seedDemo(dir);
  const url = `http://127.0.0.1:${String(port)}/hook`;
  const health = `http://127.0.0.1:${String(port)}/health`;
  console.log(`strata demo: ${dir} seeded, waiting for the server on port ${String(port)}`);
  for (;;) {
    const up = await fetch(health)
      .then((r) => r.ok)
      .catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('strata demo: server up, driving');
  const first: Session = {
    id: '4f9a2c17-3b6e-4d1a-9c8f-1e2d3c4b5a60',
    at: 'libs/story/engine/src/engine.ts',
  };
  const second: Session = {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    at: 'apps/web/src/pages/room.page.ts',
  };
  const third: Session = { id: '7c1d9e2f-5a3b-4c8d-9e0f-1a2b3c4d5e6f', at: first.at };
  const sessions: Session[] = [first, second, third];
  const post = (body: Record<string, unknown>): Promise<unknown> =>
    fetch(url, { method: 'POST', body: JSON.stringify(body) }).catch(() => undefined);
  const hook = (s: Session, event: string, extra: Record<string, unknown> = {}): Promise<unknown> =>
    post({
      session_id: s.id,
      cwd: dir,
      transcript_path: '/dev/null',
      hook_event_name: event,
      ...extra,
    });
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
  const relist = (): string[] =>
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: dir,
    })
      .toString('utf8')
      .split('\0')
      .filter((p) => (p.endsWith('.ts') || p.endsWith('.md')) && existsSync(join(dir, p)));
  const listed = relist();
  let live = new Set<string>(listed);
  let counter = Date.now() % 100_000;
  first.at = pick(listed);
  second.at = pick(listed);
  const actions = new ScratchActions(scratch, repoId(basename(dir)), () => [...live].map(repoPath));
  const relocate = (from: string, to: string): void => {
    const at = (p: string): string =>
      p === from || p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p;
    for (const s of sessions) s.at = at(s.at);
    for (const [s, home] of homes) homes.set(s, at(home));
  };
  const applied = (result: ScratchResult | undefined): void => {
    if (!result) return;
    live = new Set(relist());
    const [from, to] = result.paths;
    if (from !== undefined && to !== undefined && result.action !== 'burst') relocate(from, to);
  };

  const read = (s: Session, path: string): Promise<unknown> =>
    hook(s, 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: join(dir, path) } });
  const edit = async (s: Session, path: string): Promise<void> => {
    if (!existsSync(join(dir, path))) {
      live.delete(path);
      return;
    }
    await hook(s, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: join(dir, path) } });
    await sleep(300);
    actions.writeAt(repoPath(path), 300 + Math.floor(Math.random() * 6000));
  };

  const inDistrict = (path: string): string[] => {
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    return [...live].filter((p) => p.startsWith(dir) && p !== path);
  };
  const stop = (s: Session): Promise<unknown> =>
    hook(s, 'Stop', { last_assistant_message: 'done' });
  const shell = (s: Session): Promise<unknown> =>
    hook(s, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm run gate' } });
  const create = async (s: Session, path: string, size: number): Promise<void> => {
    await hook(s, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: join(dir, path) } });
    await sleep(300);
    actions.addAt(repoPath(path), size);
    live.add(path);
  };

  const pool = (home: string): string[] => {
    const same = inDistrict(home);
    return same.length > 0 ? [home, ...same] : [home];
  };
  const homes = new Map<Session, string>([
    [first, first.at],
    [second, second.at],
    [third, third.at],
  ]);
  const alive = new Set<Session>();
  const lastTouch = new Map<Session, number>();
  const touch = async (s: Session, path: string, verb: 'reading' | 'editing'): Promise<void> => {
    s.at = path;
    lastTouch.set(s, Date.now());
    if (verb === 'reading') await read(s, path);
    else await edit(s, path);
  };
  const arrive = async (s: Session, source = 'startup'): Promise<void> => {
    await hook(s, 'SessionStart', { source });
    alive.add(s);
  };
  const leave = async (s: Session): Promise<void> => {
    await hook(s, 'SessionEnd', { reason: 'other' });
    alive.delete(s);
  };

  console.log('strata demo: seeding an hour of touches');
  await arrive(first);
  await arrive(second);
  const dirs = [
    ...new Set([...live].map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''))),
  ].filter((d) => d.includes('/'));
  homes.set(first, `${pick(dirs)}/x`);
  homes.set(second, `${pick(dirs.filter((d) => !homes.get(first)?.startsWith(d)))}/x`);
  for (let i = 0; i < 60; i++) {
    const s = i % 2 === 0 ? first : second;
    const home = homes.get(s) ?? s.at;
    if (Math.random() < 0.15)
      homes.set(
        s,
        pick(
          [...live].filter(
            (p) => !inDistrict(homes.get(s === first ? second : first) ?? '').includes(p),
          ),
        ),
      );
    const path = pick(pool(home));
    await hook(s, 'PreToolUse', {
      tool_name: Math.random() < 0.5 ? 'Read' : 'Edit',
      tool_input: { file_path: join(dir, path) },
    });
    await sleep(40);
  }
  await stop(first);
  await stop(second);
  await sleep(3000);
  console.log('strata demo: driving');

  const setPieces: (() => Promise<void> | void)[] = [
    () => {
      const from = pick([...live].filter((p) => p.endsWith('.ts')));
      const moved = actions.moveTo(
        repoPath(from),
        repoPath(`docs/${from.slice(from.lastIndexOf('/') + 1)}`),
      );
      applied(moved && { action: 'move-file', paths: moved });
    },
    () => {
      applied(actions.run('move-folder'));
    },
    () => {
      applied(actions.run('rename'));
    },
    () => {
      applied(actions.run('burst'));
    },
    async () => {
      if (alive.size === 0) return;
      const s = pick([...alive]);
      const fresh = `${s.at.slice(0, s.at.lastIndexOf('/') + 1)}${pick(['helpers', 'format', 'guard', 'select', 'merge'])}-${String(counter++)}.ts`;
      await create(s, fresh, 400 + Math.floor(Math.random() * 3000));
    },
    () => {
      applied(actions.run('remove'));
      applied(actions.run('remove'));
    },
  ];
  let nextSetPiece = Date.now() + 20_000;
  let setPiece = 0;
  let thirdAt = Date.now() + 45_000;
  let quietAt = Date.now() + 240_000;

  for (;;) {
    await sleep(700);
    const now = Date.now();
    for (const s of [...alive]) {
      if (Math.random() > 0.18) continue;
      const r = Math.random();
      if (r < 0.12) {
        await shell(s);
        continue;
      }
      if (r < 0.2) {
        await stop(s);
        continue;
      }
      if (r < 0.24) homes.set(s, pick([...live]));
      const home = homes.get(s) ?? s.at;
      if (!existsSync(join(dir, home))) homes.set(s, pick([...live]));
      const other = [...alive].find((o) => o !== s && o.at !== s.at && existsSync(join(dir, o.at)));
      const target = other && Math.random() < 0.05 ? other.at : pick(pool(homes.get(s) ?? s.at));
      await touch(s, target, Math.random() < 0.45 ? 'reading' : 'editing');
    }
    if (now >= nextSetPiece) {
      nextSetPiece = now + 25_000 + Math.random() * 20_000;
      const piece = setPieces[setPiece % setPieces.length];
      setPiece++;
      if (piece) await piece();
    }
    if (now >= thirdAt) {
      if (alive.has(third)) {
        await leave(third);
        thirdAt = now + 90_000;
      } else {
        await arrive(third);
        thirdAt = now + 60_000;
      }
    }
    if (now >= quietAt) {
      quietAt = now + 300_000;
      for (const s of [...alive]) await stop(s);
      await sleep(30_000);
    }
  }
}
