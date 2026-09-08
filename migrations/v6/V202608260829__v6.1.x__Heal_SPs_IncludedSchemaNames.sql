-- Optional @IncludedSchemaNames on CodeGen metadata-heal stored procedures.
--
-- These procs historically take only @ExcludedSchemaNames (a negative list). Open App
-- CodeGen compiles includeSchemas into that list from whoever is installed on the
-- publisher database, then logs the EXEC into a versioned migration. The compiled
-- list names consumer apps (Orders inside Common, etc.) and is incomplete on a host
-- with extra schemas.
--
-- @IncludedSchemaNames is a positive filter, default NULL = today's behavior.
-- When non-empty, work is limited to those schemas AND still minus @ExcludedSchemaNames.
-- Existing callers that omit the new parameter are unchanged.
--
-- CodeGen, when includeSchemas is set, now emits authored excludes (sys,staging,…)
-- plus @IncludedSchemaNames for this app's schema — never a sibling snapshot.
--
-- Latest bodies reproduced from:
--   spDeleteUnneededEntityFields          V202607031201
--   spUpdateExistingEntityFieldsFromSchema V202605281538
--   spUpdateExistingEntitiesFromSchema     V202507040917
--   spSetDefaultColumnWidthWhereNeeded     V202407171600
--   spUpdateSchemaInfoFromDatabase         V202606301331

-- =============================================================================
-- spDeleteUnneededEntityFields
-- =============================================================================
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL,
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#DeletedFields') IS NOT NULL
    DROP TABLE #DeletedFields

DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
DECLARE @IsScoped BIT = 0;
IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
BEGIN
    INSERT INTO @ScopedEntityIDs (EntityID)
    SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
    FROM STRING_SPLIT(@EntityIDs, ',')
    WHERE LTRIM(RTRIM(value)) <> ''
      AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
    IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
END

DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
DECLARE @HasInclude BIT = 0;
IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
BEGIN
    INSERT INTO @IncludedSchemas (SchemaName)
    SELECT DISTINCT TRIM(value)
    FROM STRING_SPLIT(@IncludedSchemaNames, ',')
    WHERE TRIM(value) <> '';
    IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
END

SELECT
    ef.*
INTO
    #ef_spDeleteUnneededEntityFields
FROM
    vwEntityFields ef
INNER JOIN
    vwEntities e
ON
    ef.EntityID = e.ID
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    e.VirtualEntity = 0 AND
    e.ExternalDataSourceID IS NULL AND
    excludedSchemas.value IS NULL AND
    (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas)) AND
    (@IsScoped = 0 OR ef.EntityID IN (SELECT EntityID FROM @ScopedEntityIDs))

SELECT *
INTO #actual_spDeleteUnneededEntityFields
FROM vwSQLColumnsAndEntityFields
WHERE @IsScoped = 0 OR EntityID IN (SELECT EntityID FROM @ScopedEntityIDs)

SELECT ef.* INTO #DeletedFields
    FROM
      #ef_spDeleteUnneededEntityFields ef
    LEFT JOIN
      #actual_spDeleteUnneededEntityFields actual
      ON
      ef.EntityID=actual.EntityID AND
      ef.Name = actual.EntityFieldName
    WHERE
      actual.column_id IS NULL

UPDATE ${flyway:defaultSchema}.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
  SELECT DISTINCT EntityID FROM #DeletedFields
)

DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN (
  SELECT ID FROM #DeletedFields
)

DELETE FROM ${flyway:defaultSchema}.EntityField WHERE ID IN
(
  SELECT ID FROM #DeletedFields
)

SELECT * FROM #DeletedFields

DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
DROP TABLE #DeletedFields
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUnneededEntityFields] TO [cdp_Developer], [cdp_Integration]
GO

