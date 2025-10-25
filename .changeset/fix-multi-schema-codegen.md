---
"@memberjunction/codegen-lib": minor
---

Fix multi-schema support: EntityFields now properly created for entities in non-core schemas

### Problem
CodeGen was failing to create EntityField records for entities in non-core schemas (e.g., Skip.Component), causing "does not have a primary key field defined" errors and preventing SQL generation.

### Root Cause
Two critical issues in SQL views that CodeGen depends on:

1. **vwSQLTablesAndEntities**: WHERE clause only included tables with existing entities, preventing discovery of new tables
2. **vwSQLColumnsAndEntityFields**: FilteredColumns CTE incorrectly filtered columns by default_object_id

### Solution
- Fixed vwSQLTablesAndEntities to include all tables for discovery while respecting VirtualEntity flag for views
- Removed buggy FilteredColumns CTE from vwSQLColumnsAndEntityFields
- Updated both migration file and MJ_BASE_BEFORE_SQL.sql to ensure fixes persist

This enables proper multi-schema support, allowing CodeGen to discover and process entities across all database schemas.