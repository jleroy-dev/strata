import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hookUrl, isStrataUrl, portOf } from '../hooks.js';

export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SessionEnd',
] as const;
export const SHELL_MATCHER = 'Bash';

/**
 * `PreToolUse` carries no matcher, so it fires on every tool a session runs, named or not.
 * `PostToolUse` is narrowed to Bash: it is the only tool whose length is unknown, and a wider
 * matcher would post the contents of every file read back to the server.
 */
const MATCHERS: Partial<Record<(typeof HOOK_EVENTS)[number], string>> = {
  PostToolUse: SHELL_MATCHER,
};

interface HookEntry {
  type?: string;
  url?: string;
  timeout?: number;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

type Groups = Record<string, HookGroup[]>;
type Settings = Record<string, unknown> & { hooks?: Groups };

export function settingsFile(root: string, shared: boolean): string {
  return join(root, '.claude', shared ? 'settings.json' : 'settings.local.json');
}

/** The files that reach a repo, nearest first. */
function settingsFiles(root: string, home: string): string[] {
  return [
    settingsFile(root, false),
    settingsFile(root, true),
    join(home, '.claude', 'settings.json'),
  ];
}

/** Writes strata's hooks into a settings file, replacing any strata hook already there. */
export async function installHooks(file: string, port: number, token: string): Promise<boolean> {
  const settings = await readSettings(file);
  const before = JSON.stringify(settings.hooks ?? {});
  const hooks = withoutStrata(settings.hooks ?? {});
  const url = hookUrl(port, token);
  for (const event of HOOK_EVENTS) {
    const entry: HookEntry = { type: 'http', url, timeout: 2 };
    const matcher = MATCHERS[event];
    const group: HookGroup =
      matcher === undefined ? { hooks: [entry] } : { matcher, hooks: [entry] };
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  if (JSON.stringify(hooks) === before) return false;
  settings.hooks = hooks;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  return true;
}

/** Removes strata's hooks and leaves every other hook, group and setting untouched. */
export async function uninstallHooks(file: string): Promise<boolean> {
  const settings = await readSettings(file);
  if (!settings.hooks) return false;
  const before = JSON.stringify(settings.hooks);
  const hooks = withoutStrata(settings.hooks);
  if (JSON.stringify(hooks) === before) return false;
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  else settings.hooks = hooks;
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  return true;
}

export type HookInstall = 'absent' | 'stale' | 'current';

/** What the settings files carry for a port, against the entries `installHooks` writes. */
export interface HookAudit {
  state: HookInstall;
  /** Events with no strata entry at this port, or one under a different matcher. */
  missing: readonly string[];
  /** Events carrying a strata entry that `installHooks` no longer writes. */
  extra: readonly string[];
}

const matcherFor = (event: (typeof HOOK_EVENTS)[number]): string => MATCHERS[event] ?? '';

/**
 * The strata hooks a repo would fire, read from the three files that reach it and compared to
 * the ones this build installs. A file that was written by an older build is `stale`.
 */
export async function auditHooks(root: string, home: string, port: number): Promise<HookAudit> {
  const found = new Map<string, Set<string>>();
  for (const file of settingsFiles(root, home)) {
    const settings = await readSettings(file);
    for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
      for (const group of groups) {
        const strata = group.hooks.some(
          (hook) =>
            hook.type === 'http' &&
            typeof hook.url === 'string' &&
            isStrataUrl(hook.url) &&
            portOf(hook.url) === port,
        );
        if (!strata) continue;
        const matchers = found.get(event) ?? new Set<string>();
        matchers.add(group.matcher ?? '');
        found.set(event, matchers);
      }
    }
  }
  if (found.size === 0) return { state: 'absent', missing: [...HOOK_EVENTS], extra: [] };
  const missing = HOOK_EVENTS.filter((event) => !found.get(event)?.has(matcherFor(event)));
  const wanted = new Set<string>(HOOK_EVENTS);
  const extra = [...found.keys()].filter((event) => !wanted.has(event));
  return {
    state: missing.length === 0 && extra.length === 0 ? 'current' : 'stale',
    missing,
    extra,
  };
}

function withoutStrata(hooks: Groups): Groups {
  const out: Groups = {};
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups
      .map((group) => ({
        ...group,
        hooks: group.hooks.filter(
          (hook) => !(typeof hook.url === 'string' && isStrataUrl(hook.url)),
        ),
      }))
      .filter((group) => group.hooks.length > 0);
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

async function readSettings(file: string): Promise<Settings> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}
