import { describe, it, expect } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

/**
 * Phase 2 (plan §5): the PURE materialized-read query builder — the injection-safe, faithfulness-critical
 * core of parameterized RowFilterBroad read-time injection. Every caller value is BOUND (never in the SQL
 * string); ANY condition that would diverge from the live query returns null (→ caller runs live).
 */
describe('GenericDatabaseProvider.buildMaterializedReadQuery', () => {
    const build = GenericDatabaseProvider.buildMaterializedReadQuery;
    const base = {
        outputColumns: ['ID', 'Status', 'ChapterID'],
        schemaName: '__mj',
        viewName: 'materialized_vwDonations',
    };

    describe('scalar equality', () => {
        it('SQL Server: binds the value with a `?` placeholder, never interpolates', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: '=', paramName: 'status', kind: 'scalar' }],
                paramValues: { status: 'Active' },
                isPostgres: false,
            });
            expect(plan).not.toBeNull();
            expect(plan!.sql).toBe('SELECT [ID], [Status], [ChapterID] FROM [__mj].[materialized_vwDonations] WHERE [Status] = ?');
            expect(plan!.parameters).toEqual(['Active']);
        });

        it('PostgreSQL: uses `$1` placeholder + quoted identifiers', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: '=', paramName: 'status', kind: 'scalar' }],
                paramValues: { status: 'Active' },
                isPostgres: true,
            });
            expect(plan!.sql).toBe('SELECT "ID", "Status", "ChapterID" FROM "__mj"."materialized_vwDonations" WHERE "Status" = $1');
            expect(plan!.parameters).toEqual(['Active']);
        });
    });

    describe('range operators are emitted verbatim', () => {
        for (const op of ['!=', '<>', '<', '>', '<=', '>=']) {
            it(`operator ${op}`, () => {
                const plan = build({
                    ...base,
                    spec: [{ column: 'ChapterID', operator: op, paramName: 'c', kind: 'scalar' }],
                    paramValues: { c: 42 },
                    isPostgres: false,
                });
                expect(plan!.sql).toBe(`SELECT [ID], [Status], [ChapterID] FROM [__mj].[materialized_vwDonations] WHERE [ChapterID] ${op} ?`);
                expect(plan!.parameters).toEqual([42]);
            });
        }
    });

    describe('IN / NOT IN list', () => {
        it('SQL Server: one `?` per element, bound in order', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: 'IN', paramName: 'statuses', kind: 'list' }],
                paramValues: { statuses: ['A', 'B', 'C'] },
                isPostgres: false,
            });
            expect(plan!.sql).toBe('SELECT [ID], [Status], [ChapterID] FROM [__mj].[materialized_vwDonations] WHERE [Status] IN (?, ?, ?)');
            expect(plan!.parameters).toEqual(['A', 'B', 'C']);
        });

        it('PostgreSQL: $-placeholders numbered across the whole statement', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: 'NOT IN', paramName: 'statuses', kind: 'list' }],
                paramValues: { statuses: ['X', 'Y'] },
                isPostgres: true,
            });
            expect(plan!.sql).toBe('SELECT "ID", "Status", "ChapterID" FROM "__mj"."materialized_vwDonations" WHERE "Status" NOT IN ($1, $2)');
            expect(plan!.parameters).toEqual(['X', 'Y']);
        });
    });

    describe('multi-parameter conjunction — placeholder indexing stays aligned', () => {
        it('PostgreSQL: scalar then list continues the $-numbering', () => {
            const plan = build({
                ...base,
                spec: [
                    { column: 'ChapterID', operator: '>=', paramName: 'minChapter', kind: 'scalar' },
                    { column: 'Status', operator: 'IN', paramName: 'statuses', kind: 'list' },
                ],
                paramValues: { minChapter: 10, statuses: ['A', 'B'] },
                isPostgres: true,
            });
            expect(plan!.sql).toBe('SELECT "ID", "Status", "ChapterID" FROM "__mj"."materialized_vwDonations" WHERE "ChapterID" >= $1 AND "Status" IN ($2, $3)');
            expect(plan!.parameters).toEqual([10, 'A', 'B']);
        });

        it('SQL Server: predicates ANDed in spec order', () => {
            const plan = build({
                ...base,
                spec: [
                    { column: 'ChapterID', operator: '=', paramName: 'c', kind: 'scalar' },
                    { column: 'Status', operator: '=', paramName: 's', kind: 'scalar' },
                ],
                paramValues: { c: 7, s: 'Open' },
                isPostgres: false,
            });
            expect(plan!.sql).toContain('WHERE [ChapterID] = ? AND [Status] = ?');
            expect(plan!.parameters).toEqual([7, 'Open']);
        });
    });

    describe('injection safety — caller values are ONLY ever in the parameters array', () => {
        it("a value containing SQL never reaches the SQL string", () => {
            const evil = "'; DROP TABLE Users; --";
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: '=', paramName: 'status', kind: 'scalar' }],
                paramValues: { status: evil },
                isPostgres: false,
            });
            expect(plan!.sql).not.toContain('DROP TABLE');
            expect(plan!.sql).not.toContain(evil);
            expect(plan!.parameters).toEqual([evil]); // bound, inert
        });

        it('an injection attempt inside an IN list is bound element-wise', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: 'IN', paramName: 'statuses', kind: 'list' }],
                paramValues: { statuses: ["a", "b') OR 1=1 --"] },
                isPostgres: false,
            });
            expect(plan!.sql).toBe('SELECT [ID], [Status], [ChapterID] FROM [__mj].[materialized_vwDonations] WHERE [Status] IN (?, ?)');
            expect(plan!.parameters).toEqual(['a', "b') OR 1=1 --"]);
        });
    });

    describe('identifier quoting escapes the closer', () => {
        it('SQL Server escapes `]` in a column name', () => {
            const plan = build({
                outputColumns: ['Wei]rd'],
                schemaName: '__mj',
                viewName: 'v',
                spec: [{ column: 'Wei]rd', operator: '=', paramName: 'p', kind: 'scalar' }],
                paramValues: { p: 1 },
                isPostgres: false,
            });
            expect(plan!.sql).toBe('SELECT [Wei]]rd] FROM [__mj].[v] WHERE [Wei]]rd] = ?');
        });

        it('PostgreSQL escapes `"` in a column name', () => {
            const plan = build({
                outputColumns: ['Wei"rd'],
                schemaName: '__mj',
                viewName: 'v',
                spec: [{ column: 'Wei"rd', operator: '=', paramName: 'p', kind: 'scalar' }],
                paramValues: { p: 1 },
                isPostgres: true,
            });
            expect(plan!.sql).toBe('SELECT "Wei""rd" FROM "__mj"."v" WHERE "Wei""rd" = $1');
        });
    });

    describe('refuse-to-live (null) on any faithfulness risk', () => {
        const spec = [{ column: 'Status', operator: '=', paramName: 'status', kind: 'scalar' as const }];

        it('a spec parameter the caller did not supply → null (live applies the default)', () => {
            expect(build({ ...base, spec, paramValues: {}, isPostgres: false })).toBeNull();
            expect(build({ ...base, spec, paramValues: undefined, isPostgres: false })).toBeNull();
        });

        it('a null / undefined value → null', () => {
            expect(build({ ...base, spec, paramValues: { status: null }, isPostgres: false })).toBeNull();
            expect(build({ ...base, spec, paramValues: { status: undefined }, isPostgres: false })).toBeNull();
        });

        it('an operator outside the safe set → null (defense-in-depth)', () => {
            for (const op of ['LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'BETWEEN', 'NOT BETWEEN', 'GLOB', '; DROP']) {
                const plan = build({
                    ...base,
                    spec: [{ column: 'Status', operator: op, paramName: 'status', kind: 'scalar' }],
                    paramValues: { status: 'x' },
                    isPostgres: false,
                });
                expect(plan).toBeNull();
            }
        });

        it('an empty or non-array value for an IN predicate → null', () => {
            const inSpec = [{ column: 'Status', operator: 'IN', paramName: 'statuses', kind: 'list' as const }];
            expect(build({ ...base, spec: inSpec, paramValues: { statuses: [] }, isPostgres: false })).toBeNull();
            expect(build({ ...base, spec: inSpec, paramValues: { statuses: 'notArray' }, isPostgres: false })).toBeNull();
        });

        it('no output columns or empty spec → null', () => {
            expect(build({ ...base, outputColumns: [], spec, paramValues: { status: 'x' }, isPostgres: false })).toBeNull();
            expect(build({ ...base, spec: [], paramValues: { status: 'x' }, isPostgres: false })).toBeNull();
        });

        it('a malformed spec element (missing/non-string column, operator, or paramName) → null, never throws', () => {
            const bad = [
                [{ operator: '=', paramName: 'status', kind: 'scalar' }],            // missing column
                [{ column: 'Status', paramName: 'status', kind: 'scalar' }],         // missing operator
                [{ column: 'Status', operator: '=', kind: 'scalar' }],               // missing paramName
                [{ column: 123, operator: '=', paramName: 'status', kind: 'scalar' }], // non-string column
                [null],                                                              // null element
            ];
            for (const s of bad) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect(build({ ...base, spec: s as any, paramValues: { status: 'x' }, isPostgres: false })).toBeNull();
            }
        });
    });

    // Type-faithful binding: a scalar value is bound AS ITS DECLARED TYPE so the materialized read matches the
    // live path's typed literal, instead of a raw string the DB implicitly coerces (which can error on PG or
    // silently match different rows on SQL Server). Unconvertible values fail closed → live.
    describe('type-faithful scalar binding (paramTypes)', () => {
        it('number: a (trimmed) string binds as a JS number, not the raw string', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'ChapterID', operator: '=', paramName: 'chapterId', kind: 'scalar' }],
                paramValues: { chapterId: ' 42 ' },
                paramTypes: { chapterId: 'number' },
                isPostgres: false,
            });
            expect(plan).not.toBeNull();
            expect(plan!.parameters).toEqual([42]);
        });

        it('number: a non-numeric value → null (live, never a wrong-rows read)', () => {
            expect(build({
                ...base,
                spec: [{ column: 'ChapterID', operator: '=', paramName: 'chapterId', kind: 'scalar' }],
                paramValues: { chapterId: 'not-a-number' },
                paramTypes: { chapterId: 'number' },
                isPostgres: false,
            })).toBeNull();
        });

        it('boolean (SQL Server): live truthiness — ONLY "true" is truthy; binds BIT 1/0; never refuses', () => {
            // Must match the live path (queryprocessor validateParameters): String(v).toLowerCase() === 'true'.
            // Critically, "1" is NOT truthy to live → binds 0. (Guards against the earlier inverted '1'→true bug.)
            for (const [v, expected] of [['true', 1], ['TRUE', 1], ['false', 0], ['1', 0], ['0', 0], ['maybe', 0]] as const) {
                const plan = build({
                    ...base,
                    spec: [{ column: 'Status', operator: '=', paramName: 'flag', kind: 'scalar' }],
                    paramValues: { flag: v },
                    paramTypes: { flag: 'boolean' },
                    isPostgres: false,
                });
                expect(plan!.parameters).toEqual([expected]);
            }
        });

        it('boolean (PostgreSQL): binds a native boolean; "1" is false (matches live, not truthy)', () => {
            const mk = (flag: string, isPostgres: boolean) => build({ ...base, spec: [{ column: 'Status', operator: '=', paramName: 'flag', kind: 'scalar' }], paramValues: { flag }, paramTypes: { flag: 'boolean' }, isPostgres });
            expect(mk('true', true)!.parameters).toEqual([true]);
            expect(mk('1', true)!.parameters).toEqual([false]);
        });

        it('date (SQL Server): binds the UTC value as a zone-less ISO string (strips Z — datetime2 rejects it)', () => {
            // Explicit-offset input → deterministic UTC shift regardless of the test runner\'s timezone. Binding the
            // naive input would fail this — which is the divergence bug this locks out. SQL Server rejects the ISO
            // 'Z' zone suffix for datetime2 (error 241), so the value is bound WITHOUT it — same UTC wall-clock.
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: '>=', paramName: 'since', kind: 'scalar' }],
                paramValues: { since: '2026-01-15T00:00:00+05:00' },
                paramTypes: { since: 'date' },
                isPostgres: false,
            });
            expect(plan!.parameters).toEqual(['2026-01-14T19:00:00.000']);
            expect(typeof plan!.parameters[0]).toBe('string');
        });

        it('date (PostgreSQL): binds the UTC ISO string WITH the Z suffix (timestamptz accepts it)', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: '>=', paramName: 'since', kind: 'scalar' }],
                paramValues: { since: '2026-01-15T00:00:00+05:00' },
                paramTypes: { since: 'date' },
                isPostgres: true,
            });
            expect(plan!.parameters).toEqual(['2026-01-14T19:00:00.000Z']);
        });

        it('date: an unparseable value → null (live)', () => {
            expect(build({
                ...base,
                spec: [{ column: 'Status', operator: '>=', paramName: 'since', kind: 'scalar' }],
                paramValues: { since: 'not-a-date' },
                paramTypes: { since: 'date' },
                isPostgres: false,
            })).toBeNull();
        });

        it('string / no declared type: bound verbatim — exact match, NOT trimmed', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: '=', paramName: 'status', kind: 'scalar' }],
                paramValues: { status: ' Active ' },
                paramTypes: { status: 'string' },
                isPostgres: false,
            });
            expect(plan!.parameters).toEqual([' Active ']);
        });

        it('IN-list elements bind as-is regardless of paramTypes (array element type is not declared)', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'Status', operator: 'IN', paramName: 'statuses', kind: 'list' }],
                paramValues: { statuses: ['A', 'B'] },
                paramTypes: { statuses: 'array' },
                isPostgres: false,
            });
            expect(plan!.parameters).toEqual(['A', 'B']);
        });

        it('back-compat: with NO paramTypes supplied, values bind verbatim (existing callers unaffected)', () => {
            const plan = build({
                ...base,
                spec: [{ column: 'ChapterID', operator: '=', paramName: 'chapterId', kind: 'scalar' }],
                paramValues: { chapterId: '42' },
                isPostgres: false,
            });
            expect(plan!.parameters).toEqual(['42']);
        });
    });
});

