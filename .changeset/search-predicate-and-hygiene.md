---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/search-engine": minor
"@memberjunction/codegen-lib": minor
---

Universal search performance + correctness fix: honor `EntityField.UserSearchPredicateAPI`, escape LIKE metacharacters, add resilience layer, and stop CodeGen from re-introducing invalid search flags.

**Why:** `LIKE '%term%'` was the only SQL the data provider ever generated for non-FTX entities, regardless of the configured predicate. CodeGen has been populating `UserSearchPredicateAPI` (Exact / BeginsWith / EndsWith / Contains) for months, but the runtime was discarding it. Combined with primary keys, non-text columns, and `nvarchar(MAX)` columns being auto-flagged as searchable, every keystroke against the global search box produced unindexed scans across tables of arbitrary size.

**`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.createViewUserSearchSQL` now:
- Honors `UserSearchPredicateAPI`: `Exact` emits `= N'term'` (index-seekable), `BeginsWith` emits `LIKE N'term%' ESCAPE '\'` (index-seekable), `EndsWith` emits `LIKE N'%term' ESCAPE '\'`, and the default `Contains` emits `LIKE N'%term%' ESCAPE '\'`. `UserSearchParamFormatAPI` still wins when set.
- Escapes LIKE metacharacters (`%`, `_`, `[`, `]`, `\`) in user input with `ESCAPE '\'`. Previously a query of `50%` was treated as a wildcard.
- Skips fields that aren't sensible text-search targets (non-text types; unbounded text on non-FTX entities) so an OR'd OR-predicate isn't built around an implicit per-row CONVERT.
- Emits `N''` Unicode literals throughout to avoid collation surprises.

**`@memberjunction/core`** — adds `EntityFieldInfo.UserSearchPredicateAPI: string` so consumers see the value the runtime now honors. Default `'Contains'`.

**`@memberjunction/search-engine`** — Resilience layer:
- `EntitySearchProvider`, `FullTextSearchProvider`, and `SearchEngine.Search` reject queries shorter than 3 characters early — these always fan out to full-database scans across every searchable entity.
- `EntitySearchProvider` wraps each per-entity RunView in a 5-second hard timeout. A slow entity no longer holds up the whole fan-out; the other entities' results still land for the user. The underlying SQL keeps running on the server until it finishes (Request cancellation is a follow-up).
- `SearchEngine.Search` has an in-process LRU result cache keyed by `(userID, query, MaxResults, MinScore, Filters)` with a 30s TTL and 500-entry cap. Preview-mode searches skip the cache. New `ClearResultCache()` admin/test hook.

**`@memberjunction/codegen-lib`** — CodeGen guardrails so the metadata stays clean:
- `applySearchableFieldUpdates` now refuses to set `IncludeInUserSearchAPI = 1` on primary keys, non-text columns, or unbounded text columns whose parent entity has `FullTextSearchEnabled = 0`. The LLM can still propose them; CodeGen drops the proposal silently.
- `applyEntitySearchConfig` refuses to flip `AllowUserSearchAPI` from `0` to `1` on entities whose names match log/audit/run-history patterns (`*Logs`, `*Audit*`, `*Record Changes`, `*Runs`, `*Run Steps/Messages/History`, `*Execution Logs`). It still allows the LLM to *disable* search on any entity.

**Migrations (run via Flyway in the same release):**
- `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` — disables `AllowUserSearchAPI` on 40 `__mj` log / audit / run-history / snapshot entities (Record Changes, Audit Logs, AI Agent + Prompt Runs, Company Integration Runs/Details/API Logs, Error Logs, Action Execution Logs, Test/Workflow/Recommendation/Scheduled/Duplicate Runs, User View Runs/Details, Report Snapshots, Archive Runs/Details, etc.) and clears `IncludeInUserSearchAPI` on PKs, non-text columns, and non-FTX unbounded text columns system-wide. Freezes the corresponding `AutoUpdate*` flags so CodeGen doesn't re-promote any of these silently.
- `migrations/v5/V202605041300__v5.33.x__EntityField_UserSearchPredicateAPI_Check_Constraint.sql` — adds a trusted CHECK constraint enforcing the four documented values. Defensively normalizes any out-of-band rows to `'Contains'` first.

**Behavior change to call out:** any caller that previously relied on `%` or `_` in a `UserSearchString` being interpreted as a SQL wildcard will now match those characters literally. There were no such known callers in the MJ ecosystem; this aligns the runtime with the documented contract.
