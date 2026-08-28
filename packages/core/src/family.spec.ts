import { describe, expect, it } from 'vitest';
import { familyOf, familyRank } from './family.js';

describe('familyOf', () => {
  it('reads the top-level folder', () => {
    expect(familyOf('apps/api')).toBe('apps');
    expect(familyOf('libs/shared/ui')).toBe('libs');
    expect(familyOf('packages/core')).toBe('libs');
    expect(familyOf('docs')).toBe('docs');
    expect(familyOf('kanban')).toBe('docs');
  });

  it('sends the root, dot-folders and tooling to plumbing', () => {
    expect(familyOf('')).toBe('plumbing');
    expect(familyOf('.github')).toBe('plumbing');
    expect(familyOf('tools')).toBe('plumbing');
  });

  it('ranks apps before libs before docs before plumbing', () => {
    expect(familyRank('apps')).toBeLessThan(familyRank('libs'));
    expect(familyRank('libs')).toBeLessThan(familyRank('docs'));
    expect(familyRank('docs')).toBeLessThan(familyRank('plumbing'));
  });
});
