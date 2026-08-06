import { describe, it, expect } from 'vitest';
import { MaterializationRefresher, MATERIALIZATION_SURROGATE_COLUMN, FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES, WATERMARK_SAFETY_OVERLAP_MS } from '../MaterializationRefresher';

/**
 * Sub-step R1: the SQL Server full-rebuild + atomic-swap statement builder (plan §11.2).
 * Pure logic, fully unit-testable; the live DB behavior is covered by the integration check.
 */
describe('MaterializationRefresher.buildFullRebuildStatementsSQLServer', () => {
    const base = { schema: '__mj', tableName: 'materialized_Demo', viewName: 'materialized_vwDemo' };

    describe('query case (synthetic IDENTITY surrogate)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            ...base,
            sourceSelect: 'SELECT a, b FROM __mj.Foo',
            surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN,
        });

        it('produces the 3-statement build-shadow → single transactional-swap sequence', () => {
            expect(stmts).toHaveLength(3);
        });

        it('builds a fresh shadow from the source, generating the IDENTITY surrogate', () => {
            expect(stmts[0]).toContain("IF OBJECT_ID('[__mj].[materialized_Demo__shadow]', 'U') IS NOT NULL DROP TABLE [__mj].[materialized_Demo__shadow]");
            expect(stmts[1]).toContain(`SELECT IDENTITY(int, 1, 1) AS [${MATERIALIZATION_SURROGATE_COLUMN}], src.* INTO [__mj].[materialized_Demo__shadow] FROM (SELECT a, b FROM __mj.Foo) AS src`);
        });

        it('performs the swap in one transaction (drop → rename → EXEC(view) → surrogate index), view only ever on the canonical name', () => {
            const swap = stmts[2];
            expect(swap.startsWith('SET XACT_ABORT ON;')).toBe(true); // rolls back on mid-swap error (no orphaned tran)
            expect(swap).toContain('BEGIN TRANSACTION;');
            expect(swap.trim().endsWith('COMMIT TRANSACTION;')).toBe(true);
            expect(swap).toContain('DROP TABLE [__mj].[materialized_Demo]');
            expect(swap).toContain("EXEC sp_rename '__mj.materialized_Demo__shadow', 'materialized_Demo'");
            // CREATE VIEW runs via EXEC() (must be sole statement of its batch) and points at the canonical name
            expect(swap).toContain(`EXEC('CREATE OR ALTER VIEW [__mj].[materialized_vwDemo] AS SELECT * FROM [__mj].[materialized_Demo]')`);
            // the shadow (SELECT…INTO) has no constraints → the surrogate UNIQUE index is restored inside the tran
            expect(swap).toContain('CREATE UNIQUE INDEX [UQ_MJ_Materialized_Surrogate] ON [__mj].[materialized_Demo] ([__mj_MaterializedRowID])');
            // never leaves the wrapper view pointed at the transient shadow (the old "Invalid object name" window)
            expect(swap).not.toContain('SELECT * FROM [__mj].[materialized_Demo__shadow]');
        });

        it('never truncates the live table in place (no TRUNCATE)', () => {
            expect(stmts.some((s) => /TRUNCATE/i.test(s))).toBe(false);
        });
    });

    describe('filterDue (due-selection for the sweep)', () => {
        const now = new Date('2026-06-23T12:00:00Z');
        it('includes rows never refreshed (no NextRefreshAt) and those due at/before now; excludes future', () => {
            const rows = [
                { id: 'never', NextRefreshAt: null },
                { id: 'overdue', NextRefreshAt: new Date('2026-06-23T11:00:00Z') },
                { id: 'exactly-now', NextRefreshAt: new Date('2026-06-23T12:00:00Z') },
                { id: 'future', NextRefreshAt: new Date('2026-06-23T13:00:00Z') },
            ];
            const due = MaterializationRefresher.filterDue(rows, now).map((r) => r.id);
            expect(due).toEqual(['never', 'overdue', 'exactly-now']);
        });
    });

    describe('base-view case (no surrogate — source already carries its PK)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            ...base,
            sourceSelect: 'SELECT * FROM __mj.vwDemoSource',
        });

        it('copies the source shape directly with SELECT * INTO (no IDENTITY surrogate)', () => {
            expect(stmts[1]).toBe('SELECT * INTO [__mj].[materialized_Demo__shadow] FROM (SELECT * FROM __mj.vwDemoSource) AS src');
            expect(stmts[1]).not.toContain('IDENTITY');
        });

        it('still performs the transactional swap + rename, but adds NO surrogate index (base-view has no surrogate)', () => {
            expect(stmts).toHaveLength(3);
            const swap = stmts[2];
            expect(swap).toContain("EXEC sp_rename '__mj.materialized_Demo__shadow', 'materialized_Demo'");
            expect(swap).toContain(`EXEC('CREATE OR ALTER VIEW [__mj].[materialized_vwDemo] AS SELECT * FROM [__mj].[materialized_Demo]')`);
            expect(swap).not.toContain('CREATE UNIQUE INDEX');
        });
    });
});

/**
 * PG counterpart of the full-rebuild + atomic-swap builder (plan §11.2). Pure logic; live PG
 * behavior is a gated integration follow-up. PG quoting: schema bare, object double-quoted.
 */
