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
