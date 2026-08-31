import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const HOOK_PATH = '/hook';

export function tokenFile(home: string): string {
  return join(home, '.strata', 'token');
}

/** The machine's hook token, minted on first use and readable only by its owner. */
export async function readToken(home: string): Promise<string> {
  const file = tokenFile(home);
  try {
    const existing = (await readFile(file, 'utf8')).trim();
    if (existing !== '') return existing;
  } catch {
    // no token yet
  }
  const token = randomBytes(24).toString('hex');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function hookUrl(port: number, token: string): string {
  return `http://127.0.0.1:${String(port)}${HOOK_PATH}?t=${token}`;
}

/** A strata hook at any port and any token, which is what makes install and uninstall total. */
export function isStrataUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === '127.0.0.1' && parsed.pathname === HOOK_PATH;
  } catch {
    return false;
  }
}

export function portOf(url: string): number | undefined {
  try {
    return Number(new URL(url).port);
  } catch {
    return undefined;
  }
}
