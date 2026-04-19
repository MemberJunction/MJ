import { DataTable, DataComputation } from './data-table';

/**
 * A point-in-time snapshot of one or more datasets with context.
 *
 * This is the universal data exchange format between components,
 * artifact viewers, agents, and persistence.
 *
 * Per-table state (sorting, filters, computations, paging, selection)
 * lives on each DataTable — not here. DataSnapshot holds only
 * component-level state that spans all tables.
 */
export class DataSnapshot {
    // ─── TABLES ───

    /** Named datasets — the core payload */
    tables?: DataTable[];

    // ─── SHARED CONTEXT ───

    /** Display title */
    title?: string;

    /** How the data was obtained (markdown, may include Mermaid diagrams) */
    plan?: string;

    /** What the data MEANS — patterns, insights, key takeaways */
    interpretation?: string;

    /** Cross-table computations (rare — most computations live on individual DataTables) */
    computations?: DataComputation[];

    // ─── COMPONENT-LEVEL STATE (spans all tables) ───

    /** Drill-down breadcrumb path: ["All Regions", "West", "California"] */
    drillPath?: string[];

    /** Which tab/view/section is currently active */
    activeTab?: string;

    /** Search/filter text entered by user (component-wide) */
    searchText?: string;

    /** Component-specific state not covered above */
    custom?: Record<string, unknown>;

    // ─── QUERY SAVE TRACKING ───

    savedQueryId?: string;
    savedQueryName?: string;
    savedAtVersionNumber?: number;

    // ─── GETTERS ───

    /** Check whether this snapshot has multiple tables */
    get IsMultiTable(): boolean {
        return !!(this.tables && this.tables.length > 1);
    }

    // ─── FACTORY METHODS ───

    /** Create from a single DataTable */
    static FromTable(table: DataTable, title?: string): DataSnapshot {
        const snap = new DataSnapshot();
        snap.tables = [table];
        snap.title = title;
        return snap;
    }

    /** Create from multiple DataTables */
    static FromTables(tables: DataTable[], title?: string): DataSnapshot {
        const snap = new DataSnapshot();
        snap.tables = tables;
        snap.title = title;
        return snap;
    }
}

/**
 * Normalize any DataSnapshot (or legacy artifact JSON) to always use the `tables[]` array format.
 *
 * - Multi-table snapshots: returns the tables array as-is
 * - Legacy single-table JSON (from Query Builder): wraps root-level fields into a single DataTable
 * - Empty snapshots: returns []
 */
export function NormalizeToTables(
    snap: DataSnapshot | Record<string, unknown>,
    defaultTableName: string = 'results'
): DataTable[] {
    const s = snap as Record<string, unknown>;

    // Multi-table: tables array is authoritative.
    // Ensure each table has `rows: []` and `columns: []` defaults — downstream
    // consumers (artifact tool handlers, exporters) assume these are arrays.
    // A plain-JSON table with missing fields will crash `.length` / `.map` /
    // `.filter` calls otherwise.
    if (Array.isArray(s.tables) && s.tables.length > 0) {
        return (s.tables as Array<Record<string, unknown>>).map((t) => ({
            ...t,
            rows: Array.isArray(t.rows) ? t.rows : [],
            columns: Array.isArray(t.columns) ? t.columns : [],
            name: typeof t.name === 'string' ? t.name : defaultTableName,
        })) as DataTable[];
    }

    // Legacy single-table: wrap root-level fields via factory method
    if (s.rows || s.columns || (s.metadata as Record<string, unknown> | undefined)?.sql) {
        return [DataTable.FromLegacySpec(
            s as Parameters<typeof DataTable.FromLegacySpec>[0],
            defaultTableName
        )];
    }

    // Empty (context-only snapshot)
    return [];
}

/**
 * Get the total row count across all tables in a snapshot.
 */
export function TotalRowCount(snap: DataSnapshot | Record<string, unknown>): number {
    return NormalizeToTables(snap).reduce(
        (sum, table) => sum + (table.metadata?.rowCount ?? table.rows.length),
        0
    );
}

/**
 * Get the total available row count across all tables
 * (the full dataset size, not just the current page).
 */
export function TotalAvailableRowCount(snap: DataSnapshot | Record<string, unknown>): number {
    return NormalizeToTables(snap).reduce(
        (sum, table) => sum + (
            table.metadata?.totalAvailableRows ??
            table.metadata?.rowCount ??
            table.rows.length
        ),
        0
    );
}

/**
 * Backward compatibility alias.
 * Existing code that references DataArtifactSpec continues to work.
 */
export type DataArtifactSpec = DataSnapshot;
