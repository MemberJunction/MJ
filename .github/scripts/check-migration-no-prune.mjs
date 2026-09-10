#!/usr/bin/env node
/**
 * check-migration-no-prune.mjs
 *
 * A versioned or baseline migration must not contain spDeleteUnneededEntityFields.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * spDeleteUnneededEntityFields reconciles __mj.EntityField against the columns
 * visible in each entity's BaseView at the moment it runs. That is valid against
 * a finished schema during live CodeGen execution.
 *
 * In a replayable versioned or baseline migration (Flyway V*__*.sql or B*__*.sql),
 * it executes against an intermediate schema state where subsequent migrations have
 * not yet created or altered views. The procedure erroneously concludes newly added
 * fields are "unneeded" and deletes them, breaking BaseEntity.Save() on clean
 * database replays.
 *
 * Unlike the sequence gate (which excludes baselines because initial dumps have
 * no second-migration sequence collision risk), this gate MUST inspect both V and B
 * migrations: baselines run on a clean install, which is the exact moment an
 * unneeded-fields prune executes against an incomplete view set and deletes sibling fields.
 *
 * CodeGen marks these calls `isRecurringScript: true`, and `omitRecurringScriptsFromLog: true`
 * suppresses them from emitted migration logs. They must remain live-CodeGen-only.
 *
 * See plans/entityfield-prune-replay-defect.md.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────────
 * CI form (`<base> <head>`): migration files added, modified, copied or renamed between
 * the two commits; only LINES the PR adds are reported. Local form (no arguments): the
 * working tree plus untracked files against merge-base(origin/next, HEAD).
 *
 * Usage (from any directory inside the repository):
 *   node check-migration-no-prune.mjs                 # local form
 *   node check-migration-no-prune.mjs <base> <head>   # CI form
 *   node check-migration-no-prune.mjs --all           # every migration, informational
 *   node check-migration-no-prune.mjs --self-test     # test fixtures
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { stripSqlComments } from './check-codegen-tail.mjs';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', DIM = '\x1b[2m', NC = '\x1b[0m';
const GIT_MAX_BUFFER = Number(process.env.MJ_GIT_MAX_BUFFER) || 256 * 1024 * 1024;
// Flyway versioned (V) and baseline (B) migrations.
// NOTE: unlike the sequence gate (which excludes baselines because baselines are initial dumps with no
// second-migration UQ_EntityField_EntityID_Sequence collision risk), this gate MUST include baselines.
// A baseline runs on a clean install, which is the exact moment an unneeded-fields prune executes against
// an incomplete view set and deletes newly created fields from sibling schemas.
const VERSIONED_MIGRATION_RE = /(^|\/)[VB]\d{12}__[^/]*\.sql$/;
const FIXTURE_DIR_RE = /(^|\/)tests?\//;
export const inScope = (f) => VERSIONED_MIGRATION_RE.test(f) && !FIXTURE_DIR_RE.test(f);

/** Opening / reference to spDeleteUnneededEntityFields in any quoting or call convention. */
const PRUNE_PROC_RE = /(?:\[spDeleteUnneededEntityFields\]|"spDeleteUnneededEntityFields"|`spDeleteUnneededEntityFields`|\bspDeleteUnneededEntityFields\b)/i;

/**
 * Scan text for unmasked occurrences of spDeleteUnneededEntityFields.
 * Operates on masked text where comments and string literals have been blanked.
 * Returns array of { line, match } objects (1-indexed line numbers).
 */
export function scanContent(rawSql) {
    const masked = stripSqlComments(rawSql);
    const lines = masked.split(/\r?\n/);
    const hits = [];

    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (PRUNE_PROC_RE.test(lineText)) {
            hits.push({ line: i + 1, match: lineText.trim() });
        }
    }
    return hits;
}

/** Parse added line numbers off a unified diff hunk header. */
export function addedLinesFromDiff(diff) {
    const lines = new Set();
    const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let m;
    while ((m = HUNK_RE.exec(diff)) !== null) {
        const start = parseInt(m[1], 10);
        const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
        for (let i = 0; i < count; i++) {
            lines.add(start + i);
        }
    }
    return lines;
}

export const SELF_TEST_FIXTURES = [
    [
        'bare EXEC spDeleteUnneededEntityFields',
        true,
        `EXEC [__mj].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging';`
    ],
    [
        'quoted EXEC "spDeleteUnneededEntityFields"',
        true,
        `EXEC [__mj]."spDeleteUnneededEntityFields" @ExcludedSchemaNames='sys,staging';`
    ],
    [
        'unquoted spDeleteUnneededEntityFields',
        true,
        `EXEC spDeleteUnneededEntityFields;`
    ],
    [
        'spDeleteUnneededEntityFields inside a single-line comment',
        false,
        `-- skipped spDeleteUnneededEntityFields: header of this file — these collide`
    ],
    [
        'spDeleteUnneededEntityFields inside a block comment',
        false,
        `/* EXEC [__mj].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging'; */`
    ],
    [
        'spDeleteUnneededEntityFields inside string literal',
        false,
        `SELECT 'spDeleteUnneededEntityFields' AS RoutineName;`
    ],
    [
        'clean migration with standard DDL',
        false,
        `CREATE VIEW [__mj].[vwTest] AS SELECT 1 AS ID;\nGRANT SELECT ON [__mj].[vwTest] TO [cdp_UI];`
    ]
];

