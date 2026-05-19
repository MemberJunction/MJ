/**
 * SS source-side convention enforcement tests.
 *
 * Catches anomalies in the SQL Server migration source where columns deviate
 * from documented MJ conventions — particularly the convention that all
 * date/time columns should use `[datetimeoffset]`, NOT bare `[datetime]`,
 * `[datetime2]`, or `[smalldatetime]`.
 *
 * Why this test exists (Bug #15 retrospective):
 *
 *   ListInvitation.ExpiresAt was declared as `[datetime]` in the v5.0
 *   baseline — the ONLY column in the entire SS migration set using bare
 *   `[datetime]`. Every other date/time column uses `[datetimeoffset]`,
 *   matching MJ's "everything has timezone info" convention.
 *
 *   The SS-side anomaly was the real bug. Because the SQLConverter has an
 *   MJ_OVERRIDES rule that maps DATETIME → TIMESTAMPTZ (intentional MJ
 *   design — see TypeResolver.ts:17), the PG side correctly produces
 *   TIMESTAMPTZ, but the SS column itself violates the documented
 *   convention.
 *
 *   We initially misread the parity test — saw "SS=datetime, PG=TIMESTAMPTZ,
 *   that's drift" — and wrote a `.pg-only.sql` migration to "fix" PG to
 *   match the anomalous SS column. That fix had to be retracted because it
 *   contradicted MJ design.
 *
 *   This test catches the SS source anomaly directly, pointing the
 *   developer at the real fix (change SS to `[datetimeoffset]`) instead
 *   of letting them write a wrong-direction PG-side fix.
 *
 * Scope:
 *
 *   This test scans CREATE TABLE column declarations in
 *   `migrations/v5/*.sql`. It does NOT scan sproc parameter declarations or
 *   variable declarations — `@var datetime` inside a sproc body is
 *   unrelated to the table column convention. Pattern is intentionally
 *   conservative to avoid false positives.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { MJ_OVERRIDES } from '../rules/TypeResolver.js';

// Resolve the SS migrations directory relative to the repo root. This file
// lives at packages/SQLConverter/src/__tests__, so the repo root is 4 dirs up.
const SS_MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations', 'v5');

// Allowlist for columns we already know violate the convention but cannot
// retroactively fix (already shipped in production). Each entry must include
// a reason. New violations should NOT be added here — fix the SS source
// to use [datetimeoffset] instead.
const KNOWN_VIOLATIONS: Map<string, string> = new Map([
    [
        'B202602151200__v5.0__Baseline.sql:ListInvitation.ExpiresAt',
        'Shipped in v5.0 baseline; cannot modify retroactively. PG side correctly produces TIMESTAMPTZ via MJ_OVERRIDES. Future major version should change SS source to [datetimeoffset] for convention consistency.',
    ],
]);

// Types we override per MJ convention. If an SS migration declares a CREATE
// TABLE column using one of these types, the converter will silently promote
// it to TIMESTAMPTZ — but the SS source itself violates the documented
// convention of using [datetimeoffset] everywhere.
//
// Sourced from MJ_OVERRIDES at test time. Filtered to date/time types only
// because text overrides like NTEXT→TEXT aren't a column-convention issue.
const OVERRIDDEN_DATETIME_TYPES = new Set(
    Array.from(MJ_OVERRIDES.keys()).filter((k) =>
        ['DATETIME', 'DATETIME2', 'SMALLDATETIME'].includes(k)
    )
);

describe('SS migration source enforces MJ datetime convention', () => {
    it('overridden datetime types are non-empty (sanity check)', () => {
        // Defensive: if MJ_OVERRIDES ever drops these keys, we still want this
        // test to exist as a guard against the original Bug #15 class of issue.
        expect(OVERRIDDEN_DATETIME_TYPES.size).toBeGreaterThan(0);
    });

    it('should report no SS CREATE TABLE columns using bare [datetime]/[datetime2]/[smalldatetime]', () => {
        const violations: Array<{ file: string; column: string; declaredType: string; line: number }> = [];

        // Scan every SS migration file for CREATE TABLE column declarations
        // matching `[ColumnName] [datetime|datetime2|smalldatetime]`. The
        // pattern is conservative — only matches inside CREATE TABLE blocks.
        const files = readdirSync(SS_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

        for (const fileName of files) {
            const filePath = join(SS_MIGRATIONS_DIR, fileName);
            const content = readFileSync(filePath, 'utf8');

            // Track whether we're inside a CREATE TABLE block. SS migrations
            // use GO batch separators between statements, so a CREATE TABLE
            // ends at the next GO at line start.
            const lines = content.split('\n');
            let inCreateTable = false;
            let currentTableName: string | null = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // Detect CREATE TABLE start
                const createMatch = /^CREATE\s+TABLE\s+\[[^\]]+\]\.\[([^\]]+)\]/i.exec(trimmed);
                if (createMatch) {
                    inCreateTable = true;
                    currentTableName = createMatch[1];
                    continue;
                }

                // Detect end of CREATE TABLE batch (GO line, or `)\s*$`
                // followed by GO on the next line)
                if (inCreateTable && (/^GO\s*$/i.test(trimmed) || /^\)\s*ON\s+/i.test(trimmed))) {
                    inCreateTable = false;
                    currentTableName = null;
                    continue;
                }

                if (!inCreateTable || !currentTableName) continue;

                // Match column declarations: `[ColumnName] [type] ...`
                // Constraint declarations like `CONSTRAINT [name] PRIMARY KEY`
                // would not match because they don't start with `[ColumnName] [type]`.
                const colMatch = /^\[([^\]]+)\]\s+\[([^\]]+)\]/.exec(trimmed);
                if (!colMatch) continue;

                const colName = colMatch[1];
                const declaredType = colMatch[2].toUpperCase();
                if (OVERRIDDEN_DATETIME_TYPES.has(declaredType)) {
                    violations.push({
                        file: fileName,
                        column: `${currentTableName}.${colName}`,
                        declaredType: colMatch[2],
                        line: i + 1,
                    });
                }
            }
        }

        // Filter out documented known violations (cannot fix retroactively)
        const newViolations = violations.filter((v) => {
            const key = `${v.file}:${v.column}`;
            return !KNOWN_VIOLATIONS.has(key);
        });

        if (newViolations.length > 0) {
            const messages = newViolations
                .map(
                    (v) =>
                        `  ${v.file}:${v.line} - ${v.column} declared as [${v.declaredType}]\n` +
                        `    → Use [datetimeoffset] per MJ convention. The SQLConverter will silently\n` +
                        `      promote this to TIMESTAMPTZ on PG (see TypeResolver.ts MJ_OVERRIDES),\n` +
                        `      but the SS source should match the documented convention.`
                )
                .join('\n');
            throw new Error(
                `Found ${newViolations.length} SS column(s) violating the MJ datetime convention:\n${messages}\n\n` +
                    `If this column genuinely cannot be changed, add it to the KNOWN_VIOLATIONS map ` +
                    `in MJConventionEnforcement.test.ts with a reason.`
            );
        }

        expect(newViolations).toEqual([]);
    });

    it('should detect ListInvitation.ExpiresAt as a known violation (regression guard)', () => {
        // Verify the known-violation logic is wired correctly. If this test
        // fails, KNOWN_VIOLATIONS got out of sync with what's in the baseline.
        const knownKey = 'B202602151200__v5.0__Baseline.sql:ListInvitation.ExpiresAt';
        expect(KNOWN_VIOLATIONS.has(knownKey)).toBe(true);

        // And verify the column actually exists in the baseline file with
        // the [datetime] type (so we don't have a stale allowlist entry).
        const baselinePath = join(SS_MIGRATIONS_DIR, 'B202602151200__v5.0__Baseline.sql');
        const content = readFileSync(baselinePath, 'utf8');
        const hasViolation = /\[ExpiresAt\]\s+\[datetime\]\s+NOT\s+NULL/i.test(content);
        expect(hasViolation).toBe(true);
    });
});
