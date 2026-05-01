#!/usr/bin/env node
/**
 * Make PG migration files managed-PG safe.
 *
 * The v5.0 baseline + v5.1-v5.11 (and v5.29-30 schema-changing) PG migration
 * files include `UPDATE pg_cast SET castcontext = 'i'` to make the implicit
 * INTEGER → BOOLEAN cast available, so bulk metadata INSERTs can write `0/1`
 * for BOOLEAN columns. Managed PostgreSQL services (RDS, Aurora, Cloud SQL,
 * Azure) don't grant the catalog-modify privilege, so these migrations fail
 * to install on managed PG.
 *
 * This script removes the pg_cast dependency by:
 *   1. Stripping the pg_cast UPDATE block from each affected file
 *   2. Rewriting `0/1` values at BOOLEAN-column positions in INSERT VALUES
 *      to `FALSE/TRUE`
 *
 * Column types are loaded from `pg-boolean-cols.txt` (one `Table|Column`
 * per line, generated from a live PG instance with all migrations applied).
 *
 * Usage:
 *   node scripts/fix-pg-cast-and-booleans.mjs <migrations-dir> [--dry-run]
 *
 * Run from the repo root.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const migrationsDir = args[0];
const dryRun = args.includes('--dry-run');

if (!migrationsDir) {
    console.error('Usage: node fix-pg-cast-and-booleans.mjs <migrations-dir> [--dry-run]');
    process.exit(1);
}

// ─── Load BOOLEAN column dictionary ──────────────────────────────────────
// Map<table-lower, Set<column-lower>>. Lowercased for tolerance against
// PG's case-folding behavior on unquoted identifiers, though we always
// scan the *quoted* identifier in INSERT statements.
const boolCols = new Map();
const boolFile = join(import.meta.dirname ?? new URL('.', import.meta.url).pathname.replace(/^\//, ''), '..', 'tmp', 'pg-boolean-cols.txt');
const boolLines = readFileSync('/tmp/pg-boolean-cols.txt', 'utf-8').split('\n');
for (const line of boolLines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;
    const [t, c] = trimmed.split('|');
    const tk = t.toLowerCase();
    if (!boolCols.has(tk)) boolCols.set(tk, new Set());
    boolCols.get(tk).add(c.toLowerCase());
}
console.log(`Loaded ${boolCols.size} tables, ${[...boolCols.values()].reduce((a, s) => a + s.size, 0)} BOOLEAN columns`);

// ─── pg_cast block stripper ──────────────────────────────────────────────
// Matches the standard converter-emitted block:
//   -- Implicit INTEGER -> BOOLEAN cast (...comment lines...)
//   UPDATE pg_cast SET castcontext = 'i'
//   WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;
// And the surrounding blank lines.
function stripPgCastBlock(sql) {
    // Find the UPDATE pg_cast statement and the comment lines immediately above it.
    // Match: a `-- Implicit INTEGER ...` comment block ending in `UPDATE pg_cast ... ::regtype;`
    const re = /(?:^[ \t]*--[^\n]*\n)*[ \t]*UPDATE pg_cast SET castcontext = 'i'\s*\n[ \t]*WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;\s*\n?/gm;
    return sql.replace(re, '');
}

// ─── INSERT VALUES rewriter ──────────────────────────────────────────────
//
// Strategy: scan for `INSERT INTO __mj."TableName" (col1, col2, ...) VALUES`
// statements. For each, parse the column list, identify BOOLEAN positions,
// then walk the VALUES list and rewrite numeric literals at those positions.
//
// Robustness considerations:
//   * Column lists can span multiple lines.
//   * VALUES clauses can have multiple tuples: VALUES (...), (...), (...);
//   * Tuple values can contain commas inside quoted strings — we tokenize
//     value-by-value with quote-awareness.
//   * Values might already be TRUE/FALSE/NULL — leave those alone.
//   * Values might be expressions — leave anything that isn't a bare 0 or 1.
//   * Stored-procedure bodies contain INSERT INTO too, but their values are
//     parameter references (`p_xxx` or `COALESCE(p_xxx, TRUE)`) — those have
//     no bare 0/1 in BOOLEAN positions, so leave alone.

const INSERT_RE = /INSERT\s+INTO\s+(?:"?__mj"?\.)?"([A-Za-z_][\w]*)"\s*\(([^)]*)\)\s*VALUES\s*/g;

