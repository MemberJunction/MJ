---
"@memberjunction/schema-engine": minor
"@memberjunction/server": minor
"@memberjunction/integration-schema-builder": minor
"@memberjunction/graphql-dataprovider": minor
---

Add Runtime Schema Update (RSU) system for programmatic database table creation. New @memberjunction/schema-engine package provides platform-aware DDL generation with pluggable SQL Server and PostgreSQL providers via ClassFactory. RuntimeSchemaManager orchestrates the full pipeline: validate, execute migration, run CodeGen, compile, restart MJAPI, and commit to git with PR creation. Integration SchemaBuilder delegates DDL generation to SchemaEngine. New integration lifecycle endpoints added to MJServer.
