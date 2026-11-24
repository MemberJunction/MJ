/**
 * Shared per-database index catalog queries and row mapping (SQL Server, PostgreSQL, MySQL).
 *
 * Used by both CodeGenLib (for syncing `EntityIndex` / `EntityIndexField` metadata) and
 * DBAutoDoc (for reading existing indexes in its drivers and Index Advisor plugin).
 * Kept pure and driver-agnostic so row mapping and SQL builders can be unit-tested without
 * a live database connection.
 */

import { EscapeSQLString } from '@memberjunction/global';

/**
 * Placeholder used when a consumer flattens key fields to a `string[]` and encounters an
 * expression key part. Cannot collide with a real column name in prefix comparisons.
 */
export const EXPRESSION_KEY_PART = '(expression)';

/** Normalized cross-database index type value list (matches `EntityIndex.IndexType` CHECK). */
export type NormalizedIndexType =
    | 'BTree'
    | 'Hash'
    | 'FullText'
    | 'Columnstore'
    | 'GIN'
    | 'GiST'
    | 'BRIN'
    | 'Spatial'
    | 'XML'
    | 'Other';

/** Role of a field within an index (matches `EntityIndexField.Role` CHECK). */
export type IndexFieldRole = 'Key' | 'Include';

/** Sort direction of a key field within an index (matches `EntityIndexField.SortDirection` CHECK). */
export type IndexSortDirection = 'ASC' | 'DESC';

/** One column or expression entry within a database index. */
export interface CatalogIndexField {
    /** Column name on the base table, or null when this key part is an expression. */
    ColumnName: string | null;
    /** Expression text when `ColumnName` is null (e.g. `lower(email)`), or null if unavailable. */
    Expression: string | null;
    /** 1-based ordinal position within the index (key parts first, then included columns). */
    Sequence: number;
    /** Whether this entry is a key column/expression or a non-key INCLUDE column. */
    Role: IndexFieldRole;
    /** Sort direction (`ASC` or `DESC`). Non-key INCLUDE columns default to `ASC`. */
    SortDirection: IndexSortDirection;
}

/** Normalized representation of a single database index read from a system catalog. */
export interface CatalogIndex {
    SchemaName: string;
    TableName: string;
    IndexName: string;
    IndexType: NormalizedIndexType;
    /** Database-native index type/access method (e.g. `NONCLUSTERED`, `btree`, `gin`, `BTREE`). */
    NativeType: string;
    IsUnique: boolean;
    IsPrimaryKey: boolean;
    IsClustered: boolean;
    /** Partial/filtered index predicate when present; null otherwise. */
    FilterDefinition: string | null;
    /** True when one or more key parts are expressions rather than plain table columns. */
    HasExpressions: boolean;
    /** Key columns/expressions followed by INCLUDE columns, ordered by `Sequence`. */
    Fields: CatalogIndexField[];
}

/** Filter options for catalog query builders. */
export interface IndexCatalogQueryOptions {
    /** Restrict to a single schema (escaped into the query). */
    SchemaName?: string;
    /** Exclude schemas in this list (escaped into the query). */
    ExcludeSchemas?: string[];
}

/**
 * Maps a database-native index type or access method name (SQL Server `type_desc`,
 * PostgreSQL `pg_am.amname`, MySQL `INDEX_TYPE`) to MJ's normalized {@link NormalizedIndexType}.
 */
export function NormalizeIndexType(nativeType: string | null | undefined): NormalizedIndexType {
    const normalized = (nativeType ?? '').trim().toUpperCase();
    if (!normalized) {
        return 'Other';
    }
    if (normalized === 'BTREE' || normalized === 'CLUSTERED' || normalized === 'NONCLUSTERED') {
        return 'BTree';
    }
    if (normalized === 'HASH' || normalized === 'NONCLUSTERED HASH') {
        return 'Hash';
    }
    if (normalized === 'FULLTEXT' || normalized === 'FULL-TEXT') {
        return 'FullText';
    }
    if (normalized.includes('COLUMNSTORE')) {
        return 'Columnstore';
    }
    if (normalized === 'GIN') {
        return 'GIN';
    }
    if (normalized === 'GIST' || normalized === 'SPGIST' || normalized === 'SP-GIST') {
        return 'GiST';
    }
    if (normalized === 'BRIN') {
        return 'BRIN';
    }
    if (normalized === 'SPATIAL' || normalized === 'RTREE') {
        return 'Spatial';
    }
    if (normalized === 'XML') {
        return 'XML';
    }
    return 'Other';
}

function indexGroupKey(schemaName: string, tableName: string, indexName: string): string {
    return `${schemaName}\u0000${tableName}\u0000${indexName}`;
}

