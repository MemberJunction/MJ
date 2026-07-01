---
"@memberjunction/codegen-lib": patch
---

Fix: serialize the IS-A `Entity.ParentID` assignment into the CodeGen_Run migration. `processISARelationshipConfig` previously set `ParentID` on the child entity via a parameterized `runQueryWithParams`, which executes live against the CodeGen database but is **never written to the migration file**. As a result, a clean migrate-only deploy (no live CodeGen run — e.g. an OpenApp consumer building purely from committed migrations) left `Entity.ParentID` NULL, so `IsChildType` was false and creating a Table-Per-Type child record failed on the child→parent FK. The IS-A base view JOIN and the mirrored parent virtual fields were already serialized; only this flag was not. The assignment now runs via `LogSQLAndExecute` (inlined, non-parameterized UPDATE that also stamps `__mj_UpdatedAt`), so it is both executed live and serialized — mirroring `applySoftPKFKConfig`.