const SCOPE_TEST_FIXTURES = [
    ['V-prefix migration is in scope', true, 'migrations/v1/V202607141200__v1.0.0.sql'],
    ['B-prefix baseline migration is in scope', true, 'migrations/v1/B202607141200__v1.0.0.sql'],
    ['fixture in tests/ is excluded', false, 'tests/migrations/V202607141200__v1.0.0.sql'],
    ['fixture in test/ is excluded', false, 'test/migrations/B202607141200__v1.0.0.sql'],
    ['repeatable migration is excluded', false, 'migrations/R__RefreshMetadata.sql'],
    ['non-migration sql file is excluded', false, 'scripts/seed.sql'],
];

export function runSelfTest() {
    let failed = 0;
    for (const [name, expected, sql] of SELF_TEST_FIXTURES) {
        const hits = scanContent(sql);
        const actual = hits.length > 0;
        if (actual !== expected) {
            console.error(`${RED}FAIL${NC} ${name}: expected ${expected}, got ${actual}`);
            failed++;
        } else {
            console.log(`${GREEN}PASS${NC} ${name}`);
        }
    }
    for (const [name, expected, path] of SCOPE_TEST_FIXTURES) {
        const actual = inScope(path);
        if (actual !== expected) {
            console.error(`${RED}FAIL${NC} ${name}: expected ${expected}, got ${actual}`);
            failed++;
        } else {
            console.log(`${GREEN}PASS${NC} ${name}`);
        }
    }
    if (failed > 0) {
        console.error(`\n${RED}Self-test failed: ${failed} fixture(s) failed.${NC}`);
        process.exit(1);
    }
    console.log(`\n${GREEN}Self-test passed: all fixtures behaved as expected.${NC}`);
}

function git(args, opts = {}) {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, ...opts });
}

function gitRepoRoot() {
    return git(['rev-parse', '--show-toplevel']).trim();
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--self-test')) {
        runSelfTest();
        return;
    }

    const root = gitRepoRoot();
    let violations = 0;

    if (args.includes('--all')) {
        const files = git(['ls-files', '*.sql'], { cwd: root })
            .split('\n')
            .map((f) => f.trim())
            .filter((f) => f && inScope(f));

        for (const file of files) {
            const abs = join(root, file);
            if (!existsSync(abs)) continue;
            const content = readFileSync(abs, 'utf8');
            const hits = scanContent(content);
            if (hits.length > 0) {
                console.log(`${YELLOW}${file}${NC} (informational)`);
                for (const h of hits) {
                    console.log(`    ${DIM}line ${h.line}:${NC} ${h.match}`);
                }
            }
        }
        return;
    }

    let changedFiles = [];
    let isCi = args.length >= 2;
    let base = args[0];
    let head = args[1];

    if (isCi) {
        const diffFiles = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...${head}`], { cwd: root })
            .split('\n')
            .map((f) => f.trim())
            .filter((f) => f && inScope(f));
        changedFiles = diffFiles;
    } else {
        const baseRef = process.env.BASE_REF || 'origin/next';
        let mergeBase;
        try {
            mergeBase = git(['merge-base', baseRef, 'HEAD'], { cwd: root }).trim();
        } catch {
            mergeBase = 'HEAD';
        }
        const diffFiles = git(['diff', '--name-only', '--diff-filter=ACMR', mergeBase], { cwd: root })
            .split('\n')
            .map((f) => f.trim())
            .filter((f) => f && inScope(f));
        const untracked = git(['ls-files', '--others', '--exclude-standard'], { cwd: root })
            .split('\n')
            .map((f) => f.trim())
            .filter((f) => f && inScope(f));
        changedFiles = [...new Set([...diffFiles, ...untracked])];
        base = mergeBase;
        head = 'HEAD';
    }

    for (const file of changedFiles) {
        const abs = join(root, file);
        if (!existsSync(abs)) continue;

        const content = readFileSync(abs, 'utf8');
        const hits = scanContent(content);
        if (hits.length === 0) continue;

        let addedLines = null;
        if (isCi) {
            const fileDiff = git(['diff', '-U0', `${base}...${head}`, '--', file], { cwd: root });
            addedLines = addedLinesFromDiff(fileDiff);
        }

        const filteredHits = addedLines
            ? hits.filter((h) => addedLines.has(h.line))
            : hits;

        if (filteredHits.length > 0) {
            console.error(`${RED}✗ ${file}${NC}`);
            for (const h of filteredHits) {
                console.error(`    ${YELLOW}line ${h.line}:${NC} ${h.match}`);
            }
            violations += filteredHits.length;
        }
    }

    if (violations > 0) {
        console.error(`\n${RED}spDeleteUnneededEntityFields detected in versioned migrations!${NC}`);
        console.error(`
spDeleteUnneededEntityFields is a live-reconciler and must never be emitted into
replayable versioned migrations (it deletes fields on clean replay).
Ensure omitRecurringScriptsFromLog: true is set in mj.config.cjs and CodeGenLib.

See plans/entityfield-prune-replay-defect.md for details.`);
        process.exit(1);
    }

    console.log(`${GREEN}✓ no spDeleteUnneededEntityFields in changed migrations${NC}`);
}

const isEntry = () => {
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
};

if (isEntry()) {
    main();
}
