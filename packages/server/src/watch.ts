import { watch } from 'node:fs';

export const QUIET_MS = 50;
export const CAP_MS = 250;

export interface Watcher {
  close(): void;
}

/**
 * Rings `onTick` with the paths touched since the last ring, after `QUIET_MS` of silence or
 * `CAP_MS` after the first event of a burst. Events under `.git/` are dropped.
 */
export function watchRoot(root: string, onTick: (touched: Set<string>) => void): Watcher {
  let touched = new Set<string>();
  let quiet: NodeJS.Timeout | undefined;
  let cap: NodeJS.Timeout | undefined;

  const flush = (): void => {
    clearTimeout(quiet);
    clearTimeout(cap);
    quiet = cap = undefined;
    const batch = touched;
    touched = new Set();
    onTick(batch);
  };

  const handle = watch(root, { recursive: true, persistent: true }, (_event, filename) => {
    if (filename === null) return;
    const path = filename.split('\\').join('/');
    if (path === '.git' || path.startsWith('.git/')) return;
    touched.add(path);
    clearTimeout(quiet);
    quiet = setTimeout(flush, QUIET_MS);
    cap ??= setTimeout(flush, CAP_MS);
  });
  handle.on('error', (error: Error) => {
    console.error(`strata: watcher error: ${error.message}`);
  });

  return {
    close() {
      clearTimeout(quiet);
      clearTimeout(cap);
      handle.close();
    },
  };
}

/** A tick with no watcher event behind it, used to confirm arrivals seen once. */
export function later(ms: number, fn: () => void): void {
  setTimeout(fn, ms);
}