-- =============================================================================
-- spUpdateExistingEntityFieldsFromSchema
-- =============================================================================
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL,
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
    DECLARE @IsScoped BIT = 0;
    IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
    BEGIN
        INSERT INTO @ScopedEntityIDs (EntityID)
        SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
        FROM STRING_SPLIT(@EntityIDs, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
          AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
        IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
    END

    DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @IncludedSchemas (SchemaName)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@IncludedSchemaNames, ',')
        WHERE TRIM(value) <> '';
        IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
    END

    DECLARE @FilteredRows TABLE (
        EntityID UNIQUEIDENTIFIER,
        EntityName NVARCHAR(500),
        EntityFieldID UNIQUEIDENTIFIER,
        EntityFieldName NVARCHAR(500),
        AutoUpdateDescription BIT,
        ExistingDescription NVARCHAR(MAX),
        SQLDescription NVARCHAR(MAX),
        Type NVARCHAR(255),
        Length INT,
        Precision INT,
        Scale INT,
        AllowsNull BIT,
        DefaultValue NVARCHAR(MAX),
        AutoIncrement BIT,
        IsVirtual BIT,
        IsComputed BIT,
        Sequence INT,
        RelatedEntityID UNIQUEIDENTIFIER,
        RelatedEntityFieldName NVARCHAR(255),
        IsPrimaryKey BIT,
        IsUnique BIT
    );

    INSERT INTO @FilteredRows
    SELECT
        e.ID as EntityID,
        e.Name as EntityName,
        ef.ID AS EntityFieldID,
        ef.Name as EntityFieldName,
        ef.AutoUpdateDescription,
        ef.Description AS ExistingDescription,
        CONVERT(nvarchar(max),fromSQL.Description) AS SQLDescription,
        fromSQL.Type,
        fromSQL.Length,
        fromSQL.Precision,
        fromSQL.Scale,
        fromSQL.AllowsNull,
        CONVERT(nvarchar(max),fromSQL.DefaultValue),
        fromSQL.AutoIncrement,
        fromSQL.IsVirtual,
        fromSQL.IsComputed,
        fromSQL.Sequence,
        re.ID AS RelatedEntityID,
        fk.referenced_column AS RelatedEntityFieldName,
        CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE
            WHEN pk.ColumnName IS NOT NULL THEN 1
            ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
        END AS IsUnique
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
        ON ef.EntityID = fromSQL.EntityID AND ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
        ON ef.Name = fk.[column]
           AND e.BaseTable = fk.[table]
           AND e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re
        ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTablePrimaryKeys pk
        ON e.BaseTable = pk.TableName AND ef.Name = pk.ColumnName AND e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTableUniqueKeys uk
        ON e.BaseTable = uk.TableName AND ef.Name = uk.ColumnName AND e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas ON e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL
        AND ef.ID IS NOT NULL
        AND (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
        AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs))
        AND (
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.IsComputed <> fromSQL.IsComputed OR
          ef.Sequence <> fromSQL.Sequence OR
          ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
          ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '') OR
          ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END OR
          ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END OR
          (ef.AllowUpdateAPI = 1 AND fromSQL.IsVirtual = 1 AND ef.IsVirtual = 0)
        );

    UPDATE ef
    SET
        ef.Description = IIF(fr.AutoUpdateDescription=1, fr.SQLDescription, ef.Description),
        ef.Type = fr.Type,
        ef.Length = fr.Length,
        ef.Precision = fr.Precision,
        ef.Scale = fr.Scale,
        ef.AllowsNull = fr.AllowsNull,
        ef.DefaultValue = fr.DefaultValue,
        ef.AutoIncrement = fr.AutoIncrement,
        ef.IsVirtual = fr.IsVirtual,
        ef.IsComputed = fr.IsComputed,
        ef.Sequence = fr.Sequence,
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.AllowUpdateAPI = IIF(fr.IsVirtual = 1 AND ef.IsVirtual = 0, 0, ef.AllowUpdateAPI),
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr ON ef.ID = fr.EntityFieldID;

    SELECT * FROM @FilteredRows;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema] TO [cdp_Developer], [cdp_Integration]
GO

-- =============================================================================
-- spUpdateExistingEntitiesFromSchema
-- =============================================================================
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema
    @ExcludedSchemaNames NVARCHAR(MAX),
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @IncludedSchemas (SchemaName)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@IncludedSchemaNames, ',')
        WHERE TRIM(value) <> '';
        IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
    END

    DECLARE @FilteredRows TABLE (
        ID UNIQUEIDENTIFIER,
        Name NVARCHAR(500),
        CurrentDescription NVARCHAR(MAX),
        NewDescription NVARCHAR(MAX),
        EntityDescription NVARCHAR(MAX),
        SchemaName NVARCHAR(MAX)
    );

    INSERT INTO @FilteredRows
        SELECT
            e.ID,
            e.Name,
            e.Description AS CurrentDescription,
            IIF(e.AutoUpdateDescription = 1, CONVERT(NVARCHAR(MAX), fromSQL.EntityDescription), e.Description) AS NewDescription,
            CONVERT(NVARCHAR(MAX),fromSQL.EntityDescription),
            CONVERT(NVARCHAR(MAX),fromSQL.SchemaName)
        FROM
            [${flyway:defaultSchema}].[Entity] e
        INNER JOIN
            [${flyway:defaultSchema}].[vwSQLTablesAndEntities] fromSQL
        ON
            e.ID = fromSQL.EntityID
        LEFT JOIN
            STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
        ON
            fromSQL.SchemaName = excludedSchemas.value
        WHERE
            e.VirtualEntity = 0
            AND excludedSchemas.value IS NULL
            AND (@HasInclude = 0 OR fromSQL.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
            AND ISNULL(IIF(e.AutoUpdateDescription = 1, CONVERT(NVARCHAR(MAX), fromSQL.EntityDescription), e.Description),'') <> ISNULL(e.Description,'')

    UPDATE e
    SET
        Description = fr.NewDescription
    FROM
        [${flyway:defaultSchema}].[Entity] e
    INNER JOIN
        @FilteredRows fr
    ON
        e.ID = fr.ID;

    SELECT * FROM @FilteredRows;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExistingEntitiesFromSchema] TO [cdp_Developer], [cdp_Integration]
