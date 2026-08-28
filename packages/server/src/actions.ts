import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSignal } from '@strata/core';

export const DEV_ACTIONS = [
  'rename',
  'move-file',
  'move-folder',
  'add',
  'remove',
  'burst',
  'third',
  'touch',
] as const;
export type DevAction = (typeof DEV_ACTIONS)[number];

const THIRD = '7c1d9e2f-5a3b-4c8d-9e0f-1a2b3c4d5e6f';

export const fill = (n: number): string => `${'x'.repeat(Math.max(0, n - 1))}\n`;
export const pick = <T>(list: readonly T[]): T | undefined =>
  list[Math.floor(Math.random() * list.length)];

/** File operations and fake agent signals against a repo, shared by the demo and `/dev`. */
export class Actions {
  private counter = Date.now() % 100_000;
  private thirdAlive = false;

  constructor(
    private readonly root: string,
    private readonly files: () => string[],
    private readonly signal: (s: AgentSignal) => void,
  ) {}

  run(action: DevAction): void {
    switch (action) {
      case 'rename':
        this.rename();
        break;
      case 'move-file':
        this.moveFile();
        break;
      case 'move-folder':
        this.moveFolder();
        break;
      case 'add':
        this.add();
        break;
      case 'remove':
        this.remove();
        break;
      case 'burst':
        this.burst();
        break;
      case 'third':
        this.third();
        break;
      case 'touch':
        this.touch();
        break;
    }
  }

  private text(): string[] {
    return this.files().filter((p) => p.endsWith('.ts') || p.endsWith('.md'));
  }

  private dirOf(p: string): string {
    return p.slice(0, p.lastIndexOf('/'));
  }

  private countryOf(p: string): string {
    return p.split('/').slice(0, 2).join('/');
  }

  rename(): void {
    const from = pick(
      this.text().filter(
        (p) => p.endsWith('.ts') && !p.slice(p.lastIndexOf('/') + 1).startsWith('use-'),
      ),
    );
    if (!from) return;
    const to = from.replace(
      /([^/]+)\.ts$/,
      `${String(pick(['use-', 'get-', 'make-', 'read-', 'sync-']))}$1.ts`,
    );
    this.move(from, to);
  }

  moveFile(): void {
    const files = this.text();
    const from = pick(files);
    if (!from) return;
    const elsewhere = files.filter(
      (p) => this.countryOf(p) !== this.countryOf(from) && p.includes('/'),
    );
    const target = pick(elsewhere);
    if (!target) return;
    this.move(from, `${this.dirOf(target)}/${from.slice(from.lastIndexOf('/') + 1)}`);
  }

  moveFolder(): void {
    const files = this.text();
    const byDir = new Map<string, number>();
    for (const p of files) byDir.set(this.dirOf(p), (byDir.get(this.dirOf(p)) ?? 0) + 1);
    const dirs = [...byDir]
      .filter(([d, n]) => n >= 3 && n <= 30 && d.includes('/'))
      .map(([d]) => d);
    const from = pick(dirs);
    if (!from || !existsSync(join(this.root, from))) return;
    const base = from.replace(/-\d+$/, '');
    renameSync(join(this.root, from), join(this.root, `${base}-${String(this.counter++)}`));
  }

  add(): void {
    const near = pick(this.text());
    if (!near) return;
    const path = `${this.dirOf(near)}/${String(pick(['helpers', 'format', 'guard', 'select', 'merge']))}-${String(this.counter++)}.ts`;
    mkdirSync(join(this.root, path, '..'), { recursive: true });
    writeFileSync(join(this.root, path), fill(400 + Math.floor(Math.random() * 3000)));
  }

  remove(): void {
    const path = pick(this.text().filter((p) => p.includes('-') && p.endsWith('.ts')));
    if (path && existsSync(join(this.root, path))) rmSync(join(this.root, path));
  }

  burst(): void {
    for (const p of this.text()
      .filter((p) => p.endsWith('.ts'))
      .slice(0, 40)) {
      if (existsSync(join(this.root, p)))
        writeFileSync(join(this.root, p), fill(300 + Math.floor(Math.random() * 6000)));
    }
  }

  third(): void {
    this.thirdAlive = !this.thirdAlive;
    this.signal({ session: THIRD, at: Date.now(), kind: this.thirdAlive ? 'start' : 'end' });
    if (this.thirdAlive) this.touch(THIRD);
  }

  touch(session = THIRD): void {
    const path = pick(this.text());
    if (!path) return;
    if (session === THIRD && !this.thirdAlive) {
      this.thirdAlive = true;
      this.signal({ session, at: Date.now(), kind: 'start' });
    }
    this.signal({
      session,
      at: Date.now(),
      kind: 'tool',
      tool: Math.random() < 0.5 ? 'read' : 'edit',
      path,
    });
  }

  private move(from: string, to: string): void {
    if (!existsSync(join(this.root, from))) return;
    mkdirSync(join(this.root, to, '..'), { recursive: true });
    renameSync(join(this.root, from), join(this.root, to));
  }
}