function rewriteInserts(sql, fileName) {
    let result = '';
    let lastIdx = 0;
    let stats = { inserts: 0, rewrites: 0, skipped_no_cols: 0, skipped_no_table: 0 };

    INSERT_RE.lastIndex = 0;
    let match;
    while ((match = INSERT_RE.exec(sql))) {
        const [matched, tableName, colListRaw] = match;
        const insertStart = match.index;
        const valuesStart = match.index + matched.length;

        // Append everything since last INSERT
        result += sql.slice(lastIdx, valuesStart);

        // Identify BOOLEAN positions
        const colNames = colListRaw
            .split(',')
            .map(c => c.trim().replace(/^"(.*)"$/, '$1'));
        const tableLower = tableName.toLowerCase();
        const boolColsForTable = boolCols.get(tableLower) ?? new Set();
        const boolPositions = colNames.map((c, i) => boolColsForTable.has(c.toLowerCase()) ? i : -1)
            .filter(i => i !== -1);

        stats.inserts++;
        if (!boolCols.has(tableLower)) {
            stats.skipped_no_table++;
        } else if (boolPositions.length === 0) {
            stats.skipped_no_cols++;
        }

        // Find the end of the entire INSERT (terminating semicolon outside of quotes/parens)
        const valuesAndRest = sql.slice(valuesStart);
        const valuesEndOffset = findValuesEnd(valuesAndRest);
        if (valuesEndOffset === -1) {
            // Couldn't parse — leave as-is
            result += valuesAndRest.slice(0, 0);
            lastIdx = valuesStart;
            continue;
        }
        const valuesText = valuesAndRest.slice(0, valuesEndOffset);
        const rewritten = rewriteValuesText(valuesText, boolPositions, stats);
        result += rewritten;
        lastIdx = valuesStart + valuesEndOffset;
    }
    result += sql.slice(lastIdx);

    return { sql: result, stats };
}

/**
 * Given a VALUES clause body starting at the opening `(`, returns the offset
 * just past the terminating `;` of the INSERT statement. Walks through
 * parens (counting depth), single-quoted strings (handling `''` escape),
 * and dollar-quoted blocks. -1 if not found.
 */
function findValuesEnd(s) {
    let i = 0;
    const n = s.length;
    let depth = 0;
    let inStr = false;
    let inDollar = null; // tag if inside $tag$...$tag$
    while (i < n) {
        const ch = s[i];
        if (inDollar) {
            if (s.startsWith(inDollar, i)) {
                i += inDollar.length;
                inDollar = null;
                continue;
            }
            i++;
            continue;
        }
        if (inStr) {
            if (ch === "'") {
                if (s[i + 1] === "'") { i += 2; continue; } // escaped quote
                inStr = false;
                i++; continue;
            }
            i++; continue;
        }
        if (ch === "'") { inStr = true; i++; continue; }
        if (ch === '$' && s[i + 1] === '$') { inDollar = '$$'; i += 2; continue; }
        if (ch === '$') {
            // $tag$ — capture tag
            const m = s.slice(i).match(/^\$([A-Za-z_]\w*)\$/);
            if (m) { inDollar = m[0]; i += m[0].length; continue; }
        }
        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') { depth--; i++; continue; }
        if (ch === ';' && depth === 0) {
            return i + 1;
        }
        if (ch === '\n' && depth === 0 && /^\s*(?:$|--|\bINSERT\b|\bDO\b|\bBEGIN\b|\bEND\b|\bCREATE\b|\bALTER\b|\bDROP\b|\bGRANT\b)/i.test(s.slice(i + 1))) {
            // Heuristic: end of values without semicolon (rare but happens in poorly-formatted output)
            return i;
        }
        i++;
    }
    return -1;
}

/**
 * Rewrites a values text body: ` (v1, v2, ...) [, (v1, v2, ...)]* ;`
 * For each tuple, replace numeric literals at boolPositions with FALSE/TRUE.
 */
function rewriteValuesText(text, boolPositions, stats) {
    if (boolPositions.length === 0) return text;
    // Walk through each `(...)` tuple
    let out = '';
    let i = 0;
    const n = text.length;
    while (i < n) {
        // Skip whitespace + commas
        while (i < n && /[\s,]/.test(text[i])) { out += text[i]; i++; }
        if (i >= n) break;
        if (text[i] !== '(') {
            // Not a tuple — append remainder
            out += text.slice(i);
            break;
        }
        // Capture tuple from `(` to matching `)`
        const tupleStart = i;
        let depth = 0;
        let inStr = false;
        let j = i;
        while (j < n) {
            const ch = text[j];
            if (inStr) {
                if (ch === "'") {
                    if (text[j + 1] === "'") { j += 2; continue; }
                    inStr = false; j++; continue;
                }
                j++; continue;
            }
            if (ch === "'") { inStr = true; j++; continue; }
            if (ch === '(') { depth++; j++; continue; }
            if (ch === ')') {
                depth--; j++;
                if (depth === 0) break;
                continue;
            }
            j++;
        }
        const tupleText = text.slice(tupleStart, j); // includes both parens
        const rewritten = rewriteTuple(tupleText, boolPositions, stats);
        out += rewritten;
        i = j;
    }
    return out;
}

