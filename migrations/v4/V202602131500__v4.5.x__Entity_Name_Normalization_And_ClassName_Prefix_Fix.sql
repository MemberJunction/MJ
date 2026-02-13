-- =============================================================================
-- Migration: Entity Name Normalization & ClassName Prefix Fix
-- Version:   v4.5.x (preparing for v5.0 breaking change)
-- Purpose:   1. Create StripToAlphanumeric helper function
--            2. Rename all unprefixed __mj entities to use "MJ: " prefix
--            3. Set DisplayName to preserve the old short name for UI
--            4. Update vwEntities to incorporate SchemaInfo.EntityNamePrefix
--               into ClassName and CodeName computations, preventing cross-schema
--               class name collisions
-- =============================================================================

-- STEP -1, fix view to point to correct entity names

DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwEntityFieldsWithCheckConstraints
GO
CREATE VIEW ${flyway:defaultSchema}.vwEntityFieldsWithCheckConstraints
AS
SELECT
    e.ID as EntityID,
    e.Name as EntityName,
    ef.ID as EntityFieldID,
    ef.Name as EntityFieldName,
	  gc.ID as GeneratedCodeID,
	  gc.Name as GeneratedValidationFunctionName,
	  gc.Description as GeneratedValidationFunctionDescription,
    gc.Code as GeneratedValidationFunctionCode,
    gc.Source as GeneratedValidationFunctionCheckConstraint,
    sch.name AS SchemaName,
    obj.name AS TableName,
    col.name AS ColumnName,
    cc.name AS ConstraintName,
    cc.definition AS ConstraintDefinition
FROM
    sys.check_constraints cc
INNER JOIN
    sys.objects obj ON cc.parent_object_id = obj.object_id
INNER JOIN
    sys.schemas sch ON obj.schema_id = sch.schema_id
INNER JOIN
	${flyway:defaultSchema}.Entity e
	ON
	e.SchemaName = sch.Name AND
	e.BaseTable = obj.name
LEFT OUTER JOIN -- left join since can have table level constraints
    sys.columns col ON col.object_id = obj.object_id AND col.column_id = cc.parent_column_id
LEFT OUTER JOIN -- left join since can have table level constraints
  ${flyway:defaultSchema}.EntityField ef
  ON
  e.ID = ef.EntityID AND
  ef.Name = col.name
LEFT OUTER JOIN
  ${flyway:defaultSchema}.vwGeneratedCodes gc
  ON -- EITHER JOIN ON EntityField or Entity depending on which type of constraint we have here
  (   (ef.ID IS NOT NULL AND gc.LinkedEntity='MJ: Entity Fields' AND gc.LinkedRecordPrimaryKey=ef.ID)
        OR
      (ef.ID IS NULL and gc.LinkedEntity='MJ: Entities' AND gc.LinkedRecordPrimaryKey=e.ID)
  ) AND -- MUST MATCH Source=definition
  cc.definition = gc.Source
GO


-- =============================================================================
-- Step 0: Promote Gemini 3 Flash to highest priority for all CodeGen AI prompts
-- (Cerebras is unreliable; Gemini 3 Flash is fast and reliable for these tasks)
-- =============================================================================

-- Check Constraint Parser
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = '51508C0F-9DAD-4BB6-9CD7-067DCFA64159';
-- Transitive Join Intelligence
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = '3E53C8B1-20C9-4597-BBD2-0BB28C29A96F';
-- Virtual Entity Field Decoration
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = '6BA72939-D8CD-456E-8AC7-DEA85E3AEE56';
-- Form Layout Generation
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = 'A117EB14-411D-4590-A8DC-F9AF5C82DA5D';
-- Smart Field Identification
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = '7C6CC54F-6038-4DAB-810C-0D18A1CC659B';
-- Entity Description Generation
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = '25554962-6B1A-4FEC-9C76-B69841F06182';
-- Entity Name Generation
UPDATE [${flyway:defaultSchema}].[AIPromptModel] SET Priority = 10 WHERE ID = '8FD93F85-E4FB-4658-9260-2E93CE1E562C';


-- =============================================================================
-- STEP 1: Create StripToAlphanumeric helper function
-- =============================================================================
PRINT N'Creating StripToAlphanumeric helper function'
GO

IF OBJECT_ID('[${flyway:defaultSchema}].StripToAlphanumeric', 'FN') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].StripToAlphanumeric;
GO