describe('MaterializationRefresher.buildFullRebuildStatementsPostgreSQL', () => {
    const base = { schema: '__mj', tableName: 'materialized_demo', viewName: 'materialized_vw_demo' };

    describe('query case (synthetic surrogate as the FIRST column)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsPostgreSQL({
            ...base,
            sourceSelect: 'SELECT a, b FROM __mj.foo',
            surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN,
        });

        it('produces the 3-statement sequence (drop shadow → build shadow → one atomic swap batch, no interim repoint)', () => {
            expect(stmts).toHaveLength(3);
        });

        it('builds the shadow with the surrogate FIRST via ROW_NUMBER (PG view-column-order strictness)', () => {
            expect(stmts[0]).toBe('DROP TABLE IF EXISTS __mj."materialized_demo__shadow" CASCADE');
            expect(stmts[1]).toBe(`CREATE TABLE __mj."materialized_demo__shadow" AS SELECT ROW_NUMBER() OVER () AS "${MATERIALIZATION_SURROGATE_COLUMN}", src.* FROM (SELECT a, b FROM __mj.foo) AS src`);
            // surrogate must precede the source columns so CREATE OR REPLACE VIEW stays column-compatible
            expect(stmts[1].indexOf(MATERIALIZATION_SURROGATE_COLUMN)).toBeLessThan(stmts[1].indexOf('src.*'));
        });

        it('drops (CASCADE) / renames / repoints view / restores the surrogate index in ONE atomic transaction — with NO interim repoint outside it', () => {
            // The wrapper view is NEVER repointed at the shadow outside the swap transaction (that would break
            // atomicity — a rolled-back swap would leave the view on the shadow). The only view statement is inside the tran.
            expect(stmts.some((s) => s === 'CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo__shadow"')).toBe(false);
            const swap = stmts[2];
            expect(swap.startsWith('BEGIN;')).toBe(true);
            expect(swap.trimEnd().endsWith('COMMIT;')).toBe(true);
            expect(swap).toContain('DROP TABLE IF EXISTS __mj."materialized_demo" CASCADE;');
            expect(swap).toContain('ALTER TABLE __mj."materialized_demo__shadow" RENAME TO "materialized_demo";');
            expect(swap).toContain('CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo";');
            // CREATE TABLE AS carries no constraints → restore the surrogate uniqueness ON CONFLICT relies on, inside the tran.
            expect(swap).toContain(`CREATE UNIQUE INDEX ON __mj."materialized_demo" ("${MATERIALIZATION_SURROGATE_COLUMN}");`);
        });

        it('never truncates the live table in place (no TRUNCATE)', () => {
            expect(stmts.some((s) => /TRUNCATE/i.test(s))).toBe(false);
        });
    });

    describe('base-view case (no surrogate — source already carries its PK)', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsPostgreSQL({
            ...base,
            sourceSelect: 'SELECT * FROM __mj.vw_demo_source',
        });

        it('copies the source shape directly with CREATE TABLE AS (no ROW_NUMBER surrogate)', () => {
            expect(stmts[1]).toBe('CREATE TABLE __mj."materialized_demo__shadow" AS SELECT * FROM (SELECT * FROM __mj.vw_demo_source) AS src');
            expect(stmts[1]).not.toContain('ROW_NUMBER');
        });

        it('still performs the atomic swap + rename + repoint in one transaction (no interim repoint, no surrogate index)', () => {
            expect(stmts).toHaveLength(3);
            // No out-of-transaction interim repoint at the shadow.
            expect(stmts.some((s) => s === 'CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo__shadow"')).toBe(false);
            expect(stmts[2]).toContain('ALTER TABLE __mj."materialized_demo__shadow" RENAME TO "materialized_demo";');
            expect(stmts[2]).toContain('CREATE OR REPLACE VIEW __mj."materialized_vw_demo" AS SELECT * FROM __mj."materialized_demo";');
            expect(stmts[2]).not.toContain('CREATE UNIQUE INDEX'); // base-view case has no surrogate
        });
    });
});

describe('MaterializationRefresher.buildExternalRebuildPlan (Phase 1.5, parameterized)', () => {
    const columns = [{ name: 'ID', sqlType: 'nvarchar(50)' }, { name: 'Amount', sqlType: 'int' }];

    it('SQL Server: DDL + parameterized INSERT (values bound as @pN, NULL as literal) + transactional swap', () => {
        const plan = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 'materialized_bronze_sales', viewName: 'materialized_vwBronzeSales',
            columns, rows: [{ ID: "a'b", Amount: 10 }, { ID: 'c', Amount: null }], isPostgres: false,
        });
        expect(plan.preStatements[0]).toContain('DROP TABLE [__mj].[materialized_bronze_sales__shadow]');
        expect(plan.preStatements[1]).toBe('CREATE TABLE [__mj].[materialized_bronze_sales__shadow] ([ID] nvarchar(50) NULL, [Amount] int NULL)');
        // One batch: non-null values are @pN placeholders (NOT inlined → the `'` needs no escaping); NULL is literal.
        expect(plan.insertBatches).toHaveLength(1);
        expect(plan.insertBatches[0].sql).toBe('INSERT INTO [__mj].[materialized_bronze_sales__shadow] ([ID], [Amount]) VALUES (@p0, @p1), (@p2, NULL)');
        expect(plan.insertBatches[0].params).toEqual(["a'b", 10, 'c']); // the quote is safe — bound value, never inlined
        // Transactional swap (sp_rename + EXEC(view) inside), same as the internal rebuild.
        const swap = plan.postStatements[plan.postStatements.length - 1];
        expect(swap.startsWith('SET XACT_ABORT ON;')).toBe(true);
        expect(swap).toContain('BEGIN TRANSACTION;');
        expect(swap).toContain("EXEC sp_rename '__mj.materialized_bronze_sales__shadow', 'materialized_bronze_sales'");
        expect(swap).toContain(`EXEC('CREATE OR ALTER VIEW [__mj].[materialized_vwBronzeSales] AS SELECT * FROM [__mj].[materialized_bronze_sales]')`);
        expect(swap).not.toContain('CREATE UNIQUE INDEX'); // no surrogateColumn passed → no index
    });

    it('restores the surrogate UNIQUE index when a surrogateColumn is given (inside the swap tran on both engines)', () => {
        const ss = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 'materialized_q', viewName: 'materialized_vwQ',
            columns: [{ name: '__mj_MaterializedRowID', sqlType: 'int' }, { name: 'v', sqlType: 'int' }],
            rows: [], isPostgres: false, surrogateColumn: '__mj_MaterializedRowID',
        });
        expect(ss.postStatements[ss.postStatements.length - 1]).toContain('CREATE UNIQUE INDEX [UQ_MJ_Materialized_Surrogate] ON [__mj].[materialized_q] ([__mj_MaterializedRowID])');
        const pg = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 'materialized_q', viewName: 'materialized_vw_q',
            columns: [{ name: '__mj_MaterializedRowID', sqlType: 'int' }, { name: 'v', sqlType: 'int' }],
            rows: [], isPostgres: true, surrogateColumn: '__mj_MaterializedRowID',
        });
        const pgSwap = pg.postStatements[pg.postStatements.length - 1];
        expect(pgSwap.startsWith('BEGIN;')).toBe(true);
        expect(pgSwap.trimEnd().endsWith('COMMIT;')).toBe(true);
        expect(pgSwap).toContain('CREATE UNIQUE INDEX ON __mj."materialized_q" ("__mj_MaterializedRowID");');
    });

    it('escapes the identifier delimiter in a hostile external column name (no break-out)', () => {
        const ss = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 't', viewName: 'v',
            columns: [{ name: 'Amount]; DROP TABLE x--', sqlType: 'int' }], rows: [{ 'Amount]; DROP TABLE x--': 1 }], isPostgres: false,
        });
        // `]` doubled to `]]` so the bracket-quoted identifier can't be closed early.
        expect(ss.preStatements[1]).toContain('[Amount]]; DROP TABLE x--]');
        const pg = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 't', viewName: 'v',
            columns: [{ name: 'a"b', sqlType: 'int' }], rows: [{ 'a"b': 1 }], isPostgres: true,
        });
        expect(pg.preStatements[1]).toContain('"a""b"'); // `"` doubled to `""`
    });

    it('PostgreSQL: $N placeholders, mapped column types, CASCADE-repoint swap', () => {
        const plan = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 'materialized_bronze_sales', viewName: 'materialized_vw_bronze',
            columns, rows: [{ ID: 'x', Amount: 5 }], isPostgres: true,
        });
        expect(plan.preStatements[1]).toBe('CREATE TABLE __mj."materialized_bronze_sales__shadow" ("ID" text, "Amount" integer)');
        expect(plan.insertBatches[0].sql).toBe('INSERT INTO __mj."materialized_bronze_sales__shadow" ("ID", "Amount") VALUES ($1, $2)');
        expect(plan.insertBatches[0].params).toEqual(['x', 5]);
        expect(plan.postStatements.some((s) => s.includes('ALTER TABLE __mj."materialized_bronze_sales__shadow" RENAME TO "materialized_bronze_sales"'))).toBe(true);
    });

    it('no rows → no insert batches (DDL + swap only)', () => {
        const plan = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 't', viewName: 'v', columns, rows: [], isPostgres: false,
        });
        expect(plan.insertBatches).toHaveLength(0);
        expect(plan.preStatements.some((s) => s.startsWith('CREATE TABLE'))).toBe(true);
    });

    it('batches by the bind-parameter ceiling (SQL Server → ≤1000 rows/statement)', () => {
        // 2 columns → floor(2000/2)=1000 rows/batch cap; 1500 rows → 2 batches (1000 + 500).
        const rows = Array.from({ length: 1500 }, (_, i) => ({ ID: `id${i}`, Amount: i }));
        const plan = MaterializationRefresher.buildExternalRebuildPlan({
            schema: '__mj', tableName: 't', viewName: 'v', columns, rows, isPostgres: false,
        });
        expect(plan.insertBatches).toHaveLength(2);
        expect(plan.insertBatches[0].params).toHaveLength(2000); // 1000 rows × 2 non-null cols
        expect(plan.insertBatches[1].params).toHaveLength(1000); // 500 rows × 2
    });
});