function toBool(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();
        return lower === 'true' || lower === '1' || lower === 't';
    }
    return false;
}

function normalizeFilter(value: string | null | undefined): string | null {
    if (value == null) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

// ─── SQL Server ─────────────────────────────────────────────────────────────────

/** One row of {@link BuildSQLServerIndexCatalogQuery}: one column of one index (or null column for columnstore). */
export interface SQLServerIndexCatalogRow {
    SchemaName: string;
    TableName: string;
    IndexName: string;
    NativeType: string;
    IsUnique: boolean | number;
    IsPrimaryKey: boolean | number;
    IsClustered: boolean | number;
    FilterDefinition: string | null;
    ColumnName: string | null;
    IsIncludedColumn: boolean | number | null;
    IsDescendingKey: boolean | number | null;
    KeyOrdinal: number | null;
    IndexColumnID: number | null;
}

/**
 * Builds a SQL Server catalog query returning all enabled, non-hypothetical relational indexes
 * (heaps excluded) across user tables, one row per index column.
 */
export function BuildSQLServerIndexCatalogQuery(options: IndexCatalogQueryOptions = {}): string {
    const conditions: string[] = [
        'i.type > 0',
        'i.is_hypothetical = 0',
        'i.is_disabled = 0',
    ];
    if (options.SchemaName) {
        conditions.push(`s.name = N'${EscapeSQLString(options.SchemaName)}'`);
    }
    if (options.ExcludeSchemas && options.ExcludeSchemas.length > 0) {
        const list = options.ExcludeSchemas.map((s) => `N'${EscapeSQLString(s)}'`).join(', ');
        conditions.push(`s.name NOT IN (${list})`);
    }

    return `
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    i.name AS IndexName,
    i.type_desc AS NativeType,
    i.is_unique AS IsUnique,
    i.is_primary_key AS IsPrimaryKey,
    CAST(CASE WHEN i.type IN (1, 5) THEN 1 ELSE 0 END AS BIT) AS IsClustered,
    i.filter_definition AS FilterDefinition,
    c.name AS ColumnName,
    ic.is_included_column AS IsIncludedColumn,
    ic.is_descending_key AS IsDescendingKey,
    CAST(ic.key_ordinal AS INT) AS KeyOrdinal,
    CAST(ic.index_column_id AS INT) AS IndexColumnID
FROM sys.indexes i
INNER JOIN sys.tables t ON t.object_id = i.object_id
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
LEFT JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE ${conditions.join('\n  AND ')}
ORDER BY
    s.name,
    t.name,
    i.name,
    ISNULL(ic.is_included_column, 0),
    CASE WHEN ISNULL(ic.is_included_column, 0) = 0 THEN ISNULL(ic.key_ordinal, 0) ELSE ISNULL(ic.index_column_id, 0) END
`.trim();
}

interface SqlServerPendingField {
    ColumnName: string;
    IsIncluded: boolean;
    IsDescending: boolean;
    KeyOrdinal: number;
    IndexColumnID: number;
}

/**
 * Groups SQL Server per-column rows from {@link BuildSQLServerIndexCatalogQuery} into normalized
 * {@link CatalogIndex} entries with deterministic field ordering (Key columns by `KeyOrdinal`,
 * then Include columns by `IndexColumnID`).
 */
export function MapSQLServerIndexCatalogRows(rows: SQLServerIndexCatalogRow[]): CatalogIndex[] {
    const groups = new Map<string, { Index: CatalogIndex; Pending: SqlServerPendingField[] }>();

    for (const r of rows) {
        const key = indexGroupKey(r.SchemaName, r.TableName, r.IndexName);
        let entry = groups.get(key);
        if (!entry) {
            entry = {
                Index: {
                    SchemaName: r.SchemaName,
                    TableName: r.TableName,
                    IndexName: r.IndexName,
                    IndexType: NormalizeIndexType(r.NativeType),
                    NativeType: r.NativeType,
                    IsUnique: toBool(r.IsUnique),
                    IsPrimaryKey: toBool(r.IsPrimaryKey),
                    IsClustered: toBool(r.IsClustered),
                    FilterDefinition: normalizeFilter(r.FilterDefinition),
                    HasExpressions: false,
                    Fields: [],
                },
                Pending: [],
            };
            groups.set(key, entry);
        }

        if (r.ColumnName !== null) {
            entry.Pending.push({
                ColumnName: r.ColumnName,
                IsIncluded: toBool(r.IsIncludedColumn),
                IsDescending: toBool(r.IsDescendingKey),
                KeyOrdinal: Number(r.KeyOrdinal ?? 0),
                IndexColumnID: Number(r.IndexColumnID ?? 0),
            });
        }
    }

    const result: CatalogIndex[] = [];
    for (const { Index, Pending } of groups.values()) {
        Pending.sort((a, b) => {
            if (a.IsIncluded !== b.IsIncluded) {
                return a.IsIncluded ? 1 : -1;
            }
            return a.IsIncluded
                ? a.IndexColumnID - b.IndexColumnID
                : a.KeyOrdinal - b.KeyOrdinal;
        });
        Index.Fields = Pending.map((f, idx) => ({
            ColumnName: f.ColumnName,
            Expression: null,
            Sequence: idx + 1,
            Role: f.IsIncluded ? 'Include' : 'Key',
            SortDirection: f.IsIncluded ? 'ASC' : (f.IsDescending ? 'DESC' : 'ASC'),
        }));
        result.push(Index);
    }
    return result;
}

// ─── PostgreSQL ─────────────────────────────────────────────────────────────────

/** One row of {@link BuildPostgreSQLIndexCatalogQuery} / {@link POSTGRESQL_INDEX_CATALOG_QUERY}. */
export interface PostgreSQLIndexCatalogRow {
    SchemaName: string;
    TableName: string;
    IndexName: string;
    NativeType: string;
    IsUnique: boolean;
    IsPrimaryKey: boolean;
    IsClustered: boolean;
    FilterDefinition: string | null;
    HasExpressions: boolean;
    ColumnName: string | null;
    Expression: string | null;
    Sequence: number | null;
    IsIncluded: boolean | null;
    IsDescending: boolean | null;
}

function buildPostgreSQLIndexCatalogSQL(whereClauses: string[]): string {
    return `
SELECT
    n.nspname AS "SchemaName",
    t.relname AS "TableName",
    i.relname AS "IndexName",
    am.amname AS "NativeType",
    ix.indisunique AS "IsUnique",
    ix.indisprimary AS "IsPrimaryKey",
    ix.indisclustered AS "IsClustered",
    pg_get_expr(ix.indpred, ix.indrelid) AS "FilterDefinition",
    (ix.indexprs IS NOT NULL) AS "HasExpressions",
    CASE WHEN k.attnum = 0 THEN NULL ELSE a.attname::text END AS "ColumnName",
    CASE WHEN k.attnum = 0 THEN pg_get_indexdef(ix.indexrelid, k.ord::int, true) ELSE NULL END AS "Expression",
    k.ord::int AS "Sequence",
    (k.ord > ix.indnkeyatts) AS "IsIncluded",
    CASE
        WHEN k.ord <= ix.indnkeyatts THEN ((ix.indoption[k.ord - 1] & 1) = 1)
        ELSE false
    END AS "IsDescending"
FROM pg_index ix
INNER JOIN pg_class i ON i.oid = ix.indexrelid
INNER JOIN pg_class t ON t.oid = ix.indrelid
INNER JOIN pg_namespace n ON n.oid = t.relnamespace
INNER JOIN pg_am am ON am.oid = i.relam
LEFT JOIN LATERAL unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) ON true
LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum AND k.attnum > 0
WHERE ${whereClauses.join('\n  AND ')}
ORDER BY n.nspname, t.relname, i.relname, k.ord
`.trim();
}

/** Parameterized PostgreSQL catalog query for all valid indexes on ordinary/partitioned tables of schema `$1`. */
export const POSTGRESQL_INDEX_CATALOG_QUERY = buildPostgreSQLIndexCatalogSQL([
    'n.nspname = $1',
    "t.relkind IN ('r', 'p')",
    'ix.indisvalid',
    'ix.indisready',
]);

/**
 * Builds a PostgreSQL catalog query returning all valid indexes on ordinary and partitioned tables,
 * one row per index key/include position, capturing expression text and per-key sort direction.
 */
export function BuildPostgreSQLIndexCatalogQuery(options: IndexCatalogQueryOptions = {}): string {
    const conditions: string[] = [
        "t.relkind IN ('r', 'p')",
        'ix.indisvalid',
        'ix.indisready',
        "n.nspname NOT IN ('pg_catalog', 'information_schema')",
    ];
    if (options.SchemaName) {
        conditions.push(`n.nspname = '${EscapeSQLString(options.SchemaName)}'`);
    }
    if (options.ExcludeSchemas && options.ExcludeSchemas.length > 0) {
        const list = options.ExcludeSchemas.map((s) => `'${EscapeSQLString(s)}'`).join(', ');
        conditions.push(`n.nspname NOT IN (${list})`);
    }
    return buildPostgreSQLIndexCatalogSQL(conditions);
}

/**
 * Groups PostgreSQL per-position rows into normalized {@link CatalogIndex} entries, preserving
 * key/expression ordering, `INCLUDE` roles, and `ASC`/`DESC` sort directions.
 */
export function MapPostgreSQLIndexCatalogRows(rows: PostgreSQLIndexCatalogRow[]): CatalogIndex[] {
    const groups = new Map<string, CatalogIndex>();

    for (const r of rows) {
        const key = indexGroupKey(r.SchemaName, r.TableName, r.IndexName);
        let index = groups.get(key);
        if (!index) {
            index = {
                SchemaName: r.SchemaName,
                TableName: r.TableName,
                IndexName: r.IndexName,
                IndexType: NormalizeIndexType(r.NativeType),
                NativeType: r.NativeType,
                IsUnique: toBool(r.IsUnique),
                IsPrimaryKey: toBool(r.IsPrimaryKey),
                IsClustered: toBool(r.IsClustered),
                FilterDefinition: normalizeFilter(r.FilterDefinition),
                HasExpressions: toBool(r.HasExpressions),
                Fields: [],
            };
            groups.set(key, index);
        }

        if (r.Sequence != null) {
            const isIncluded = toBool(r.IsIncluded);
            const columnName = r.ColumnName ?? null;
            const expression = columnName === null ? normalizeFilter(r.Expression) : null;
            if (columnName === null) {
                index.HasExpressions = true;
            }
            index.Fields.push({
                ColumnName: columnName,
                Expression: expression,
                Sequence: Number(r.Sequence),
                Role: isIncluded ? 'Include' : 'Key',
                SortDirection: isIncluded ? 'ASC' : (toBool(r.IsDescending) ? 'DESC' : 'ASC'),
            });
        }
    }

    for (const index of groups.values()) {
        index.Fields.sort((a, b) => a.Sequence - b.Sequence);
    }
    return [...groups.values()];
}

// ─── MySQL / MariaDB ────────────────────────────────────────────────────────────

/** One row of {@link MYSQL_INDEX_CATALOG_QUERY}: one column of one index. */
export interface MySQLIndexCatalogRow {
    SchemaName: string;
    TableName: string;
    IndexName: string;
    NonUnique: number | string;
    NativeType: string;
    ColumnName: string | null;
    Sequence: number;
    Collation?: string | null;
}

/**
 * Index columns of schema `?`, one row each. `EXPRESSION` is deliberately not selected
 * (MariaDB lacks it); a functional key part shows up as a NULL column name.
 */
export const MYSQL_INDEX_CATALOG_QUERY = `
SELECT
    TABLE_SCHEMA AS SchemaName,
    TABLE_NAME AS TableName,
    INDEX_NAME AS IndexName,
    NON_UNIQUE AS NonUnique,
    INDEX_TYPE AS NativeType,
    COLUMN_NAME AS ColumnName,
    SEQ_IN_INDEX AS Sequence,
    COLLATION AS Collation
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = ?
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`.trim();

/**
 * Groups MySQL / MariaDB `information_schema.STATISTICS` rows into normalized {@link CatalogIndex}
 * entries, preserving functional key part positions and sort direction (`COLLATION = 'D'` → `DESC`).
 */
export function MapMySQLIndexCatalogRows(rows: MySQLIndexCatalogRow[]): CatalogIndex[] {
    const groups = new Map<string, CatalogIndex>();
    const ordered = [...rows].sort((a, b) => Number(a.Sequence) - Number(b.Sequence));

    for (const r of ordered) {
        const key = indexGroupKey(r.SchemaName, r.TableName, r.IndexName);
        let index = groups.get(key);
        if (!index) {
            const isPrimary = r.IndexName === 'PRIMARY';
            index = {
                SchemaName: r.SchemaName,
                TableName: r.TableName,
                IndexName: r.IndexName,
                IndexType: NormalizeIndexType(r.NativeType),
                NativeType: r.NativeType,
                IsUnique: Number(r.NonUnique) === 0,
                IsPrimaryKey: isPrimary,
                IsClustered: isPrimary,
                FilterDefinition: null,
                HasExpressions: false,
                Fields: [],
            };
            groups.set(key, index);
        }

        const columnName = r.ColumnName ?? null;
        if (columnName === null) {
            index.HasExpressions = true;
        }
        const sortDirection: IndexSortDirection = r.Collation?.toUpperCase() === 'D' ? 'DESC' : 'ASC';
        index.Fields.push({
            ColumnName: columnName,
            Expression: null,
            Sequence: Number(r.Sequence),
            Role: 'Key',
            SortDirection: sortDirection,
        });
    }

    return [...groups.values()];
}
