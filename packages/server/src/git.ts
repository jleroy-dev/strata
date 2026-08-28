import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Entry, Listing } from '@strata/core';

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;

async function git(root: string, args: string[], input?: string): Promise<string> {
  const child = run('git', args, { cwd: root, maxBuffer: MAX_BUFFER, encoding: 'utf8' });
  if (input !== undefined && child.child.stdin) {
    child.child.stdin.end(input);
  }
  const { stdout } = await child;
  return stdout;
}

const fields = (out: string): string[] => out.split('\0').filter(Boolean);

/**
 * Every path git sees, tracked ones with their index blob sha. Sizes come from `sizes` when
 * known and from disk for `touched` paths and paths not yet known.
 */
export async function listFiles(
  root: string,
  sizes: ReadonlyMap<string, number>,
  touched: ReadonlySet<string>,
): Promise<Listing> {
  const [tracked, deleted, untracked] = await Promise.all([
    git(root, ['ls-files', '-s', '-z']),
    git(root, ['ls-files', '-z', '--deleted']),
    git(root, ['ls-files', '-z', '--others', '--exclude-standard']),
  ]);
  const gone = new Set(fields(deleted));
  const listing = new Map<string, Entry>();
  for (const line of fields(tracked)) {
    const tab = line.indexOf('\t');
    const [, sha] = line.slice(0, tab).split(' ');
    const path = line.slice(tab + 1);
    if (gone.has(path)) continue;
    listing.set(path, sha ? { size: 0, sha } : { size: 0 });
  }
  for (const path of fields(untracked)) listing.set(path, { size: 0 });

  await Promise.all(
    [...listing].map(async ([path, entry]) => {
      const known = sizes.get(path);
      if (known !== undefined && !touched.has(path)) {
        entry.size = known;
        return;
      }
      try {
        entry.size = (await stat(resolve(root, path))).size;
      } catch {
        entry.size = 0;
      }
    }),
  );
  return listing;
}

/** Blob shas of working-tree files, so a moved tracked file can be matched to its index entry. */
export async function hashFiles(
  root: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const present = paths.filter((path) => existsSync(resolve(root, path)));
  if (present.length === 0) return new Map();
  try {
    const out = await git(root, ['hash-object', '--stdin-paths'], `${present.join('\n')}\n`);
    const shas = out.split('\n').filter(Boolean);
    return new Map(present.map((path, i) => [path, shas[i] ?? '']));
  } catch {
    return new Map();
  }
}