CREATE FUNCTION [${flyway:defaultSchema}].StripToAlphanumeric(@input NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    DECLARE @output NVARCHAR(MAX) = '';
    DECLARE @i INT = 1;
    DECLARE @currentChar NCHAR(1);

    WHILE @i <= LEN(@input)
    BEGIN
        SET @currentChar = SUBSTRING(@input, @i, 1);
        IF @currentChar LIKE '[A-Za-z0-9]'
            SET @output = @output + @currentChar;
        SET @i = @i + 1;
    END;

    RETURN @output;
END;
GO
GRANT EXEC ON [${flyway:defaultSchema}].StripToAlphanumeric TO public
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- =============================================================================
-- STEP 2: Conflict check — ensure no name collisions will occur
-- =============================================================================
PRINT N'Checking for potential name conflicts before rename'
GO

IF EXISTS (
    SELECT 1
    FROM [${flyway:defaultSchema}].Entity e1
    INNER JOIN [${flyway:defaultSchema}].Entity e2
        ON e2.Name = 'MJ: ' + e1.Name
    WHERE e1.SchemaName = '${flyway:defaultSchema}'
      AND e1.Name NOT LIKE 'MJ: %'
      AND e1.Name NOT LIKE 'MJ:%'
)
BEGIN
    RAISERROR(N'CONFLICT: One or more ${flyway:defaultSchema} entities would collide with an existing "MJ: " prefixed entity name. Aborting migration.', 16, 1);
    SET NOEXEC ON;
END
GO

-- =============================================================================
-- STEP 3: Set DisplayName for entities being renamed
--         This preserves the short, user-friendly name in the Explorer UI.
--         Only sets DisplayName where it is currently NULL (not manually set).
-- =============================================================================
PRINT N'Setting DisplayName for entities that will be renamed'
GO

UPDATE [${flyway:defaultSchema}].Entity
SET DisplayName = Name
WHERE SchemaName = '${flyway:defaultSchema}'
  AND Name NOT LIKE 'MJ: %'
  AND Name NOT LIKE 'MJ:%'
  AND DisplayName IS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- Also set DisplayName for entities that ALREADY have the "MJ: " prefix
-- but don't yet have a DisplayName set. Strip the "MJ: " for the display name.
UPDATE [${flyway:defaultSchema}].Entity
SET DisplayName = SUBSTRING(Name, 5, LEN(Name) - 4)
WHERE SchemaName = '${flyway:defaultSchema}'
  AND (Name LIKE 'MJ: %')
  AND DisplayName IS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- =============================================================================
-- STEP 4: Rename all unprefixed ${flyway:defaultSchema} entities to add "MJ: " prefix
-- =============================================================================
PRINT N'Renaming unprefixed ${flyway:defaultSchema} entities to add "MJ: " prefix'
GO

UPDATE [${flyway:defaultSchema}].Entity
SET Name = 'MJ: ' + Name
WHERE SchemaName = '${flyway:defaultSchema}'
  AND Name NOT LIKE 'MJ: %'
  AND Name NOT LIKE 'MJ:%'
GO
IF @@ERROR <> 0 SET NOEXEC ON

PRINT N'Entity rename complete. Verifying counts...'
GO

-- Log how many entities now have the prefix vs not
DECLARE @totalMJ INT, @prefixed INT, @unprefixed INT;
SELECT @totalMJ = COUNT(*) FROM [${flyway:defaultSchema}].Entity WHERE SchemaName = '${flyway:defaultSchema}';
SELECT @prefixed = COUNT(*) FROM [${flyway:defaultSchema}].Entity WHERE SchemaName = '${flyway:defaultSchema}' AND Name LIKE 'MJ: %';
SELECT @unprefixed = COUNT(*) FROM [${flyway:defaultSchema}].Entity WHERE SchemaName = '${flyway:defaultSchema}' AND Name NOT LIKE 'MJ: %';
PRINT N'Total ${flyway:defaultSchema} entities: ' + CAST(@totalMJ AS NVARCHAR(10));
PRINT N'  With MJ: prefix: ' + CAST(@prefixed AS NVARCHAR(10));
PRINT N'  Without prefix:  ' + CAST(@unprefixed AS NVARCHAR(10)) + N' (should be 0)';
GO

-- =============================================================================
-- STEP 5: Update vwEntities view
--         - ClassName now incorporates SchemaInfo.EntityNamePrefix
--         - CodeName now strips the prefix cleanly (no underscore artifacts)
--         - BaseTableCodeName remains unchanged (schema-unaware by design)
-- =============================================================================
PRINT N'Updating vwEntities with prefix-aware ClassName and CodeName'
GO

IF OBJECT_ID('[${flyway:defaultSchema}].vwEntities', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].vwEntities;
GO

CREATE VIEW [${flyway:defaultSchema}].vwEntities
AS
SELECT
    e.*,
    /* CodeName: Derived from entity Name with clean prefix handling.
       When a schema has EntityNamePrefix configured, we strip the prefix from the Name,
       prepend the alphanumeric-only version of the prefix, then remove spaces.
       This produces clean names like "MJAIModels" instead of "MJ_AIModels". */
    [${flyway:defaultSchema}].GetProgrammaticName(
        ISNULL([${flyway:defaultSchema}].StripToAlphanumeric(si.EntityNamePrefix), '') +
        REPLACE(
            IIF(si.EntityNamePrefix IS NOT NULL,
                REPLACE(e.Name, si.EntityNamePrefix, ''),
                e.Name
            ),
            ' ',
            ''
        )
    ) AS CodeName,
    /* ClassName: Incorporates schema EntityNamePrefix for cross-schema collision prevention.
       When a schema has EntityNamePrefix configured, the cleaned prefix is prepended to
       BaseTable + NameSuffix. For schemas without a prefix, behavior is unchanged. */
    [${flyway:defaultSchema}].GetProgrammaticName(
        ISNULL([${flyway:defaultSchema}].StripToAlphanumeric(si.EntityNamePrefix), '') +
        e.BaseTable +
        ISNULL(e.NameSuffix, '')
    ) AS ClassName,
    [${flyway:defaultSchema}].GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS BaseTableCodeName,
    par.Name ParentEntity,
    par.BaseTable ParentBaseTable,
    par.BaseView ParentBaseView
FROM
    [${flyway:defaultSchema}].Entity e
LEFT OUTER JOIN
    [${flyway:defaultSchema}].Entity par
ON
    e.ParentID = par.ID
LEFT OUTER JOIN
    [${flyway:defaultSchema}].SchemaInfo si
ON
    e.SchemaName = si.SchemaName
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- =============================================================================
-- STEP 6: Refresh dependent views that reference vwEntities
--         These views pull CodeName/ClassName from vwEntities and need refreshing
--         so their column metadata stays in sync.
-- =============================================================================
PRINT N'Refreshing dependent views'
GO

-- vwEntityFields references e.CodeName EntityCodeName, e.ClassName EntityClassName
IF OBJECT_ID('[${flyway:defaultSchema}].vwEntityFields', 'V') IS NOT NULL
    EXEC sp_refreshview '[${flyway:defaultSchema}].vwEntityFields';
GO

-- vwEntityRelationships references relatedEntity.ClassName, relatedEntity.CodeName
IF OBJECT_ID('[${flyway:defaultSchema}].vwEntityRelationships', 'V') IS NOT NULL
    EXEC sp_refreshview '[${flyway:defaultSchema}].vwEntityRelationships';
GO

-- vwApplicationEntities references e.CodeName EntityCodeName, e.ClassName EntityClassName
IF OBJECT_ID('[${flyway:defaultSchema}].vwApplicationEntities', 'V') IS NOT NULL
    EXEC sp_refreshview '[${flyway:defaultSchema}].vwApplicationEntities';
GO

-- vwEntitiesWithExternalChangeTracking is a simple filter on vwEntities
IF OBJECT_ID('[${flyway:defaultSchema}].vwEntitiesWithExternalChangeTracking', 'V') IS NOT NULL
    EXEC sp_refreshview '[${flyway:defaultSchema}].vwEntitiesWithExternalChangeTracking';
GO

-- vwEntitiesWithMissingBaseTables references vwEntities
IF OBJECT_ID('[${flyway:defaultSchema}].vwEntitiesWithMissingBaseTables', 'V') IS NOT NULL
    EXEC sp_refreshview '[${flyway:defaultSchema}].vwEntitiesWithMissingBaseTables';
GO

-- =============================================================================
-- STEP 7: Add/update extended properties for key columns
--         These descriptions flow into EntityField.Description via CodeGen's
--         vwSQLColumnsAndEntityFields, providing rich documentation in generated
--         TypeScript code and the Explorer UI.
-- =============================================================================
PRINT N'Adding extended properties for vwEntities computed columns and Entity table columns'
GO

-- ---------------------------------------------------------------------------
-- vwEntities VIEW columns (computed/virtual — no extended properties existed)
-- ---------------------------------------------------------------------------

-- ClassName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema-aware programmatic class name used for TypeScript entity classes, Zod schemas, and Angular form components. Computed as GetProgrammaticName(StripToAlphanumeric(SchemaInfo.EntityNamePrefix) + BaseTable + NameSuffix). For the core MJ schema with prefix "MJ: ", a table named "AIModel" produces ClassName "MJAIModel", yielding class MJAIModelEntity. For schemas without a prefix configured, ClassName equals BaseTableCodeName. This prevents cross-schema collisions when two schemas have tables with the same name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'VIEW',   @level1name = N'vwEntities',
    @level2type = N'COLUMN', @level2name = N'ClassName'
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- CodeName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema-aware programmatic code name derived from the entity Name. Computed by stripping the EntityNamePrefix from the Name, removing spaces, and prepending the alphanumeric-only prefix. For "MJ: AI Models" with prefix "MJ: ", this produces "MJAIModels". For entities in schemas without a prefix, this is simply the entity Name with spaces removed and non-alphanumeric characters replaced. Used in GraphQL type generation and internal code references.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'VIEW',   @level1name = N'vwEntities',
    @level2type = N'COLUMN', @level2name = N'CodeName'
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- BaseTableCodeName
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Programmatic name derived solely from BaseTable + NameSuffix, intentionally schema-unaware. Unlike ClassName (which incorporates the schema prefix), BaseTableCodeName always matches the raw SQL table name. Used for SQL generation, table references, and cases where the physical table identity is needed without schema disambiguation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'VIEW',   @level1name = N'vwEntities',
    @level2type = N'COLUMN', @level2name = N'BaseTableCodeName'
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- ---------------------------------------------------------------------------
-- Entity TABLE columns
-- ---------------------------------------------------------------------------

-- Entity.Name (no extended property existed)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The canonical, unique name for this entity. For entities in schemas with an EntityNamePrefix configured (e.g., "MJ: " for the core schema), the Name includes the prefix: "MJ: AI Models", "MJ: Users", etc. This is the value used in GetEntityObject(), RunView({ EntityName }), and @RegisterClass decorators. The DisplayName column provides the shorter, UI-friendly alternative without the prefix.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'Name'
GO
IF @@ERROR <> 0 SET NOEXEC ON

-- Entity.DisplayName (extended property exists — update it)
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'User-friendly display name shown in the Explorer UI and other interfaces. When set, this is used instead of the entity Name for display purposes. Typically contains the entity name without the schema prefix — e.g., "AI Models" when Name is "MJ: AI Models". If NULL, the UI falls back to using the full Name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'DisplayName'
GO
IF @@ERROR <> 0 SET NOEXEC ON

PRINT N'Migration complete: Entity names normalized with MJ: prefix, vwEntities updated with prefix-aware ClassName/CodeName, extended properties added'
GO



-- STEP 8 - fix up one legacy record in the DisplayComponentConfiguration table


UPDATE ${flyway:defaultSchema}.EntityRelationship
SET DisplayComponentConfiguration = REPLACE(
    DisplayComponentConfiguration,
    '"Communication Base Message Types"',
    '"MJ: Communication Base Message Types"'
)
WHERE ID='0BC657AB-B84E-4C5C-AEAC-F4DE8C998BE8'























































-- Refresh metadata for various SQL objects since we modified some core bits above
-- Adding the timestamp here ensures the checksum changes each time so this runs every time
-- ${flyway:timestamp}

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1





























































-- CODE GEN RUN
/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25) = NULL,
    @DisplayName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25),
    @DisplayName nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder,
        [AutoRowCountFrequency] = @AutoRowCountFrequency,
        [RowCount] = @RowCount,
        [RowCountRunAt] = @RowCountRunAt,
        [Status] = @Status,
        [DisplayName] = @DisplayName
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '564D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            




























