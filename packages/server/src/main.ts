#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { History, parseRoadKey, serializeLayout, type StrataEvent } from '@strata/core';
import { Actions, DEV_ACTIONS, type DevAction } from './actions.js';
import { fromClaudeCode } from './adapters/claude-code.js';
import { HOOK_PATH, hookUrl, hooksInstalled, installHooks, settingsFile } from './hooks.js';
import { runDemo } from './demo.js';
import { openTerrain } from './terrain.js';
import { openWeather } from './weather.js';

const BODY_LIMIT = 4 * 1024 * 1024;
const port = Number(process.env.STRATA_PORT ?? 4747);
const args = process.argv.slice(2);
const cwd = process.env.INIT_CWD ?? process.cwd();
const at = (path: string | undefined): string => resolve(cwd, path ?? '.');

if (args[0] === 'hook') {
  const shared = args.includes('--shared');
  const dir = at(args.find((a, i) => i > 1 && !a.startsWith('--')));
  const file = settingsFile(dir, shared);
  if (args[1] === 'install') {
    const changed = await installHooks(file, port);
    console.log(changed ? `strata: hooks written to ${file}` : `strata: hooks already in ${file}`);
  } else if (args[1] === 'status') {
    const installed = await hooksInstalled(dir, homedir(), port);
    console.log(installed ? `strata: hooks installed for ${dir}` : `strata: no hooks for ${dir}`);
  } else {
    console.error('usage: npx strata hook install|status [dir] [--shared]');
    process.exit(1);
  }
  process.exit(0);
}

if (args[0] === 'demo') {
  await runDemo(at(args[1] ?? '/tmp/strata-demo'), port);
}

const dev = args.includes('--dev') || process.env.STRATA_DEV === '1';
const root = at(args.find((a) => !a.startsWith('--')));
if (!existsSync(root)) {
  console.error(`strata: ${root} does not exist`);
  process.exit(1);
}
if (!existsSync(resolve(root, '.git'))) {
  console.error(`strata: ${root} is not a git repository`);
  process.exit(1);
}

const http = createServer((request, response) => void handle(request, response));
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

const terrain = await openTerrain(root, broadcast);
stream.history = new History(terrain.layout(), Date.now());
const weather = openWeather((path) => terrain.has(path), broadcast);
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    if (!stream.history) return;
    const folded = JSON.stringify(serializeLayout(stream.history.now().layout));
    const current = JSON.stringify(serializeLayout(terrain.layout()));
    if (folded !== current) console.error('strata: history diverged from the terrain');
  }, 60_000);
}
let installed = await hooksInstalled(root, homedir(), port);
const actions = new Actions(
  root,
  () => terrain.paths(),
  (signal) => {
    weather.receive(signal);
  },
);
let unmapped = 0;

const hookState = (): StrataEvent => ({
  kind: 'hook.state',
  installed,
  heard: weather.heard(),
  at: Date.now(),
});

terrain.onSettingsTouched(() => {
  void hooksInstalled(root, homedir(), port).then((now) => {
    if (now === installed) return;
    installed = now;
    broadcast([hookState()]);
  });
});

wss.on('connection', (socket) => {
  const history = stream.history;
  if (!history) return;
  const moment = history.now();
  const now: StrataEvent = {
    kind: 'snapshot',
    root,
    roads: [...moment.roads].map(parseRoadKey),
    layout: serializeLayout(moment.layout),
    at: Date.now(),
  };
  const past: StrataEvent = {
    kind: 'history',
    baseline: serializeLayout(history.baseline),
    roads: [...history.baselineRoads].map(parseRoadKey),
    at: history.baselineAt,
    events: [...history.log],
  };
  socket.send(JSON.stringify([now, past, hookState()]));
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ root, installed, heard: weather.heard(), unmapped }));
    return;
  }
  if (request.url?.startsWith('/dev/')) {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
  }
  if (request.method === 'POST' && request.url?.startsWith('/dev/')) {
    const action = request.url.slice('/dev/'.length);
    if (!dev || !DEV_ACTIONS.includes(action as DevAction)) {
      response.writeHead(dev ? 404 : 403).end();
      return;
    }
    actions.run(action as DevAction);
    response.writeHead(204).end();
    return;
  }
  if (request.method !== 'POST' || request.url !== HOOK_PATH) {
    response.writeHead(404).end();
    return;
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > BODY_LIMIT) {
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
    unmapped++;
    return;
  }
  const wasHeard = weather.heard();
  const signal = fromClaudeCode(body, root, Date.now());
  if (!signal) {
    unmapped++;
    return;
  }
  weather.receive(signal);
  if (!wasHeard) broadcast([hookState()]);
}

http.listen(port, '127.0.0.1', () => {
  console.log(
    `strata: watching ${root}, serving ws://127.0.0.1:${String(port)}, hooks at ${hookUrl(port)}`,
  );
  if (!installed) console.log(`strata: no hook installed; run: npx strata hook install ${root}`);
  if (dev) console.log('strata: dev actions on /dev/<action>; open the panel with ?dev');
  else console.log('strata: start with STRATA_DEV=1 for the dev actions');
});

process.on('SIGINT', () => {
  terrain.close();
  wss.close();
  http.close();
  process.exit(0);
});