describe('MaterializationRefresher.coerceExternalParamValue (Phase 1.5)', () => {
    it('null / undefined / non-finite → null (caller emits literal NULL for these)', () => {
        expect(MaterializationRefresher.coerceExternalParamValue(null)).toBeNull();
        expect(MaterializationRefresher.coerceExternalParamValue(undefined)).toBeNull();
        expect(MaterializationRefresher.coerceExternalParamValue(Infinity)).toBeNull();
        expect(MaterializationRefresher.coerceExternalParamValue(NaN)).toBeNull();
    });
    it('primitives + Date pass through unchanged (the driver binds them; 0 is kept, not nulled)', () => {
        expect(MaterializationRefresher.coerceExternalParamValue(42)).toBe(42);
        expect(MaterializationRefresher.coerceExternalParamValue(0)).toBe(0);
        expect(MaterializationRefresher.coerceExternalParamValue(true)).toBe(true);
        expect(MaterializationRefresher.coerceExternalParamValue("O'Brien")).toBe("O'Brien"); // no escaping — bound, not inlined
        const d = new Date('2026-01-02T03:04:05.000Z');
        expect(MaterializationRefresher.coerceExternalParamValue(d)).toBe(d);
    });
    it('plain objects → JSON text (matches the inferSqlType text mapping)', () => {
        expect(MaterializationRefresher.coerceExternalParamValue({ a: 1 })).toBe('{"a":1}');
    });
});

describe('MaterializationRefresher.mapSqlTypeToPostgres (Phase 1.5)', () => {
    it('maps common SQL Server types to PostgreSQL', () => {
        expect(MaterializationRefresher.mapSqlTypeToPostgres('nvarchar(255)')).toBe('text');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('int')).toBe('integer');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('bit')).toBe('boolean');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('uniqueidentifier')).toBe('uuid');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('datetimeoffset')).toBe('timestamptz');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('decimal(18,2)')).toBe('numeric');
    });
    it('passes through already-PG-native type names (external entity on a PG deployment)', () => {
        // A PG-deployment external entity carries PG-native SQLFullType strings; these must NOT fall to the
        // `text` default (which silently stringifies numbers/dates/uuids and breaks sorts/filters/joins).
        expect(MaterializationRefresher.mapSqlTypeToPostgres('integer')).toBe('integer');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('boolean')).toBe('boolean');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('double precision')).toBe('double precision');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('timestamptz')).toBe('timestamptz');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('timestamp with time zone')).toBe('timestamptz');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('timestamp')).toBe('timestamp');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('uuid')).toBe('uuid');
        expect(MaterializationRefresher.mapSqlTypeToPostgres('bytea')).toBe('bytea');
    });
    it('falls back to text for unknown types', () => {
        expect(MaterializationRefresher.mapSqlTypeToPostgres('weirdtype')).toBe('text');
    });
});

