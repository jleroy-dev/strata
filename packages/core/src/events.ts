/**
 * The one stream the renderer reads. `server` produces these from the file
 * system, git and agent hooks; `web` consumes them and nothing else.
 */

/** Repo-relative POSIX path, the identity of a block. */
export type BlockId = string;

/** A district is the folder a block lives in; a country is the workspace project. */
export interface Block {
  id: BlockId;
  country: string;
  district: string;
  /** Size in bytes; height reads off this. */
  size: number;
}

/** A road is an import resolved inside the repo. Anything outside is not drawn. */
export interface Road {
  from: BlockId;
  to: BlockId;
}

export type TerrainEvent =
  | { kind: 'snapshot'; blocks: Block[]; roads: Road[] }
  | { kind: 'block.added'; block: Block }
  | { kind: 'block.removed'; id: BlockId }
  | { kind: 'block.changed'; id: BlockId; size: number }
  | { kind: 'block.moved'; from: BlockId; to: BlockId }
  | { kind: 'road.added'; road: Road }
  | { kind: 'road.removed'; road: Road };

/** An agent session; the colour of its light is derived from `id`, never chosen. */
export interface Agent {
  id: string;
  label: string;
}

export type WeatherEvent =
  | { kind: 'agent.arrived'; agent: Agent }
  | { kind: 'agent.left'; agentId: string }
  | { kind: 'agent.reading'; agentId: string; id: BlockId }
  | { kind: 'agent.editing'; agentId: string; id: BlockId };

export type StrataEvent = (TerrainEvent | WeatherEvent) & { at: number };
