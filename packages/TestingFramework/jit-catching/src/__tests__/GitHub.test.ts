import { describe, it, expect } from 'vitest';
import { GitHub } from '../git/GitHub';

const payload = { number: 7, title: 'perf: cache', body: 'desc', headRefOid: 'c'.repeat(40), baseRefName: 'next', headRepository: { name: 'MJ' }, headRepositoryOwner: { login: 'MemberJunction' }, author: { login: 'dev' } };

describe('GitHub.GetPullRequest', () => {
  it('maps gh JSON to PullRequestInfo', async () => {
    const gh = new GitHub(async (args) => { expect(args.slice(0, 3)).toEqual(['pr', 'view', '7']); return JSON.stringify(payload); });
    expect(await gh.GetPullRequest(7)).toEqual({ Number: 7, Title: 'perf: cache', Body: 'desc', HeadSHA: 'c'.repeat(40), BaseRef: 'next', HeadRepo: 'MemberJunction/MJ', Author: 'dev' });
  });
  it('rejects a fork PR', async () => {
    const gh = new GitHub(async () => JSON.stringify({ ...payload, headRepositoryOwner: { login: 'someone' } }));
    await expect(gh.GetPullRequest(7)).rejects.toThrow(/fork/);
  });
  it('treats a null body as empty', async () => {
    const gh = new GitHub(async () => JSON.stringify({ ...payload, body: null }));
    expect((await gh.GetPullRequest(7)).Body).toBe('');
  });
});

const listItem = { number: 9, title: 'fix: x', mergedAt: '2026-10-01T00:00:00Z', mergeCommit: { oid: 'm'.repeat(40) }, author: { login: 'dev' }, headRefName: 'CB-x' };

describe('GitHub.ListMergedPullRequests', () => {
  it('maps gh JSON to MergedPullRequest and searches the merge window', async () => {
    const gh = new GitHub(async (args) => {
      expect(args.slice(0, 2)).toEqual(['pr', 'list']);
      expect(args).toContain('merged:2026-10-01..2026-10-31');
      return JSON.stringify([listItem]);
    });
    expect(await gh.ListMergedPullRequests({ Since: '2026-10-01', Until: '2026-10-31' })).toEqual([
      { Number: 9, Title: 'fix: x', MergedAt: '2026-10-01T00:00:00Z', MergeSHA: 'm'.repeat(40), Author: 'dev', HeadRef: 'CB-x' },
    ]);
  });
  it('throws when 1000 results come back', async () => {
    const gh = new GitHub(async () => JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ ...listItem, number: i }))));
    await expect(gh.ListMergedPullRequests({ Since: '2020-01-01', Until: '2026-10-31' })).rejects.toThrow(/1000/);
  });
});

const detail = { ...listItem, body: 'desc', files: [{ path: 'a.ts', additions: 1, deletions: 0 }, { path: 'b.ts', additions: 2, deletions: 3 }] };

describe('GitHub.GetMergedPullRequest', () => {
  it('maps gh JSON to MergedPullRequestDetail', async () => {
    const gh = new GitHub(async (args) => { expect(args.slice(0, 3)).toEqual(['pr', 'view', '9']); return JSON.stringify(detail); });
    expect(await gh.GetMergedPullRequest(9)).toEqual({
      Number: 9, Title: 'fix: x', MergedAt: '2026-10-01T00:00:00Z', MergeSHA: 'm'.repeat(40), Author: 'dev', HeadRef: 'CB-x', Body: 'desc', Files: ['a.ts', 'b.ts'],
    });
  });
  it('throws when the PR is not merged', async () => {
    const gh = new GitHub(async () => JSON.stringify({ ...detail, mergedAt: null, mergeCommit: null }));
    await expect(gh.GetMergedPullRequest(9)).rejects.toThrow(/not merged/);
  });
});

describe('GitHub retries', () => {
  const ghError = (stderr: string): Error => Object.assign(new Error(`Command failed: gh pr view 9\n${stderr}`), { stderr });
  const make = (results: (string | Error)[]) => {
    const calls: string[][] = []; const waits: number[] = []; const lines: string[] = [];
    const gh = new GitHub(async (args) => { calls.push(args); const r = results.shift(); if (r instanceof Error || r === undefined) throw r ?? new Error('no result'); return r; },
      { Sleep: async (ms) => { waits.push(ms); }, Warn: (line) => { lines.push(line); } });
    return { gh, calls, waits, lines };
  };

  it('retries a transient gh failure and returns the later success', async () => {
    const f = make([ghError('error connecting to api.github.com\ncheck your internet connection'), JSON.stringify(detail)]);
    expect((await f.gh.GetMergedPullRequest(9)).Number).toBe(9);
    expect(f.calls).toHaveLength(2);
    expect(f.waits).toEqual([2000]);
    expect(f.lines).toEqual(['gh retry 1/3 after error connecting to api.github.com']);
  });

  it('does not retry when GitHub says the number is not a pull request', async () => {
    const f = make([ghError('GraphQL: Could not resolve to a PullRequest with the number of 9. (repository.pullRequest)')]);
    await expect(f.gh.GetMergedPullRequest(9)).rejects.toThrow(/Could not resolve to a PullRequest/);
    expect(f.calls).toHaveLength(1);
  });

  it('throws the last error after three transient failures', async () => {
    const f = make([ghError('timeout 1'), ghError('timeout 2'), ghError('timeout 3'), JSON.stringify(detail)]);
    await expect(f.gh.GetMergedPullRequest(9)).rejects.toThrow(/timeout 3/);
    expect(f.calls).toHaveLength(3);
    expect(f.waits).toEqual([2000, 8000]);
    expect(f.lines).toEqual(['gh retry 1/3 after timeout 1', 'gh retry 2/3 after timeout 2']);
  });
});
