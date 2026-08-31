import type { BlockId, RepoId } from './qualified.js';

/** A vendor-neutral report from an agent; adapters in the server produce these. */
export interface AgentSignal {
  session: string;
  repo: RepoId;
  at: number;
  kind: SignalKind;
  /** Which family the tool belongs to; `other` is one this build has no name for. */
  tool?: 'read' | 'edit' | 'shell' | 'other';
  /** The block the tool targets, already carrying its repo, when it has one. */
  path?: BlockId;
}

/**
 * `prompt` is the user speaking to the agent, `tool-end` a tool finishing, `blocked` a human
 * decision the agent is stuck on. None of them carry what was said, run or asked.
 */
export type SignalKind = 'start' | 'prompt' | 'tool' | 'tool-end' | 'blocked' | 'turn-end' | 'end';
