/** Input for `Query.RefreshExtraction`. Selectors combine as a union; give at least one. */
export interface QueryRefreshExtractionInput {
    /** Query IDs to refresh. With exactly one ID and no other selector, a query that does not exist or that the caller may not refresh is reported as unavailable. */
    queryIDs?: string[];
    /** Query names, or full paths (`Category/Sub/Name`); a bare name selects every query with that name. */
    queryNames?: string[];
    /** A category path (`Category/Sub`): the queries in that category and every category below it. */
    categoryPath?: string;
    /** Entity names: the queries that read any of these entities. */
    entityNames?: string[];
    /** Every query the caller can read. */
    all?: boolean;
    /** Work out and report the changes without writing anything. */
    dryRun?: boolean;
    /** Queue the LLM description pass for rows still without a description (default false). */
    withAI?: boolean;
}
