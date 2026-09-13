---
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
---

Open App CodeGen writes `CodeGen_Run_*.sql` (EntityField INSERTs) to the app's `migrations/codegen` when cwd has `mj-app.json`. Running from the MJ repo with `includeSchemas` set to an app schema fails instead of dumping metadata SQL into `MJ/migrations/v*`. If SQLOutput is enabled but no log file is open, metadata SQL is not applied. `--sql-output-dir` overrides the folder.
