---
"@memberjunction/search-engine": patch
"@memberjunction/integration-test-suite": patch
---

A scoped search is now bounded by its scope's rows. An empty configuration means "nothing", never "everything". These are behaviour changes.

**A non-global scope runs only its enabled provider rows.** A scope with no enabled `MJ: Search Scope Providers` row used to run every provider, so disabling a scope's last provider row widened it to all of them. It now runs no provider and returns nothing. Its scope decision (`SearchExecutionLog.ScopeDecisionJSON`) is `Reachable: false` with a diagnostic, and `ExplainScope` reports the same. **Scopes that relied on "no provider rows means all providers" now return nothing until rows are added.** A non-global scope with no lanes at all also reaches nothing now (`Reachable: false`, `Unbounded: false`). `Unbounded` is now true only for a global scope with no lanes. Global scopes, and searches with no scope, are unchanged.

**An empty lane list means no results from that provider.** For a non-global scope, `ScopeConstraints.Entities`, `ExternalIndexes` and `StorageAccounts` are now `[]` rather than `undefined` when the scope has no rows of that kind. A provider reads `[]` as "nothing for me" and returns without querying. `undefined` still means unscoped. The changes by provider:
- The entity, full-text and tag providers search nothing without entity lanes. They used to search every searchable entity.
- The vector provider searches nothing without `Vector` index rows. It used to search every index, unfiltered.
- Elasticsearch, OpenSearch, Typesense and Azure AI Search query nothing without rows of their own `IndexType`. They used to fall back to the configured default index with no scope filter, and now use it only for unscoped searches.
- The storage provider searches nothing without storage lanes. It used to search every account.
- `BaseSearchProvider.ScopedExternalIndexRows()` gives custom providers the same rule.

**A lane `ExtraFilter` now applies to every provider's hits for that entity.** Before, only the entity provider applied it. Full-text, tag, vector and 3rd-party hits for the entity are now kept only when the record satisfies the same rendered filter. The engine checks this as the user, with one `PK IN (...) AND (<ExtraFilter>)` RunView per filtered entity per scope, and drops those hits if the check fails. Hits from a provider declaring the new `BaseSearchProvider.AppliesLaneExtraFilter` (only `EntitySearchProvider`) are exempt because that provider already applied the filter. The engine identifies the provider by the `ProviderId` it stamps on each result, not by the declared `SourceType`. **Scopes that configured only an entity lane now return less from other providers.** For a scoped search, `SearchResult.SourceCounts` and the log row's `ProvidersJSON` are counted after this step, while a streamed `provider` event's `resultCount` is counted before it, so the two can differ.

**A storage lane's `FolderPath` now restricts, and refuses rather than widens.** The search is refused with an error, and `ExplainScope` marks the lane `Skipped` and the scope unreachable, when the FolderPath:
- renders empty (before, the whole account was searched);
- renders an empty segment, e.g. `clients/{{ context.X }}` with X absent renders `clients/`, every client's folder;
- contains a `..` segment.

The `path` escaper (`EscapePathSegment`) now refuses a value that is `..` or `.`, or contains `/` or `\`. It used to strip `..` and separators, so `..` became nothing and `../other` became `other`. A value that only contains `..`, such as `Acme..Inc`, is an ordinary segment and is kept. The renderer throws only when such a value is actually interpolated into the path. **FolderPath templates that render empty now fail loudly instead of widening.**

**Restoring the old breadth (optional data step).** A non-global scope that should keep its old reach needs the rows added explicitly: one enabled `MJ: Search Scope Providers` row per provider it should run, and the external-index and storage lanes those providers should search. No migration is needed.
