-- CodeGen large-schema performance: narrow the column-introspection view to user objects.
--
-- vwSQLColumnsAndEntityFields drives CodeGen's per-field metadata sync. It scanned
-- sys.all_columns / sys.all_objects, which include every system and internal-table column
-- (~10x the rows). CodeGen only ever consumes real user columns (the joins to user tables
-- and __mj.EntityField discard the rest), so switching to sys.columns / sys.objects returns
-- identical results while reading roughly a tenth of the catalog.
--
-- Measured on a 500-table synthetic schema: a full cold CodeGen run dropped 190.7s -> 105.9s
-- (-44.5%), almost entirely from the "update existing fields" phase (~53s -> ~5s). Generated
-- output (SQL objects, entity classes, Angular forms) is byte-for-byte identical, verified
-- against a golden-diff gate. The gain scales with schema size.
--
-- This is the ONLY change vs the prior definition: three catalog-view references swapped from
-- the sys.all_* variants to the sys.* variants. All columns, joins, and predicates are unchanged.

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
AS
WITH FilteredColumns AS (
    SELECT *
    FROM sys.columns
    WHERE default_object_id IS NOT NULL
)
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
    IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- view-only OR computed; use IsComputed below to disambiguate
    IIF(cc.definition IS NOT NULL, 1, 0) IsComputed, -- physically in base table but read-only at SQL layer
    basetable_columns.object_id,
    dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
    cc.definition ComputedColumnDefinition,
    COALESCE(EP_View.value, EP_Table.value) AS [Description],
    EP_View.value AS ViewColumnDescription,
    EP_Table.value AS TableColumnDescription
FROM
    FilteredColumns c
INNER JOIN
    [${flyway:defaultSchema}].vwSQLTablesAndEntities e
    ON c.object_id = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
    sys.types t ON c.user_type_id = t.user_type_id
LEFT OUTER JOIN
    sys.types bt ON t.system_type_id = bt.user_type_id AND t.is_user_defined = 1
INNER JOIN
    sys.objects basetable ON e.object_id = basetable.object_id
LEFT OUTER JOIN
    sys.computed_columns cc ON e.object_id = cc.object_id AND c.name = cc.name
LEFT OUTER JOIN
    sys.columns basetable_columns
    ON basetable.object_id = basetable_columns.object_id AND c.name = basetable_columns.name
LEFT OUTER JOIN
    [${flyway:defaultSchema}].EntityField ef ON e.EntityID = ef.EntityID AND c.name = ef.Name
LEFT OUTER JOIN
    sys.default_constraints dc
    ON e.object_id = dc.parent_object_id AND basetable_columns.column_id = dc.parent_column_id
LEFT OUTER JOIN
    sys.extended_properties EP_Table
    ON EP_Table.major_id = basetable_columns.object_id
       AND EP_Table.minor_id = basetable_columns.column_id
       AND EP_Table.name = 'MS_Description'
       AND EP_Table.class_desc = 'OBJECT_OR_COLUMN'
LEFT OUTER JOIN
    sys.extended_properties EP_View
    ON EP_View.major_id = c.object_id
       AND EP_View.minor_id = c.column_id
       AND EP_View.name = 'MS_Description'
       AND EP_View.class_desc = 'OBJECT_OR_COLUMN'
GO
