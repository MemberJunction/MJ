# Regression Suite Automation — Implementation Plan (Phases 0–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a regression-suite parity guard and a `mj test regression new` scaffold command, and prove (by a throwaway spike) how replay scripts get from the Docker test database back into git.

**Architecture:** The parity guard is a pure-file Node script in `.github/scripts/` (same pattern as `check-manifest-registrations.mjs`), run by `check:guards` (pre-push hook) and the "Source guards" job in `test.yml` (every PR). The scaffold is a pure module in `packages/MJCLI/src/lib/regression/` with a thin oclif command. The spike runs two tests in the regression Docker stack and pulls their scripts back with `mj sync pull` from a one-off test-runner container.

**Tech Stack:** Node ESM (`.mjs`), vitest, TypeScript, oclif (`@oclif/core`), Docker Compose, MetadataSync (`mj sync`).

**Spec:** [`2026-11-12-regression-automation-plan.md`](2026-11-12-regression-automation-plan.md). Phases 3–6 get their own detailed plan after the Phase 0 findings.

**Order:** Task 1 → Task 2 → Task 3 (Phase 0 spike). Tasks 1–2 need no Docker. Task 3 needs the
machine's single `mj-regression` stack, so it runs last.

## Global Constraints

- pnpm workspace. Never `npm install`. Build one package with `cd packages/<Pkg> && pnpm run build`.
- No `any`, no `as any`. Strong types (`.claude/rules/typescript-style.md`).
- Every metadata record has a `primaryKey` with an uppercase UUID and no `sync` block (`metadata/CLAUDE.md` rule 1).
- Test names must not contain `&` (it breaks the `@lookup` parser).
- `InputDefinition` / `ExpectedOutcomes` are stored as 2-space pretty-printed JSON **strings**; `Configuration` is an **object**.
- `@file:` references in `MJ: Tests` records resolve from the entity folder `metadata-optional/regression-test/tests/`.
- Tests first: write the failing test, run it, see it fail, then implement.
- Comments: concise, describe what the code does now, no change history.
- Commits: only after the user approves. Stage explicit paths only. Never `git add -A`.
- A change under `packages/MJCLI` needs a `patch` changeset for `@memberjunction/cli`. `.github/**`, root `package.json` scripts and `metadata-optional/**` need none.

---

### Task 1: Regression suite parity guard (Phase 1)

**Files:**
- Create: `.github/scripts/check-regression-suite.mjs`
- Create: `.github/scripts/__tests__/check-regression-suite.test.mjs`
- Modify: `package.json` (scripts, next to `check:manifest-registrations`)
- Modify: `.github/scripts/check-guards.sh` (run the guard + help line)
- Modify: `.github/workflows/test.yml` ("Source guards" job, after "Entity manifest registration gate")
- Modify: `metadata-optional/regression-test/README.md` (replace `mj test validate --dir=…`)
- Modify: `metadata-optional/integration-test/tests/integration/README.md` (replace `mj test validate --dir=…`)

**Interfaces:**
- Produces: `checkRegressionSuite(repoRoot: string): { problems: string[], testCount: number, memberCount: number, fatal: boolean }` and the exported path constants `SUITE_DIR`, `TESTS_ENTITY_DIR`, `TESTS_DIR`, `SCRIPTS_DIR`, `SUITE_FILE`, `LEAK_DIR`.
- Produces: CLI `node .github/scripts/check-regression-suite.mjs [--root <repoRoot>]` — exit 0 clean, 1 problems, 2 suite missing. Task 2's tests call this CLI.

- [ ] **Step 1: Write the failing test** — `.github/scripts/__tests__/check-regression-suite.test.mjs`

```js
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --config .github/scripts/vitest.config.mts __tests__/check-regression-suite`
Expected: FAIL — `Failed to load url ../check-regression-suite.mjs` (module does not exist).

- [ ] **Step 3: Write the guard** — `.github/scripts/check-regression-suite.mjs`

```js
#!/usr/bin/env node
/**
 * Regression suite parity gate.
 *
 * Checks the MJ Explorer regression suite metadata in `metadata-optional/regression-test/`:
 *   - every `tests/regression/.T###-*.json` file is a member of `.regression-suite.json`, and
 *     every member names an existing test;
 *   - test numbers, test names and member sequences are unique, and each Name starts with the
 *     file's `T### - ` prefix;
 *   - each test has a primaryKey UUID, the Computer Use TypeID, a Description, a Status, an
 *     InputDefinition goal and startUrl, judge criteria (judgeValidationCriteria or checkpoints),
 *     and Tags with exactly one of P0-P3 plus `regression`;
 *   - every `@file:` reference in a test's Configuration resolves, and every file under
 *     `tests/regression/scripts/` is referenced by a test;
 *   - no Computer Use test record lives under `metadata/tests/`.
 *
 * Pure file reads: no build, no database.
 *
 * Usage:  node .github/scripts/check-regression-suite.mjs [--root <repoRoot>]
 * Exit:   0 = clean, 1 = problems found, 2 = suite folder or suite file missing.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SUITE_DIR = 'metadata-optional/regression-test';
/** The entity folder. `@file:` references in test records resolve from here. */
export const TESTS_ENTITY_DIR = `${SUITE_DIR}/tests`;
export const TESTS_DIR = `${TESTS_ENTITY_DIR}/regression`;
export const SCRIPTS_DIR = `${TESTS_DIR}/scripts`;
export const SUITE_FILE = `${SUITE_DIR}/test-suites/.regression-suite.json`;
export const LEAK_DIR = 'metadata/tests';

const COMPUTER_USE_TYPE = '@lookup:MJ: Test Types.Name=Computer Use';
const MEMBER_ENTITY = 'MJ: Test Suite Tests';
const MEMBER_LOOKUP_PREFIX = '@lookup:MJ: Tests.Name=';
const FILE_REF_PREFIX = '@file:';
const FILE_NAME_RE = /^\.T(\d{3,})-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;
const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const PRIORITY_RE = /^P[0-3]$/;

