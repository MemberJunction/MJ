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
  analyzeManifestConflict,
  classifyMergeConflicts,
  findStaleVersions,
  isManifestPath,
  mergeMainIntoNext,
  refreshLockfile,
  nextPushRemote,
  LOCKFILE,
} from './back-merge.mjs';

/** Escapes every regex metacharacter so a literal string can sit inside a RegExp. */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);

/**
 * Minimal simple-git stand-in. Records every call so a test can assert on what the
 * back-merge did to the working tree, not just on what it returned.
 */
function fakeGit({ branch = 'next', mergeResults = [], status = {}, blobs = {} } = {}) {
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
      raw: async (args) => {
        // `git show :<stage>:<path>` reads one side of a conflict; everything else is recorded.
        if (args[0] === 'show') {
          if (!(args[1] in blobs)) throw new Error(`fatal: path '${args[1]}' does not exist`);
          return blobs[args[1]];
        }
        calls.push(['raw', ...args]);
      },
      add: async (path) => void calls.push(['add', path]),
      commit: async (message) => void calls.push(['commit', message]),
    },
  };
}

const names = (calls) => calls.map((c) => c.join(' '));

test('classifyMergeConflicts: the lockfile is regenerable, manifests need a look, nothing else is', () => {
  assert.deepEqual(classifyMergeConflicts([]), {
    unresolvable: [],
    manifests: [],
    lockfileConflicted: false,
  });
  assert.deepEqual(classifyMergeConflicts([LOCKFILE]), {
    unresolvable: [],
    manifests: [],
    lockfileConflicted: true,
  });
  assert.deepEqual(classifyMergeConflicts(['packages/MJCore/src/index.ts']), {
    unresolvable: ['packages/MJCore/src/index.ts'],
    manifests: [],
    lockfileConflicted: false,
  });
  assert.deepEqual(classifyMergeConflicts([LOCKFILE, 'turbo.json', 'packages/MJCore/package.json']), {
    unresolvable: ['turbo.json'],
    manifests: ['packages/MJCore/package.json'],
    lockfileConflicted: true,
  });
});

test('classifyMergeConflicts: tolerates an absent conflict list', () => {
  assert.deepEqual(classifyMergeConflicts(), {
    unresolvable: [],
    manifests: [],
    lockfileConflicted: false,
  });
});

test('isManifestPath: only files named package.json', () => {
  assert.equal(isManifestPath('package.json'), true);
  assert.equal(isManifestPath('packages/MJCore/package.json'), true);
  assert.equal(isManifestPath('packages/MJCore/package.json.bak'), false);
  assert.equal(isManifestPath('packages/MJCore/my-package.json'), false);
  assert.equal(isManifestPath('metadata/prompts/.rubric-evaluator-prompt.json'), false);
});

test('mergeMainIntoNext: a clean merge needs no lockfile regeneration', async () => {
  const { client, calls } = fakeGit({ mergeResults: [null] });
  assert.deepEqual(await mergeMainIntoNext(client), {
    lockfileConflicted: false,
    manifestsResolved: [],
  });
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

  assert.deepEqual(await mergeMainIntoNext(client), {
    lockfileConflicted: true,
    manifestsResolved: [],
  });
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
    mergeResults: [new Error('CONFLICTS: packages/MJCore/src/index.ts:content'), null],
    status: { conflicted: ['packages/MJCore/src/index.ts', LOCKFILE] },
  });

  await assert.rejects(
    () => mergeMainIntoNext(client),
    (err) => {
      assert.match(err.message, /not a lockfile or a version-only package\.json bump/);
      assert.match(err.message, /packages\/MJCore\/src\/index\.ts/);
      assert.match(err.message, /already published/, 'must say the release itself is fine');
      return true;
    }
  );
  assert.ok(names(calls).includes('merge --abort'), 'must leave next unchanged');
});

// --- package.json conflicts -----------------------------------------------------------
// `changeset version` rewrites every internal version line on main. When next edited a
// dependency list between the release cut and the publish, the two sides overlap and git
// stops — a conflict whose main side carries nothing but "bump to X". Each fixture below is
// modelled on a back-merge that had to be finished by hand.

