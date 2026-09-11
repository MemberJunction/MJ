// Tests for ci/backmerge-fallback.mjs — run with: node --test "ci/*.test.mjs"
// (also run in CI by .github/workflows/ci-scripts.yml, install-free)
//
// The behaviour under test is idempotency. This script runs on the unhappy path of an
// ALREADY-PUBLISHED release, which is exactly when a human re-runs the job — so "a
// previous attempt got part way" is the normal case, not an edge case. Stacking a second
// branch or a duplicate PR on a re-run would make a bad moment worse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backmergeBranchName, planFallback, prBody, main } from './backmerge-fallback.mjs';

test('branch name is version-stamped so re-runs reuse it', () => {
  assert.equal(backmergeBranchName('v6.1.0-edge.6'), 'chore/backmerge-v6.1.0-edge.6');
});

test('branch name normalises the v prefix', () => {
  // publish.yml has both spellings in flight — $VERSION is v-prefixed, ${VERSION#v} is
  // not. A pair of branches differing only by a `v` would defeat the idempotency.
  assert.equal(backmergeBranchName('6.1.0-edge.6'), backmergeBranchName('v6.1.0-edge.6'));
  assert.equal(backmergeBranchName('vv6.1.0'), 'chore/backmerge-v6.1.0');
});

test('branch name refuses an empty version rather than making chore/backmerge-v', () => {
  assert.throws(() => backmergeBranchName(''), /version is required/);
  assert.throws(() => backmergeBranchName(undefined), /version is required/);
});

test('fresh failure: push the branch and open the PR', () => {
  assert.deepEqual(planFallback({ branchExists: false, openPrUrl: null }),
    { pushBranch: true, createPr: true, note: 'creating the back-merge branch and PR' });
});

test('branch survived a half-finished run: reuse it, still open the PR', () => {
  const plan = planFallback({ branchExists: true, openPrUrl: null });
  assert.equal(plan.pushBranch, false);
  assert.equal(plan.createPr, true);
});

test('PR already open: touch nothing', () => {
  // Re-pushing main's tip over the branch could discard conflict resolutions a human has
  // already committed there — the whole point of the PR.
  const plan = planFallback({ branchExists: true, openPrUrl: 'https://github.com/o/r/pull/1' });
  assert.equal(plan.pushBranch, false);
  assert.equal(plan.createPr, false);
  assert.match(plan.note, /already open/);
});

test('PR body carries the failure reason and does not claim the release failed', () => {
  const body = prBody({ version: 'v6.1.0-edge.6', branch: 'b', base: 'next', reason: 'CONFLICT in x.ts' });
  assert.match(body, /CONFLICT in x\.ts/);
  assert.match(body, /The release itself is fine/);
  assert.match(body, /deliberately red/);
});

test('PR body survives an empty reason', () => {
  assert.match(prBody({ version: 'v1', branch: 'b', base: 'next', reason: '' }), /no failure detail/);
});

/** Records every command so a test can assert on what the script actually did. */
function fakeRun({ branchExists = false, existingPr = '', createdPr = 'https://github.com/o/r/pull/9' } = {}) {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    if (file === 'git' && args[0] === 'rev-parse') return 'abc123def456';
    if (file === 'git' && args[0] === 'ls-remote') {
      if (!branchExists) throw new Error('exit 2');
      return 'abc123 refs/heads/x';
    }
    if (file === 'gh' && args[1] === 'list') return existingPr;
    if (file === 'gh' && args[1] === 'create') return createdPr;
    return '';
  };
  return { calls, run };
}

test('fresh failure pushes main\'s tip to the versioned ref and opens one PR', async () => {
  const { calls, run } = fakeRun();
  const url = await main(['--version', 'v6.1.0-edge.6', '--remote', 'next-push'], { run, env: {}, log: () => {} });
  assert.equal(url, 'https://github.com/o/r/pull/9');

  const push = calls.find((c) => c[0] === 'git' && c[1] === 'push');
  // Pushes the resolved sha, not a local branch name: the working tree at this point
  // still holds the aborted merge's aftermath and must not be the source of truth.
  assert.deepEqual(push, ['git', 'push', 'next-push', 'abc123def456:refs/heads/chore/backmerge-v6.1.0-edge.6']);
  assert.equal(calls.filter((c) => c[0] === 'gh' && c[2] === 'create').length, 1);
});

test('re-run with a PR already open pushes nothing and creates nothing', async () => {
  const { calls, run } = fakeRun({ branchExists: true, existingPr: 'https://github.com/o/r/pull/4382' });
  const url = await main(['--version', 'v6.1.0-edge.6'], { run, env: {}, log: () => {} });
  assert.equal(url, 'https://github.com/o/r/pull/4382');
  assert.equal(calls.some((c) => c[1] === 'push'), false);
  assert.equal(calls.some((c) => c[0] === 'gh' && c[2] === 'create'), false);
});

test('main reads from origin even when pushing through another remote', async () => {
  // The push remote exists only to satisfy the protection on `next`; it is not guaranteed
  // to have been fetched, so `main` must be read from origin.
  const { calls, run } = fakeRun();
  await main(['--version', 'v1.0.0', '--remote', 'next-push'], { run, env: {}, log: () => {} });
  assert.deepEqual(calls[0], ['git', 'fetch', '--no-tags', 'origin', 'main']);
});

test('a missing version fails loudly instead of guessing', async () => {
  const { run } = fakeRun();
  await assert.rejects(() => main([], { run, env: {}, log: () => {} }), /usage:/);
});

test('gh is pinned to the repo when the runner provides one', async () => {
  const { calls, run } = fakeRun();
  await main(['--version', 'v1.0.0'], { run, env: { GITHUB_REPOSITORY: 'o/r' }, log: () => {} });
  for (const c of calls.filter((c) => c[0] === 'gh')) {
    assert.ok(c.includes('--repo') && c[c.indexOf('--repo') + 1] === 'o/r', `missing --repo: ${c.join(' ')}`);
  }
});

test('gh omits --repo when the runner provides none, rather than passing an empty one', async () => {
  const { calls, run } = fakeRun();
  await main(['--version', 'v1.0.0'], { run, env: {}, log: () => {} });
  assert.equal(calls.filter((c) => c[0] === 'gh').some((c) => c.includes('--repo')), false);
});
