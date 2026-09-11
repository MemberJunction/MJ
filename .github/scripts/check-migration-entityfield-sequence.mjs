#!/usr/bin/env node
/**
 * check-migration-entityfield-sequence.mjs
 *
 * A migration must not INSERT an EntityField row with a LITERAL Sequence value.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * CodeGen's EntityField INSERT is appended VERBATIM to a migration. Whatever number the
 * generating database had free — the catalog ordinal, or a MAX+100000+ordinal placeholder — is
 * only valid there. Flyway runs ALL versioned migrations before ANY repeatable script, so on a
 * database built only from migrations the renumber (spUpdateExistingEntityFieldsFromSchema, via
 * R__RefreshMetadata) never runs in between, and a later migration touching the same entity
 * collides on UQ_EntityField_EntityID_Sequence. Without SET XACT_ABORT ON the unique violation
 * aborts one statement, execution continues, and the run dies later on an unrelated-looking FK
 * error against EntityFieldValue. It cannot fail on a working dev database; it fails only on
 * fresh installs. See MJ#3670 and MJ#4202.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * The Sequence must be an expression evaluated at APPLY time, one INSERT statement per row:
 *
 *     (SELECT COALESCE(MAX([Sequence]), 0) + 1
 *        FROM [${flyway:defaultSchema}].[EntityField]
 *       WHERE [EntityID] = '<entity-id>')
 *
 * CodeGen emits exactly this (manage-metadata.ts, getPendingEntityFieldINSERTSQL). This gate
 * exists for hand-authored SQL and for a regression in the emitter — #4048 shipped one that
 * wrote the low catalog ordinal, which the previous band-only detector (`1[0-9]{5},`) did not
 * see. The detector is therefore POSITIONAL: it parses the INSERT's column list, finds the
 * Sequence column, and flags any bare integer in that position of every VALUES tuple.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────────
 * CI form (`<base> <head>`): migration files added, modified, copied or renamed between the two
 * commits; only LINES the PR adds are reported. Local form (no arguments): the working tree plus
 * untracked files against merge-base(BASE_REF, HEAD) — the state right after appending a fresh
 * CodeGen capture. Only Flyway versioned files (`V<12 digits>__*.sql`) are scanned, as the sibling
 * guards do: baselines (`B*__Baseline.sql`) are dumps of EntityField and literal by construction, and
 * fixture SQL under a `tests/` directory is never run by Flyway. Committed migrations carrying the literal form (hundreds, including the baselines)
 * are left alone deliberately: they apply today, and rewriting them would change Flyway checksums
 * on every existing database. `--all` scans every migration and is informational (exit 0).
 *
 * Usage (from any directory inside the repository):
 *   node check-migration-entityfield-sequence.mjs                 # local form, see SCOPE
 *   node check-migration-entityfield-sequence.mjs <base> <head>   # CI form
 *   node check-migration-entityfield-sequence.mjs --all           # every migration, informational
 *   node check-migration-entityfield-sequence.mjs --self-test     # the detector's own fixtures
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// Offset-preserving masker: blanks comments (nested too) and string literals, preserves newlines
// and bracketed identifiers verbatim. Positions in the masked text equal positions in the source.
import { stripSqlComments } from './check-codegen-tail.mjs';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', DIM = '\x1b[2m', NC = '\x1b[0m';
const GIT_MAX_BUFFER = Number(process.env.MJ_GIT_MAX_BUFFER) || 256 * 1024 * 1024;
/** Flyway versioned migrations only: baselines are literal by construction, fixture SQL never runs. */
const VERSIONED_MIGRATION_RE = /(^|\/)V\d{12}__[^/]*\.sql$/;
const FIXTURE_DIR_RE = /(^|\/)tests?\//;
const inScope = (f) => VERSIONED_MIGRATION_RE.test(f) && !FIXTURE_DIR_RE.test(f);

