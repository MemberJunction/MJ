-- Scoped Entity Field Stored Procedures (Phase A of PR #2342)
--
-- Adds an optional @EntityID parameter to the field-management bootstrap SPs that
-- CodeGen calls during its second `manageEntityFields` pass. When @EntityID is NULL
-- (default), behavior is identical to the prior version — full schema scan. When a
-- specific UUID is passed, the SP filters its work to that single entity, allowing
-- CodeGen's Pass 2 to scope expensive scans to entities that actually changed.
--
-- These two SPs are part of CodeGen's own bootstrap (not user-entity SPs) and live
-- in versioned migrations the same way prior fixes did
-- (see V202409131653__v2.5.x_FixBaseCodeGenSPs.sql).

DROP PROC IF EXISTS [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
GO
CREATE PROC [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityID UNIQUEIDENTIFIER = NULL
AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#DeletedFields') IS NOT NULL
    DROP TABLE #DeletedFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
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
-- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
LEFT JOIN
    STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
ON
    e.SchemaName = excludedSchemas.value
WHERE
    e.VirtualEntity = 0 AND -- exclude virtual entities from this always
    excludedSchemas.value IS NULL AND -- This ensures rows with matching SchemaName are excluded
    (@EntityID IS NULL OR ef.EntityID = @EntityID) -- scoped run: only this entity

-- get actual fields from the database so we can compare MJ metadata to the SQL catalog.
-- When scoped, narrow vwSQLColumnsAndEntityFields the same way so the orphan join below stays correct.
SELECT *
INTO #actual_spDeleteUnneededEntityFields
FROM vwSQLColumnsAndEntityFields
WHERE @EntityID IS NULL OR EntityID = @EntityID

-- now figure out which fields are NO longer in the DB and should be removed from MJ metadata
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


-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE ${flyway:defaultSchema}.Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
  SELECT DISTINCT EntityID FROM #DeletedFields
)

-- next delete the entity field values
DELETE FROM ${flyway:defaultSchema}.EntityFieldValue WHERE EntityFieldID IN (
  SELECT ID FROM #DeletedFields
)

-- now delete the entity fields themsevles
DELETE FROM ${flyway:defaultSchema}.EntityField WHERE ID IN
(
  SELECT ID FROM #DeletedFields
)

-- return the deleted fields to the caller
SELECT * FROM #DeletedFields

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
DROP TABLE #DeletedFields
GO


---------------------------------------------------


DROP PROC IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityID UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

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
    ON
        ef.EntityID = fromSQL.EntityID AND
        ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e
    ON
        ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
    ON
        ef.Name = fk.[column] AND
        e.BaseTable = fk.[table] AND
        e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re -- Related Entity
    ON
        re.BaseTable = fk.referenced_table AND
        re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTablePrimaryKeys pk
    ON
        e.BaseTable = pk.TableName AND
        ef.Name = pk.ColumnName AND
        e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTableUniqueKeys uk
    ON
        e.BaseTable = uk.TableName AND
        ef.Name = uk.ColumnName AND
        e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas
    ON
        e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL -- Only include non-excluded schemas
        AND ef.ID IS NOT NULL -- Only where we have already created EntityField records
        AND (@EntityID IS NULL OR e.ID = @EntityID) -- scoped run: only this entity
        AND (
          -- this large filtering block includes ONLY the rows that have changes
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.Sequence <> fromSQL.Sequence OR
          ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
          ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '') OR
          ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END OR
          ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END
        );

    -- Perform the update using the table variable
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
        ef.Sequence = fr.Sequence,
        -- Protect soft FKs: don't overwrite if IsSoftForeignKey=1
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0, fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        -- Protect soft PKs: don't overwrite if IsSoftPrimaryKey=1
        ef.IsPrimaryKey = IIF(ef.IsSoftPrimaryKey = 0, fr.IsPrimaryKey, ef.IsPrimaryKey),
        ef.IsUnique = fr.IsUnique,
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr
    ON
        ef.ID = fr.EntityFieldID;

    -- Return the modified rows
    SELECT * FROM @FilteredRows;
END;
GO
