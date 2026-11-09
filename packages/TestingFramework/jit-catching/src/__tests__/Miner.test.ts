import { describe, it, expect, vi } from 'vitest';
import { PullRequestNumberOf, IsEligibleSource, MineClean, MineBugs, type MinerDeps } from '../corpus/Miner';
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

interface Fakes { windows: Record<string, MergedPullRequest[]>; details: MergedPullRequestDetail[]; later?: Record<string, string[]>; diffs?: Record<string, string>; blames?: Record<string, string[]>; subjects?: Record<string, string>; }
function fakeDeps(f: Fakes): MinerDeps {
  return {
    GitHub: {
      ListMergedPullRequests: vi.fn(async (o: { Since: string; Until: string }) => f.windows[`${o.Since}..${o.Until}`] ?? []),
      GetMergedPullRequest: vi.fn(async (n: number) => {
        const d = f.details.find((x) => x.Number === n); if (!d) throw new Error(`PR #${n} is not merged`); return d;
      }),
    },
    Repo: {
      LaterCommitsTouching: vi.fn(async (s: string) => f.later?.[s] ?? []),
      BlameFirstParent: vi.fn(async (s: string, path: string) => f.blames?.[`${s}:${path}`] ?? []),
      Diff: vi.fn(async (_base: string, head: string) => f.diffs?.[head] ?? ''),
      FirstParent: vi.fn(async (s: string) => `${s}^1`),
      Subject: vi.fn(async (s: string) => f.subjects?.[s] ?? 'direct push'),
    },
    PackageMap: packageMap,
  };
}

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
});

describe('MineClean', () => {
  it('splits the window into months, de-duplicates PRs, and drops later-touched, source-free and too-large PRs', async () => {
    const p10 = pr(10, 'feat: clean', 'a'); const p11 = pr(11, 'feat: touched later', 'b'); const p12 = pr(12, 'docs: readme', 'c'); const p13 = pr(13, 'feat: huge', 'd');
    const d = fakeDeps({
      windows: { '2026-01-15..2026-01-31': [p10, p11, p12], '2026-02-01..2026-02-10': [p10, p13] },
      details: [
        detail(p10, ['packages/X/src/a.ts', 'packages/X/src/__tests__/a.test.ts', 'README.md']),
        detail(p11, ['packages/X/src/b.ts']),
        detail(p12, ['packages/X/README.md']),
        detail(p13, Array.from({ length: 100 }, (_, i) => `packages/X/src/f${i}.ts`)),
      ],
      later: { [sha('b')]: [sha('e')] },
    });
    const clean = await MineClean(d, { Since: '2026-01-15', Until: '2026-02-10' });
    expect(d.GitHub.ListMergedPullRequests).toHaveBeenCalledTimes(2);
    expect(d.GitHub.ListMergedPullRequests).toHaveBeenNthCalledWith(1, { Since: '2026-01-15', Until: '2026-01-31' });
    expect(d.GitHub.ListMergedPullRequests).toHaveBeenNthCalledWith(2, { Since: '2026-02-01', Until: '2026-02-10' });
    expect(clean).toEqual([{ PR: 10, MergeSHA: sha('a'), MergedAt: p10.MergedAt, Title: 'feat: clean', Files: ['packages/X/src/a.ts'] }]);
    expect(d.Repo.LaterCommitsTouching).toHaveBeenCalledWith(sha('a'), ['packages/X/src/a.ts']);
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
});
