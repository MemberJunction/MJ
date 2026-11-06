import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitRepo } from '../git/GitRepo';

describe('GitRepo', () => {
  let root: string; let repo: GitRepo; let first: string; let second: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'jit-git-'));
    const g = (...a: string[]) => execFileSync('git', a, { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString().trim();
    g('init', '-q', '-b', 'next'); mkdirSync(join(root, 'packages/X/src'), { recursive: true });
    writeFileSync(join(root, 'packages/X/src/a.ts'), 'export const a = 1;\n'); g('add', '.'); g('commit', '-qm', 'one'); first = g('rev-parse', 'HEAD');
    writeFileSync(join(root, 'packages/X/src/a.ts'), 'export const a = 2;\n'); g('commit', '-qam', 'two'); second = g('rev-parse', 'HEAD');
    repo = new GitRepo(root);
  });
  it('MergeBase and ChangedPaths', async () => {
    expect(await repo.MergeBase(first, second)).toBe(first);
    expect(await repo.ChangedPaths(first, second)).toEqual(['packages/X/src/a.ts']);
  });
  it('Show returns file content at a revision and null when missing', async () => {
    expect(await repo.Show(first, 'packages/X/src/a.ts')).toBe('export const a = 1;\n');
    expect(await repo.Show(first, 'packages/X/src/nope.ts')).toBeNull();
  });
  it('AddWorktree checks out a detached revision and RemoveWorktree cleans it', async () => {
    const dir = join(root, '..', 'wt-' + Date.now());
    await repo.AddWorktree(dir, first);
    expect(existsSync(join(dir, 'packages/X/src/a.ts'))).toBe(true);
    expect(await repo.Show(first, 'packages/X/src/a.ts')).toBe('export const a = 1;\n');
    await repo.RemoveWorktree(dir);
    expect(existsSync(join(dir, 'packages/X/src/a.ts'))).toBe(false);
  });
});
