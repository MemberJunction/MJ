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
