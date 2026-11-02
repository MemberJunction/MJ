// Tests for ci/candidate-cut.mjs. Run with: node --test ci/
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.throws(() => assertReenteredPreJson({ ...good, mode: 'exit' }, '6.1.0'), /mode "exit"/);
});

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
