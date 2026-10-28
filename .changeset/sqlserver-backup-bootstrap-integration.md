---
"@memberjunction/integration-actions": minor
"@memberjunction/integration-connectors": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/external-data-sources": minor
"@memberjunction/external-data-source-mongodb": minor
"@memberjunction/external-data-source-oracle": minor
"@memberjunction/external-data-source-postgres": minor
"@memberjunction/external-data-source-snowflake": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/external-data-source-sqlserver": minor
"@memberjunction/schema-engine": minor
"@memberjunction/integration-progress-artifacts": minor
"@memberjunction/server-bootstrap": minor
---

Add SQL Server backup bootstrap integration actions, Azure blob inspection, and Explorer integration dashboard bootstrap wizard.

### `@memberjunction/server` and `@memberjunction/graphql-dataprovider`
- `IntegrationStartBootstrap` mutation launches the bootstrap as a detached run (the restore and loads take hours) and returns a run ID at once; the action reports every stage onto the run's progress artifact stream, which clients follow with the existing `IntegrationTailRunEvents` / `IntegrationGetRun` queries. `GraphQLIntegrationClient` gains `StartBootstrap`, `GetRun` and `TailRunEvents`.
- The action-run authorization check is shared (`AssertCanRunAction`) between `RunAction` and the bootstrap launch.

### `@memberjunction/external-data-sources` and the EDS drivers
- `ExternalViewParams.seekAfter`: a structured keyset resume point (watermark, keys, and the consumed range of a millisecond-truncated temporal watermark) that each driver renders in its own dialect — identifier quoting, literal formatting, and where the dialect sorts NULL watermarks (PostgreSQL, Oracle and Snowflake sort them last; the rest first). MongoDB renders it as a filter document. Callers never hand-write dialect SQL for a seek.
- Keyset walks in `@memberjunction/integration-connectors` use it instead of a raw `filter`, and trim each page to a watermark boundary so the resume is exact for sub-millisecond timestamps.
- `MJ: Company Integration Record Maps` now sanctions direct SQL insert and delete (metadata), which the bootstrap action's set-based record-map seed requires.

### `@memberjunction/integration-actions`
- **`Bootstrap SQL Server Integration From Backup`**:
  - Implements high-speed local ETL from Azure Blob Storage or local disk `.bak` files into MemberJunction target tables via temporary staging restore.
  - MultiProvider-compliant using `DatabaseProviderBase` and context provider.
  - Fixes SQL Server Msg 302 by using `NEWID()` (replacing `NEWSEQUENTIALID()`) in transfer `SELECT` statements.
  - Fixes Msg 3132 by passing all backup stripes to `RESTORE HEADERONLY` and `RESTORE FILELISTONLY`.
  - Chunked ETL gated on single-column integer primary keys (`tinyint`, `smallint`, `int`, `bigint`), falling back to single set-based `INSERT ... SELECT` for non-integer or composite PKs.
  - Adds `TruncateTargetBeforeLoad` parameter and enforces re-run safety; wraps per-table loads in transactions.
  - Enforces `AllowDirectSQLInsert` data access rule and invalidates `LocalCacheManager` RunView cache on completion.
  - Seeds record maps directly into `__mj.[Company Integration Record Maps]` linking external IDs to target entity record IDs.
  - Validates SQL identifiers via `@memberjunction/schema-engine` and escapes string literals via `EscapeSQLString`.
- **`List Azure Backup Blobs`**:
  - Server-side Azure Blob Storage REST API client discovering `.bak` files in storage containers with prefix filtering and continuation token pagination.
- **`Inspect SQL Server Backup`**:
  - Server-side multi-stripe backup header and file list inspector returning point-in-time timestamp, database name, backup size, and file details.
- **`BaseIntegrationAction`**:
  - Abstract base class with shared parameter extraction, SAS credential resolution, container URL parsing, and backup inspection helpers.
- **`Restore SQL Server Backup To Staging`**, **`Load SQL Server Integration From Staging`** and **`Drop SQL Server Staging Database`**:
  - The bootstrap split into restore, load and drop phases so a server-side job can seed an integration from a backup archive, retry a failed load against the kept staging database, and always clean up. Documented in the package README with the two product decisions (one SQL Server connection per workspace; seeded entities keep no record-change history).

### Archive seed (`@memberjunction/server`, `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-dashboards`)
- Explorer's Add Integration → SQL Server offers **Choose an archive**: restore a backup into a staging database, choose its tables, build them as entities (CodeGen + API restart), load them, then remove the archive. The card then shows **Seeded · source not connected**.
- MJAPI drives it with an `archive-seed` pending-work job that resumes after the restart, exposed through archive seed GraphQL operations and `GraphQLIntegrationClient` methods.
- `@memberjunction/external-data-sources` / `@memberjunction/external-data-source-sqlserver`: `authMode: "host"` connects a SQL Server data source with the host's own SQL login (MJServer registers the resolver at boot; `DefaultDatabase` is required).
- `@memberjunction/schema-engine`: the archive-seed pending-work payload and lookups. `@memberjunction/integration-progress-artifacts`: emitter resume. `@memberjunction/server-bootstrap`: class manifest regenerated.
- Decisions: one SQL Server connection per workspace (a second archive seed fails fast); seeded entities keep record-change history off.