-- PART 2
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f1a5fe5d-4921-49bc-93ae-958d1fb9a028'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerTool')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f1a5fe5d-4921-49bc-93ae-958d1fb9a028',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100019,
            'MCPServerTool',
            'MCP Server Tool',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b152caf5-891a-4a0a-b5bd-270bbf03b2f5'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b152caf5-891a-4a0a-b5bd-270bbf03b2f5',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: MJ: AI Result Cache
            100041,
            'PromptRun',
            'Prompt Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0532d8a4-1095-451b-aebb-fc5273cd9e63'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0532d8a4-1095-451b-aebb-fc5273cd9e63',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Employee Company Integrations
            100016,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '69a5147a-5fe5-4c59-86e0-a29d2dd35d9a'  OR 
               (EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '69a5147a-5fe5-4c59-86e0-a29d2dd35d9a',
            'D8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Employee Roles
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '89463f1d-47e0-4936-bd1f-56794af7e09e'  OR 
               (EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '89463f1d-47e0-4936-bd1f-56794af7e09e',
            'D9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Employee Skills
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d2bddcf-26e1-4549-ad87-4121a13baecb'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d2bddcf-26e1-4549-ad87-4121a13baecb',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Error Logs
            100023,
            'CompanyIntegrationRun',
            'Company Integration Run',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5195bceb-9872-4de3-aca6-9cc3d6486f5b'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRunDetail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5195bceb-9872-4de3-aca6-9cc3d6486f5b',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Error Logs
            100024,
            'CompanyIntegrationRunDetail',
            'Company Integration Run Detail',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2eb1d758-1d43-4abf-9f22-c31f1b455e07'  OR 
               (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplayRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2eb1d758-1d43-4abf-9f22-c31f1b455e07',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Changes
            100040,
            'ReplayRun',
            'Replay Run',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4cfa94d9-5a83-40ad-9dcc-09f29f015a76'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ConversationDetail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4cfa94d9-5a83-40ad-9dcc-09f29f015a76',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Reports
            100053,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '64d1174e-2d96-4b3a-8092-6c3661b695eb'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64d1174e-2d96-4b3a-8092-6c3661b695eb',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            100045,
            'TestRun',
            'Test Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e22d30cc-9f5a-409b-b58d-043dec482b62'  OR 
               (EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e22d30cc-9f5a-409b-b58d-043dec482b62',
            '18248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Merge Deletion Logs
            100015,
            'RecordMergeLog',
            'Record Merge Log',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '10684395-1b9e-408e-b49c-52a498c48d86'  OR 
               (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '10684395-1b9e-408e-b49c-52a498c48d86',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Details
            100021,
            'DuplicateRun',
            'Duplicate Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7183005a-219d-4477-bd89-7434139114cd'  OR 
               (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7183005a-219d-4477-bd89-7434139114cd',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Invocations
            100014,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '371c9f27-3e1b-4925-8ccf-64293f811381'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '371c9f27-3e1b-4925-8ccf-64293f811381',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Filters
            100015,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '27b19a8a-d82e-4ff3-b95a-87056fb164bc'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ActionFilter')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27b19a8a-d82e-4ff3-b95a-87056fb164bc',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Filters
            100016,
            'ActionFilter',
            'Action Filter',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f1674f26-224b-420f-9ed9-e5a6ee5f4b65'  OR 
               (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TemplateContent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f1674f26-224b-420f-9ed9-e5a6ee5f4b65',
            '4B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Template Params
            100037,
            'TemplateContent',
            'Template Content',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4c3a1649-1e06-498b-ae5a-44ead102e68b'  OR 
               (EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecommendationRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c3a1649-1e06-498b-ae5a-44ead102e68b',
            '4D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Recommendations
            100014,
            'RecommendationRun',
            'Recommendation Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7e4f00b8-041b-4dc8-93fb-e829db2cd0f5'  OR 
               (EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Recommendation')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7e4f00b8-041b-4dc8-93fb-e829db2cd0f5',
            '50248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Recommendation Items
            100016,
            'Recommendation',
            'Recommendation',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '633da93b-5133-41c6-b099-1e4bba651f35'  OR 
               (EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityCommunicationMessageType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '633da93b-5133-41c6-b099-1e4bba651f35',
            '52248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Communication Fields
            100013,
            'EntityCommunicationMessageType',
            'Entity Communication Message Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6df1cfc9-b0b2-4e4e-8406-838d828fbab7'  OR 
               (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6df1cfc9-b0b2-4e4e-8406-838d828fbab7',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Params
            100018,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'db9606da-4704-4d5e-8137-bbd92c01c3be'  OR 
               (EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'ConversationDetail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'db9606da-4704-4d5e-8137-bbd92c01c3be',
            'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', -- Entity: MJ: Conversation Detail Ratings
            100016,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bec805a4-bf4a-4394-81ff-eb475926dfa9'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'AgentRun')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bec805a4-bf4a-4394-81ff-eb475926dfa9',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100046,
            'AgentRun',
            'Agent Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4c2c7698-6982-4447-9f45-d593be772571'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'Parent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c2c7698-6982-4447-9f45-d593be772571',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100047,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '79845440-3bfd-49cb-89e1-f9f5a364ec46'  OR 
               (EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'ConversationDetail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '79845440-3bfd-49cb-89e1-f9f5a364ec46',
            '16AB21D1-8047-41B9-8AEA-CD253DED9743', -- Entity: MJ: Conversation Detail Artifacts
            100014,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9c30a570-8d39-4279-bf71-cd22d41ec18d'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9c30a570-8d39-4279-bf71-cd22d41ec18d',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100046,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9129aa4d-f827-45cc-a6f0-4d9dbda73cb0'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerTool')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9129aa4d-f827-45cc-a6f0-4d9dbda73cb0',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100034,
            'MCPServerTool',
            'MCP Server Tool',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6D420001-1FB8-430E-9E2C-027A6BF7D757'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD862060-4FD4-4D09-AB19-8E03AAEFC4E1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8E36A2B5-3F14-4BDA-942E-C0F771D323D5'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '84D28564-733D-4CC6-BBA3-0DB947BD2040'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B3AB4D4-9150-499E-B9FF-5AF9454849CB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BEC805A4-BF4A-4394-81FF-EB475926DFA9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '79845440-3BFD-49CB-89E1-F9F5A364EC46'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '79845440-3BFD-49CB-89E1-F9F5A364EC46'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD73433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE73433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0B216DCA-0EB9-42E3-942F-8C74960C2CD5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '49C7ADAE-9D03-4347-B477-6DE824021056'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DB9606DA-4704-4D5E-8137-BBD92C01C3BE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DB9606DA-4704-4D5E-8137-BBD92C01C3BE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6286C405-7ABB-481E-BD23-F517DE7E8BD3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B46BAD20-46B2-445E-B703-CA74BD6F9C5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C45DA881-7CD4-424E-8855-C259F531E018'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79845440-3BFD-49CB-89E1-F9F5A364EC46'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Artifact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Version Summary',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDB7A2FA-6D08-4DC3-B69A-6851901A4F79'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34B67D3A-FED8-49E7-ABCA-3F34FDC88DC3'
   AND AutoUpdateCategory = 1

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73A164F4-CD17-4818-944F-C32FF6AECC6F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EC40C86-3805-46B5-B13C-8BF4C440B8C9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BEC805A4-BF4A-4394-81FF-EB475926DFA9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Number',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D420001-1FB8-430E-9E2C-027A6BF7D757'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B04A327B-55BF-4914-9DCF-3552A5DD0293'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '711A7415-47F6-437C-A519-D0C22DC8B0AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A60234B6-768E-4A9A-B320-19945BE32C96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Target Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '221FA3C6-184F-49ED-B679-13ABE9A55FEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Step',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFDF061E-458A-4510-B5B3-A1508BE9C156'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Step Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C2C7698-6982-4447-9F45-D593BE772571'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Step Identification & Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent Step',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5CB223A8-487A-4C9F-895D-490CDA610571'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B0A5884-5F7C-4668-8DE8-3CBD8790DA28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD862060-4FD4-4D09-AB19-8E03AAEFC4E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79CABC92-666A-4403-8802-F6B57F9E00DE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E36A2B5-3F14-4BDA-942E-C0F771D323D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84D28564-733D-4CC6-BBA3-0DB947BD2040'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '885CA658-9A97-4A8D-8726-286F954BF65A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Status & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Validation Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ADA3E427-9792-4587-96F6-7ECE2CF854FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Data',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'C3DCA069-31F0-41CE-9E73-471BD9F6DA4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Data',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = '4BE3997A-2974-482B-B5BA-5017439E6CDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload At Start',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = '93A2C3A5-2773-4DEA-847C-0D1AAD1929AA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data & Payload',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload At End',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'DD7A82BD-C269-434B-9BB4-BBAC6064AF98'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notes & System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B3AB4D4-9150-499E-B9FF-5AF9454849CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '576FE9EC-53A5-47F3-B194-6F32981B92D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '57DAC94A-8AD5-46A3-979B-E8A3E0A8AD38'
   AND AutoUpdateCategory = 1

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Run At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Result Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF73433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0074433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Result Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expired On',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0174433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0774433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D74433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F332D3A9-5402-4E82-90E4-DDB3F4315F19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '257026B1-1FD2-4B71-B94D-F97E7FEE6023'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D991B48-52BD-4609-B8C1-71529BF8E9E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Embedding',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C20C752B-8050-44A3-BC08-C1E85E1A9231'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1BF0DAAD-4F43-4486-AF6A-787A9DD73684'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9774433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B74433E-F36B-1410-883E-00D02208DC50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Vendor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '750A856A-8E2A-4161-AE35-0A311266D2EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Stakeholder Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B216DCA-0EB9-42E3-942F-8C74960C2CD5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48C4211A-CF59-45BE-B2F1-EF59FD5D2050'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B152CAF5-891A-4A0A-B5BD-270BBF03B2F5'
   AND AutoUpdateCategory = 1

/* Set categories for 23 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '804E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '575753A4-C12E-4E48-A835-6FE3FACE5527'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Archived',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '144417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Conversation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pinned',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7CAD1EDB-FDFC-4C19-8E8C-CCBCE0C60558'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '104E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'External ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '114E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '814E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '834E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '824E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1AE26D76-2246-4FD4-8BCB-04C1953E2612'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8EE672F-D2DF-4C0F-81FC-1392FCAD9813'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49A2D31E-331D-42C6-BA30-C96EB5A1310F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB07B3D0-FF8B-43AD-A612-01340C796652'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contextual Scope',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE95FC8E-8A64-48D1-AA72-2F141C9199A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Run Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E687A08-D39E-4488-9AF9-C71394F7217A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Test Run Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64D1174E-2D96-4B3A-8092-6C3661B695EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C6C87F9-2BD3-4FAC-BDF6-083AF4B27DC1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '28CB2BA0-F1BB-4F94-92C0-C70864CC2572'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Reference IDs',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '560E53BF-3F6E-42A2-B3C6-FF2DBAD2EF1C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84845FA8-AF88-48F0-B343-2F27EA892DDC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95427194-037B-40BB-8A70-23D84323BC4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Rating Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB9606DA-4704-4D5E-8137-BBD92C01C3BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49C7ADAE-9D03-4347-B477-6DE824021056'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '140CF09F-62A3-4A17-A6B5-A6D75D6EEF8D'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '0532D8A4-1095-451B-AEBB-FC5273CD9E63'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C94D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0532D8A4-1095-451B-AEBB-FC5273CD9E63'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0532D8A4-1095-451B-AEBB-FC5273CD9E63'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '27B19A8A-D82E-4FF3-B95A-87056FB164BC'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5D5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '371C9F27-3E1B-4925-8CCF-64293F811381'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '27B19A8A-D82E-4FF3-B95A-87056FB164BC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '371C9F27-3E1B-4925-8CCF-64293F811381'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '27B19A8A-D82E-4FF3-B95A-87056FB164BC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '89463F1D-47E0-4936-BD1F-56794AF7E09E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '89463F1D-47E0-4936-BD1F-56794AF7E09E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '10684395-1B9E-408E-B49C-52A498C48D86'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '10684395-1B9E-408E-B49C-52A498C48D86'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '69A5147A-5FE5-4C59-86E0-A29D2DD35D9A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '014D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '69A5147A-5FE5-4C59-86E0-A29D2DD35D9A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '69A5147A-5FE5-4C59-86E0-A29D2DD35D9A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0532D8A4-1095-451B-AEBB-FC5273CD9E63'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Integration Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '50A4214B-56C2-4B72-8544-1D86CBBB329F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'External Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'External Identifier',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C94D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A05817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A15817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '354417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '364417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duplicate Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10684395-1B9E-408E-B49C-52A498C48D86'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skipped Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Outcomes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '845817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skill',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '89463F1D-47E0-4936-BD1F-56794AF7E09E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Skill Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Skill Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '034D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Filter ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '371C9F27-3E1B-4925-8CCF-64293F811381'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Filter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '27B19A8A-D82E-4FF3-B95A-87056FB164BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '394E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Role Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '69A5147A-5FE5-4C59-86E0-A29D2DD35D9A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Role Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '014D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '024D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B05717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '633DA93B-5133-41C6-B099-1E4BBA651F35'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '633DA93B-5133-41C6-B099-1E4BBA651F35'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '7183005A-219D-4477-BD89-7434139114CD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7183005A-219D-4477-BD89-7434139114CD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7183005A-219D-4477-BD89-7434139114CD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F1A5FE5D-4921-49BC-93AE-958D1FB9A028'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1A5FE5D-4921-49BC-93AE-958D1FB9A028'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F1A5FE5D-4921-49BC-93AE-958D1FB9A028'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6DF1CFC9-B0B2-4E4E-8406-838D828FBAB7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6DF1CFC9-B0B2-4E4E-8406-838D828FBAB7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B0E0446-427C-4BF0-8562-5152265CFE1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '019FFEE0-0763-48E0-9862-D429A4CDAB3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1A5FE5D-4921-49BC-93AE-958D1FB9A028'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Values',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'B114689E-036B-428F-B179-0B68371CF237'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Calls Per Minute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3DC2DCEC-6F1E-421A-BE51-578F7D2F091E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95E2B969-4F03-4EFE-B519-D6DAC1272C3D'
   AND AutoUpdateCategory = 1

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7183005A-219D-4477-BD89-7434139114CD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Type Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invocation Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F95717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Param ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '985817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifier & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6DF1CFC9-B0B2-4E4E-8406-838D828FBAB7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '995817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value',
       ExtendedType = 'Code',
       CodeType = 'JavaScript'
   WHERE ID = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action Param',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '435817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '445817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run Detail ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '455817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D2BDDCF-26E1-4549-AD87-4121A13BAECB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company Integration Run Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5195BCEB-9872-4DE3-ACA6-9CC3D6486F5B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '465817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Classification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '475817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Error Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Details',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = '7D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Type ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '633DA93B-5133-41C6-B099-1E4BBA651F35'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Mapping Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B05717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E15717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E25717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B64D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '755817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E22D30CC-9F5A-409B-B58D-043DEC482B62'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E22D30CC-9F5A-409B-B58D-043DEC482B62'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4C3A1649-1E06-498B-AE5A-44EAD102E68B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4C3A1649-1E06-498B-AE5A-44EAD102E68B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7E4F00B8-041B-4DC8-93FB-E829DB2CD0F5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7E4F00B8-041B-4DC8-93FB-E829DB2CD0F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Run ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C3A1649-1E06-498B-AE5A-44EAD102E68B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Core',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Entity Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 21 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Change Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Changes (JSON)',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'B34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Record Snapshot',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'B54D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Change Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Replay Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Replay Run Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2EB1D758-1D43-4ABF-9F22-C31F1B455E07'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Integration Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A85717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A95717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recommendation Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E4F00B8-041B-4DC8-93FB-E829DB2CD0F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '135917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Destination Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AB5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Recommendation Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Match Probability',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '035917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '045917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B26460B-B434-41E8-98D6-6E8973A1998F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F402BB2F-2BDB-458A-BA98-58C95C41FE03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BEF8A97-4002-4707-A73C-2A679ACE8F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9129AA4D-F827-45CC-A6F0-4D9DBDA73CB0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B8A92DB-CFF9-400D-B88F-41131C0480C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68CB9A34-65C2-4546-ABAE-1A616D5F93A6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Parameters',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'C584FB9F-D0A0-48D8-9E0E-DAB449769F44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Content',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'F92F2ED5-628E-4222-B66C-F5B4139F3309'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Truncated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0BE70A8-D2E8-46A6-B746-57528E095F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '78A09C32-7FE6-408A-862A-71BD7E0042F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73C2B5A4-9F4F-4195-9794-BCE839DB8B70'
   AND AutoUpdateCategory = 1

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record Merge Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Deleted Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processing Log',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5D4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Deletion Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'Merge Log Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E22D30CC-9F5A-409B-B58D-043DEC482B62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '755817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '765817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2344E41B-6F21-419A-B80F-43636478A814'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EEA8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EFA8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9B5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD227316-95F3-468B-8DB8-AEA5E3A4C431'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B6A3F29-48A9-41B8-8374-214F12A5659C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B5358D5-C6C2-4579-879E-D2BA19D95541'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C866D300-E97C-44E7-8848-F3DA97CE3F77'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2344E41B-6F21-419A-B80F-43636478A814'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18585DF4-33D0-4CFC-95E4-6674186DCD9C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8719181-09B2-4C98-86F1-9A7828F46D2B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E94662C2-69B9-4603-9BFC-279CFD42A222'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCE153EB-99AC-42DD-9BF7-628C0E121C62'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C30A570-8D39-4279-BF71-CD22D41EC18D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F585440-DA55-4A2A-A48B-2937A3B24483'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EFAD61D-3A38-4CEA-86FE-67463E887920'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55602C1C-FB4A-4678-A847-7889860791D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24940E6C-FC69-40F1-9EA6-D860F38FC93F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9320E9C7-764E-401B-BF2D-A07358E4DD00'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Percent Complete',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8071305E-E1C1-48BF-AE70-E345D6B892EE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E1E5F477-3ABE-4793-BC11-A719CB078463'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A8AEAF5-9065-4B87-8A63-B04F84E83886'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Task Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Project',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '65ABF2B8-3355-4427-828B-E3082806C557'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Due At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97A0A3EA-5563-4C55-9935-397C26BFD00A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B267C59C-3370-4EDF-A9D4-106D46A6BBF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Timeline & Milestones',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F09901B1-A4C3-4845-A639-B9730146021A'
   AND AutoUpdateCategory = 1

/* Set categories for 19 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '985717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '995717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '58826477-0141-4692-A271-24918F5B9224'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D84C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Template Content Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1674F26-224B-420F-9ED9-E5A6EE5F4B65'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Specification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Required',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Parameter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F5917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Extra Filter',
       ExtendedType = 'Code',
       CodeType = 'SQL'
   WHERE ID = '105917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dynamic Linking & Filters',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order By',
       ExtendedType = 'Code',
       CodeType = 'SQL'
   WHERE ID = '7321B323-7F8B-4DCD-AE44-01FCE8AAB7EF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '945817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '955817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Set categories for 30 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '284317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sharing Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '291EF341-1318-4B86-A9A7-1180CE820609'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '257FFE0E-EC6F-441B-8039-3A17B44FF4FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Report Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '54D5F848-BE9C-4B4A-8DF0-B53E2EA196E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EAA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '524F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4CFA94D9-5A83-40AD-9DCC-09F29F015A76'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F94E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Data Context',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ECA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Workflow',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F84D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Context & Relationships',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Workflow',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F0A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = 'Code',
       CodeType = 'Other'
   WHERE ID = 'FA4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Trigger Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Format Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F14D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Format Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EEA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Delivery Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Delivery Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFA8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Frequency',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output & Scheduling',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Target Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'F74D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B55817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B65817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