describe('MaterializationRefresher.inferSqlType (Phase 1.5 external query)', () => {
    it('infers integer vs float from numeric values', () => {
        expect(MaterializationRefresher.inferSqlType([1, 2, 3], false)).toBe('int');
        expect(MaterializationRefresher.inferSqlType([1, 2, 3], true)).toBe('integer');
        expect(MaterializationRefresher.inferSqlType([1, 2.5, 3], false)).toBe('float');
        expect(MaterializationRefresher.inferSqlType([1, 2.5], true)).toBe('double precision');
    });
    it('ignores nulls when inferring (mixed null + int → int)', () => {
        expect(MaterializationRefresher.inferSqlType([null, 1, null, 2], false)).toBe('int');
    });
    it('widens to bigint when any integer exceeds signed 32-bit range (overflow guard)', () => {
        expect(MaterializationRefresher.inferSqlType([1, 2147483648, 3], false)).toBe('bigint'); // > int32 max
        expect(MaterializationRefresher.inferSqlType([1700000000000], true)).toBe('bigint');       // epoch-ms
        expect(MaterializationRefresher.inferSqlType([1, -2147483649], false)).toBe('bigint');      // < int32 min
        expect(MaterializationRefresher.inferSqlType([1, 2147483647], false)).toBe('int');          // exactly max → int OK
    });
    it('infers booleans and dates per engine', () => {
        expect(MaterializationRefresher.inferSqlType([true, false], false)).toBe('bit');
        expect(MaterializationRefresher.inferSqlType([true], true)).toBe('boolean');
        expect(MaterializationRefresher.inferSqlType([new Date()], false)).toBe('datetime2');
        expect(MaterializationRefresher.inferSqlType([new Date()], true)).toBe('timestamptz');
    });
    it('falls back to text for strings, objects, and all-null columns', () => {
        expect(MaterializationRefresher.inferSqlType(['a', 'b'], false)).toBe('nvarchar(max)');
        expect(MaterializationRefresher.inferSqlType([{ a: 1 }], true)).toBe('text');
        expect(MaterializationRefresher.inferSqlType([null, null], false)).toBe('nvarchar(max)');
        expect(MaterializationRefresher.inferSqlType([], true)).toBe('text');
    });
    it('keeps ISO-8601 date STRINGS as text (not datetime2) — avoids the implicit-conversion bind risk', () => {
        // Only genuine Date objects become a temporal column; date-like strings stay text (they still sort
        // chronologically under lexicographic ordering for fixed-format ISO-8601).
        expect(MaterializationRefresher.inferSqlType(['2026-01-01T00:00:00Z', '2026-06-15T12:30:00+05:00'], false)).toBe('nvarchar(max)');
        expect(MaterializationRefresher.inferSqlType(['2026-01-01', '2026-02-02'], true)).toBe('text');
    });
    it('falls back to text when values are HETEROGENEOUS across rows (decided from ALL values, not the first)', () => {
        expect(MaterializationRefresher.inferSqlType([1, 'two', 3], false)).toBe('nvarchar(max)');
        expect(MaterializationRefresher.inferSqlType([new Date(), 'not-a-date'], true)).toBe('text');
        expect(MaterializationRefresher.inferSqlType([true, 1], false)).toBe('nvarchar(max)');
    });
    it('falls back to float when an integer exceeds signed-64-bit range (would overflow a bigint column)', () => {
        expect(MaterializationRefresher.inferSqlType([1, 1e19], false)).toBe('float');            // > bigint max
        expect(MaterializationRefresher.inferSqlType([1e19], true)).toBe('double precision');
        expect(MaterializationRefresher.inferSqlType([1, 5_000_000_000], false)).toBe('bigint');  // in bigint range → still bigint
    });
});

describe('MaterializationRefresher.quoteIdent (identifier escaping)', () => {
    it('escapes the closing delimiter so a column name containing it cannot break out', () => {
        expect(MaterializationRefresher.quoteIdent('My]Col', false)).toBe('[My]]Col]');    // SS: ] → ]]
        expect(MaterializationRefresher.quoteIdent('My"Col', true)).toBe('"My""Col"');      // PG: " → ""
    });
    it('is a no-op wrapper for normal names', () => {
        expect(MaterializationRefresher.quoteIdent('Region', false)).toBe('[Region]');
        expect(MaterializationRefresher.quoteIdent('Region', true)).toBe('"Region"');
    });
    it('the keyed hash + match-predicate builders escape their identifiers', () => {
        const canon = MaterializationRefresher.canonicalKeyColumnSql('a]b', 'int', false);
        expect(canon).toContain('[a]]b]');
        const pred = MaterializationRefresher.buildKeyMatchPredicate('m', 's', [{ name: 'a]b' }], false);
        expect(pred).toContain('[a]]b]');
    });
});

describe('MaterializationRefresher.canonicalKeyColumnSql (Phase 3 §17.1)', () => {
    it('applies per-type canonical casts (SQL Server) with a NULL sentinel', () => {
        expect(MaterializationRefresher.canonicalKeyColumnSql('gid', 'uniqueidentifier', false))
            .toBe(`COALESCE(LOWER(CONVERT(varchar(36), [gid])), CHAR(30) + 'NULL' + CHAR(30))`);
        expect(MaterializationRefresher.canonicalKeyColumnSql('flag', 'bit', false))
            .toBe(`COALESCE((CASE WHEN [flag] IS NULL THEN NULL WHEN [flag] = 1 THEN '1' ELSE '0' END), CHAR(30) + 'NULL' + CHAR(30))`);
        expect(MaterializationRefresher.canonicalKeyColumnSql('d', 'date', false))
            .toContain('CONVERT(varchar(10), [d], 23)');
        expect(MaterializationRefresher.canonicalKeyColumnSql('ts', 'datetime2', false))
            .toContain("FORMAT(CAST([ts] AS datetime2(3)), 'yyyy-MM-ddTHH:mm:ss.fffZ')");
    });
    it('applies per-type canonical casts (PostgreSQL) with a NULL sentinel', () => {
        expect(MaterializationRefresher.canonicalKeyColumnSql('gid', 'uniqueidentifier', true))
            .toBe(`COALESCE(lower("gid"::text), chr(30) || 'NULL' || chr(30))`);
        expect(MaterializationRefresher.canonicalKeyColumnSql('flag', 'bit', true))
            .toContain(`CASE WHEN "flag" IS NULL THEN NULL WHEN "flag" THEN '1' ELSE '0' END`);
    });
    it('bit/boolean: a NULL is distinguished from false so their surrogate hashes cannot collide', () => {
        // The CASE returns NULL for a NULL input (via the explicit IS NULL branch), which the outer
        // COALESCE then maps to the null sentinel — NOT to '0' (false). Without the IS NULL branch a
        // NULL group and a false group would hash identically and merge/collide on the surrogate.
        const ss = MaterializationRefresher.canonicalKeyColumnSql('flag', 'bit', false);
        expect(ss).toContain('WHEN [flag] IS NULL THEN NULL');
        expect(ss).toContain("CHAR(30) + 'NULL' + CHAR(30)"); // null sentinel still applied by COALESCE
        const pg = MaterializationRefresher.canonicalKeyColumnSql('flag', 'boolean', true);
        expect(pg).toContain('WHEN "flag" IS NULL THEN NULL');
        expect(pg).toContain(`chr(30) || 'NULL' || chr(30)`);
    });
    it('SQL Server: integers and strings fall to the default nvarchar convert', () => {
        expect(MaterializationRefresher.canonicalKeyColumnSql('n', 'int', false)).toContain('CONVERT(nvarchar(max), [n])');
        expect(MaterializationRefresher.canonicalKeyColumnSql('s', 'nvarchar(50)', false)).toContain('CONVERT(nvarchar(max), [s])');
        expect(MaterializationRefresher.canonicalKeyColumnSql('amt', 'decimal(18,2)', false)).toContain('CONVERT(varchar(50), [amt])');
        expect(MaterializationRefresher.canonicalKeyColumnSql('m', 'money', false)).toContain('CONVERT(varchar(50), [m])');
    });
    it('SQL Server: datetimeoffset converts to UTC first; plain datetime is treated as wall-clock', () => {
        expect(MaterializationRefresher.canonicalKeyColumnSql('dto', 'datetimeoffset', false))
            .toContain("FORMAT(CAST([dto] AT TIME ZONE 'UTC' AS datetime2(3)), 'yyyy-MM-ddTHH:mm:ss.fffZ')");
        // plain datetime must NOT contain an AT TIME ZONE conversion
        expect(MaterializationRefresher.canonicalKeyColumnSql('dt', 'datetime', false)).not.toContain('AT TIME ZONE');
    });
    it('PostgreSQL: naive timestamp is NOT session-TZ converted (determinism); tz-aware IS UTC-normalized', () => {
        // naive: cast to ::timestamp (wall-clock), no timestamptz session interpretation
        const naive = MaterializationRefresher.canonicalKeyColumnSql('dt', 'datetime2', true);
        expect(naive).toContain('::timestamp,');
        expect(naive).not.toContain('timestamptz');
        // tz-aware: AT TIME ZONE 'UTC' on the value itself (no naive ::timestamptz cast)
        const tz = MaterializationRefresher.canonicalKeyColumnSql('dto', 'datetimeoffset', true);
        expect(tz).toContain(`"dto" AT TIME ZONE 'UTC'`);
        expect(tz).not.toContain('::timestamptz');
    });
    it('PostgreSQL: money/decimal route through ::numeric (locale-independent, not money::text)', () => {
        expect(MaterializationRefresher.canonicalKeyColumnSql('m', 'money', true)).toContain('("m"::numeric)::text');
        expect(MaterializationRefresher.canonicalKeyColumnSql('amt', 'decimal(18,2)', true)).toContain('("amt"::numeric)::text');
        expect(MaterializationRefresher.canonicalKeyColumnSql('n', 'int', true)).toContain('"n"::text');
    });
    it('date renders ISO on both engines', () => {
        expect(MaterializationRefresher.canonicalKeyColumnSql('d', 'date', true)).toContain(`to_char("d"::date, 'YYYY-MM-DD')`);
        expect(MaterializationRefresher.canonicalKeyColumnSql('d', 'date', false)).toContain('CONVERT(varchar(10), [d], 23)');
    });
});

