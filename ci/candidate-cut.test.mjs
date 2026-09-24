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

test('preflightFailures reports every violated precondition, and none when all hold', () => {
    const cut = deriveCut('6.1.0-edge.5');
    const clean = { currentBranch: 'next', remoteBranchExists: false, remoteTagExists: false, npmVersionExists: false, pendingCount: 324 };
    assert.deepEqual(preflightFailures(clean, cut), []);
    const dirty = { currentBranch: 'main', remoteBranchExists: true, remoteTagExists: true, npmVersionExists: true, pendingCount: 0 };
    const failures = preflightFailures(dirty, cut);
    assert.equal(failures.length, 5);
    assert.match(failures[0], /HEAD is "main"/);
    assert.match(failures[1], /already has lts\/6\.1/);
    assert.match(failures[2], /tag v6\.1\.0/);
    assert.match(failures[3], /@memberjunction\/core@6\.1\.0/);
    assert.match(failures[4], /no pending changesets/);
});

test('parseCliArgs reads the subcommand, --line and --remote, and rejects strays', () => {
    assert.deepEqual(parseCliArgs(['preflight', '--line', '6.1']), { command: 'preflight', line: '6.1', remote: 'origin' });
    assert.deepEqual(parseCliArgs(['push-next', '--remote', 'upstream']), { command: 'push-next', line: undefined, remote: 'upstream' });
    assert.throws(() => parseCliArgs(['version', '--force']), /unknown argument "--force"/);
});

test('the push retry is bounded', () => {
    assert.ok(Number.isInteger(MAX_PUSH_ATTEMPTS) && MAX_PUSH_ATTEMPTS >= 1 && MAX_PUSH_ATTEMPTS <= 5);
});
