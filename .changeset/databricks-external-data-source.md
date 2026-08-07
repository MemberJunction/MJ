---
"@memberjunction/external-data-source-databricks": minor
---

Add `@memberjunction/external-data-source-databricks` — a read-only External Data Source driver (`DatabricksExternalDriver`) for Databricks SQL Warehouses over the official `@databricks/sql` SDK (an optional peer dependency, always HTTPS).

- **Driver** (Workstream B of the Medallion external-sources plan; Snowflake is the structural model): backtick identifier quoting, `LIMIT`/`OFFSET` paging (`LIMIT ALL` offset-only), `:name` named-parameter binds, PAT (`access-token`) and OAuth M2M service-principal (`databricks-oauth`) auth, connection self-heal on rotated credentials, and Unity Catalog `information_schema` introspection including informational (`NOT ENFORCED`) primary/foreign keys. Numeric fidelity comes from the SDK's `preserveBigNumericPrecision` (DECIMAL → exact string, BIGINT → bigint, normalized losslessly), so there is no per-object CAST probe.
- **Metadata**: a "Databricks SQL Warehouse (External)" data-source *type* row and a "Databricks Access Token" credential type (OAuth M2M reuses the existing generic "OAuth2 Client Credentials" type).
- **CodeGen** resolves the driver for external-entity introspection (`@memberjunction/codegen-lib` now depends on and dynamic-imports the package).
- **Tests**: mocked-SDK unit suite plus an opt-in `RUN_DATABRICKS_INTEGRATION=1` integration suite (against the read-only `samples.tpch` fixture), wired as a manual-only CI job.
