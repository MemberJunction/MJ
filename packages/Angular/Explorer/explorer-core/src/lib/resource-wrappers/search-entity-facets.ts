import { SearchResultItem } from '@memberjunction/ng-search';

/**
 * Entity-facet helpers for the search results page (`SearchResultsResource`).
 *
 * The page asks the server for the top N results across every entity type. When the user ticks
 * Entity facets, the page keeps showing what it already has (narrowed in the browser) and, in the
 * background, asks the server for the top N within the ticked types. That reply is MERGED into the
 * result set — new results appended, results already on screen kept as they are — so the list
 * grows instead of being replaced. The other facets (Source, Tags, File Type) only narrow the
 * loaded results in the browser.
 */

/** The facet category whose selections also fetch more results from the server. */
export const ENTITY_FACET_CATEGORY = 'Entity';

/**
 * The Entity facet's "Files" option (see SearchService.BuildFilters). It is not an entity name: the
 * storage provider ignores entity filters, so it can't restrict a server query and stays client-side.
 */
export const STORAGE_FILES_FACET_VALUE = '__storage-files__';

/**
 * The entity names the ticked Entity facets ask the server about: the selected values without the
 * client-only "Files" option, sorted. Empty means no entity-filtered fetch is needed.
 */
export function ServerEntityNames(activeFilters: Record<string, string[]>): string[] {
    const selected = activeFilters[ENTITY_FACET_CATEGORY] ?? [];
    return selected.filter(v => v !== STORAGE_FILES_FACET_VALUE).sort();
}

/**
 * The identity of a result across searches: the entity plus the record key (the result ID when a
 * result has no record key, e.g. a storage file). Two searches return the same record under
 * different result IDs and scores, so the result ID alone can't detect a duplicate.
 */
export function SearchResultKey(result: SearchResultItem): string {
    return `${result.EntityName}\u0000${result.RecordID || result.ID}`;
}

/**
 * `existing` followed by the results of `incoming` it does not already contain (by
 * {@link SearchResultKey}), in `incoming`'s order. A result already present keeps its place and
 * its original score: scores from different searches are normalised per search, so they are not
 * comparable and the newer one is not "better".
 */
export function MergeSearchResults(existing: SearchResultItem[], incoming: SearchResultItem[]): SearchResultItem[] {
    const seen = new Set(existing.map(SearchResultKey));
    const added: SearchResultItem[] = [];
    for (const r of incoming) {
        const key = SearchResultKey(r);
        if (seen.has(key)) continue;
        seen.add(key);
        added.push(r);
    }
    return added.length > 0 ? [...existing, ...added] : existing;
}
