---
"@memberjunction/cli": minor
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

Every shipped query declares its parameters and output fields in metadata, with field facts taken from the database server's description and primary keys reusing the IDs earlier releases gave the rows. Extraction reads a query's stored child rows from the database, so a dialect variant saved in the same push no longer overwrites them. The External Change Detection queries take every value as a server-set parameter, quote identifiers with `sqlIdentifier`, and `ChangeDetector` passes them as `ServerParameters`. `GetAgentRunTree` filters its parameters, the composition demo names its targets by full path, and 17 shipped queries gain PostgreSQL variants.

Saving a new or edited query now extracts its metadata from the database server's description of the query (the base render and one render per `{% if %}` branch) and MJ's template parser: output fields with exact types, nullability and their source entity field, parameters with composition pass-throughs, the entities it reads (`DetectionMethod` `Parser` on parameters and entity links), and its dependencies. Facts are corrected on every row; authored annotations (descriptions, a `Manual` parameter's type, default, sample and filters) are kept, doc comments (`{# @param / @field #}`, trailing `--:`) count as authored, and an authored parameter the SQL no longer uses is kept and flagged. Save-time rule errors and repeated output column names refuse the save, and `CreateQueryExtended` / `UpdateQueryExtended` return the reasons. `UsesTemplate` comes from the lexer, `ExtractedSQLHash`, `ExtractionStatus` and `ExtractionMessage` record each run (external-data-source queries are `Skipped`, a describe failure is an `Error` that keeps the stored rows), the derived rows are written as the system user, and the LLM only fills empty descriptions after the save commits (skipped with `SkipEntityAIActions`). `MJQueryEntityServer.ExtractionOverride` (`Auto` / `Skip` / `Force`) controls extraction per save, and `SkipEmbeddings` is honoured. `CreateQueryExtended` with `AutoResolveCollision` gives every concurrent request its own query (#6007), and its existence checks read the database uncached.

Saved queries can be refreshed on demand without changing their SQL: `QueryExtractionService` (`RefreshQuery`, `RefreshQueries` by ID, name or full path, category path, entity read, or all) runs the same extraction a save runs, one transaction per query and the queries a composition depends on first, with a dry run that reports the changes without writing and an optional LLM description pass. Each query gets a report: its outcome, the child rows added, updated and removed, flagged parameters and the run's diagnostics. A refresh needs Update on `MJ: Queries` and Create, Update and Delete on its child entities (a dry run too), and read access to every entity the query reads with no field denied; a refused single query reads exactly like one that does not exist, and a bulk run reports it as skipped. The entry points are the `Query.RefreshExtraction` remote operation (long-running with progress; API keys need the new `query:refresh` scope), `mj query refresh [--id|--name|--category|--entity|--all] [--dry-run] [--with-ai]`, and a CodeGen pass that re-binds the queries reading an entity whose fields were added, dropped or changed type, recording a query the change broke as an `Error` with the server's message and warning when a query authorized by its role list gains a field-restricted column. A query that reads a table named by a template parameter (the External Change Detection queries) keeps its declared fields instead of describing a sample table.

**Upgrading:** after migrating, run `mj query refresh --all --dry-run` to review, then `mj query refresh --all`, so every existing query's fields, parameters, entities and Extraction columns are established from its SQL and the database server.
