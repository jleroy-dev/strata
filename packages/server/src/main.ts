#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import {
  History,
  mergeLayouts,
  repoOf,
  serializeLayout,
  type Layout,
  type Mount,
  type RepoId,
  type StrataEvent,
} from '@strata/core';
import {
  isDevAction,
  isScratchAction,
  random,
  ScratchActions,
  Signals,
  SCRATCH_ACTIONS,
  SIGNAL_ACTIONS,
} from './actions.js';
import { fromClaudeCode } from './adapters/claude-code.js';
import {
  auditHooks,
  installHooks,
  settingsFile,
  uninstallHooks,
  type HookAudit,
} from './adapters/claude-code-hooks.js';
import { HOOK_PATH, readToken } from './hooks.js';
import { runDemo } from './demo.js';
import { FIXTURE } from './fixture.js';
import { openScratch, scratchFor, seedScratch } from './scratch.js';
import { openTerrain, type Terrain } from './terrain.js';
import { openWeather } from './weather.js';
import { Mounts } from './mounts.js';

const BODY_LIMIT = 4 * 1024 * 1024;
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const port = Number(process.env.STRATA_PORT ?? 4747);
const args = process.argv.slice(2);
const cwd = process.env.INIT_CWD ?? process.cwd();
const at = (path: string | undefined): string => resolve(cwd, path ?? '.');
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const driftOf = (audit: HookAudit): string =>
  [
    audit.missing.length > 0 ? `missing ${audit.missing.join(', ')}` : '',
    audit.extra.length > 0 ? `unexpected ${audit.extra.join(', ')}` : '',
  ]
    .filter((part) => part !== '')
    .join('; ');

if (args[0] === 'hook') {
  const shared = args.includes('--shared');
  const dir = at(args.find((a, i) => i > 1 && !a.startsWith('--')));
  const file = settingsFile(dir, shared);
  if (args[1] === 'install') {
    const changed = await installHooks(file, port, await readToken(homedir()));
    console.log(changed ? `strata: hooks written to ${file}` : `strata: hooks already in ${file}`);
  } else if (args[1] === 'uninstall') {
    const changed = await uninstallHooks(file);
    console.log(
      changed ? `strata: hooks removed from ${file}` : `strata: no strata hooks in ${file}`,
    );
  } else if (args[1] === 'status') {
    const audit = await auditHooks(dir, homedir(), port);
    if (audit.state === 'absent') console.log(`strata: no hooks for ${dir}`);
    else if (audit.state === 'current') console.log(`strata: hooks installed for ${dir}`);
    else console.log(`strata: hooks out of date for ${dir}, ${driftOf(audit)}`);
  } else {
    console.error('usage: npx strata hook install|uninstall|status [dir] [--shared]');
    process.exit(1);
  }
  process.exit(0);
}

if (args[0] === 'demo') {
  await runDemo(at(args[1] ?? '/tmp/strata-demo'), port);
}

