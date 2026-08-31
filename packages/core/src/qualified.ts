declare const tag: unique symbol;

/** A mounted repo, named by the directory it lives in. */
export type RepoId = string & { readonly [tag]: 'repo' };

/** A POSIX path inside one repo, with no repo of its own. */
export type RepoPath = string & { readonly [tag]: 'path' };

/** A repo and a path, the identity of a block wherever it is drawn. */
export type BlockId = string & { readonly [tag]: 'block' };

export const SEPARATOR = ':';

export function repoId(name: string): RepoId {
  if (name === '' || name.includes(SEPARATOR)) {
    throw new Error(`strata: a repo id cannot be empty or contain "${SEPARATOR}": ${name}`);
  }
  return name as RepoId;
}

export const repoPath = (path: string): RepoPath => path as RepoPath;

/** Trusts a string that already carries a repo, for reading one back off the wire. */
export const blockId = (raw: string): BlockId => raw as BlockId;

export const qualify = (repo: RepoId, path: RepoPath): BlockId =>
  `${repo}${SEPARATOR}${path}` as BlockId;

export const repoOf = (id: BlockId): RepoId => id.slice(0, id.indexOf(SEPARATOR)) as RepoId;

export const pathOf = (id: BlockId): RepoPath => id.slice(id.indexOf(SEPARATOR) + 1) as RepoPath;

/** The path part of any `repo:path` value, for qualified names that are not block ids. */
export const withoutRepo = (value: string): string => value.slice(value.indexOf(SEPARATOR) + 1);

/** The repo part of any `repo:path` value, for qualified names that are not block ids. */
export const repoOfName = (value: string): RepoId =>
  value.slice(0, value.indexOf(SEPARATOR)) as RepoId;