const OLD = '6.1.0';
const NEW = '6.2.0-edge.0';

/** A manifest as text, laid out the way `changeset version` writes it. */
function manifest(fields) {
  return JSON.stringify(fields, null, 2) + '\n';
}

/** The merge base: the package as it stood when the release was cut. */
function basePackage() {
  return {
    name: '@memberjunction/ng-core-entity-forms',
    version: OLD,
    description: 'Forms',
    dependencies: {
      '@memberjunction/core': OLD,
      '@memberjunction/core-entities': OLD,
      '@memberjunction/global': OLD,
      '@memberjunction/skyway-core': '^0.7.1',
      rxjs: '^7.8.1',
    },
    devDependencies: { '@memberjunction/unit-testing': OLD },
    peerDependencies: { '@angular/core': '21.1.3' },
  };
}

/** Main's side: base after `changeset version` moved every internal version to NEW. */
function bumped(pkg) {
  const internal = (deps) =>
    Object.fromEntries(
      Object.entries(deps).map(([k, v]) => [k, k.startsWith('@memberjunction/') && v === OLD ? NEW : v])
    );
  return {
    ...pkg,
    version: NEW,
    dependencies: internal(pkg.dependencies),
    devDependencies: internal(pkg.devDependencies),
  };
}

const PKG = 'packages/Angular/Explorer/core-entity-forms/package.json';

/** Index stages for one conflicted manifest: 1 = merge base, 2 = next, 3 = main. */
function stages(path, { base, ours, theirs }) {
  return { [`:1:${path}`]: base, [`:2:${path}`]: ours, [`:3:${path}`]: theirs };
}

test('analyzeManifestConflict: a bump-only main side resolves to next with the new version', () => {
  // next changed a third-party line next to the internal ones after the cut.
  const ours = basePackage();
  ours.dependencies.rxjs = '^7.8.2';

  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: manifest(ours),
    theirs: manifest(bumped(basePackage())),
  });

  assert.equal(verdict.resolvable, true);
  assert.equal(verdict.releaseVersion, NEW);
  assert.deepEqual(verdict.oldVersions, [OLD]);
  const expected = bumped(basePackage());
  expected.dependencies.rxjs = '^7.8.2';
  assert.equal(verdict.content, manifest(expected), "next's structure, the release's versions");
});

test('analyzeManifestConflict: an internal dependency next added after the cut is bumped too', () => {
  // The case main's side cannot know about: next added a new @memberjunction dependency at
  // the pre-release version. Taking either side as-is would leave it stale or drop it.
  const ours = basePackage();
  ours.dependencies = {
    '@memberjunction/core': OLD,
    '@memberjunction/core-entities': OLD,
    '@memberjunction/feature-pipelines': OLD,
    '@memberjunction/global': OLD,
    '@memberjunction/skyway-core': '^0.7.1',
    rxjs: '^7.8.1',
  };

  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: manifest(ours),
    theirs: manifest(bumped(basePackage())),
  });

  assert.equal(verdict.resolvable, true);
  const resolved = JSON.parse(verdict.content);
  assert.deepEqual(Object.keys(resolved.dependencies), Object.keys(ours.dependencies), 'order kept');
  assert.equal(resolved.dependencies['@memberjunction/feature-pipelines'], NEW);
  assert.equal(resolved.version, NEW);
  assert.equal(resolved.devDependencies['@memberjunction/unit-testing'], NEW);
});

test('analyzeManifestConflict: internal packages main did not move keep next\'s value', () => {
  // Some @memberjunction packages ship from other repos on their own versions; the release
  // never touches them, so neither may the resolution.
  const ours = basePackage();
  ours.dependencies['@memberjunction/skyway-core'] = '^0.8.0';

  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: manifest(ours),
    theirs: manifest(bumped(basePackage())),
  });

  assert.equal(verdict.resolvable, true);
  assert.equal(JSON.parse(verdict.content).dependencies['@memberjunction/skyway-core'], '^0.8.0');
});