describe('MaterializationRefresher.buildHashKeyExpression (Phase 3 §17.1)', () => {
    const cols = [{ name: 'id', type: 'int' }, { name: 'grp', type: 'nvarchar(50)' }];
    it('builds a SHA2_256 hash over CHAR(31)-delimited canonical columns (SQL Server)', () => {
        const e = MaterializationRefresher.buildHashKeyExpression(cols, false);
        expect(e).toContain("HASHBYTES('SHA2_256'");
        expect(e).toContain('+ CHAR(31) +');
        expect(e.startsWith('LOWER(CONVERT(varchar(64),')).toBe(true);
    });
    it('builds a digest(...,\'sha256\') over chr(31)-joined UTF-8 columns (PostgreSQL)', () => {
        const e = MaterializationRefresher.buildHashKeyExpression(cols, true);
        expect(e).toContain("digest(convert_to(");
        expect(e).toContain(", 'UTF8'), 'sha256')");
        expect(e).toContain('|| chr(31) ||');
    });
    it('collision-safe: each canonical part is hashed to fixed-width hex BEFORE being delimited (SQL Server)', () => {
        // Per §17.1 collision safety: a raw `part + CHAR(31) + part` collides when a key value contains the
        // delimiter; hashing each part first makes every delimited token pure hex, so the delimiter is
        // unambiguous. Two HASHBYTES calls per part+outer means 3 total for 2 key columns.
        const e = MaterializationRefresher.buildHashKeyExpression(cols, false);
        expect((e.match(/HASHBYTES\('SHA2_256'/g) ?? []).length).toBe(cols.length + 1);
        // The delimiter must only ever sit between per-part hashes, never around a raw COALESCE canonical.
        expect(e).toContain("CONVERT(varchar(64), HASHBYTES('SHA2_256', COALESCE");
    });
    it('collision-safe: each canonical part is hashed to hex BEFORE being joined (PostgreSQL)', () => {
        const e = MaterializationRefresher.buildHashKeyExpression(cols, true);
        // One inner digest(...) per column + one outer digest(...) over the joined per-part hex hashes.
        expect((e.match(/digest\(/g) ?? []).length).toBe(cols.length + 1);
        expect(e).toContain("encode(digest(convert_to(COALESCE");
    });
    it('throws when no key columns are supplied', () => {
        expect(() => MaterializationRefresher.buildHashKeyExpression([], false)).toThrow(/at least one key column/);
    });
});

describe('buildFullRebuild* with hashKeyColumns (Phase 3 keyed surrogate)', () => {
    const keyCols = [{ name: 'region', type: 'nvarchar(50)' }, { name: 'yr', type: 'int' }];
    it('SQL Server uses a HASHBYTES surrogate (not IDENTITY) when key columns are supplied', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            schema: '__mj', tableName: 'materialized_agg', viewName: 'materialized_vwAgg',
            sourceSelect: 'SELECT region, yr, SUM(amt) amt FROM x GROUP BY region, yr',
            surrogateColumn: '__mj_MaterializedRowID', hashKeyColumns: keyCols,
        });
        expect(stmts[1]).toContain("HASHBYTES('SHA2_256'");
        expect(stmts[1]).not.toContain('IDENTITY');
        expect(stmts[1]).toContain('AS [__mj_MaterializedRowID], src.* INTO');
    });
    it('SQL Server falls back to IDENTITY when no key columns', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            schema: '__mj', tableName: 't', viewName: 'v', sourceSelect: 'SELECT 1 a', surrogateColumn: '__mj_MaterializedRowID',
        });
        expect(stmts[1]).toContain('IDENTITY(int, 1, 1)');
    });
    it('PostgreSQL uses a digest surrogate (not ROW_NUMBER) when key columns are supplied', () => {
        const stmts = MaterializationRefresher.buildFullRebuildStatementsPostgreSQL({
            schema: '__mj', tableName: 'materialized_agg', viewName: 'materialized_vwAgg',
            sourceSelect: 'SELECT region, yr, SUM(amt) amt FROM x GROUP BY region, yr',
            surrogateColumn: '__mj_MaterializedRowID', hashKeyColumns: keyCols,
        });
        expect(stmts[1]).toContain('digest(convert_to(');
        expect(stmts[1]).not.toContain('ROW_NUMBER');
    });
    it('SQL Server surrogate index name is a SHORT fixed name (safe under the 128-char sysname limit for a long table)', () => {
        // A long materialized_<longName> table must not produce an index name > 128 chars (would throw inside
        // the XACT_ABORT swap and roll back the whole refresh). The name is per-table-unique, so a constant is safe.
        const longTable = 'materialized_' + 'X'.repeat(140);
        const stmts = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            schema: '__mj', tableName: longTable, viewName: 'materialized_vwX',
            sourceSelect: 'SELECT 1 a', surrogateColumn: '__mj_MaterializedRowID',
        });
        const swap = stmts[stmts.length - 1];
        expect(swap).toContain('CREATE UNIQUE INDEX [UQ_MJ_Materialized_Surrogate]');
        // the index identifier itself is well under 128 chars regardless of table-name length
        expect('UQ_MJ_Materialized_Surrogate'.length).toBeLessThan(128);
    });
});

