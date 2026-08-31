import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pathOf,
  placeBlocks,
  qualify,
  repoPath,
  withoutRepo,
  type AgentSignal,
  type RepoId,
  type RepoPath,
} from '@strata/core';
import { fill, type Scratch } from './scratch.js';

export const SCRATCH_ACTIONS = [
  'rename',
  'move-file',
  'rename-folder',
  'move-folder',
  'add',
  'remove',
  'burst',
] as const;
export const SIGNAL_ACTIONS = ['third', 'touch', 'think', 'block'] as const;
export const DEV_ACTIONS = [...SCRATCH_ACTIONS, ...SIGNAL_ACTIONS] as const;

export type ScratchAction = (typeof SCRATCH_ACTIONS)[number];
export type SignalAction = (typeof SIGNAL_ACTIONS)[number];
export type DevAction = ScratchAction | SignalAction;

export const isDevAction = (value: string): value is DevAction =>
  (DEV_ACTIONS as readonly string[]).includes(value);
export const isScratchAction = (action: DevAction): action is ScratchAction =>
  (SCRATCH_ACTIONS as readonly string[]).includes(action);

export const THIRD = '7c1d9e2f-5a3b-4c8d-9e0f-1a2b3c4d5e6f';

export type Random = () => number;

/** mulberry32: one seed replays one session, so a glitch can be witnessed twice. */
export function random(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScratchResult {
  action: ScratchAction;
  paths: RepoPath[];
}

const dirOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const under = (country: string, name: string): string =>
  country === '' ? name : `${country}/${name}`;

/** A folder on disk with the country the map puts it in. */
interface Folder {
  dir: string;
  country: string;
  files: RepoPath[];
}

/** Folders worth moving: more than one file, not a country's own root. */
const movable = (folders: readonly Folder[]): Folder[] =>
  folders.filter(
    (f) => f.dir !== '' && f.dir !== f.country && f.files.length >= 2 && f.files.length <= 30,
  );

/** Fake agent signals for one repo. Reads a listing and emits; never touches disk. */
export class Signals {
  private alive = false;

  constructor(
    private readonly repo: RepoId,
    private readonly files: () => readonly RepoPath[],
    private readonly emit: (signal: AgentSignal) => void,
    private readonly next: Random = Math.random,
  ) {}

  run(action: SignalAction): void {
    if (action === 'third') this.third();
    else if (action === 'touch') this.touch();
    else if (action === 'think') this.think();
    else this.block();
  }

  think(): void {
    this.emit({ session: THIRD, repo: this.repo, at: Date.now(), kind: 'prompt' });
  }

  block(): void {
    this.emit({ session: THIRD, repo: this.repo, at: Date.now(), kind: 'blocked' });
  }

  third(): void {
    this.alive = !this.alive;
    this.emit({
      session: THIRD,
      repo: this.repo,
      at: Date.now(),
      kind: this.alive ? 'start' : 'end',
    });
    if (this.alive) this.touch(THIRD);
  }

  touch(session = THIRD): void {
    const path = this.pick(this.files());
    if (path === undefined) return;
    if (session === THIRD && !this.alive) {
      this.alive = true;
      this.emit({ session, repo: this.repo, at: Date.now(), kind: 'start' });
    }
    this.emit({
      session,
      repo: this.repo,
      at: Date.now(),
      kind: 'tool',
      tool: this.next() < 0.5 ? 'read' : 'edit',
      path: qualify(this.repo, path),
    });
  }

  private pick<T>(list: readonly T[]): T | undefined {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Tries every candidate from a random start, so one taken destination is not a dead click. */
  private first<T>(list: readonly T[], attempt: (item: T) => RepoPath[] | undefined) {
    if (list.length === 0) return undefined;
    const start = Math.floor(this.next() * list.length);
    for (let i = 0; i < list.length; i++) {
      const item = list[(start + i) % list.length];
      const done = item === undefined ? undefined : attempt(item);
      if (done) return done;
    }
    return undefined;
  }
}

/**
 * Every file operation strata performs, all of them inside a `Scratch`. The targeted methods
 * are the only writers; a named action picks a target and delegates to one.
 */
export class ScratchActions {
  private counter = 0;

  constructor(
    private readonly scratch: Scratch,
    private readonly repo: RepoId,
    private readonly files: () => readonly RepoPath[],
    private readonly next: Random = Math.random,
  ) {}

  get root(): string {
    return this.scratch.root;
  }

  run(action: ScratchAction): ScratchResult | undefined {
    const paths = this.of(action);
    return paths === undefined ? undefined : { action, paths };
  }

  moveTo(from: RepoPath, to: RepoPath): [RepoPath, RepoPath] | undefined {
    if (!existsSync(this.at(from)) || existsSync(this.at(to))) return undefined;
    mkdirSync(join(this.at(to), '..'), { recursive: true });
    renameSync(this.at(from), this.at(to));
    return [from, to];
  }

  addAt(path: RepoPath, size: number): RepoPath[] {
    mkdirSync(join(this.at(path), '..'), { recursive: true });
    writeFileSync(this.at(path), fill(size));
    return [path];
  }

  writeAt(path: RepoPath, size: number): RepoPath[] | undefined {
    if (!existsSync(this.at(path))) return undefined;
    writeFileSync(this.at(path), fill(size));
    return [path];
  }

  removeAt(path: RepoPath): RepoPath[] | undefined {
    if (!existsSync(this.at(path))) return undefined;
    rmSync(this.at(path));
    return [path];
  }

  rename(): RepoPath[] | undefined {
    const from = this.pick(
      this.text().filter((p) => p.endsWith('.ts') && !nameOf(p).startsWith('use-')),
    );
    if (from === undefined) return undefined;
    const prefix = this.pick(['use-', 'get-', 'make-', 'read-', 'sync-']) ?? 'use-';
    return this.moveTo(from, repoPath(from.replace(/([^/]+)\.ts$/, `${prefix}$1.ts`)));
  }

  moveFile(): RepoPath[] | undefined {
    const folders = this.folders();
    const from = this.pick(this.text());
    if (from === undefined) return undefined;
    const here = folders.find((f) => f.dir === dirOf(from))?.country;
    const hosts = folders.filter((f) => f.country !== here && f.dir !== '');
    return this.first(hosts, (host) => this.moveTo(from, repoPath(`${host.dir}/${nameOf(from)}`)));
  }

  renameFolder(): RepoPath[] | undefined {
    const folder = this.pick(movable(this.folders()));
    if (folder === undefined) return undefined;
    const to = `${folder.dir.replace(/-\d+$/, '')}-${String(this.counter++)}`;
    return this.moveTo(repoPath(folder.dir), repoPath(to));
  }

  moveFolder(): RepoPath[] | undefined {
    const folders = this.folders();
    const folder = this.pick(movable(folders));
    if (folder === undefined) return undefined;
    const hosts = [...new Set(folders.map((f) => f.country))].filter((c) => c !== folder.country);
    return this.first(hosts, (host) =>
      this.moveTo(repoPath(folder.dir), repoPath(under(host, nameOf(folder.dir)))),
    );
  }

  add(): RepoPath[] | undefined {
    const near = this.pick(this.text());
    if (near === undefined) return undefined;
    const stem = this.pick(['helpers', 'format', 'guard', 'select', 'merge']) ?? 'helpers';
    const path = `${dirOf(near)}/${stem}-${String(this.counter++)}.ts`;
    return this.addAt(repoPath(path), 400 + Math.floor(this.next() * 3000));
  }

  remove(): RepoPath[] | undefined {
    const path = this.pick(this.text().filter((p) => p.endsWith('.ts')));
    return path === undefined ? undefined : this.removeAt(path);
  }

  burst(): RepoPath[] | undefined {
    const written = this.text()
      .filter((p) => p.endsWith('.ts'))
      .slice(0, 40)
      .flatMap((p) => this.writeAt(p, 300 + Math.floor(this.next() * 6000)) ?? []);
    return written.length === 0 ? undefined : written;
  }

  private of(action: ScratchAction): RepoPath[] | undefined {
    switch (action) {
      case 'rename':
        return this.rename();
      case 'move-file':
        return this.moveFile();
      case 'rename-folder':
        return this.renameFolder();
      case 'move-folder':
        return this.moveFolder();
      case 'add':
        return this.add();
      case 'remove':
        return this.remove();
      case 'burst':
        return this.burst();
    }
  }

  private at(path: string): string {
    return join(this.scratch.root, path);
  }

  private text(): RepoPath[] {
    return this.files().filter((p) => p.endsWith('.ts') || p.endsWith('.md'));
  }

  /** The folders the map would draw, each tagged with the country it belongs to. */
  folders(): Folder[] {
    const all = this.files();
    const homes = new Map<string, string>();
    for (const block of placeBlocks(this.repo, all, new Map(all.map((p) => [p, 1])))) {
      homes.set(pathOf(block.id), withoutRepo(block.country));
    }
    const byDir = new Map<string, Folder>();
    for (const path of this.text()) {
      const dir = dirOf(path);
      let folder = byDir.get(dir);
      if (!folder) byDir.set(dir, (folder = { dir, country: homes.get(path) ?? '', files: [] }));
      folder.files.push(path);
    }
    return [...byDir.values()];
  }

  countries(): string[] {
    return [...new Set(this.folders().map((f) => f.country))];
  }

  movable(): Folder[] {
    return movable(this.folders());
  }

  private pick<T>(list: readonly T[]): T | undefined {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Tries every candidate from a random start, so one taken destination is not a dead click. */
  private first<T>(list: readonly T[], attempt: (item: T) => RepoPath[] | undefined) {
    if (list.length === 0) return undefined;
    const start = Math.floor(this.next() * list.length);
    for (let i = 0; i < list.length; i++) {
      const item = list[(start + i) % list.length];
      const done = item === undefined ? undefined : attempt(item);
      if (done) return done;
    }
    return undefined;
  }
}