test('analyzeManifestConflict: a non-version change on main\'s side is a real conflict', () => {
  const theirs = bumped(basePackage());
  theirs.dependencies.rxjs = '^7.9.0';
  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: manifest(basePackage()),
    theirs: manifest(theirs),
  });
  assert.equal(verdict.resolvable, false);
  assert.match(verdict.reason, /more than version strings/);
});

test('analyzeManifestConflict: main adding, removing or reordering entries is a real conflict', () => {
  const base = manifest(basePackage());
  const ours = manifest(basePackage());

  const added = bumped(basePackage());
  added.dependencies['@memberjunction/ai'] = NEW;
  assert.match(analyzeManifestConflict({ base, ours, theirs: manifest(added) }).reason, /main added/);

  const removed = bumped(basePackage());
  delete removed.dependencies['@memberjunction/global'];
  assert.match(analyzeManifestConflict({ base, ours, theirs: manifest(removed) }).reason, /main removed/);

  const reordered = bumped(basePackage());
  const { description, ...rest } = reordered;
  const moved = analyzeManifestConflict({ base, ours, theirs: manifest({ ...rest, description }) });
  assert.equal(moved.resolvable, false);
});

test('analyzeManifestConflict: main changing an internal version by hand is a real conflict', () => {
  // Two different targets means main's side is not the one release bump.
  const theirs = bumped(basePackage());
  theirs.dependencies['@memberjunction/core'] = '6.1.1';
  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: manifest(basePackage()),
    theirs: manifest(theirs),
  });
  assert.equal(verdict.resolvable, false);
  assert.match(verdict.reason, /more than one value/);
});

test('analyzeManifestConflict: unparseable sides and no-bump sides are not resolved', () => {
  const base = manifest(basePackage());
  assert.match(
    analyzeManifestConflict({ base, ours: '{ "name": <<<<<<<', theirs: base }).reason,
    /not valid JSON/
  );
  assert.match(analyzeManifestConflict({ base, ours: base, theirs: base }).reason, /no version strings/);
});

test('analyzeManifestConflict: keeps next\'s indent and trailing newline', () => {
  const tabbed = JSON.stringify(basePackage(), null, '\t');
  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: tabbed,
    theirs: manifest(bumped(basePackage())),
  });
  assert.equal(verdict.content, JSON.stringify(bumped(basePackage()), null, '\t'));
});

test('analyzeManifestConflict: changes only the version strings in next\'s text', () => {
  // next's own layout (inline arrays, compact objects) must survive the resolution.
  const ours =
    manifest(basePackage()).replace('"description": "Forms",', '"description": "Forms",\n  "files": ["/dist"],');
  const base = manifest({ ...basePackage() });
  const verdict = analyzeManifestConflict({ base, ours, theirs: manifest(bumped(basePackage())) });
  assert.equal(verdict.resolvable, true);
  assert.equal(verdict.content, ours.replaceAll(`"${OLD}"`, () => `"${NEW}"`));
  assert.match(verdict.content, /"files": \["\/dist"\]/);
});

test('analyzeManifestConflict: rewrites the whole file when a text edit would touch other keys', () => {
  // A nested `version` at the old value is not the package's own version; the text edit
  // would move it too, so the result is rebuilt from the parsed manifest instead.
  const ours = { ...basePackage(), nested: { version: OLD } };
  const verdict = analyzeManifestConflict({
    base: manifest(basePackage()),
    ours: manifest(ours),
    theirs: manifest(bumped(basePackage())),
  });
  assert.equal(verdict.resolvable, true);
  const resolved = JSON.parse(verdict.content);
  assert.equal(resolved.nested.version, OLD, 'a nested key is not a version entry');
  assert.equal(resolved.version, NEW);
});

test('findStaleVersions: names every internal entry still at a pre-release version', () => {
  const pkg = bumped(basePackage());
  assert.deepEqual(findStaleVersions(pkg, new Set([OLD])), []);
  pkg.dependencies['@memberjunction/feature-pipelines'] = OLD;
  pkg.version = OLD;
  assert.deepEqual(findStaleVersions(pkg, new Set([OLD])), [
    `version@${OLD}`,
    `dependencies:@memberjunction/feature-pipelines@${OLD}`,
  ]);
});

