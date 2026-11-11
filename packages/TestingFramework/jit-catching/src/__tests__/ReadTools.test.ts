import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Glob, Grep, ReadFile } from '../generator/ReadTools';

const DENIED = 'denied: reads stay inside the base worktree';

/** A worktree `root` with sources, a node_modules copy, and a folder `outside` next to it. */
function world() {
  const top = mkdtempSync(join(tmpdir(), 'jit-read-')); const root = join(top, 'root'); const outside = join(top, 'outside');
  mkdirSync(join(root, 'src/sub'), { recursive: true }); mkdirSync(join(root, 'node_modules/pkg'), { recursive: true }); mkdirSync(outside);
  writeFileSync(join(root, 'src/a.ts'), 'one\ntwo needle\nthree\nfour needle\n');
  writeFileSync(join(root, 'src/sub/b.md'), 'needle in markdown\n');
  writeFileSync(join(root, 'node_modules/pkg/c.ts'), 'needle in a dependency\n');
  writeFileSync(join(outside, 'secret.ts'), 'needle secret\n');
  return { root, outside };
}

describe('ReadFile', () => {
  it('returns numbered lines from offset for limit lines', () => {
    const { root } = world();
    expect(ReadFile(root, { path: 'src/a.ts', offset: 2, limit: 2 })).toEqual({ Text: '2\ttwo needle\n3\tthree', IsError: false });
  });
  it('reports a missing file and a folder as errors', () => {
    const { root } = world();
    expect(ReadFile(root, { path: 'src/none.ts' }).IsError).toBe(true);
    expect(ReadFile(root, { path: 'src' }).IsError).toBe(true);
  });
  it('refuses paths outside the worktree, also through a symlink', () => {
    const { root, outside } = world();
    symlinkSync(outside, join(root, 'src/link'));
    for (const path of ['../outside/secret.ts', join(outside, 'secret.ts'), 'src/link/secret.ts'])
      expect(ReadFile(root, { path })).toEqual({ Text: DENIED, IsError: true });
  });
});

describe('Grep', () => {
  it('lists matches as path:line: text and skips node_modules', () => {
    const { root } = world();
    expect(Grep(root, { pattern: 'needle' })).toEqual({ Text: 'src/a.ts:2: two needle\nsrc/a.ts:4: four needle\nsrc/sub/b.md:1: needle in markdown', IsError: false });
  });
  it('filters file names with glob and searches only under path', () => {
    const { root } = world();
    expect(Grep(root, { pattern: 'needle', glob: '*.md' }).Text).toBe('src/sub/b.md:1: needle in markdown');
    expect(Grep(root, { pattern: 'needle', path: 'src/sub' }).Text).toBe('src/sub/b.md:1: needle in markdown');
  });
  it('does not descend into a symlinked folder', () => {
    const { root, outside } = world();
    symlinkSync(outside, join(root, 'src/link'));
    expect(Grep(root, { pattern: 'secret' }).Text).not.toMatch(/secret\.ts/);
  });
  it('reports an invalid regular expression as an error', () => {
    const { root } = world();
    expect(Grep(root, { pattern: '(' }).IsError).toBe(true);
  });
  it('refuses a path outside the worktree', () => {
    const { root } = world();
    expect(Grep(root, { pattern: 'needle', path: '../outside' })).toEqual({ Text: DENIED, IsError: true });
  });
});

describe('Glob', () => {
  it('lists matching paths relative to the worktree, sorted, without node_modules', () => {
    const { root } = world();
    expect(Glob(root, { pattern: '**/*.ts' }).Text).toBe('src/a.ts');
    expect(Glob(root, { pattern: '**/*', path: 'src/sub' }).Text).toBe('src/sub/b.md');
  });
  it('does not list names behind a symlink out of the worktree', () => {
    const { root, outside } = world();
    symlinkSync(outside, join(root, 'link'));
    expect(Glob(root, { pattern: 'link/*.ts' }).Text).not.toMatch(/secret/);
  });
  it('refuses a pattern that climbs out of the worktree', () => {
    const { root } = world();
    expect(Glob(root, { pattern: '../outside/*.ts' })).toEqual({ Text: DENIED, IsError: true });
  });
});
