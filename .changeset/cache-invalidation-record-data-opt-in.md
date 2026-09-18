---
"@memberjunction/server": patch
---

Cache-invalidation events no longer carry row data unless the deployment opts in.

The `cacheInvalidation` subscription is delivered to every connected client with no per-user
filter, and both publish sites attached the full row (`JSON.stringify(entity.GetAll())`) to every
save. Any signed-in session therefore received the contents of rows it had no rights to read —
row-level security and consumer-side tenant scoping both apply on the read path, which this
bypasses.

`recordData` is now populated only for entities listed in the new
`cacheSettings.recordDataBroadcastEntities` config option, which defaults to `[]`.

BEHAVIOUR CHANGE: with no configuration, the apply-in-place optimisation added alongside
`RecordData` no longer applies — clients evict on the entity name and primary key the event still
carries, then re-fetch through the normal access-controlled path, as they did before that
optimisation. List entities to opt them back in; use `['*']` to restore the previous behaviour
wholesale, which is only safe where every signed-in user may read every row.
