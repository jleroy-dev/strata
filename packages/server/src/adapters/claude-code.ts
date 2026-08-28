import { relative, resolve, sep } from 'node:path';
import type { AgentSignal } from '@strata/core';

const READ_TOOLS = new Set(['Read']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash']);

interface HookPayload {
  session_id?: unknown;
  cwd?: unknown;
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
}

/** Turns one Claude Code hook payload into a signal, or nothing when it is not about `root`. */
export function fromClaudeCode(body: unknown, root: string, at: number): AgentSignal | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const p = body as HookPayload;
  if (typeof p.session_id !== 'string' || typeof p.cwd !== 'string') return undefined;
  if (!within(root, p.cwd) && !within(p.cwd, root)) return undefined;
  const session = p.session_id;
  switch (p.hook_event_name) {
    case 'SessionStart':
      return { session, at, kind: 'start' };
    case 'Stop':
      return { session, at, kind: 'turn-end' };
    case 'SessionEnd':
      return { session, at, kind: 'end' };
    case 'PreToolUse': {
      const name = typeof p.tool_name === 'string' ? p.tool_name : '';
      const tool = READ_TOOLS.has(name)
        ? 'read'
        : EDIT_TOOLS.has(name)
          ? 'edit'
          : SHELL_TOOLS.has(name)
            ? 'shell'
            : 'other';
      const path = filePath(p.tool_input, root);
      return { session, at, kind: 'tool', tool, ...(path !== undefined && { path }) };
    }
    default:
      return undefined;
  }
}

function filePath(input: unknown, root: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = (input as { file_path?: unknown }).file_path;
  if (typeof raw !== 'string') return undefined;
  const abs = resolve(root, raw);
  if (!within(root, abs)) return undefined;
  return relative(root, abs).split(sep).join('/');
}

function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
}