/** Opening of an EntityField INSERT in either quoting dialect; `EntityFieldValue` etc. do not match. */
const EF_INSERT_RE = /INSERT\s+INTO\s+(?:[^\s(]*?[.\]"`])?(?:\[EntityField\]|"EntityField"|`EntityField`|EntityField)\s*\(/gi;

// ─── Parsing (operates on MASKED text: no comments, no string literal contents) ────────────────

/**
 * Parse a parenthesised, comma-separated list starting at `text[open]` (which must be `(`).
 * Bracketed identifiers are opaque (`]]` escapes honoured); nested parentheses are balanced.
 * Returns each item trimmed, the offset of its first significant character (for line
 * attribution), and the index just past the closing parenthesis; null if unbalanced.
 */
export function parseParenList(text, open) {
    if (text[open] !== '(') return null;
    const items = [], offsets = [];
    const push = (from, to) => {
        const raw = text.slice(from, to);
        const lead = raw.search(/\S/);
        items.push(raw.trim());
        offsets.push(lead === -1 ? to : from + lead);
    };
    let depth = 0, i = open, start = open + 1;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '[') {
            let j = i + 1;
            for (;;) {
                const close = text.indexOf(']', j);
                if (close === -1) { j = text.length; break; }
                if (text[close + 1] === ']') { j = close + 2; continue; }
                j = close + 1; break;
            }
            i = j; continue;
        }
        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') {
            depth--;
            if (depth === 0) { push(start, i); return { items, offsets, end: i + 1 }; }
            i++; continue;
        }
        if (ch === ',' && depth === 1) { push(start, i); start = i + 1; i++; continue; }
        i++;
    }
    return null;
}

