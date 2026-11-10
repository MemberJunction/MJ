import { describe, it, expect, vi } from 'vitest';
import { PullRequestNumberOf, IsEligibleSource, MineClean, MineBugs, RemovedRangesByFile, type MinerDeps } from '../corpus/Miner';
import type { MergedPullRequest, MergedPullRequestDetail } from '../git/GitHub';
import type { WorkspacePackage } from '../analyzer/PackageMap';

const sha = (c: string): string => c.repeat(40);
const pr = (n: number, title: string, c: string): MergedPullRequest => ({ Number: n, Title: title, MergedAt: '2026-01-20T10:00:00Z', MergeSHA: sha(c), Author: 'dev', HeadRef: `b${n}` });
const detail = (p: MergedPullRequest, files: string[]): MergedPullRequestDetail => ({ ...p, Body: '', Files: files });

const packageMap = {
  PackageForPath: (path: string): WorkspacePackage | null =>
    path.startsWith('packages/X/') ? { Name: '@mj/x', Dir: 'packages/X', HasVitest: true, HasTests: true }
    : path.startsWith('packages/NoVitest/') ? { Name: '@mj/nv', Dir: 'packages/NoVitest', HasVitest: false, HasTests: false }
    : null,
};

interface Fakes { windows: Record<string, MergedPullRequest[]>; details: MergedPullRequestDetail[]; later?: Record<string, string[]>; diffs?: Record<string, string>; renameDiffs?: Record<string, string>; blames?: Record<string, string[]>; subjects?: Record<string, string>; failures?: Record<number, string>; }
function fakeDeps(f: Fakes): MinerDeps {
  return {
    GitHub: {
      ListMergedPullRequests: vi.fn(async (o: { Since: string; Until: string }) => f.windows[`${o.Since}..${o.Until}`] ?? []),
      GetMergedPullRequest: vi.fn(async (n: number) => {
        if (f.failures?.[n]) throw new Error(f.failures[n]);
        const d = f.details.find((x) => x.Number === n); if (!d) throw new Error(`PR #${n} is not merged`); return d;
      }),
    },
    Repo: {
      LaterCommitsTouching: vi.fn(async (s: string) => f.later?.[s] ?? []),
      BlameFirstParent: vi.fn(async (s: string, path: string) => f.blames?.[`${s}:${path}`] ?? []),
      Diff: vi.fn(async (_base: string, head: string, _paths?: string[], o?: { NoRenames?: boolean }) => (!o?.NoRenames && f.renameDiffs?.[head]) || (f.diffs?.[head] ?? '')),
      FirstParent: vi.fn(async (s: string) => `${s}^1`),
      Subject: vi.fn(async (s: string) => f.subjects?.[s] ?? 'direct push'),
    },
    PackageMap: packageMap,
  };
}

describe('RemovedRangesByFile', () => {
  it('does not count a no-newline marker as a line of the old file', () => {
    const lines = ['-a', '\\ No newline at end of file', '-b', ' c', '-d'];
    expect(RemovedRangesByFile([{ Path: 'packages/X/src/a.ts', OldStart: 10, OldLines: 4, NewStart: 10, NewLines: 1, Lines: lines }]))
      .toEqual({ 'packages/X/src/a.ts': [{ Start: 10, End: 11 }, { Start: 13, End: 13 }] });
  });
});

describe('PullRequestNumberOf', () => {
  it('reads a merge-commit subject, a squash subject, and returns null for a plain subject', () => {
    expect(PullRequestNumberOf('Merge pull request #42 from MemberJunction/feature-x')).toBe(42);
    expect(PullRequestNumberOf('fix(core): keep the cache per user (#123)')).toBe(123);
    expect(PullRequestNumberOf('chore: bump versions')).toBeNull();
  });
});

describe('IsEligibleSource', () => {
  it('accepts non-test TypeScript under src of a vitest package only', () => {
    expect(IsEligibleSource('packages/X/src/a.ts', packageMap)).toBe(true);
    expect(IsEligibleSource('packages/X/src/__tests__/a.test.ts', packageMap)).toBe(false);
    expect(IsEligibleSource('packages/X/README.md', packageMap)).toBe(false);
    expect(IsEligibleSource('packages/NoVitest/src/a.ts', packageMap)).toBe(false);
  });
  it('rejects spec files and helpers under __tests__', () => {
    expect(IsEligibleSource('packages/X/src/a.spec.ts', packageMap)).toBe(false);
    expect(IsEligibleSource('packages/X/src/__tests__/helpers/fakes.ts', packageMap)).toBe(false);
  });
});

const fixDiff = [
  'diff --git a/packages/X/src/a.ts b/packages/X/src/a.ts',
  '--- a/packages/X/src/a.ts',
  '+++ b/packages/X/src/a.ts',
  '@@ -2,4 +2,3 @@',
  ' keep2',
  '-old3',
  '-old4',
  '+new3',
  ' keep5',
  '@@ -10 +9 @@',
  '-old10',
  '+new10',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  '',
].join('\n');

