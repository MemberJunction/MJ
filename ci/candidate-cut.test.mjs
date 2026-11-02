// Tests for ci/candidate-cut.mjs. Run with: node --test ci/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    deriveCut,
    assertRequestedLineMatches,
    assertEdgePreMode,
    assertLedgerReadyForCut,
    assertFixedGroupAt,
    pendingChangesets,
    seedChangeset,
    preflightFailures,
    parseCliArgs,
    newestEdgeTag,
    keptChangesets,
    assertChangesetsAfterMerge,
    assertReenteredPreJson,
    parseWorkspaceGlobs,
    selectWorkspaceManifests,
    normalizedSpec,
    normalizeManifests,
    normalizeWorkingTree,
    syncNextToCandidate,
    prePublishCheck,
    mergeIntoNext,
    pushNext,
    parseMergeTreeConflicts,
    unresolvableConflicts,
    mergeIntoHead,
    trialMerge,
    MAX_PUSH_ATTEMPTS,
} from './candidate-cut.mjs';

test('deriveCut: 6.1.0-edge.5 cuts line 6.1 and hands Edge the 6.2 stream', () => {
    assert.deepEqual(deriveCut('6.1.0-edge.5'), {
        line: '6.1',
        version: '6.1.0',
        tag: 'v6.1.0',
        branch: 'lts/6.1',
        npmTag: 'lts-6.1',
        nextLine: '6.2',
    });
    assert.equal(deriveCut('7.0.0-edge.0').nextLine, '7.1');
    assert.equal(deriveCut('6.10.0-edge.12').branch, 'lts/6.10');
});

test('deriveCut refuses anything that is not an X.Y.0 Edge prerelease', () => {
    for (const bad of ['6.1.0', '6.1.1-edge.0', '6.1.0-beta.1', '5.51.2', '', undefined]) {
        assert.throws(() => deriveCut(bad), /not an Edge prerelease/, `expected rejection for ${bad}`);
    }
});

test('assertRequestedLineMatches ties the operator input to what the stream produces', () => {
    assert.equal(assertRequestedLineMatches('6.1', '6.1.0-edge.5').version, '6.1.0');
    assert.throws(() => assertRequestedLineMatches('6.2', '6.1.0-edge.5'), /does not match the stream/);
    assert.throws(() => assertRequestedLineMatches('lts/6.1', '6.1.0-edge.5'), /must look like X\.Y/);
    assert.throws(() => assertRequestedLineMatches(undefined, '6.1.0-edge.5'), /must look like X\.Y/);
});

test('assertEdgePreMode accepts live edge pre-mode only', () => {
    assert.doesNotThrow(() => assertEdgePreMode({ mode: 'pre', tag: 'edge' }));
    assert.throws(() => assertEdgePreMode(null), /missing/);
    assert.throws(() => assertEdgePreMode({ mode: 'exit', tag: 'edge' }), /half-finished cut/);
    assert.throws(() => assertEdgePreMode({ mode: 'pre', tag: 'beta' }), /tag "beta"/);
});

test('assertLedgerReadyForCut demands a reviewed candidate entry with no release yet', () => {
    const ready = { lines: { '6.1': { status: 'candidate', candidateDate: '2026-09-11' } } };
    assert.doesNotThrow(() => assertLedgerReadyForCut(ready, '6.1'));
    assert.throws(() => assertLedgerReadyForCut({ lines: {} }, '6.1'), /no lines\["6\.1"\]/);
    assert.throws(() => assertLedgerReadyForCut({}, '6.1'), /no lines\["6\.1"\]/);
    assert.throws(
        () => assertLedgerReadyForCut({ lines: { '6.1': { status: 'certified', candidateDate: '2026-09-11' } } }, '6.1'),
        /status is "certified"/,
    );
    assert.throws(() => assertLedgerReadyForCut({ lines: { '6.1': { status: 'candidate' } } }, '6.1'), /candidateDate/);
    assert.throws(
        () => assertLedgerReadyForCut({ lines: { '6.1': { status: 'candidate', candidateDate: '2026-09-11', newest: '6.1.0' } } }, '6.1'),
        /already records a release/,
    );
    assert.throws(
        () =>
            assertLedgerReadyForCut(
                { lines: { '6.1': { status: 'candidate', candidateDate: '2026-09-11', releases: { '6.1.0': { dbImpact: 'schema' } } } } },
                '6.1',
            ),
        /already records a release/,
    );
});

