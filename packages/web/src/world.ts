import {
  EMPTY_LAYOUT,
  History,
  parseLayout,
  type BlockId,
  type HookState,
  type Mount,
  type RepoId,
  type StrataEvent,
  type World,
} from '@strata/core';

export interface Folded {
  history?: History;
  renames: Map<BlockId, BlockId>;
  folders: Map<string, string>;
  hooks: Map<RepoId, HookState>;
  mounts: readonly Mount[];
  connected: boolean;
  lastFrameAt: number;
}

export const emptyWorld = (): World => ({ layout: EMPTY_LAYOUT, sessions: new Map() });

/** Folds one event into the history; renames accumulate until the frame reads them. */
export function fold(state: Folded, event: StrataEvent): Folded {
  let history = state.history;
  let mounts = state.mounts;
  let hooks = state.hooks;
  switch (event.kind) {
    case 'snapshot':
      history = new History(EMPTY_LAYOUT, event.at);
      mounts = event.mounts;
      hooks = new Map();
      break;
    case 'hook.state':
      hooks.set(event.repo, event.state);
      break;
    case 'history':
      history?.restore(parseLayout(event.baseline), event.at, event.events);
      break;
    default:
      if (event.kind === 'block.moved') state.renames.set(event.block.id, event.from);
      if (event.kind === 'folder.moved') state.folders.set(event.from, event.to);
      history?.push(event);
      break;
  }
  return {
    ...state,
    ...(history && { history }),
    mounts,
    hooks,
    lastFrameAt: event.at,
  };
}
