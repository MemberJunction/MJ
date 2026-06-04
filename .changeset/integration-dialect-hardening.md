---
"@memberjunction/codegen-lib": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
"@memberjunction/integration-engine": patch
"@memberjunction/core-entities-server": patch
---

fix(integration): cross-dialect hardening for the integration sync pipeline (PostgreSQL + SQL Server)

Bugs found and fixed while proving the framework end-to-end on both dialects with live generated actions:

- **`@memberjunction/codegen-lib`** — PostgreSQL CRUD generation emitted the primary-key column twice for composite-PK entities, so association/junction tables never synced on PG; `PostgreSQLCodeGenProvider` now treats a multi-column PK as strategy-handled. Separately, `advanced_generation` gained a per-call timeout + circuit breaker so a non-responding model degrades the run instead of hanging it.
- **`@memberjunction/server`** — wired the PostgreSQL branch of the in-process CodeGen runner (`RuntimeSchemaManager.SetCodeGenRunner`) that previously existed only for SQL Server, so runtime schema sync no longer falls back to a hang-prone child process on PG. `IntegrationDiscoveryResolver` entity/field-map creation is now create-or-reuse (idempotent on re-apply), and its idempotency + operational list reads use `BypassCache` so create-vs-update decisions read committed state.
- **`@memberjunction/integration-engine`** — `MatchEngine.FindRecordMapEntry` and the bulk record-map load now read committed state (`BypassCache`), fixing duplicate-create after a direct-DB change; watermark save/load is idempotent to avoid a transaction-abort on retry.
- **`@memberjunction/core-actions`** — the generated integration-action executor used stale entity names (`'Integrations'`, `'Company Integrations'`); corrected to `'MJ: Integrations'` / `'MJ: Company Integrations'` so `List`/`Get` invoke successfully.
- **`@memberjunction/core-entities-server`** — declares its previously-undeclared `@memberjunction/integration-pk-classifier` dependency (used by the server-side LLM PK-detection callback), fixing the missing-dependency check; covers the integration server-entity behavior (`MJCompanyIntegrationEntityServer`, `IntegrationLLMPKCallback`).
- **Multi-provider safety** — the post-pipeline metadata `Refresh()` calls in `IntegrationDiscoveryResolver` and `MJCompanyIntegrationEntityServer` now refresh the request's own provider (`provider ?? new Metadata()`) instead of the global default, satisfying the `MultiProviderCompliance` gate and refreshing the correct cache under a non-default provider.
