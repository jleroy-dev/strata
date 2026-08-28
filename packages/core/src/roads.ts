import type { BlockId, Road } from './events.js';

/** What a resolver may look at: the listing, tsconfig-style aliases, workspace package names. */
export interface ResolveContext {
  has(id: BlockId): boolean;
  /** `pattern` may end in `/*`; targets are repo-relative paths with a matching `*`. */
  aliases: readonly { pattern: string; targets: readonly string[] }[];
  /** Workspace package name to its directory. */
  packages: ReadonlyMap<string, string>;
}

export interface Language {
  extensions: readonly string[];
  specifiersOf(source: string): string[];
  resolve(from: BlockId, specifier: string, ctx: ResolveContext): BlockId | undefined;
}

const registry = new Map<string, Language>();

export function registerLanguage(language: Language): void {
  for (const ext of language.extensions) registry.set(ext, language);
}

export function languageOf(id: BlockId): Language | undefined {
  const dot = id.lastIndexOf('.');
  if (dot <= id.lastIndexOf('/')) return undefined;
  return registry.get(id.slice(dot + 1).toLowerCase());
}

export const roadKey = (road: Road): string => `${road.from}\0${road.to}`;

export function parseRoadKey(key: string): Road {
  const [from = '', to = ''] = key.split('\0');
  return { from, to };
}

/** Specifiers per file and the roads they resolve to; diffs come out of `resolve`. */
export class RoadIndex {
  private readonly specifiers = new Map<BlockId, readonly string[]>();
  private readonly byFile = new Map<BlockId, Set<string>>();
  private readonly current = new Set<string>();

  set(id: BlockId, specifiers: readonly string[]): void {
    this.specifiers.set(id, specifiers);
  }

  forget(id: BlockId): void {
    this.specifiers.delete(id);
  }

  rename(from: BlockId, to: BlockId): void {
    const specs = this.specifiers.get(from);
    this.specifiers.delete(from);
    if (specs) this.specifiers.set(to, specs);
  }

  has(id: BlockId): boolean {
    return this.specifiers.has(id);
  }

  get roads(): Road[] {
    return [...this.current].sort().map(parseRoadKey);
  }

  /**
   * Re-resolves every file, or only `only`, and returns what changed. A road also vanishes
   * when either end left the listing.
   */
  resolve(ctx: ResolveContext, only?: readonly BlockId[]): { added: Road[]; removed: Road[] } {
    const files = only ?? [...this.specifiers.keys()];
    const next = new Set<string>();
    for (const id of files) {
      const language = languageOf(id);
      const specs = this.specifiers.get(id);
      const keys = new Set<string>();
      if (language && specs) {
        for (const spec of specs) {
          const to = language.resolve(id, spec, ctx);
          if (to !== undefined && to !== id && ctx.has(to)) keys.add(roadKey({ from: id, to }));
        }
      }
      this.byFile.set(id, keys);
      for (const k of keys) next.add(k);
    }
    if (only) {
      for (const [id, keys] of this.byFile) {
        if (only.includes(id)) continue;
        for (const k of keys) next.add(k);
      }
    }
    for (const [id] of this.byFile) {
      if (!this.specifiers.has(id)) this.byFile.delete(id);
    }
    const alive = new Set<string>();
    for (const k of next) {
      const road = parseRoadKey(k);
      if (this.specifiers.has(road.from) && ctx.has(road.to)) alive.add(k);
    }
    const added = [...alive]
      .filter((k) => !this.current.has(k))
      .sort()
      .map(parseRoadKey);
    const removed = [...this.current]
      .filter((k) => !alive.has(k))
      .sort()
      .map(parseRoadKey);
    this.current.clear();
    for (const k of alive) this.current.add(k);
    return { added, removed };
  }
}
