-- =================================================================================
-- Fix Multi-Schema Support for CodeGen
-- =================================================================================
-- This migration fixes two critical issues preventing EntityField creation for
-- entities in non-core schemas (like Skip.Component):
-- 1. Removes buggy FilteredColumns CTE that filtered out columns without defaults
-- 2. Fixes WHERE clause to include all tables/views, not just those with entities
-- =================================================================================

-- PART 1: Fix vwSQLTablesAndEntities to properly handle multi-schema scenarios
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwSQLTablesAndEntities]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSQLTablesAndEntities]
AS
SELECT
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.object_id,
	t.principal_id,
	t.schema_id,
	t.parent_object_id,
	t.type,
	t.type_desc,
	t.create_date,
	t.modify_date,
	t.is_ms_shipped,
	t.is_published,
	t.is_schema_published,
	CASE 
	    WHEN s_v.name = e.SchemaName THEN v.object_id 
	    ELSE NULL 
	END as view_object_id,  -- Only use view if it's in the correct schema
	CASE 
	    WHEN s_v.name = e.SchemaName THEN v.name 
	    ELSE NULL 
	END as ViewName,
    EP_Table.value AS TableDescription,
    EP_View.value AS ViewDescription,
	COALESCE(EP_View.value, EP_Table.value) AS EntityDescription
FROM
	sys.all_objects t
INNER JOIN
	sys.schemas s
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	${flyway:defaultSchema}.Entity e
ON
	t.name = e.BaseTable AND
	s.name = e.SchemaName
LEFT OUTER JOIN
	sys.all_objects v
ON
	e.BaseView = v.name AND
	v.type = 'V'
LEFT OUTER JOIN
    sys.schemas s_v
ON
    v.schema_id = s_v.schema_id
LEFT OUTER JOIN
    sys.extended_properties EP_Table
ON
    EP_Table.major_id = t.object_id
    AND EP_Table.minor_id = 0
    AND EP_Table.name = 'MS_Description'
LEFT OUTER JOIN
    sys.extended_properties EP_View
ON
    EP_View.major_id = v.object_id
    AND EP_View.minor_id = 0
    AND EP_View.name = 'MS_Description'
WHERE
	t.TYPE = 'U'  -- Include all tables (both with and without existing entities)
	OR (t.TYPE = 'V' AND e.VirtualEntity = 1)  -- Include views only when marked as VirtualEntity
GO

-- PART 2: Fix vwSQLColumnsAndEntityFields - remove the buggy FilteredColumns CTE
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
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
    basetable_columns.column_id BaseTableSequence,
	c.name FieldName,
	COALESCE(bt.name, t.name) Type,
	IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType,
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	IIF(COALESCE(bt.name, t.name) IN ('timestamp', 'rowversion'), 1, IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity)) AutoIncrement,
	c.column_id,
	IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual,
	basetable_columns.object_id,
	dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
	cc.definition ComputedColumnDefinition,
	COALESCE(EP_View.value, EP_Table.value) AS [Description],
	EP_View.value AS ViewColumnDescription,
	EP_Table.value AS TableColumnDescription
FROM
	sys.all_columns c  -- No FilteredColumns CTE - use sys.all_columns directly
INNER JOIN
	[${flyway:defaultSchema}].vwSQLTablesAndEntities e
ON
    c.object_id = COALESCE(e.view_object_id, e.object_id)  -- Use view if available, else table
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
LEFT OUTER JOIN
    sys.types bt
ON
    t.system_type_id = bt.user_type_id AND t.is_user_defined = 1
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
	sys.all_columns basetable_columns
ON
	basetable.object_id = basetable_columns.object_id AND
	c.name = basetable_columns.name 
LEFT OUTER JOIN
	${flyway:defaultSchema}.EntityField ef 
ON
	e.EntityID = ef.EntityID AND
	c.name = ef.Name
LEFT OUTER JOIN 
    sys.default_constraints dc 
ON 
    e.object_id = dc.parent_object_id AND
	basetable_columns.column_id = dc.parent_column_id
LEFT OUTER JOIN 
    sys.extended_properties EP_Table 
ON 
	EP_Table.major_id = basetable_columns.object_id AND 
	EP_Table.minor_id = basetable_columns.column_id AND 
	EP_Table.name = 'MS_Description'
LEFT OUTER JOIN 
    sys.extended_properties EP_View 
ON 
	EP_View.major_id = c.object_id AND 
	EP_View.minor_id = c.column_id AND 
	EP_View.name = 'MS_Description'
GO

-- The key fixes:
-- 1. vwSQLTablesAndEntities uses CASE statements to only use view_object_id when view is in correct schema
-- 2. vwSQLColumnsAndEntityFields no longer has the buggy FilteredColumns CTE
-- 3. Explicit column list instead of t.* prevents duplicate column name issues
-- 4. When Skip.Component has no view in Skip schema, view_object_id is NULL and table is used instead