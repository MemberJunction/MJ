/**
 * sqlpipe-schema.ts — the two row sources the SQL pipeline scenario matrix runs over, and the SQL
 * text helpers its builders share.
 *
 * - **mock**: schema `mjit_sqlpipe` (plus `mjit_sqlpipe_ext`), built and dropped by the bundle:
 *   an `Account` table with skewed (`Region`) and uniform (`Score`) data, a self-reference tree
 *   (`ParentID`), wide types (decimal(18,4), nvarchar(max)/text, bigint, float, uuid,
 *   datetimeoffset/timestamptz), a table named with a space (`[Order Line]`) in the second schema,
 *   a view over a view, and a table-valued / set-returning function. Names are PascalCase and
 *   created quoted on PostgreSQL, so they are mixed-case there.
 * - **core**: the MJ view `__mj.vwEntityFields`, restricted to two entities' fields, so its
 *   columns bind to `MJ: Entity Fields` fields.
 *
 * Query text is written once with logical column tokens (`{s.Score}`) and bracket-quoted names;
 * {@link Sql.Text} maps each token to the source's physical column and converts brackets to
 * double quotes on PostgreSQL, outside string literals only, so literal values are never touched.
 */
import type { DatabasePlatform } from '@memberjunction/core';

/** The two row sources. */
export type SchemaKey = 'mock' | 'core';

/** The logical columns every scenario shape reads. */
export type LogicalColumn = 'ID' | 'Name' | 'Region' | 'Score' | 'Balance' | 'OpenedAt' | 'ParentID' | 'Flag';

export const MOCK_SCHEMA = 'mjit_sqlpipe';
export const MOCK_EXT_SCHEMA = 'mjit_sqlpipe_ext';
export const MOCK_ROWS = 300;

/** A row source: where rows come from, its physical column names, and how numbers scale on it. */
export interface RowSource {
    readonly Key: SchemaKey;
    /** The FROM item, bracket-quoted. */
    readonly Table: string;
    /** Physical column per logical column; a missing entry means the source has none. */
    readonly Columns: Readonly<Partial<Record<LogicalColumn, string>>>;
    /** A predicate (alias `s`) every scenario ANDs in, restricting the rows read. */
    readonly BasePredicate: string;
    /** The core entity whose fields the columns bind to, when the source is an entity view. */
    readonly EntityName: string | null;
    /** Score thresholds are scaled by this, since `Score` spans 0–99 on mock and ~1–25 on core. */
    readonly ScoreScale: number;
    /** A `Region` value that matches many rows, and a `Name` prefix that matches some. */
    readonly RegionValue: string;
    readonly NamePrefix: string;
    /** An ISO date that splits (mock) or keeps (core) the rows by `OpenedAt`. */
    readonly SinceValue: string;
}

export const MOCK_SOURCE: RowSource = {
    Key: 'mock',
    Table: `${MOCK_SCHEMA}.[Account]`,
    Columns: { ID: 'ID', Name: 'Name', Region: 'Region', Score: 'Score', Balance: 'Balance', OpenedAt: 'OpenedAt', ParentID: 'ParentID', Flag: 'Flag' },
    BasePredicate: '1 = 1',
    EntityName: null,
    ScoreScale: 1,
    RegionValue: 'North',
    NamePrefix: 'Acct 01',
    SinceValue: '2024-06-01',
};

export const CORE_SOURCE: RowSource = {
    Key: 'core',
    Table: '__mj.[vwEntityFields]',
    Columns: { ID: 'ID', Name: 'Name', Region: 'Type', Score: 'Sequence', Balance: 'Length', OpenedAt: '__mj_CreatedAt', Flag: 'AllowsNull' },
    BasePredicate: "{s.Entity} IN ('MJ: Query Fields', 'MJ: Query Parameters')",
    EntityName: 'MJ: Entity Fields',
    ScoreScale: 0.25,
    RegionValue: 'nvarchar',
    NamePrefix: 'Is',
    SinceValue: '2000-01-01',
};

