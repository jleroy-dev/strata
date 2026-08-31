import { qualify, repoId, repoPath, type BlockId, type RepoPath } from '../qualified.js';

export const REPO = repoId('repo');

/** A block id in the fixture repo, for specs that only care about one. */
export const at = (path: string): BlockId => qualify(REPO, repoPath(path));

export const p = (path: string): RepoPath => repoPath(path);

export const listing = <T>(entries: readonly (readonly [string, T])[]): Map<RepoPath, T> =>
  new Map(entries.map(([path, value]) => [repoPath(path), value]));
