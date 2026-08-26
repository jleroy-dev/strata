#!/usr/bin/env node
// Usage: node docs/mockups/data/dump.mjs <repo path>
// Writes docs/mockups/data/<repo name>.local.js for the product mockup (?repo=<repo name>).
import { execFileSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? process.cwd());
const name = basename(root).toLowerCase();
const listing = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root, maxBuffer: 256 * 1024 * 1024 },
);
const files = listing
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .map((id) => {
    try {
      return [id, statSync(resolve(root, id)).size];
    } catch {
      return [id, 0];
    }
  });
const out = resolve(dirname(fileURLToPath(import.meta.url)), `${name}.local.js`);
writeFileSync(out, `window.STRATA_REPO = ${JSON.stringify({ name, files })};\n`);
console.log(`${files.length} files -> ${out}`);