test('assertFixedGroupAt ignores non-group packages and names the stragglers', () => {
    const pkgs = [
        { name: '@memberjunction/core', version: '6.1.0' },
        { name: '@memberjunction/server', version: '6.1.0' },
        { name: 'mj_api', version: '1.0.10' }, // changeset-ignored host, keeps its own version
    ];
    assert.equal(assertFixedGroupAt(pkgs, '6.1.0'), 2);
    assert.throws(
        () => assertFixedGroupAt([...pkgs, { name: '@memberjunction/global', version: '6.1.0-edge.5' }], '6.1.0'),
        /1 of 3 fixed-group packages are not at 6\.1\.0: @memberjunction\/global@6\.1\.0-edge\.5/,
    );
    assert.throws(() => assertFixedGroupAt([{ name: 'mj_api', version: '1.0.0' }], '6.1.0'), /no @memberjunction\/\* packages/);
});

test('pendingChangesets counts only changeset markdown files', () => {
    assert.deepEqual(pendingChangesets(['README.md', 'pre.json', 'config.json', 'brave-owls.md', 'cool-cats.md']), ['brave-owls.md', 'cool-cats.md']);
    assert.deepEqual(pendingChangesets(['README.md', 'config.json']), []);
});

test('seedChangeset is a minor on a fixed-group package, so the next Edge publish is X.(Y+1).0-edge.0', () => {
    const seed = seedChangeset('6.2');
    assert.equal(seed.file, '.changeset/open-6-2-edge-stream.md');
    assert.match(seed.content, /^---\n"@memberjunction\/core": minor\n---\n/);
    assert.match(seed.content, /6\.2\.0-edge\.0/);
    assert.throws(() => seedChangeset('lts/6.2'), /must look like X\.Y/);
});

const EDGE_OK = {
    edgeTag: 'v6.1.0-edge.5',
    edgeTagVersion: '6.1.0-edge.5',
    edgeTagPre: { mode: 'pre', tag: 'edge' },
    npmEdgeVersionExists: true,
    npmEdgeDistTag: '6.1.0-edge.5',
    mainAtEdgeTag: true,
    edgeTagIsAncestorOfNext: true,
};

test('preflightFailures reports every violated precondition, and none when all hold', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const clean = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 324, ...EDGE_OK };
    assert.deepEqual(preflightFailures(clean, cut), []);
    const dirty = { ...clean, currentBranch: 'main', remoteBranchExists: true, remoteTagExists: true, npmVersionExists: true, pendingCount: 0 };
    const failures = preflightFailures(dirty, cut);
    assert.equal(failures.length, 5);
    assert.match(failures[0], /HEAD is "main"/);
    assert.match(failures[1], /already has lts\/6\.1/);
    assert.match(failures[2], /tag v6\.1\.0/);
    assert.match(failures[3], /@memberjunction\/core@6\.1\.0/);
    assert.match(failures[4], /no pending changesets at v6\.1\.0-edge\.5/);
});

test('preflightFailures refuses when the line has no Edge tag, and does not pile on edge-tag noise', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const facts = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 0, edgeTag: null };
    const failures = preflightFailures(facts, cut);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /no Edge tag v6\.1\.0-edge\.\* exists/);
});

test('preflightFailures refuses an Edge tag that npm does not agree with', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const base = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 3 };
    const neverPublished = preflightFailures({ ...base, ...EDGE_OK, npmEdgeVersionExists: false, npmEdgeDistTag: '6.1.0-edge.4' }, cut);
    assert.equal(neverPublished.length, 2);
    assert.match(neverPublished[0], /npm has no @memberjunction\/core@6\.1\.0-edge\.5/);
    assert.match(neverPublished[1], /dist-tag edge is at 6\.1\.0-edge\.4, not 6\.1\.0-edge\.5/);
    const inFlight = preflightFailures({ ...base, ...EDGE_OK, npmEdgeDistTag: '6.1.0-edge.6' }, cut);
    assert.deepEqual(inFlight.length, 1);
    assert.match(inFlight[0], /dist-tag edge is at 6\.1\.0-edge\.6/);
});

