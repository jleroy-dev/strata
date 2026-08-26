import type { Block } from './events.js';

/** Files whose presence makes a folder a workspace project, and so a country. */
export const PROJECT_MARKERS: readonly string[] = [
  'project.json',
  'package.json',
  'pyproject.toml',
];

/**
 * Places every file in a country and a district from the repo's own structure.
 * A country is the deepest folder above the file that holds a project marker;
 * a file above every marker falls to its top-level folder, or to the root.
 * A district is the file's parent folder, relative to its country.
 */
export function placeBlocks(paths: readonly string[], sizes: ReadonlyMap<string, number>): Block[] {
  const projectDirs = new Set<string>();
  for (const path of paths) {
    const slash = path.lastIndexOf('/');
    const name = slash === -1 ? path : path.slice(slash + 1);
    if (PROJECT_MARKERS.includes(name)) {
      projectDirs.add(slash === -1 ? '' : path.slice(0, slash));
    }
  }

  return [...paths].sort().map((id) => {
    const country = countryOf(id, projectDirs);
    const slash = id.lastIndexOf('/');
    const folder = slash === -1 ? '' : id.slice(0, slash);
    const district = country === '' ? folder : folder.slice(country.length).replace(/^\//, '');
    return { id, country, district, size: sizes.get(id) ?? 0 };
  });
}

function countryOf(id: string, projectDirs: ReadonlySet<string>): string {
  let dir = id;
  for (;;) {
    const slash = dir.lastIndexOf('/');
    if (slash === -1) break;
    dir = dir.slice(0, slash);
    if (projectDirs.has(dir)) return dir;
  }
  const top = id.indexOf('/');
  return top === -1 ? '' : id.slice(0, top);
}
