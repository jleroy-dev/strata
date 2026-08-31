import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hookUrl, isStrataUrl, portOf, readToken } from './hooks.js';

let home: string;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'strata-token-'));
  home = join(dir, 'home');
  await mkdir(join(home, '.claude'), { recursive: true });
});

describe('readToken', () => {
  it('mints one token and then returns the same one', async () => {
    const first = await readToken(home);
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(await readToken(home)).toBe(first);
  });
});

describe('isStrataUrl', () => {
  it('matches strata at any port and nothing else', () => {
    expect(isStrataUrl('http://127.0.0.1:4747/hook?t=x')).toBe(true);
    expect(isStrataUrl('http://127.0.0.1:9999/hook')).toBe(true);
    expect(isStrataUrl('http://127.0.0.1:4747/dev/add')).toBe(false);
    expect(isStrataUrl('https://example.com/hook')).toBe(false);
    expect(isStrataUrl('not a url')).toBe(false);
  });

  it('reads the port back out of a url it minted', () => {
    expect(portOf(hookUrl(4747, 'abc'))).toBe(4747);
    expect(portOf('not a url')).toBeUndefined();
  });
});
