---
"@memberjunction/open-app-engine": minor
---

Fix the v5.46.0 PostgreSQL Open App outage (`column "LastCompletedStep" does not exist` on every `mj app` operation). `V202607090600` added `OpenApp.LastCompletedStep` / `LastCompletedStepTargetVersion` + EntityField metadata on PG but did not bake the CodeGen output, so `__mj."vwOpenApps"` never exposed the columns.

New migration `V202607101200` is the raw `mj codegen` (PostgreSQL) output against a fresh v5.46-migrated DB (generated with the companion PG-codegen differential fix, so it is the differential emit — ~10 entities — not a 184k full regen). It regenerates the OpenApp base view + CRUD sprocs to expose the two columns, and additionally normalizes drifted seed metadata (SS-style type-names/lengths, timestamp defaults) for a handful of recent PG entities that codegen legitimately corrects. The `EntityFieldValue` inserts for the LastCompletedStep value list are guarded with `WHERE NOT EXISTS` so databases that used the documented "run `mj codegen` after migrating" v5.46 workaround don't get duplicate value-list rows (`EntityFieldValue` has no unique key on `(EntityFieldID, Value)`).