describe('MaterializationRefresher.stripTopLevelOrderBy (rebuild derived-table safety)', () => {
    it('strips a bare top-level ORDER BY (SQL Server — illegal inside a derived table without TOP/OFFSET)', () => {
        const out = MaterializationRefresher.stripTopLevelOrderBy('SELECT region, SUM(amt) AS total FROM sales GROUP BY region ORDER BY total DESC', false);
        expect(out.toUpperCase()).not.toContain('ORDER BY');
        expect(out).toContain('GROUP BY');
    });
    it('is a NO-OP on PostgreSQL (PG permits ORDER BY inside a derived table)', () => {
        const sql = 'SELECT region, SUM(amt) AS total FROM sales GROUP BY region ORDER BY total DESC';
        expect(MaterializationRefresher.stripTopLevelOrderBy(sql, true)).toBe(sql);
    });
    it('KEEPS the ORDER BY when the query uses TOP (SQL Server) — the ORDER BY picks WHICH rows TOP keeps', () => {
        const sql = 'SELECT TOP 10 region, SUM(amt) AS total FROM sales GROUP BY region ORDER BY total DESC';
        const out = MaterializationRefresher.stripTopLevelOrderBy(sql, false);
        expect(out.toUpperCase()).toContain('ORDER BY'); // must NOT be stripped — legal in a derived table + required
    });
    it('KEEPS the ORDER BY when the query uses OFFSET/FETCH (SQL Server)', () => {
        const sql = 'SELECT a FROM t ORDER BY a OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY';
        const out = MaterializationRefresher.stripTopLevelOrderBy(sql, false);
        expect(out.toUpperCase()).toContain('ORDER BY');
    });
    it('leaves a subquery ORDER BY intact (only the TOP-level clause is stripped)', () => {
        const out = MaterializationRefresher.stripTopLevelOrderBy('SELECT a, b FROM t WHERE a IN (SELECT x FROM u ORDER BY x)', false);
        expect(out.toUpperCase()).toContain('ORDER BY'); // the nested one survives
    });
    it('returns the SQL unchanged when there is no top-level ORDER BY', () => {
        const sql = 'SELECT a FROM t';
        expect(MaterializationRefresher.stripTopLevelOrderBy(sql, false)).toBe(sql);
    });
    it('returns the SQL unchanged when it cannot be parsed (safe fallback)', () => {
        const sql = 'not valid sql !!!';
        expect(MaterializationRefresher.stripTopLevelOrderBy(sql, false)).toBe(sql);
    });
});

describe('MaterializationRefresher.parseKeyColumns (Phase 3)', () => {
    it('returns undefined for null / empty / whitespace', () => {
        expect(MaterializationRefresher.parseKeyColumns(null)).toBeUndefined();
        expect(MaterializationRefresher.parseKeyColumns('')).toBeUndefined();
        expect(MaterializationRefresher.parseKeyColumns('   ')).toBeUndefined();
    });
    it('parses a valid {name,type}[] JSON array', () => {
        expect(MaterializationRefresher.parseKeyColumns('[{"name":"region","type":"nvarchar(50)"},{"name":"yr","type":"int"}]'))
            .toEqual([{ name: 'region', type: 'nvarchar(50)' }, { name: 'yr', type: 'int' }]);
    });
    it('returns undefined for malformed JSON or the wrong shape', () => {
        expect(MaterializationRefresher.parseKeyColumns('not json')).toBeUndefined();
        expect(MaterializationRefresher.parseKeyColumns('{"name":"x","type":"int"}')).toBeUndefined(); // not an array
        expect(MaterializationRefresher.parseKeyColumns('[{"name":"x"}]')).toBeUndefined(); // missing type
        expect(MaterializationRefresher.parseKeyColumns('[1,2]')).toBeUndefined();
    });
});

describe('MaterializationRefresher.buildKeyMatchPredicate (Phase 3 DirtyGroupRecompute)', () => {
    it('builds a NULL-safe AND-joined predicate (SQL Server)', () => {
        const p = MaterializationRefresher.buildKeyMatchPredicate('m', 's', [{ name: 'region' }, { name: 'yr' }], false);
        expect(p).toBe('(m.[region] = s.[region] OR (m.[region] IS NULL AND s.[region] IS NULL)) AND (m.[yr] = s.[yr] OR (m.[yr] IS NULL AND s.[yr] IS NULL))');
    });
    it('builds a NULL-safe predicate with PostgreSQL quoting', () => {
        const p = MaterializationRefresher.buildKeyMatchPredicate('agg', 's', [{ name: 'region' }], true);
        expect(p).toBe('(agg."region" = s."region" OR (agg."region" IS NULL AND s."region" IS NULL))');
    });
});

