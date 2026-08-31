import { existsSync, realpathSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import {
  qualify,
  repoId,
  repoOf,
  repoPath,
  type BlockId,
  type Mount,
  type RepoId,
  type RepoPath,
} from '@strata/core';

/** Every repo the server watches, and the one place a block id becomes a path on disk. */
export class Mounts {
  private readonly byId = new Map<RepoId, string>();

  add(given: string): Mount {
    if (!existsSync(given)) throw new Error(`strata: ${given} does not exist`);
    const root = realpathSync(given);
    if (!existsSync(join(root, '.git'))) throw new Error(`strata: ${root} is not a git repository`);
    const id = repoId(basename(root));
    const taken = this.byId.get(id);
    if (taken !== undefined && taken !== root) {
      throw new Error(`strata: two repos both called ${id}: ${taken} and ${root}`);
    }
    this.byId.set(id, root);
    return { id, root };
  }

  get all(): Mount[] {
    return [...this.byId].map(([id, root]) => ({ id, root }));
  }

  rootOf(id: RepoId): string | undefined {
    return this.byId.get(id);
  }

  /** The repo a working directory belongs to, by containment either way. */
  repoAt(cwd: string): Mount | undefined {
    for (const [id, root] of this.byId) {
      if (within(root, cwd) || within(cwd, root)) return { id, root };
    }
    return undefined;
  }

  /** An absolute path for a block, or nothing when its repo is not mounted. */
  fileOf(id: BlockId, path: RepoPath): string | undefined {
    const root = this.byId.get(repoOf(id));
    return root === undefined ? undefined : resolve(root, path);
  }

  /** A path inside `mount`, or nothing when it points outside. */
  blockAt(mount: Mount, absolute: string): BlockId | undefined {
    const rel = relative(mount.root, absolute);
    if (rel === '' || rel.startsWith('..') || rel.startsWith(sep)) return undefined;
    return qualify(mount.id, repoPath(rel.split(sep).join('/')));
  }
}

export function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
}
