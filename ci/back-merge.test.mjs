// Tests for ci/back-merge.mjs — run with: node --test "ci/*.test.mjs"
// (also run in CI by .github/workflows/ci-scripts.yml, install-free)
//
// The behaviour under test is the back-merge's refusal to guess. It replaced a blind
// `-X theirs`, which was invisible only while `next` was assumed frozen for the release.
// Releases ship from a release/* prep branch cut at an earlier commit, so `next` has hours
// of merges main never saw — and `-X theirs` would silently discard all of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMergeConflicts,
  mergeMainIntoNext,
  refreshLockfile,
  nextPushRemote,
  LOCKFILE,
} from './back-merge.mjs';

/**
 * Minimal simple-git stand-in. Records every call so a test can assert on what the
 * back-merge did to the working tree, not just on what it returned.
 */
function fakeGit({ branch = 'next', mergeResults = [], status = {} } = {}) {
  const calls = [];
  const merges = [...mergeResults];
  return {
    calls,
    client: {
      revparse: async () => `${branch}\n`,
      fetch: async (...args) => void calls.push(['fetch', ...args]),
      merge: async (args) => {
        calls.push(['merge', ...args]);
        const outcome = merges.shift();
        if (outcome instanceof Error) throw outcome;
      },
      status: async () => ({ conflicted: [], modified: [], not_added: [], ...status }),
      raw: async (args) => void calls.push(['raw', ...args]),
      add: async (path) => void calls.push(['add', path]),
      commit: async (message) => void calls.push(['commit', message]),
    },
  };
}

const names = (calls) => calls.map((c) => c.join(' '));

test('classifyMergeConflicts: the lockfile is regenerable, nothing else is', () => {
  assert.deepEqual(classifyMergeConflicts([]), { unresolvable: [], lockfileConflicted: false });
  assert.deepEqual(classifyMergeConflicts([LOCKFILE]), {
    unresolvable: [],
    lockfileConflicted: true,
  });
  assert.deepEqual(classifyMergeConflicts(['packages/MJCore/src/index.ts']), {
    unresolvable: ['packages/MJCore/src/index.ts'],
    lockfileConflicted: false,
  });
  assert.deepEqual(classifyMergeConflicts([LOCKFILE, 'turbo.json']), {
    unresolvable: ['turbo.json'],
    lockfileConflicted: true,
  });
});

test('classifyMergeConflicts: tolerates an absent conflict list', () => {
  assert.deepEqual(classifyMergeConflicts(), { unresolvable: [], lockfileConflicted: false });
});

test('mergeMainIntoNext: a clean merge needs no lockfile regeneration', async () => {
  const { client, calls } = fakeGit({ mergeResults: [null] });
  assert.deepEqual(await mergeMainIntoNext(client), { lockfileConflicted: false });
  assert.deepEqual(names(calls), ['fetch origin main', 'merge --no-edit origin/main']);
});

test('mergeMainIntoNext: refuses to run anywhere but next', async () => {
  const { client, calls } = fakeGit({ branch: 'main' });
  await assert.rejects(() => mergeMainIntoNext(client), /must run on next, but HEAD is 'main'/);
  assert.deepEqual(calls, [], 'must not fetch or merge from the wrong branch');
});

test('mergeMainIntoNext: a lockfile-only conflict resolves to a placeholder', async () => {
  const { client, calls } = fakeGit({
    mergeResults: [new Error('CONFLICTS: pnpm-lock.yaml:content')],
    status: { conflicted: [LOCKFILE] },
  });

  assert.deepEqual(await mergeMainIntoNext(client), { lockfileConflicted: true });
  assert.deepEqual(names(calls), [
    'fetch origin main',
    'merge --no-edit origin/main',
    `raw checkout --ours -- ${LOCKFILE}`,
    `add ${LOCKFILE}`,
    'raw commit --no-edit',
  ]);
});

