---
"@memberjunction/server": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
---

Cache-invalidation events no longer carry row data unless the deployment opts in, and the consumers that needed that row now re-read it through an access-controlled path.

The `cacheInvalidation` subscription is delivered to every connected client with no per-user filter, and both publish sites attached the full row (`JSON.stringify(entity.GetAll())`) to every save. Row-level security and any consumer-side scoping apply on the read path, which a push bypasses — so every signed-in session received the contents of rows it had no right to read.

**Server.** `recordData` is populated only for entities named in the new `cacheSettings.recordDataBroadcastEntities`, default `[]`. `['*']` restores the previous behaviour wholesale. `EntityName` and `PrimaryKeyValues` still broadcast unconditionally — they disclose nothing a client cannot already derive, and they are what tells a consumer *which* record changed.

**Core.** New `ResolveEntityEventRow(event, provider?, contextUser?)` and `ResolveEntityEventKey(event)`. The first returns the row from the live entity (local events), from `recordData` (allowlisted entities), or by re-reading that one record by primary key through the provider — as the signed-in user, so the server decides what comes back. A session that may not read the record gets `null` rather than an exception or someone else's data. The second reads identity from the primary key, which is always present.

**Consumers.** `ConversationEngine` hydrates once in its already-async event dispatcher and passes the row to its five handlers, which stay synchronous; identity now comes from the primary key, so a conversation delete and a project delete need no row at all. The dispatcher asks `EntityEventRowIsFree(event)` first — a row that is already in hand, from the live entity or from allowlisted `recordData`, is never worth skipping, and the per-entity skips below it are about avoiding THE READ. The AI Agent Run form resolves `Status` the same way, behind its id match; `AgentRunID` on a step cannot be gated that way (it is the foreign key being matched), so while that form is open on a Running agent every step save in the deployment costs it one keyed read, bounded by the run's lifetime. The Form Builder cockpit resolves `Name` only after its id match has already missed. A conversation whose re-read comes back null — refused, gone, or failed — is left as it was rather than handed to `SetMany`, and a remote delete on the detail path no longer re-reads a row that is guaranteed gone.

**Cost, stated plainly for whoever sets the allowlist.** `BaseEngine` is unchanged in code and is the broadest behavioural change here: it applies a remote save in place only when `recordData` is present, so with the default `[]` every remote save of an `AutoRefresh` entity falls through to a full `RunView` reload of each matching config (`LoadSingleConfig(..., bypassCache=true)`), not a keyed read. Remote deletes still apply in place from the primary key. Engine-cached reference entities that every signed-in user may read are the ones worth listing.

Without the consumer half, defaulting `recordDataBroadcastEntities` to `[]` would have made `ConversationEngine`'s remote handling a silent no-op — including the eviction whose own comment warns that a warm cache "would keep serving without this row forever".
