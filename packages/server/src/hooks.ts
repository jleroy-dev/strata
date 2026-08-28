import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const HOOK_PATH = '/hook';
export const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'Stop', 'SessionEnd'] as const;
export const TOOL_MATCHER = 'Read|Edit|Write|MultiEdit|NotebookEdit|Bash';

interface HookEntry {
  type: 'http';
  url: string;
  timeout: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

type Settings = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> };

export function hookUrl(port: number): string {
  return `http://127.0.0.1:${String(port)}${HOOK_PATH}`;
}

export function settingsFile(root: string, shared: boolean): string {
  return join(root, '.claude', shared ? 'settings.json' : 'settings.local.json');
}

/** Adds the strata http hooks to a settings file, leaving everything else as it was. */
export async function installHooks(file: string, port: number): Promise<boolean> {
  const settings = await readSettings(file);
  const url = hookUrl(port);
  const hooks = settings.hooks ?? {};
  let changed = false;
  for (const event of HOOK_EVENTS) {
    const groups = hooks[event] ?? [];
    if (groups.some((g) => g.hooks.some((h) => h.url === url))) continue;
    const entry: HookEntry = { type: 'http', url, timeout: 2 };
    groups.push(
      event === 'PreToolUse' ? { matcher: TOOL_MATCHER, hooks: [entry] } : { hooks: [entry] },
    );
    hooks[event] = groups;
    changed = true;
  }
  if (!changed) return false;
  settings.hooks = hooks;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  return true;
}

/** True when any of the settings files carries a strata hook for this port. */
export async function hooksInstalled(root: string, home: string, port: number): Promise<boolean> {
  const url = hookUrl(port);
  const files = [
    settingsFile(root, false),
    settingsFile(root, true),
    join(home, '.claude', 'settings.json'),
  ];
  for (const file of files) {
    const settings = await readSettings(file);
    const groups = Object.values(settings.hooks ?? {}).flat();
    if (groups.some((g) => g.hooks.some((h) => h.url === url))) return true;
  }
  return false;
}

async function readSettings(file: string): Promise<Settings> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}