const dev = args.includes('--dev') || process.env.STRATA_DEV === '1';
const seed = Number(
  flag('dev-seed') ?? process.env.STRATA_DEV_SEED ?? Math.floor(Math.random() * 1e9),
);
const mounts = new Mounts();
const given = args.filter((a) => !a.startsWith('--'));
const mounted: Mount[] = [];
try {
  for (const path of given.length > 0 ? given : [undefined]) mounted.push(mounts.add(at(path)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const first = mounted[0];
if (!first) {
  console.error('strata: nothing to mount');
  process.exit(1);
}

let scratch: ScratchActions | undefined;
let scratchMount: Mount | undefined;
if (dev) {
  try {
    const where = at(flag('scratch') ?? join(tmpdir(), 'strata-scratch'));
    const roots = mounted.map((m) => m.root);
    const from = flag('scratch-from');
    if (from === undefined) {
      scratchMount = mounts.add(seedScratch(where, FIXTURE, roots).root);
      console.log(`strata: scratch repo seeded at ${where}, ${String(FIXTURE.length)} files`);
    } else {
      const source = at(from);
      if (!openScratch(where)) console.log(`strata: cloning ${source} to ${where}, once`);
      const built = scratchFor(source, where, roots, args.includes('--scratch-reset'));
      if (built.cloned) console.log(`strata: scratch repo ready at ${built.scratch.root}`);
      scratchMount = mounts.add(built.scratch.root);
    }
  } catch (error) {
    console.error(`strata: no scratch repo, mutating dev actions are off: ${reason(error)}`);
    scratchMount = undefined;
  }
}

/** `mounted` is the repos asked for; the scratch is a fixture and only ever joins them here. */
const drawn: Mount[] = scratchMount ? [...mounted, scratchMount] : [...mounted];

const http = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error(`strata: request failed: ${reason(error)}`);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
const wss = new WebSocketServer({ server: http });
const stream: { history?: History } = {};
const broadcast = (events: StrataEvent[]): void => {
  for (const event of events) {
    if (event.kind === 'hook.state' || event.kind === 'history') continue;
    stream.history?.push(event);
  }
  stream.history?.expire(Date.now());
  if (events.length === 0) return;
  const frame = JSON.stringify(events);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(frame);
  }
};

const terrains = new Map<RepoId, Terrain>();
for (const mount of drawn) {
  terrains.set(mount.id, await openTerrain(mount, broadcast));
}
const layoutNow = (): Layout => mergeLayouts([...terrains.values()].map((t) => t.layout()));
stream.history = new History(layoutNow(), Date.now());
const weather = openWeather((id) => terrains.get(repoOf(id))?.has(id) ?? false, broadcast);
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    if (!stream.history) return;
    const folded = JSON.stringify(serializeLayout(stream.history.now().layout));
    const current = JSON.stringify(serializeLayout(layoutNow()));
    if (folded !== current) console.error('strata: history diverged from the terrain');
  }, 60_000);
}
const audits = new Map<RepoId, HookAudit>();
for (const mount of mounted) audits.set(mount.id, await auditHooks(mount.root, homedir(), port));
const signals = new Signals(
  first.id,
  () => terrains.get(first.id)?.paths() ?? [],
  (signal) => {
    weather.receive(signal);
  },
  random(seed),
);
if (scratchMount) {
  const mount = scratchMount;
  const opened = openScratch(mount.root);
  if (opened) {
    scratch = new ScratchActions(
      opened,
      mount.id,
      () => terrains.get(mount.id)?.paths() ?? [],
      random(seed),
    );
  }
}
const startedAt = Date.now();
const posts = { total: 0, rejected: 0, tooLarge: 0 };
const drops = new Map<string, number>();
const kinds = new Map<string, number>();
const tally = (into: Map<string, number>, key: string): void => {
  into.set(key, (into.get(key) ?? 0) + 1);
};
const token = await readToken(homedir());

const health = (mount: Mount, scratch: boolean): Record<string, unknown> => {
  const audit = audits.get(mount.id);
  return {
    id: mount.id,
    root: mount.root,
    scratch,
    hooks: audit?.state ?? 'absent',
    missing: audit?.missing ?? [],
    extra: audit?.extra ?? [],
    heard: weather.statsOf(mount.id),
  };
};

const hookState = (mount: Mount): StrataEvent => {
  const state = audits.get(mount.id)?.state ?? 'absent';
  return {
    kind: 'hook.state',
    repo: mount.id,
    state:
      state === 'absent'
        ? 'no-hook'
        : state === 'stale'
          ? 'installed-stale'
          : weather.heard(mount.id)
            ? 'heard'
            : 'installed-unheard',
    at: Date.now(),
  };
};

for (const mount of mounted) {
  terrains.get(mount.id)?.onSettingsTouched(() => {
    void auditHooks(mount.root, homedir(), port).then((now) => {
      if (now.state === audits.get(mount.id)?.state) return;
      audits.set(mount.id, now);
      broadcast([hookState(mount)]);
    });
  });
}

