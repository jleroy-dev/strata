import type { BlockId } from './events.js';

export type Mode = 'overview' | 'follow' | 'free';

/** Everything the panel's controls have decided; renderers read it, intents change it. */
export interface Ui {
  mode: Mode;
  follow?: string;
  selected?: BlockId;
  hover?: BlockId;
  isolate?: string;
  scrub?: number;
}

export type Intent =
  | { kind: 'key'; key: 'C' | 'Home' | 'F' | 'Escape' }
  | { kind: 'hover'; id?: BlockId }
  | { kind: 'click-block'; id?: BlockId }
  | { kind: 'click-beacon'; agentId: string }
  | { kind: 'roster-hover'; agentId?: string }
  | { kind: 'roster-click'; agentId: string }
  | { kind: 'touch-camera' }
  | { kind: 'scrub'; at?: number }
  | { kind: 'agent-gone'; agentId: string }
  | { kind: 'block-gone'; id: BlockId };

export const INITIAL_UI: Ui = { mode: 'overview' };

const NEXT_MODE: Record<Mode, Mode> = { overview: 'follow', follow: 'free', free: 'overview' };

export function reduce(ui: Ui, intent: Intent): Ui {
  switch (intent.kind) {
    case 'key':
      switch (intent.key) {
        case 'C': {
          const mode = NEXT_MODE[ui.mode];
          return mode === 'follow' ? { ...ui, mode } : without({ ...ui, mode }, 'follow');
        }
        case 'Home':
          return without({ ...ui, mode: 'overview' }, 'follow');
        case 'F':
          return ui.selected === undefined ? ui : without({ ...ui, mode: 'free' }, 'follow');
        case 'Escape':
          return ui.scrub === undefined ? without(ui, 'selected') : without(ui, 'scrub');
      }
      break;
    case 'hover':
      return intent.id === undefined ? without(ui, 'hover') : { ...ui, hover: intent.id };
    case 'click-block':
      return intent.id === undefined ? without(ui, 'selected') : { ...ui, selected: intent.id };
    case 'click-beacon':
      return { ...ui, mode: 'follow', follow: intent.agentId };
    case 'roster-click':
      return ui.mode === 'follow' && ui.follow === intent.agentId
        ? without({ ...ui, mode: 'overview' }, 'follow')
        : { ...ui, mode: 'follow', follow: intent.agentId };
    case 'roster-hover':
      return intent.agentId === undefined
        ? without(ui, 'isolate')
        : { ...ui, isolate: intent.agentId };
    case 'scrub':
      return intent.at === undefined ? without(ui, 'scrub') : { ...ui, scrub: intent.at };
    case 'touch-camera':
      return ui.mode === 'free' ? ui : without({ ...ui, mode: 'free' }, 'follow');
    case 'agent-gone': {
      let next = ui;
      if (next.follow === intent.agentId) next = without(next, 'follow');
      if (next.isolate === intent.agentId) next = without(next, 'isolate');
      return next;
    }
    case 'block-gone': {
      let next = ui;
      if (next.selected === intent.id) next = without(next, 'selected');
      if (next.hover === intent.id) next = without(next, 'hover');
      return next;
    }
  }
  return ui;
}

function without(ui: Ui, key: keyof Ui): Ui {
  if (!(key in ui)) return ui;
  return Object.fromEntries(Object.entries(ui).filter(([k]) => k !== key)) as unknown as Ui;
}