test('mergeMainIntoNext: a conflict outside the lockfile aborts rather than picking a side', async () => {
  // This is the regression the whole change exists for: under `-X theirs` this merge
  // succeeded silently with main's copy, dropping whatever landed on next after the pin.
  const { client, calls } = fakeGit({
    mergeResults: [new Error('CONFLICTS: packages/MJCore/package.json:content'), null],
    status: { conflicted: ['packages/MJCore/package.json', LOCKFILE] },
  });

  await assert.rejects(
    () => mergeMainIntoNext(client),
    (err) => {
      assert.match(err.message, /conflicts outside pnpm-lock\.yaml/);
      assert.match(err.message, /packages\/MJCore\/package\.json/);
      assert.match(err.message, /already published/, 'must say the release itself is fine');
      return true;
    }
  );
  assert.ok(names(calls).includes('merge --abort'), 'must leave next unchanged');
});

test('mergeMainIntoNext: a non-conflict merge failure is raised, not aborted', async () => {
  const { client, calls } = fakeGit({ mergeResults: [new Error('fatal: refusing to merge')] });
  await assert.rejects(() => mergeMainIntoNext(client), /no conflicts to resolve/);
  assert.ok(!names(calls).includes('merge --abort'), 'there is no merge in progress to abort');
});

test('refreshLockfile: a failed regeneration is fatal when it is load-bearing', async () => {
  const { client } = fakeGit();
  const boom = () => {
    throw new Error('ERR_PNPM_NO_MATCHING_VERSION');
  };

  await assert.rejects(
    () => refreshLockfile(client, { required: true, runInstall: boom }),
    (err) => {
      assert.match(err.message, /Refusing to push it/);
      assert.match(err.message, /ERR_PNPM_NO_MATCHING_VERSION/, 'must surface the cause');
      return true;
    }
  );
});

test('refreshLockfile: a failed regeneration is survivable when the merge was clean', async () => {
  const { client, calls } = fakeGit();
  const boom = () => {
    throw new Error('registry timeout');
  };

  // An already-published release must not be failed by a lockfile hiccup.
  assert.equal(await refreshLockfile(client, { required: false, runInstall: boom }), false);
  assert.deepEqual(calls, [], 'nothing committed');
});

test('refreshLockfile: an unchanged lockfile produces no commit', async () => {
  const { client, calls } = fakeGit({ status: { modified: [], not_added: [] } });
  assert.equal(await refreshLockfile(client, { required: false, runInstall: () => {} }), false);
  assert.deepEqual(calls, []);
});

// --- nextPushRemote -------------------------------------------------------------------
// `next` is protected and the release PAT's account can never hold a ruleset bypass (it is
// an outside collaborator, and bypass accepts only roles, teams and Apps). The push is
// therefore redirected to an App-authenticated remote in CI — but a developer running
// `pnpm run mergemain` by hand must keep the old behaviour.

test('nextPushRemote defaults to origin so a local mergemain is unchanged', () => {
  const prior = process.env.MJ_NEXT_PUSH_REMOTE;
  delete process.env.MJ_NEXT_PUSH_REMOTE;
  try {
    assert.equal(nextPushRemote(), 'origin');
  } finally {
    if (prior !== undefined) process.env.MJ_NEXT_PUSH_REMOTE = prior;
  }
});

test('nextPushRemote honours the override CI sets', () => {
  const prior = process.env.MJ_NEXT_PUSH_REMOTE;
  process.env.MJ_NEXT_PUSH_REMOTE = 'next-push';
  try {
    assert.equal(nextPushRemote(), 'next-push');
  } finally {
    if (prior === undefined) delete process.env.MJ_NEXT_PUSH_REMOTE;
    else process.env.MJ_NEXT_PUSH_REMOTE = prior;
  }
});

test('nextPushRemote treats an empty or blank override as unset', () => {
  // An unset secret or a `with:` that resolved to nothing yields '' — falling back to
  // origin fails loudly on the protection rather than pushing to a remote named ''.
  const prior = process.env.MJ_NEXT_PUSH_REMOTE;
  for (const blank of ['', '   ']) {
    process.env.MJ_NEXT_PUSH_REMOTE = blank;
    assert.equal(nextPushRemote(), 'origin');
  }
  if (prior === undefined) delete process.env.MJ_NEXT_PUSH_REMOTE;
  else process.env.MJ_NEXT_PUSH_REMOTE = prior;
});
