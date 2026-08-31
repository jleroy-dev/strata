import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { within } from './mounts.js';

export const MARKER = '.strata-scratch';

declare const tag: unique symbol;

/** A directory strata created and is allowed to write to. Only this module mints one. */
export interface Scratch {
  readonly root: string;
  readonly [tag]: 'scratch';
}

export const fill = (n: number): string => `${'x'.repeat(Math.max(0, n - 1))}\n`;

const mint = (root: string): Scratch => ({ root }) as Scratch;

/** A path with its existing ancestors resolved, so a symlinked parent cannot hide an overlap. */
export function realAt(path: string): string {
  const tail: string[] = [];
  let head = path;
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) return path;
    tail.unshift(basename(head));
    head = parent;
  }
  return join(realpathSync(head), ...tail);
}

/** The capability for a directory already marked, or nothing when it is not one of ours. */
export function openScratch(given: string): Scratch | undefined {
  const root = realAt(given);
  return existsSync(join(root, MARKER)) ? mint(root) : undefined;
}

/** The repo a scratch was built from, for telling a stale one from a reusable one. */
export function sourceOf(root: string): string | undefined {
  try {
    const source = readFileSync(join(root, MARKER), 'utf8').split('\n')[0]?.trim();
    return source === undefined || source === '' ? undefined : source;
  } catch {
    return undefined;
  }
}

function guard(at: string, mounts: readonly string[]): void {
  for (const given of mounts) {
    const root = realAt(given);
    if (within(root, at) || within(at, root)) {
      throw new Error(`strata: a scratch repo cannot sit inside a watched repo: ${at} and ${root}`);
    }
  }
}

/**
 * Builds into a sibling and renames into place, so the final path only ever exists complete
 * and marked; a run killed partway leaves staging behind and nothing that blocks the next one.
 */
function stage(at: string, source: string, build: (into: string) => void): Scratch {
  if (existsSync(at)) {
    if (!existsSync(join(at, MARKER))) {
      throw new Error(
        `strata: ${at} exists and is not a strata scratch repo; remove it or pass --scratch=<path>`,
      );
    }
    rmSync(at, { recursive: true, force: true });
  }
  const parent = dirname(at);
  mkdirSync(parent, { recursive: true });
  const prefix = `${basename(at)}.staging-`;
  for (const entry of readdirSync(parent)) {
    if (entry.startsWith(prefix)) rmSync(join(parent, entry), { recursive: true, force: true });
  }
  const staging = join(parent, `${prefix}${String(process.pid)}`);
  try {
    build(staging);
    mkdirSync(join(staging, '.git', 'info'), { recursive: true });
    appendFileSync(join(staging, '.git', 'info', 'exclude'), `\n${MARKER}\n`);
    writeFileSync(join(staging, MARKER), `${source}\n${new Date().toISOString()}\n`);
    renameSync(staging, at);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return mint(at);
}

/** A throwaway copy of a repo's committed state, independent of it on disk. */
export function cloneScratch(from: string, given: string, mounts: readonly string[]): Scratch {
  const at = realAt(given);
  guard(at, mounts);
  const source = realAt(from);
  return stage(at, source, (into) => {
    execFileSync('git', ['clone', '--local', '--no-hardlinks', '--quiet', source, into], {
      stdio: 'ignore',
    });
  });
}

/** A throwaway repo built from a listing, for a demo with no repo to copy. */
export function seedScratch(
  given: string,
  listing: readonly [string, number][],
  mounts: readonly string[] = [],
): Scratch {
  const at = realAt(given);
  guard(at, mounts);
  return stage(at, 'listing', (into) => {
    mkdirSync(into, { recursive: true });
    for (const [path, size] of listing) {
      mkdirSync(join(into, path, '..'), { recursive: true });
      writeFileSync(join(into, path), fill(size));
    }
    execFileSync('git', ['init', '-q'], { cwd: into, stdio: 'ignore' });
    execFileSync('git', ['add', '-A'], { cwd: into, stdio: 'ignore' });
    execFileSync(
      'git',
      ['-c', 'user.name=demo', '-c', 'user.email=demo@strata', 'commit', '-qm', 'seed'],
      { cwd: into, stdio: 'ignore' },
    );
  });
}

/**
 * The scratch for a source repo, reusing the clone already on disk. Cloning a large repo costs
 * seconds and hundreds of megabytes, and the server restarts on every edit under `tsx watch`.
 */
export function scratchFor(
  from: string,
  given: string,
  mounts: readonly string[],
  fresh = false,
): { scratch: Scratch; cloned: boolean } {
  const at = realAt(given);
  guard(at, mounts);
  const open = fresh ? undefined : openScratch(at);
  if (open && sourceOf(open.root) === realAt(from)) return { scratch: open, cloned: false };
  return { scratch: cloneScratch(from, at, mounts), cloned: true };
}
