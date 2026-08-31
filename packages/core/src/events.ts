/**
 * The one stream the renderer reads. `server` produces these from the file
 * system, git and agent hooks; `web` consumes them and nothing else.
 */

import type {
  ContinentPlate,
  CountryPlate,
  DistrictPlate,
  Placement,
  RepackScope,
  SerializedLayout,
} from './layout.js';

import type { BlockId, RepoId } from './qualified.js';

export type { BlockId };

/** A repo the server is watching, and where it lives on that machine. */
export interface Mount {
  id: RepoId;
  root: string;
}

/** A district is the folder a block lives in; a country is the workspace project. */
export interface Block {
  id: BlockId;
  country: string;
  district: string;
  /** Size in bytes; height reads off this. */
  size: number;
}

/** A structural change as the file system reports it, before the layout has placed it. */
export type TerrainChange =
  | { kind: 'block.added'; block: Block }
  | { kind: 'block.removed'; id: BlockId }
  | { kind: 'block.changed'; id: BlockId; size: number }
  | { kind: 'block.moved'; from: BlockId; block: Block }
  | { kind: 'folder.moved'; from: string; to: string };

export type TerrainEvent =
  | { kind: 'snapshot'; mounts: Mount[] }
  | { kind: 'block.added'; block: Block; placement: Placement }
  | { kind: 'block.removed'; id: BlockId }
  | { kind: 'block.changed'; id: BlockId; size: number; placement: Placement }
  | { kind: 'block.moved'; from: BlockId; block: Block; placement: Placement }
  | { kind: 'folder.moved'; from: string; to: string }
  | {
      kind: 'layout.repacked';
      repo: RepoId;
      scope: RepackScope;
      country: string;
      blocks: [BlockId, Placement][];
      districts: DistrictPlate[];
      countries: CountryPlate[];
      continents: ContinentPlate[];
    }
  | {
      kind: 'history';
      baseline: SerializedLayout;
      at: number;
      events: StrataEvent[];
    };

/**
 * What an agent reported, as facts with a time; idle, silence, hue and label are derived.
 * Every fact carries the repo the agent works in, because an agent with no block still has a
 * planet.
 */
export type WeatherEvent = { agentId: string; repo: RepoId } & (
  | { kind: 'agent.arrived' }
  | { kind: 'agent.reading'; id?: BlockId }
  | { kind: 'agent.editing'; id?: BlockId }
  | { kind: 'agent.running' }
  | { kind: 'agent.thinking' }
  | { kind: 'agent.blocked' }
  | { kind: 'agent.waiting' }
  | { kind: 'agent.left' }
);

/**
 * What the server can hear: no hook in this repo, a hook whose entries are not the ones this
 * build installs, a hook that has never posted, or weather. `heard` outranks the settings files,
 * because a post is proof and a file is a guess; drift outranks `heard`, because a hook that
 * posts is still blind to every event it was never given.
 */
export type HookState = 'no-hook' | 'installed-stale' | 'installed-unheard' | 'heard';

export interface HookStateEvent {
  kind: 'hook.state';
  repo: RepoId;
  state: HookState;
}

export type StrataEvent = (TerrainEvent | WeatherEvent | HookStateEvent) & { at: number };
