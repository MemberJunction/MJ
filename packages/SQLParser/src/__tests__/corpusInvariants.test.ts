/**
 * Rules the public SQLParser extractors must keep on every input, written before the parser
 * redesign (plans/sql-pipeline-redesign, TEST-INVENTORY §2.1 rows P1–P5, P7, P8, P12).
 *
 * Each `it` states a rule that holds today and must survive the rewrite. Each `it.fails` states
 * the behaviour the redesign must deliver and fails today on that assertion: when the redesign
 * makes it pass, vitest reports the `it.fails` as failing, and it is turned into a plain `it`.
 *
 * Every input is synthetic and written here. Inputs are paired so one goes down the AST path and
 * the other down the text fallback: on SQL Server `TRY_CAST` (which node-sql-parser rejects)
 * sends a statement to the fallback, and on PostgreSQL an `E'…'` literal does.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';
import type { SQLTableReference } from '../sql-parser.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

/** The table names of a result, in order. */
function tableNames(tables: SQLTableReference[]): string[] {
    return tables.map((t) => t.TableName);
}

/** `schema.table` for each ref, in order. */
function qualifiedNames(tables: SQLTableReference[]): string[] {
    return tables.map((t) => `${t.SchemaName}.${t.TableName}`);
}

/** The column names ExtractColumnRefs reports, in order. */
function columnRefNames(sql: string, dialect: SQLParserDialect): string[] {
    return SQLParser.ExtractColumnRefs(sql, dialect).map((c) => c.ColumnName);
}

/** The output names ExtractSelectColumns reports, in order. */
function selectNames(sql: string, dialect: SQLParserDialect): string[] {
    return SQLParser.ExtractSelectColumns(sql, dialect).map((c) => c.OutputName);
}

/** Whether the AST parser reads this SQL as written (no fallback). Used to prove a case's path. */
function parsesDirectly(sql: string, dialect: SQLParserDialect): boolean {
    return SQLParser.ParseSQL(sql, dialect) !== null;
}

/**
 * The body of a `name AS ( body )` CTE definition string, trimmed: the text after the first
 * `AS (` and before the last `)`.
 */
