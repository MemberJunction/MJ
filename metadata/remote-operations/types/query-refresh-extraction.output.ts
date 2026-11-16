/** One child row a refresh adds, updates or removes. */
export interface QueryRefreshRowChange {
    /** The child collection: Fields, Parameters, Entities or Dependencies. */
    collection: 'Fields' | 'Parameters' | 'Entities' | 'Dependencies';
    /** The field or parameter name, the entity name, or the dependency's reference path. */
    name: string;
    /** For an update, the columns that change. */
    changedColumns: string[];
}

/** One query's refresh. */
export interface QueryRefreshQueryReport {
    /** The query's ID; for `Unavailable`, the identifier the caller supplied. */
    queryID: string;
    /** The query's name; empty for `Unavailable`. */
    queryName: string;
    /** Refreshed (with dryRun: would change), Unchanged, NotPermitted (skipped, no reason given), Unavailable (does not exist or may not be refreshed) or Failed (nothing written). */
    outcome: 'Refreshed' | 'Unchanged' | 'NotPermitted' | 'Unavailable' | 'Failed';
    /** The extraction status the run records (with dryRun: would record); absent when it did not run. */
    extractionStatus?: 'OK' | 'Warning' | 'Error' | 'Skipped';
    /** The columns of the query row itself the run changes (UsesTemplate and the Extraction columns). */
    queryColumns: string[];
    added: QueryRefreshRowChange[];
    updated: QueryRefreshRowChange[];
    removed: QueryRefreshRowChange[];
    /** Authored parameters the SQL no longer uses: kept, and flagged on the query. */
    flagged: string[];
    /** The run's diagnostics, or why it was not completed. */
    diagnostics: string[];
}

/** Output of `Query.RefreshExtraction`. */
export interface QueryRefreshExtractionOutput {
    dryRun: boolean;
    /** One report per query, in the order refreshed (the queries a composition depends on first). */
    reports: QueryRefreshQueryReport[];
    /** Queries that compose each other in a cycle, by name; each was refreshed once. */
    cycles: string[][];
    /** A one-line summary of the run. */
    summary: string;
}
