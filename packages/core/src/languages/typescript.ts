import type { BlockId } from '../events.js';
import type { Language, ResolveContext } from '../roads.js';

const SPECIFIER =
  /\bfrom\s*['"]([^'"\n]+)['"]|\brequire\(\s*['"]([^'"\n]+)['"]\s*\)|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const SOURCE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'json'];
const SWAPS: Readonly<Record<string, string[]>> = {
  js: ['ts', 'tsx'],
  mjs: ['mts'],
  cjs: ['cts'],
  jsx: ['tsx'],
};

export const typescript: Language = {
  extensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],

  specifiersOf(source) {
    const out: string[] = [];
    for (const m of source.matchAll(SPECIFIER)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec !== undefined && !out.includes(spec)) out.push(spec);
    }
    return out;
  },

  resolve(from, specifier, ctx) {
    if (specifier.startsWith('.')) return probe(join(dirname(from), specifier), ctx);
    for (const alias of ctx.aliases) {
      if (alias.pattern.endsWith('/*')) {
        const prefix = alias.pattern.slice(0, -1);
        if (!specifier.startsWith(prefix)) continue;
        const rest = specifier.slice(prefix.length);
        for (const target of alias.targets) {
          const hit = probe(normalize(target.replace('*', rest)), ctx);
          if (hit !== undefined) return hit;
        }
      } else if (alias.pattern === specifier) {
        for (const target of alias.targets) {
          const hit = probe(normalize(target), ctx);
          if (hit !== undefined) return hit;
        }
      }
    }
    for (const [name, dir] of ctx.packages) {
      if (specifier === name)
        return probe(join(dir, 'src/index'), ctx) ?? probe(join(dir, 'index'), ctx);
      if (specifier.startsWith(`${name}/`))
        return probe(join(dir, specifier.slice(name.length + 1)), ctx);
    }
    return undefined;
  },
};

function probe(base: string, ctx: ResolveContext): BlockId | undefined {
  const candidates: string[] = [base];
  const dot = base.lastIndexOf('.');
  const ext = dot > base.lastIndexOf('/') ? base.slice(dot + 1) : '';
  for (const swap of SWAPS[ext] ?? []) candidates.push(`${base.slice(0, dot)}.${swap}`);
  for (const e of SOURCE_EXTENSIONS) candidates.push(`${base}.${e}`);
  for (const e of SOURCE_EXTENSIONS) candidates.push(`${base}/index.${e}`);
  return candidates.find((c) => ctx.has(c));
}

function dirname(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? '' : id.slice(0, slash);
}

function join(dir: string, rel: string): string {
  return normalize(dir === '' ? rel : `${dir}/${rel}`);
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}