function cteBody(definition: string): string {
    const open = /\bAS\s*\(/i.exec(definition);
    if (!open) throw new Error(`not a CTE definition: ${definition}`);
    return definition.slice(open.index + open[0].length, definition.lastIndexOf(')')).trim();
}

// ════════════════════════════════════════════════════════════════════
// P1 — a table ref is never a CTE name, at any depth
// ════════════════════════════════════════════════════════════════════

describe('P1: a table ref is never a CTE name', () => {
    const SIMPLE_SS = 'WITH A AS (SELECT ID FROM Real) SELECT ID FROM A';
    const SCHEMA_SS = 'WITH S AS (SELECT m.ID FROM crm.vwMembers m) SELECT * FROM S';
    const LIKE_A_VIEW_SS = 'WITH vwUsers AS (SELECT ID FROM dbo.Real) SELECT ID FROM vwUsers';
    const FALLBACK_SS = 'WITH A AS (SELECT TRY_CAST(x AS INT) AS v FROM Real) SELECT v FROM A';
    const NESTED_PG = 'WITH outer_q AS (WITH inner_q AS (SELECT id FROM real_t) SELECT id FROM inner_q) SELECT id FROM outer_q';
    const IN_SUBQUERY_PG = 'SELECT COUNT(*) FROM (WITH q AS (SELECT id FROM real_t) SELECT id FROM q) sub';

    it('reports the real tables a CTE reads (setup for the pins below)', () => {
        expect(parsesDirectly(SIMPLE_SS, ss)).toBe(true);
        expect(parsesDirectly(FALLBACK_SS, ss)).toBe(false);
        expect(tableNames(SQLParser.ExtractTableRefs(SIMPLE_SS, ss))).toContain('Real');
        expect(qualifiedNames(SQLParser.ExtractTableRefs(SCHEMA_SS, ss))).toContain('crm.vwMembers');
        expect(tableNames(SQLParser.ExtractTableRefs(LIKE_A_VIEW_SS, ss))).toContain('Real');
        expect(tableNames(SQLParser.ExtractTableRefs(FALLBACK_SS, ss))).toContain('Real');
        expect(tableNames(SQLParser.ExtractTableRefs(NESTED_PG, pg))).toContain('real_t');
        expect(tableNames(SQLParser.ExtractTableRefs(IN_SUBQUERY_PG, pg))).toContain('real_t');
    });

    // Decided: CTE references never come back as tables (DISCUSSION §6, 2026-10-27; COMPAT-MAP §1.2 B1). P1.
    // Before the redesign: ['Real', 'A'] — the CTE A is reported as table dbo.A.
    it('does not report a top-level CTE as a table (SQL Server, AST path)', () => {
        expect(tableNames(SQLParser.ExtractTableRefs(SIMPLE_SS, ss))).toEqual(['Real']);
    });

    // Decided: CTE references never come back as tables (DISCUSSION §6, 2026-10-27). P1, #5770 item 6.
    // Before the redesign: ['crm.vwMembers', 'dbo.S'].
    it('does not report a CTE as a default-schema table beside a schema-qualified source', () => {
        expect(qualifiedNames(SQLParser.ExtractTableRefs(SCHEMA_SS, ss))).toEqual(['crm.vwMembers']);
    });

    // Decided: CTE references never come back as tables (DISCUSSION §6, 2026-10-27). P1.
    // Before the redesign: ['Real', 'vwUsers'] — a CTE named like a view is reported as view dbo.vwUsers.
    it('does not report a CTE named like a view as that view', () => {
        expect(tableNames(SQLParser.ExtractTableRefs(LIKE_A_VIEW_SS, ss))).toEqual(['Real']);
    });

    // Decided: CTE references never come back as tables, on the fallback too (DISCUSSION §6, 2026-10-27). P1.
    // Before the redesign: ['Real', 'A'] from the regex fallback.
    it('does not report a CTE as a table when the statement goes to the text fallback', () => {
        expect(tableNames(SQLParser.ExtractTableRefs(FALLBACK_SS, ss))).toEqual(['Real']);
    });

    // Decided: CTEs are scoped wherever they are declared, including nested WITH on PostgreSQL
    // (DISCUSSION §6, 2026-10-27). P1, #5770 item 4. Before the redesign: ['real_t', 'inner_q', 'outer_q'].
    it('does not report a CTE declared inside another CTE body (PostgreSQL nested WITH)', () => {
        expect(tableNames(SQLParser.ExtractTableRefs(NESTED_PG, pg))).toEqual(['real_t']);
    });

    // Decided: CTEs are scoped wherever they are declared (DISCUSSION §6, 2026-10-27). P1, #5770 item 5.
    // Before the redesign: ['real_t', 'q'].
    it('does not report a CTE declared inside a derived table (PostgreSQL WITH in a subquery)', () => {
        expect(tableNames(SQLParser.ExtractTableRefs(IN_SUBQUERY_PG, pg))).toEqual(['real_t']);
    });

    // Decided: Parse reports the same tables as ExtractTableRefs, without CTE names (DISCUSSION §6, 2026-10-27). P1.
    // Before the redesign: Parse().Tables is ['Real', 'A'].
    it('does not report a CTE as a table from Parse()', () => {
        expect(tableNames(SQLParser.Parse(SIMPLE_SS, ss).Tables)).toEqual(['Real']);
    });
});

// ════════════════════════════════════════════════════════════════════
// P2 — no dbo / invented schema on PostgreSQL
// ════════════════════════════════════════════════════════════════════

describe('P2: no dbo schema on PostgreSQL', () => {
    // The legacy ExtractTableRefs wrapper fills the dialect default schema for an unqualified ref:
    // dbo on SQL Server, public on PostgreSQL (DISCUSSION §6, 2026-10-27, COMPAT-MAP §1). The new
    // API will return null instead; these pins are about the legacy wrapper.
    const UNQUALIFIED_PG = 'SELECT id FROM users';
    const UNQUALIFIED_PG_FALLBACK = "SELECT E'x' AS v FROM users";
    const QUALIFIED_PG = 'SELECT "ID" FROM "__mj"."vwUsers" u';
    const MIXED_PG = 'SELECT u."ID" FROM "__mj"."vwUsers" u JOIN roles r ON r.id = u."RoleID"';

    it('keeps an explicit schema and fills dbo on SQL Server (setup for the pins below)', () => {
        expect(parsesDirectly(UNQUALIFIED_PG, pg)).toBe(true);
        expect(parsesDirectly(UNQUALIFIED_PG_FALLBACK, pg)).toBe(false);
        expect(qualifiedNames(SQLParser.ExtractTableRefs(QUALIFIED_PG, pg))).toEqual(['__mj.vwUsers']);
        expect(qualifiedNames(SQLParser.ExtractTableRefs('SELECT ID FROM Users', ss))).toEqual(['dbo.Users']);
        expect(tableNames(SQLParser.ExtractTableRefs(UNQUALIFIED_PG_FALLBACK, pg))).toEqual(['users']);
    });

    // Decided: the deprecated wrapper fills the dialect default schema, public on PostgreSQL, never dbo
    // (DISCUSSION §6, 2026-10-27). P2. Before the redesign: SchemaName 'dbo'.
    it('gives an unqualified PostgreSQL ref the schema public (AST path)', () => {
        expect(qualifiedNames(SQLParser.ExtractTableRefs(UNQUALIFIED_PG, pg))).toEqual(['public.users']);
    });

    // Decided: as above, on the fallback path (DISCUSSION §6, 2026-10-27). P2. Before the redesign: SchemaName 'dbo'.
    it('gives an unqualified PostgreSQL ref the schema public (text fallback)', () => {
        expect(qualifiedNames(SQLParser.ExtractTableRefs(UNQUALIFIED_PG_FALLBACK, pg))).toEqual(['public.users']);
    });

    // Decided: as above, through Parse() (DISCUSSION §6, 2026-10-27). P2. Before the redesign: schemas ['__mj', 'dbo'].
    it('never reports dbo for any PostgreSQL ref from Parse()', () => {
        expect(SQLParser.Parse(MIXED_PG, pg).Tables.map((t) => t.SchemaName)).toEqual(['__mj', 'public']);
    });
});

// ════════════════════════════════════════════════════════════════════
// P3 — text inside comments or string literals never yields a ref
// ════════════════════════════════════════════════════════════════════

describe('P3: comments and string literals never yield a ref', () => {
    const AST_SS = "SELECT a FROM Real -- FROM Ghost\n/* JOIN Spook */ WHERE b = 'FROM Phantom'";
    const FALLBACK_SS = "SELECT TRY_CAST(a AS INT) AS v FROM Real -- FROM Ghost\n/* JOIN Spook */ WHERE b = 'FROM Phantom'";
    const FALLBACK_PG = "SELECT E'x' AS v FROM real_t -- FROM ghost\n/* JOIN spook */ WHERE b = 'FROM phantom'";

    it('ignores comments and strings on the AST path', () => {
        expect(parsesDirectly(AST_SS, ss)).toBe(true);
        expect(tableNames(SQLParser.ExtractTableRefs(AST_SS, ss))).toEqual(['Real']);
        expect(tableNames(SQLParser.Parse(AST_SS, ss).Tables)).toEqual(['Real']);
        expect(columnRefNames(AST_SS, ss)).toEqual(['a', 'b']);
    });

    // Decided: comments never reach the text fallback (DISCUSSION §6, 2026-10-27; COMPAT-MAP §1.2 B3). P3, #5770 item 7.
    // Before the redesign: ['Real', 'Ghost', 'Spook', 'Phantom'].
    it('ignores comments and strings on the SQL Server text fallback', () => {
        expect(parsesDirectly(FALLBACK_SS, ss)).toBe(false);
        expect(tableNames(SQLParser.ExtractTableRefs(FALLBACK_SS, ss))).toEqual(['Real']);
    });

    // Decided: as above (DISCUSSION §6, 2026-10-27). P3. Before the redesign: ['real_t', 'ghost', 'spook', 'phantom'].
    it('ignores comments and strings on the PostgreSQL text fallback', () => {
        expect(parsesDirectly(FALLBACK_PG, pg)).toBe(false);
        expect(tableNames(SQLParser.ExtractTableRefs(FALLBACK_PG, pg))).toEqual(['real_t']);
    });

    // Decided: as above, through Parse() (DISCUSSION §6, 2026-10-27). P3. Before the redesign: ['Real', 'Ghost', 'Spook', 'Phantom'].
    it('ignores comments and strings in Parse() on the text fallback', () => {
        expect(tableNames(SQLParser.Parse(FALLBACK_SS, ss).Tables)).toEqual(['Real']);
    });
});

// ════════════════════════════════════════════════════════════════════
// P4 — PG "quoted" idents read; … FROM functions and IS DISTINCT FROM aren't refs
// ════════════════════════════════════════════════════════════════════

describe('P4: quoted identifiers and FROM inside functions', () => {
    const FUNCS_PG = `SELECT EXTRACT(YEAR FROM "JoinDate") AS y, SUBSTRING("Name" FROM 1 FOR 2) AS s, TRIM(BOTH 'x' FROM "Name") AS t FROM "Members" WHERE "A" IS DISTINCT FROM "B"`;
    const FUNCS_PG_FALLBACK = `SELECT EXTRACT(YEAR FROM joindate) AS y, SUBSTRING(name FROM 1 FOR 2) AS s, TRIM(BOTH 'x' FROM name) AS t, E'v' AS d FROM members WHERE a IS DISTINCT FROM b`;
    const QUOTED_PG_FALLBACK = `SELECT E'v' AS d FROM "crm"."Members" m JOIN "Other" o ON o."ID" = m."ID"`;
    const TRIM_SS = "SELECT TRIM('x' FROM Name) AS t FROM Members";

    it('reads only the FROM-clause table when functions use FROM (PostgreSQL, AST path)', () => {
        expect(parsesDirectly(FUNCS_PG, pg)).toBe(true);
        expect(tableNames(SQLParser.ExtractTableRefs(FUNCS_PG, pg))).toEqual(['Members']);
        expect(selectNames(FUNCS_PG, pg)).toEqual(['y', 's', 't']);
    });

    it('reads double-quoted schema-qualified refs on the AST path', () => {
        const sql = `SELECT m."ID" FROM "crm"."Members" m JOIN "Other" o ON o."ID" = m."ID"`;
        const refs = SQLParser.ExtractTableRefs(sql, pg);
        expect(refs.map((t) => `${t.TableName}:${t.Alias}`)).toEqual(['Members:m', 'Other:o']);
        expect(refs[0].SchemaName).toBe('crm');
    });

    // Decided: the text fallback never reads `EXTRACT/SUBSTRING/TRIM … FROM` or `IS DISTINCT FROM` as a ref
    // (DISCUSSION §6, 2026-10-27; COMPAT-MAP §1.2 B3). P4, #5770 item 11.
    // Before the redesign: ['joindate', '1', 'name', 'members', 'b'].
    it('reads no table from EXTRACT/SUBSTRING/TRIM … FROM or IS DISTINCT FROM (PostgreSQL text fallback)', () => {
        expect(parsesDirectly(FUNCS_PG_FALLBACK, pg)).toBe(false);
        expect(tableNames(SQLParser.ExtractTableRefs(FUNCS_PG_FALLBACK, pg))).toEqual(['members']);
    });

    // Decided: PG double-quoted identifiers are read on every path (DISCUSSION §6, 2026-10-27). P4.
    // Before the redesign: [] — the regex fallback skips every "quoted" name.
    it('reads double-quoted refs on the PostgreSQL text fallback', () => {
        expect(parsesDirectly(QUOTED_PG_FALLBACK, pg)).toBe(false);
        expect(SQLParser.ExtractTableRefs(QUOTED_PG_FALLBACK, pg).map((t) => `${t.SchemaName}.${t.TableName}`))
            .toEqual(['crm.Members', 'public.Other']);
    });

    // Decided: `TRIM(… FROM …)` is not a table ref (DISCUSSION §6, 2026-10-27). P4 (SQL Server half).
    // Before the redesign: ['Name', 'Members'] — node-sql-parser rejects TRIM … FROM on TransactSQL, and the fallback reads `FROM Name`.
    it('reads no table from TRIM(… FROM …) on SQL Server', () => {
        expect(tableNames(SQLParser.ExtractTableRefs(TRIM_SS, ss))).toEqual(['Members']);
    });

    // Decided: column refs are identifier paths in every clause (COMPAT-MAP §1.2 ExtractColumnRefs). P4.
    // Before the redesign: ['ID', 'A'] — the right-hand side of IS DISTINCT FROM is dropped.
    it('reads both operands of IS DISTINCT FROM as column refs', () => {
        const sql = 'SELECT "ID" FROM "Members" WHERE "A" IS DISTINCT FROM "B"';
        expect(columnRefNames(sql, pg)).toEqual(expect.arrayContaining(['ID', 'A', 'B']));
    });
});

// ════════════════════════════════════════════════════════════════════
// P5 — extracted spans are exact slices of the input
// ════════════════════════════════════════════════════════════════════

describe('P5: ExtractCTEs returns exact slices of the input', () => {
    /** Expects every CTE body and the main statement to occur verbatim in `sql`. */
    function expectExactSlices(sql: string, dialect: SQLParserDialect): void {
        const result = SQLParser.ExtractCTEs(sql, dialect);
        expect(result).not.toBeNull();
        if (!result) return;
        expect(result.CTEDefinitions.length).toBeGreaterThan(0);
        for (const definition of result.CTEDefinitions) {
            expect(sql).toContain(cteBody(definition));
        }
        expect(sql).toContain(result.MainStatement);
    }

    // UsedASTParsing now means "the structural parse was complete" (COMPAT-MAP §1.2 Parse; DISCUSSION §6,
    // 2026-10-27; P12). Both statements parse completely, so it is true; before the redesign they went to the
    // paren scan and reported false.
    it('returns exact slices for unquoted names (PostgreSQL)', () => {
        const sql = 'WITH a AS (SELECT id FROM real_t), b AS (SELECT id FROM a) SELECT id FROM b';
        expect(SQLParser.ExtractCTEs(sql, pg)?.UsedASTParsing).toBe(true);
        expectExactSlices(sql, pg);
    });

    it('returns exact slices for a statement node-sql-parser rejects (SQL Server, TRY_CAST)', () => {
        const sql = 'WITH A AS (SELECT TRY_CAST(x AS INT) AS v FROM Real) SELECT v FROM A';
        expect(SQLParser.ExtractCTEs(sql, ss)?.UsedASTParsing).toBe(true);
        expectExactSlices(sql, ss);
    });

    // Decided: extraction returns the caller's text, not regenerated text (DISCUSSION §6, 2026-10-27, O1;
    // COMPAT-MAP §1.2 ExtractCTEs). P5, #5770 item 1.
    // Before the redesign: body 'SELECT [n] FROM (VALUES (0), (1)) AS [v(n)]' (invalid SQL) and main 'SELECT * FROM [Q]'.
    it('keeps a VALUES derived-table column list as written', () => {
        expectExactSlices('WITH Q AS (SELECT n FROM (VALUES (0),(1)) AS v(n)) SELECT * FROM Q', ss);
    });

    // Decided: as above (DISCUSSION §6, 2026-10-27, O1). P5, #5770 item 3.
    // Before the redesign: body 'SELECT DATEPART([YEAR], GETDATE()) AS [Y]'.
    it('keeps a DATEPART body as written', () => {
        expectExactSlices('WITH Q AS (SELECT DATEPART(YEAR, GETDATE()) AS Y) SELECT * FROM Q', ss);
    });

    // Decided: as above (DISCUSSION §6, 2026-10-27, O1). P5.
    // Before the redesign: body 'SELECT [ID] FROM [Real]' and main 'SELECT [ID] FROM [A]' — brackets added to plain names.
    it('keeps plain SQL Server names unquoted', () => {
        expectExactSlices('WITH A AS (SELECT ID FROM Real) SELECT ID FROM A', ss);
    });
});

// ════════════════════════════════════════════════════════════════════
// P7 — a parse failure is distinguishable from an empty result
// ════════════════════════════════════════════════════════════════════

describe('P7: a parse failure is distinguishable from an empty result', () => {
    const INVALID: ReadonlyArray<readonly [string, string, SQLParserDialect]> = [
        ['garbage (SQL Server)', 'NOT VALID SQL AT ALL %%%', ss],
        ['unbalanced paren (SQL Server)', 'SELECT a FROM t WHERE (b = 1', ss],
        ['garbage (PostgreSQL)', 'NOT VALID SQL AT ALL %%%', pg],
        ['missing select list (PostgreSQL)', 'SELECT FROM WHERE', pg],
    ];
    /** Valid statements with no select list and no column refs, whose `[]` is a true empty result. */
    const VALID_NO_SELECT_LIST: Record<'ss' | 'pg', string> = { ss: 'DELETE FROM Real', pg: 'DELETE FROM real_t' };
    const VALID_NO_COLUMN_REFS = 'SELECT 1';

    const key = (dialect: SQLParserDialect): 'ss' | 'pg' => (dialect === ss ? 'ss' : 'pg');

    it.each(INVALID)('the parse-failure signals that exist today report %s as a failure', (_name, sql, dialect) => {
        expect(new SQLParser(sql, dialect).IsValid).toBe(false);
        expect(SQLParser.Parse(sql, dialect).UsedASTParsing).toBe(false);
    });

    it('the valid baselines parse and are empty', () => {
        expect(SQLParser.ExtractSelectColumns(VALID_NO_SELECT_LIST.ss, ss)).toEqual([]);
        expect(SQLParser.ExtractSelectColumns(VALID_NO_SELECT_LIST.pg, pg)).toEqual([]);
        expect(new SQLParser(VALID_NO_SELECT_LIST.ss, ss).IsValid).toBe(true);
        expect(SQLParser.ExtractColumnRefs(VALID_NO_COLUMN_REFS, ss)).toEqual([]);
        expect(SQLParser.Parse(VALID_NO_COLUMN_REFS, ss).UsedASTParsing).toBe(true);
    });

    // Decided: a failure is distinguishable from an empty result, through an additive checked sibling; the
    // deprecated ExtractSelectColumns keeps returning [] (COMPAT-MAP §1.2 ExtractSelectColumns, DISCUSSION §6,
    // 2026-10-27, O2). P7, #5683. Before the redesign: both calls returned [] and nothing told them apart.
    it.each(INVALID)('ExtractSelectColumnsChecked on %s reports an incomplete read, unlike a valid statement with no select list', (_name, sql, dialect) => {
        expect(SQLParser.ExtractSelectColumns(sql, dialect)).toEqual([]);
        expect(SQLParser.ExtractSelectColumnsChecked(sql, dialect).Complete).toBe(false);
        expect(SQLParser.ExtractSelectColumnsChecked(VALID_NO_COLUMN_REFS, dialect)).toEqual({
            Columns: [{ OutputName: 'EXPR', SourceColumn: 'EXPR', TableQualifier: null, IsExpression: true }], Complete: true, Diagnostics: [],
        });
    });

    // Decided: as above, for ExtractColumnRefs (COMPAT-MAP §1.2, DISCUSSION §6, 2026-10-27). P7, #5683.
    // Before the redesign: both calls returned [].
    it.each(INVALID)('ExtractColumnRefsChecked on %s reports an incomplete read, unlike a valid statement with no column refs', (_name, sql, dialect) => {
        expect(SQLParser.ExtractColumnRefs(sql, dialect)).toEqual([]);
        expect(SQLParser.ExtractColumnRefsChecked(sql, dialect).Complete).toBe(false);
        expect(SQLParser.ExtractColumnRefsChecked(VALID_NO_COLUMN_REFS, dialect)).toEqual({ Columns: [], Complete: true, Diagnostics: [] });
    });
});

// ════════════════════════════════════════════════════════════════════
// P8 — columns and refs for SQL node-sql-parser rejects
// ════════════════════════════════════════════════════════════════════

describe('P8: TRY_*, WITHIN GROUP, COLLATE and FOR JSON subqueries are extracted', () => {
    it('extracts COLLATE in every clause (AST path today)', () => {
        const sql = "SELECT r.Name COLLATE Latin1_General_CI_AS AS n FROM Real r WHERE r.Name COLLATE Latin1_General_CI_AS = 'x' ORDER BY r.Name COLLATE Latin1_General_CI_AS";
        expect(SQLParser.ExtractSelectColumns(sql, ss)).toEqual([
            { OutputName: 'n', SourceColumn: 'Name', TableQualifier: 'r', IsExpression: false },
        ]);
        expect(tableNames(SQLParser.ExtractTableRefs(sql, ss))).toEqual(['Real']);
    });

    it('extracts a single-column FOR JSON PATH subquery', () => {
        const sql = 'SELECT r.ID, (SELECT o.A FROM Other o WHERE o.RID = r.ID FOR JSON PATH) AS kids FROM Real r';
        expect(selectNames(sql, ss)).toEqual(['ID', 'kids']);
    });

    it('extracts TRY_CONVERT select columns', () => {
        expect(selectNames('SELECT TRY_CONVERT(INT, a) AS v, b FROM Real', ss)).toEqual(['v', 'b']);
    });

    it('extracts WITHIN GROUP select columns on PostgreSQL', () => {
        const sql = "SELECT string_agg(name, ',') AS names, percentile_cont(0.5) WITHIN GROUP (ORDER BY x) AS med FROM real_t";
        expect(selectNames(sql, pg)).toEqual(['names', 'med']);
    });

    it('still finds the table of each statement the AST rejects (setup for the pins below)', () => {
        expect(tableNames(SQLParser.ExtractTableRefs('SELECT TRY_CAST(a AS INT) AS v, b FROM Real', ss))).toEqual(['Real']);
        expect(tableNames(SQLParser.ExtractTableRefs('SELECT TRY_PARSE(a AS INT) AS v, b FROM Real', ss))).toEqual(['Real']);
    });

    // Decided: the public extractors return columns for SQL node-sql-parser rejects (DISCUSSION §6, 2026-10-27,
    // node-sql-parser's role (2); COMPAT-MAP §1.2). P8, #5683. Before the redesign: [].
    it('extracts TRY_CAST select columns', () => {
        expect(selectNames('SELECT TRY_CAST(a AS INT) AS v, b FROM Real', ss)).toEqual(['v', 'b']);
    });

    // Decided: as above. P8. Before the redesign: [].
    it('extracts TRY_CAST column refs', () => {
        expect(columnRefNames('SELECT TRY_CAST(a AS INT) AS v, b FROM Real', ss)).toEqual(['a', 'b']);
    });

    // Decided: as above. P8. Before the redesign: [].
    it('extracts TRY_PARSE select columns', () => {
        expect(selectNames('SELECT TRY_PARSE(a AS INT) AS v, b FROM Real', ss)).toEqual(['v', 'b']);
    });

    // Decided: column refs are identifier paths, not type names (COMPAT-MAP §1.2 ExtractColumnRefs). P8.
    // Before the redesign: ['INT', 'a', 'b'] — the TRY_CONVERT target type is reported as a column.
    it('does not report the TRY_CONVERT target type as a column ref', () => {
        expect(columnRefNames('SELECT TRY_CONVERT(INT, a) AS v, b FROM Real', ss)).toEqual(['a', 'b']);
    });

    // Decided: as above. P8, #5770 item 10. Before the redesign: [].
    it('extracts STRING_AGG … WITHIN GROUP select columns on SQL Server', () => {
        const sql = "SELECT STRING_AGG(Name, ',') WITHIN GROUP (ORDER BY Name) AS names FROM Real";
        expect(selectNames(sql, ss)).toEqual(['names']);
    });

    // Decided: column refs come from every clause, including WITHIN GROUP's ORDER BY (COMPAT-MAP §1.2). P8.
    // Before the redesign: ['name'] — x is missing.
    it('reads the WITHIN GROUP ORDER BY column as a ref on PostgreSQL', () => {
        const sql = "SELECT string_agg(name, ',') AS names, percentile_cont(0.5) WITHIN GROUP (ORDER BY x) AS med FROM real_t";
        expect(columnRefNames(sql, pg)).toEqual(expect.arrayContaining(['name', 'x']));
    });

    // Decided: as above. P8, #5683. Before the redesign: [] — a multi-column FOR JSON PATH subquery sends the whole statement to the fallback.
    it('extracts the select columns around a multi-column FOR JSON PATH subquery', () => {
        const sql = 'SELECT r.ID, (SELECT o.A, o.B FROM Other o WHERE o.RID = r.ID FOR JSON PATH) AS kids FROM Real r';
        expect(selectNames(sql, ss)).toEqual(['ID', 'kids']);
    });
});

// ════════════════════════════════════════════════════════════════════
// P12 — provenance (AST vs fallback) is accurate
// ════════════════════════════════════════════════════════════════════

describe('P12: UsedASTParsing is accurate', () => {
    const CTE_PG = 'WITH q AS (SELECT "ID" FROM "__mj"."vwUsers") SELECT "ID" FROM q';
    const BRACKET_CTE_SS = 'WITH [My CTE] AS (SELECT ID FROM Real) SELECT ID FROM [My CTE]';

    it('reports the AST path for a plain SQL Server CTE and for a plain SELECT', () => {
        expect(SQLParser.ExtractCTEs('WITH A AS (SELECT ID FROM Real) SELECT ID FROM A', ss)?.UsedASTParsing).toBe(true);
        expect(SQLParser.Parse('SELECT ID FROM Real', ss).UsedASTParsing).toBe(true);
        expect(SQLParser.Parse('SELECT "ID" FROM "Real"', pg).UsedASTParsing).toBe(true);
    });

    it('the CTE-headed PostgreSQL query and the bracket CTE name are SQL the parser reads (setup)', () => {
        expect(parsesDirectly(CTE_PG, pg)).toBe(true);
        expect(new SQLParser(BRACKET_CTE_SS, ss).IsValid).toBe(true);
    });

    // Decided: UsedASTParsing means "the structural parse was complete" (COMPAT-MAP §1.2 Parse; DISCUSSION §6, 2026-10-27). P12, #5770.
    // Before the redesign: false — extractCTEsViaAST reads TransactSQL's AST shape, so every CTE-headed PostgreSQL query reports the fallback.
    it('reports a complete parse for a CTE-headed PostgreSQL query in ExtractCTEs', () => {
        expect(SQLParser.ExtractCTEs(CTE_PG, pg)?.UsedASTParsing).toBe(true);
    });

    // Decided: as above. P12, #5770. Before the redesign: false — the bracket-quoted CTE name is read by the paren scan.
    it('reports a complete parse for a bracket-quoted CTE name in ExtractCTEs', () => {
        expect(SQLParser.ExtractCTEs(BRACKET_CTE_SS, ss)?.UsedASTParsing).toBe(true);
    });

    // Decided: as above. P12. Before the redesign: UsedASTParsing false, and Tables ['Real', 'My'] (alias 'CTE') from the regex.
    it('reports a complete parse, and the right tables, for a bracket-quoted CTE name in Parse()', () => {
        const result = SQLParser.Parse(BRACKET_CTE_SS, ss);
        expect({ UsedASTParsing: result.UsedASTParsing, Tables: tableNames(result.Tables) })
            .toEqual({ UsedASTParsing: true, Tables: ['Real'] });
    });
});
