import { describe, expect, it } from 'vitest';
import { isBinary } from './binary.js';
import { MAX_HEIGHT, SLAB_HEIGHT, heightOf } from './height.js';

describe('isBinary', () => {
  it('reads the last extension, case-insensitively', () => {
    expect(isBinary('assets/logo.PNG')).toBe(true);
    expect(isBinary('fonts/inter.woff2')).toBe(true);
    expect(isBinary('src/main.ts')).toBe(false);
    expect(isBinary('archive.tar.gz')).toBe(true);
  });

  it('treats dotfiles and extensionless files as text', () => {
    expect(isBinary('.gitignore')).toBe(false);
    expect(isBinary('LICENSE')).toBe(false);
    expect(isBinary('dir.png/notes')).toBe(false);
  });
});

describe('heightOf', () => {
  it('gives a binary the slab height whatever its size', () => {
    expect(heightOf('a.png', 5_000_000)).toBe(SLAB_HEIGHT);
  });

  it('grows with text size and caps', () => {
    expect(heightOf('a.ts', 0)).toBe(SLAB_HEIGHT);
    expect(heightOf('a.ts', 400)).toBeGreaterThan(heightOf('a.ts', 100));
    expect(heightOf('a.ts', 1e9)).toBe(MAX_HEIGHT);
  });
});
