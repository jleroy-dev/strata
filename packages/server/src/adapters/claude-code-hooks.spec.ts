import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hookUrl } from '../hooks.js';
import {
  HOOK_EVENTS,
  auditHooks,
  installHooks,
  settingsFile,
  uninstallHooks,
} from './claude-code-hooks.js';

const TOKEN = 'a'.repeat(48);

let home: string;
let root: string;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'strata-hooks-'));
  home = join(dir, 'home');
  root = join(dir, 'repo');
  await mkdir(join(home, '.claude'), { recursive: true });
  await mkdir(join(root, '.claude'), { recursive: true });
});

const read = async (file: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

const urls = (settings: Record<string, unknown>): string[] =>
  Object.values((settings.hooks ?? {}) as Record<string, { hooks: { url?: string }[] }[]>)
    .flat()
    .flatMap((group) => group.hooks.map((hook) => hook.url ?? ''));

describe('installHooks', () => {
  it('writes one tokenised entry per event', async () => {
    const file = settingsFile(root, false);
    expect(await installHooks(file, 4747, TOKEN)).toBe(true);
    const settings = await read(file);
    expect(Object.keys(settings.hooks as object)).toEqual([...HOOK_EVENTS]);
    expect(urls(settings)).toEqual(HOOK_EVENTS.map(() => hookUrl(4747, TOKEN)));
  });

  it('is idempotent, and replaces rather than appends when the port or token changes', async () => {
    const file = settingsFile(root, false);
    await installHooks(file, 4747, TOKEN);
    expect(await installHooks(file, 4747, TOKEN)).toBe(false);
    expect(await installHooks(file, 4748, TOKEN)).toBe(true);
    const settings = await read(file);
    expect(urls(settings)).toEqual(HOOK_EVENTS.map(() => hookUrl(4748, TOKEN)));
  });

  it('leaves other hooks and other settings alone', async () => {
    const file = settingsFile(root, false);
    await writeFile(
      file,
      JSON.stringify({
        permissions: { allow: ['Bash(ls:*)'] },
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'notify.sh' }] }],
          Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'ping.sh' }] }],
        },
      }),
    );
    await installHooks(file, 4747, TOKEN);
    const settings = await read(file);
    expect(settings.permissions).toEqual({ allow: ['Bash(ls:*)'] });
    expect(urls(settings)).toContain('');
    const hooks = settings.hooks as Record<string, { hooks: { command?: string }[] }[]>;
    expect(hooks.Notification?.[0]?.hooks[0]?.command).toBe('ping.sh');
    expect(hooks.SessionStart?.[0]?.hooks[0]?.command).toBe('notify.sh');
    expect(hooks.SessionStart).toHaveLength(2);
  });
});

describe('uninstallHooks', () => {
  it('removes every strata entry and nothing else', async () => {
    const file = settingsFile(root, false);
    await writeFile(
      file,
      JSON.stringify({
        outputStyle: 'default',
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'notify.sh' }] }] },
      }),
    );
    await installHooks(file, 4747, TOKEN);
    expect(await uninstallHooks(file)).toBe(true);
    const settings = await read(file);
    expect(settings.outputStyle).toBe('default');
    expect(urls(settings)).toEqual(['']);
    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(Object.keys(hooks)).toEqual(['SessionStart']);
  });

  it('drops the hooks key when strata was all there was, and is a no-op otherwise', async () => {
    const file = settingsFile(root, false);
    expect(await uninstallHooks(file)).toBe(false);
    await installHooks(file, 4747, TOKEN);
    expect(await uninstallHooks(file)).toBe(true);
    expect(await read(file)).not.toHaveProperty('hooks');
    expect(await uninstallHooks(file)).toBe(false);
  });
});

describe('auditHooks', () => {
  const project = (): string => settingsFile(root, false);
  const shared = (): string => join(home, '.claude', 'settings.json');
  const rewrite = async (file: string, settings: Record<string, unknown>): Promise<void> =>
    writeFile(file, JSON.stringify(settings));

  it('reports nothing installed, here or at another port', async () => {
    expect(await auditHooks(root, home, 4747)).toMatchObject({ state: 'absent' });
    await installHooks(project(), 4747, TOKEN);
    expect(await auditHooks(root, home, 4748)).toMatchObject({ state: 'absent' });
  });

  it('reports what this build writes as current, in the project or the home file', async () => {
    await installHooks(project(), 4747, TOKEN);
    expect(await auditHooks(root, home, 4747)).toEqual({
      state: 'current',
      missing: [],
      extra: [],
    });
    await uninstallHooks(project());
    await installHooks(shared(), 4747, TOKEN);
    expect(await auditHooks(root, home, 4747)).toMatchObject({ state: 'current' });
  });

  it('names the events an older install never wrote', async () => {
    await installHooks(project(), 4747, TOKEN);
    const settings = await read(project());
    const hooks = settings.hooks as Record<string, unknown>;
    delete hooks.UserPromptSubmit;
    delete hooks.Notification;
    await rewrite(project(), settings);
    expect(await auditHooks(root, home, 4747)).toEqual({
      state: 'stale',
      missing: ['UserPromptSubmit', 'Notification'],
      extra: [],
    });
  });

  it('counts a changed matcher as drift', async () => {
    await installHooks(project(), 4747, TOKEN);
    const settings = await read(project());
    const hooks = settings.hooks as Record<string, { matcher?: string }[]>;
    const group = hooks.PreToolUse?.[0];
    if (group) group.matcher = 'Read';
    await rewrite(project(), settings);
    expect(await auditHooks(root, home, 4747)).toMatchObject({
      state: 'stale',
      missing: ['PreToolUse'],
    });
  });

  it('counts a strata entry this build no longer writes as drift', async () => {
    await installHooks(project(), 4747, TOKEN);
    const settings = await read(project());
    const hooks = settings.hooks as Record<string, unknown>;
    hooks.PreCompact = [{ hooks: [{ type: 'http', url: hookUrl(4747, TOKEN), timeout: 2 }] }];
    await rewrite(project(), settings);
    expect(await auditHooks(root, home, 4747)).toMatchObject({
      state: 'stale',
      missing: [],
      extra: ['PreCompact'],
    });
  });

  it('takes the union of the files that reach the repo', async () => {
    await installHooks(project(), 4747, TOKEN);
    const settings = await read(project());
    const hooks = settings.hooks as Record<string, unknown>;
    const stop = hooks.Stop;
    delete hooks.Stop;
    await rewrite(project(), settings);
    expect(await auditHooks(root, home, 4747)).toMatchObject({
      state: 'stale',
      missing: ['Stop'],
    });
    await rewrite(shared(), { hooks: { Stop: stop } });
    expect(await auditHooks(root, home, 4747)).toMatchObject({ state: 'current' });
  });

  it('reads past a hook that is not strata', async () => {
    await rewrite(project(), {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify.sh' }] }] },
    });
    expect(await auditHooks(root, home, 4747)).toMatchObject({ state: 'absent' });
  });
});