describe('MaterializationRefresher.buildDirtyGroupRecomputeStatements* (Phase 3)', () => {
    const base = {
        schema: '__mj', tableName: 'materialized_Sales',
        sourceSchema: '__mj', sourceTable: 'sales',
        keyColumns: [{ name: 'region', type: 'nvarchar(50)' }, { name: 'yr', type: 'int' }],
        aggregationSelect: 'SELECT region, yr, SUM(amt) AS total FROM __mj.sales GROUP BY region, yr',
        surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN,
        dataColumns: ['region', 'yr', 'total'],
        updatedAtColumn: '__mj_UpdatedAt',
        watermarkSql: "'2026-07-15T00:00:00.000Z'",
    };

    it('emits DELETE-then-INSERT with the changed-since guard and key match (SQL Server)', () => {
        const [del, ins] = MaterializationRefresher.buildDirtyGroupRecomputeStatementsSQLServer(base);
        // DELETE removes rows for groups with any source row changed since the watermark.
        expect(del).toContain('DELETE m FROM [__mj].[materialized_Sales] AS m');
        expect(del).toContain('EXISTS (SELECT 1 FROM [__mj].[sales] AS s');
        expect(del).toContain("s.[__mj_UpdatedAt] > '2026-07-15T00:00:00.000Z'");
        expect(del).toContain('(m.[region] = s.[region] OR (m.[region] IS NULL AND s.[region] IS NULL))');
        // INSERT re-adds fresh values for dirty groups, stamping the same hash surrogate the rebuild uses.
        expect(ins).toContain('INSERT INTO [__mj].[materialized_Sales] ([__mj_MaterializedRowID], [region], [yr], [total])');
        expect(ins).toContain("HASHBYTES('SHA2_256'");
        expect(ins).toContain('FROM (SELECT region, yr, SUM(amt) AS total FROM __mj.sales GROUP BY region, yr) AS agg');
        expect(ins).toContain('agg.[region], agg.[yr], agg.[total]');
        expect(ins).toContain('(agg.[region] = s.[region] OR (agg.[region] IS NULL AND s.[region] IS NULL))');
    });

    it('emits the PostgreSQL-quoted counterpart with the PG delete syntax + hash', () => {
        const [del, ins] = MaterializationRefresher.buildDirtyGroupRecomputeStatementsPostgreSQL(base);
        expect(del).toContain('DELETE FROM __mj."materialized_Sales" AS m'); // PG has no "DELETE m FROM"
        expect(del).toContain('EXISTS (SELECT 1 FROM __mj."sales" AS s');
        expect(del).toContain('s."__mj_UpdatedAt" >');
        expect(ins).toContain('INSERT INTO __mj."materialized_Sales" ("__mj_MaterializedRowID", "region", "yr", "total")');
        expect(ins).toContain("encode(digest(convert_to(");
        expect(ins).toContain('agg."region", agg."yr", agg."total"');
    });

    it('Incremental (SQL Server): single MERGE upserting recomputed dirty groups on the surrogate', () => {
        const [merge, ...rest] = MaterializationRefresher.buildIncrementalMergeStatementsSQLServer(base);
        expect(rest).toHaveLength(0); // one atomic statement
        expect(merge).toContain('MERGE INTO [__mj].[materialized_Sales] AS t');
        expect(merge).toContain('ON t.[__mj_MaterializedRowID] = src.[__mj_MaterializedRowID]');
        expect(merge).toContain('WHEN MATCHED THEN UPDATE SET t.[region] = src.[region], t.[yr] = src.[yr], t.[total] = src.[total]');
        expect(merge).toContain('WHEN NOT MATCHED THEN INSERT ([__mj_MaterializedRowID], [region], [yr], [total])');
        expect(merge).toContain("HASHBYTES('SHA2_256'");
        expect(merge).toContain("s.[__mj_UpdatedAt] > '2026-07-15T00:00:00.000Z'");
        expect(merge.trim().endsWith(';')).toBe(true);
    });

    it('Incremental (PostgreSQL): INSERT … ON CONFLICT upsert on the surrogate', () => {
        const [upsert] = MaterializationRefresher.buildIncrementalMergeStatementsPostgreSQL(base);
        expect(upsert).toContain('INSERT INTO __mj."materialized_Sales" ("__mj_MaterializedRowID", "region", "yr", "total")');
        expect(upsert).toContain('ON CONFLICT ("__mj_MaterializedRowID") DO UPDATE SET "region" = EXCLUDED."region", "yr" = EXCLUDED."yr", "total" = EXCLUDED."total"');
        expect(upsert).toContain('encode(digest(convert_to(');
    });
});

/**
 * Phase 4: the forced-full-rebuild cadence decision logic (plan §11.3/§16). Pure counter arithmetic
 * extracted from RefreshOne so the increment/reset/threshold semantics are unit-testable without a
 * provider or DB. The live end-to-end behavior (counter persisted across sweeps, forced rebuild
 * re-establishing the incremental baseline) is covered by the integration harness.
 */
describe('MaterializationRefresher forced-full-rebuild cadence', () => {
    const N = FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES;

    describe('shouldForceFullRebuild (threshold boundary)', () => {
        it('does not force below the threshold', () => {
            expect(MaterializationRefresher.shouldForceFullRebuild(0)).toBe(false);
            expect(MaterializationRefresher.shouldForceFullRebuild(N - 1)).toBe(false);
        });

        it('forces at exactly the threshold and beyond', () => {
            expect(MaterializationRefresher.shouldForceFullRebuild(N)).toBe(true);
            expect(MaterializationRefresher.shouldForceFullRebuild(N + 5)).toBe(true);
        });

        it('treats an unset (null/undefined) counter as 0 → not forced', () => {
            expect(MaterializationRefresher.shouldForceFullRebuild(null)).toBe(false);
            expect(MaterializationRefresher.shouldForceFullRebuild(undefined)).toBe(false);
        });
    });

    describe('nextRefreshesSinceFullRebuild (increment / reset)', () => {
        it('increments on a genuine incremental refresh', () => {
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(0, true)).toBe(1);
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(N - 1, true)).toBe(N);
        });

        it('resets to 0 on any full rebuild (ranIncremental=false), regardless of the current value', () => {
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(0, false)).toBe(0);
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(N, false)).toBe(0);
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(N + 5, false)).toBe(0);
        });

        it('treats an unset (null/undefined) counter as 0', () => {
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(null, true)).toBe(1);
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(undefined, true)).toBe(1);
            expect(MaterializationRefresher.nextRefreshesSinceFullRebuild(null, false)).toBe(0);
        });
    });

    it('yields exactly N incrementals between forced full rebuilds (end-to-end counter walk)', () => {
        let counter = 0;
        let incrementalsSinceRebuild = 0;
        let forcedRebuilds = 0;
        // Simulate 3 full cadence cycles of always-eligible incremental refreshes.
        for (let i = 0; i < 3 * (N + 1); i++) {
            if (MaterializationRefresher.shouldForceFullRebuild(counter)) {
                // forced full rebuild: ranIncremental=false → reset
                forcedRebuilds++;
                expect(incrementalsSinceRebuild).toBe(N); // proves exactly N incrementals preceded it
                incrementalsSinceRebuild = 0;
                counter = MaterializationRefresher.nextRefreshesSinceFullRebuild(counter, false);
            } else {
                incrementalsSinceRebuild++;
                counter = MaterializationRefresher.nextRefreshesSinceFullRebuild(counter, true);
            }
        }
        expect(forcedRebuilds).toBe(3);
    });
});

