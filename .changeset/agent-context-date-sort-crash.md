---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/scheduling-engine-base": patch
---

Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

Two defects, one crash:

- **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.

- **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the *first* job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

`isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.
