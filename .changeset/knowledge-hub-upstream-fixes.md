---
"@memberjunction/search-engine": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/tag-engine-base": patch
"@memberjunction/tag-engine": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-dashboards": patch
---

Knowledge Hub upstream fixes across SearchEngine, ContentAutotagging, TagEngine, GraphQLDataProvider, MJServer, and Angular Explorer dashboards:
- Tokenize multi-word SQL search queries in `EntitySearchProvider.convertResults` so records matched across multiple fields are not dropped when scoring in memory.
- Filter `GetContentSourceLastRunDate` by `Status = 'Completed' AND ProcessedItems > 0`, skip vector mutations when `vectorDB.IsReadOnly` is true, filter website and cloud storage sources with `FilterByUUIDs`, and emit per-URL crawl progress.
- Support client-supplied `pipelineRunID` in `RunAutotagPipeline` (subscribing before firing the mutation to eliminate the initial progress race), reject duplicate `pipelineRunID` values upfront, emit 3s progress heartbeats during long crawls, and pass actual processed counts to `publishProgress`.
- Expose `MergeTags` and `RecomputeTagCoOccurrence` GraphQL mutations in `TagGovernanceResolver` and `GraphQLAIClient`, re-parent child tags during `TagGovernanceEngine.MergeTags`, and merge existing active tags during `PromoteSuggestion` with `merge-into-existing`.
- Skip redundant `Save()` calls in `TagCoOccurrenceEngine.upsertAndPrune` when `CoOccurrenceCount` is unchanged.
- Clean up tag references before deleting orphan tags in `DeleteAllOrphans`, resolve active vector database health by `VectorDatabaseID`, and use `UUIDMap`/`IndexByUUID` for case-insensitive UUID lookups in Knowledge Hub cluster visualization and configuration dashboards.

