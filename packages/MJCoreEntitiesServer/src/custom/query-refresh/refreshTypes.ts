import type { IMetadataProvider, IRunViewProvider, UserInfo } from "@memberjunction/core";
import type { ChildRowChange, QueryExtractionStatus } from "../query-extraction";

/** The provider a refresh reads and writes through: the caller's, so its transaction and permissions apply. */
export type QueryRefreshProvider = IMetadataProvider & IRunViewProvider;

/**
 * Which saved queries a bulk refresh covers. Selectors combine as a union; `All` selects every
 * query the caller can read. A refresh with no selector refreshes nothing.
 */
export interface QueryRefreshFilter {
    /** Query IDs. */
    readonly QueryIDs?: readonly string[];
    /** Query names, or full paths (`Category/Sub/Name`); a bare name selects every query with that name. */
    readonly QueryNames?: readonly string[];
    /** A category path (`Category/Sub`): the queries in that category and every category below it. */
    readonly CategoryPath?: string;
    /** Entity names: the queries that read any of these entities (their `MJ: Query Entities` rows). */
    readonly EntityNames?: readonly string[];
    /** Entity IDs, as {@link EntityNames}. */
    readonly EntityIDs?: readonly string[];
    /** Every query. */
    readonly All?: boolean;
}

/** How a refresh runs. */
export interface QueryRefreshOptions {
    /** Work out and report the changes without writing anything. */
    readonly DryRun?: boolean;
    /** Queue the LLM description pass for rows still without a description (off by default). */
    readonly WithAI?: boolean;
    /** Called once per query as a bulk refresh finishes it. */
    readonly OnProgress?: (progress: QueryRefreshProgress) => void;
}

/** A bulk refresh's progress after one query. */
export interface QueryRefreshProgress {
    readonly Processed: number;
    readonly Total: number;
    readonly Report: QueryRefreshReport;
}

/**
 * What happened to one query:
 * - `Refreshed`: the child rows or the query's extraction columns changed (with `DryRun`: would change);
 * - `Unchanged`: the stored rows already match the SQL;
 * - `NotPermitted`: a bulk refresh skipped a query the caller may not refresh (no reason is given);
 * - `Unavailable`: the query does not exist or the caller may not refresh it (the two read alike);
 * - `Failed`: the refresh could not be completed, and nothing was written.
 */
export type QueryRefreshOutcome = 'Refreshed' | 'Unchanged' | 'NotPermitted' | 'Unavailable' | 'Failed';

/** One query's refresh. */
export interface QueryRefreshReport {
    /** The query's ID; for `Unavailable`, the identifier the caller supplied. */
    readonly QueryID: string;
    /** The query's name; empty for `Unavailable`. */
    readonly QueryName: string;
    readonly Outcome: QueryRefreshOutcome;
    readonly DryRun: boolean;
    /** The extraction status the run records (or, with `DryRun`, would record); `null` when it did not run. */
    readonly ExtractionStatus: QueryExtractionStatus | null;
    /** The columns of the query row itself the run changes (`UsesTemplate`, `ExtractedSQLHash`, `ExtractionStatus`, `ExtractionMessage`). */
    readonly QueryColumns: readonly string[];
    readonly Added: readonly ChildRowChange[];
    readonly Updated: readonly ChildRowChange[];
    readonly Removed: readonly ChildRowChange[];
    /** Authored parameters the SQL no longer uses: kept, and flagged on the query. */
    readonly Flagged: readonly string[];
    /** The run's diagnostics (`ExtractionMessage` lines), or why it was not completed. */
    readonly Diagnostics: readonly string[];
}

/** A bulk refresh: one report per query, in the order the queries were refreshed. */
export interface QueryRefreshRunReport {
    readonly DryRun: boolean;
    readonly Reports: readonly QueryRefreshReport[];
    /** Queries that compose each other in a cycle, by name; each was refreshed once, after the rest. */
    readonly Cycles: readonly (readonly string[])[];
}

/** Who a refresh runs as and through which provider. */
export interface QueryRefreshContext {
    readonly Provider: QueryRefreshProvider;
    readonly User: UserInfo;
}

/** Whether `provider` can read views and create entity objects, which is everything a refresh needs. */
export function IsQueryRefreshProvider(provider: IMetadataProvider): provider is QueryRefreshProvider {
    return typeof Reflect.get(provider, 'RunViews') === 'function' && typeof Reflect.get(provider, 'RunView') === 'function';
}
