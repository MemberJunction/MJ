# @memberjunction/external-data-source-databricks

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/external-data-sources@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Add `@memberjunction/external-data-source-databricks` — a read-only External Data Source driver (`DatabricksExternalDriver`) for Databricks SQL Warehouses over the official `@databricks/sql` SDK (an optional peer dependency, always HTTPS).
  - **Driver** (Workstream B of the Medallion external-sources plan; Snowflake is the structural model): backtick identifier quoting, `LIMIT`/`OFFSET` paging (`LIMIT ALL` offset-only), `:name` named-parameter binds, PAT (`access-token`) and OAuth M2M service-principal (`databricks-oauth`) auth, connection self-heal on rotated credentials, and Unity Catalog `information_schema` introspection including informational (`NOT ENFORCED`) primary/foreign keys. Numeric fidelity comes from the SDK's `preserveBigNumericPrecision` (DECIMAL → exact string, BIGINT → bigint, normalized losslessly), so there is no per-object CAST probe.
  - **Metadata**: a "Databricks SQL Warehouse (External)" data-source _type_ row and a "Databricks Access Token" credential type (OAuth M2M reuses the existing generic "OAuth2 Client Credentials" type).
  - **CodeGen** resolves the driver for external-entity introspection (`@memberjunction/codegen-lib` now depends on and dynamic-imports the package).
  - **Tests**: mocked-SDK unit suite plus an opt-in `RUN_DATABRICKS_INTEGRATION=1` integration suite (against the read-only `samples.tpch` fixture), wired as a manual-only CI job.

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/external-data-sources@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
