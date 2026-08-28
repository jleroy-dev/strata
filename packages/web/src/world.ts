import { History, type BlockId, type Layout, type StrataEvent, type World } from '@strata/core';

export interface Folded {
  history?: History;
  renames: Map<BlockId, BlockId>;
  folders: Map<string, string>;
  hook?: { installed: boolean; heard: boolean };
  root: string;
  connected: boolean;
  lastFrameAt: number;
}

const EMPTY_LAYOUT: Layout = {
  blocks: new Map(),
  districts: [],
  countries: [],
  extent: { w: 0, h: 0 },
};

export const emptyWorld = (): World => ({ layout: EMPTY_LAYOUT, sessions: new Map() });

/** Folds one event into the history; renames accumulate until the frame reads them. */
export function fold(state: Folded, event: StrataEvent): Folded {
  let history = state.history;
  let hook = state.hook;
  let root = state.root;
  switch (event.kind) {
    case 'snapshot':
      history = new History(
        {
          ...emptyWorld().layout,
          blocks: new Map(event.layout.blocks),
          districts: event.layout.districts,
          countries: event.layout.countries,
          extent: event.layout.extent,
        },
        event.at,
        undefined,
        event.roads,
      );
      root = event.root;
      break;
    case 'hook.state':
      hook = { installed: event.installed, heard: event.heard };
      break;
    case 'history':
      history?.restore(
        {
          ...emptyWorld().layout,
          blocks: new Map(event.baseline.blocks),
          districts: event.baseline.districts,
          countries: event.baseline.countries,
          extent: event.baseline.extent,
        },
        event.roads,
        event.at,
        event.events,
      );
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
    root,
    ...(hook && { hook }),
    lastFrameAt: event.at,
  };
}