/**
 * ① Concurrency safety: run-unique shadow table names so two concurrent refreshes of the SAME materialization
 * cannot collide on the shadow table (one run's DROP …__shadow yanking the other's in-flight table).
 */
describe('MaterializationRefresher.makeShadowTableName (concurrency-safe shadow naming)', () => {
    it('produces a fixed-prefix, length-safe name well under both engine identifier limits', () => {
        const name = MaterializationRefresher.makeShadowTableName();
        expect(name.startsWith('mj_mat_shd_')).toBe(true);
        expect(name.length).toBeLessThanOrEqual(63); // PG's 63-char limit (SQL Server's 128 is looser)
        expect(name).toMatch(/^mj_mat_shd_[0-9a-f]{32}$/); // prefix + 32 hex (uuid, dashes stripped)
    });

    it('is unique across calls (so concurrent refreshes never share a shadow)', () => {
        const names = new Set(Array.from({ length: 200 }, () => MaterializationRefresher.makeShadowTableName()));
        expect(names.size).toBe(200);
    });

    it('is NOT derived from the table name — a very long materialized table name still yields a short shadow', () => {
        const name = MaterializationRefresher.makeShadowTableName();
        expect(name).not.toContain('materialized_');
    });

    it('threads the run-unique shadow name into the full-rebuild builders (both engines) when supplied', () => {
        const shadowName = 'mj_mat_shd_deadbeefdeadbeefdeadbeefdeadbeef';
        const ss = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            schema: '__mj', tableName: 'materialized_Demo', viewName: 'materialized_vwDemo',
            sourceSelect: 'SELECT a FROM __mj.Foo', surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN, shadowName,
        });
        expect(ss.some((s) => s.includes(`[__mj].[${shadowName}]`))).toBe(true);
        expect(ss.some((s) => s.includes('materialized_Demo__shadow'))).toBe(false); // legacy fixed name not used
        // Swap still renames the run-unique shadow into the stable canonical table name.
        expect(ss.some((s) => s.includes(`EXEC sp_rename '__mj.${shadowName}', 'materialized_Demo'`))).toBe(true);

        const pg = MaterializationRefresher.buildFullRebuildStatementsPostgreSQL({
            schema: '__mj', tableName: 'materialized_demo', viewName: 'materialized_vw_demo',
            sourceSelect: 'SELECT a FROM __mj.foo', surrogateColumn: MATERIALIZATION_SURROGATE_COLUMN, shadowName,
        });
        expect(pg.some((s) => s.includes(`__mj."${shadowName}"`))).toBe(true);
        expect(pg.some((s) => s.includes('materialized_demo__shadow'))).toBe(false);
        expect(pg.some((s) => s.includes(`ALTER TABLE __mj."${shadowName}" RENAME TO "materialized_demo"`))).toBe(true);
    });

    it('falls back to the legacy fixed shadow name when none is supplied (backward compatible)', () => {
        const ss = MaterializationRefresher.buildFullRebuildStatementsSQLServer({
            schema: '__mj', tableName: 'materialized_Demo', viewName: 'materialized_vwDemo',
            sourceSelect: 'SELECT a FROM __mj.Foo',
        });
        expect(ss[1]).toContain('materialized_Demo__shadow');
    });
});

/**
 * ② Watermark commit-skew safety: the persisted incremental watermark is MAX(__mj_UpdatedAt) minus a safety
 * overlap, so a row committed late (timestamp < MAX but commit after the probe) is re-scanned, not skipped.
 */
describe('MaterializationRefresher.applyWatermarkSafetyOverlap (commit-skew safety)', () => {
    it('subtracts the overlap so the stored watermark lags the probed MAX', () => {
        const rawMax = new Date('2026-08-03T12:00:00.000Z');
        const adjusted = MaterializationRefresher.applyWatermarkSafetyOverlap(rawMax);
        expect(adjusted).not.toBeNull();
        expect(adjusted!.getTime()).toBe(rawMax.getTime() - WATERMARK_SAFETY_OVERLAP_MS);
        expect(adjusted!.getTime()).toBeLessThan(rawMax.getTime()); // never rounds the watermark UP past a real change
    });

    it('passes null through (no __mj_UpdatedAt source → keep full-rebuilding)', () => {
        expect(MaterializationRefresher.applyWatermarkSafetyOverlap(null)).toBeNull();
    });

    it('uses a positive overlap (a zero/negative lag would not close the skew)', () => {
        expect(WATERMARK_SAFETY_OVERLAP_MS).toBeGreaterThan(0);
    });
});

/**
 * Leak-1 runtime gate: the refresher refuses to (re)populate a local mirror of an EXTERNAL read-RLS-protected
 * entity (its rows are read-refused live under RLS; a mirror would expose them unscoped via raw queries). Detects
 * RLS the same way CodeGenLib does — any permission with a non-empty, non-whitespace ReadRLSFilterID.
 */
describe('MaterializationRefresher.entityHasReadRLS (Leak-1 runtime gate detector)', () => {
    // Structural stub of the only EntityInfo surface the detector reads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ent = (perms: Array<{ ReadRLSFilterID?: string | null }>): any => ({ Name: 'Ext', Permissions: perms });

    it('is TRUE when any permission carries a non-empty ReadRLSFilterID', () => {
        expect(MaterializationRefresher.entityHasReadRLS(ent([{}, { ReadRLSFilterID: 'rls-1' }]))).toBe(true);
    });

    it('is FALSE when no permission carries an RLS filter (null/absent)', () => {
        expect(MaterializationRefresher.entityHasReadRLS(ent([{ ReadRLSFilterID: null }, {}]))).toBe(false);
    });

    it('treats a whitespace-only ReadRLSFilterID as NOT protected (trim guard)', () => {
        expect(MaterializationRefresher.entityHasReadRLS(ent([{ ReadRLSFilterID: '   ' }]))).toBe(false);
    });

    it('is FALSE for an entity with no permissions', () => {
        expect(MaterializationRefresher.entityHasReadRLS(ent([]))).toBe(false);
    });
});
