---
"@memberjunction/integration-actions": minor
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-engine": minor
"@memberjunction/integration-progress-artifacts": minor
"@memberjunction/external-data-sources": minor
"@memberjunction/external-data-source-sqlserver": minor
"@memberjunction/external-data-source-mongodb": minor
"@memberjunction/external-data-source-oracle": minor
"@memberjunction/external-data-source-postgres": minor
"@memberjunction/external-data-source-snowflake": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/schema-engine": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/integration-test-suite": minor
---

Seed a SQL Server integration from a backup, and keyset seek pagination for external data sources.

- **Backup actions** (`@memberjunction/integration-actions`): Bootstrap, Inspect, List Azure Backup Blobs, and the phase actions Restore / Load / Drop for a staging database. Set-based load into the integration's tables with record maps and watermarks seeded to the backup date. Backup sources, target directories and container URLs are validated (Azure Blob hosts only, no UNC, optional `MJ_BACKUP_DISK_ROOTS` / `MJ_STAGING_FILE_ROOTS`); drops are guarded (`MJ_Staging_` prefix, `CreatedAfter`); truncation requires `AllowDirectSQLDelete`; a stored credential is used only if the caller can read it.
- **Authorization**: the backup actions require `Integrations: Bootstrap From Backup`, granted to the Developer and Integration roles.
- **Archive seed** (`@memberjunction/server`, `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-dashboards`): Add Integration → SQL Server → *Choose an archive* restores a backup, offers its user-schema base tables, builds them as entities, loads them and removes the archive, driven by a resumable `archive-seed` job and GraphQL operations (start, select tables, finish, cancel, state). Managing a job requires being its owner or able to update the connection. Failed seeds can be deleted or are replaced by the next seed.
- **Host auth mode** (`@memberjunction/external-data-sources`, SQL Server driver): a data source may read an `MJ_Staging_` database with MJAPI's own login; any other database is refused.
- **Keyset seek pagination**: `ExternalViewParams.seekAfter` renders a structured resume point per dialect (SQL drivers and MongoDB), exact across `datetime` rounding and sub-millisecond watermark buckets.
- **Discovery** (`@memberjunction/integration-engine`, `@memberjunction/integration-connectors`): `ListSchemas`, `IntrospectSchemaOptions.Schemas` and `BaseTablesOnly`; persisted primary-key flags no longer flip between discoveries of the shared catalog.

Prerequisites for an instance (SQL login grants, `ALLOW_RUNTIME_SCHEMA_UPDATE`, restart mechanism, `RSU_WORK_DIR`) and the product decisions are in the `@memberjunction/integration-actions` README.