test('preflightFailures refuses an Edge tag whose tree is not that version in edge pre-mode', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const base = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 3 };
    const failures = preflightFailures({ ...base, ...EDGE_OK, edgeTagVersion: '6.1.0-edge.4', edgeTagPre: { mode: 'exit', tag: 'edge' } }, cut);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /v6\.1\.0-edge\.5 carries version 6\.1\.0-edge\.4/);
    assert.match(failures[1], /at v6\.1\.0-edge\.5: .*mode "exit"/);
});

test('preflightFailures refuses when main has moved past the Edge tag', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const base = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 3 };
    const failures = preflightFailures({ ...base, ...EDGE_OK, mainAtEdgeTag: false }, cut);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /main is not at v6\.1\.0-edge\.5/);
});

test('preflightFailures refuses an Edge tag whose back-merge into next has not landed', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const base = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 3 };
    const failures = preflightFailures({ ...base, ...EDGE_OK, edgeTagIsAncestorOfNext: false }, cut);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /not an ancestor of next: its main -> next back-merge has not landed/);
});

test('parseWorkspaceGlobs + selectWorkspaceManifests pick what pnpm treats as the workspace', () => {
    const yaml = "# comment\nlinkWorkspacePackages: true\npackages:\n  - 'packages/*'\n  - \"packages/AI/Providers/*\"\n  - '!packages/skip'\n\nonlyBuiltDependencies:\n  - esbuild\n";
    const globs = parseWorkspaceGlobs(yaml);
    assert.deepEqual(globs, { include: ['packages/*', 'packages/AI/Providers/*'], exclude: ['packages/skip'] });
    const paths = [
        'package.json',
        'packages/MJCore/package.json',
        'packages/AI/Providers/Bundle/package.json',
        'packages/AI/Providers/Bundle/src/fixtures/package.json',
        'packages/skip/package.json',
        'tests/open-app/sample-app-repo/packages/sample-app-server/package.json',
        'packages/MJCore/ng-package.json',
    ];
    assert.deepEqual(selectWorkspaceManifests(paths, globs), ['package.json', 'packages/MJCore/package.json', 'packages/AI/Providers/Bundle/package.json']);
    assert.throws(() => parseWorkspaceGlobs('linkWorkspacePackages: true\n'), /no packages: globs/);
});

test('normalizedSpec: exact versions (any) and this line\'s Edge ranges move to X.Y.0; nothing else does', () => {
    assert.equal(normalizedSpec('6.2.0-edge.7', '6.2'), '6.2.0');
    assert.equal(normalizedSpec('6.1.0', '6.2'), '6.2.0');
    assert.equal(normalizedSpec('1.0.0', '6.2'), '6.2.0');
    assert.equal(normalizedSpec('^6.2.0-edge.12', '6.2'), '^6.2.0');
    assert.equal(normalizedSpec('~6.2.0-edge.1', '6.2'), '~6.2.0');
    assert.equal(normalizedSpec('^6.1.0', '6.2'), '^6.1.0');
    assert.equal(normalizedSpec('workspace:*', '6.2'), 'workspace:*');
    assert.equal(normalizedSpec('*', '6.2'), '*');
});

