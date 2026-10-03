/**
 * `sqlNoKeywordsExpression`'s allowlist must not be a T-SQL grammar.
 *
 * `ALLOWED_SQL_KEYWORDS` carried only SQL Server's read-only vocabulary. It is
 * now the UNION of the supported dialects' read-only vocabulary, for the reason
 * documented on the list itself: this is a deny-by-default SAFETY screen, not a
 * per-platform parser, and a PostgreSQL name that reaches a SQL Server tenant is
 * rejected by the SQL Server parser on its own.
 *
 * Two things are pinned here, and they are inseparable:
 *
 *   1. the PostgreSQL vocabulary is on the allowlist (source-shape contract —
 *      the list is module-private, and the same technique the sibling
 *      AdhocQueryResolver.dialect.test.ts uses), and
 *   2. the filter's safety behaviour — dangerous keywords, semicolons, comments
 *      — is unchanged for expressions written in PostgreSQL syntax.
 *
 * HONEST NOTE ON (1) vs (2). Widening this particular list does not by itself
 * change what `sqlNoKeywordsExpression` accepts today, and the tests below say
 * so rather than pretending otherwise. The reason is structural: the
 * "unknown keyword" gate is `isKnownKeyword && !isAllowed`, which reduces to
 * `isDangerous && !isAllowed`, and every dangerous keyword has already thrown
 * in the loop above it. So an unrecognised token — which is what `DATE_TRUNC`
 * was — falls straight through. The list is therefore the DECLARED allowlist,
 * consulted whenever that gate is tightened, and it must carry the PostgreSQL
 * names before it is tightened, not after. (2) is what guards the real
 * behaviour, and (1) is what stops the declaration drifting back to T-SQL-only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RUN_QUERY_SQL_FILTERS_WITH_IMPLEMENTATIONS } from '../generic/runQuerySQLFilterImplementations';

/** The filter under test, reached through the module's public export. */
function noKeywordsExpression(value: string): string {
    const filter = RUN_QUERY_SQL_FILTERS_WITH_IMPLEMENTATIONS.find(f => f.name === 'sqlNoKeywordsExpression');
    if (!filter?.implementation) {
        throw new Error('sqlNoKeywordsExpression filter or its implementation is missing');
    }
    return filter.implementation(value) as string;
}

function readImplementationSource(): string {
    return readFileSync(resolve(__dirname, '../generic/runQuerySQLFilterImplementations.ts'), 'utf8');
}

/** Just the ALLOWED_SQL_KEYWORDS literal, so a name in DANGEROUS_SQL_KEYWORDS can't satisfy the pin. */
function readAllowedKeywordsLiteral(): string {
    const src = readImplementationSource();
    const match = src.match(/const ALLOWED_SQL_KEYWORDS = \[[\s\S]*?\n\];/);
    if (!match) {
        throw new Error('ALLOWED_SQL_KEYWORDS literal not found — did the list move or change shape?');
    }
    return match[0];
}

const PG_NAMES = [
    'ILIKE', 'CEIL', 'RANDOM', 'TRUNC', 'MOD', 'GREATEST', 'LEAST',
    'POSITION', 'STRPOS', 'SPLIT_PART', 'INITCAP', 'LPAD', 'RPAD', 'REGEXP_REPLACE', 'TO_CHAR', 'TO_DATE',
    'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'DATE_TRUNC', 'DATE_PART', 'EXTRACT', 'AGE',
    'ARRAY_AGG', 'STRING_AGG', 'COALESCE', 'NULLIF',
    'NULLS', 'FIRST', 'LAST', 'FILTER',
];

const TSQL_NAMES = ['ASC', 'DESC', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ABS', 'CEILING', 'FLOOR',
    'ROUND', 'SQRT', 'LEN', 'LENGTH', 'UPPER', 'LOWER', 'LTRIM', 'RTRIM', 'TRIM',
    'YEAR', 'MONTH', 'DAY', 'DATEPART', 'DATEDIFF', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'AND', 'OR', 'NOT', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'IN'];