test('mergeMainIntoNext: a version-only package.json conflict is resolved and committed', async () => {
  const ours = basePackage();
  ours.dependencies['@memberjunction/feature-pipelines'] = OLD;
  const written = new Map();
  const { client, calls } = fakeGit({
    mergeResults: [new Error(`CONFLICTS: ${PKG}:content`)],
    status: { conflicted: [PKG, LOCKFILE] },
    blobs: stages(PKG, {
      base: manifest(basePackage()),
      ours: manifest(ours),
      theirs: manifest(bumped(basePackage())),
    }),
  });

  const result = await mergeMainIntoNext(client, { writeFile: (p, c) => written.set(p, c) });

  assert.deepEqual(result, { lockfileConflicted: true, manifestsResolved: [PKG] });
  const resolved = JSON.parse(written.get(PKG));
  assert.equal(resolved.version, NEW);
  assert.equal(resolved.dependencies['@memberjunction/feature-pipelines'], NEW);
  assert.deepEqual(findStaleVersions(resolved, new Set([OLD])), []);
  assert.deepEqual(names(calls), [
    'fetch origin main',
    'merge --no-edit origin/main',
    `add ${PKG}`,
    `raw checkout --ours -- ${LOCKFILE}`,
    `add ${LOCKFILE}`,
    'raw commit --no-edit',
  ]);
});

test('mergeMainIntoNext: one real conflict aborts the merge with nothing written', async () => {
  // A bump-only manifest next to hand-authored conflicts (code, metadata): the manifest
  // alone would be resolvable, but the merge still needs a human, so none of it is applied.
  const ts = 'packages/Angular/Explorer/core-entity-forms/src/lib/custom/form.component.ts';
  const meta = 'metadata/prompts/.evaluator-prompt.json';
  const written = new Map();
  const { client, calls } = fakeGit({
    mergeResults: [new Error('CONFLICTS'), null],
    status: { conflicted: [meta, ts, PKG] },
    blobs: stages(PKG, {
      base: manifest(basePackage()),
      ours: manifest(basePackage()),
      theirs: manifest(bumped(basePackage())),
    }),
  });

  await assert.rejects(
    () => mergeMainIntoNext(client, { writeFile: (p, c) => written.set(p, c) }),
    (err) => {
      assert.match(err.message, new RegExp(`${escapeRegExp(meta)}, ${escapeRegExp(ts)}`));
      assert.ok(!err.message.includes(PKG), 'the resolvable manifest is not blamed');
      return true;
    }
  );
  assert.equal(written.size, 0);
  assert.ok(names(calls).includes('merge --abort'));
  assert.ok(!names(calls).some((c) => c.startsWith('add ') || c.includes('commit')));
});

test('mergeMainIntoNext: a package.json with a real change on main aborts and says why', async () => {
  const theirs = bumped(basePackage());
  theirs.scripts = { build: 'tsc' };
  const written = new Map();
  const { client, calls } = fakeGit({
    mergeResults: [new Error('CONFLICTS'), null],
    status: { conflicted: [PKG] },
    blobs: stages(PKG, {
      base: manifest(basePackage()),
      ours: manifest(basePackage()),
      theirs: manifest(theirs),
    }),
  });

  await assert.rejects(
    () => mergeMainIntoNext(client, { writeFile: (p, c) => written.set(p, c) }),
    (err) => {
      assert.match(err.message, new RegExp(`${escapeRegExp(PKG)}: main changed more than version strings`));
      assert.match(err.message, /already published/);
      return true;
    }
  );
  assert.equal(written.size, 0);
  assert.ok(names(calls).includes('merge --abort'));
});

test('mergeMainIntoNext: a package.json added or deleted on one side aborts', async () => {
  // No merge-base stage: there is no "only a bump" to compare against.
  const { client, calls } = fakeGit({
    mergeResults: [new Error('CONFLICTS'), null],
    status: { conflicted: [PKG] },
    blobs: { [`:2:${PKG}`]: manifest(basePackage()), [`:3:${PKG}`]: manifest(bumped(basePackage())) },
  });
  await assert.rejects(() => mergeMainIntoNext(client), /a side is missing/);
  assert.ok(names(calls).includes('merge --abort'));
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
