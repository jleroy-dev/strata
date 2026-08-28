import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES: [string, number][] = [
  ['package.json', 400],
  ['apps/api/package.json', 300],
  ['apps/api/src/main.ts', 1200],
  ['apps/api/src/app/rooms.controller.ts', 3100],
  ['apps/api/src/app/rooms.service.ts', 5200],
  ['apps/api/src/app/rooms.service.spec.ts', 7600],
  ['apps/web/package.json', 300],
  ['apps/web/src/main.ts', 500],
  ['apps/web/src/pages/home.page.ts', 3900],
  ['apps/web/src/pages/room.page.ts', 6100],
  ['libs/shared/ui/package.json', 300],
  ['libs/shared/ui/src/button.ts', 1900],
  ['libs/shared/ui/src/dialog.ts', 4300],
  ['libs/shared/ui/src/toast.ts', 1500],
  ['libs/story/engine/package.json', 300],
  ['libs/story/engine/src/engine.ts', 14000],
  ['libs/story/engine/src/parser.ts', 6800],
  ['libs/story/engine/src/tokens.ts', 1200],
  ['docs/DESIGN.md', 21000],
  ['docs/NOTES.md', 6400],
  ['README.md', 4200],
  ['.gitignore', 20],
];

const fill = (n: number): string => `${'x'.repeat(Math.max(0, n - 1))}\n`;

/** The listing the product mockup was built on, when its dump is on this machine. */
function mockupListing(): [string, number][] | undefined {
  const dump = new URL('../../../docs/mockups/data/tellmeastory.local.js', import.meta.url);
  try {
    const text = readFileSync(dump, 'utf8');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return undefined;
    return parsed.files.filter(
      (f): f is [string, number] =>
        Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'number',
    );
  } catch {
    return undefined;
  }
}

/** Builds the scratch repo the demo drives, once. */
export function seedDemo(dir: string): void {
  if (existsSync(join(dir, '.git'))) return;
  mkdirSync(dir, { recursive: true });
  const listing = mockupListing() ?? FILES;
  console.log(
    `strata demo: seeding ${String(listing.length)} files${listing === FILES ? '' : ' from the mockup listing'}`,
  );
  for (const [path, size] of listing) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), fill(size));
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync(
    'git',
    ['-c', 'user.name=demo', '-c', 'user.email=demo@strata', 'commit', '-qm', 'seed'],
    { cwd: dir },
  );
}

interface Session {
  id: string;
  at: string;
}

/** Drives the scratch repo and two sessions against a running server, forever. */
export async function runDemo(dir: string, port: number): Promise<void> {
  seedDemo(dir);
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
  const sessions: Session[] = [first, second];
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
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: dir,
    },
  )
    .toString('utf8')
    .split('\0')
    .filter((p) => (p.endsWith('.ts') || p.endsWith('.md')) && existsSync(join(dir, p)));
  let live = new Set<string>(listed);
  let counter = Date.now() % 100_000;
  first.at = pick(listed);
  second.at = pick(listed);

  const read = (s: Session, path: string): Promise<unknown> =>
    hook(s, 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: join(dir, path) } });
  const edit = async (s: Session, path: string): Promise<void> => {
    if (!existsSync(join(dir, path))) {
      live.delete(path);
      return;
    }
    await hook(s, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: join(dir, path) } });
    await sleep(300);
    const size = 300 + Math.floor(Math.random() * 6000);
    writeFileSync(join(dir, path), fill(size));
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
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), fill(size));
    live.add(path);
  };
  const remove = (path: string): void => {
    if (!existsSync(join(dir, path))) return;
    rmSync(join(dir, path));
    live.delete(path);
  };
  const rename = (from: string, to: string): void => {
    if (!existsSync(join(dir, from))) return;
    renameSync(join(dir, from), join(dir, to));
    live.delete(from);
    live.add(to);
    for (const s of sessions) if (s.at === from) s.at = to;
  };
  const moveFolder = (from: string, to: string): void => {
    if (!existsSync(join(dir, from))) return;
    mkdirSync(join(dir, to, '..'), { recursive: true });
    renameSync(join(dir, from), join(dir, to));
    live = new Set([...live].map((p) => (p.startsWith(`${from}/`) ? p.replace(from, to) : p)));
    for (const s of sessions) if (s.at.startsWith(`${from}/`)) s.at = s.at.replace(from, to);
  };
  const third: Session = { id: '7c1d9e2f-5a3b-4c8d-9e0f-1a2b3c4d5e6f', at: first.at };

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
  const dirs = [...new Set([...live].map((p) => p.slice(0, p.lastIndexOf('/'))))].filter((d) =>
    d.includes('/'),
  );
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
      const to = `docs/${from.slice(from.lastIndexOf('/') + 1)}`;
      rename(from, to);
    },
    () => {
      const candidates = [...live].filter(
        (p) =>
          p.includes('/src/') &&
          p.endsWith('.ts') &&
          !/-\d+\//.test(p) &&
          inDistrict(p).length >= 2 &&
          inDistrict(p).length <= 12,
      );
      if (candidates.length === 0) return;
      const from = pick(candidates).replace(/\/[^/]+$/, '');
      moveFolder(from, `${from}-${String(counter++)}`);
    },
    () => {
      const from = pick([...live].filter((p) => p.endsWith('.ts')));
      rename(from, from.replace(/([^/]+)\.ts$/, `use-$1.ts`));
    },
    () => {
      const targets = [...live].filter((p) => p.endsWith('.ts')).slice(0, 40);
      for (const p of targets)
        if (existsSync(join(dir, p)))
          writeFileSync(join(dir, p), fill(300 + Math.floor(Math.random() * 6000)));
    },
    async () => {
      if (alive.size === 0) return;
      const s = pick([...alive]);
      const fresh = `${s.at.slice(0, s.at.lastIndexOf('/') + 1)}${pick(['helpers', 'format', 'guard', 'select', 'merge'])}-${String(counter++)}.ts`;
      await create(s, fresh, 400 + Math.floor(Math.random() * 3000));
    },
    () => {
      const gone = [...live].filter((p) => p.includes('-') && p.endsWith('.ts')).slice(0, 2);
      for (const p of gone) remove(p);
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