test('normalizeManifests puts the workspace where a fixed-group 6.2.0 release would, keeping formatting', () => {
    const server = [
        '{',
        '  "name": "@memberjunction/server",',
        '  "version": "6.2.0-edge.7",',
        '  "scripts": { "version": "oclif readme" },',
        '  "dependencies": {',
        '    "@memberjunction/core": "6.2.0-edge.7",',
        '    "@memberjunction/global":"^6.2.0-edge.12",',
        '    "@memberjunction/late": "6.1.0",',
        '    "@memberjunction/skyway-core": "0.7.1",',
        '    "@memberjunction/ws": "workspace:*",',
        '    "zod": "6.2.0-edge.7"',
        '  },',
        '  "devDependencies": { "@memberjunction/core": "6.2.0-edge.7" }',
        '}',
        '',
    ].join('\n');
    const manifests = [
        { path: 'packages/MJServer/package.json', text: server },
        { path: 'packages/MJCore/package.json', text: '{ "name": "@memberjunction/core", "version": "6.2.0-edge.7" }\n' },
        { path: 'packages/global/package.json', text: '{ "name": "@memberjunction/global", "version": "6.2.0-edge.7" }\n' },
        { path: 'packages/late/package.json', text: '{ "name": "@memberjunction/late", "version": "6.1.0" }\n' }, // landed from an old branch
        { path: 'packages/ws/package.json', text: '{ "name": "@memberjunction/ws", "version": "1.0.0" }\n' },
        { path: 'packages/MJAPI/package.json', text: '{ "name": "mj_api", "version": "1.0.10", "dependencies": { "@memberjunction/core": "6.2.0-edge.7" } }\n' },
        { path: 'package.json', text: '{ "name": "mj-root", "private": true }\n' },
    ];
    const { changed, problems } = normalizeManifests(manifests, '6.2');
    assert.deepEqual(problems, []);
    const out = Object.fromEntries(changed.map((m) => [m.path, m.text]));
    assert.deepEqual(Object.keys(out).sort(), [
        'packages/MJAPI/package.json',
        'packages/MJCore/package.json',
        'packages/MJServer/package.json',
        'packages/global/package.json',
        'packages/late/package.json',
        'packages/ws/package.json',
    ]);
    const s2 = JSON.parse(out['packages/MJServer/package.json']);
    assert.equal(s2.version, '6.2.0');
    assert.equal(s2.scripts.version, 'oclif readme');
    assert.deepEqual(s2.dependencies, {
        '@memberjunction/core': '6.2.0',
        '@memberjunction/global': '^6.2.0',
        '@memberjunction/late': '6.2.0',
        '@memberjunction/skyway-core': '0.7.1', // not a workspace package: not the group's
        '@memberjunction/ws': 'workspace:*',
        zod: '6.2.0-edge.7',
    });
    assert.equal(s2.devDependencies['@memberjunction/core'], '6.2.0');
    assert.equal(out['packages/MJServer/package.json'].split('\n').length, server.split('\n').length);
    assert.equal(JSON.parse(out['packages/late/package.json']).version, '6.2.0');
    assert.equal(JSON.parse(out['packages/ws/package.json']).version, '6.2.0');
    assert.equal(JSON.parse(out['packages/MJAPI/package.json']).version, '1.0.10'); // not in the group
    assert.equal(JSON.parse(out['packages/MJAPI/package.json']).dependencies['@memberjunction/core'], '6.2.0');
    // Idempotent.
    const again = normalizeManifests(manifests.map((m) => ({ ...m, text: out[m.path] ?? m.text })), '6.2');
    assert.deepEqual(again.changed, []);
});

test('normalizeManifests reports group specs it cannot move, and refuses invalid JSON', () => {
    const manifests = [
        { path: 'packages/MJCore/package.json', text: '{ "name": "@memberjunction/core", "version": "6.2.0-edge.7" }' },
        { path: 'packages/a/package.json', text: '{ "name": "@memberjunction/a", "version": "6.2.0-edge.7", "dependencies": { "@memberjunction/core": "^6.1.0" }, "peerDependencies": { "@memberjunction/core": "*" } }' },
    ];
    assert.deepEqual(normalizeManifests(manifests, '6.2').problems, ['packages/a/package.json: @memberjunction/core@^6.1.0', 'packages/a/package.json: @memberjunction/core@*']);
    assert.throws(() => normalizeManifests([{ path: 'packages/x/package.json', text: '<<<<<<< HEAD' }], '6.2'), /packages\/x\/package\.json is not valid JSON/);
});

test('parseMergeTreeConflicts reads the conflicted paths from git merge-tree --name-only', () => {
    assert.deepEqual(parseMergeTreeConflicts('abc123\n'), []);
    const out = 'abc123\npackages/a/package.json\npackages/a/package.json\npnpm-lock.yaml\n\nAuto-merging packages/a/package.json\nCONFLICT (content): ...\n';
    assert.deepEqual(parseMergeTreeConflicts(out), ['packages/a/package.json', 'pnpm-lock.yaml']);
});

