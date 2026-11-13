import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkRegressionSuite, TESTS_DIR, SUITE_FILE, SCRIPTS_DIR, LEAK_DIR } from '../check-regression-suite.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-regression-suite.mjs');

function uuid(n) {
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function testRecord(number, overrides = {}) {
    const t = `T${String(number).padStart(3, '0')}`;
    return {
        fields: {
            TypeID: '@lookup:MJ: Test Types.Name=Computer Use',
            Name: `${t} - Sample ${number}`,
            Description: 'Checks a sample page.',
            InputDefinition: JSON.stringify({ goal: 'Open the sample page.', startUrl: 'http://localhost:4200' }),
            ExpectedOutcomes: JSON.stringify({ judgeValidationCriteria: ['The sample page is visible'] }),
            Configuration: { maxSteps: 10 },
            Status: 'Active',
            Tags: 'P1,regression',
            ...overrides.fields,
        },
        primaryKey: { ID: uuid(number) },
        ...overrides.record,
    };
}

function member(name, sequence, id) {
    return {
        fields: { SuiteID: '@parent:ID', TestID: `@lookup:MJ: Tests.Name=${name}`, Sequence: sequence, Status: 'Active' },
        primaryKey: { ID: uuid(1000 + id) },
    };
}

let roots = [];
afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots = [];
});

/** Builds a fixture repo: test files, the suite file, and any extra files (repo-relative path → content). */
function makeRepo({ tests, members, files = {} } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'regression-suite-'));
    roots.push(root);
    const testMap = tests ?? { '.T001-sample-1.json': testRecord(1), '.T002-sample-2.json': testRecord(2) };
    mkdirSync(join(root, TESTS_DIR), { recursive: true });
    for (const [name, record] of Object.entries(testMap)) {
        writeFileSync(join(root, TESTS_DIR, name), JSON.stringify(record, null, 2));
    }
    const memberList = members ?? Object.values(testMap).map((r, i) => member(r.fields.Name, i + 1, i + 1));
    mkdirSync(dirname(join(root, SUITE_FILE)), { recursive: true });
    writeFileSync(
        join(root, SUITE_FILE),
        JSON.stringify({ fields: { Name: 'Suite' }, relatedEntities: { 'MJ: Test Suite Tests': memberList }, primaryKey: { ID: uuid(9999) } }, null, 2),
    );
    for (const [rel, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), content);
    }
    return root;
}

const problemsOf = (root) => checkRegressionSuite(root).problems;

