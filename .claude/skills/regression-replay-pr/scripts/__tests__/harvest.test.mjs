import { describe, it, expect } from 'vitest';
import {
    HARVEST_DIR,
    ParsePorcelain,
    ScriptReferences,
    FindOrphanScripts,
    UnexpectedRecordChanges,
    CheckHarvest,
    BuildPrBody,
} from '../lib/harvest.mjs';

const TEST_PATH = `${HARVEST_DIR}/regression/.T001-login-smoke.json`;
const SCRIPT_PATH = `${HARVEST_DIR}/regression/scripts/t001-login-smoke.json`;
const PENDING_PATH = `${HARVEST_DIR}/regression/scripts/t001-login-smoke.pending.json`;

function record(configuration = {}, sync = { lastModified: '2026-11-12T00:00:00.000Z', checksum: 'a' }) {
    return {
        fields: { Name: 'T001 - Login Smoke', Configuration: { maxSteps: 10, ...configuration } },
        primaryKey: { ID: '00000000-0000-4000-8000-000000000001' },
        sync,
    };
}

function text(value) {
    return JSON.stringify(value, null, 2) + '\n';
}

function testEntry(path, after, before) {
    return {
        path,
        record: after,
        text: text(after),
        head: before === undefined ? null : { record: before, text: text(before) },
    };
}

describe('ParsePorcelain', () => {
    it('reads new, modified and deleted paths from -z output', () => {
        const out = `?? ${SCRIPT_PATH}\0 M ${TEST_PATH}\0 D ${PENDING_PATH}\0`;
        expect(ParsePorcelain(out)).toEqual([
            { status: 'new', path: SCRIPT_PATH },
            { status: 'modified', path: TEST_PATH },
            { status: 'deleted', path: PENDING_PATH },
        ]);
    });

    it('skips the original path that follows a rename', () => {
        const out = `R  new.json\0old.json\0 M ${TEST_PATH}\0`;
        expect(ParsePorcelain(out)).toEqual([
            { status: 'other', path: 'new.json' },
            { status: 'modified', path: TEST_PATH },
        ]);
    });
});

describe('ScriptReferences', () => {
    it('returns repo-relative files for both script fields', () => {
        const r = record({
            ReplayScript: '@file:regression/scripts/t001-login-smoke.json',
            PendingReplayScript: '@file:regression/scripts/t001-login-smoke.pending.json',
        });
        expect(ScriptReferences(r)).toEqual([
            { field: 'ReplayScript', file: SCRIPT_PATH },
            { field: 'PendingReplayScript', file: PENDING_PATH },
        ]);
    });

    it('ignores inline scripts and records with no Configuration object', () => {
        expect(ScriptReferences(record({ ReplayScript: { Steps: [] } }))).toEqual([]);
        expect(ScriptReferences({ fields: { Name: 'x', Configuration: '{"maxSteps":1}' } })).toEqual([]);
    });
});

describe('FindOrphanScripts', () => {
    it('lists script files that no test references', () => {
        const tests = [{ path: TEST_PATH, record: record({ ReplayScript: '@file:regression/scripts/t001-login-smoke.json' }) }];
        expect(FindOrphanScripts(tests, [SCRIPT_PATH, PENDING_PATH])).toEqual([PENDING_PATH]);
    });
});

describe('UnexpectedRecordChanges', () => {
    it('allows script references and sync state to change', () => {
        const before = record();
        const after = record(
            { ReplayScript: '@file:regression/scripts/t001-login-smoke.json' },
            { lastModified: '2026-11-13T00:00:00.000Z', checksum: 'b' },
        );
        expect(UnexpectedRecordChanges(before, after)).toEqual([]);
    });

    it('names every other field that changed', () => {
        const before = record();
        const after = record({ maxSteps: 20 });
        after.fields.Description = 'new';
        expect(UnexpectedRecordChanges(before, after)).toEqual(['fields.Configuration.maxSteps', 'fields.Description']);
    });
});

