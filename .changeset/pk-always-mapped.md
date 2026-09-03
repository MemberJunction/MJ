---
"@memberjunction/server": patch
---

A deselected primary key no longer costs an object its identity.

The table build force-includes primary-key columns whatever the user selected, so the key column
always exists in the created table. The post-restart field-map build did not apply the same rule, so
unticking the key produced a table WITH its key column but no field map carrying `IsKeyField`. The
sync then had no identity to match on and silently fell back to content-hash matching — nothing
errored, records simply stopped being recognised as the same record across syncs, which is how
duplicates and phantom orphans begin.

Nothing enforces selecting the key in the UI, and nothing should: identity is not a preference. The
rule now lives in `selectFieldsToMap` alongside the other entity-map lifecycle decisions, so both
sides of the apply agree and it is unit-tested.
