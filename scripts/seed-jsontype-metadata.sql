-- ============================================================================
-- Seed JSONType Metadata for Entity.AdditionalBaseViews
-- ============================================================================
-- This script sets JSONType, JSONTypeIsArray, and JSONTypeDefinition on the
-- EntityField record for Entity.AdditionalBaseViews, making it the first
-- consumer of the JSONType system.
--
-- WHEN TO RUN: After the V202604021200 migration AND a CodeGen run.
-- The migration adds the columns; CodeGen creates the EntityField records;
-- this script configures JSONType metadata on the AdditionalBaseViews field.
--
-- This is idempotent — safe to run multiple times.
--
-- Run: sqlcmd -S localhost -d <database> -i scripts/seed-jsontype-metadata.sql
--   or via SSMS after replacing ${flyway:defaultSchema} with __mj
-- ============================================================================

-- Verify the EntityField record exists before updating
IF EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.EntityField ef
    INNER JOIN ${flyway:defaultSchema}.Entity e ON ef.EntityID = e.ID
    WHERE e.Name = 'MJ: Entities'
      AND ef.Name = 'AdditionalBaseViews'
)
BEGIN
    UPDATE ef
    SET
        ef.JSONType = 'IAdditionalBaseView',
        ef.JSONTypeIsArray = 1,
        ef.JSONTypeDefinition = 'export interface IAdditionalBaseView {
    /** Name of the database view (e.g., "vwEntitiesWithPermissions") */
    Name: string;
    /** Human-readable description of what this view provides */
    Description?: string | null;
    /** Database schema containing the view. Defaults to entity''s SchemaName if omitted. */
    SchemaName?: string | null;
    /** If true, RunView/search operations can consider this view */
    UserSearchable?: boolean;
}'
    FROM ${flyway:defaultSchema}.EntityField ef
    INNER JOIN ${flyway:defaultSchema}.Entity e ON ef.EntityID = e.ID
    WHERE e.Name = 'MJ: Entities'
      AND ef.Name = 'AdditionalBaseViews';

    PRINT 'SUCCESS: JSONType metadata set on Entity.AdditionalBaseViews';
    PRINT '  JSONType = IAdditionalBaseView';
    PRINT '  JSONTypeIsArray = 1 (true)';
    PRINT '  JSONTypeDefinition = IAdditionalBaseView interface';
    PRINT '';
    PRINT 'Next step: Run CodeGen again to generate typed getter/setter in entity_subclasses.ts';
END
ELSE
BEGIN
    PRINT 'WARNING: EntityField record for Entity.AdditionalBaseViews not found.';
    PRINT 'This means CodeGen has not yet run after the V202604021200 migration.';
    PRINT '';
    PRINT 'Deployment sequence:';
    PRINT '  1. Apply migration V202604021200 (adds columns)';
    PRINT '  2. Run CodeGen (creates EntityField records)';
    PRINT '  3. Run this script (sets JSONType metadata)';
    PRINT '  4. Run CodeGen again (generates typed getter/setter)';
END
GO
