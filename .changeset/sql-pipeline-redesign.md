---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
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