describe('MineClean', () => {
  it('splits the window into months, de-duplicates PRs, and drops source-free and too-large PRs', async () => {
    const p10 = pr(10, 'feat: clean', 'a'); const p12 = pr(12, 'docs: readme', 'c'); const p13 = pr(13, 'feat: huge', 'd');
    const d = fakeDeps({
      windows: { '2026-01-15..2026-01-31': [p10, p12], '2026-02-01..2026-02-10': [p10, p13] },
      details: [
        detail(p10, ['packages/X/src/a.ts', 'packages/X/src/__tests__/a.test.ts', 'README.md']),
        detail(p12, ['packages/X/README.md']),
        detail(p13, Array.from({ length: 100 }, (_, i) => `packages/X/src/f${i}.ts`)),
      ],
    });
    const clean = await MineClean(d, { Since: '2026-01-15', Until: '2026-02-10' });
    expect(d.GitHub.ListMergedPullRequests).toHaveBeenCalledTimes(2);
    expect(d.GitHub.ListMergedPullRequests).toHaveBeenNthCalledWith(1, { Since: '2026-01-15', Until: '2026-01-31' });
    expect(d.GitHub.ListMergedPullRequests).toHaveBeenNthCalledWith(2, { Since: '2026-02-01', Until: '2026-02-10' });
    expect(clean).toEqual([{ PR: 10, MergeSHA: sha('a'), MergedAt: p10.MergedAt, Title: 'feat: clean', Files: ['packages/X/src/a.ts'] }]);
    expect(d.Repo.LaterCommitsTouching).toHaveBeenCalledWith(sha('a'), ['packages/X/src/a.ts']);
  });

  const candidate = pr(20, 'feat: candidate', 'a');
  const window = { Since: '2026-01-01', Until: '2026-01-31' };
  const later = (fix: MergedPullRequest, blamed: string, extra: Partial<Fakes> = {}): Fakes => ({
    windows: { '2026-01-01..2026-01-31': [candidate] },
    details: [detail(candidate, ['packages/X/src/a.ts']), detail(fix, ['packages/X/src/a.ts'])],
    later: { [sha('a')]: [fix.MergeSHA] },
    diffs: { [fix.MergeSHA]: fixDiff },
    blames: { [`${fix.MergeSHA}^1:packages/X/src/a.ts`]: [blamed] },
    subjects: { [fix.MergeSHA]: `Merge pull request #${fix.Number} from MemberJunction/b${fix.Number}`, [sha('a')]: 'feat: candidate (#20)', [sha('9')]: 'feat: other (#99)' },
    ...extra,
  });

  it('keeps a PR whose file a later non-fix landing commit rewrote', async () => {
    const d = fakeDeps(later(pr(30, 'feat: rewrite a', 'e'), sha('a')));
    expect((await MineClean(d, window)).map((c) => c.PR)).toEqual([20]);
  });

  it('keeps a PR whose file a later fix touched when the removed lines blame to another PR', async () => {
    const d = fakeDeps(later(pr(31, 'fix: other bug', 'e'), sha('9')));
    expect((await MineClean(d, window)).map((c) => c.PR)).toEqual([20]);
  });

  it('drops a PR whose line a later fix removed', async () => {
    const d = fakeDeps(later(pr(31, 'fix: candidate bug', 'e'), sha('a')));
    expect(await MineClean(d, window)).toEqual([]);
  });

  it('fetches a later fix PR once when two candidates share it', async () => {
    const fix = pr(31, 'fix: other bug', 'e'); const second = pr(21, 'feat: second', 'b');
    const f = later(fix, sha('9'));
    const d = fakeDeps({
      ...f,
      windows: { '2026-01-01..2026-01-31': [candidate, second] },
      details: [...f.details, detail(second, ['packages/X/src/a.ts'])],
      later: { [sha('a')]: [fix.MergeSHA], [sha('b')]: [fix.MergeSHA] },
    });
    expect((await MineClean(d, window)).map((c) => c.PR)).toEqual([20, 21]);
    expect(vi.mocked(d.GitHub.GetMergedPullRequest).mock.calls.filter(([n]) => n === 31)).toHaveLength(1);
  });
});