wss.on('connection', (socket) => {
  const history = stream.history;
  if (!history) return;
  const now: StrataEvent = { kind: 'snapshot', mounts: mounts.all, at: Date.now() };
  const past: StrataEvent = {
    kind: 'history',
    baseline: serializeLayout(history.baseline),
    at: history.baselineAt,
    events: [...history.log],
  };
  socket.send(JSON.stringify([now, past, ...mounted.map(hookState)]));
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        since: startedAt,
        mounts: [
          ...mounted.map((m) => health(m, false)),
          ...(scratchMount ? [health(scratchMount, true)] : []),
        ],
        posts: { ...posts, drops: Object.fromEntries(drops) },
        signals: Object.fromEntries(kinds),
        scratch: scratch?.root ?? null,
      }),
    );
    return;
  }
  if (request.url?.startsWith('/dev/')) {
    const origin = request.headers.origin;
    if (origin !== undefined && LOOPBACK_ORIGIN.test(origin)) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'origin');
    }
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const send = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (!dev) {
      send(403, { reason: 'dev actions off: start the server with STRATA_DEV=1' });
      return;
    }
    if (request.method === 'GET' && request.url === '/dev/state') {
      send(200, {
        seed,
        scratch: scratch?.root ?? null,
        signal: SIGNAL_ACTIONS,
        mutating: SCRATCH_ACTIONS,
      });
      return;
    }
    const action = request.url.slice('/dev/'.length);
    if (request.method !== 'POST' || !isDevAction(action)) {
      response.writeHead(404).end();
      return;
    }
    if (!isScratchAction(action)) {
      signals.run(action);
      send(200, { action, paths: [] });
      return;
    }
    if (!scratch) {
      send(409, {
        reason: 'no scratch repo: strata never writes inside a repo it watches',
      });
      return;
    }
    send(200, scratch.run(action) ?? { action, paths: [] });
    return;
  }
  const target = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method !== 'POST' || target.pathname !== HOOK_PATH) {
    response.writeHead(404).end();
    return;
  }
  if (target.searchParams.get('t') !== token) {
    posts.rejected++;
    response.writeHead(401).end();
    return;
  }
  posts.total++;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > BODY_LIMIT) {
      posts.tooLarge++;
      response.writeHead(413).end();
      return;
    }
    chunks.push(buffer);
  }
  response.writeHead(204).end();
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    tally(drops, 'not-json');
    return;
  }
  const read = fromClaudeCode(body, mounts, Date.now());
  if ('dropped' in read) {
    tally(drops, read.dropped);
    return;
  }
  const { signal } = read;
  tally(kinds, signal.tool === undefined ? signal.kind : `${signal.kind}:${signal.tool}`);
  const wasHeard = weather.heard(signal.repo);
  weather.receive(signal);
  const mount = mounted.find((m) => m.id === signal.repo);
  if (!wasHeard && mount) broadcast([hookState(mount)]);
}

http.listen(port, '127.0.0.1', () => {
  console.log(
    `strata: watching ${drawn.map((m) => m.root).join(', ')}, serving ws://127.0.0.1:${String(port)}, hooks at ` +
      `http://127.0.0.1:${String(port)}${HOOK_PATH}`,
  );
  for (const m of mounted) {
    const audit = audits.get(m.id);
    if (!audit || audit.state === 'absent')
      console.log(`strata: no hook installed for ${m.id}; run: npx strata hook install ${m.root}`);
    else if (audit.state === 'stale')
      console.log(
        `strata: hooks out of date for ${m.id}, ${driftOf(audit)}; run: npx strata hook install ${m.root}`,
      );
  }
  if (dev) {
    console.log(
      `strata: dev actions on /dev/<action>, seed ${String(seed)} (--dev-seed=${String(seed)} to replay); open the panel with ?dev`,
    );
    console.log(
      scratch
        ? `strata: file actions write to the scratch repo at ${scratch.root} (--scratch-from=<repo> to clone one instead)`
        : 'strata: no scratch repo, so the file actions are off',
    );
  } else console.log('strata: start with STRATA_DEV=1 for the dev actions');
});

process.on('SIGINT', () => {
  for (const t of terrains.values()) t.close();
  wss.close();
  http.close();
  process.exit(0);
});
