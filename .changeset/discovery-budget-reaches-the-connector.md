---
"@memberjunction/integration-engine": patch
---

Tell a connector when it is being sampled, so a discovery sample cannot silently become an exhaustive walk.

Discovery needs a corpus, not a corpus of everything: ~50 records is enough to infer columns, types, string widths and a provable primary key. `DiscoverFieldsViaFetch` already knows that and already computes a budget — but it hands that budget to the code CONSUMING the record stream, and the consumer only regains control BETWEEN `FetchChanges` calls. Nothing was ever passed to the connector, and `FetchContext` had no field for it, so a connector could not honour a budget even if it wanted to. It had no way to know it was being sampled rather than synced.

That is survivable while one `FetchChanges` is one HTTP page — the consumer stops after 50 records and the gap never shows. It is not survivable for a parent-scoped object, where a single call fans out internally into one request per parent: control does not come back until every parent has been walked, so there is nothing for the consumer to interrupt. Observed live 2026-08-12: a Totara discovery spent 28 minutes inside one `FetchChanges`, walked every parent, and returned `rows=0` — half an hour of correct, pointless work to collect a sample it could never have found there.

`FetchContext` gains three optional fields, set by `DiscoverySampleRecordStream`:

- `IsDiscoverySample` — this call exists to characterise the shape of the data, not to move it.
- `SampleTargetRecords` — stop once this many records have been collected.
- `DeadlineMs` — epoch ms after which the connector should stop and return what it has.

`SampleTargetRecords` is deliberately the primary stop and `DeadlineMs` only the backstop. A child object yields records only through its parents, so capping the number of parents visited would be wrong — if the first three courses have no enrolments you genuinely must keep walking to find fifty rows. Counting records stops the walk the moment it has enough, at whatever parent that happens to be; the deadline exists for the other case, parents that will never yield anything, where no record count is ever reached and only the clock can end it.

No behaviour change on its own: every field is optional and a connector that ignores them behaves exactly as before. `DiscoverySampleRecordStream` gains an optional trailing `deadlineMs` parameter, so existing overrides keep compiling unchanged.