test('unresolvableConflicts: only package.json files and the lockfile resolve mechanically', () => {
    assert.deepEqual(unresolvableConflicts(['package.json', 'packages/a/package.json', 'pnpm-lock.yaml']), []);
    assert.deepEqual(unresolvableConflicts(['packages/a/CHANGELOG.md', 'packages/a/package.json', 'packages/a/pnpm-lock.yaml']), [
        'packages/a/CHANGELOG.md',
        'packages/a/pnpm-lock.yaml',
    ]);
});

test('newestEdgeTag picks the highest edge.N of the requested line, numerically', () => {
    const tags = ['v6.1.0-edge.2', 'v6.1.0-edge.10', 'v6.1.0-edge.9', 'v6.1.0', 'v6.2.0-edge.0', 'v6.10.0-edge.99', 'v6.1.0-edge.3-fix', '@memberjunction/core@6.1.0-edge.11'];
    assert.equal(newestEdgeTag(tags, '6.1'), 'v6.1.0-edge.10');
    assert.equal(newestEdgeTag(tags, '6.2'), 'v6.2.0-edge.0');
    assert.equal(newestEdgeTag(tags, '6.10'), 'v6.10.0-edge.99');
    assert.equal(newestEdgeTag(tags, '6.3'), null);
    assert.equal(newestEdgeTag([], '6.1'), null);
    assert.throws(() => newestEdgeTag(tags, '6'), /must look like X\.Y/);
});

test('keptChangesets: what the candidate consumed leaves next, what next added after the tag stays', () => {
    const atEdgeTag = ['brave-owls.md', 'cool-cats.md'];
    const onNext = ['cool-cats.md', 'brave-owls.md', 'late-fix.md', 'after-tag.md'];
    assert.deepEqual(keptChangesets(atEdgeTag, onNext), ['after-tag.md', 'late-fix.md']);
    assert.deepEqual(keptChangesets(atEdgeTag, atEdgeTag), []);
    // A changeset next deleted after the tag is not resurrected by the partition.
    assert.deepEqual(keptChangesets(atEdgeTag, ['brave-owls.md']), []);
});

test('assertChangesetsAfterMerge accepts exactly the kept set and names any difference', () => {
    assert.doesNotThrow(() => assertChangesetsAfterMerge(['b.md', 'a.md'], ['a.md', 'b.md']));
    assert.doesNotThrow(() => assertChangesetsAfterMerge([], []));
    assert.throws(() => assertChangesetsAfterMerge(['a.md', 'consumed.md'], ['a.md']), /unexpected: consumed\.md/);
    assert.throws(() => assertChangesetsAfterMerge([], ['late.md']), /missing: late\.md/);
});

test('assertReenteredPreJson: fresh edge pre-mode from X.Y.0 with nothing marked consumed', () => {
    const good = { mode: 'pre', tag: 'edge', initialVersions: { '@memberjunction/core': '6.1.0' }, changesets: [] };
    assert.doesNotThrow(() => assertReenteredPreJson(good, '6.1.0'));
    assert.throws(() => assertReenteredPreJson({ ...good, changesets: ['late-fix'] }, '6.1.0'), /already lists 1 changeset/);
    assert.throws(() => assertReenteredPreJson({ ...good, initialVersions: { '@memberjunction/core': '6.1.0-edge.5' } }, '6.1.0'), /initialVersions.*6\.1\.0-edge\.5/);
    // One straggler is enough to start the next stream at edge.(N+1): every entry counts.
    const straggler = { ...good, initialVersions: { '@memberjunction/core': '6.1.0', mj_api: '1.0.0', '@memberjunction/late': '6.1.0-edge.8' } };
    assert.throws(() => assertReenteredPreJson(straggler, '6.1.0'), /1 @memberjunction\/\* package\(s\) not at 6\.1\.0: @memberjunction\/late@6\.1\.0-edge\.8/);
    assert.throws(() => assertReenteredPreJson({ ...good, initialVersions: { mj_api: '1.0.0' } }, '6.1.0'), /no @memberjunction\/\* packages/);
    assert.throws(() => assertReenteredPreJson({ ...good, mode: 'exit' }, '6.1.0'), /mode "exit"/);
});

