/*
   MemberJunction Migration: v3.5.x

   Description: Updates vwSQLTablesAndEntities view to include table and view descriptions
                from sys.extended_properties. This enables Entity records to automatically
                pick up descriptions from database metadata.

   Created: 2026-02-05
*/

-- Drop existing view
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwSQLTablesAndEntities]
GO

-- Recreate view with description columns
CREATE VIEW [${flyway:defaultSchema}].[vwSQLTablesAndEntities]
AS
SELECT
	e.ID EntityID,
	e.Name EntityName,
	e.VirtualEntity,
	t.name TableName,
	s.name SchemaName,
	t.*,
	v.object_id view_object_id,
	v.name ViewName,
    EP_Table.value AS TableDescription, -- Join with sys.extended_properties to get the table description
    EP_View.value AS ViewDescription, -- Join with sys.extended_properties to get the view description
	COALESCE(EP_View.value, EP_Table.value) AS EntityDescription -- grab the view description first and if that doesn't exist, grab the table description and we'll use this as the description for the entity
FROM
	sys.all_objects t
INNER JOIN
	sys.schemas s
ON
	t.schema_id = s.schema_id
LEFT OUTER JOIN
	[${flyway:defaultSchema}].Entity e
ON
	t.name = e.BaseTable AND
	s.name = e.SchemaName
LEFT OUTER JOIN
	sys.all_objects v
ON
	e.BaseView = v.name AND
	v.type = 'V' AND
	v.schema_id = s.schema_id
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
    (s_v.name = e.SchemaName OR s_v.name IS NULL) AND
	( t.TYPE = 'U' OR (t.Type='V' AND e.VirtualEntity=1)) -- TABLE - non-virtual entities
GO
