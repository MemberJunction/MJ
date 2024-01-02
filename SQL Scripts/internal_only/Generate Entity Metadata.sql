/***********************************************************************************
************************************************************************************
This file contains the routine to automatically generate/update the entity metadata from the
tables in the datbase that we specify

NOTE: As of 12 APRIL 2023 - this file contains the DEFINITIONS for VIEWS and PROCS that are used 
	  in the TypeScript CodeGen project instead of being executed dynamically in the script itself.

************************************************************************************
***********************************************************************************/

/****************************************************************/
-- STEP #1 - SETUP the VIEW to be used for matching
---------------- NOTE - the schema list to EXCLUDE is shown below, starting out as of DEC 17 2022 with just sys and staging and reference
----------------        if we want to include/exlude tables in the Entity Metadata over time that are in/out of those schemas, need to adjust this
DROP VIEW vwSQLTablesAndEntities 
GO
CREATE VIEW vwSQLTablesAndEntities
AS
SELECT 
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.*,
	v.object_id view_object_id,
	v.name ViewName
FROM 
	sys.all_objects t
INNER JOIN
	sys.schemas s 
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	admin.Entity e 
ON
	t.name = e.BaseTable AND
	s.name = e.SchemaName 
LEFT OUTER JOIN
	sys.all_objects v
ON
	e.BaseView = v.name AND v.type = 'V'
WHERE   
	t.TYPE = 'U' or (t.Type='V' and e.VirtualEntity=1) -- TABLE - non-virtual entities
GO


/***************************************************************
-- Step #2 - Create NEW entity records from vwSQLTablesAndEntities where there is NOT an Existing EntityID
 
*/
DROP VIEW vwSQLColumnsAndEntityFields
GO
CREATE VIEW vwSQLColumnsAndEntityFields
AS
SELECT 
	e.EntityID,
	e.EntityName Entity,
	e.SchemaName,
	e.TableName TableName,
	ef.ID EntityFieldID,
	ef.Sequence EntityFieldSequence,
	ef.Name EntityFieldName,
	c.column_id Sequence,
	c.name FieldName,
	t.name Type,
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	c.is_identity AutoIncrement,
	c.column_id,
	IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- updated so that we take into account that computed columns are virtual always, previously only looked for existence of a column in table vs. a view
	basetable_columns.object_id,
	dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
	cc.definition ComputedColumnDefinition
FROM
	sys.all_columns c
INNER JOIN
	vwSQLTablesAndEntities e
ON
	c.object_id = IIF(e.view_object_id IS NULL, e.object_id, e.view_object_id)
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
INNER JOIN
	sys.all_objects basetable 
ON
	e.object_id = basetable.object_id
LEFT OUTER JOIN 
    sys.computed_columns cc 
ON 
	e.object_id = cc.object_id AND 
	c.name = cc.name
LEFT OUTER JOIN
	sys.all_columns basetable_columns -- join in all columns from base table and line them up - that way we know if a field is a VIEW only field or a TABLE field (virtual vs. in table)
ON
	basetable.object_id = basetable_columns.object_id AND
	c.name = basetable_columns.name 
LEFT OUTER JOIN
	admin.EntityField ef 
ON
	e.EntityID = ef.EntityID AND
	c.name = ef.Name
LEFT OUTER JOIN 
    sys.default_constraints dc 
ON 
    e.object_id = dc.parent_object_id AND
	c.column_id = dc.parent_column_id
WHERE 
	c.default_object_id IS NOT NULL
GO


DROP PROC spDeleteUnneededEntityFields
GO
CREATE PROC spDeleteUnneededEntityFields
AS
/****************************************************************/
-- Step #3 
-- Get rid of any EntityFields that are NOT virtual and are not part of the underlying VIEW or TABLE - these are orphaned meta-data elements
-- where a field once existed but no longer does either it was renamed or removed from the table or view
IF OBJECT_ID('tempdb..#ef_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #ef_spDeleteUnneededEntityFields
IF OBJECT_ID('tempdb..#actual_spDeleteUnneededEntityFields') IS NOT NULL
    DROP TABLE #actual_spDeleteUnneededEntityFields

-- put these two views into temp tables, for some SQL systems, this makes the join below WAY faster
SELECT * INTO #ef_spDeleteUnneededEntityFields FROM vwEntityFields
SELECT * INTO #actual_spDeleteUnneededEntityFields FROM vwSQLColumnsAndEntityFields   

-- first update the entity UpdatedAt so that our metadata timestamps are right
UPDATE admin.Entity SET UpdatedAt=GETDATE() WHERE ID IN
(
	select 
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
DELETE FROM admin.EntityField WHERE ID IN
(
	select 
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

/****************************************************************/
-- Step #4 - UPDATE existing Entity Field records to pull in the latest sequence data
DROP PROC spUpdateExistingEntityFieldsFromSchema
GO
CREATE PROC spUpdateExistingEntityFieldsFromSchema
AS
UPDATE [admin].EntityField
SET
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
	UpdatedAt = GETDATE() -- this will reflect an update data even if no changes were made, not optimal but doesn't really matter that much either
FROM
	[admin].EntityField ef
INNER JOIN
	vwSQLColumnsAndEntityFields fromSQL
ON
	ef.EntityID = fromSQL.EntityID AND
	ef.Name = fromSQL.FieldName
INNER JOIN
    [admin].Entity e 
ON
    ef.EntityID = e.ID
LEFT OUTER JOIN
	vwForeignKeys fk
ON
	ef.Name = fk.[column] AND
	e.BaseTable = fk.[table]
LEFT OUTER JOIN 
    [admin].Entity re -- Related Entity
ON
	re.BaseTable = fk.referenced_table
WHERE
	EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records

GO
/****************************************************************/
-- Step #5 - Create NEW Entity field records from the below query
--- NOW DONE IN TypeScript Code wihtin the createNewEntityFieldsFromSchema() inside manageMetadata.ts file
GO


DROP PROC spSetDefaultColumnWidthWhereNeeded
GO
CREATE PROC spSetDefaultColumnWidthWhereNeeded
AS
/**************************************************************************************/
/* Final step - generate default column widths for columns that don't have a width set*/
/**************************************************************************************/

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
	UpdatedAt = GETDATE()
FROM 
	admin.EntityField ef
WHERE
    ef.DefaultColumnWidth IS NULL
GO


DROP PROC spUpdateEntityFieldRelatedEntityNameFieldMap
GO
CREATE PROC spUpdateEntityFieldRelatedEntityNameFieldMap 
(
	@EntityFieldID INT, 
	@RelatedEntityNameFieldMap nvarchar(50)
)
AS
UPDATE 
	admin.EntityField 
SET 
	RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap
WHERE
	ID = @EntityFieldID
GO