// ---------------------------------------------------------------------------------------
// Git-backed: the merge of the candidate into next, on a real (temporary) repository.
// ---------------------------------------------------------------------------------------

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function writeFiles(dir, files) {
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
    }
}

function pkg(name, version, deps) {
    return JSON.stringify({ name, version, dependencies: deps }, null, 2) + '\n';
}

/**
 * An Edge tag v6.2.0-edge.3 with exact internal pins; a candidate v6.2.0 built on it the
 * way `version` does (versions and pins to 6.2.0, consumed changesets and pre.json gone);
 * and next after the tag with a dependency added next to a pin, a new package, a new
 * changeset and a code change.
 */
function buildFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-cut-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 'test');
    git(dir, 'config', 'commit.gpgsign', 'false');
    writeFiles(dir, {
        'packages/core/package.json': pkg('@memberjunction/core', '6.2.0-edge.3', {}),
        'packages/MJServer/package.json': pkg('@memberjunction/server', '6.2.0-edge.3', { '@memberjunction/core': '6.2.0-edge.3', zod: '3.0.0' }),
        'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
        '.changeset/pre.json': JSON.stringify({ mode: 'pre', tag: 'edge', initialVersions: {}, changesets: ['consumed'] }),
        '.changeset/consumed.md': '---\n"@memberjunction/core": minor\n---\n\nconsumed\n',
        'packages/core/src.txt': 'edge\n',
    });
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'RELEASING');
    git(dir, 'tag', 'v6.2.0-edge.3');

    git(dir, 'checkout', '-q', '--detach');
    for (const f of ['packages/core/package.json', 'packages/MJServer/package.json']) {
        const p = path.join(dir, f);
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('6.2.0-edge.3', '6.2.0'));
    }
    fs.rmSync(path.join(dir, '.changeset/pre.json'));
    fs.rmSync(path.join(dir, '.changeset/consumed.md'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'version 6.2.0');
    git(dir, 'tag', 'v6.2.0');

    git(dir, 'checkout', '-q', '-b', 'next', 'v6.2.0-edge.3');
    writeFiles(dir, {
        'packages/MJServer/package.json': pkg('@memberjunction/server', '6.2.0-edge.3', {
            '@memberjunction/core': '6.2.0-edge.3',
            '@memberjunction/global': '6.2.0-edge.3',
            zod: '3.1.0',
        }),
        'packages/global/package.json': pkg('@memberjunction/global', '6.2.0-edge.3', { '@memberjunction/core': '6.2.0-edge.3' }),
        '.changeset/after-tag.md': '---\n"@memberjunction/global": patch\n---\n\nafter the tag\n',
        'packages/core/after-tag.txt': 'not in 6.2.0\n',
    });
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'feat: merged after the edge tag');
    return dir;
}

