-- =============================================================================
-- Migration: Schema-Based ClassName Prefix
-- Version:   v5.2.x
-- Purpose:   1. Create GetClassNameSchemaPrefix function that derives a clean
--               programmatic prefix from SchemaName (guaranteed unique by SQL Server)
--            2. Update vwEntities so ClassName and CodeName use SchemaName-based
--               prefix instead of EntityNamePrefix (which is not guaranteed unique)
--            3. Add filtered unique index on SchemaInfo(EntityNamePrefix, EntityNameSuffix)
--               to prevent confusing entity-name collisions
--
-- Rationale: EntityNamePrefix/Suffix drives Entity.Name (display/metadata naming)
--            but should NOT drive programmatic class names. SchemaName is guaranteed
--            unique by SQL Server, making it the safe foundation for TypeScript class
--            names, GraphQL type names, and resolver names. This aligns vwEntities
--            with the GraphQL codegen which already uses SchemaName via
--            getGraphQLTypeNameBase() in packages/MJCore/src/generic/graphqlTypeNames.ts.
--
-- Net effect on existing __mj entities: NONE. __mj -> "MJ" prefix, same as before.
-- =============================================================================

-- =============================================================================
-- STEP 1: Create GetClassNameSchemaPrefix function
--         Maps a SQL schema name to a clean prefix for programmatic identifiers.
--         Special cases:
--           __mj   -> 'MJ'       (core MemberJunction schema)
--           MJ     -> 'MJCustom' (prevent collision with __mj's 'MJ' prefix)
--         All others: StripToAlphanumeric(SchemaName), with leading-digit guard.
-- =============================================================================
PRINT N'Creating GetClassNameSchemaPrefix function'
GO

IF OBJECT_ID('[${flyway:defaultSchema}].GetClassNameSchemaPrefix', 'FN') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].GetClassNameSchemaPrefix;
GO

