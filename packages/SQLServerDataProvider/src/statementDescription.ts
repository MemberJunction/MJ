/**
 * Describing a statement on SQL Server with `sys.dm_exec_describe_first_result_set`, which
 * compiles the statement and reports its first result set without executing it.
 */
import {
    BaseTypeOf, DescribeStatementFailure, DescribeStatementSuccess,
    type DescribedColumn, type DescribeStatementResult,
} from '@memberjunction/generic-database-provider';

/**
 * Describes `@tsql`. Mode 2 reports the view and view column a pass-through column comes from
 * (mode 1 would report the base table), and adds a hidden `ROWSTAT` column, which is dropped.
 */
export const SQLSERVER_DESCRIBE_SQL = `SELECT column_ordinal AS ColumnOrdinal, name AS Name, is_hidden AS IsHidden, is_nullable AS IsNullable,
  system_type_name AS SystemTypeName, source_schema AS SourceSchema, source_table AS SourceTable, source_column AS SourceColumn,
  is_computed_column AS IsComputedColumn, error_number AS ErrorNumber, error_message AS ErrorMessage, error_type_desc AS ErrorTypeDesc
FROM sys.dm_exec_describe_first_result_set(@tsql, NULL, 2)
ORDER BY column_ordinal`;

/** One row of {@link SQLSERVER_DESCRIBE_SQL}. */
export interface SQLServerDescribeRow {
    ColumnOrdinal: number | null;
    Name: string | null;
    IsHidden: boolean | null;
    IsNullable: boolean | null;
    SystemTypeName: string | null;
    SourceSchema: string | null;
    SourceTable: string | null;
    SourceColumn: string | null;
    IsComputedColumn: boolean | null;
    ErrorNumber: number | null;
    ErrorMessage: string | null;
    ErrorTypeDesc: string | null;
}

/**
 * The description the rows of {@link SQLSERVER_DESCRIBE_SQL} give: a failure carrying the
 * server's error text when any row reports one, otherwise the visible columns in order.
 */
export function MapSQLServerDescribeRows(rows: readonly SQLServerDescribeRow[] | null | undefined): DescribeStatementResult {
    const all = rows ?? [];
    const errors = all.filter(r => r.ErrorMessage != null || r.ErrorNumber != null);
    if (errors.length > 0) {
        return DescribeStatementFailure(...errors.map(describeError));
    }
    return DescribeStatementSuccess(all.filter(r => r.IsHidden !== true).map(mapColumn));
}

function describeError(row: SQLServerDescribeRow): string {
    const kind = row.ErrorTypeDesc ? ` ${row.ErrorTypeDesc}` : '';
    return `${row.ErrorNumber ?? ''}${kind}: ${row.ErrorMessage ?? 'the statement could not be described'}`.trim();
}

function mapColumn(row: SQLServerDescribeRow): DescribedColumn {
    const fullType = (row.SystemTypeName ?? '').trim();
    const source = row.SourceTable && row.SourceColumn
        ? Object.freeze({ Schema: row.SourceSchema ?? '', Object: row.SourceTable, Column: row.SourceColumn })
        : null;
    return Object.freeze({
        Name: row.Name ?? '',
        Ordinal: row.ColumnOrdinal ?? 0,
        SQLBaseType: BaseTypeOf(fullType),
        SQLFullType: fullType,
        IsNullable: row.IsNullable ?? null,
        IsComputed: source === null || row.IsComputedColumn === true,
        Source: source,
    });
}
