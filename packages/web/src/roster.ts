import type { Agent, Intent } from '@strata/core';
import { panel } from './dom.js';

export type RosterState = 'connecting' | 'disconnected' | 'deaf' | 'quiet' | 'cold' | 'live';

const root = panel('roster');
const veil = panel('veil');
veil.style.display = 'none';
panel('vignette');

const rowsById = new Map<string, HTMLDivElement>();
let emptyRow: HTMLDivElement | undefined;

export function drawRoster(
  rows: readonly Agent[],
  state: RosterState,
  detail: string,
  following: string | undefined,
  dispatch: (intent: Intent) => void,
): void {
  veil.style.display = state === 'disconnected' ? 'block' : 'none';
  const children: HTMLElement[] = [];
  if (rows.length === 0 || state === 'disconnected') {
    emptyRow ??= document.createElement('div');
    const row = emptyRow;
    const className = `row empty${state === 'deaf' || state === 'disconnected' ? ' warn' : ''}`;
    if (row.className !== className) row.className = className;
    let text: string;
    if (state === 'deaf') text = 'no hook in this project · ';
    else if (state === 'disconnected') text = `no server on :4747 · last frame ${detail}`;
    else if (state === 'connecting') text = 'connecting';
    else if (state === 'cold') text = `no agent · quiet for ${detail}`;
    else text = detail ? `no agent · ${detail}` : 'no agent · no session yet';
    if (row.dataset.text !== `${state}|${text}`) {
      row.dataset.text = `${state}|${text}`;
      row.replaceChildren(text);
      if (state === 'deaf') {
        const code = document.createElement('code');
        code.textContent = 'npx strata hook install';
        row.append(code);
      }
    }
    children.push(row);
  }
  for (const agent of rows) {
    let row = rowsById.get(agent.id);
    if (!row) {
      row = buildRow(agent, dispatch);
      rowsById.set(agent.id, row);
    }
    const className = `row${agent.verb === 'done' ? ' done' : ''}${agent.id === following ? ' following' : ''}`;
    if (row.className !== className) row.className = className;
    const cells = row.children;
    setText(cells[1], agent.label);
    setText(cells[2], agent.verb);
    setText(cells[3], agent.verb === 'running' ? '' : districtOf(agent.block));
    setText(cells[4], agent.block ?? '');
    const dot = cells[0];
    if (dot instanceof HTMLElement) dot.style.color = `hsl(${String(agent.hue)} 90% 62%)`;
    children.push(row);
  }
  for (const id of [...rowsById.keys()]) {
    if (!rows.some((r) => r.id === id)) rowsById.delete(id);
  }
  const same =
    children.length === root.children.length && children.every((c, i) => root.children[i] === c);
  if (!same) root.replaceChildren(...children);
}

function buildRow(agent: Agent, dispatch: (intent: Intent) => void): HTMLDivElement {
  const row = document.createElement('div');
  const dot = document.createElement('span');
  dot.className = 'dot';
  const label = document.createElement('span');
  const verb = document.createElement('span');
  verb.className = 'verb';
  const where = document.createElement('span');
  where.className = 'where';
  const path = document.createElement('span');
  path.className = 'path';
  row.append(dot, label, verb, where, path);
  row.addEventListener('mouseenter', () => {
    dispatch({ kind: 'roster-hover', agentId: agent.id });
  });
  row.addEventListener('mouseleave', () => {
    dispatch({ kind: 'roster-hover' });
  });
  row.addEventListener('click', () => {
    dispatch({ kind: 'roster-click', agentId: agent.id });
  });
  return row;
}

function setText(el: Element | undefined, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

function districtOf(block: string | undefined): string {
  if (!block) return '';
  const slash = block.lastIndexOf('/');
  return slash === -1 ? '' : block.slice(0, slash);
}
