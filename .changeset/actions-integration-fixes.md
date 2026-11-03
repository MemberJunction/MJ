---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-schema-builder": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
---

Integration engine fixes, with two migrations (minor).

- Connection Configuration `batchSize`, `maxBatchesPerMap` and `watermarkLookbackSeconds`. Reaching the page cap fails the run with `BATCH_CAP_REACHED`; any Critical error fails the run; stale CRUD procedures stop the object after one error (`SchemaNotGeneratedError.Reason = 'Stale'`); monotonic timestamp watermarks re-read a short overlap (300 s for external-data-source connectors).
- SoftDelete on an entity without tombstone columns is refused with `SOFT_DELETE_UNSUPPORTED` instead of counting a delete that never happened. Entity-map `sourceDeleteField` / `sourceDeleteValue` follow `DeleteBehavior` for sources that flag deletions. New `CompanyIntegrationRecordMap.Origin` (`Created` / `Adopted`); the orphan sweep never hard-deletes an adopted row.
- New index `IX_CompanyIntegrationRun_CompanyIntegrationID_StartedAt`; `vwCompanyIntegrations` finds the latest run with `OUTER APPLY`.
- Staging columns keep declared integer, decimal, float, boolean and date types for new columns; CodeGen re-selects a created row NULL-safely on nullable key columns.
- The Integration Connections Create Tables panel shows a listing failure with Retry.
