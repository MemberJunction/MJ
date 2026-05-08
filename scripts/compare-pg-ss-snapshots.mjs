#!/usr/bin/env node
/**
 * MJ-aware schema-equivalence diff for SS and PG snapshots.
 *
 * Compares the per-category text dumps produced by `scripts/snapshot-ss.sh`
 * and `scripts/snapshot-pg.sh` (tables, cols, cons, routines, views, idx) and
 * reports drift WITH context — distinguishing:
 *
 *   - REAL DRIFT      → genuinely divergent state requiring action
 *   - KNOWN OVERRIDE  → divergence explained by MJ_OVERRIDES (e.g. SS [datetime]
 *                       intentionally maps to PG TIMESTAMPTZ per MJ convention)
 *   - DIALECT ALIAS   → divergence explained by trivial type-name aliases
 *                       (e.g. SS nvarchar ↔ PG character varying)
 *
 * The MJ_OVERRIDES table is imported from the SQLConverter package's canonical
 * source (TypeResolver.ts), NOT duplicated. If the converter team changes the
 * override list, this script picks it up automatically and stays in sync.
 *
 * Why this script exists (Bug #15 retrospective):
 *
 *   The earlier ad-hoc snapshot diff (sed-based normalization) didn't know
 *   about MJ_OVERRIDES, so it flagged ListInvitation.ExpiresAt's PG TIMESTAMPTZ
 *   vs SS [datetime] as drift — when in fact the converter intentionally
 *   produces TIMESTAMPTZ per MJ design ("MJ stores everything with timezone
 *   info"). We wrote a `.pg-only.sql` migration to "fix" it, which was the
 *   wrong response. This script's MJ_OVERRIDES-awareness ensures that exact
 *   class of false positive can't recur.
 *
 * Usage:
 *
 *   node scripts/compare-pg-ss-snapshots.mjs <ss-prefix> <pg-prefix>
 *
 *   Where <ss-prefix> and <pg-prefix> are the path prefixes you passed to the
 *   snapshot scripts. The script reads <prefix>.cols.txt, <prefix>.tables.txt,
 *   etc. for each.
 *
 * Exit codes:
 *   0 → no real drift (only known overrides / dialect aliases)
 *   1 → real drift detected
 *   2 → script error (file not found, parse failure, etc.)
 */

import { readFileSync, existsSync } from 'fs';

// Import canonical override list from SQLConverter (single source of truth).
// MUST match the converter's actual behavior — re-export wired up specifically
// for this script in packages/SQLConverter/src/index.ts.
import { MJ_OVERRIDES, resolveType } from '@memberjunction/sql-converter';

// ─── Static dialect-alias tables ─────────────────────────────────────────────
// These are PG↔SS pairs that mean the same logical type but differ in spelling.
// Documented in V5_30_NOTES.md and migrations-pg/scripts/README-migration-equivalence.md.
// Used as a fallback when MJ_OVERRIDES doesn't provide a mapping but the types
// are dialect aliases.

const DIALECT_ALIASES = new Map([
    // SS → PG canonical PG type after dialect mapping (no MJ override needed)
    ['NVARCHAR', 'CHARACTER VARYING'],
    ['VARCHAR', 'CHARACTER VARYING'],
    ['NCHAR', 'CHARACTER'],
    ['CHAR', 'CHARACTER'],
    ['UNIQUEIDENTIFIER', 'UUID'],
    ['BIT', 'BOOLEAN'],
    ['DATETIMEOFFSET', 'TIMESTAMP WITH TIME ZONE'],
    ['INT', 'INTEGER'],
    ['TINYINT', 'SMALLINT'],
    ['DECIMAL', 'NUMERIC'],
    ['MONEY', 'NUMERIC'],
    ['FLOAT', 'DOUBLE PRECISION'],
    ['VARBINARY', 'BYTEA'],
    ['BINARY', 'BYTEA'],
    ['IMAGE', 'BYTEA'],
    ['TEXT', 'TEXT'],
    ['NTEXT', 'TEXT'],
]);

// PG-side aliases — NVARCHAR/VARCHAR(MAX) gets compressed to TEXT by the
// converter. Both sides should match after this normalization.
const PG_TEXT_FAMILY = new Set(['CHARACTER VARYING', 'TEXT']);

