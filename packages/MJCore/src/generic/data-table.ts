import { MJColumnDescriptor } from './column-descriptors';

/**
 * A named, pre-computed aggregation or metric.
 */
export interface DataComputation {
    /** Display name: "Total Revenue", "Average Order Value" */
    name: string;
    /** Type of aggregation */
    type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct_count' | 'custom';
    /** Source field this computation operates on */
    field?: string;
    /** Which table this computation belongs to (for cross-table snapshots) */
    table?: string;
    /** The computed value */
    value: number | string | boolean;
    /** Human-formatted display value: "$1,234,567.89" */
    formattedValue?: string;
    /** Explanation of what this computation represents */
    description?: string;
}

/**
 * Metadata about how a DataTable's data was produced.
 * Every field is optional — populate what's available.
 */
export interface DataTableMetadata {
    /** SQL that produced this data (if source is 'query') */
    sql?: string;
    /** MJ entity name (if source is 'view') */
    entityName?: string;
    /** Extra WHERE filter applied (if source is 'view') */
    extraFilter?: string;
    /** Query name in MJ (if from a stored query) */
    queryName?: string;
    /** Query category path in MJ (if from a stored query) */
    queryCategoryPath?: string;
    /** Query parameters used */
    parameters?: Record<string, string | number | boolean>;
    /** Number of rows in the `rows[]` array (this page of results) */
    rowCount?: number;
    /** Starting row index in the full result set (0-based) */
    startRowIndex?: number;
    /** Page size used for this result set */
    pageSize?: number;
    /** Total rows available from the query/view (not the entire table) */
    totalAvailableRows?: number;
    /** Time to execute the query/view in milliseconds */
    executionTimeMs?: number;
    /** When this data was fetched (UTC) */
    fetchedAt?: Date;
    /** For computed tables: how the data was derived */
    computationDescription?: string;
}

/**
 * A single named dataset: columns + rows + provenance + per-table state.
 *
 * This is the standard unit of tabular data in MemberJunction.
 * Self-describing: given just this object, a consumer knows what the
 * data is, where it came from, and how to interpret each column.
 *
 * Rows are flat `Record<string, unknown>[]` — same shape as RunView/RunQuery.
 */
export class DataTable {
    /** Unique name for this table within a collection */
    name!: string;

    /** Human-readable description of what this table contains */
    description?: string;

    /** How this table's data was produced */
    source?: 'query' | 'view' | 'computed' | 'static' | 'other';

    /** Column definitions with type information and entity lineage */
    columns: MJColumnDescriptor[] = [];

    /** The actual row data */
    rows: Record<string, unknown>[] = [];

    /** How the data was produced, how much there is, how long it took */
    metadata?: DataTableMetadata;

    // ─── PER-TABLE STATE (each table has its own) ───

    /** Pre-computed aggregations for this table's data */
    computations?: DataComputation[];

    /** Current sort state applied to this table */
    sorting?: Array<{ field: string; direction: 'asc' | 'desc' }>;

    /** Currently selected rows in this table */
    selectedRows?: Array<{ rowIndex: number; rowKey?: string; rowData?: Record<string, unknown> }>;

    /** Current page number (1-based) */
    pageNumber?: number;

    /** Create from a single-table DataSnapshot (legacy format) */
    static FromLegacySpec(spec: {
        source?: string;
        columns?: MJColumnDescriptor[];
        rows?: Record<string, unknown>[];
        metadata?: DataTableMetadata;
        entityName?: string;
        extraFilter?: string;
        queryName?: string;
        queryCategoryPath?: string;
        parameters?: Record<string, string | number | boolean>;
    }, defaultName: string = 'results'): DataTable {
        const table = new DataTable();
        table.name = defaultName;
        table.source = spec.source as DataTable['source'];
        table.columns = spec.columns ?? [];
        table.rows = spec.rows ?? [];
        table.metadata = spec.metadata ? {
            ...spec.metadata,
            entityName: spec.entityName,
            extraFilter: spec.extraFilter,
            queryName: spec.queryName,
            queryCategoryPath: spec.queryCategoryPath,
            parameters: spec.parameters,
        } : undefined;
        return table;
    }
}
