#!/usr/bin/env node
/**
 * check-migration-entityfield-sequence.mjs
 *
 * A migration must not INSERT an EntityField row with a LITERAL Sequence value.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * CodeGen's EntityField INSERT is appended VERBATIM to a migration. Whatever number the
 * generating database had free — the catalog ordinal, or the MAX+100000+ordinal placeholder —
 * is only valid there. Flyway runs ALL versioned migrations before ANY repeatable script, so on
 * a database built only from migrations the renumber (spUpdateExistingEntityFieldsFromSchema,
 * via R__RefreshMetadata) never runs in between, and a later migration touching the same
 * entity collides on UQ_EntityField_EntityID_Sequence. Without SET XACT_ABORT ON the unique
 * violation aborts one statement, execution continues, and the run dies later on an
 * unrelated-looking FK error against EntityFieldValue. It cannot fail on a working dev
 * database; it fails only on fresh installs. See MJ#3670 and MJ#4202.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * The Sequence must be an expression evaluated at APPLY time:
 *
 *     (SELECT COALESCE(MAX([Sequence]), 0)
 *        FROM [${flyway:defaultSchema}].[EntityField]
 *       WHERE [EntityID] = '<entity-id>') + <schema-ordinal>
 *
 * CodeGen emits exactly this (manage-metadata.ts, getPendingEntityFieldINSERTSQL). This gate
 * exists for hand-authored SQL and for a regression in the emitter — #4048 shipped one that
 * wrote the low catalog ordinal, which the previous band-only detector (`1[0-9]{5},`) did not
 * see. The detector is therefore POSITIONAL: it parses the INSERT's column list, finds the
 * Sequence column, and flags any bare integer in that position of every VALUES tuple.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────────
 * Default: only the LINES a PR adds to migration files it adds or modifies. Committed migrations
 * carrying the literal form (hundreds of them, including the baselines) are left alone
 * deliberately: they apply today, and rewriting them would change Flyway checksums on every
 * existing database. `--all` scans every committed migration and is informational.
 *
 * Usage (from any directory inside the repository):
 *   node check-migration-entityfield-sequence.mjs                 # working tree + untracked vs merge-base(BASE_REF, HEAD)
 *   node check-migration-entityfield-sequence.mjs <base> <head>   # explicit tree-ish pair (CI)
 *   node check-migration-entityfield-sequence.mjs --all           # every committed migration
 *   node check-migration-entityfield-sequence.mjs --self-test     # the detector's own fixtures
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', DIM = '\x1b[2m', NC = '\x1b[0m';

/** Opening of an EntityField INSERT in either quoting dialect; `EntityFieldValue` etc. do not match. */
const EF_INSERT_RE = /INSERT\s+INTO\s+(?:[^\s(]*?[.\]"`])?(?:\[EntityField\]|"EntityField"|`EntityField`|EntityField)\s*\(/gi;

/** Index of the first character at or after `pos` that is not whitespace or inside a -- / block comment. */
export function skipInsignificant(text, pos) {
    let i = pos;
    while (i < text.length) {
        const ch = text[i];
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { i++; continue; }
        if (ch === '-' && text[i + 1] === '-') { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl + 1; continue; }
        if (ch === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end === -1 ? text.length : end + 2; continue; }
        break;
    }
    return i;
}

/**
 * Parse a parenthesised, comma-separated list starting at `text[open]` (which must be `(`).
 * Respects '...' and "..." literals (with doubled-quote escapes), [...] identifiers, nested
 * parentheses, and -- / block comments. Returns the items (comment-stripped, trimmed), the
 * offset in `text` where each item's first significant character sits (so a hit can be
 * attributed to the right line), and the index just past the closing parenthesis; null if
 * unbalanced.
 */
export function parseParenList(text, open) {
    if (text[open] !== '(') return null;
    const items = [];
    const offsets = [];
    const pushItem = (from, to) => {
        items.push(stripComments(text.slice(from, to)).trim());
        offsets.push(Math.min(skipInsignificant(text, from), to));
    };
    let depth = 0, i = open, start = open + 1;
    while (i < text.length) {
        const ch = text[i];
        if (ch === "'" || ch === '"') {
            const q = ch; i++;
            while (i < text.length) {
                if (text[i] === q) { if (text[i + 1] === q) { i += 2; continue; } break; }
                i++;
            }
            i++; continue;
        }
        if (ch === '[') { const close = text.indexOf(']', i + 1); i = close === -1 ? text.length : close + 1; continue; }
        if (ch === '-' && text[i + 1] === '-') { const nl = text.indexOf('\n', i); i = nl === -1 ? text.length : nl + 1; continue; }
        if (ch === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end === -1 ? text.length : end + 2; continue; }
        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') {
            depth--;
            if (depth === 0) { pushItem(start, i); return { items, offsets, end: i + 1 }; }
            i++; continue;
        }
        if (ch === ',' && depth === 1) { pushItem(start, i); start = i + 1; i++; continue; }
        i++;
    }
    return null;
}

/** Remove -- and block comments outside string literals, so a commented value cannot hide a literal. */
export function stripComments(s) {
    let out = '', i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (ch === "'" || ch === '"') {
            const q = ch; let j = i + 1;
            while (j < s.length) {
                if (s[j] === q) { if (s[j + 1] === q) { j += 2; continue; } break; }
                j++;
            }
            out += s.slice(i, j + 1); i = j + 1; continue;
        }
        if (ch === '-' && s[i + 1] === '-') { const nl = s.indexOf('\n', i); i = nl === -1 ? s.length : nl; continue; }
        if (ch === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); i = end === -1 ? s.length : end + 2; continue; }
        out += ch; i++;
    }
    return out;
}