/** Strip identifier quoting: [Sequence], "Sequence", `Sequence` → sequence. */
function bareIdentifier(s) {
    return s.replace(/^[\[\]"`\s]+|[\[\]"`\s]+$/g, '').toLowerCase();
}

/** Index of the first non-whitespace character at or after `pos` (comments are already masked). */
function skipSpace(text, pos) {
    const m = /\S/g;
    m.lastIndex = pos;
    const r = m.exec(text);
    return r ? r.index : text.length;
}

/** Offsets of every newline, so line lookup is a binary search rather than a rescan per hit. */
function newlineIndex(text) {
    const offsets = [];
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) offsets.push(i);
    return offsets;
}

/** 1-based line number of `offset`, given the newline index. */
function lineAt(newlines, offset) {
    let lo = 0, hi = newlines.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (newlines[mid] < offset) lo = mid + 1; else hi = mid;
    }
    return lo + 1;
}

/**
 * Scan SQL for EntityField INSERTs whose Sequence position holds a bare integer.
 * @returns {{ line: number, value: string, columnIndex: number }[]}
 */
export function scanContent(source) {
    const text = stripSqlComments(source);
    const hits = [];
    const newlines = newlineIndex(text);
    EF_INSERT_RE.lastIndex = 0;
    let m;
    while ((m = EF_INSERT_RE.exec(text)) !== null) {
        const cols = parseParenList(text, m.index + m[0].length - 1);
        if (!cols) continue;
        let cursor = cols.end;
        const seqIdx = cols.items.findIndex((c) => bareIdentifier(c) === 'sequence');
        // Only a VALUES right after the column list carries tuples to inspect. INSERT ... SELECT
        // (or anything else) is skipped whole, so a later unrelated VALUES is never read with
        // this INSERT's column positions.
        const afterCols = skipSpace(text, cols.end);
        if (seqIdx !== -1 && /^VALUES\b/i.test(text.slice(afterCols, afterCols + 6))) {
            cursor = afterCols + 'VALUES'.length;
            for (;;) {
                const openAt = skipSpace(text, cursor);
                if (text[openAt] !== '(') break;
                const tuple = parseParenList(text, openAt);
                if (!tuple) break;
                const value = tuple.items[seqIdx];
                if (value !== undefined && /^\(?\s*[+-]?\d+\s*\)?$/.test(value)) {
                    hits.push({ line: lineAt(newlines, tuple.offsets[seqIdx]), value, columnIndex: seqIdx });
                }
                cursor = tuple.end;
                const sep = skipSpace(text, cursor);
                if (text[sep] !== ',') break;
                cursor = sep + 1;
            }
        }
        EF_INSERT_RE.lastIndex = cursor;
    }
    return hits;
}

// ─── Git ───────────────────────────────────────────────────────────────────────────────────────

/** git anchored at the repository root, with the hardenings the sibling guards carry. */
function makeGit(root) {
    return (args) => execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], {
        encoding: 'utf8',
        maxBuffer: GIT_MAX_BUFFER,
    }).trim();
}

/**
 * Migration files to scan. CI form: added/copied/modified/renamed between base and head. Local
 * form (no head): the same against the working tree, plus untracked files.
 * @returns {{ file: string, allLinesNew: boolean }[]}
 */
export function changedMigrations(git, base, head) {
    const out = git(['diff', '--name-status', '-M', '--diff-filter=ACMR', base, ...(head ? [head] : []), '--', 'migrations']);
    const entries = out.split('\n').filter(Boolean).map((line) => {
        const parts = line.split('\t');
        return { file: parts[parts.length - 1], allLinesNew: parts[0].startsWith('A') };
    });
    if (!head) {
        for (const f of git(['ls-files', '--others', '--exclude-standard', '--', 'migrations']).split('\n')) {
            if (f) entries.push({ file: f, allLinesNew: true });
        }
    }
    return entries.filter((e) => inScope(e.file));
}

/** 1-based line numbers added by a unified diff, read off its `@@ -a,b +c,d @@` hunk headers. */
export function addedLinesFromDiff(diffText) {
    const added = new Set();
    for (const m of diffText.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        for (let l = start; l < start + count; l++) added.add(l);
    }
    return added;
}

// ─── Self-test fixtures (also driven by the vitest suite) ──────────────────────────────────────

export const SELF_TEST_FIXTURES = [
    ['multi-line CodeGen block with the 100000-band placeholder', true, `
      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'abc') BEGIN
         INSERT INTO [\${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name]
         )
         VALUES
         (
            'da98df59-65aa-469a-b44a-8059aa839366',
            '34248F34-2837-EF11-86D4-6045BDEE16E6',
            100025,
            'RunMode'
         )
      END;`],
    ['multi-line CodeGen block with a LOW literal (the #4048 park-shift form)', true, `
         INSERT INTO [\${flyway:defaultSchema}].[EntityField]
         (
            [ID], [EntityID], [Sequence], [Name], [DisplayName]
         )
         VALUES
         (
            '3c9ea97f-0000-0000-0000-000000000000',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D',
            16,
            'HousingID',
            'Housing ID'
         )`],
    ['the real emitter shape: a trailing -- comment after the EntityID value', true, `
         INSERT INTO [\${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name]
         )
         VALUES
         (
            '3c9ea97f-0000-0000-0000-000000000000',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: Animals
            16,
            'HousingID'
         )`],
    ['a literal whose digits also appear in an earlier UUID value, on a later line', true, `
         INSERT INTO [__mj].[EntityField]
         (
            [ID], [EntityID], [Sequence], [Name]
         )
         VALUES
         (
            '3c9ea97f-1616-4e4c-b121-3867182ae9ca',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D',
            16,
            'HousingID'
         )`],
    ['single-line hand-authored INSERT with a literal', true,
        `INSERT INTO [\${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [Description]) VALUES ('30BBD5D1-7CB6-497F-AEF0-D09D877A77BE', '58C8C895-E3AA-48C2-BA68-808337235873', 1, 'ID', N'Primary key, (a) with commas, and parens');`],
    ['quoted value containing commas and parentheses BEFORE the Sequence column', true,
        `INSERT INTO [__mj].[EntityField] ([Description], [ID], [EntityID], [Sequence], [Name]) VALUES (N'x, (y), ''z''', 'id', 'eid', 7, 'Name');`],
    ['a comment between VALUES and the tuple, and between tuples', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES -- rows\n('a', 'e', (SELECT 1)), -- next\n('b', 'e', 16);`],
    ['a literal behind a comment on the previous line', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', -- ordinal\n 16);`],
    ['a literal inside a nested block comment does not hide the real one', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', /* outer /* 99 */ still comment */ 16);`],
    ['a bracketed column name containing -- is still an identifier', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [Seq--uence], [Sequence]) VALUES ('a', 5, 16);`],
    ['a parenthesised integer is still a literal', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('id', 'eid', (16), 'Name');`],
    ['PostgreSQL quoting', true,
        `INSERT INTO "__mj"."EntityField" ("ID", "EntityID", "Sequence", "Name") VALUES ('id', 'eid', 12, 'Name');`],
    ['multi-tuple VALUES with a literal in the second tuple', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('a', 'e', (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = 'e'), 'A'), ('b', 'e', 5, 'B');`],
    ['INSERT ... SELECT does not hide the real INSERT that follows it', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Name], [Sequence]) SELECT 'a', 'e', 'A', 1;\nINSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('b', 'e', 16, 'B');`],
    ['the computed form CodeGen emits', false, `
         INSERT INTO [\${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name]
         )
         VALUES
         (
            'da98df59-65aa-469a-b44a-8059aa839366',
            '34248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Actions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = '34248F34-2837-EF11-86D4-6045BDEE16E6'),
            'RunMode'
         )`],
    ['the older + <ordinal> form is also an expression', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('a', 'e', (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = 'e') + 20, 'A');`],
    ['INSERT ... SELECT followed by an unrelated VALUES is not misread', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) SELECT 'a', 'e', 1, 'A';\nINSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value]) VALUES ('a', 'f', 3, 'Active');`],
    ['a literal in an unrelated table', false,
        `INSERT INTO [\${flyway:defaultSchema}].[SomeOtherTable] ([ID], [Sequence]) VALUES ('abc', 100025);`],
    ['EntityFieldValue is not EntityField', false,
        `INSERT INTO [\${flyway:defaultSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value]) VALUES ('a', 'f', 3, 'Active');`],
    ['an EntityField INSERT with no Sequence column', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Name]) VALUES ('a', 'e', 'A');`],
    ['a literal in a different position than Sequence', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Length], [Sequence], [Name]) VALUES ('a', 'e', 255, (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = 'e'), 'A');`],
    ['a digit string inside a string literal in the Sequence position is not an integer', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES ('a', 'e', '16');`],
];

function selfTest() {
    let fails = 0;
    for (const [name, shouldFlag, sql] of SELF_TEST_FIXTURES) {
        const flagged = scanContent(sql).length > 0;
        if (flagged === shouldFlag) {
            console.log(`${GREEN}self-test ok${NC}: ${name} ${shouldFlag ? 'flagged' : 'accepted'}`);
        } else {
            console.log(`${RED}self-test FAIL${NC}: ${name} was ${flagged ? 'flagged' : 'NOT flagged'}`);
            fails++;
        }
    }
    if (fails > 0) { console.log(`\n${RED}${fails} self-test failure(s)${NC}`); return 1; }
    console.log(`\n${GREEN}all self-tests passed${NC}`);
    return 0;
}

// ─── CLI ───────────────────────────────────────────────────────────────────────────────────────

const REMEDIATION = `
${RED}EntityField INSERT with a literal Sequence${NC}

That number was only ever free on the database CodeGen ran against. Flyway runs every
versioned migration BEFORE any repeatable script, so on a database built only from
migrations the renumber never happens in between — and a second migration touching the
same entity collides on UQ_EntityField_EntityID_Sequence. Without SET XACT_ABORT ON the
unique violation aborts one statement, execution continues, and the run dies later on an
unrelated-looking FK error against EntityFieldValue.

Replace the literal with the apply-time expression CodeGen emits, one INSERT statement
per row (a multi-row VALUES evaluates every subquery against the same snapshot):

    (SELECT COALESCE(MAX([Sequence]), 0) + 1
       FROM [\${flyway:defaultSchema}].[EntityField]
      WHERE [EntityID] = '<entity-id>')

Background: migrations/CLAUDE.md, MJ#3670, MJ#4202.`;

function main(argv) {
    if (argv[0] === '--self-test') return selfTest();

    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const git = makeGit(root);
    let entries, base, head;
    if (argv[0] === '--all') {
        entries = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'migrations'])
            .split('\n').filter(inScope).map((file) => ({ file, allLinesNew: true }));
    } else {
        if (argv.length >= 2) {
            [base, head] = argv;
        } else {
            base = git(['merge-base', process.env.BASE_REF || 'origin/next', 'HEAD']);
        }
        entries = changedMigrations(git, base, head);
    }
    if (entries.length === 0) { console.log(`${DIM}no changed migrations to check${NC}`); return 0; }

    let violations = 0;
    for (const { file, allLinesNew } of entries) {
        const full = join(root, file);
        if (!existsSync(full)) continue;
        let hits = scanContent(readFileSync(full, 'utf8'));
        if (hits.length === 0) continue;
        // Only now pay for a diff, and only for this file: legacy literals in untouched lines of an
        // edited migration are not this PR's to fix (and rewriting them would change checksums).
        if (base !== undefined && !allLinesNew) {
            const added = addedLinesFromDiff(git(['diff', '-U0', base, ...(head ? [head] : []), '--', file]));
            hits = hits.filter((h) => added.has(h.line));
            if (hits.length === 0) continue;
        }
        violations++;
        console.log(`${RED}✗ ${file}${NC}`);
        for (const h of hits) console.log(`    ${YELLOW}line ${h.line}${NC}: Sequence = ${h.value}`);
    }
    if (violations > 0 && argv[0] === '--all') {
        console.log(`\n${YELLOW}${violations} committed migration(s) carry a literal Sequence — left alone by policy; see migrations/CLAUDE.md${NC}`);
        return 0;
    }
    if (violations > 0) { console.log(REMEDIATION); return 1; }
    console.log(`${GREEN}✓ no literal EntityField sequences in ${argv[0] === '--all' ? 'any' : 'changed'} migrations${NC}`);
    return 0;
}

/** True when this module is the process entry point, comparing real paths so a symlinked checkout still runs. */
function isEntryPoint() {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    process.exit(main(process.argv.slice(2)));
}
