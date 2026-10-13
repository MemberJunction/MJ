---
"@memberjunction/codegen-lib": patch
---

Per-table `Entities` entries in the additionalSchemaInfo config now apply their entity flags (`TrackRecordChanges`, `AllowCaching`, the `Allow*API` flags, `UserViewMaxRows`, …) when CodeGen first creates the entity, not only in a later pass. A table declared `TrackRecordChanges: false` no longer gets `__mj_CreatedAt` / `__mj_UpdatedAt` columns on its first CodeGen run.