function inDir(dir, fn) {
    const prev = process.cwd();
    process.chdir(dir);
    try {
        return fn();
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('git: merging the candidate into next resolves pin conflicts to next + 6.2.0 and keeps post-tag work', () => {
    inDir(buildFixture(), () => {
        const trial = trialMerge('next', 'v6.2.0');
        assert.deepEqual(trial.conflicts, ['packages/MJServer/package.json']);
        // The trial tree already carries the right partition: consumed gone, post-tag kept.
        assert.deepEqual(git('.', 'ls-tree', '--name-only', trial.tree, '.changeset/'), '.changeset/after-tag.md');
        mergeIntoHead('v6.2.0', 'ours', 'merge candidate');
        const changed = normalizeWorkingTree('6.2');
        assert.deepEqual(changed.sort(), ['packages/MJServer/package.json', 'packages/global/package.json']);

        const server = JSON.parse(fs.readFileSync('packages/MJServer/package.json', 'utf8'));
        assert.deepEqual(server, {
            name: '@memberjunction/server',
            version: '6.2.0',
            dependencies: { '@memberjunction/core': '6.2.0', '@memberjunction/global': '6.2.0', zod: '3.1.0' },
        });
        const global = JSON.parse(fs.readFileSync('packages/global/package.json', 'utf8'));
        assert.equal(global.version, '6.2.0');
        assert.equal(global.dependencies['@memberjunction/core'], '6.2.0');
        assert.deepEqual(fs.readdirSync('.changeset').sort(), ['after-tag.md']);
        assert.ok(fs.existsSync('packages/core/after-tag.txt'));
        // The candidate itself never saw the post-tag commit.
        assert.throws(() => git('.', 'cat-file', '-e', 'v6.2.0:packages/core/after-tag.txt'));
        assert.throws(() => git('.', 'cat-file', '-e', 'v6.2.0:packages/global/package.json'));
    });
});

test('git: a conflict outside package.json and the lockfile aborts the merge and is caught by the trial', () => {
    inDir(buildFixture(), () => {
        fs.writeFileSync('.changeset/consumed.md', 'edited on next after release\n');
        git('.', 'commit', '-qam', 'edit a released changeset');
        assert.deepEqual(unresolvableConflicts(trialMerge('next', 'v6.2.0').conflicts), ['.changeset/consumed.md']);
        const head = git('.', 'rev-parse', 'HEAD');
        assert.throws(() => mergeIntoHead('v6.2.0', 'ours', 'merge candidate'), /conflicts outside package\.json.*\.changeset\/consumed\.md/s);
        assert.equal(git('.', 'rev-parse', 'HEAD'), head);
        assert.equal(git('.', 'status', '--porcelain'), '');
    });
});

test('git: a package next deleted after the tag stays deleted', () => {
    inDir(buildFixture(), () => {
        git('.', 'rm', '-q', 'packages/core/package.json');
        git('.', 'commit', '-qm', 'drop core');
        mergeIntoHead('v6.2.0', 'ours', 'merge candidate');
        assert.ok(!fs.existsSync('packages/core/package.json'));
    });
});

// Orchestration, against a local bare remote, with pnpm's three side effects stubbed.

/** buildFixture + a bare `origin` holding main (at the Edge tag), next and the tags. */
function buildRemoteFixture() {
    const dir = buildFixture();
    const bare = `${dir}.git`;
    git(dir, 'init', '-q', '--bare', bare);
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'push', '-q', 'origin', 'v6.2.0-edge.3:refs/heads/main', 'next', '--tags');
    return { dir, bare };
}

/** Commit to `branch` on the bare remote from a scratch clone, as a merged PR would. */
function commitOnRemote(bare, branch, files, message) {
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-cut-other-'));
    try {
        git(clone, 'clone', '-q', '-b', branch, bare, '.');
        writeFiles(clone, files);
        git(clone, 'add', '-A');
        git(clone, '-c', 'user.email=t@example.com', '-c', 'user.name=test', '-c', 'commit.gpgsign=false', 'commit', '-qm', message);
        git(clone, 'push', '-q', 'origin', branch);
    } finally {
        fs.rmSync(clone, { recursive: true, force: true });
    }
}

function stubDeps() {
    const calls = { refresh: 0, frozen: 0 };
    return {
        calls,
        refreshLockfile: async (client, opts) => {
            assert.equal(opts.required, true);
            assert.equal(typeof client.status, 'function');
            calls.refresh++;
        },
        frozenInstall: () => calls.frozen++,
        listPackages: () =>
            git('.', 'ls-files', '--', 'packages/*/package.json')
                .split('\n')
                .map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))),
    };
}

function inRemoteFixture(fn) {
    const { dir, bare } = buildRemoteFixture();
    const prev = process.cwd();
    process.chdir(dir);
    return Promise.resolve()
        .then(() => fn({ dir, bare }))
        .finally(() => {
            process.chdir(prev);
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(bare, { recursive: true, force: true });
        });
}

const ARGS = { line: '6.2', edgeTag: 'v6.2.0-edge.3', remote: 'origin' };

test('orchestration: pre-publish-check passes on a healthy cut and refuses once main moves past the Edge tag', () =>
    inRemoteFixture(({ bare }) => {
        git('.', 'checkout', '-q', '--detach', 'v6.2.0');
        assert.doesNotThrow(() => prePublishCheck(ARGS));
        commitOnRemote(bare, 'main', { 'release.txt': 'queued release\n' }, 'release/* merged to main');
        assert.throws(() => prePublishCheck(ARGS), /origin\/main moved off v6\.2\.0-edge\.3/);
    }));

