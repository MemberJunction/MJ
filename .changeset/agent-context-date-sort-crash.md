---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": patch
---

Fix a `TypeError` that could kill an agent mid-run during context assembly (`__mj_CreatedAt?.getTime is not a function`).

Two defects, one crash:

- **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a `__mj_CreatedAt` declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. Affects every engine with `CacheLocal: true`, including `BaseAIEngine`'s agent notes and examples.

- **Seven sort comparators called `.getTime()` unguarded (the crash site).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. All seven now route through a new exported `ToEpochMs(value)` helper in `@memberjunction/core`, which accepts a `Date`, string, or numeric timestamp and returns `0` for absent or unparseable input. This also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator. Six are in the agent-context path (`AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`); the seventh is `ConversationEngine.sortConversations`, which sorts another `BaseEngine`-cached array and so shared the same exposure.

The widest exposure was `AIEngine.fallbackGetNotesFromCache`, which `FindSimilarAgentNotes` falls back to whenever the note vector service is uninitialized or a query embedding fails — so semantic retrieval with real input text could crash too, not just the empty-input path.
