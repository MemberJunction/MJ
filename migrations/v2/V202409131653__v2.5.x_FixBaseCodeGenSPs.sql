-- Update this procedure to exclude virtual entities
DROP PROC IF EXISTS [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
GO
CREATE PROC [${flyway:defaultSchema}].[spDeleteUnneededEntityFields]
    @ExcludedSchemaNames NVARCHAR(MAX)

AS
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields

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
    excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded


SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields

-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE [${flyway:defaultSchema}].Entity SET __mj_UpdatedAt=GETUTCDATE() WHERE ID IN
(
	SELECT
	  ef.EntityID
	FROM
	  #ef_spDeleteUnneededEntityFields ef
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE
	  actual.column_id IS NULL
)

-- now delete the entity fields themsevles
DELETE FROM [${flyway:defaultSchema}].EntityField WHERE ID IN
(
	SELECT
	  ef.ID
	FROM
	  #ef_spDeleteUnneededEntityFields ef
	LEFT JOIN
	  #actual_spDeleteUnneededEntityFields actual
	  ON
	  ef.EntityID=actual.EntityID AND
	  ef.Name = actual.EntityFieldName
	WHERE
	  actual.column_id IS NULL
)

-- clean up and get rid of our temp tables now
DROP TABLE #ef_spDeleteUnneededEntityFields
DROP TABLE #actual_spDeleteUnneededEntityFields
GO



---------------------------------------------------

-- update this proc to EXCLUDE virtual entities always
DROP PROC IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    -- Update Statement
    UPDATE [${flyway:defaultSchema}].EntityField
    SET
		    Description = IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.Description), ef.Description),
        Type = fromSQL.Type,
        Length = fromSQL.Length,
        Precision = fromSQL.Precision,
        Scale = fromSQL.Scale,
        AllowsNull = fromSQL.AllowsNull,
        DefaultValue = fromSQL.DefaultValue,
        AutoIncrement = fromSQL.AutoIncrement,
        IsVirtual = fromSQL.IsVirtual,
        Sequence = fromSQL.Sequence,
        RelatedEntityID = re.ID,
        RelatedEntityFieldName = fk.referenced_column,
        IsPrimaryKey =	CASE
							WHEN pk.ColumnName IS NOT NULL THEN 1
							ELSE 0
						END,
        IsUnique =		CASE
							WHEN pk.ColumnName IS NOT NULL THEN 1
							ELSE
								CASE
									WHEN uk.ColumnName IS NOT NULL THEN 1
									ELSE 0
								END
						END,
        __mj_UpdatedAt = GETUTCDATE()
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
    -- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
    LEFT JOIN
        STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
    ON
        e.SchemaName = excludedSchemas.value
	WHERE
    e.VirtualEntity = 0
    AND
		    fromSQL.EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
		AND
        excludedSchemas.value IS NULL -- This ensures rows with matching SchemaName are excluded
END
GO


-- update this proc to always exclude virtual entities

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntitiesFromSchema];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    -- Update statement excluding rows with matching SchemaName
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        Description = IIF(e.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX),fromSQL.EntityDescription), e.Description)
    FROM
        [${flyway:defaultSchema}].[Entity] e
    INNER JOIN
        [${flyway:defaultSchema}].[vwSQLTablesAndEntities] fromSQL
    ON
        e.ID = fromSQL.EntityID
    -- Use LEFT JOIN with STRING_SPLIT to filter out excluded schemas
    LEFT JOIN
        STRING_SPLIT(@ExcludedSchemaNames, ',') AS excludedSchemas
    ON
        fromSQL.SchemaName = excludedSchemas.value
    WHERE
        e.VirtualEntity = 0 AND
        excludedSchemas.value IS NULL; -- This ensures rows with matching SchemaName are excluded
END;
GO