describe('MineBugs', () => {
  it('blames the removed ranges at the fix parent, picks the PR with most lines, and skips self-blame and too-large bug PRs', async () => {
    const fix200 = pr(200, 'fix(core): wrong cache key', 'f'); const fix300 = pr(300, 'fix: own lines', '7'); const fix400 = pr(400, 'Fix!: huge introducer', '8'); const feat = pr(500, 'feat: not a fix', '9');
    const bug123 = pr(123, 'feat(core): add cache', '1'); const big160 = pr(160, 'feat: big', '6');
    const d = fakeDeps({
      windows: { '2025-12-20..2025-12-31': [fix200, feat], '2026-01-01..2026-01-05': [fix200, fix300, fix400] },
      details: [detail(bug123, ['packages/X/src/a.ts']), detail(big160, Array.from({ length: 100 }, (_, i) => `packages/X/src/f${i}.ts`))],
      diffs: { [sha('f')]: fixDiff, [sha('7')]: fixDiff, [sha('8')]: fixDiff },
      blames: {
        [`${sha('f')}^1:packages/X/src/a.ts`]: [sha('1'), sha('1'), sha('2')],
        [`${sha('7')}^1:packages/X/src/a.ts`]: [sha('3'), sha('3'), sha('3')],
        [`${sha('8')}^1:packages/X/src/a.ts`]: [sha('4'), sha('4'), sha('4')],
      },
      subjects: { [sha('1')]: 'feat(core): add cache (#123)', [sha('2')]: 'Merge pull request #150 from MemberJunction/x', [sha('3')]: 'fix: own lines (#300)', [sha('4')]: 'feat: big (#160)' },
    });
    const bugs = await MineBugs(d, { Since: '2025-12-20', Until: '2026-01-05' });
    expect(bugs).toEqual([{ FixPR: 200, FixMergeSHA: sha('f'), FixTitle: 'fix(core): wrong cache key', BugPR: 123, BugMergeSHA: sha('1'), BugTitle: 'feat(core): add cache', BlamedLines: 2, Files: ['packages/X/src/a.ts'] }]);
    expect(d.Repo.BlameFirstParent).toHaveBeenCalledWith(`${sha('f')}^1`, 'packages/X/src/a.ts', [{ Start: 3, End: 4 }, { Start: 10, End: 10 }]);
    expect(d.Repo.BlameFirstParent).toHaveBeenCalledTimes(3);
    expect(d.Repo.Diff).not.toHaveBeenCalledWith(expect.anything(), sha('9'));
  });

  it('blames the old path when the fix renames and edits a file', async () => {
    const fix = pr(600, 'fix: rename and edit', 'c'); const bug = pr(124, 'feat: old file', '5');
    const renameDiff = ['diff --git a/packages/X/src/old.ts b/packages/X/src/new.ts', 'similarity index 90%', 'rename from packages/X/src/old.ts', 'rename to packages/X/src/new.ts',
      '--- a/packages/X/src/old.ts', '+++ b/packages/X/src/new.ts', '@@ -3 +3 @@', '-bad', '+good', ''].join('\n');
    const splitDiff = ['diff --git a/packages/X/src/new.ts b/packages/X/src/new.ts', 'new file mode 100644', '--- /dev/null', '+++ b/packages/X/src/new.ts', '@@ -0,0 +1,2 @@', '+a', '+good',
      'diff --git a/packages/X/src/old.ts b/packages/X/src/old.ts', 'deleted file mode 100644', '--- a/packages/X/src/old.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-a', '-bad', ''].join('\n');
    const d = fakeDeps({
      windows: { '2026-03-01..2026-03-31': [fix] }, details: [detail(bug, ['packages/X/src/old.ts'])],
      renameDiffs: { [sha('c')]: renameDiff }, diffs: { [sha('c')]: splitDiff },
      blames: { [`${sha('c')}^1:packages/X/src/old.ts`]: [sha('5'), sha('5')] }, subjects: { [sha('5')]: 'feat: old file (#124)' },
    });
    const bugs = await MineBugs(d, { Since: '2026-03-01', Until: '2026-03-31' });
    expect(d.Repo.BlameFirstParent).toHaveBeenCalledWith(`${sha('c')}^1`, 'packages/X/src/old.ts', [{ Start: 1, End: 2 }]);
    expect(d.Repo.BlameFirstParent).not.toHaveBeenCalledWith(expect.anything(), 'packages/X/src/new.ts', expect.anything());
    expect(bugs.map((b) => b.BugPR)).toEqual([124]);
  });

  it('skips a fix whose top blamed number is not a merged PR or not a PR, and still mines the others', async () => {
    const fixA = pr(700, 'fix: a', 'a'); const fixB = pr(701, 'fix: b', 'b'); const fixC = pr(702, 'fix: c', 'e'); const bug = pr(123, 'feat(core): add cache', '1');
    const d = fakeDeps({
      windows: { '2026-04-01..2026-04-30': [fixA, fixB, fixC] }, details: [detail(bug, ['packages/X/src/a.ts'])],
      diffs: { [sha('a')]: fixDiff, [sha('b')]: fixDiff, [sha('e')]: fixDiff },
      blames: { [`${sha('a')}^1:packages/X/src/a.ts`]: [sha('2')], [`${sha('b')}^1:packages/X/src/a.ts`]: [sha('3')], [`${sha('e')}^1:packages/X/src/a.ts`]: [sha('1')] },
      subjects: { [sha('1')]: 'feat(core): add cache (#123)', [sha('2')]: 'wip (#900)', [sha('3')]: 'see issue (#901)' },
      failures: { 900: 'PR #900 is not merged', 901: 'Command failed: gh pr view 901\nGraphQL: Could not resolve to a PullRequest with the number of 901. (repository.pullRequest)' },
    });
    expect((await MineBugs(d, { Since: '2026-04-01', Until: '2026-04-30' })).map((b) => [b.FixPR, b.BugPR])).toEqual([[702, 123]]);
  });
});
