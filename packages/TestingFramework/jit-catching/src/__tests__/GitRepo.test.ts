import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitRepo } from '../git/GitRepo';
import { ParseUnifiedDiff, AddedLinesByFile } from '../git/DiffParser';

describe('GitRepo', () => {
  let root: string; let repo: GitRepo; let first: string; let second: string; let third: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'jit-git-'));
    const g = (...a: string[]) => execFileSync('git', a, { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString().trim();
    g('init', '-q', '-b', 'next'); mkdirSync(join(root, 'packages/X/src'), { recursive: true });
    writeFileSync(join(root, 'packages/X/src/a.ts'), 'export const a = 1;\n'); g('add', '.'); g('commit', '-qm', 'one'); first = g('rev-parse', 'HEAD');
    writeFileSync(join(root, 'packages/X/src/a.ts'), 'export const a = 2;\n'); g('commit', '-qam', 'two'); second = g('rev-parse', 'HEAD');
    writeFileSync(join(root, 'packages/X/src/sp ace.ts'), 'export const s = 1;\n'); writeFileSync(join(root, 'packages/X/src/café.ts'), 'export const c = 1;\n');
    g('add', '.'); g('commit', '-qm', 'three'); third = g('rev-parse', 'HEAD');
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
  it('Diff round-trips through the parser even when the user sets diff.noprefix', async () => {
    const keys = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'] as const;
    const saved = keys.map((k) => process.env[k]);
    process.env.GIT_CONFIG_COUNT = '1'; process.env.GIT_CONFIG_KEY_0 = 'diff.noprefix'; process.env.GIT_CONFIG_VALUE_0 = 'true';
    try {
      expect(AddedLinesByFile(ParseUnifiedDiff(await repo.Diff(first, second)))).toEqual({ 'packages/X/src/a.ts': [1] });
    } finally {
      keys.forEach((k, i) => { const v = saved[i]; if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    }
  });
  it('ChangedPaths and Diff keep plain paths for names with spaces and non-ASCII characters', async () => {
    expect(await repo.ChangedPaths(second, third)).toEqual(['packages/X/src/café.ts', 'packages/X/src/sp ace.ts']);
    expect(AddedLinesByFile(ParseUnifiedDiff(await repo.Diff(second, third)))).toEqual({ 'packages/X/src/café.ts': [1], 'packages/X/src/sp ace.ts': [1] });
  });
  it('ApplyPatch runs git apply --3way in the folder and returns false when git exits 1', async () => {
    const calls: { args: string[]; cwd: string }[] = [];
    const fake = new GitRepo('/repo', async (args, cwd) => { calls.push({ args, cwd }); throw Object.assign(new Error('patch does not apply'), { code: 1 }); });
    expect(await fake.ApplyPatch('/work/head', '/work/fix.patch')).toBe(false);
    expect(calls).toEqual([{ args: ['-c', 'core.quotePath=false', '-C', '/work/head', 'apply', '--3way', '--whitespace=nowarn', '/work/fix.patch'], cwd: '/repo' }]);
  });
  it('CommitWithPatch applies the patch in a scratch worktree, commits the tree on the base and removes the worktree', async () => {
    const calls: string[][] = [];
    const fake = new GitRepo('/repo', async (args) => { calls.push(args.slice(2)); return args.includes('write-tree') ? 'tree123\n' : args.includes('commit-tree') ? 'commit456\n' : ''; });
    expect(await fake.CommitWithPatch('base789', '/run/match/work/fix.patch', '/run/match/work/fix')).toBe('commit456');
    expect(calls).toEqual([
      ['worktree', 'remove', '--force', '/run/match/work/fix'],
      ['worktree', 'add', '--detach', '/run/match/work/fix', 'base789'],
      ['-C', '/run/match/work/fix', 'apply', '--3way', '--whitespace=nowarn', '/run/match/work/fix.patch'],
      ['-C', '/run/match/work/fix', 'add', '-A'],
      ['-C', '/run/match/work/fix', 'write-tree'],
      ['-c', 'user.name=jit-catch', '-c', 'user.email=jit-catch@localhost', '-C', '/run/match/work/fix', 'commit-tree', 'tree123', '-p', 'base789', '-m', 'jit-catch match: base789 + fix'],
      ['worktree', 'remove', '--force', '/run/match/work/fix'],
    ]);
  });
  it('CommitWithPatch removes the scratch worktree and returns null when the patch does not apply', async () => {
    const calls: string[][] = [];
    const fake = new GitRepo('/repo', async (args) => {
      calls.push(args.slice(2));
      if (args.includes('apply')) throw Object.assign(new Error('patch does not apply'), { code: 1 });
      return '';
    });
    expect(await fake.CommitWithPatch('base789', '/w/fix.patch', '/w/fix')).toBeNull();
    expect(calls.map((c) => c.slice(0, 3).join(' '))).toEqual(['worktree remove --force', 'worktree add --detach', '-C /w/fix apply', 'worktree remove --force']);
  });
  it('CommitWithPatch removes a scratch folder left from an earlier run before it adds the worktree', async () => {
    const scratch = join(mkdtempSync(join(tmpdir(), 'jit-scratch-')), 'fix');
    mkdirSync(scratch); writeFileSync(join(scratch, 'left.txt'), 'x');
    let presentAtAdd: boolean | null = null;
    const fake = new GitRepo('/repo', async (args) => {
      if (args.includes('add') && args.includes('--detach')) presentAtAdd = existsSync(scratch);
      if (args.includes('remove') && presentAtAdd === null) throw Object.assign(new Error('not a working tree'), { code: 128 });
      return args.includes('commit-tree') ? 'c1\n' : '';
    });
    try {
      await fake.CommitWithPatch('base789', '/w/fix.patch', scratch);
      expect(presentAtAdd).toBe(false);
    } finally {
      rmSync(join(scratch, '..'), { recursive: true, force: true });
    }
  });
  it('Subject returns the trimmed subject line of a commit through the runner', async () => {
    const calls: { args: string[]; cwd: string }[] = [];
    const fake = new GitRepo('/repo', async (args, cwd) => { calls.push({ args, cwd }); return '  fix(core): keep the cache per user  \n'; });
    expect(await fake.Subject('abc1234')).toBe('fix(core): keep the cache per user');
    expect(calls).toEqual([{ args: ['-c', 'core.quotePath=false', 'log', '-1', '--format=%s', 'abc1234'], cwd: '/repo' }]);
  });
  it('Diff with NoRenames passes --no-renames so a renamed file diffs as a delete and an add', async () => {
    const calls: string[][] = [];
    const fake = new GitRepo('/repo', async (args) => { calls.push(args); return ''; });
    await fake.Diff('aaa1111', 'bbb2222', [], { NoRenames: true });
    expect(calls[0]).toContain('--no-renames');
  });
  it('LaterCommitsTouching lists the landing commits after a commit on origin/next that touch the paths', async () => {
    const calls: string[][] = [];
    const fake = new GitRepo('/repo', async (args) => { calls.push(args); return 'a'.repeat(40) + '\n' + 'b'.repeat(40) + '\n'; });
    expect(await fake.LaterCommitsTouching('abc1234', ['packages/X/src/a.ts', 'packages/X/src/b.ts'])).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
    expect(calls).toEqual([['-c', 'core.quotePath=false', 'log', '--first-parent', '--format=%H', 'abc1234..origin/next', '--', 'packages/X/src/a.ts', 'packages/X/src/b.ts']]);
  });
  it('BlameFirstParent returns one 40-hex SHA per blamed line', async () => {
    const calls: string[][] = [];
    const out = [
      `${'1'.repeat(40)} (t 2026-01-01 10:00:00 +0000 3) const a = 1;`,
      `^${'2'.repeat(40)} (t 2026-01-01 10:00:00 +0000 4) const b = 2;`,
      `${'3'.repeat(40)} (t 2026-01-01 10:00:00 +0000 9) const c = 3;`,
    ].join('\n') + '\n';
    const fake = new GitRepo('/repo', async (args) => { calls.push(args); return out; });
    expect(await fake.BlameFirstParent('abc1234', 'packages/X/src/a.ts', [{ Start: 3, End: 4 }, { Start: 9, End: 9 }])).toEqual(['1'.repeat(40), '2'.repeat(40), '3'.repeat(40)]);
    expect(calls[0]).toEqual(expect.arrayContaining(['blame', '-l', '--first-parent', '-L', '3,4', '-L', '9,9', 'abc1234', '--', 'packages/X/src/a.ts']));
  });
});
