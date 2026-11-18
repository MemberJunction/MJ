#!/usr/bin/env node
/**
 * Regression suite parity gate.
 *
 * Checks the MJ Explorer regression suite metadata in `metadata-optional/regression-test/`:
 *   - every `tests/regression/.T###-*.json` file is a member of `.regression-suite.json`, and
 *     every member names an existing test;
 *   - test numbers, test names, member sequences and record IDs are unique, and each Name starts with the
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

/** The record's primaryKey ID in upper case (UUIDs compare without case), or null. */
function recordId(record) {
    const id = String(record?.primaryKey?.ID ?? '');
    return UUID_RE.test(id) ? id.toUpperCase() : null;
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
        id: recordId(record),
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
        members.push({ name: testId.slice(MEMBER_LOOKUP_PREFIX.length), sequence: fields.Sequence, id: recordId(member), where });
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
    for (const [id, group] of findDuplicates(tests, (t) => t.id)) {
        problems.push(`primaryKey.ID ${id} is used by ${group.map((t) => t.rel).join(', ')} (give the copy a new one: uuidgen)`);
    }
    for (const [id, group] of findDuplicates(members, (m) => m.id)) {
        problems.push(`${SUITE_FILE}: primaryKey.ID ${id} is used by ${group.map((m) => `"${m.name}"`).join(', ')} (give the copy a new one: uuidgen)`);
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
