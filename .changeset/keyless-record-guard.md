---
"@memberjunction/integration-engine": patch
---

Refuse to write a record that has no value for its soft primary key.

`CreateRecord` treated a missing mapped key as proof of a new row. That holds for a destination whose key is *generated* — identity column, server-assigned UUID — because those rows are matched by record map rather than by key value. It does not hold for a **soft** primary key, which is the external system's own identifier stored as ordinary data: `DDLGenerator` deliberately emits it with no `PRIMARY KEY` and no `UNIQUE` constraint, since a unique constraint would reject legitimate rows. Nothing at the database level rejects a NULL key.

A row written without its key can never be matched again. The next sync's existence check misses it and inserts another copy, and the pass after that inserts another. Every business column is populated and only the key column is empty, so nothing looks wrong from the outside — the failure is silent and compounding.

The engine now refuses such a record before the insert/update decision, scoped to `IsSoftPrimaryKey` so generated-key destinations are entirely unaffected. The refusal is reported as `KEYLESS_RECORD_REFUSED` on the run's event stream (and to the console even without a logger — silence is the failure mode being fixed), names the entity and the key columns, and points at the two places the cause actually lives: the field map, and whether discovery resolved the object's primary key. It returns `'skipped'` rather than throwing, so one misconfigured object is counted instead of taking down the run.

Any connector that returns an empty key reproduces this — a discovery that never resolved a PK, a field map missing the key column, a source that stops returning its id field — so the guard is the invariant that makes the whole class impossible to write.
