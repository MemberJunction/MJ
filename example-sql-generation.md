# SQL Generation CLI Examples

## Generate All SQL to File

To generate SQL for all entities without executing:

```bash
npx mj codegen --generate-all-sql --output-file=all-entities.sql
```

This will:
- Generate views, stored procedures (including upserts), indexes, and permissions for ALL entities
- Write everything to `all-entities.sql`
- Skip database execution entirely
- Exit after generation (won't run the rest of CodeGen)

## Generate SQL for Specific Entity

To generate SQL for a single entity:

```bash
npx mj codegen --generate-entity-sql="Actions" --output-file=actions-entity.sql
```

This will:
- Generate SQL only for the "Actions" entity
- Include all SQL objects for that entity (view, procedures, indexes, permissions)
- Write to `actions-entity.sql`
- Skip database execution

## Output File Format

The generated SQL files include:
- Header with timestamp and entity count
- Each entity's SQL separated with clear delimiters
- All objects in execution order (indexes, views, procedures, permissions)
- GO statements between each major section
- Comments indicating entity name and schema

Example output structure:
```sql
-- MemberJunction SQL Generation
-- Generated: 2025-06-20T10:30:00.000Z
-- Entities: 150
-- ========================================

-- ========================================
-- Entity: Actions (__mj.Action)
-- ========================================

-- Indexes, Views, Procedures...
GO

-- Permissions
-- Grant statements...
GO
```

## Use Cases

1. **Migration Files**: Generate complete SQL for deployment to other environments
2. **Code Review**: Review all generated SQL before execution
3. **Documentation**: Keep versioned SQL files for audit purposes
4. **Selective Updates**: Generate SQL for specific entities when making targeted changes