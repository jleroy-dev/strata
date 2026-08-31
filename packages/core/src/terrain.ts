import type { Block, TerrainChange } from './events.js';
import { placeBlocks } from './hierarchy.js';
import { pathOf, qualify, repoPath, type RepoId, type RepoPath } from './qualified.js';

/** What git lists for one path: its size, and its index blob sha when tracked. */
export interface Entry {
  size: number;
  sha?: string;
}

export type Listing = ReadonlyMap<RepoPath, Entry>;

/** True when a tick has both departures and arrivals, so pairing may need content hashes. */
export function needsHashes(previous: Listing, next: Listing): boolean {
  let gone = false;
  let fresh = false;
  for (const id of previous.keys()) if (!next.has(id)) gone = true;
  for (const id of next.keys()) if (!previous.has(id)) fresh = true;
  return gone && fresh;
}

/**
 * The structural changes between two listings, ordered moved, removed, added, changed.
 * A departure and an arrival pair into a move on equal blob sha, then on equal basename
 * and size; never on size alone.
 */
export function reconcile(
  repo: RepoId,
  previous: Listing,
  next: Listing,
  hashes: ReadonlyMap<RepoPath, string> = new Map(),
): TerrainChange[] {
  const placed = (list: Listing): Map<RepoPath, Block> =>
    new Map(
      placeBlocks(repo, [...list.keys()], new Map([...list].map(([id, e]) => [id, e.size]))).map(
        (b) => [pathOf(b.id), b],
      ),
    );
  const blocks = placed(next);
  const before = placed(previous);
  const at = (path: RepoPath) => qualify(repo, path);

  const gone = [...previous.keys()].filter((id) => !next.has(id)).sort();
  const fresh = [...next.keys()].filter((id) => !previous.has(id)).sort();

  const moved = new Map<RepoPath, RepoPath>();
  const taken = new Set<RepoPath>();
  const pair = (matches: (from: RepoPath, to: RepoPath) => boolean): void => {
    for (const from of gone) {
      if (moved.has(from)) continue;
      const to = fresh.find((id) => !taken.has(id) && matches(from, id));
      if (to === undefined) continue;
      moved.set(from, to);
      taken.add(to);
    }
  };
  pair((from, to) => {
    const sha = previous.get(from)?.sha;
    return sha !== undefined && (hashes.get(to) ?? next.get(to)?.sha) === sha;
  });
  pair(
    (from, to) =>
      basename(from) === basename(to) && previous.get(from)?.size === next.get(to)?.size,
  );

  const changes: TerrainChange[] = [];
  for (const [from, to] of foldersMoved(previous, moved))
    changes.push({ kind: 'folder.moved', from: at(repoPath(from)), to: at(repoPath(to)) });
  for (const [from, to] of moved)
    changes.push({ kind: 'block.moved', from: at(from), block: block(blocks, to) });
  for (const id of next.keys()) {
    if (previous.has(id) && !sameHome(before.get(id), blocks.get(id))) {
      changes.push({ kind: 'block.moved', from: at(id), block: block(blocks, id) });
    }
  }
  for (const id of gone) if (!moved.has(id)) changes.push({ kind: 'block.removed', id: at(id) });
  for (const id of fresh)
    if (!taken.has(id)) changes.push({ kind: 'block.added', block: block(blocks, id) });
  for (const [id, entry] of [...next].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const was = previous.get(id);
    if (was && was.size !== entry.size && sameHome(before.get(id), blocks.get(id))) {
      changes.push({ kind: 'block.changed', id: at(id), size: entry.size });
    }
  }
  return changes;
}

function block(blocks: ReadonlyMap<RepoPath, Block>, id: RepoPath): Block {
  const found = blocks.get(id);
  if (!found) throw new Error(`no block for ${id}`);
  return found;
}

function sameHome(a: Block | undefined, b: Block | undefined): boolean {
  return a?.country === b?.country && a?.district === b?.district;
}

function basename(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1);
}

/** Directories renamed as a whole: every file under them paired to the same new directory. */
export function foldersMoved(
  previous: Listing,
  moved: ReadonlyMap<RepoPath, RepoPath>,
): [string, string][] {
  const candidates = new Map<string, string>();
  for (const [from, to] of moved) {
    if (basename(from) !== basename(to)) continue;
    const a = dirname(from);
    const b = dirname(to);
    if (a === b || a === '') continue;
    const parts = a.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      const rest = from.slice(dir.length);
      if (!to.endsWith(rest)) continue;
      const target = to.slice(0, to.length - rest.length);
      if (target === dir) continue;
      const known = candidates.get(dir);
      if (known === undefined) candidates.set(dir, target);
      else if (known !== target) candidates.set(dir, '');
    }
  }
  const renamed: [string, string][] = [];
  for (const [dir, target] of candidates) {
    if (target === '') continue;
    const under = [...previous.keys()].filter((id) => id.startsWith(`${dir}/`));
    if (under.length === 0) continue;
    const whole = under.every((id) => moved.get(id) === `${target}${id.slice(dir.length)}`);
    if (whole) renamed.push([dir, target]);
  }
  return renamed
    .filter(([dir]) => !renamed.some(([other]) => other !== dir && dir.startsWith(`${other}/`)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function dirname(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? '' : id.slice(0, slash);
}