describe('checkRegressionSuite', () => {
    it('passes a consistent suite', () => {
        expect(problemsOf(makeRepo())).toEqual([]);
    });

    it('accepts checkpoints in place of judgeValidationCriteria', () => {
        const ExpectedOutcomes = JSON.stringify({ checkpoints: [{ name: 'home', instruction: 'open home', visualCriteria: ['Home is visible'] }] });
        const root = makeRepo({ tests: { '.T001-sample-1.json': testRecord(1, { fields: { ExpectedOutcomes } }) } });
        expect(problemsOf(root)).toEqual([]);
    });

    it('reports a test file that is not a suite member', () => {
        const tests = { '.T001-sample-1.json': testRecord(1), '.T002-sample-2.json': testRecord(2) };
        const root = makeRepo({ tests, members: [member('T001 - Sample 1', 1, 1)] });
        expect(problemsOf(root)).toEqual([expect.stringContaining('"T002 - Sample 2" is not a member')]);
    });

    it('reports a suite member with no test file', () => {
        const members = [member('T001 - Sample 1', 1, 1), member('T002 - Sample 2', 2, 2), member('T003 - Gone', 3, 3)];
        expect(problemsOf(makeRepo({ members }))).toEqual([expect.stringContaining('no test file has Name "T003 - Gone"')]);
    });

    it('reports a duplicate test number', () => {
        const other = testRecord(1, { fields: { Name: 'T001 - Other' }, record: { primaryKey: { ID: uuid(50) } } });
        const root = makeRepo({ tests: { '.T001-sample-1.json': testRecord(1), '.T001-other.json': other } });
        expect(problemsOf(root)).toContainEqual(expect.stringContaining('test number T001 is used by'));
    });

    it('reports a Name that does not match the file number', () => {
        const root = makeRepo({ tests: { '.T001-sample-1.json': testRecord(1, { fields: { Name: 'T009 - Sample 1' } }) } });
        expect(problemsOf(root)).toContainEqual(expect.stringContaining('Name must start with "T001 - "'));
    });

    it('reports two test files with the same primaryKey ID (a copied file)', () => {
        const copy = testRecord(2, { record: { primaryKey: { ID: uuid(1).toLowerCase() } } });
        const root = makeRepo({ tests: { '.T001-sample-1.json': testRecord(1), '.T002-sample-2.json': copy } });
        expect(problemsOf(root)).toEqual([expect.stringContaining(`primaryKey.ID ${uuid(1)} is used by`)]);
    });

    it('reports two suite members with the same primaryKey ID', () => {
        const second = { ...member('T002 - Sample 2', 2, 2), primaryKey: { ID: uuid(1001) } };
        const root = makeRepo({ members: [member('T001 - Sample 1', 1, 1), second] });
        expect(problemsOf(root)).toEqual([expect.stringContaining(`primaryKey.ID ${uuid(1001)} is used by`)]);
    });

    it('reports a duplicate Sequence', () => {
        const root = makeRepo({ members: [member('T001 - Sample 1', 1, 1), member('T002 - Sample 2', 1, 2)] });
        expect(problemsOf(root)).toEqual([expect.stringContaining('Sequence 1 is used by')]);
    });

    it('reports missing required fields', () => {
        const fields = {
            Description: '',
            InputDefinition: JSON.stringify({ startUrl: 'http://localhost:4200' }),
            ExpectedOutcomes: JSON.stringify({ goalCompleted: true }),
            Tags: 'P1,P2',
        };
        const problems = problemsOf(makeRepo({ tests: { '.T001-sample-1.json': testRecord(1, { fields }) } }));
        expect(problems).toContainEqual(expect.stringContaining('Description is empty'));
        expect(problems).toContainEqual(expect.stringContaining('InputDefinition.goal is empty'));
        expect(problems).toContainEqual(expect.stringContaining('needs judgeValidationCriteria or checkpoints'));
        expect(problems).toContainEqual(expect.stringContaining('exactly one of P0, P1, P2, P3'));
        expect(problems).toContainEqual(expect.stringContaining('Tags must contain "regression"'));
    });

    it('reports a missing primaryKey', () => {
        const root = makeRepo({ tests: { '.T001-sample-1.json': testRecord(1, { record: { primaryKey: undefined } }) } });
        expect(problemsOf(root)).toEqual([expect.stringContaining('missing primaryKey.ID')]);
    });

    it('reports a badly named test file', () => {
        const tests = { '.T001-sample-1.json': testRecord(1), '.t2_bad.json': testRecord(2) };
        const root = makeRepo({ tests, members: [member('T001 - Sample 1', 1, 1)] });
        expect(problemsOf(root)).toEqual([expect.stringContaining('.t2_bad.json: file name must look like')]);
    });

    it('accepts a replay script that a test references', () => {
        const Configuration = { maxSteps: 10, ReplayScript: '@file:regression/scripts/t001-sample-1.json' };
        const root = makeRepo({
            tests: { '.T001-sample-1.json': testRecord(1, { fields: { Configuration } }) },
            files: { [`${SCRIPTS_DIR}/t001-sample-1.json`]: '{}' },
        });
        expect(problemsOf(root)).toEqual([]);
    });

    it('reports a reference to a missing replay script', () => {
        const Configuration = { maxSteps: 10, ReplayScript: '@file:regression/scripts/t001-sample-1.json' };
        const root = makeRepo({ tests: { '.T001-sample-1.json': testRecord(1, { fields: { Configuration } }) } });
        expect(problemsOf(root)).toEqual([expect.stringContaining('Configuration.ReplayScript points to a missing file')]);
    });

    it('reports a replay script that no test references', () => {
        const root = makeRepo({ files: { [`${SCRIPTS_DIR}/t009-old.pending.json`]: '{}' } });
        expect(problemsOf(root)).toEqual([expect.stringContaining('t009-old.pending.json: no test references this script')]);
    });

    it('reports a Computer Use test under metadata/tests', () => {
        const root = makeRepo({ files: { [`${LEAK_DIR}/regression/.T001-leak.json`]: JSON.stringify(testRecord(1)) } });
        expect(problemsOf(root)).toEqual([expect.stringContaining('Computer Use tests belong in')]);
    });
});

describe('check-regression-suite CLI', () => {
    const run = (root) => spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });

    it('exits 0 for a consistent suite', () => {
        expect(run(makeRepo()).status).toBe(0);
    });

    it('exits 1 and lists the problems', () => {
        const result = run(makeRepo({ members: [member('T001 - Sample 1', 1, 1)] }));
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('is not a member');
    });

    it('exits 2 when the suite folder is missing', () => {
        const root = mkdtempSync(join(tmpdir(), 'regression-suite-'));
        roots.push(root);
        expect(run(root).status).toBe(2);
    });
});