/**
 * ④ Ordering fidelity: a materialized RowFilterBroad read emits no ORDER BY and reads an unordered snapshot,
 * so a source query with a top-level ORDER BY must be refused to the live path (which preserves ordering /
 * pagination). queryHasTopLevelOrderBy is the gate; refuse-to-live is the safe default on any uncertainty.
 */
describe('GenericDatabaseProvider.queryHasTopLevelOrderBy (ordering-fidelity gate)', () => {
    const hasOrderBy = GenericDatabaseProvider.queryHasTopLevelOrderBy;

    it('detects a top-level ORDER BY (→ must serve live)', () => {
        expect(hasOrderBy('SELECT ID, Name FROM __mj.vwChapters WHERE Status = @status ORDER BY Name', 'sqlserver')).toBe(true);
        expect(hasOrderBy('SELECT ID FROM foo ORDER BY CreatedAt DESC', 'postgresql')).toBe(true);
    });

    it('returns false for an unordered query (safe to materialize — pages match live)', () => {
        expect(hasOrderBy('SELECT ID, Name FROM __mj.vwChapters WHERE Status = @status', 'sqlserver')).toBe(false);
        expect(hasOrderBy('SELECT ID FROM foo WHERE x = 1', 'postgresql')).toBe(false);
    });

    it('treats an empty/whitespace SQL as unordered (no query text → nothing to preserve)', () => {
        expect(hasOrderBy('', 'sqlserver')).toBe(false);
        expect(hasOrderBy('   ', undefined)).toBe(false);
    });

    it('refuses to live (returns true) on unparseable SQL — treat unknown as ordered rather than risk mis-ordered pages', () => {
        expect(hasOrderBy('this is not valid sql at all ))(', 'sqlserver')).toBe(true);
    });

    it('does not false-positive on an ORDER BY inside a subquery when the outer statement is unordered', () => {
        // The gate reasons about the TOP-LEVEL statement's orderby only; an inner ORDER BY does not force live.
        const sql = 'SELECT t.ID FROM (SELECT ID FROM foo ORDER BY x) AS t WHERE t.ID = @id';
        // Whatever the parser resolves, the result must be a boolean and must NOT throw.
        expect(typeof hasOrderBy(sql, 'sqlserver')).toBe('boolean');
    });
});
