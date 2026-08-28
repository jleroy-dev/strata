import {
  applyTerrain,
  groundOf,
  layoutOf,
  placeBlocks,
  placementDelta,
  reconcile,
  type Block,
  type Layout,
  type Listing,
  type StrataEvent,
} from '@strata/core';
import { hashFiles, listFiles } from './git.js';
import { openRoads } from './roads.js';
import { CAP_MS, later, watchRoot, type Watcher } from './watch.js';

export interface Terrain {
  layout(): Layout;
  has(path: string): boolean;
  paths(): string[];
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
  root: string,
  broadcast: (events: StrataEvent[]) => void,
): Promise<Terrain> {
  let listing = await listFiles(root, new Map(), new Set());
  const untracked = [...listing].filter(([, e]) => e.sha === undefined).map(([id]) => id);
  for (const [id, sha] of await hashFiles(root, untracked)) {
    const entry = listing.get(id);
    if (entry && sha) entry.sha = sha;
  }
  let layout: Layout = layoutOf(toBlocks(listing));
  let seen = new Set(listing.keys());
  let running = false;
  let pending = new Set<string>();
  let again = false;
  const settingsListeners: (() => void)[] = [];
  const roads = openRoads(root);

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
      const all = reconcile(listing, fresh, hashes);
      const deferred = new Set(
        all
          .filter((c) => c.kind === 'block.added' && unseen.has(c.block.id))
          .map((c) => (c.kind === 'block.added' ? c.block.id : '')),
      );
      const changes = all.filter((c) => !(c.kind === 'block.added' && deferred.has(c.block.id)));
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
            ...result.repack,
            blocks: placementDelta(before, layout),
            ...groundOf(layout),
            at,
          });
        }
      }
      broadcast(events);
      broadcast(await roads.apply(changes, listing, at));
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
  void roads.build(listing).then((events) => {
    if (events.length > 0) broadcast(events);
  });

  return {
    layout: () => layout,
    has: (path) => listing.has(path),
    paths: () => [...listing.keys()],
    onSettingsTouched: (fn) => {
      settingsListeners.push(fn);
    },
    close: () => {
      watcher.close();
    },
  };
}

function toBlocks(listing: Listing): Block[] {
  return placeBlocks([...listing.keys()], new Map([...listing].map(([id, e]) => [id, e.size])));
}