CREATE FUNCTION [${flyway:defaultSchema}].GetClassNameSchemaPrefix(@schemaName NVARCHAR(255))
RETURNS NVARCHAR(255)
AS
BEGIN
    DECLARE @trimmed NVARCHAR(255) = LTRIM(RTRIM(@schemaName));

    -- Core MJ schema: __mj -> 'MJ'
    IF LOWER(@trimmed) = '__mj'
        RETURN 'MJ';

    -- Guard: a schema literally named 'MJ' (case-insensitive) would collide with __mj's prefix
    IF LOWER(@trimmed) = 'mj'
        RETURN 'MJCustom';

    -- Default: strip to alphanumeric (same as StripToAlphanumeric, which removes
    -- all non-[A-Za-z0-9] characters). Then guard against leading digit.
    DECLARE @cleaned NVARCHAR(255) = [${flyway:defaultSchema}].StripToAlphanumeric(@trimmed);

    -- If empty after cleaning, return empty (schema with no prefix needed - shouldn't happen)
    IF LEN(@cleaned) = 0 OR @cleaned IS NULL
        RETURN '';

    -- If starts with a digit, prepend underscore
    IF @cleaned LIKE '[0-9]%'
        RETURN '_' + @cleaned;

    RETURN @cleaned;
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- =============================================================================
-- STEP 2: Update vwEntities view
--         - ClassName: now uses GetClassNameSchemaPrefix(SchemaName) instead of
--           StripToAlphanumeric(EntityNamePrefix)
--         - CodeName: now uses GetClassNameSchemaPrefix(SchemaName) as prefix,
--           combined with the entity Name (with EntityNamePrefix stripped for
--           cleanliness, and spaces removed)
--         - BaseTableCodeName: unchanged (schema-unaware by design)
--         - The SchemaInfo join is still needed for CodeName (to strip display prefix
--           from entity Name), but ClassName no longer depends on it
-- =============================================================================
PRINT N'Updating vwEntities with schema-based ClassName prefix'
GO

DROP VIEW IF EXISTS [${flyway:defaultSchema}].vwEntities
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntities]
AS
SELECT
    e.*,
    /* CodeName: Schema-prefixed programmatic name derived from entity Name.
       Uses GetClassNameSchemaPrefix(SchemaName) for the prefix, then strips the
       EntityNamePrefix from the Name (if present) and removes spaces.
       Example: schema '__mj', name 'MJ: AI Models' -> 'MJAIModels'
       Example: schema 'sales', name 'Invoice' -> 'salesInvoice' */
    [${flyway:defaultSchema}].GetProgrammaticName(
        [${flyway:defaultSchema}].GetClassNameSchemaPrefix(e.SchemaName) +
        REPLACE(
            IIF(si.EntityNamePrefix IS NOT NULL,
                REPLACE(e.Name, si.EntityNamePrefix, ''),
                e.Name
            ),
            ' ',
            ''
        )
    ) AS CodeName,
    /* ClassName: Schema-prefixed programmatic class name for TypeScript entity classes,
       Zod schemas, and Angular form components. Uses GetClassNameSchemaPrefix(SchemaName)
       which is guaranteed unique (SQL Server enforces schema name uniqueness).
       Example: schema '__mj', table 'AIModel' -> 'MJAIModel' -> class MJAIModelEntity
       Example: schema 'sales', table 'Invoice' -> 'salesInvoice' -> class salesInvoiceEntity
       This prevents cross-schema collisions and aligns with GraphQL type naming. */
    [${flyway:defaultSchema}].GetProgrammaticName(
        [${flyway:defaultSchema}].GetClassNameSchemaPrefix(e.SchemaName) +
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
GO


-- =============================================================================
-- STEP 3: Update extended property for ClassName column
--         Reflects the new schema-based computation.
-- =============================================================================
PRINT N'Updating extended property for vwEntities.ClassName'
GO

-- Drop old description if it exists, then re-add
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.views v ON ep.major_id = v.object_id
    INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
    INNER JOIN sys.columns c ON c.object_id = v.object_id AND ep.minor_id = c.column_id
    WHERE s.name = '${flyway:defaultSchema}' AND v.name = 'vwEntities' AND c.name = 'ClassName'
      AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'VIEW',   @level1name = N'vwEntities',
        @level2type = N'COLUMN', @level2name = N'ClassName';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema-based programmatic class name used for TypeScript entity classes, Zod schemas, and Angular form components. Computed as GetProgrammaticName(GetClassNameSchemaPrefix(SchemaName) + BaseTable + NameSuffix). The prefix is derived from SchemaName (guaranteed unique by SQL Server), not from EntityNamePrefix. For the core __mj schema, the prefix is "MJ"; for all other schemas it is the alphanumeric-sanitized schema name. This prevents cross-schema collisions and aligns with GraphQL type naming in getGraphQLTypeNameBase().',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'VIEW',   @level1name = N'vwEntities',
    @level2type = N'COLUMN', @level2name = N'ClassName';
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- Update CodeName description too
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.views v ON ep.major_id = v.object_id
    INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
    INNER JOIN sys.columns c ON c.object_id = v.object_id AND ep.minor_id = c.column_id
    WHERE s.name = '${flyway:defaultSchema}' AND v.name = 'vwEntities' AND c.name = 'CodeName'
      AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'VIEW',   @level1name = N'vwEntities',
        @level2type = N'COLUMN', @level2name = N'CodeName';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema-based programmatic code name derived from the entity Name. Uses GetClassNameSchemaPrefix(SchemaName) as the prefix, then strips EntityNamePrefix from the Name and removes spaces. For "__mj" schema with entity "MJ: AI Models", this produces "MJAIModels". For entities in other schemas, the sanitized schema name is prepended. Used in GraphQL type generation and internal code references.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'VIEW',   @level1name = N'vwEntities',
    @level2type = N'COLUMN', @level2name = N'CodeName';
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

-- =============================================================================
-- STEP 4: Add filtered unique index on SchemaInfo(EntityNamePrefix, EntityNameSuffix)
--         Prevents two schemas from sharing the same prefix+suffix combination,
--         which would risk entity name collisions when both schemas have tables
--         with the same name. Allows multiple NULL/NULL (schemas without any prefix).
-- =============================================================================
PRINT N'Adding filtered unique index on SchemaInfo EntityNamePrefix+Suffix'
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_SchemaInfo_EntityNamePrefixSuffix'
      AND object_id = OBJECT_ID('[${flyway:defaultSchema}].SchemaInfo')
)
BEGIN
    CREATE UNIQUE INDEX UQ_SchemaInfo_EntityNamePrefixSuffix
    ON [${flyway:defaultSchema}].SchemaInfo (
        EntityNamePrefix,
        EntityNameSuffix
    )
    WHERE EntityNamePrefix IS NOT NULL;
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

PRINT N'Migration complete: Schema-based ClassName prefix'
GO




-- =============================================================================
-- STEP 5: NOW ENSURE ALL DOWNSTREAM CONSUMERS OF ABOVE OBJECTS ARE REFRESHED
-- =============================================================================
PRINT N'Refreshing dependent objects in database'
GO
 

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