/** Strip identifier quoting: [Sequence], "Sequence", `Sequence`, Sequence → sequence. */
function bareIdentifier(s) {
    return s.replace(/^[\[\]"`\s]+|[\[\]"`\s]+$/g, '').toLowerCase();
}

/** Offsets of every newline in `text`, so line lookup is a binary search rather than a rescan per hit. */
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
 * Scan SQL text for EntityField INSERTs whose Sequence position holds a bare integer.
 * @returns {{ line: number, value: string, columnIndex: number }[]}
 */
export function scanContent(text) {
    const hits = [];
    const newlines = newlineIndex(text);
    EF_INSERT_RE.lastIndex = 0;
    let m;
    while ((m = EF_INSERT_RE.exec(text)) !== null) {
        const open = m.index + m[0].length - 1;
        const cols = parseParenList(text, open);
        if (!cols) continue;
        let cursor = cols.end;
        const seqIdx = cols.items.findIndex((c) => bareIdentifier(c) === 'sequence');
        // The token right after the column list decides the shape. Only `VALUES` carries
        // tuples to inspect; `INSERT ... SELECT` and anything else is skipped as a whole so a
        // later, unrelated VALUES can never be read with this INSERT's column positions.
        const afterCols = skipInsignificant(text, cols.end);
        if (seqIdx !== -1 && /^VALUES\b/i.test(text.slice(afterCols, afterCols + 6))) {
            cursor = afterCols + 'VALUES'.length;
            // One or more tuples: VALUES (...), (...) — comments allowed anywhere between.
            for (;;) {
                const openAt = skipInsignificant(text, cursor);
                if (text[openAt] !== '(') break;
                const tuple = parseParenList(text, openAt);
                if (!tuple) break;
                const value = tuple.items[seqIdx];
                if (value !== undefined && /^\(?\s*[+-]?\d+\s*\)?$/.test(value)) {
                    hits.push({ line: lineAt(newlines, tuple.offsets[seqIdx]), value, columnIndex: seqIdx });
                }
                cursor = tuple.end;
                const sep = skipInsignificant(text, cursor);
                if (text[sep] !== ',') break;
                cursor = sep + 1;
            }
        }
        EF_INSERT_RE.lastIndex = cursor;
    }
    return hits;
}

function git(args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** The repository root; every pathspec and file read is anchored here so the gate works from any cwd. */
function repoRoot() {
    return git(['rev-parse', '--show-toplevel']);
}

function gitAt(root, args) {
    return git(['-C', root, ...args]);
}

/**
 * Migration files changed between `base` and `head`, or — when `head` is undefined — between
 * `base` and the working tree, plus untracked migration files. The working-tree form is what a
 * developer runs before committing; a freshly generated, not-yet-added capture must be visible.
 */
function changedMigrations(root, base, head) {
    const diffArgs = ['diff', '--name-only', '--diff-filter=ACM', base, ...(head ? [head] : []), '--', 'migrations'];
    const changed = gitAt(root, diffArgs).split('\n');
    const untracked = head ? [] : gitAt(root, ['ls-files', '--others', '--exclude-standard', '--', 'migrations']).split('\n');
    return [...changed, ...untracked].filter((f) => f.endsWith('.sql'));
}

/**
 * 1-based line numbers `file` gains between `base` and `head`, read off the `@@ -a,b +c,d @@` hunk
 * headers of a zero-context diff. Only these lines are reported: a legacy literal in an old
 * migration someone touched for another reason is not this PR's to fix (and rewriting it would
 * change the Flyway checksum on every existing database).
 */
export function addedLines(root, base, head, file) {
    // An untracked file has no diff: every line is new.
    if (!head && gitAt(root, ['ls-files', '--', file]) === '') return null;
    const diff = gitAt(root, ['diff', '-U0', base, ...(head ? [head] : []), '--', file]);
    const added = new Set();
    for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        for (let l = start; l < start + count; l++) added.add(l);
    }
    return added;
}

function allMigrations(root) {
    return gitAt(root, ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'migrations'])
        .split('\n').filter((f) => f.endsWith('.sql'));
}

const SELF_TEST_FIXTURES = [
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
    ['single-line hand-authored INSERT with a literal', true,
        `INSERT INTO [\${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [Description]) VALUES ('30BBD5D1-7CB6-497F-AEF0-D09D877A77BE', '58C8C895-E3AA-48C2-BA68-808337235873', 1, 'ID', N'Primary key, (a) with commas, and parens');`],
    ['quoted value containing commas and parentheses BEFORE the Sequence column', true,
        `INSERT INTO [__mj].[EntityField] ([Description], [ID], [EntityID], [Sequence], [Name]) VALUES (N'x, (y), ''z''', 'id', 'eid', 7, 'Name');`],
    ['a parenthesised integer is still a literal', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('id', 'eid', (16), 'Name');`],
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
    ['a comment between VALUES and the tuple, and between tuples', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence]) VALUES -- rows\n('a', 'e', (SELECT 1)), -- next\n('b', 'e', 16);`],
    ['INSERT ... SELECT followed by an unrelated VALUES is not misread', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) SELECT 'a', 'e', 1, 'A';\nINSERT INTO [__mj].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value]) VALUES ('a', 'f', 3, 'Active');`],
    ['INSERT ... SELECT does not hide the real INSERT that follows it', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Name], [Sequence]) SELECT 'a', 'e', 'A', 1;\nINSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('b', 'e', 16, 'B');`],
    ['PostgreSQL quoting', true,
        `INSERT INTO "__mj"."EntityField" ("ID", "EntityID", "Sequence", "Name") VALUES ('id', 'eid', 12, 'Name');`],
    ['multi-tuple VALUES with a literal in the second tuple', true,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('a', 'e', (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = 'e'), 'A'), ('b', 'e', 5, 'B');`],
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
            '34248F34-2837-EF11-86D4-6045BDEE16E6',
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '34248F34-2837-EF11-86D4-6045BDEE16E6') + 20,
            'RunMode'
         )`],
    ['the hand-written +1 form', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Sequence], [Name]) VALUES ('a', 'e', (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = 'e'), 'A');`],
    ['a literal in an unrelated table', false,
        `INSERT INTO [\${flyway:defaultSchema}].[SomeOtherTable] ([ID], [Sequence]) VALUES ('abc', 100025);`],
    ['EntityFieldValue is not EntityField', false,
        `INSERT INTO [\${flyway:defaultSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value]) VALUES ('a', 'f', 3, 'Active');`],
    ['an EntityField INSERT with no Sequence column', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Name]) VALUES ('a', 'e', 'A');`],
    ['a literal in a different position than Sequence', false,
        `INSERT INTO [__mj].[EntityField] ([ID], [EntityID], [Length], [Sequence], [Name]) VALUES ('a', 'e', 255, (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = 'e'), 'A');`],
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

function main(argv) {
    if (argv[0] === '--self-test') return selfTest();

    const root = repoRoot();
    let files, base, head;
    if (argv[0] === '--all') {
        files = allMigrations(root);
    } else {
        if (argv.length >= 2) {
            [base, head] = argv;
        } else {
            // Local form: the working tree (including untracked files) against the merge base.
            base = gitAt(root, ['merge-base', process.env.BASE_REF || 'origin/next', 'HEAD']);
        }
        files = changedMigrations(root, base, head);
    }
    if (files.length === 0) { console.log(`${DIM}no changed migrations to check${NC}`); return 0; }

    let violations = 0;
    for (const f of files) {
        const full = join(root, f);
        if (!existsSync(full)) continue;
        let hits = scanContent(readFileSync(full, 'utf8'));
        if (base !== undefined) {
            const added = addedLines(root, base, head, f);
            if (added) hits = hits.filter((h) => added.has(h.line));
        }
        if (hits.length === 0) continue;
        violations++;
        console.log(`${RED}✗ ${f}${NC}`);
        for (const h of hits) console.log(`    ${YELLOW}line ${h.line}${NC}: Sequence = ${h.value}`);
    }
    if (violations > 0 && argv[0] === '--all') {
        // Informational: committed migrations are left alone by policy (Flyway checksums).
        console.log(`\n${YELLOW}${violations} committed migration(s) carry a literal Sequence — left alone by policy; see migrations/CLAUDE.md${NC}`);
        return 0;
    }
    if (violations > 0) {
        console.log(`
${RED}EntityField INSERT with a literal Sequence${NC}

That number was only ever free on the database CodeGen ran against. Flyway runs every
versioned migration BEFORE any repeatable script, so on a database built only from
migrations the renumber never happens in between — and a second migration touching the
same entity collides on UQ_EntityField_EntityID_Sequence. Without SET XACT_ABORT ON the
unique violation aborts one statement, execution continues, and the run dies later on an
unrelated-looking FK error against EntityFieldValue.

Replace the literal with an apply-time expression. CodeGen emits the first form (a batch
executes in emission order, so the values rise in that order; the schema-ordinal offset
only widens the gaps); the second is fine for a hand-written correction of a single field:

    (SELECT COALESCE(MAX([Sequence]), 0)
       FROM [\${flyway:defaultSchema}].[EntityField]
      WHERE [EntityID] = '<entity-id>') + <schema-ordinal>

    (SELECT COALESCE(MAX([Sequence]), 0) + 1
       FROM [\${flyway:defaultSchema}].[EntityField]
      WHERE [EntityID] = '<entity-id>')

Background: migrations/CLAUDE.md, MJ#3670, MJ#4202.`);
        return 1;
    }
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
