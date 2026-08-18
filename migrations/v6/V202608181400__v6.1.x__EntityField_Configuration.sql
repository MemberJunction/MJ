-- =============================================================================
-- EntityField.Configuration — Extensible field-level configuration bag (JSONType)
-- including Hierarchy options (IsHierarchy, MaxDepth) for recursive foreign keys.
-- =============================================================================
--
-- WHAT THIS ENABLES:
--   1. Replaces hardcoded proxies and naming heuristics with explicit, typed
--      field-level metadata configuration (shape = IEntityFieldConfiguration).
--   2. Gates 4-function Table-Valued Function (TVF) hierarchy suites, base view
--      lateral joins (Root/Depth/Path/IsLeaf/ChildCount), and entity subclass
--      traversal methods behind explicit opt-in (Hierarchy.IsHierarchy = 1).
--   3. Prevents accidental self-referencing foreign keys (such as LastRunID,
--      ConsolidatedIntoNoteID, ReplacedByID, MergedIntoID, PreviousVersionID)
--      from generating unwanted hierarchy TVFs and base view lateral joins.
--
-- SEEDING:
--   Seeds {"Hierarchy":{"IsHierarchy":true}} for all self-referencing foreign keys
--   named 'ParentID' in the core MJ schema.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[EntityField]
    ADD [Configuration] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON configuration bag defining field-level policies and capabilities (shape = IEntityFieldConfiguration). Includes Hierarchy options (IsHierarchy, MaxDepth) to explicitly declare recursive tree hierarchies.',
    @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',   @level1name = N'EntityField',
    @level2type = N'COLUMN',  @level2name = N'Configuration';
GO

-- Refresh base view so [Configuration] is exposed
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFields';
GO

-- Register EntityField.Configuration in metadata catalog (apply-time sequence)
IF NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] 
    WHERE ID = '4f8b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b' 
       OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Configuration')
) BEGIN
    INSERT INTO [${flyway:defaultSchema}].[EntityField]
    (
        [ID],
        [EntityID],
        [Sequence],
        [Name],
        [DisplayName],
        [Description],
        [Type],
        [Length],
        [Precision],
        [Scale],
        [AllowsNull],
        [DefaultValue],
        [AutoIncrement],
        [AllowUpdateAPI],
        [IsVirtual],
        [IsPrimaryKey],
        [IsUnique],
        [IncludeInUserSearchAPI],
        [FullTextSearchEnabled],
        [IncludeInGeneratedForm],
        [GeneratedFormSection],
        [JSONType],
        [JSONTypeIsArray],
        [JSONTypeDefinition],
        [__mj_CreatedAt],
        [__mj_UpdatedAt]
    )
    SELECT
        '4f8b9e12-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6',
        COALESCE(MAX(Sequence), 0) + 1,
        'Configuration',
        'Configuration',
        'Optional JSON configuration bag defining field-level policies and capabilities (shape = IEntityFieldConfiguration). Includes Hierarchy options (IsHierarchy, MaxDepth) to explicitly declare recursive tree hierarchies.',
        'nvarchar',
        -1,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        1,
        'Advanced',
        'IEntityFieldConfiguration',
        0,
        '@file:JSONType-interfaces/IEntityFieldConfiguration.ts',
        GETUTCDATE(),
        GETUTCDATE()
    FROM [${flyway:defaultSchema}].[EntityField]
    WHERE [EntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6';
END
GO

-- Seed Hierarchy.IsHierarchy = true for all self-referencing ParentID fields in core schema
UPDATE [${flyway:defaultSchema}].[EntityField]
SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [Name] = 'ParentID'
  AND [RelatedEntityID] = [EntityID]
  AND ([Configuration] IS NULL OR [Configuration] = '');
GO
