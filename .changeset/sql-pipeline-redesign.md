---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/external-change-detection": minor
"@memberjunction/external-data-sources": minor
"@memberjunction/external-data-source-databricks": minor
"@memberjunction/external-data-source-mysql": minor
"@memberjunction/external-data-source-oracle": minor
"@memberjunction/external-data-source-postgres": minor
"@memberjunction/external-data-source-snowflake": minor
"@memberjunction/external-data-source-sqlserver": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/global": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/materialization": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/query-processor": minor
"@memberjunction/react-linter": minor
"@memberjunction/server": minor
"@memberjunction/sql-dialect": minor
"@memberjunction/sql-parser": minor
"@memberjunction/sqlserver-dataprovider": minor
---

SQL pipeline redesign. SQL dialects are split into facets with query-only dialects for external data sources; `@memberjunction/sql-parser` gains a lexer, `QueryTemplate`, the tolerant structural parser `SqlDocument` with span edits, and a strict fragment validator; queries are rendered, then composed, with a lexer-based safety gate, per-request dialects, paging, materialization and field-level security on the rendered statement.

The schema records what the database server reports about a query's output: `QueryField` gains `SourceEntityFieldID` (linked to the entity field, cleared when that field is deleted), `IsNullable` and `SourceObjectName`, and `DetectionMethod` allows `Database` and `Parser`; `Query` gains `ExtractedSQLHash`, `ExtractionStatus` and `ExtractionMessage`. `MJ: Queries` declares `Parameters`, `Fields` and `Entities` collections, so a query and the child rows it declares save as one graph, and declared rows win over extraction for the same name. `mj sync push` saves `relatedEntities` groups through a parent's declared collection, in the parent's graph, and `mj sync pull` writes new records in the `collections` format. Query field nullability and source entity field are part of a query's definition signature.

Every shipped query declares its parameters and output fields in metadata, with field facts taken from the database server's description and primary keys reusing the IDs earlier releases gave the rows. Extraction never changes a row a person authored (`DetectionMethod` `Manual`), and reads a query's stored child rows from the database, so a dialect variant saved in the same push no longer overwrites them. The External Change Detection queries take every value as a server-set parameter, quote identifiers with `sqlIdentifier`, and `ChangeDetector` passes them as `ServerParameters`. `GetAgentRunTree` filters its parameters, the composition demo names its targets by full path, and 17 shipped queries gain PostgreSQL variants.