function readJson(file) {
    try {
        return { value: JSON.parse(readFileSync(file, 'utf8')) };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Returns the field as an object, parsing it first when it is stored as a JSON string. */
function asObject(raw) {
    if (isPlainObject(raw)) return raw;
    if (typeof raw !== 'string') return null;
    try {
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function hasJudgeCriteria(expected) {
    if (isNonEmptyStringArray(expected.judgeValidationCriteria)) return true;
    const checkpoints = expected.checkpoints;
    return Array.isArray(checkpoints) && checkpoints.length > 0 &&
        checkpoints.every((c) => isPlainObject(c) && isNonEmptyString(c.name) && isNonEmptyStringArray(c.visualCriteria));
}

function listFilesRecursive(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFilesRecursive(full));
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

/** Groups items by key and returns only the groups with more than one item. */
function findDuplicates(items, keyOf) {
    const groups = new Map();
    for (const item of items) {
        const key = keyOf(item);
        if (key === null || key === undefined) continue;
        groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].filter(([, group]) => group.length > 1);
}

/** Checks one test record. Returns its summary, or null when it has no fields. */
function checkTestRecord(rel, numberText, record, problems) {
    const fields = record?.fields;
    if (!isPlainObject(fields)) {
        problems.push(`${rel}: missing "fields"`);
        return null;
    }
    if (!UUID_RE.test(String(record.primaryKey?.ID ?? ''))) {
        problems.push(`${rel}: missing primaryKey.ID (generate one with: uuidgen)`);
    }
    if (fields.TypeID !== COMPUTER_USE_TYPE) problems.push(`${rel}: TypeID must be "${COMPUTER_USE_TYPE}"`);

    const prefix = `T${numberText} - `;
    const nameOk = isNonEmptyString(fields.Name) && fields.Name.startsWith(prefix) && fields.Name.length > prefix.length;
    if (!nameOk) problems.push(`${rel}: Name must start with "${prefix}" followed by a title`);
    if (!isNonEmptyString(fields.Description)) problems.push(`${rel}: Description is empty`);
    if (!isNonEmptyString(fields.Status)) problems.push(`${rel}: Status is empty`);

    const input = asObject(fields.InputDefinition);
    if (!input) {
        problems.push(`${rel}: InputDefinition is not a JSON object`);
    } else {
        if (!isNonEmptyString(input.goal)) problems.push(`${rel}: InputDefinition.goal is empty`);
        if (!isNonEmptyString(input.startUrl)) problems.push(`${rel}: InputDefinition.startUrl is empty`);
    }

    const expected = asObject(fields.ExpectedOutcomes);
    if (!expected) {
        problems.push(`${rel}: ExpectedOutcomes is not a JSON object`);
    } else if (!hasJudgeCriteria(expected)) {
        problems.push(`${rel}: ExpectedOutcomes needs judgeValidationCriteria or checkpoints with visualCriteria`);
    }

    const tags = String(fields.Tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.filter((t) => PRIORITY_RE.test(t)).length !== 1) {
        problems.push(`${rel}: Tags must contain exactly one of P0, P1, P2, P3`);
    }
    if (!tags.includes('regression')) problems.push(`${rel}: Tags must contain "regression"`);

    if (!isPlainObject(fields.Configuration)) problems.push(`${rel}: Configuration must be a JSON object`);

    return {
        rel,
        number: Number(numberText),
        name: isNonEmptyString(fields.Name) ? fields.Name : null,
        configuration: isPlainObject(fields.Configuration) ? fields.Configuration : {},
    };
}

function readTests(repoRoot, problems) {
    const tests = [];
    for (const entry of readdirSync(join(repoRoot, TESTS_DIR), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.startsWith('.') || !entry.name.endsWith('.json')) continue;
        const rel = `${TESTS_DIR}/${entry.name}`;
        const match = FILE_NAME_RE.exec(entry.name);
        if (!match) {
            problems.push(`${rel}: file name must look like .T###-kebab-case-title.json`);
            continue;
        }
        const parsed = readJson(join(repoRoot, rel));
        if (parsed.error) {
            problems.push(`${rel}: invalid JSON (${parsed.error})`);
            continue;
        }
        const test = checkTestRecord(rel, match[1], parsed.value, problems);
        if (test) tests.push(test);
    }
    return tests;
}

function readMembers(repoRoot, problems) {
    const parsed = readJson(join(repoRoot, SUITE_FILE));
    if (parsed.error) {
        problems.push(`${SUITE_FILE}: invalid JSON (${parsed.error})`);
        return [];
    }
    const list = parsed.value?.relatedEntities?.[MEMBER_ENTITY];
    if (!Array.isArray(list)) {
        problems.push(`${SUITE_FILE}: missing relatedEntities["${MEMBER_ENTITY}"]`);
        return [];
    }
    const members = [];
    list.forEach((member, index) => {
        const where = `${SUITE_FILE} member #${index + 1}`;
        const fields = isPlainObject(member?.fields) ? member.fields : {};
        const testId = String(fields.TestID ?? '');
        if (!testId.startsWith(MEMBER_LOOKUP_PREFIX)) {
            problems.push(`${where}: TestID must be "${MEMBER_LOOKUP_PREFIX}<test name>"`);
            return;
        }
        if (!Number.isInteger(fields.Sequence) || fields.Sequence < 1) problems.push(`${where}: Sequence must be a positive integer`);
        if (!UUID_RE.test(String(member.primaryKey?.ID ?? ''))) problems.push(`${where}: missing primaryKey.ID (generate one with: uuidgen)`);
        members.push({ name: testId.slice(MEMBER_LOOKUP_PREFIX.length), sequence: fields.Sequence, where });
    });
    return members;
}

function checkUniqueness(tests, members, problems) {
    for (const [number, group] of findDuplicates(tests, (t) => t.number)) {
        const label = `T${String(number).padStart(3, '0')}`;
        problems.push(`test number ${label} is used by ${group.map((t) => t.rel).join(', ')} (renumber one to the next free number)`);
    }
    for (const [name, group] of findDuplicates(tests, (t) => t.name)) {
        problems.push(`test name "${name}" is used by ${group.map((t) => t.rel).join(', ')}`);
    }
    for (const [name] of findDuplicates(members, (m) => m.name)) {
        problems.push(`${SUITE_FILE}: "${name}" is a member more than once`);
    }
    for (const [sequence, group] of findDuplicates(members, (m) => (Number.isInteger(m.sequence) ? m.sequence : null))) {
        problems.push(`${SUITE_FILE}: Sequence ${sequence} is used by ${group.map((m) => `"${m.name}"`).join(', ')}`);
    }
}

function checkMembership(tests, members, problems) {
    const memberNames = new Set(members.map((m) => m.name));
    const testNames = new Set(tests.map((t) => t.name).filter(Boolean));
    for (const test of tests) {
        if (test.name && !memberNames.has(test.name)) {
            problems.push(`${test.rel}: "${test.name}" is not a member of ${SUITE_FILE}`);
        }
    }
    for (const member of members) {
        if (!testNames.has(member.name)) problems.push(`${member.where}: no test file has Name "${member.name}"`);
    }
}

function checkScriptReferences(repoRoot, tests, problems) {
    const referenced = new Set();
    for (const test of tests) {
        for (const [key, value] of Object.entries(test.configuration)) {
            if (typeof value !== 'string' || !value.startsWith(FILE_REF_PREFIX)) continue;
            const target = resolve(repoRoot, TESTS_ENTITY_DIR, value.slice(FILE_REF_PREFIX.length));
            referenced.add(target);
            if (!existsSync(target)) {
                problems.push(`${test.rel}: Configuration.${key} points to a missing file (${relative(repoRoot, target)})`);
            }
        }
    }
    for (const file of listFilesRecursive(join(repoRoot, SCRIPTS_DIR))) {
        if (basename(file).startsWith('.')) continue;
        if (!referenced.has(resolve(file))) problems.push(`${relative(repoRoot, file)}: no test references this script (orphan)`);
    }
}

function checkLeaks(repoRoot, problems) {
    for (const file of listFilesRecursive(join(repoRoot, LEAK_DIR))) {
        if (!file.endsWith('.json') || file.endsWith('.mj-sync.json')) continue;
        const parsed = readJson(file);
        if (parsed.error) continue;
        const records = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
        if (records.some((r) => r?.fields?.TypeID === COMPUTER_USE_TYPE)) {
            problems.push(`${relative(repoRoot, file)}: Computer Use tests belong in ${TESTS_DIR}, not ${LEAK_DIR}`);
        }
    }
}

/**
 * Checks the regression suite under `repoRoot`.
 * @param {string} repoRoot
 * @returns {{ problems: string[], testCount: number, memberCount: number, fatal: boolean }}
 */
export function checkRegressionSuite(repoRoot) {
    for (const required of [TESTS_DIR, SUITE_FILE]) {
        if (!existsSync(join(repoRoot, required))) {
            return { problems: [`${required} not found`], testCount: 0, memberCount: 0, fatal: true };
        }
    }
    const problems = [];
    const tests = readTests(repoRoot, problems);
    const members = readMembers(repoRoot, problems);
    checkUniqueness(tests, members, problems);
    checkMembership(tests, members, problems);
    checkScriptReferences(repoRoot, tests, problems);
    checkLeaks(repoRoot, problems);
    return { problems, testCount: tests.length, memberCount: members.length, fatal: false };
}

function main() {
    const args = process.argv.slice(2);
    const rootIndex = args.indexOf('--root');
    const repoRoot = rootIndex >= 0 && args[rootIndex + 1] ? resolve(args[rootIndex + 1]) : DEFAULT_ROOT;
    const result = checkRegressionSuite(repoRoot);
    if (result.fatal) {
        console.error(`check-regression-suite: ${result.problems[0]}`);
        process.exit(2);
    }
    if (result.problems.length > 0) {
        console.error(`check-regression-suite: ${result.problems.length} problem(s) in ${SUITE_DIR}:`);
        for (const problem of result.problems) console.error(`  - ${problem}`);
        console.error(`\nHow to add a test: ${SUITE_DIR}/README.md ("Adding a New Test").`);
        process.exit(1);
    }
    console.log(`check-regression-suite: OK (${result.testCount} tests, ${result.memberCount} suite members)`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main();
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `npx vitest run --config .github/scripts/vitest.config.mts __tests__/check-regression-suite`
Expected: PASS (17 tests).

- [ ] **Step 5: Run the guard on the real suite**

Run: `node .github/scripts/check-regression-suite.mjs`
Expected: `check-regression-suite: OK (155 tests, 155 suite members)`, exit 0. If it reports problems, fix the metadata (not the rule) and note each fix.

- [ ] **Step 6: Wire it in**

`package.json` — add after `check:manifest-registrations:test`:

```json
    "check:regression-suite": "node .github/scripts/check-regression-suite.mjs",
    "check:regression-suite:test": "vitest run --config .github/scripts/vitest.config.mts __tests__/check-regression-suite",
```

`.github/scripts/check-guards.sh` — header list: add `#   check:regression-suite                    (regression test files ↔ suite members, replay-script refs)`.
After the `check-manifest-registrations.mjs` line:

```bash
# Regression suite parity: every test file is a suite member, numbers/sequences are unique,
# replay-script references resolve. Pure file reads.
node .github/scripts/check-regression-suite.mjs || status=1
```

and in the failure help block:

```bash
  echo "  regression suite parity         -> metadata-optional/regression-test/README.md (Adding a New Test)"
```

`.github/workflows/test.yml` — in the "Source guards" job, after the "Entity manifest registration gate" step:

```yaml
      # Regression suite parity gate. A Computer Use test file without its suite member (or a member
      # without its file, a duplicate T number, or a replay script no test references) merges cleanly
      # and only shows up as a missing or broken test in the next Docker run. Pure file reads.
      - name: Regression suite parity gate
        if: ${{ !cancelled() }}
        run: node .github/scripts/check-regression-suite.mjs
```

READMEs — replace every `mj test validate --dir=metadata-optional/regression-test/tests` with
`pnpm run check:regression-suite`, and in the integration README replace
`mj test validate --dir=metadata-optional/integration-test/tests/integration` with
`cd packages/TestingFramework/integration-test-suite && pnpm test   # sibling-parity + sequencing checks`.

- [ ] **Step 7: Verify the phase**

Run: `pnpm run check:regression-suite:test && pnpm run check:regression-suite && bash -n .github/scripts/check-guards.sh`
Expected: tests PASS, guard OK, shell syntax OK.
Run: `npx vitest run --config .github/scripts/vitest.config.mts` (the whole guard-script tier, as CI runs it)
Expected: PASS.

- [ ] **Step 8: Commit (after user approval)**

```bash
git add .github/scripts/check-regression-suite.mjs .github/scripts/__tests__/check-regression-suite.test.mjs \
  .github/scripts/check-guards.sh .github/workflows/test.yml package.json \
  metadata-optional/regression-test/README.md metadata-optional/integration-test/tests/integration/README.md
git commit -m "ci(regression): add regression suite parity guard"
```

---

### Task 2: `mj test regression new` scaffold (Phase 2)

**Files:**
- Create: `packages/MJCLI/src/lib/regression/test-scaffold.ts`
- Create: `packages/MJCLI/src/__tests__/regression-test-scaffold.test.ts`
- Create: `packages/MJCLI/src/commands/test/regression/new.ts`
- Modify: `packages/MJCLI/src/commands/test/regression/index.ts` (list `new`)
- Modify: `metadata-optional/regression-test/README.md` ("Adding a New Test")
- Create: `.changeset/<adjective-noun-verb>.md` (`'@memberjunction/cli': patch`)

**Interfaces:**
- Consumes: Task 1's CLI `node .github/scripts/check-regression-suite.mjs --root <dir>` (exit 0 = clean).
- Produces (all exported from `test-scaffold.ts`):
  - `REGRESSION_TESTS_DIR`, `REGRESSION_SUITE_FILE`, `REGRESSION_PARITY_SCRIPT` (string constants)
  - `type RegressionPriority = 'P0' | 'P1' | 'P2' | 'P3'`
  - `IsRegressionPriority(value: string): value is RegressionPriority`
  - `FormatTestNumber(n: number): string` → `"T007"`
  - `ParseTestNumber(text: string): number` → `"T149"`/`"149"` → `149`
  - `SlugifyTitle(title: string): string`
  - `NextTestNumber(fileNames: string[]): number`
  - `interface ScaffoldOptions { Title; Goal; Criteria: string[]; Priority: RegressionPriority; Tags: string[]; StartPath: string; MaxSteps: number; Description?: string; FromNumber?: number }`
  - `interface ScaffoldResult { Number; Name; Sequence; TestFilePath; TestFileContent; SuiteFileContent }`
  - `BuildScaffold(repoRoot: string, options: ScaffoldOptions): ScaffoldResult` (no writes)
  - `WriteScaffold(repoRoot: string, result: ScaffoldResult): void`

- [ ] **Step 1: Write the failing test** — `packages/MJCLI/src/__tests__/regression-test-scaffold.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BuildScaffold,
  FormatTestNumber,
  NextTestNumber,
  ParseTestNumber,
  REGRESSION_PARITY_SCRIPT,
  REGRESSION_SUITE_FILE,
  REGRESSION_TESTS_DIR,
  SlugifyTitle,
  WriteScaffold,
  type ScaffoldOptions,
} from '../lib/regression/test-scaffold';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const UUID_UPPER = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

type JsonRecord = { [key: string]: JsonRecord | JsonRecord[] | string | number | boolean | null };

let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

const T001 = {
  fields: {
    TypeID: '@lookup:MJ: Test Types.Name=Computer Use',
    Name: 'T001 - Login Smoke',
    Description: 'Logs in.',
    InputDefinition: JSON.stringify({ goal: 'Log in.', startUrl: 'http://localhost:4200' }, null, 2),
    ExpectedOutcomes: JSON.stringify({ judgeValidationCriteria: ['Logged in'] }, null, 2),
    Configuration: {
      maxSteps: 35,
      maxExecutionTime: 420000,
      judgeFrequency: 'EveryNSteps:5',
      ReplayScript: '@file:regression/scripts/t001-login-smoke.json',
      PendingReplayScript: '@file:regression/scripts/t001-login-smoke.pending.json',
      oracles: [
        { type: 'url-match', weight: 0.5, config: { pattern: '^http://localhost:4200' } },
        { type: 'step-count', weight: 0.5, config: { maxSteps: 35 } },
      ],
    },
    Status: 'Active',
    Tags: 'P0,regression,smoke',
  },
  primaryKey: { ID: 'C9FE51A9-8750-47FD-A6B6-347ED5E53A65' },
};

const SUITE = {
  fields: { Name: 'MJ Explorer Regression Suite', Status: 'Active' },
  relatedEntities: {
    'MJ: Test Suite Tests': [
      {
        fields: { SuiteID: '@parent:ID', TestID: '@lookup:MJ: Tests.Name=T001 - Login Smoke', Sequence: 1, Status: 'Active' },
        primaryKey: { ID: '8CED55DE-3FC4-414F-BEEA-49F808314738' },
      },
    ],
  },
  primaryKey: { ID: '71428DF0-78F4-4775-95E5-A52D2B4602D1' },
};

/** Builds a fixture repo holding T001, its replay scripts, and a one-member suite. */
function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'regression-scaffold-'));
  roots.push(root);
  mkdirSync(path.join(root, REGRESSION_TESTS_DIR, 'scripts'), { recursive: true });
  writeFileSync(path.join(root, REGRESSION_TESTS_DIR, '.T001-login-smoke.json'), JSON.stringify(T001, null, 2) + '\n');
  writeFileSync(path.join(root, REGRESSION_TESTS_DIR, 'scripts', 't001-login-smoke.json'), '{}');
  writeFileSync(path.join(root, REGRESSION_TESTS_DIR, 'scripts', 't001-login-smoke.pending.json'), '{}');
  mkdirSync(path.dirname(path.join(root, REGRESSION_SUITE_FILE)), { recursive: true });
  writeFileSync(path.join(root, REGRESSION_SUITE_FILE), JSON.stringify(SUITE, null, 2));
  return root;
}

const OPTIONS: ScaffoldOptions = {
  Title: 'Form builder clones a form',
  Goal: 'Open the Forms list, clone Contact Form, and verify the copy opens in the editor.',
  Criteria: ['A new form named Copy of Contact Form is listed', 'The form editor is open on the copy'],
  Priority: 'P1',
  Tags: ['form-builder', 'Regression', 'p2'],
  StartPath: '/app/form-builder',
  MaxSteps: 25,
};

describe('test number helpers', () => {
  it('formats and parses test numbers', () => {
    expect(FormatTestNumber(7)).toBe('T007');
    expect(FormatTestNumber(1234)).toBe('T1234');
    expect(ParseTestNumber('T149')).toBe(149);
    expect(ParseTestNumber('149')).toBe(149);
    expect(() => ParseTestNumber('latest')).toThrow('is not a test number');
  });

  it('picks the highest test number plus one', () => {
    expect(NextTestNumber(['.T001-a.json', '.T155-b.json', 'README.md', '.mj-sync.json', 'scripts'])).toBe(156);
    expect(NextTestNumber([])).toBe(1);
  });

  it('slugifies a title', () => {
    expect(SlugifyTitle('Form Builder: clone a form!')).toBe('form-builder-clone-a-form');
  });
});

describe('BuildScaffold', () => {
  it('builds the next test and its suite member', () => {
    const result = BuildScaffold(makeRepo(), OPTIONS);

    expect(result.Number).toBe(2);
    expect(result.Name).toBe('T002 - Form builder clones a form');
    expect(result.Sequence).toBe(2);
    expect(result.TestFilePath).toBe(`${REGRESSION_TESTS_DIR}/.T002-form-builder-clones-a-form.json`);

    const record = JSON.parse(result.TestFileContent);
    expect(record.primaryKey.ID).toMatch(UUID_UPPER);
    expect(record.fields.Tags).toBe('P1,regression,form-builder');
    expect(typeof record.fields.InputDefinition).toBe('string');
    const input = JSON.parse(record.fields.InputDefinition);
    expect(input.goal).toBe(OPTIONS.Goal);
    expect(input.startUrl).toBe('http://localhost:4200/app/form-builder');
    const expected = JSON.parse(record.fields.ExpectedOutcomes);
    expect(expected.judgeValidationCriteria).toEqual(OPTIONS.Criteria);
    expect(expected.finalUrlPattern).toBe('^http://localhost:4200/app/form-builder');
    const oracles: JsonRecord[] = record.fields.Configuration.oracles;
    expect(oracles.find((o) => o.type === 'url-match')?.config).toEqual({ pattern: '^http://localhost:4200/app/form-builder' });
    expect(oracles.find((o) => o.type === 'step-count')?.config).toEqual({ maxSteps: 25 });
    expect(record.fields.Configuration.maxSteps).toBe(25);
    expect(record.fields.Configuration.maxExecutionTime).toBe(300000);

    const suite = JSON.parse(result.SuiteFileContent);
    const members = suite.relatedEntities['MJ: Test Suite Tests'];
    expect(members[0]).toEqual(SUITE.relatedEntities['MJ: Test Suite Tests'][0]);
    expect(members[1].fields).toEqual({
      SuiteID: '@parent:ID',
      TestID: '@lookup:MJ: Tests.Name=T002 - Form builder clones a form',
      Sequence: 2,
      Status: 'Active',
    });
    expect(members[1].primaryKey.ID).toMatch(UUID_UPPER);
  });

  it('keeps the login exclusion when the test starts at the app root', () => {
    const record = JSON.parse(BuildScaffold(makeRepo(), { ...OPTIONS, StartPath: '' }).TestFileContent);
    expect(JSON.parse(record.fields.ExpectedOutcomes).finalUrlPattern).toBe('^http://localhost:4200(?!/login|/callback)');
  });

  it('copies Configuration from --from without its replay scripts', () => {
    const record = JSON.parse(BuildScaffold(makeRepo(), { ...OPTIONS, FromNumber: 1 }).TestFileContent);
    const configuration = record.fields.Configuration;
    expect(configuration.judgeFrequency).toBe('EveryNSteps:5');
    expect(configuration.ReplayScript).toBeUndefined();
    expect(configuration.PendingReplayScript).toBeUndefined();
    expect(configuration.maxSteps).toBe(25);
  });

  it('rejects a title with "&", empty criteria, and an unknown --from test', () => {
    const root = makeRepo();
    expect(() => BuildScaffold(root, { ...OPTIONS, Title: 'Save & close' })).toThrow('"&"');
    expect(() => BuildScaffold(root, { ...OPTIONS, Criteria: [' '] })).toThrow('--criteria');
    expect(() => BuildScaffold(root, { ...OPTIONS, FromNumber: 99 })).toThrow('.T099-');
  });
});

describe('WriteScaffold', () => {
  it('writes files that pass the regression suite parity guard', () => {
    const root = makeRepo();
    const result = BuildScaffold(root, OPTIONS);
    WriteScaffold(root, result);

    expect(readFileSync(path.join(root, result.TestFilePath), 'utf8')).toBe(result.TestFileContent);
    const guard = spawnSync(process.execPath, [path.join(REPO_ROOT, REGRESSION_PARITY_SCRIPT), '--root', root], { encoding: 'utf8' });
    expect(guard.stderr).toBe('');
    expect(guard.status).toBe(0);
  });

  it('refuses to overwrite an existing test file', () => {
    const root = makeRepo();
    const result = BuildScaffold(root, OPTIONS);
    WriteScaffold(root, result);
    expect(() => WriteScaffold(root, result)).toThrow('already exists');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd packages/MJCLI && pnpm exec vitest run src/__tests__/regression-test-scaffold.test.ts`
Expected: FAIL — cannot resolve `../lib/regression/test-scaffold`.

- [ ] **Step 3: Write the module** — `packages/MJCLI/src/lib/regression/test-scaffold.ts`

```ts
/**
 * Builds new MJ Explorer regression tests: the `.T###-<slug>.json` test record and its member row
 * in `.regression-suite.json`. Building and writing are separate so callers can preview the result.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const REGRESSION_TESTS_DIR = 'metadata-optional/regression-test/tests/regression';
export const REGRESSION_SUITE_FILE = 'metadata-optional/regression-test/test-suites/.regression-suite.json';
export const REGRESSION_PARITY_SCRIPT = '.github/scripts/check-regression-suite.mjs';

const COMPUTER_USE_TYPE = '@lookup:MJ: Test Types.Name=Computer Use';
const MEMBER_ENTITY = 'MJ: Test Suite Tests';
const BASE_URL = 'http://localhost:4200';
const ALLOWED_DOMAINS = ['localhost', '*.auth0.com'];
const NOT_LOGIN_PAGE = '(?!/login|/callback)';
const MS_PER_STEP = 12000;
const MIN_EXECUTION_MS = 300000;
const TEST_FILE_RE = /^\.T(\d{3,})-.+\.json$/;
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type RegressionPriority = (typeof PRIORITIES)[number];

type RegressionTestFile = {
  fields: {
    TypeID: string;
    Name: string;
    Description: string;
    InputDefinition: string;
    ExpectedOutcomes: string;
    Configuration: JsonObject;
    Status: string;
    Tags: string;
  };
  primaryKey: { ID: string };
};

type RegressionSuiteMember = {
  fields: { SuiteID: string; TestID: string; Sequence: number; Status: string };
  primaryKey: { ID: string };
};

type RegressionSuiteFile = {
  relatedEntities: { [entity: string]: JsonValue[] };
};

export interface ScaffoldOptions {
  /** Title without the `T### - ` prefix. */
  Title: string;
  /** What the controller LLM must achieve, stated as the success state. */
  Goal: string;
  /** Judge criteria, checked against the final screenshot. */
  Criteria: string[];
  Priority: RegressionPriority;
  /** Area tags. The priority and `regression` are always added. */
  Tags: string[];
  /** Path after the base URL, e.g. `/app/form-builder`. Empty for the app root. */
  StartPath: string;
  MaxSteps: number;
  /** Defaults to the goal. */
  Description?: string;
  /** Copy `Configuration` from this existing test number. */
  FromNumber?: number;
}

export interface ScaffoldResult {
  Number: number;
  Name: string;
  Sequence: number;
  /** Repo-relative path of the new test file. */
  TestFilePath: string;
  TestFileContent: string;
  SuiteFileContent: string;
}

export function IsRegressionPriority(value: string): value is RegressionPriority {
  return (PRIORITIES as readonly string[]).includes(value);
}

/** Formats a test number as `T###`. */
export function FormatTestNumber(n: number): string {
  return `T${String(n).padStart(3, '0')}`;
}

/** Parses `T149` or `149` into `149`. */
export function ParseTestNumber(text: string): number {
  const match = /^T?(\d+)$/i.exec(text.trim());
  if (!match) throw new Error(`"${text}" is not a test number (use T149 or 149).`);
  return Number(match[1]);
}

/** Turns a title into the kebab-case part of a test file name. */
export function SlugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** Returns the highest `.T###-*.json` number plus one. */
export function NextTestNumber(fileNames: string[]): number {
  let max = 0;
  for (const name of fileNames) {
    const match = TEST_FILE_RE.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function newRecordId(): string {
  return randomUUID().toUpperCase();
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStartPath(startPath: string): string {
  const trimmed = startPath.trim();
  if (trimmed === '' || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildTags(priority: RegressionPriority, tags: string[]): string {
  const extra = tags
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '' && t !== 'regression' && !/^p[0-3]$/.test(t));
  return [priority, 'regression', ...new Set(extra)].join(',');
}

function validateOptions(options: ScaffoldOptions): string[] {
  if (options.Title.trim() === '') throw new Error('A test title is required.');
  if (options.Title.includes('&')) throw new Error('The title must not contain "&" (it breaks the @lookup parser). Use "and".');
  if (options.Goal.trim() === '') throw new Error('A goal is required.');
  const criteria = options.Criteria.map((c) => c.trim()).filter((c) => c !== '');
  if (criteria.length === 0) throw new Error('At least one --criteria is required.');
  if (!Number.isInteger(options.MaxSteps) || options.MaxSteps < 1) throw new Error('--max-steps must be a positive integer.');
  return criteria;
}

function defaultConfiguration(): JsonObject {
  return {
    headless: true,
    maxSteps: 0,
    maxExecutionTime: 0,
    screenshotHistoryDepth: 3,
    viewportWidth: 1280,
    viewportHeight: 720,
    controllerPromptName: 'Computer Use - Controller',
    judgePromptName: 'Computer Use - Judge',
    judgeFrequency: 'EveryNSteps:3',
    oracles: [
      { type: 'goal-completion', weight: 0.5, config: { minConfidence: 0.7 } },
      { type: 'url-match', weight: 0.3, config: { pattern: '' } },
      { type: 'step-count', weight: 0.2, config: { maxSteps: 0 } },
    ],
    scoringWeights: { 'goal-completion': 0.5, 'url-match': 0.3, 'step-count': 0.2 },
  };
}

/** Builds Configuration from a source test (minus its replay scripts) or the default template. */
function buildConfiguration(maxSteps: number, finalUrlPattern: string, source: JsonObject | undefined): JsonObject {
  const configuration: JsonObject = source ? structuredClone(source) : defaultConfiguration();
  delete configuration.ReplayScript;
  delete configuration.PendingReplayScript;
  configuration.maxSteps = maxSteps;
  configuration.maxExecutionTime = Math.max(MIN_EXECUTION_MS, maxSteps * MS_PER_STEP);
  const oracles = configuration.oracles;
  if (Array.isArray(oracles)) {
    for (const oracle of oracles) {
      if (!isJsonObject(oracle) || !isJsonObject(oracle.config)) continue;
      if (oracle.type === 'url-match') oracle.config.pattern = finalUrlPattern;
      if (oracle.type === 'step-count') oracle.config.maxSteps = maxSteps;
    }
  }
  return configuration;
}

function readSourceConfiguration(testsDir: string, fileNames: string[], fromNumber: number): JsonObject {
  const prefix = `.${FormatTestNumber(fromNumber)}-`;
  const file = fileNames.find((n) => n.startsWith(prefix) && n.endsWith('.json'));
  if (!file) throw new Error(`No test file starts with ${prefix} in ${REGRESSION_TESTS_DIR}.`);
  const source = JSON.parse(readFileSync(path.join(testsDir, file), 'utf8')) as RegressionTestFile;
  return source.fields.Configuration;
}

function suiteMembers(suite: RegressionSuiteFile): RegressionSuiteMember[] {
  const list = suite.relatedEntities?.[MEMBER_ENTITY];
  if (!Array.isArray(list)) throw new Error(`${REGRESSION_SUITE_FILE} has no relatedEntities["${MEMBER_ENTITY}"].`);
  return list as RegressionSuiteMember[];
}

/** Builds the new test record and the updated suite file. Writes nothing. */
export function BuildScaffold(repoRoot: string, options: ScaffoldOptions): ScaffoldResult {
  const criteria = validateOptions(options);
  const testsDir = path.join(repoRoot, REGRESSION_TESTS_DIR);
  const fileNames = readdirSync(testsDir);
  const number = NextTestNumber(fileNames);
  const title = options.Title.trim();
  const name = `${FormatTestNumber(number)} - ${title}`;
  const startPath = normalizeStartPath(options.StartPath);
  const startUrl = `${BASE_URL}${startPath}`;
  const finalUrlPattern = `^${escapeRegExp(startUrl)}${startPath === '' ? NOT_LOGIN_PAGE : ''}`;
  const source = options.FromNumber === undefined ? undefined : readSourceConfiguration(testsDir, fileNames, options.FromNumber);

  const record: RegressionTestFile = {
    fields: {
      TypeID: COMPUTER_USE_TYPE,
      Name: name,
      Description: (options.Description ?? options.Goal).trim(),
      InputDefinition: JSON.stringify(
        {
          goal: options.Goal.trim(),
          startUrl,
          allowedDomains: ALLOWED_DOMAINS,
          auth: {
            bindings: [
              {
                domains: ALLOWED_DOMAINS,
                method: { Type: 'Basic', Username: '{{authUsername}}', Password: '{{authPassword}}', Strategy: 'FormLogin' },
              },
            ],
          },
        },
        null,
        2,
      ),
      ExpectedOutcomes: JSON.stringify(
        { goalCompleted: true, finalUrlPattern, minConfidence: 0.7, maxSteps: options.MaxSteps, judgeValidationCriteria: criteria },
        null,
        2,
      ),
      Configuration: buildConfiguration(options.MaxSteps, finalUrlPattern, source),
      Status: 'Active',
      Tags: buildTags(options.Priority, options.Tags),
    },
    primaryKey: { ID: newRecordId() },
  };

  const suiteText = readFileSync(path.join(repoRoot, REGRESSION_SUITE_FILE), 'utf8');
  const suite = JSON.parse(suiteText) as RegressionSuiteFile;
  const members = suiteMembers(suite);
  const sequence = members.reduce((max, m) => Math.max(max, m.fields.Sequence), 0) + 1;
  members.push({
    fields: { SuiteID: '@parent:ID', TestID: `@lookup:MJ: Tests.Name=${name}`, Sequence: sequence, Status: 'Active' },
    primaryKey: { ID: newRecordId() },
  });

  return {
    Number: number,
    Name: name,
    Sequence: sequence,
    TestFilePath: `${REGRESSION_TESTS_DIR}/.${FormatTestNumber(number)}-${SlugifyTitle(title)}.json`,
    TestFileContent: `${JSON.stringify(record, null, 2)}\n`,
    SuiteFileContent: JSON.stringify(suite, null, 2) + (suiteText.endsWith('\n') ? '\n' : ''),
  };
}

/** Writes the test file and the updated suite file. Refuses to overwrite a test file. */
export function WriteScaffold(repoRoot: string, result: ScaffoldResult): void {
  const testPath = path.join(repoRoot, result.TestFilePath);
  if (existsSync(testPath)) throw new Error(`${result.TestFilePath} already exists.`);
  writeFileSync(testPath, result.TestFileContent);
  writeFileSync(path.join(repoRoot, REGRESSION_SUITE_FILE), result.SuiteFileContent);
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd packages/MJCLI && pnpm exec vitest run src/__tests__/regression-test-scaffold.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the command** — `packages/MJCLI/src/commands/test/regression/new.ts`

```ts
import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import { RequireMonorepoRoot, SpawnInherit } from '../../../lib/regression/docker-helpers.js';
import {
  BuildScaffold,
  IsRegressionPriority,
  ParseTestNumber,
  REGRESSION_PARITY_SCRIPT,
  REGRESSION_SUITE_FILE,
  WriteScaffold,
  type ScaffoldResult,
} from '../../../lib/regression/test-scaffold.js';

export default class TestRegressionNew extends Command {
  static description = 'Create a new MJ Explorer regression test and add it to the regression suite.';

  static examples = [
    `<%= config.bin %> <%= command.id %> --name "Form builder clones a form" --priority P1 --tags form-builder \\
  --start-path /app/form-builder --goal "Clone Contact Form and verify the copy opens in the editor." \\
  --criteria "A form named Copy of Contact Form is listed" --criteria "The form editor is open on the copy"`,
    '<%= config.bin %> <%= command.id %> --name "..." --goal "..." --criteria "..." --priority P2 --from T149 --dry-run',
  ];

  static flags = {
    name: Flags.string({ description: 'Test title, without the T### prefix. Must not contain "&".', required: true }),
    goal: Flags.string({ description: 'What the agent must achieve, stated as the success state.', required: true }),
    criteria: Flags.string({ description: 'A judge criterion (repeat the flag for more).', required: true, multiple: true }),
    priority: Flags.string({ description: 'Release priority.', required: true, options: ['P0', 'P1', 'P2', 'P3'] }),
    tags: Flags.string({ description: 'Comma-separated area tags, e.g. form-builder,crud.', default: '' }),
    'start-path': Flags.string({ description: 'Path after http://localhost:4200, e.g. /app/form-builder.', default: '' }),
    description: Flags.string({ description: 'Test description. Defaults to the goal.' }),
    'max-steps': Flags.integer({ description: 'Controller step limit.', default: 25, min: 1 }),
    from: Flags.string({ description: 'Copy Configuration from this test number, e.g. T149.' }),
    'dry-run': Flags.boolean({ description: 'Print the files without writing them.', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionNew);
    RequireMonorepoRoot();
    if (!IsRegressionPriority(flags.priority)) this.error(`Unknown priority ${flags.priority}.`);

    const repoRoot = process.cwd();
    let result: ScaffoldResult;
    try {
      result = BuildScaffold(repoRoot, {
        Title: flags.name,
        Goal: flags.goal,
        Criteria: flags.criteria,
        Priority: flags.priority,
        Tags: flags.tags.split(','),
        StartPath: flags['start-path'],
        MaxSteps: flags['max-steps'],
        Description: flags.description,
        FromNumber: flags.from === undefined ? undefined : ParseTestNumber(flags.from),
      });
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }

    if (flags['dry-run']) {
      this.log(`# ${result.TestFilePath}\n${result.TestFileContent}`);
      this.log(`# ${REGRESSION_SUITE_FILE}: new member "${result.Name}" at Sequence ${result.Sequence}`);
      return;
    }

    try {
      WriteScaffold(repoRoot, result);
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }
    this.log(`✓ Created ${result.Name}`);
    this.log(`  ${result.TestFilePath}`);
    this.log(`  Suite member added to ${REGRESSION_SUITE_FILE} at Sequence ${result.Sequence}`);

    if (existsSync(REGRESSION_PARITY_SCRIPT)) {
      const code = await SpawnInherit('node', [REGRESSION_PARITY_SCRIPT]);
      if (code !== 0) this.error('The regression suite parity check failed. Fix the problems listed above.');
    }

    this.log('\nNext steps:');
    this.log('  1. Read the new file and sharpen the goal and criteria.');
    this.log('  2. Load it into your database: pnpm mj sync push --dir=metadata-optional/regression-test');
    this.log(`  3. Run it: pnpm mj test run --name "${result.Name}"`);
    this.log(`  If another PR takes ${result.Name.split(' ')[0]} before yours merges, renumber this test after you rebase.`);
  }
}
```

In `packages/MJCLI/src/commands/test/regression/index.ts` add to `examples`:
`'<%= config.bin %> <%= command.id %> new --name "..." --goal "..." --criteria "..." --priority P1  # Add a test to the suite',`
and to the subcommand list:
`this.log('  mj test regression new                Add a new test file + suite member (no database)');`

- [ ] **Step 6: Build and smoke-test the command**

Run: `cd packages/MJCLI && pnpm run build`
Expected: no TypeScript errors; `oclif manifest` lists `test:regression:new`.
Run (repo root): `node packages/MJCLI/bin/run.js test regression new --name "Scaffold smoke" --goal "Open home." --criteria "Home is visible" --priority P3 --dry-run`
Expected: prints `.T156-scaffold-smoke.json` content and `new member "T156 - Scaffold smoke" at Sequence 156`. `git status` shows no metadata change.

- [ ] **Step 7: Update the README and add the changeset**

In `metadata-optional/regression-test/README.md`, replace the "Adding a New Test" steps with:

```markdown
1. **Scaffold it** (picks the next free number, writes the file, adds the suite member, runs the parity check):
   ```bash
   pnpm mj test regression new --name "My new test" --priority P1 --tags my-area \
     --start-path /app/my-app --goal "What success looks like." \
     --criteria "First visible proof" --criteria "Second visible proof" [--from T041]
   ```
2. **Read the new file** and sharpen `goal`, `judgeValidationCriteria`, `finalUrlPattern` and `maxSteps`.
   Keep the generated `primaryKey` — every record needs one.
3. **Check the suite**: `pnpm run check:regression-suite`
4. **Push and run it**: `pnpm mj sync push --dir=metadata-optional/regression-test`, then
   `pnpm mj test run --name "T156 - My new test"`.
5. If another PR takes the same number first, the parity check fails after you rebase. Renumber the
   file, its `Name`, and its suite member.
```

Create `.changeset/<adjective-noun-verb>.md` (pick a fresh three-word name):

```markdown
---
'@memberjunction/cli': patch
---

Add `mj test regression new`, which scaffolds a regression test file and its suite member.
```

Run: `npm run check:changeset`
Expected: PASS.

- [ ] **Step 8: Verify the phase**

Run: `cd packages/MJCLI && pnpm test`
Expected: the whole MJCLI suite PASSES (report pass/fail/skip counts).
Run (repo root): `pnpm run check:regression-suite`
Expected: OK (155 tests).

- [ ] **Step 9: Commit (after user approval)**

```bash
git add packages/MJCLI/src/lib/regression/test-scaffold.ts packages/MJCLI/src/__tests__/regression-test-scaffold.test.ts \
  packages/MJCLI/src/commands/test/regression/new.ts packages/MJCLI/src/commands/test/regression/index.ts \
  metadata-optional/regression-test/README.md .changeset/<name>.md
git commit -m "feat(cli): add mj test regression new scaffold"
```

---

### Task 3: Phase 0 spike — harvest round-trip (throwaway)

Nothing from this task is committed. Its output is the "Phase 0 findings" section appended to
the spec, which decides the Phases 3–6 plan.

**Preconditions (ask the user):**
- The running `mj-regression` stack (from `~/Projects/MJ/.claude/worktrees/lts-6.2`) is stopped or may be stopped. Never stop it without the user's yes.
- A `docker/regression/.env.test` may be copied from `.claude/worktrees/rubric-regression/`.

- [ ] **Step 1: Throwaway worktree**

```bash
git fetch origin next
git worktree add --detach .claude/worktrees/spike-harvest origin/next
cp .claude/worktrees/rubric-regression/docker/regression/.env.test .claude/worktrees/spike-harvest/docker/regression/.env.test
```

- [ ] **Step 2: Two-test suite** — create `.claude/worktrees/spike-harvest/metadata-optional/regression-test/test-suites/.spike-suite.json`
  with suite Name `Harvest Spike Suite`, `primaryKey` from `uuidgen`, and two members (T001, T002), each with a `uuidgen` primaryKey.

- [ ] **Step 3: Build** (from the spike worktree; long on a cold cache)

```bash
cd .claude/worktrees/spike-harvest
[ -d docker/regression/.docker-generated ] || bash docker/regression/gen-forms.sh
docker compose -f docker/regression/docker-compose.test.yml --env-file docker/regression/.env.test --profile full build
```

- [ ] **Step 4: Run and wait**

```bash
C="docker compose -f docker/regression/docker-compose.test.yml --env-file docker/regression/.env.test --profile full"
TEST_SUITE_NAME="Harvest Spike Suite" $C up -d
$C wait test-runner
```

Record: exit code, `docker/regression/test-results/latest/report.md` pass counts, tier per test.

- [ ] **Step 5: Prove (0) — a one-off container reaches the database**

```bash
$C run --rm --no-deps --entrypoint node test-runner /app/packages/MJCLI/bin/run.js test scripts
```

Expected: `Pending replay scripts (0)` or a list. An error means the one-off container cannot see the DB settings; record the error and try `--entrypoint bash ... -c "source <entrypoint env>; node ..."`.

- [ ] **Step 6: Prove (a)/(b) — the pull writes only script files and references**

```bash
$C run --rm --no-deps --entrypoint node test-runner /app/packages/MJCLI/bin/run.js \
  sync pull --entity="MJ: Tests" --target-dir=metadata-optional/regression-test/tests
git status --porcelain
git diff --stat
```

Record: which files changed, whether the 63 `\u`-escaped files got rewritten, whether `primaryKey`/key order changed, the script file names (`{Name}` sanitization), and that `T001`/`T002` gained `Configuration.ReplayScript`.
Then run `node .github/scripts/check-regression-suite.mjs` **from the main checkout with `--root .claude/worktrees/spike-harvest`** (the spike worktree is `next`, which does not have the guard yet).

- [ ] **Step 7: Prove (c) — the next run replays**

```bash
$C down -v
TEST_SUITE_NAME="Harvest Spike Suite" $C up -d
$C wait test-runner
```

Expected: T001/T002 report the replay tier in `results.json`. Record it.

- [ ] **Step 8: Tear down and record**

```bash
$C down -v
cd ../../..
git worktree remove --force .claude/worktrees/spike-harvest
```

Append "## 7. Phase 0 findings" to the spec with: the answers to (0), (a), (b), (c), run times, and the decision — keep `sync pull` (with an optional one-time normalization of the 63 escaped files) or write a focused harvester.
