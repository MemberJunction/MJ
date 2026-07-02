---
"@memberjunction/integration-pk-classifier": minor
"@memberjunction/integration-engine": minor
"@memberjunction/server": patch
"@memberjunction/codegen-lib": patch
---

Connector-build framework hardening: SoftPK synthetic-key auto-resolution + DB_ENCRYPT override.

- **SoftPKClassifier**: renamed the synthetic PK column `__mj_integration_IdentityHash` → `IdentityKey` (the reserved `__mj_` prefix was never materialized by the schema builder, so the synthetic tier produced a confident-but-dropped verdict); enabled the synthetic content-hash fallback by default; added a `MIN_STATISTICAL_SAMPLE=8` significance gate on the statistical/composite tiers (stops thin-sample false positives such as nominating a boolean flag); excluded source-declared-nullable fields from PK candidates.
- **IntegrationConnectorCreationPipeline.StagePKClassify**: creates the synthetic IOF when the verdict is `synthetic` (previously skipped an unknown nominee), so ApplyAll materializes the column and `ToExternalRecord` stamps a deterministic content hash — genuinely-keyless objects become syncable + dedupable.
- **MJServer `orm.ts` + CodeGenLib `db-connection.ts`**: `DB_ENCRYPT` env override (defaults ON; only the literal `false` disables) so a local/Docker SQL Server presenting a self-signed cert can be used without TLS rejection.
