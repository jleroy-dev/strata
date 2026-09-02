import { resolve } from 'node:path';

const NOISE = /[*?[\]$`=]/;
const LEAD = /^[0-9]*[<>]+&?|^&>|^[(]+/;
const TRAIL = /[;,)]+$/;
const LINE = /:\d+(?::\d+)?$/;

function tokens(command: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | undefined;
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current !== '') out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current !== '') out.push(current);
  return out;
}

const clean = (token: string): string =>
  token.replace(LEAD, '').replace(TRAIL, '').replace(LINE, '');

/** The files a shell command names, in the order it names them, resolved against `cwd`. */
export function shellPaths(
  command: string,
  cwd: string,
  isFile: (absolute: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const token of tokens(command)) {
    const bare = clean(token);
    if (bare === '' || bare.startsWith('-') || bare.startsWith('~') || NOISE.test(bare)) continue;
    if (!/[./]/.test(bare)) continue;
    const absolute = resolve(cwd, bare);
    if (out.includes(absolute) || !isFile(absolute)) continue;
    out.push(absolute);
  }
  return out;
}
