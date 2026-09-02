import { statSync } from 'node:fs';
import type { AgentSignal, BlockId } from '@strata/core';
import type { Mounts } from '../mounts.js';
import { shellPaths } from './shell-paths.js';

const READ_TOOLS = new Set(['Read']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash']);
const BLOCKING_NOTIFICATIONS = new Set(['permission_prompt', 'agent_needs_input']);

/**
 * Why a payload produced no signal. `ignored` is a choice and the rest are failures to read,
 * which is why they are counted apart.
 */
export type DropReason = 'malformed' | 'no-session' | 'unknown-repo' | 'unknown-event' | 'ignored';

export type Read = { signal: AgentSignal } | { dropped: DropReason };

interface HookPayload {
  session_id?: unknown;
  cwd?: unknown;
  hook_event_name?: unknown;
  notification_type?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
}

const fileAt = (absolute: string): boolean => {
  try {
    return statSync(absolute).isFile();
  } catch {
    return false;
  }
};

/** Turns one Claude Code hook payload into a signal, or says why it carries none. */
export function fromClaudeCode(
  body: unknown,
  mounts: Mounts,
  at: number,
  isFile: (absolute: string) => boolean = fileAt,
): Read {
  if (typeof body !== 'object' || body === null) return { dropped: 'malformed' };
  const p = body as HookPayload;
  if (typeof p.session_id !== 'string' || typeof p.cwd !== 'string') {
    return { dropped: 'no-session' };
  }
  const mount = mounts.repoAt(p.cwd);
  if (!mount) return { dropped: 'unknown-repo' };
  const session = p.session_id;
  const repo = mount.id;
  switch (p.hook_event_name) {
    case 'SessionStart':
      return { signal: { session, repo, at, kind: 'start' } };
    case 'UserPromptSubmit':
      return { signal: { session, repo, at, kind: 'prompt' } };
    case 'PostToolUse':
      return { signal: { session, repo, at, kind: 'tool-end' } };
    case 'Notification':
      return typeof p.notification_type === 'string' &&
        BLOCKING_NOTIFICATIONS.has(p.notification_type)
        ? { signal: { session, repo, at, kind: 'blocked' } }
        : { dropped: 'ignored' };
    case 'Stop':
      return { signal: { session, repo, at, kind: 'turn-end' } };
    case 'SessionEnd':
      return { signal: { session, repo, at, kind: 'end' } };
    case 'PreToolUse': {
      const name = typeof p.tool_name === 'string' ? p.tool_name : '';
      const tool = READ_TOOLS.has(name)
        ? 'read'
        : EDIT_TOOLS.has(name)
          ? 'edit'
          : SHELL_TOOLS.has(name)
            ? 'shell'
            : 'other';
      const path =
        blockOf(p.tool_input, mounts, mount) ??
        (tool === 'shell' ? shellBlock(p.tool_input, p.cwd, mounts, mount, isFile) : undefined);
      return {
        signal: { session, repo, at, kind: 'tool', tool, ...(path !== undefined && { path }) },
      };
    }
    default:
      return { dropped: 'unknown-event' };
  }
}

function shellBlock(
  input: unknown,
  cwd: string,
  mounts: Mounts,
  mount: Parameters<Mounts['blockAt']>[0],
  isFile: (absolute: string) => boolean,
): BlockId | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const command = (input as { command?: unknown }).command;
  if (typeof command !== 'string') return undefined;
  for (const absolute of shellPaths(command, cwd, isFile)) {
    const id = mounts.blockAt(mount, absolute);
    if (id !== undefined) return id;
  }
  return undefined;
}

function blockOf(
  input: unknown,
  mounts: Mounts,
  mount: Parameters<Mounts['blockAt']>[0],
): BlockId | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = (input as { file_path?: unknown }).file_path;
  if (typeof raw !== 'string') return undefined;
  return mounts.blockAt(mount, raw);
}
