-- Migration: Add JSONType columns to EntityField
-- Part of the JSONType strong typing system for entity JSON fields

-- ============================================================================
-- Phase 1: Add JSONType columns to EntityField
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONType NVARCHAR(255) NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONTypeIsArray BIT NOT NULL CONSTRAINT DF_EntityField_JSONTypeIsArray DEFAULT 0;
GO

ALTER TABLE ${flyway:defaultSchema}.EntityField
    ADD JSONTypeDefinition NVARCHAR(MAX) NULL;
GO

-- Extended properties for the new EntityField columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The name of the TypeScript interface/type for this JSON field. When set, CodeGen emits strongly-typed getter/setter using this type instead of the default string getter/setter.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'JSONType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, the field holds a JSON array of JSONType items. The getter returns JSONType[] | null and the setter accepts JSONType[] | null.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'JSONTypeIsArray';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Raw TypeScript code emitted by CodeGen above the entity class definition. Typically contains the interface/type definition referenced by JSONType. Can include imports, multiple types, or any valid TypeScript.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'JSONTypeDefinition';
GO

-- ============================================================================
-- Phase 2: Seed JSONType metadata on DefaultNavItems
-- ============================================================================
-- After CodeGen creates EntityField records for the new columns above,
-- this sets JSONType metadata on DefaultNavItems as the first consumer
-- of the JSONType system.
-- This is idempotent — safe to run multiple times.

-- DefaultNavItems on Applications
IF EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.EntityField ef
    INNER JOIN ${flyway:defaultSchema}.Entity e ON ef.EntityID = e.ID
    WHERE e.Name = 'MJ: Applications'
      AND ef.Name = 'DefaultNavItems'
)
BEGIN
    UPDATE ef
    SET
        ef.JSONType = 'IDefaultNavItem',
        ef.JSONTypeIsArray = 1,
        ef.JSONTypeDefinition = 'export interface IDefaultNavItem {
    /** Display label for the navigation item */
    Label: string;
    /** Font Awesome icon class (e.g., "fa-solid fa-database") */
    Icon: string;
    /** Type of resource: "Dashboards", "Custom", etc. */
    ResourceType: string;
    /** For Dashboard resources, the ID of the dashboard record */
    RecordID?: string | null;
    /** For Custom resources, the registered driver class name */
    DriverClass?: string | null;
    /** Whether this is the default tab when the app opens */
    isDefault?: boolean;
}'
    FROM ${flyway:defaultSchema}.EntityField ef
    INNER JOIN ${flyway:defaultSchema}.Entity e ON ef.EntityID = e.ID
    WHERE e.Name = 'MJ: Applications'
      AND ef.Name = 'DefaultNavItems';
END
GO
