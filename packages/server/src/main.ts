import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { placeBlocks, type StrataEvent } from '@strata/core';

const root = resolve(process.argv[2] ?? process.cwd());
const port = Number(process.env.STRATA_PORT ?? 4747);

function snapshot(): StrataEvent {
  const listing = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
    },
  );
  const paths = listing.toString('utf8').split('\0').filter(Boolean);
  const sizes = new Map<string, number>();
  for (const path of paths) {
    try {
      sizes.set(path, statSync(resolve(root, path)).size);
    } catch {
      sizes.set(path, 0);
    }
  }
  return { kind: 'snapshot', blocks: placeBlocks(paths, sizes), roads: [], at: Date.now() };
}

const wss = new WebSocketServer({ port });
wss.on('connection', (socket) => {
  socket.send(JSON.stringify(snapshot()));
});

console.log(`strata: watching ${root}, serving ws://localhost:${String(port)}`);
