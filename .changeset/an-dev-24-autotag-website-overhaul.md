---
"@memberjunction/content-autotagging": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Autotag website crawler overhaul — fixes the long-standing "only crawls the seed page" symptom and adds first-class run budgets, a streaming pipeline, and per-source UI knobs.

**Fixes**

- `AutotagWebsite` now respects `MaxDepth` out of the box — the recursive crawler was previously gated on a flag that defaulted to falsy, so most sources only ever scraped the start URL. Class-level defaults are now `MaxDepth=2`, `CrawlSitesInLowerLevelDomain=true`, `CrawlOtherSitesInTopLevelDomain=false`.
- Change-detection (the "is this page changed?" short-circuit) was rewritten to fetch each URL once instead of two or three times, hash the **extracted body text** (not raw HTML — eliminates spurious "changed" verdicts from CSRF tokens / build hashes / server timestamps), and scope the dedup query to the current `ContentSourceID` (a 404 boilerplate from one site no longer masks real pages on another).
- `visitedURLs` state is now reset per content source — was leaking across sources and silently deduping legitimate URLs.
- Conservative URL normalization (strip fragment, collapse trailing slash, sort query params; path case preserved per RFC 3986) so common variants dedupe correctly.
- Several smaller bugs: `URLPattern` regex now applied in the shallow path too, `Number.isFinite` guard prevents NaN-cascade in the depth check.

**Features**

- **Streaming pipeline.** `ExtractTextAndProcessWithLLM` now accepts `AsyncIterable<MJContentItemEntity>` in addition to arrays. The website crawler streams items into the LLM batcher as they pass change-detection — total wall-clock is `~max(crawl, classify)` instead of `crawl + classify`. Backwards-compatible: existing array callers (AutotagEntity, tests) are unchanged.
- **`MaxItemsPerRun` run budget.** Most intuitive "do at most N this run, do the rest next time" cap. Wired into `AutotagWebsite` (which had no budget integration before) and `AutotagEntity` (which already had the other RunBudget knobs). Pause is graceful via the existing CancellationRequested machinery; next run picks up where it left off (change-detection skips already-tagged items).
- **Per-source Website crawler UI.** New "Website Crawler Settings" section on the Content Source form (conditional on Website source type) with structured inputs for MaxDepth, RootURL, URLPattern (live regex validation), and toggles for the recursion + sibling-fan-out flags. The Tag Pipeline section gets a promoted "Max items / run" primary row.

**Storage**

- `IContentSourceConfiguration` extended with a typed `MaxItemsPerRun?: number` and `Website?: IContentSourceWebsiteConfiguration` sub-object. The new `MJContentSourceEntity_IContentSourceWebsiteConfiguration` interface is now exported from `@memberjunction/core-entities`.
- `AutotagWebsite` reads website knobs from the typed `Configuration.Website` first, then overlays `ContentSourceParam` rows as a sharper-per-instance override (legacy sources configured the old way keep working).
- Per-key coercion at the param-overlay boundary fixes a latent bug where DB-stored strings were silently stuffed into number/boolean-typed instance fields.

**Tests**

162 tests pass (up from 119). New coverage spans URL normalization, fetch-once / extracted-text hashing, the streaming engine path (AsyncIterable batching, partial-batch flush, resume), `MaxItemsPerRun` budget enforcement, and the `Configuration.Website` overlay.

**Docs**

`packages/ContentAutotagging/README.md` documents the new streaming diagram, the Website Crawl Settings table, the Run Budgets table with priority order, and the resume semantics.

**Known follow-ups** (not in this PR)

- True crawl-side resume that persists discovered URLs so re-runs skip the HTTP re-discovery — today's resume is "functional via change-detection dedup."
- `ETag` / `If-Modified-Since` conditional GETs on re-crawls (needs new columns on `MJContentItem`).
- Promote source-type-specific form sections to a registered class extension point when the count grows past 2-3.
