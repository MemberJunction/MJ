---
"@memberjunction/open-app-engine": minor
---

Fix (PostgreSQL): restore the OpenApp base view + CRUD sprocs so `LastCompletedStep` / `LastCompletedStepTargetVersion` are exposed. `V202607090600` added the two columns + metadata on PostgreSQL but — unlike its SQL Server counterpart — did not bake the CodeGen output, so `__mj."vwOpenApps"` never exposed them and every `mj app` operation (install / upgrade / enable / disable / remove) failed on PostgreSQL with `column "LastCompletedStep" does not exist`. New migration `V202607101200__v5.47.x__OpenApp_LastCompletedStep_CodeGen.pg.sql` regenerates the affected views/sprocs.