describe('ALLOWED_SQL_KEYWORDS declares the PostgreSQL vocabulary too', () => {
    it('carries every PostgreSQL read-only name', () => {
        const literal = readAllowedKeywordsLiteral();
        for (const name of PG_NAMES) {
            expect(literal, `ALLOWED_SQL_KEYWORDS must declare '${name}'`).toContain(`'${name}'`);
        }
    });

    it('still carries every SQL Server name — the union adds, it does not replace', () => {
        const literal = readAllowedKeywordsLiteral();
        for (const name of TSQL_NAMES) {
            expect(literal, `ALLOWED_SQL_KEYWORDS must still declare '${name}'`).toContain(`'${name}'`);
        }
    });

    it('documents WHY it is a union rather than a per-dialect table', () => {
        // The reviewer question this answers — "why isn't this keyed off
        // ResolvePlatformKey like everything else in this change?" — must be
        // answered in the file, not in a PR thread that outlives nothing.
        const src = readImplementationSource();
        expect(src).toMatch(/deny-by-default SAFETY list, not a grammar/);
        expect(src).toMatch(/ResolvePlatformKey/);
    });
});

describe('sqlNoKeywordsExpression accepts PostgreSQL-shaped expressions', () => {
    it('accepts an ORDER BY expression using ILIKE and DATE_TRUNC', () => {
        const expr = "CASE WHEN Name ILIKE 'acme%' THEN 0 ELSE 1 END, DATE_TRUNC('month', CreatedAt) DESC";
        expect(noKeywordsExpression(expr)).toBe(expr);
    });

    it('accepts the PostgreSQL ordering and aggregate vocabulary', () => {
        for (const expr of [
            'CreatedAt DESC NULLS LAST',
            'STRING_AGG(Name)',
            'ARRAY_AGG(Name)',
            'COALESCE(Name, Email)',
            'DATE_PART(1, CreatedAt)',
            'STRPOS(Name, 1)',
            'SPLIT_PART(Email, 2, 2)',
            'GREATEST(A, B)',
            'LEAST(A, B)',
        ]) {
            expect(() => noKeywordsExpression(expr), `${expr} should be accepted`).not.toThrow();
        }
    });
});

// ────────────────────────────────────────────────────────────────────────────
// The safety property, exercised on PostgreSQL-shaped input. This is what the
// widening must not regress, so every case below reuses a PG expression that
// the suite above proves is accepted.
// ────────────────────────────────────────────────────────────────────────────
describe('sqlNoKeywordsExpression safety is unchanged for PostgreSQL input', () => {
    const PG_EXPR = "DATE_TRUNC('month', CreatedAt) DESC";

    it('still rejects a semicolon', () => {
        expect(() => noKeywordsExpression(`${PG_EXPR};`)).toThrow(/Semicolons are not allowed/);
    });

    it('still rejects a line comment', () => {
        expect(() => noKeywordsExpression(`${PG_EXPR} -- payload`)).toThrow(/Comments are not allowed/);
    });

    it('still rejects a block comment', () => {
        expect(() => noKeywordsExpression(`${PG_EXPR} /* payload */`)).toThrow(/Comments are not allowed/);
    });

    it('still rejects dangerous keywords dressed up in PostgreSQL syntax', () => {
        for (const expr of [
            `${PG_EXPR}, (DROP TABLE Users)`,
            `${PG_EXPR}, (DELETE FROM Users)`,
            `${PG_EXPR}, EXEC xp_cmdshell`,
            'ILIKE ANY (Users)',
        ]) {
            expect(() => noKeywordsExpression(expr), `${expr} must be rejected`).toThrow();
        }
    });

    it('still rejects an empty expression', () => {
        expect(() => noKeywordsExpression('')).toThrow(/cannot be empty/);
    });

    it('never lets an allowlist name unblock a denied one — DANGEROUS is checked first', () => {
        // TRUNC is allowed; TRUNCATE is not. The two must not be confused in
        // either direction.
        expect(() => noKeywordsExpression('TRUNC(Amount, 2)')).not.toThrow();
        expect(() => noKeywordsExpression('TRUNCATE TABLE Users')).toThrow(/Dangerous SQL keyword detected/);
    });
});
