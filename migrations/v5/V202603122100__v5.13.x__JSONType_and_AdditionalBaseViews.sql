-- Migration: Add JSONType columns to EntityField and AdditionalBaseViews column to Entity
-- Part of the JSONType strong typing system and AdditionalBaseViews feature

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
-- Phase 2: Add AdditionalBaseViews column to Entity
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.Entity
    ADD AdditionalBaseViews NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional database view registrations for this entity beyond the default BaseView. Each entry specifies a view name, optional description, optional schema, and whether it is user-searchable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Entity',
    @level2type = N'COLUMN', @level2name = 'AdditionalBaseViews';
GO

-- ============================================================================
-- Sync metadata so CodeGen discovers the new columns
-- ============================================================================

EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
GO