describe('CheckHarvest', () => {
    const withScript = record(
        { ReplayScript: '@file:regression/scripts/t001-login-smoke.json' },
        { lastModified: '2026-11-13T00:00:00.000Z', checksum: 'b' },
    );

    it('reports a new script and the test that uses it', () => {
        const result = CheckHarvest({
            entries: [{ status: 'new', path: SCRIPT_PATH }, { status: 'modified', path: TEST_PATH }],
            tests: [testEntry(TEST_PATH, withScript, record())],
            scripts: [{ path: SCRIPT_PATH, text: '{"Steps":[]}' }],
        });
        expect(result.problems).toEqual([]);
        expect(result.newScripts).toEqual([{ test: 'T001 - Login Smoke', file: SCRIPT_PATH }]);
        expect(result.scriptedTests).toEqual(['T001 - Login Smoke']);
    });

    it('reports a new script that holds a URL on another host than the stack (an identity-provider tenant)', () => {
        const text = JSON.stringify({ Steps: [
            { UrlBefore: 'http://localhost:4200/' },
            { UrlBefore: 'https://dev-tenant.us.auth0.com/u/login', Postcondition: { UrlPattern: 'https://dev-tenant.us.auth0.com/u/login' } },
        ] });
        const result = CheckHarvest({
            entries: [{ status: 'new', path: SCRIPT_PATH }, { status: 'modified', path: TEST_PATH }],
            tests: [testEntry(TEST_PATH, withScript, record())],
            scripts: [{ path: SCRIPT_PATH, text }],
        });
        expect(result.problems).toEqual([expect.stringContaining(`${SCRIPT_PATH}: holds URLs on another host than localhost (dev-tenant.us.auth0.com)`)]);
    });

    it('reports a pending script', () => {
        const pending = record({
            ReplayScript: '@file:regression/scripts/t001-login-smoke.json',
            PendingReplayScript: '@file:regression/scripts/t001-login-smoke.pending.json',
        });
        const result = CheckHarvest({
            entries: [{ status: 'new', path: PENDING_PATH }, { status: 'modified', path: TEST_PATH }],
            tests: [testEntry(TEST_PATH, pending, withScript)],
            scripts: [{ path: SCRIPT_PATH, text: '{}' }, { path: PENDING_PATH, text: '{}' }],
        });
        expect(result.problems).toEqual([]);
        expect(result.pendingScripts).toEqual([{ test: 'T001 - Login Smoke', file: PENDING_PATH }]);
    });

    it('rejects a change outside the test folder', () => {
        const result = CheckHarvest({
            entries: [{ status: 'modified', path: 'metadata-optional/regression-test/test-suites/.regression-suite.json' }],
            tests: [],
            scripts: [],
        });
        expect(result.problems).toEqual([
            'metadata-optional/regression-test/test-suites/.regression-suite.json: changed outside metadata-optional/regression-test/tests',
        ]);
    });

    it('rejects a test field change, a format-only change and a missing script file', () => {
        const other = `${HARVEST_DIR}/regression/.T002-other.json`;
        const changed = record({ maxSteps: 20, ReplayScript: '@file:regression/scripts/t001-login-smoke.json' });
        const same = record();
        const result = CheckHarvest({
            entries: [{ status: 'modified', path: TEST_PATH }, { status: 'modified', path: other }],
            tests: [
                testEntry(TEST_PATH, changed, record()),
                { path: other, record: same, text: JSON.stringify(same, null, 2), head: { record: same, text: text(same) } },
            ],
            scripts: [],
        });
        expect(result.problems).toEqual([
            `${TEST_PATH}: fields.Configuration.maxSteps changed`,
            `${other}: only the formatting changed`,
            `${TEST_PATH}: Configuration.ReplayScript points to a missing file (${SCRIPT_PATH})`,
        ]);
    });

    it('rejects an added or removed test file and a script that is not JSON', () => {
        const result = CheckHarvest({
            entries: [{ status: 'new', path: TEST_PATH }, { status: 'new', path: SCRIPT_PATH }],
            tests: [testEntry(TEST_PATH, withScript)],
            scripts: [{ path: SCRIPT_PATH, text: '{"Steps":' }],
        });
        expect(result.problems).toEqual([
            `${TEST_PATH}: a harvest must not add or remove test files`,
            `${SCRIPT_PATH}: not valid JSON`,
        ]);
    });
});

describe('BuildPrBody', () => {
    const results = {
        passedTests: 2,
        failedTests: 1,
        skippedTests: 0,
        totalTests: 3,
        durationMs: 125000,
        testResults: [
            { testName: 'T001 - Login Smoke', status: 'Passed', tier: 'llm' },
            { testName: 'T002 - Data Explorer Open Entity Record', status: 'Passed', tier: 'llm' },
            { testName: 'T003 - Broken', status: 'Failed', errorMessage: 'Goal not met:\nthe grid never loaded' },
        ],
    };
    const harvest = {
        newScripts: [{ test: 'T001 - Login Smoke', file: SCRIPT_PATH }],
        updatedScripts: [],
        removedScripts: [],
        pendingScripts: [],
        scriptedTests: ['T001 - Login Smoke'],
    };

    it('summarizes the run, the scripts and the tests without a script', () => {
        const body = BuildPrBody({ base: 'next', sha: 'abcdef1234567', runName: 'run-20261112T183113Z', results, harvest });
        expect(body).toContain('a regression run of `next` at `abcdef1`');
        expect(body).toContain('| Passed | 2 |');
        expect(body).toContain('Run time: 2 min. Tiers: 2 llm, 1 none.');
        expect(body).toContain('<summary>New scripts (1)</summary>');
        expect(body).toContain('- `T001 - Login Smoke`');
        expect(body).toContain('<summary>Passed with no script (1)</summary>');
        expect(body).toContain('- `T002 - Data Explorer Open Entity Record`');
        expect(body).toContain('- `T003 - Broken`: Goal not met: the grid never loaded');
        expect(body).not.toContain('Still pending');
        expect(body.trimEnd().endsWith('🤖 Generated with [Claude Code](https://claude.com/claude-code)')).toBe(true);
    });

    it('lists promoted, discarded and still-pending scripts with the drift report', () => {
        const body = BuildPrBody({
            base: 'next',
            sha: 'abcdef1234567',
            runName: 'run-1',
            results,
            harvest: { ...harvest, pendingScripts: [{ test: 'T001 - Login Smoke', file: PENDING_PATH }] },
            driftMarkdown: '### Pending replay scripts (1)\n\n| Test | Meaningful drift | Summary |',
            promoted: ['T009 - Promoted'],
            discarded: ['T010 - Discarded'],
        });
        expect(body).toContain('<summary>Promoted re-recordings (1)</summary>');
        expect(body).toContain('- `T009 - Promoted`');
        expect(body).toContain('<summary>Discarded re-recordings (1)</summary>');
        expect(body).toContain('### Still pending (1)');
        expect(body).toContain('### Pending replay scripts (1)');
    });
});
