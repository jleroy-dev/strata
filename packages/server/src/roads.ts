import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PROJECT_MARKERS,
  RoadIndex,
  isBinary,
  languageOf,
  registerLanguage,
  typescript,
  type BlockId,
  type Listing,
  type ResolveContext,
  type StrataEvent,
  type TerrainChange,
} from '@strata/core';

registerLanguage(typescript);

const MAX_BYTES = 512 * 1024;
const CONCURRENCY = 32;

export interface Roads {
  /** Reads every file once and returns the roads found. */
  build(listing: Listing): Promise<StrataEvent[]>;
  /** Follows a tick's changes and returns the road events they cause. */
  apply(changes: readonly TerrainChange[], listing: Listing, at: number): Promise<StrataEvent[]>;
}

export function openRoads(root: string): Roads {
  const index = new RoadIndex();
  let aliases: ResolveContext['aliases'] = [];
  let packages = new Map<string, string>();

  const readable = (id: BlockId, listing: Listing): boolean =>
    languageOf(id) !== undefined && !isBinary(id) && (listing.get(id)?.size ?? 0) <= MAX_BYTES;

  const scan = async (ids: readonly BlockId[]): Promise<void> => {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const id = ids[cursor++];
        if (id === undefined) return;
        const language = languageOf(id);
        if (!language) continue;
        try {
          const source = await readFile(resolve(root, id), 'utf8');
          index.set(id, language.specifiersOf(source));
        } catch {
          index.forget(id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  };

  const context = (listing: Listing): ResolveContext => ({
    has: (id) => listing.has(id),
    aliases,
    packages,
  });

  const events = (
    diff: { added: { from: string; to: string }[]; removed: { from: string; to: string }[] },
    at: number,
  ): StrataEvent[] => [
    ...diff.removed.map((road): StrataEvent => ({ kind: 'road.removed', road, at })),
    ...diff.added.map((road): StrataEvent => ({ kind: 'road.added', road, at })),
  ];

  return {
    async build(listing) {
      aliases = await readAliases(root);
      packages = await readPackages(root, listing);
      await scan([...listing.keys()].filter((id) => readable(id, listing)));
      return events(index.resolve(context(listing)), Date.now());
    },

    async apply(changes, listing, at) {
      const touched: BlockId[] = [];
      let structural = false;
      for (const change of changes) {
        switch (change.kind) {
          case 'block.added':
            structural = true;
            if (readable(change.block.id, listing)) touched.push(change.block.id);
            break;
          case 'block.changed':
            if (readable(change.id, listing)) touched.push(change.id);
            break;
          case 'block.moved':
            structural = true;
            index.rename(change.from, change.block.id);
            if (readable(change.block.id, listing)) touched.push(change.block.id);
            break;
          case 'block.removed':
            structural = true;
            index.forget(change.id);
            break;
          case 'folder.moved':
            break;
        }
      }
      const markers = changes.some(
        (c) =>
          c.kind !== 'block.changed' &&
          PROJECT_MARKERS.some((m) =>
            (c.kind === 'folder.moved' ? c.to : 'id' in c ? c.id : c.block.id).endsWith(m),
          ),
      );
      if (markers) packages = await readPackages(root, listing);
      await scan(touched);
      const diff = index.resolve(context(listing), structural ? undefined : touched);
      return events(diff, at);
    },
  };
}

async function readAliases(root: string): Promise<ResolveContext['aliases']> {
  for (const name of ['tsconfig.base.json', 'tsconfig.json']) {
    const config = await readJsonc(resolve(root, name));
    const options = (
      config as { compilerOptions?: { baseUrl?: unknown; paths?: unknown } } | undefined
    )?.compilerOptions;
    if (!options || typeof options.paths !== 'object' || options.paths === null) continue;
    const base =
      typeof options.baseUrl === 'string'
        ? options.baseUrl.replace(/^\.\/?/, '').replace(/\/$/, '')
        : '';
    return Object.entries(options.paths as Record<string, unknown>).flatMap(([pattern, targets]) =>
      Array.isArray(targets)
        ? [
            {
              pattern,
              targets: targets
                .filter((t): t is string => typeof t === 'string')
                .map((t) => (base ? `${base}/${t}` : t)),
            },
          ]
        : [],
    );
  }
  return [];
}

async function readPackages(root: string, listing: Listing): Promise<Map<string, string>> {
  const packages = new Map<string, string>();
  for (const id of listing.keys()) {
    if (!id.endsWith('package.json')) continue;
    const parsed = await readJsonc(resolve(root, id));
    const name = (parsed as { name?: unknown } | undefined)?.name;
    if (typeof name !== 'string') continue;
    const slash = id.lastIndexOf('/');
    packages.set(name, slash === -1 ? '' : id.slice(0, slash));
  }
  return packages;
}

async function readJsonc(file: string): Promise<unknown> {
  try {
    const text = await readFile(file, 'utf8');
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped) as unknown;
  } catch {
    return undefined;
  }
}
