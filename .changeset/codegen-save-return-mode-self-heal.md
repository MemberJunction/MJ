---
"@memberjunction/codegen-lib": patch
---

Detect `Entity.Configuration.SaveReturnMode` changes on existing `spCreate*` and `spUpdate*` routines during `SQLCodeGenBase.loadExistingRoutines` so running `mj codegen` after `mj sync push` automatically logs and executes the updated stored procedures, and ship the `SaveReturnMode = 'datestamps_only'` stored procedures migration in `migrations/v6/`.
