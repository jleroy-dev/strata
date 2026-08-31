import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { qualify, repoPath } from '@strata/core';
import { Mounts } from './mounts.js';

let dir: string;

function repo(name: string): string {
  const root = join(dir, name);
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}\n');
  return root;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'strata-mounts-'));
});

describe('Mounts', () => {
  it('names a repo after its directory and resolves the real path', () => {
    const mounts = new Mounts();
    const mount = mounts.add(repo('QuartzX.Web2'));
    expect(mount.id).toBe('QuartzX.Web2');
    expect(mounts.rootOf(mount.id)).toBe(mount.root);
    expect(mounts.all).toEqual([mount]);
  });

  it('refuses a path that is missing or is not a repo', () => {
    const mounts = new Mounts();
    expect(() => mounts.add(join(dir, 'nowhere'))).toThrow(/does not exist/);
    mkdirSync(join(dir, 'plain'));
    expect(() => mounts.add(join(dir, 'plain'))).toThrow(/not a git repository/);
  });

  it('refuses two repos that would answer to the same name', () => {
    const mounts = new Mounts();
    mounts.add(repo('web'));
    mkdirSync(join(dir, 'nested'));
    const twin = join(dir, 'nested', 'web');
    mkdirSync(join(twin, '.git'), { recursive: true });
    expect(() => mounts.add(twin)).toThrow(/both called web/);
  });

  it('is idempotent for the same repo', () => {
    const mounts = new Mounts();
    const root = repo('web');
    expect(mounts.add(root)).toEqual(mounts.add(root));
    expect(mounts.all).toHaveLength(1);
  });

  it('finds the repo a working directory belongs to, and nothing outside', () => {
    const mounts = new Mounts();
    const mount = mounts.add(repo('web'));
    expect(mounts.repoAt(mount.root)?.id).toBe(mount.id);
    expect(mounts.repoAt(join(mount.root, 'src', 'deep'))?.id).toBe(mount.id);
    expect(mounts.repoAt(join(dir, 'elsewhere'))).toBeUndefined();
  });

  it('turns a file inside a mount into a block, and refuses one outside', () => {
    const mounts = new Mounts();
    const mount = mounts.add(repo('web'));
    expect(mounts.blockAt(mount, join(mount.root, 'src/a.ts'))).toBe(
      qualify(mount.id, repoPath('src/a.ts')),
    );
    expect(mounts.blockAt(mount, join(dir, 'outside.ts'))).toBeUndefined();
  });

  it('is the one place a block becomes a path on disk', () => {
    const mounts = new Mounts();
    const mount = mounts.add(repo('web'));
    const id = qualify(mount.id, repoPath('src/a.ts'));
    expect(mounts.fileOf(id, repoPath('src/a.ts'))).toBe(join(mount.root, 'src/a.ts'));
  });
});