/**
 * Tables that Flyway/Skyway owns (not MJ schema). MJ_OVERRIDES doesn't
 * apply to these — they have their own dialect-specific shape. Excluded
 * from drift reporting because the divergence is a Flyway design choice,
 * not MJ design.
 */
const FLYWAY_OWNED_TABLES = new Set([
    'flyway_schema_history',
    'skyway_schema_history',
]);

/**
 * Normalize a SS-side raw type string to its expected PG-side form, applying
 * MJ overrides first, then dialect aliases.
 *
 * @param {string} ssType raw type from sys.types (e.g. "datetime", "nvarchar")
 * @returns {{ resolved: string, reason: string }}
 *          resolved: the PG type the converter would produce, in canonical
 *                    PG spelling (e.g. TIMESTAMPTZ → "TIMESTAMP WITH TIME ZONE")
 *          reason:   "mj-override" | "dialect-alias" | "as-is"
 */
function normalizeSSType(ssType) {
    const upper = ssType.trim().toUpperCase();
    if (MJ_OVERRIDES.has(upper)) {
        // MJ override returns short form (e.g. TIMESTAMPTZ); pass through PG
        // normalizer so it matches what `information_schema.columns` reports
        // ("timestamp with time zone").
        return { resolved: normalizePGType(MJ_OVERRIDES.get(upper)), reason: 'mj-override' };
    }
    if (DIALECT_ALIASES.has(upper)) {
        return { resolved: normalizePGType(DIALECT_ALIASES.get(upper)), reason: 'dialect-alias' };
    }
    return { resolved: upper, reason: 'as-is' };
}

/**
 * Normalize a PG-side raw type for comparison. PG returns names like
 * "character varying", "timestamp with time zone" verbatim from
 * information_schema. Map common abbreviations to canonical PG spelling.
 */
function normalizePGType(pgType) {
    const upper = pgType.trim().toUpperCase();
    if (upper === 'TIMESTAMPTZ') return 'TIMESTAMP WITH TIME ZONE';
    if (upper === 'TIMESTAMP') return 'TIMESTAMP WITHOUT TIME ZONE';
    return upper;
}

/**
 * Compare two normalized types as equivalent.
 * Both sides may be in the PG_TEXT_FAMILY (interchangeable on PG).
 */
function typesEquivalent(ssNormalized, pgNormalized) {
    if (ssNormalized === pgNormalized) return true;
    if (PG_TEXT_FAMILY.has(ssNormalized) && PG_TEXT_FAMILY.has(pgNormalized)) return true;
    return false;
}

