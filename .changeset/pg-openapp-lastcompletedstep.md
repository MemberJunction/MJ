---
"@memberjunction/open-app-engine": minor
---

Fix the v5.46.0 PostgreSQL Open App outage. `V202607090600` added `OpenApp.LastCompletedStep` / `LastCompletedStepTargetVersion` + metadata on PostgreSQL but did not bake the CodeGen output (its SQL Server counterpart did), so `__mj."vwOpenApps"` never exposed the columns and every `mj app` operation (install / upgrade / enable / disable / remove) failed with `column "LastCompletedStep" does not exist`. New migration `V202607101200` regenerates the OpenApp view + CRUD sprocs so the columns are exposed.
