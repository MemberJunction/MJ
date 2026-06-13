---
"@memberjunction/codegen-lib": patch
---

fix(codegen): invalidate the soft-PK/FK config cache per in-process run

`ManageMetadataBase.getSoftPKFKConfig()` caches the parsed `additionalSchemaInfo`
keyed on the file PATH only, never reloading for the life of the process. Correct
for a one-shot `mj codegen` CLI run, but STALE in the long-lived in-process (RSU)
CodeGen path inside MJAPI: RSU rewrites `additionalSchemaInfo` on every ApplyAll, so
a connector's first ApplyAll wrote its soft PKs but CodeGen returned the pre-write
cached config → "No primary key found" → the entity was never created → no entity
map → 0 rows synced until an MJAPI restart. `RunInProcess` now calls a new
`invalidateSoftPKFKConfigCache()` at the start of each run (always after RSU's
WriteAdditionalSchemaInfo), so each run re-reads the freshly-written file.
Deterministic + event-driven (no mtime / TOCTOU). The CLI `Run()` path is unchanged.