/** Read a snapshot file and return its lines (trimmed, non-empty). */
function readSnapshot(prefix, category) {
    const path = `${prefix}.${category}.txt`;
    if (!existsSync(path)) {
        console.error(`ERROR: Snapshot file not found: ${path}`);
        process.exit(2);
    }
    return readFileSync(path, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

/**
 * Diff cols.txt files. Each line is `TableName|ColumnName|Type|Nullable`.
 * Pairs columns by (table, column) and reports type-level differences,
 * categorizing each as REAL DRIFT, KNOWN OVERRIDE, or DIALECT ALIAS.
 */
function diffColumns(ssLines, pgLines) {
    const ssMap = new Map();
    for (const line of ssLines) {
        const [table, col, type, nullable] = line.split('|');
        if (FLYWAY_OWNED_TABLES.has(table)) continue; // Skip Flyway-managed tables
        ssMap.set(`${table}|${col}`, { type, nullable });
    }
    const pgMap = new Map();
    for (const line of pgLines) {
        const [table, col, type, nullable] = line.split('|');
        if (FLYWAY_OWNED_TABLES.has(table)) continue;
        pgMap.set(`${table}|${col}`, { type, nullable });
    }

    const realDrift = [];
    const knownOverride = [];
    const dialectAlias = [];
    const pgOnly = [];
    const ssOnly = [];

    for (const [key, ssEntry] of ssMap) {
        const pgEntry = pgMap.get(key);
        if (!pgEntry) {
            ssOnly.push({ key, ss: ssEntry });
            continue;
        }
        const ssNorm = normalizeSSType(ssEntry.type);
        const pgNorm = normalizePGType(pgEntry.type);
        const equivalent = typesEquivalent(ssNorm.resolved, pgNorm);

        if (equivalent && ssEntry.nullable === pgEntry.nullable) {
            // Match — categorize by why
            if (ssNorm.reason === 'mj-override') {
                knownOverride.push({ key, ssRaw: ssEntry.type, pgRaw: pgEntry.type, override: ssNorm.resolved });
            } else if (ssNorm.reason === 'dialect-alias') {
                dialectAlias.push({ key, ssRaw: ssEntry.type, pgRaw: pgEntry.type });
            }
            // ssNorm.reason === 'as-is' with equivalent types means literal match — no entry
        } else {
            realDrift.push({
                key,
                ssRaw: ssEntry.type, ssNullable: ssEntry.nullable,
                pgRaw: pgEntry.type, pgNullable: pgEntry.nullable,
                ssNormalized: ssNorm.resolved,
                pgNormalized: pgNorm,
                ssReason: ssNorm.reason,
            });
        }
    }
    for (const [key, pgEntry] of pgMap) {
        if (!ssMap.has(key)) pgOnly.push({ key, pg: pgEntry });
    }
    return { realDrift, knownOverride, dialectAlias, pgOnly, ssOnly };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const [, , ssPrefix, pgPrefix] = process.argv;
if (!ssPrefix || !pgPrefix) {
    console.error('Usage: node scripts/compare-pg-ss-snapshots.mjs <ss-prefix> <pg-prefix>');
    console.error('Example: node scripts/compare-pg-ss-snapshots.mjs /tmp/eq/ss /tmp/eq/pg');
    process.exit(2);
}

console.log(`SS prefix: ${ssPrefix}`);
console.log(`PG prefix: ${pgPrefix}`);
console.log(`Imported MJ_OVERRIDES (${MJ_OVERRIDES.size} entries):`);
for (const [k, v] of MJ_OVERRIDES) console.log(`  ${k} → ${v}`);
console.log('');

const ssCols = readSnapshot(ssPrefix, 'cols');
const pgCols = readSnapshot(pgPrefix, 'cols');
const result = diffColumns(ssCols, pgCols);

console.log('=== Column-level diff (after MJ_OVERRIDES + dialect-alias normalization) ===');
console.log(`SS columns:           ${ssCols.length}`);
console.log(`PG columns:           ${pgCols.length}`);
console.log(`SS-only:              ${result.ssOnly.length}`);
console.log(`PG-only:              ${result.pgOnly.length}`);
console.log(`Real drift:           ${result.realDrift.length}`);
console.log(`Known MJ overrides:   ${result.knownOverride.length}`);
console.log(`Dialect aliases:      ${result.dialectAlias.length}`);
console.log('');

if (result.realDrift.length > 0) {
    console.log('=== REAL DRIFT (action required) ===');
    for (const d of result.realDrift.slice(0, 20)) {
        console.log(`  ${d.key}`);
        console.log(`    SS: ${d.ssRaw} (NULL=${d.ssNullable})  →  normalized: ${d.ssNormalized} [${d.ssReason}]`);
        console.log(`    PG: ${d.pgRaw} (NULL=${d.pgNullable})  →  normalized: ${d.pgNormalized}`);
    }
    if (result.realDrift.length > 20) console.log(`  ... and ${result.realDrift.length - 20} more`);
    console.log('');
}

if (result.ssOnly.length > 0) {
    console.log('=== SS-only columns (might be intentional, e.g. SS-specific tables) ===');
    for (const e of result.ssOnly.slice(0, 10)) console.log(`  ${e.key} (${e.ss.type})`);
    if (result.ssOnly.length > 10) console.log(`  ... and ${result.ssOnly.length - 10} more`);
    console.log('');
}

if (result.pgOnly.length > 0) {
    console.log('=== PG-only columns (might be intentional .pg-only.sql additions like PlatformVariants) ===');
    for (const e of result.pgOnly.slice(0, 10)) console.log(`  ${e.key} (${e.pg.type})`);
    if (result.pgOnly.length > 10) console.log(`  ... and ${result.pgOnly.length - 10} more`);
    console.log('');
}

if (result.realDrift.length === 0 && result.ssOnly.length === 0 && result.pgOnly.length === 0) {
    console.log('✓ No real drift detected. SS and PG schemas are equivalent under MJ design.');
} else if (result.realDrift.length === 0) {
    console.log('✓ No real drift in shared columns. Only platform-specific additions/omissions remain (review SS-only and PG-only above).');
}

process.exit(result.realDrift.length > 0 ? 1 : 0);