export function SourceFor(key: SchemaKey): RowSource {
    return key === 'core' ? CORE_SOURCE : MOCK_SOURCE;
}

/** Platform-aware SQL text for one source. */
export class Sql {
    constructor(readonly Platform: DatabasePlatform, readonly Source: RowSource) {}

    /** A score threshold on this source's scale. */
    N(value: number): number {
        return Math.round(value * this.Source.ScoreScale);
    }

    /**
     * Final SQL for the platform: `{alias.Logical}` tokens become `alias.[Physical]` (a column the
     * source lacks is an error), then brackets become double quotes on PostgreSQL outside strings.
     */
    Text(sql: string): string {
        const mapped = sql.replace(/\{([a-z]\w*)\.([A-Z_]\w*)\}/g, (_m, alias: string, column: string) => {
            const physical = this.Source.Columns[column as LogicalColumn] ?? (column === 'Entity' ? 'Entity' : undefined);
            if (!physical) throw new Error(`source ${this.Source.Key} has no column ${column}`);
            return `${alias}.[${physical}]`;
        });
        return this.Platform === 'postgresql' ? BracketsToDoubleQuotes(mapped) : mapped;
    }

    /** A string literal: N'…' on SQL Server, '…' on PostgreSQL, quotes doubled. */
    Literal(value: string): string {
        const body = value.replace(/'/g, "''");
        return this.Platform === 'postgresql' ? `'${body}'` : `N'${body}'`;
    }

    /** The source's base predicate, read through `alias`. */
    Base(alias: string): string {
        return this.Source.BasePredicate.replace(/\{s\./g, () => `{${alias}.`);
    }

    /** The physical columns of the source, comma-separated, read through `alias`. */
    AllColumns(alias: string): string {
        return (Object.keys(this.Source.Columns) as LogicalColumn[]).map(c => `{${alias}.${c}}`).join(', ');
    }

    /** `SELECT TOP n` on SQL Server, nothing on PostgreSQL (see {@link LimitSuffix}). */
    TopPrefix(n: number): string {
        return this.Platform === 'postgresql' ? '' : `TOP ${n} `;
    }

    /** ` LIMIT n` on PostgreSQL, nothing on SQL Server. */
    LimitSuffix(n: number): string {
        return this.Platform === 'postgresql' ? ` LIMIT ${n}` : '';
    }

    /** `WITH` or `WITH RECURSIVE`, as the platform needs for a recursive CTE. */
    WithRecursive(): string {
        return this.Platform === 'postgresql' ? 'WITH RECURSIVE' : 'WITH';
    }
}

/** Turns `[Name]` into `"Name"` outside single-quoted string literals and line comments' strings. */
export function BracketsToDoubleQuotes(sql: string): string {
    let out = '';
    let inString = false;
    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        if (ch === "'") inString = !inString;
        if (!inString && ch === '[') {
            const end = sql.indexOf(']', i);
            if (end > i) {
                out += `"${sql.slice(i + 1, end)}"`;
                i = end;
                continue;
            }
        }
        out += ch;
    }
    return out;
}

// ─── The mock schema ───────────────────────────────────────────────────────

/** One mock `Account` row, generated from its ID. */
export interface MockAccount {
    ID: number;
    Name: string;
    Region: string | null;
    Score: number;
    Balance: number | null;
    OpenedAt: string;
    Notes: string;
    Flag: boolean;
    ParentID: number | null;
    Ref: string;
    BigVal: number;
    Ratio: number;
}

/** Notes values that stress quoting: an apostrophe, `%`, `_`, brackets, unicode, a backslash, a tag. */
const NOTES = ["plain", "O'Brien's", '100% sure', 'under_score', '[bracketed]', 'Ñandú 東京', 'back\\slash', '{{ not a tag }}'];

/** 70% North, 20% South, 9% East, every 25th row NULL: a skewed column. */
function regionOf(id: number): string | null {
    if (id % 25 === 0) return null;
    const bucket = id % 10;
    return bucket < 7 ? 'North' : bucket < 9 ? 'South' : 'East';
}

export function MockAccounts(): MockAccount[] {
    return Array.from({ length: MOCK_ROWS }, (_, index) => {
        const id = index + 1;
        const offsetHours = (id % 5) - 2;
        const day = new Date(Date.UTC(2024, 0, 1) + id * 86_400_000 * 2);
        return {
            ID: id,
            Name: `Acct ${String(id).padStart(3, '0')}`,
            Region: regionOf(id),
            Score: (id * 37) % 100,
            Balance: id % 7 === 0 ? null : Math.round(id * 123.4567 * 10_000) / 10_000,
            OpenedAt: `${day.toISOString().slice(0, 10)}T08:30:00${offsetHours >= 0 ? '+' : '-'}0${Math.abs(offsetHours)}:00`,
            Notes: NOTES[id % NOTES.length],
            Flag: id % 3 !== 0,
            ParentID: id <= 10 ? null : Math.floor((id - 1) / 10),
            Ref: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
            BigVal: 9_000_000_000 + id,
            Ratio: id / 8,
        };
    });
}

interface MockTypes { Text: string; Max: string; Decimal: string; Stamp: string; Bit: string; Uuid: string; Float: string }

function mockTypes(platform: DatabasePlatform): MockTypes {
    return platform === 'postgresql'
        ? { Text: 'VARCHAR', Max: 'TEXT', Decimal: 'NUMERIC', Stamp: 'TIMESTAMPTZ', Bit: 'BOOLEAN', Uuid: 'UUID', Float: 'DOUBLE PRECISION' }
        : { Text: 'NVARCHAR', Max: 'NVARCHAR(MAX)', Decimal: 'DECIMAL', Stamp: 'DATETIMEOFFSET', Bit: 'BIT', Uuid: 'UNIQUEIDENTIFIER', Float: 'FLOAT' };
}

function createTableStatements(sql: Sql): string[] {
    const t = mockTypes(sql.Platform);
    return [
        `CREATE TABLE ${MOCK_SCHEMA}.[Account] ([ID] INTEGER NOT NULL PRIMARY KEY, [Name] ${t.Text}(60) NOT NULL, [Region] ${t.Text}(20) NULL, ` +
            `[Score] INTEGER NOT NULL, [Balance] ${t.Decimal}(18,4) NULL, [OpenedAt] ${t.Stamp} NOT NULL, [Notes] ${t.Max} NULL, [Flag] ${t.Bit} NOT NULL, ` +
            `[ParentID] INTEGER NULL, [Ref] ${t.Uuid} NOT NULL, [BigVal] BIGINT NOT NULL, [Ratio] ${t.Float} NOT NULL)`,
        `CREATE TABLE ${MOCK_EXT_SCHEMA}.[Order Line] ([Line No] INTEGER NOT NULL PRIMARY KEY, [AccountID] INTEGER NOT NULL, [Qty] INTEGER NOT NULL, [Kind] VARCHAR(10) NOT NULL)`,
        `CREATE VIEW ${MOCK_SCHEMA}.[vwAccountBase] AS SELECT [ID], [Name], [Region], [Score], [Balance] FROM ${MOCK_SCHEMA}.[Account] WHERE [Flag] = ${sql.Platform === 'postgresql' ? 'TRUE' : '1'}`,
        `CREATE VIEW ${MOCK_SCHEMA}.[vwAccountTop] AS SELECT [ID], [Name], [Score] FROM ${MOCK_SCHEMA}.[vwAccountBase] WHERE [Score] >= 50`,
        createFunctionStatement(sql),
    ].map(s => sql.Text(s));
}

function createFunctionStatement(sql: Sql): string {
    if (sql.Platform === 'postgresql') {
        return `CREATE FUNCTION ${MOCK_SCHEMA}.[fnAccountsInRegion](p_region VARCHAR) RETURNS TABLE ([ID] INTEGER, [Name] VARCHAR(60), [Score] INTEGER) ` +
            `LANGUAGE sql STABLE AS $$ SELECT a.[ID], a.[Name], a.[Score] FROM ${MOCK_SCHEMA}.[Account] a WHERE a.[Region] = p_region $$`;
    }
    return `CREATE FUNCTION ${MOCK_SCHEMA}.[fnAccountsInRegion](@Region NVARCHAR(20)) RETURNS TABLE AS RETURN ` +
        `SELECT a.[ID], a.[Name], a.[Score] FROM ${MOCK_SCHEMA}.[Account] a WHERE a.[Region] = @Region`;
}

function accountValues(sql: Sql, row: MockAccount): string {
    const bool = (b: boolean) => sql.Platform === 'postgresql' ? (b ? 'TRUE' : 'FALSE') : (b ? '1' : '0');
    const text = (v: string | null) => v === null ? 'NULL' : sql.Literal(v);
    return `(${row.ID}, ${text(row.Name)}, ${text(row.Region)}, ${row.Score}, ${row.Balance ?? 'NULL'}, '${row.OpenedAt}', ${text(row.Notes)}, ` +
        `${bool(row.Flag)}, ${row.ParentID ?? 'NULL'}, '${row.Ref}', ${row.BigVal}, ${row.Ratio})`;
}

function insertStatements(sql: Sql): string[] {
    const rows = MockAccounts();
    const statements: string[] = [];
    for (let i = 0; i < rows.length; i += 100) {
        statements.push(sql.Text(`INSERT INTO ${MOCK_SCHEMA}.[Account] ([ID], [Name], [Region], [Score], [Balance], [OpenedAt], [Notes], [Flag], [ParentID], [Ref], [BigVal], [Ratio]) VALUES `) +
            rows.slice(i, i + 100).map(r => accountValues(sql, r)).join(', '));
    }
    const lines = rows.filter(r => r.ID % 4 === 0).map(r => `(${r.ID * 10}, ${r.ID}, ${(r.ID % 9) + 1}, '${r.ID % 2 === 0 ? 'std' : 'rush'}')`);
    statements.push(sql.Text(`INSERT INTO ${MOCK_EXT_SCHEMA}.[Order Line] ([Line No], [AccountID], [Qty], [Kind]) VALUES `) + lines.join(', '));
    return statements;
}

function createSchema(platform: DatabasePlatform, schema: string): string {
    return platform === 'postgresql' ? `CREATE SCHEMA ${schema}` : `EXEC('CREATE SCHEMA ${schema}')`;
}

/** Statements that create and fill the mock schemas. */
export function CreateMockSchemaStatements(platform: DatabasePlatform): string[] {
    const sql = new Sql(platform, MOCK_SOURCE);
    return [createSchema(platform, MOCK_SCHEMA), createSchema(platform, MOCK_EXT_SCHEMA), ...createTableStatements(sql), ...insertStatements(sql)];
}

/** Statements that drop the mock schemas and everything in them (safe when absent). */
export function DropMockSchemaStatements(platform: DatabasePlatform): string[] {
    if (platform === 'postgresql') return [`DROP SCHEMA IF EXISTS ${MOCK_SCHEMA} CASCADE`, `DROP SCHEMA IF EXISTS ${MOCK_EXT_SCHEMA} CASCADE`];
    return [
        `DROP VIEW IF EXISTS ${MOCK_SCHEMA}.vwAccountTop`, `DROP VIEW IF EXISTS ${MOCK_SCHEMA}.vwAccountBase`,
        `DROP VIEW IF EXISTS ${MOCK_SCHEMA}.zz_probe`, `DROP FUNCTION IF EXISTS ${MOCK_SCHEMA}.fnAccountsInRegion`,
        `DROP TABLE IF EXISTS ${MOCK_SCHEMA}.Account`, `DROP TABLE IF EXISTS ${MOCK_EXT_SCHEMA}.[Order Line]`,
        `IF SCHEMA_ID('${MOCK_SCHEMA}') IS NOT NULL EXEC('DROP SCHEMA ${MOCK_SCHEMA}')`,
        `IF SCHEMA_ID('${MOCK_EXT_SCHEMA}') IS NOT NULL EXEC('DROP SCHEMA ${MOCK_EXT_SCHEMA}')`,
    ];
}
