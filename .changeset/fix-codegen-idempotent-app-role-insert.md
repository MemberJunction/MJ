---
"@memberjunction/codegen-lib": patch
---

Make CodeGen's auto-created application metadata idempotent. When CodeGen encounters a new schema it seeds an `__mj.Application` row plus its default `__mj.ApplicationRole` rows; these INSERTs were emitted bare into the generated migration, so replaying that block against a database where the rows already exist (e.g. after a schema teardown that leaves the app rows behind, an app reinstall, or a re-baseline) collided on `PK_Application_ID` / `UQ_ApplicationRole_App_Role`. Both INSERTs are now wrapped in the existing dialect-aware `conditionalInsert` guard (SQL Server `IF NOT EXISTS`, PostgreSQL `DO`-block) — the Application guarded on `ID`, the ApplicationRole on `(ApplicationID, RoleID)` — so the emitted SQL is safe to re-run. The guard is a no-op on a fresh database, matching the idempotency convention already used for the other folded metadata blocks.
