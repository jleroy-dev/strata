/**
 * The one stream the renderer reads. `server` produces these from the file
 * system, git and agent hooks; `web` consumes them and nothing else.
 */

import type {
  CountryPlate,
  DistrictPlate,
  Placement,
  RepackScope,
  SerializedLayout,
} from './layout.js';
import type { Extent } from './shelf.js';

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

/** A structural change as the file system reports it, before the layout has placed it. */
export type TerrainChange =
  | { kind: 'block.added'; block: Block }
  | { kind: 'block.removed'; id: BlockId }
  | { kind: 'block.changed'; id: BlockId; size: number }
  | { kind: 'block.moved'; from: BlockId; block: Block }
  | { kind: 'folder.moved'; from: string; to: string };

export type TerrainEvent =
  | { kind: 'snapshot'; root: string; roads: Road[]; layout: SerializedLayout }
  | { kind: 'block.added'; block: Block; placement: Placement }
  | { kind: 'block.removed'; id: BlockId }
  | { kind: 'block.changed'; id: BlockId; size: number; placement: Placement }
  | { kind: 'block.moved'; from: BlockId; block: Block; placement: Placement }
  | { kind: 'folder.moved'; from: string; to: string }
  | {
      kind: 'layout.repacked';
      scope: RepackScope;
      country: string;
      blocks: [BlockId, Placement][];
      districts: DistrictPlate[];
      countries: CountryPlate[];
      extent: Extent;
    }
  | { kind: 'road.added'; road: Road }
  | { kind: 'road.removed'; road: Road }
  | {
      kind: 'history';
      baseline: SerializedLayout;
      roads: Road[];
      at: number;
      events: StrataEvent[];
    };

/** What an agent reported, as facts with a time; idle, silence, hue and label are derived. */
export type WeatherEvent =
  | { kind: 'agent.arrived'; agentId: string }
  | { kind: 'agent.reading'; agentId: string; id?: BlockId }
  | { kind: 'agent.editing'; agentId: string; id?: BlockId }
  | { kind: 'agent.running'; agentId: string }
  | { kind: 'agent.waiting'; agentId: string }
  | { kind: 'agent.left'; agentId: string };

/** Whether a hook is configured for this repo, and whether one has spoken to this server. */
export interface HookState {
  kind: 'hook.state';
  installed: boolean;
  heard: boolean;
}

export type StrataEvent = (TerrainEvent | WeatherEvent | HookState) & { at: number };
