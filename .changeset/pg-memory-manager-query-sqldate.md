---
"@memberjunction/ai-agents": patch
---

Filter the `since` parameter through `sqlDate` in the PostgreSQL dialect of the `GetConversationsForMemoryManager` query, which Memory Manager runs via `RunQuery` (`memory-manager-agent.ts:704`).

The PG template interpolated the parameter straight into the SQL string (`>= '{{ since }}'`). The SQL Server sibling was fixed in `7cd4953574` (2026-07-18); that commit touched only `get-conversations-for-memory-manager.sql`, so the `.pg.sql` file kept the raw interpolation it has carried since it was added on 2026-04-28, and the two dialects drifted apart.

`sqlDate` parses the value as a `Date`, throws on unparseable input, and returns `'${date.toISOString()}'` — it emits its own quotes, so the manual quotes in the old line were wrong twice over: the value was unfiltered, and a filtered value would have been double-quoted. The filter is dialect-agnostic (unlike `sqlBoolean` and `sqlIdentifier`, it has no platform-aware override in `RunQuerySQLFilterManager`), so the same filter is correct for both engines. The file already used `{{ agentIds | sqlIn }}`, so the filter mechanism was live here and `since` was simply the one that was missed.

Metadata-only change — it reaches the database through the release's consolidated `mj sync push`, not through a migration.
