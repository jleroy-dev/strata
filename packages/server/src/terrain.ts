import {
  applyTerrain,
  groundOf,
  layoutOf,
  placeBlocks,
  pathOf,
  placementDelta,
  reconcile,
  type Block,
  type BlockId,
  type Layout,
  type Listing,
  type RepoId,
  type RepoPath,
  type StrataEvent,
} from '@strata/core';
import { hashFiles, listFiles } from './git.js';
import type { Mount } from '@strata/core';
import { CAP_MS, later, watchRoot, type Watcher } from './watch.js';

export interface Terrain {
  layout(): Layout;
  has(id: BlockId): boolean;
  paths(): RepoPath[];
  onSettingsTouched(fn: () => void): void;
  close(): void;
}

const SETTINGS = /^\.claude\/settings(\.local)?\.json$/;

/**
 * Owns the listing the clients have seen and the layout built on it. Every tick asks git for
 * the current listing and emits the difference; an arrival is emitted only once it has been
 * listed twice, so an editor's temporary file never rises.
 */
export async function openTerrain(
  mount: Mount,
  broadcast: (events: StrataEvent[]) => void,
): Promise<Terrain> {
  const root = mount.root;
  let listing = await listFiles(root, new Map(), new Set());
  const untracked = [...listing].filter(([, e]) => e.sha === undefined).map(([id]) => id);
  for (const [id, sha] of await hashFiles(root, untracked)) {
    const entry = listing.get(id);
    if (entry && sha) entry.sha = sha;
  }
  let layout: Layout = layoutOf(toBlocks(mount.id, listing));
  let seen = new Set(listing.keys());
  let running = false;
  let pending = new Set<string>();
  let again = false;
  const settingsListeners: (() => void)[] = [];

  const tick = async (touched: Set<string>): Promise<void> => {
    if ([...touched].some((path) => SETTINGS.test(path))) {
      for (const fn of settingsListeners) fn();
    }
    for (const path of touched) pending.add(path);
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const batch = pending;
      pending = new Set();
      const sizes = new Map([...listing].map(([id, e]) => [id, e.size]));
      const fresh = new Map(await listFiles(root, sizes, batch));
      const unseen = new Set([...fresh.keys()].filter((id) => !listing.has(id) && !seen.has(id)));
      seen = new Set(fresh.keys());
      const hashes = await hashFiles(
        root,
        [...fresh].filter(([id, e]) => listing.get(id)?.size !== e.size).map(([id]) => id),
      );
      for (const [id, sha] of hashes) {
        const entry = fresh.get(id);
        if (entry && sha) entry.sha = sha;
      }
      const all = reconcile(mount.id, listing, fresh, hashes);
      const deferred = new Set(
        all
          .filter((c) => c.kind === 'block.added' && unseen.has(pathOf(c.block.id)))
          .flatMap((c) => (c.kind === 'block.added' ? [pathOf(c.block.id)] : [])),
      );
      const changes = all.filter(
        (c) => !(c.kind === 'block.added' && deferred.has(pathOf(c.block.id))),
      );
      for (const id of deferred) fresh.delete(id);
      if (deferred.size > 0) {
        for (const path of batch) pending.add(path);
        later(CAP_MS, () => {
          tick(new Set()).catch(() => undefined);
        });
      }
      listing = fresh;
      if (changes.length === 0) return;
      const at = Date.now();
      const events: StrataEvent[] = [];
      for (const change of changes) {
        const before = layout;
        const result = applyTerrain(layout, change);
        layout = result.layout;
        if (change.kind === 'block.removed' || change.kind === 'folder.moved')
          events.push({ ...change, at });
        else if (result.placement) events.push({ ...change, placement: result.placement, at });
        if (result.repack) {
          events.push({
            kind: 'layout.repacked',
            repo: mount.id,
            ...result.repack,
            blocks: placementDelta(before, layout),
            ...groundOf(layout),
            at,
          });
        }
      }
      broadcast(events);
    } finally {
      running = false;
      if (again) {
        again = false;
        tick(new Set()).catch(() => undefined);
      }
    }
  };

  const watcher: Watcher = watchRoot(root, (touched) => {
    tick(touched).catch((error: unknown) => {
      console.error(
        `strata: tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  });
  return {
    layout: () => layout,
    has: (id) => listing.has(pathOf(id)),
    paths: () => [...listing.keys()],
    onSettingsTouched: (fn) => {
      settingsListeners.push(fn);
    },
    close: () => {
      watcher.close();
    },
  };
}

function toBlocks(repo: RepoId, listing: Listing): Block[] {
  return placeBlocks(
    repo,
    [...listing.keys()],
    new Map([...listing].map(([id, e]) => [id, e.size])),
  );
}
