---
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
---

An entity document's record filter, `Configuration.recordFilter.extraFilter`, now does what its documentation said (#5199). It was declared, with `IsDeleted = 0` as its example, but nothing read it, so records it was meant to exclude were vectorized and offered as duplicates anyway.

- **Vector sync** ANDs the filter into every page it reads, with a list run's membership filter (`BuildRecordPageFilter`).
- **Duplicate detection** checks only records that pass it: a whole-entity run ANDs it into the run's `ExtraFilter`, and a list or view run is narrowed to the members that pass it.
- **Candidates** that fail it are dropped by `FilterNonExistentMatches`, which now takes the filter: their vectors can predate it. `CheckSingleRecord` and the entry-time check apply it too. With a filter set, the query over-fetches three times TopK and trims back to TopK after filtering.
- **Fails loudly.** If the filter can't be applied, detection throws instead of failing open; without a filter, a failed existence check still fails open as before.
- The candidate existence check now reads with `IgnoreMaxRows`, so an entity whose `UserViewMaxRows` is below the 500-key chunk no longer drops valid matches.
- New exports from `@memberjunction/ai-vector-sync`: `ParseEntityDocumentConfiguration`, `GetEntityDocumentRecordFilter`.
