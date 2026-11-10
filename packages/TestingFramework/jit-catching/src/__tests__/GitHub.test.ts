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
