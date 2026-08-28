/** A vendor-neutral report from an agent; adapters in the server produce these. */
export interface AgentSignal {
  session: string;
  at: number;
  kind: 'start' | 'tool' | 'turn-end' | 'end';
  tool?: 'read' | 'edit' | 'shell' | 'other';
  /** Repo-relative path the tool targets, when it has one. */
  path?: string;
}
