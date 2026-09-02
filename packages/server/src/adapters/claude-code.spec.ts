import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eventOf, qualify, repoPath, type AgentSignal } from '@strata/core';
import { Mounts } from '../mounts.js';
import { fromClaudeCode } from './claude-code.js';

const ROOT = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'strata-adapter-'));
  mkdirSync(join(dir, '.git'));
  return dir;
})();
const mounts = new Mounts();
const mount = mounts.add(ROOT);
const block = (path: string) => qualify(mount.id, repoPath(path));
const base = { session_id: 's1', cwd: mount.root };
const at = 1_000;
const signalOf = (body: unknown, m: Mounts, when: number): AgentSignal | undefined => {
  const read = fromClaudeCode(body, m, when);
  return 'signal' in read ? read.signal : undefined;
};

describe('fromClaudeCode', () => {
  it('maps the session events', () => {
    expect(signalOf({ ...base, hook_event_name: 'SessionStart' }, mounts, at)).toEqual({
      session: 's1',
      repo: mount.id,
      at,
      kind: 'start',
    });
    expect(signalOf({ ...base, hook_event_name: 'Stop' }, mounts, at)).toMatchObject({
      kind: 'turn-end',
    });
    expect(signalOf({ ...base, hook_event_name: 'SessionEnd' }, mounts, at)).toMatchObject({
      kind: 'end',
    });
  });

  it('maps a prompt and the end of a tool', () => {
    expect(signalOf({ ...base, hook_event_name: 'UserPromptSubmit' }, mounts, at)).toMatchObject({
      kind: 'prompt',
    });
    expect(
      signalOf({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash' }, mounts, at),
    ).toMatchObject({ kind: 'tool-end' });
  });

  it('treats only the notifications that want a human as blocked', () => {
    for (const notification_type of ['permission_prompt', 'agent_needs_input']) {
      expect(
        signalOf({ ...base, hook_event_name: 'Notification', notification_type }, mounts, at),
      ).toMatchObject({ kind: 'blocked' });
    }
    for (const notification_type of ['idle_prompt', 'auth_success', 'agent_completed']) {
      expect(
        signalOf({ ...base, hook_event_name: 'Notification', notification_type }, mounts, at),
      ).toBeUndefined();
    }
    expect(signalOf({ ...base, hook_event_name: 'Notification' }, mounts, at)).toBeUndefined();
  });

  it('keeps nothing the agent said, ran or read', () => {
    const loud = {
      ...base,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'the private thing the user typed',
      transcript_path: '/home/u/.claude/projects/x/y.jsonl',
    };
    const signal = signalOf(loud, mounts, at);
    expect(JSON.stringify(signal)).not.toContain('private');
    expect(JSON.stringify(signal)).not.toContain('jsonl');

    const shell = signalOf(
      {
        ...base,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'cat /etc/passwd' },
        tool_response: 'root:x:0:0',
      },
      mounts,
      at,
    );
    expect(JSON.stringify(shell)).not.toContain('passwd');
    expect(JSON.stringify(shell)).not.toContain('root:x');
  });

  it('lights a block for a tool inside the repo and keeps the verb outside it', () => {
    expect(
      signalOf(
        {
          ...base,
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          tool_input: { file_path: join(mount.root, 'src/a.ts') },
        },
        mounts,
        at,
      ),
    ).toMatchObject({ kind: 'tool', tool: 'edit', path: block('src/a.ts') });
    expect(
      signalOf(
        {
          ...base,
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: '/elsewhere/a.ts' },
        },
        mounts,
        at,
      ),
    ).toEqual({ session: 's1', repo: mount.id, at, kind: 'tool', tool: 'read' });
  });

  it('stands a shell command on the first file it names inside the repo', () => {
    mkdirSync(join(mount.root, 'src'), { recursive: true });
    writeFileSync(join(mount.root, 'src/a.ts'), 'export {};\n');
    const shell = (command: string): AgentSignal | undefined =>
      signalOf(
        { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } },
        mounts,
        at,
      );
    expect(shell('sed -n 1,5p src/a.ts')).toMatchObject({ tool: 'shell', path: block('src/a.ts') });
    expect(shell(`cat ${join(mount.root, 'src/a.ts')}`)).toMatchObject({
      path: block('src/a.ts'),
    });
    expect(shell('npm run gate')).toEqual({
      session: 's1',
      repo: mount.id,
      at,
      kind: 'tool',
      tool: 'shell',
    });
    expect(shell('ls src')).not.toHaveProperty('path');
    expect(shell('cat /elsewhere/a.ts')).not.toHaveProperty('path');
  });

  it('reports a tool it cannot name as work without a place', () => {
    for (const tool_name of ['mcp__playwright__browser_evaluate', 'WebSearch', 'Task']) {
      expect(signalOf({ ...base, hook_event_name: 'PreToolUse', tool_name }, mounts, at)).toEqual({
        session: 's1',
        repo: mount.id,
        at,
        kind: 'tool',
        tool: 'other',
      });
    }
  });

  it('keeps nothing an unnamed tool was handed', () => {
    const signal = signalOf(
      {
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__playwright__browser_type',
        tool_input: {
          selector: '#password',
          text: 'the private thing the user typed',
          code: 'await page.evaluate(() => document.cookie)',
        },
      },
      mounts,
      at,
    );
    const written = JSON.stringify(signal);
    expect(written).not.toContain('private');
    expect(written).not.toContain('cookie');
    expect(written).not.toContain('password');
  });

  it('gives every tool a verb, named or not', () => {
    const names = [
      'Read',
      'Edit',
      'Write',
      'MultiEdit',
      'NotebookEdit',
      'Bash',
      'Task',
      'Glob',
      'Grep',
      'WebFetch',
      'TodoWrite',
      'ToolSearch',
      'Skill',
      'mcp__playwright__browser_click',
    ];
    for (const tool_name of names) {
      const signal = signalOf({ ...base, hook_event_name: 'PreToolUse', tool_name }, mounts, at);
      expect(signal, tool_name).toBeDefined();
      if (!signal) continue;
      expect(
        eventOf(signal, () => false),
        tool_name,
      ).toBeDefined();
    }
  });

  it('drops a payload from another repo and one with no session', () => {
    expect(
      signalOf({ ...base, cwd: '/nowhere-at-all', hook_event_name: 'Stop' }, mounts, at),
    ).toBeUndefined();
    expect(signalOf({ cwd: ROOT, hook_event_name: 'Stop' }, mounts, at)).toBeUndefined();
    expect(signalOf('nonsense', mounts, at)).toBeUndefined();
  });

  it('ignores events it has no word for', () => {
    expect(signalOf({ ...base, hook_event_name: 'PreCompact' }, mounts, at)).toBeUndefined();
  });
});

describe('fromClaudeCode drop reasons', () => {
  const reason = (body: unknown): string | undefined => {
    const read = fromClaudeCode(body, mounts, at);
    return 'dropped' in read ? read.dropped : undefined;
  };

  it('separates a payload it cannot read from one it chooses to ignore', () => {
    expect(reason('nonsense')).toBe('malformed');
    expect(reason({ cwd: ROOT, hook_event_name: 'Stop' })).toBe('no-session');
    expect(reason({ ...base, cwd: '/nowhere-at-all', hook_event_name: 'Stop' })).toBe(
      'unknown-repo',
    );
    expect(reason({ ...base, hook_event_name: 'PreCompact' })).toBe('unknown-event');
    expect(
      reason({ ...base, hook_event_name: 'Notification', notification_type: 'idle_prompt' }),
    ).toBe('ignored');
  });

  it('reads a payload it understands', () => {
    expect(reason({ ...base, hook_event_name: 'Stop' })).toBeUndefined();
  });
});
