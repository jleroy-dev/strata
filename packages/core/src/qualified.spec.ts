import { describe, expect, it } from 'vitest';
import {
  SEPARATOR,
  blockId,
  pathOf,
  qualify,
  repoId,
  repoOf,
  repoPath,
  withoutRepo,
} from './qualified.js';

describe('qualified ids', () => {
  it('round trips a repo and a path', () => {
    const id = qualify(repoId('QuartzX.Web2'), repoPath('apps/ui/src/a.ts'));
    expect(id).toBe('QuartzX.Web2:apps/ui/src/a.ts');
    expect(repoOf(id)).toBe('QuartzX.Web2');
    expect(pathOf(id)).toBe('apps/ui/src/a.ts');
  });

  it('splits on the first separator, so a path may contain one', () => {
    const id = qualify(repoId('repo'), repoPath('weird:name/a.ts'));
    expect(repoOf(id)).toBe('repo');
    expect(pathOf(id)).toBe('weird:name/a.ts');
  });

  it('refuses a repo id that would make the split ambiguous', () => {
    expect(() => repoId(`a${SEPARATOR}b`)).toThrow();
    expect(() => repoId('')).toThrow();
  });

  it('keeps a file at the repo root qualified rather than bare', () => {
    const id = qualify(repoId('repo'), repoPath('README.md'));
    expect(pathOf(id)).toBe('README.md');
    expect(id).not.toBe('README.md');
  });

  it('keeps two repos apart for identical paths', () => {
    const a = qualify(repoId('one'), repoPath('src/index.ts'));
    const b = qualify(repoId('two'), repoPath('src/index.ts'));
    expect(a).not.toBe(b);
    expect(pathOf(a)).toBe(pathOf(b));
  });

  it('reads a qualified name back off the wire unchanged', () => {
    const id = qualify(repoId('repo'), repoPath('src/a.ts'));
    expect(blockId(JSON.parse(JSON.stringify(id)) as string)).toBe(id);
  });

  it('strips the repo from any qualified name, and leaves a bare one alone', () => {
    expect(withoutRepo('repo:apps/ui')).toBe('apps/ui');
    expect(withoutRepo('apps/ui')).toBe('apps/ui');
  });

  it('leaves basename and dirname arithmetic working', () => {
    const id = qualify(repoId('repo'), repoPath('a/b/c.ts'));
    expect(id.slice(id.lastIndexOf('/') + 1)).toBe('c.ts');
    expect(id.slice(0, id.lastIndexOf('/'))).toBe('repo:a/b');
  });
});