/**
 * Splits a tuple `(v1, v2, ...)` into individual values, respecting quote
 * and paren nesting, then rewrites BOOLEAN-position values 0→FALSE, 1→TRUE.
 */
function rewriteTuple(tupleText, boolPositions, stats) {
    // Strip outer parens
    if (!tupleText.startsWith('(') || !tupleText.endsWith(')')) return tupleText;
    const inner = tupleText.slice(1, -1);
    const values = splitTopLevelCommas(inner);
    const boolSet = new Set(boolPositions);
    let didRewrite = false;
    const newValues = values.map((v, idx) => {
        if (!boolSet.has(idx)) return v;
        // Strip leading whitespace AND any leading line-comments that the splitter
        // attached to this value. Trailing comments on the *previous* value bleed
        // into the start of the *next* value — e.g. `FALSE,\n -- "AutoIncrement"\n
        // 1, -- "AllowUpdateAPI"` gives a value of ` -- "AutoIncrement"\n 1` here.
        // We only care whether the *meaningful* content of `v` is `0` or `1`.
        const stripped = v.replace(/^[\s]*(?:--[^\n]*\n[\s]*)*/g, '');
        if (stripped === '0' || stripped === '0\n' || stripped.replace(/\s+$/, '') === '0') {
            didRewrite = true;
            return v.replace(/(^[\s]*(?:--[^\n]*\n[\s]*)*)0\b/, '$1FALSE');
        }
        if (stripped === '1' || stripped === '1\n' || stripped.replace(/\s+$/, '') === '1') {
            didRewrite = true;
            return v.replace(/(^[\s]*(?:--[^\n]*\n[\s]*)*)1\b/, '$1TRUE');
        }
        return v;
    });
    if (didRewrite) stats.rewrites++;
    return '(' + newValues.join(',') + ')';
}

/**
 * Splits a string by top-level commas (ignoring commas inside parens or quotes).
 * Preserves leading/trailing whitespace within each value so formatting is kept.
 *
 * Skips line-comments `-- …\n` and block-comments inline so commas/parens
 * within them don't fool the depth counter — important because the
 * SequenceDeduplicator emits trailing comments like
 * `100020, -- auto-bumped from 100019 (UQ_EntityField_EntityID_Sequence dedup),`
 * which contain parens and commas in the comment body.
 */
function splitTopLevelCommas(s) {
    const parts = [];
    let depth = 0;
    let inStr = false;
    let start = 0;
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (inStr) {
            if (ch === "'") {
                if (s[i + 1] === "'") { i += 2; continue; }
                inStr = false;
            }
            i++; continue;
        }
        if (ch === "'") { inStr = true; i++; continue; }
        // Skip line comment `-- … <newline>` — but DON'T skip past the newline,
        // since the value boundary may be on the same line as the comment.
        if (ch === '-' && s[i + 1] === '-') {
            while (i < s.length && s[i] !== '\n') i++;
            continue;
        }
        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') { depth--; i++; continue; }
        if (ch === ',' && depth === 0) {
            parts.push(s.slice(start, i));
            start = i + 1;
            i++; continue;
        }
        i++;
    }
    parts.push(s.slice(start));
    return parts;
}

// ─── Main ────────────────────────────────────────────────────────────────
const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql') || (f.startsWith('B') && f.endsWith('.sql')));

let totalRewrites = 0;
let totalInserts = 0;
let filesChanged = 0;

for (const file of files) {
    const path = join(migrationsDir, file);
    const original = readFileSync(path, 'utf-8');

    let working = original;
    working = stripPgCastBlock(working);
    const { sql, stats } = rewriteInserts(working, file);
    working = sql;

    const changed = working !== original;
    if (changed) {
        filesChanged++;
        totalInserts += stats.inserts;
        totalRewrites += stats.rewrites;
        console.log(`${file}: ${stats.inserts} INSERTs, ${stats.rewrites} tuples rewritten, pg_cast stripped`);
        if (!dryRun) {
            writeFileSync(path, working, 'utf-8');
        }
    }
}

console.log('');
console.log(`Total: ${filesChanged} files modified, ${totalInserts} INSERTs scanned, ${totalRewrites} tuples rewritten${dryRun ? ' (DRY RUN — no files written)' : ''}`);
