/**
 * Describing a statement on PostgreSQL: the statement runs as `SELECT * FROM (<sql>) _q LIMIT 0`
 * inside a read-only transaction that is rolled back, with JIT off (JIT can take a second even
 * under `LIMIT 0`) and a statement timeout. The server's row description gives each column's
 * name and type, and for a column passed through from a table or view, that relation and column.
 */
import {
    BaseTypeOf, DescribeStatementSuccess,
    type DescribedColumn, type DescribeStatementResult,
} from '@memberjunction/generic-database-provider';

/** How long a description may run before PostgreSQL cancels it, in milliseconds. */
export const POSTGRESQL_DESCRIBE_TIMEOUT_MS = 10_000;

/** One column of a result's row description (the `pg` driver's `FieldDef`, see {@link FieldDescriptionOf}). */
export interface PostgreSQLFieldDescription {
    Name: string;
    /** OID of the table or view the column comes from; 0 when it is not a plain column. */
    TableID: number;
    /** The column's attribute number in that relation; 0 when it is not a plain column. */
    ColumnID: number;
    DataTypeID: number;
    /** The type modifier (length, precision); -1 when none. */
    DataTypeModifier: number;
}

/** The parts of a `pg` driver `FieldDef` a description reads. */
export function FieldDescriptionOf(field: { name: string; tableID: number; columnID: number; dataTypeID: number; dataTypeModifier: number }): PostgreSQLFieldDescription {
    return { Name: field.name, TableID: field.tableID, ColumnID: field.columnID, DataTypeID: field.dataTypeID, DataTypeModifier: field.dataTypeModifier };
}

/** The catalog facts of one described column, in the order of the row description. */
export interface PostgreSQLDescribeCatalogRow {
    SchemaName: string | null;
    RelationName: string | null;
    ColumnName: string | null;
    FullType: string | null;
    BaseType: string | null;
    IsGenerated: boolean | null;
}

/**
 * Reads the relation, column and type of every described column in one statement: `$1` / `$2`
 * are the table OIDs and attribute numbers, `$3` / `$4` the type OIDs and modifiers, aligned.
 */
export const POSTGRESQL_DESCRIBE_CATALOG_SQL = `SELECT n.nspname AS "SchemaName", c.relname AS "RelationName", a.attname AS "ColumnName",
  format_type(t.typ, NULLIF(t.mods, -1)) AS "FullType", format_type(t.typ, NULL) AS "BaseType",
  COALESCE(a.attgenerated::text, '') <> '' AS "IsGenerated"
FROM unnest($1::oid[], $2::int[], $3::oid[], $4::int[]) WITH ORDINALITY AS t(rel, att, typ, mods, i)
LEFT JOIN pg_class c ON c.oid = t.rel
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid = t.rel AND a.attnum = t.att AND t.att > 0
ORDER BY t.i`;

/** The parameters of {@link POSTGRESQL_DESCRIBE_CATALOG_SQL} for `fields`. */
export function DescribeCatalogParameters(fields: readonly PostgreSQLFieldDescription[]): unknown[] {
    return [
        fields.map(f => f.TableID ?? 0),
        fields.map(f => f.ColumnID ?? 0),
        fields.map(f => f.DataTypeID),
        fields.map(f => f.DataTypeModifier ?? -1),
    ];
}

/** The wrapper that makes PostgreSQL describe `sql` without returning rows. A trailing `;` is dropped. */
export function DescribeWrapperSQL(sql: string): string {
    const body = sql.trim().replace(/;+\s*$/, '');
    return `SELECT * FROM (${body}\n) _q LIMIT 0`;
}

/**
 * The description of `fields`, given the catalog row for each (same order). PostgreSQL does not
 * report nullability, so `IsNullable` is null.
 */
export function MapPostgreSQLDescribeFields(
    fields: readonly PostgreSQLFieldDescription[],
    catalog: readonly PostgreSQLDescribeCatalogRow[],
): DescribeStatementResult {
    return DescribeStatementSuccess(fields.map((field, i) => mapField(field, catalog[i], i + 1)));
}

function mapField(field: PostgreSQLFieldDescription, row: PostgreSQLDescribeCatalogRow | undefined, ordinal: number): DescribedColumn {
    const source = field.TableID > 0 && row?.RelationName && row.ColumnName
        ? Object.freeze({ Schema: row.SchemaName ?? '', Object: row.RelationName, Column: row.ColumnName })
        : null;
    const fullType = (row?.FullType ?? '').trim();
    return Object.freeze({
        Name: field.Name,
        Ordinal: ordinal,
        SQLBaseType: (row?.BaseType ?? '').trim() || BaseTypeOf(fullType),
        SQLFullType: fullType,
        IsNullable: null,
        IsComputed: source === null || row?.IsGenerated === true,
        Source: source,
    });
}