GO

-- =============================================================================
-- spSetDefaultColumnWidthWhereNeeded
-- =============================================================================
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spSetDefaultColumnWidthWhereNeeded]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @IncludedSchemas (SchemaName)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@IncludedSchemaNames, ',')
        WHERE TRIM(value) <> '';
        IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
    END

    UPDATE
        ef
    SET
        DefaultColumnWidth =
        IIF(ef.Type = 'int', 50,
            IIF(ef.Type = 'datetimeoffset', 100,
                IIF(ef.Type = 'money', 100,
                    IIF(ef.Type ='nchar', 75,
                        150)))
            ),
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        ${flyway:defaultSchema}.EntityField ef
    INNER JOIN
        ${flyway:defaultSchema}.Entity e
    ON
        ef.EntityID = e.ID
    LEFT JOIN
        STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
    ON
        e.SchemaName = excludedSchemas.value
    WHERE
        ef.DefaultColumnWidth IS NULL AND
        excludedSchemas.value IS NULL AND
        (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spSetDefaultColumnWidthWhereNeeded] TO [cdp_Developer], [cdp_Integration]
GO

-- =============================================================================
-- spUpdateSchemaInfoFromDatabase
-- =============================================================================
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase]
    @ExcludedSchemaNames NVARCHAR(MAX) = NULL,
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(128))
    IF @ExcludedSchemaNames IS NOT NULL AND LEN(@ExcludedSchemaNames) > 0
    BEGIN
        INSERT INTO @ExcludedSchemas (SchemaName)
        SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',')
        WHERE TRIM(value) <> ''
    END

    DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @IncludedSchemas (SchemaName)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@IncludedSchemaNames, ',')
        WHERE TRIM(value) <> '';
        IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
    END

    UPDATE si
    SET si.Description = ss.SchemaDescription
    FROM [${flyway:defaultSchema}].SchemaInfo si
    INNER JOIN [${flyway:defaultSchema}].vwSQLSchemas ss
        ON si.SchemaName = ss.SchemaName
    WHERE
        (si.Description IS NULL OR si.Description <> ISNULL(ss.SchemaDescription, ''))
        AND ss.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)
        AND (@HasInclude = 0 OR ss.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))

    INSERT INTO [${flyway:defaultSchema}].SchemaInfo
    (
        SchemaName,
        EntityIDMin,
        EntityIDMax,
        Comments,
        Description
    )
    SELECT
        ss.SchemaName,
        1,
        999999999,
        'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.',
        ss.SchemaDescription
    FROM
        [${flyway:defaultSchema}].vwSQLSchemas ss
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].SchemaInfo si ON ss.SchemaName = si.SchemaName
    WHERE
        si.ID IS NULL
        AND ss.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)
        AND (@HasInclude = 0 OR ss.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))

    UPDATE si
    SET si.CanonicalSchemaName = app.SchemaName
    FROM [${flyway:defaultSchema}].SchemaInfo si
    INNER JOIN [${flyway:defaultSchema}].OpenApp app
        ON LOWER(si.SchemaName) = LOWER(app.SchemaName)
    WHERE si.CanonicalSchemaName IS NULL
      AND app.SchemaName IS NOT NULL
      AND si.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)
      AND (@HasInclude = 0 OR si.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))

    SELECT
        si.*
    FROM
        [${flyway:defaultSchema}].SchemaInfo si
    INNER JOIN
        [${flyway:defaultSchema}].vwSQLSchemas ss ON si.SchemaName = ss.SchemaName
    WHERE
        ss.SchemaName NOT IN (SELECT SchemaName FROM @ExcludedSchemas)
        AND (@HasInclude = 0 OR ss.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase] TO [cdp_Developer], [cdp_Integration]
GO
