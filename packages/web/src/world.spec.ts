import { describe, expect, it } from 'vitest';
import { blockId, hookStateOf, repoId, type StrataEvent } from '@strata/core';
import { emptyWorld, fold, type Folded } from './world.js';

const base = (): Folded => ({
  renames: new Map(),
  folders: new Map(),
  hooks: new Map(),
  mounts: [],
  connected: true,
  lastFrameAt: 0,
});

const snapshot = (root: string): StrataEvent => ({
  kind: 'snapshot',
  mounts: [{ id: repoId('repo'), root }],
  at: 10,
});

describe('fold', () => {
  it('takes the mounts and a history from a snapshot', () => {
    const state = fold(base(), snapshot('/repo'));
    expect(state.mounts).toEqual([{ id: 'repo', root: '/repo' }]);
    expect(state.history).toBeDefined();
    expect(state.lastFrameAt).toBe(10);
  });

  it('records the hook state of each repo as it arrives', () => {
    let state = fold(base(), { kind: 'hook.state', repo: repoId('a'), state: 'no-hook', at: 1 });
    expect(hookStateOf(state.hooks)).toBe('no-hook');
    state = fold(state, { kind: 'hook.state', repo: repoId('b'), state: 'heard', at: 2 });
    expect(state.hooks.get(repoId('a'))).toBe('no-hook');
    expect(hookStateOf(state.hooks)).toBe('heard');
  });

  it('drops the hook state of a repo that is no longer mounted', () => {
    let state = fold(base(), { kind: 'hook.state', repo: repoId('gone'), state: 'heard', at: 1 });
    state = fold(state, snapshot('/repo'));
    expect(state.hooks.size).toBe(0);
    state = fold(state, { kind: 'hook.state', repo: repoId('repo'), state: 'no-hook', at: 11 });
    expect(hookStateOf(state.hooks)).toBe('no-hook');
  });

  it('remembers a rename until the frame reads it', () => {
    const state = fold(fold(base(), snapshot('/repo')), {
      kind: 'block.moved',
      from: blockId('repo:a.ts'),
      block: { id: blockId('repo:b.ts'), country: '', district: '', size: 1 },
      placement: { cell: { x: 0, z: 0 }, country: '', district: '' },
      at: 20,
    } as unknown as StrataEvent);
    expect(state.renames.get(blockId('repo:b.ts'))).toBe(blockId('repo:a.ts'));
  });

  it('remembers a folder move', () => {
    const state = fold(fold(base(), snapshot('/repo')), {
      kind: 'folder.moved',
      from: 'src/old',
      to: 'src/new',
      at: 30,
    });
    expect(state.folders.get('src/old')).toBe('src/new');
  });

  it('starts empty', () => {
    expect(emptyWorld().layout.blocks.size).toBe(0);
    expect(emptyWorld().sessions.size).toBe(0);
  });
});
