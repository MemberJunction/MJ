---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/sql-dialect": patch
---

Enable layered base views on PostgreSQL. CodeGen writes the inner view and restars the application-owned outer wrapper so `g.*` re-expands after inner regeneration (no more throw). New pg-only migration ships `spRebindLayeredOuterView` plus core MJ inner/outer views. Open App `mj migrate` rebinds layered outers in the app schema before field heal.
