/**
 * @fileoverview The migration-existence-guards standard.
 *
 * A migration runs exactly once, in order, under Skyway's control. Wrapping its DDL in existence
 * guards (`IF OBJECT_ID(...) IS NULL`, `IF COL_LENGTH(...) IS NULL`, `IF NOT EXISTS (SELECT … FROM
 * sys.…)`) tries to make it idempotent, which it never needs to be. The cost is real: a guard turns
 * a schema mismatch into a silent no-op instead of a failure, and the guarded form is harder for
 * the PostgreSQL converter. AI tools write these by habit, so the rule is enforced rather than
 * left to review.
 *
 * Only the hand-written part of each migration is read. CodeGen's appended output guards its own
 * drops, and that is CodeGen's business.
 *
 * @module @memberjunction/standards
 */

import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';
import { HasMarkerNear } from '../lib/markers.js';
import { FindMigrations, StripSqlComments } from '../lib/migrations.js';

/** The reviewed-exception marker, on the guarded line or the line above it. */
export const EXISTENCE_GUARD_MARKER = 'mj-standards-allow: existence-guard';

/**
 * Catalog functions whose only use in an `IF` is asking whether a schema object exists. The optional
 * `(` carries its own whitespace so no two whitespace runs are adjacent (that backtracks badly).
 */
const CATALOG_FUNCTION_GUARD = /\bIF\s+(?:NOT\s+)?(?:\(\s*)?(OBJECT_ID|COL_LENGTH|TYPE_ID|SCHEMA_ID|INDEXPROPERTY|COLUMNPROPERTY|INDEXKEY_PROPERTY)\s*\(/i;

/** `IF [NOT] EXISTS (` — a guard only when its subquery reads the catalog; see {@link CATALOG_SOURCE}. */
const EXISTS_GUARD = /\bIF\s+(?:NOT\s+)?EXISTS\s*\(/i;

/** What an existence subquery reads when it is asking about schema rather than data. */
const CATALOG_SOURCE = /\bsys\s*\.|\bINFORMATION_SCHEMA\s*\.|fn_listextendedproperty/i;

/** `DROP <object> IF EXISTS` — the same guard in its SQL Server 2016 spelling. */
const DROP_IF_EXISTS = /\bDROP\s+(?:TABLE|VIEW|PROCEDURE|PROC|FUNCTION|INDEX|TRIGGER|TYPE|SCHEMA|CONSTRAINT|COLUMN)\s+IF\s+EXISTS\b/i;

/**
 * A temp table (`#work`, `tempdb..#work`). Cleaning one up is not schema idempotency: the table
 * belongs to the session, and dropping it only if present is the normal way to do it.
 */
const TEMP_TABLE = /tempdb\.\.|['\s(\[]#/i;

/** How many lines an `IF EXISTS (` subquery is followed for, to find what it reads. */
const SUBQUERY_LOOKAHEAD = 6;

/**
 * The 1-based lines in `code` (comment-stripped) that open an existence guard. `IF EXISTS` over
 * ordinary data — "if any row still has the old value, update it" — is not a guard and is left alone.
 */
export function FindExistenceGuards(code: readonly string[]): number[] {
    const found: number[] = [];
    for (let i = 0; i < code.length; i++) {
        const line = code[i];
        if (CATALOG_FUNCTION_GUARD.test(line) || DROP_IF_EXISTS.test(line)) {
            if (!TEMP_TABLE.test(line)) found.push(i + 1);
            continue;
        }
        if (EXISTS_GUARD.test(line)) {
            const window = code.slice(i, i + SUBQUERY_LOOKAHEAD).join(' ');
            if (CATALOG_SOURCE.test(window)) found.push(i + 1);
        }
    }
    return found;
}

/** Find existence guards in the hand-written part of every migration since the cutoff. */
function run(context: CheckContext): CheckResult {
    const fromVersion = String(context.Options['FromVersion'] ?? '');
    const { Migrations, Notes } = FindMigrations(context.RepoRoot, context.Roots, fromVersion);
    const violations: Violation[] = [];
    for (const migration of Migrations) {
        const handWritten = migration.Lines.slice(0, migration.HandWrittenLineCount);
        for (const line of FindExistenceGuards(StripSqlComments(handWritten))) {
            if (HasMarkerNear(migration.Lines, line, EXISTENCE_GUARD_MARKER)) continue;
            violations.push({
                File: migration.File,
                Line: line,
                Message:
                    'existence guard in a migration. Migrations run exactly once, in order, so write the DDL plainly: ' +
                    'drop the IF OBJECT_ID / IF COL_LENGTH / IF NOT EXISTS wrapper (descriptions included).',
            });
        }
    }
    return { Violations: violations, Notes: [...Notes, `${Migrations.length} migration(s) at or after ${fromVersion || '(no cutoff)'} read.`] };
}

/** The registered standard. */
export const MigrationExistenceGuardsCheck: StandardCheck = {
    Id: 'migration-existence-guards',
    Title: 'Write migration DDL plainly, with no existence guards',
    Since: '6.2.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md#migrations-are-plain-ddl',
    Description:
        'Flags IF OBJECT_ID / IF COL_LENGTH / IF [NOT] EXISTS (catalog) guards and DROP … IF EXISTS in the hand-written ' +
        'part of every versioned migration at or after the FromVersion option. Migrations run exactly once under ' +
        'Skyway, so a guard only hides schema drift and complicates the PostgreSQL conversion. CodeGen output below ' +
        `the separator is not read. Reviewed exception: "${EXISTENCE_GUARD_MARKER}" on the line or the one above.`,
    DefaultRoots: ['migrations'],
    DefaultOptions: { FromVersion: '202610210000' },
    Run: run,
};