test('orchestration: pre-publish-check refuses a spec on next the sync cannot move, with nothing published', () =>
    inRemoteFixture(({ bare }) => {
        git('.', 'checkout', '-q', '--detach', 'v6.2.0');
        commitOnRemote(bare, 'next', { 'packages/ranged/package.json': pkg('@memberjunction/ranged', '6.2.0-edge.3', { '@memberjunction/core': '^6.1.0' }) }, 'add a ranged pin');
        assert.throws(() => prePublishCheck(ARGS), /cannot move to 6\.2\.0: packages\/ranged\/package\.json: @memberjunction\/core@\^6\.1\.0/);
    }));

test('orchestration: merge-into-next then push-next leave origin/next fully at 6.2.0, lockfile refreshed each time', () =>
    inRemoteFixture(async ({ bare }) => {
        // A package that landed on next at another tuple, from a long-lived branch.
        commitOnRemote(bare, 'next', { 'packages/late/package.json': pkg('@memberjunction/late', '6.1.0', { '@memberjunction/core': '6.1.0' }) }, 'late package');
        git('.', 'checkout', '-q', '--detach', 'v6.2.0');
        const deps = stubDeps();
        await mergeIntoNext(ARGS, deps);
        assert.deepEqual(deps.calls, { refresh: 1, frozen: 1 });
        for (const f of ['MJServer', 'global', 'late', 'core']) assert.equal(JSON.parse(fs.readFileSync(`packages/${f}/package.json`, 'utf8')).version, '6.2.0', f);
        assert.equal(JSON.parse(fs.readFileSync('packages/late/package.json', 'utf8')).dependencies['@memberjunction/core'], '6.2.0');

        // Lands on next after merge-into-next fetched it, next to a pin: push-next must merge and re-sync.
        commitOnRemote(
            bare,
            'next',
            {
                'packages/MJServer/package.json': pkg('@memberjunction/server', '6.2.0-edge.3', {
                    '@memberjunction/core': '6.2.0-edge.3',
                    '@memberjunction/global': '6.2.0-edge.3',
                    zod: '3.1.0',
                    lodash: '4.17.21',
                }),
            },
            'dependency next to a pin, during the push',
        );
        await pushNext(ARGS, deps);
        assert.deepEqual(deps.calls, { refresh: 2, frozen: 2 });
        const pushed = JSON.parse(git('.', '--git-dir', bare, 'show', 'next:packages/MJServer/package.json'));
        assert.deepEqual(pushed.dependencies, { '@memberjunction/core': '6.2.0', '@memberjunction/global': '6.2.0', zod: '3.1.0', lodash: '4.17.21' });
        assert.equal(pushed.version, '6.2.0');
        assert.equal(git('.', '--git-dir', bare, 'ls-tree', '--name-only', 'next', '.changeset/'), '.changeset/after-tag.md');
    }));

test('parseCliArgs reads the subcommand, --line and --remote, and rejects strays', () => {
    assert.deepEqual(parseCliArgs(['preflight', '--line', '6.1']), { command: 'preflight', line: '6.1', remote: 'origin', edgeTag: undefined });
    assert.deepEqual(parseCliArgs(['push-next', '--remote', 'upstream']), { command: 'push-next', line: undefined, remote: 'upstream', edgeTag: undefined });
    assert.deepEqual(parseCliArgs(['merge-into-next', '--line', '6.1', '--edge-tag', 'v6.1.0-edge.5']), {
        command: 'merge-into-next',
        line: '6.1',
        remote: 'origin',
        edgeTag: 'v6.1.0-edge.5',
    });
    assert.throws(() => parseCliArgs(['version', '--force']), /unknown argument "--force"/);
});

test('the push retry is bounded', () => {
    assert.ok(Number.isInteger(MAX_PUSH_ATTEMPTS) && MAX_PUSH_ATTEMPTS >= 1 && MAX_PUSH_ATTEMPTS <= 5);
});
