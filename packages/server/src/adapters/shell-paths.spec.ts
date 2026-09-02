import { describe, expect, it } from 'vitest';
import { shellPaths } from './shell-paths.js';

const CWD = '/repo';
const files = new Set(['/repo/src/a.ts', '/repo/src/b.ts', '/repo/README.md', '/repo/notes.txt']);
const isFile = (absolute: string): boolean => files.has(absolute);
const paths = (command: string): string[] => shellPaths(command, CWD, isFile);

describe('shellPaths', () => {
  it('names the files a command touches, in order, relative to the cwd', () => {
    expect(paths('sed -n 1,5p src/a.ts')).toEqual(['/repo/src/a.ts']);
    expect(paths('cat src/b.ts src/a.ts')).toEqual(['/repo/src/b.ts', '/repo/src/a.ts']);
    expect(paths('cat /repo/README.md')).toEqual(['/repo/README.md']);
  });

  it('names nothing for a command that names no file', () => {
    expect(paths('npm run gate')).toEqual([]);
    expect(paths('git status')).toEqual([]);
    expect(paths('cat src/nothere.ts')).toEqual([]);
    expect(paths('ls src')).toEqual([]);
  });

  it('reads through quotes, redirections, line suffixes and trailing punctuation', () => {
    expect(paths(`cat "src/a.ts"`)).toEqual(['/repo/src/a.ts']);
    expect(paths(`cat 'src/a.ts'`)).toEqual(['/repo/src/a.ts']);
    expect(paths('echo x >src/a.ts')).toEqual(['/repo/src/a.ts']);
    expect(paths('echo x 2>src/a.ts')).toEqual(['/repo/src/a.ts']);
    expect(paths('sed -n 3p src/a.ts:12:4')).toEqual(['/repo/src/a.ts']);
    expect(paths('(cat src/a.ts; cat src/b.ts)')).toEqual(['/repo/src/a.ts', '/repo/src/b.ts']);
  });

  it('skips flags, assignments, globs, expansions and home paths', () => {
    expect(paths('grep -n --include=src/a.ts x')).toEqual([]);
    expect(paths('FILE=src/a.ts cat $FILE')).toEqual([]);
    expect(paths('cat src/*.ts')).toEqual([]);
    expect(paths('cat `echo src/a.ts`')).toEqual([]);
    expect(paths('cat ~/src/a.ts')).toEqual([]);
  });

  it('names a file once however often the command repeats it', () => {
    expect(paths('cp src/a.ts src/a.ts.bak && cat src/a.ts')).toEqual(['/repo/src/a.ts']);
  });

  it('does not stat a bare word that could not be a path', () => {
    const asked: string[] = [];
    shellPaths('npm run gate', CWD, (absolute) => {
      asked.push(absolute);
      return false;
    });
    expect(asked).toEqual([]);
  });
});
