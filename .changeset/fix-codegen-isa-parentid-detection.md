---
"@memberjunction/codegen-lib": patch
---

fix(codegen): auto-detect IS-A `Entity.ParentID` from the shared PK/FK shape. CodeGen previously set `Entity.ParentID` for IS-A (Table-Per-Type) children only when the pair was declared in `additionalSchemaInfo` config, so a child table whose single PK column is also an FK to another table's PK (e.g. `AccountingCompanyProfile ⊂ __mj.Company`) landed with `ParentID = NULL` — leaving `IsChildType` false and the runtime IS-A behaviours (NewRecord parent-minting, subtype forms, RootParentID) dormant. `manageMetadata` now detects the shape from the schema (single non-virtual PK that is also an FK referencing the parent's single PK column; ordinary FKs and composite PKs are excluded) and stamps `Entity.ParentID` via the same serialize-into-migration path the config route uses, so clean deploys get it too. Idempotent; an explicit config entry still overrides.
