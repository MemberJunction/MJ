---
"@memberjunction/server": patch
"@memberjunction/codegen-lib": patch
---

fix(agents): Pass dataSource context to agent execution.

feat(codegen): Sync SchemaInfo from database schemas with extended properties. CodeGen now automatically synchronizes SchemaInfo records from database schemas, capturing MS_Description extended properties as schema descriptions. This includes a new Description column on SchemaInfo table, vwSQLSchemas view for querying schemas with extended properties, spUpdateSchemaInfoFromDatabase stored procedure for automatic sync, and integration into the CodeGen workflow to run on every execution.
