CREATE INDEX IX_EntityField_EntityID
ON ${flyway:defaultSchema}.EntityField (EntityID);

CREATE INDEX IX_EntityField_Name
ON ${flyway:defaultSchema}.EntityField (Name);

-- Index on Name
CREATE INDEX IX_Entity_Name
ON ${flyway:defaultSchema}.Entity (Name);

-- Index on BaseTable
CREATE INDEX IX_Entity_BaseTable
ON ${flyway:defaultSchema}.Entity (BaseTable);

-- Index on BaseView
CREATE INDEX IX_Entity_BaseView
ON ${flyway:defaultSchema}.Entity (BaseView);

-- Index on SchemaName
CREATE INDEX IX_Entity_SchemaName
ON ${flyway:defaultSchema}.Entity (SchemaName);

CREATE INDEX IX_Entity_Name_BaseTable_SchemaName
ON ${flyway:defaultSchema}.Entity (Name, BaseTable, SchemaName);

CREATE INDEX IX_Entity_ID_SchemaName_BaseTable
ON [${flyway:defaultSchema}].Entity (ID, SchemaName, BaseTable);

CREATE INDEX IX_EntityField_EntityID_Name
ON [${flyway:defaultSchema}].EntityField (EntityID, Name);


GO
 



DROP PROC IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    -- Step 1: Parse the excluded schema names into a table
    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Step 2: Precompute the join results in a CTE
    WITH PrecomputedData AS (
        SELECT 
            ef.ID AS EntityFieldID,
            ef.AutoUpdateDescription,
            ef.Description AS ExistingDescription,
            fromSQL.Description AS SQLDescription,
            fromSQL.Type,
            fromSQL.Length,
            fromSQL.Precision,
            fromSQL.Scale,
            fromSQL.AllowsNull,
            fromSQL.DefaultValue,
            fromSQL.AutoIncrement,
            fromSQL.IsVirtual,
            fromSQL.Sequence,
            re.ID AS RelatedEntityID,
            fk.referenced_column AS RelatedEntityFieldName,
            CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
            CASE 
                WHEN pk.ColumnName IS NOT NULL THEN 1 
                ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
            END AS IsUnique,
            e.VirtualEntity,
            excludedSchemas.SchemaName AS ExcludedSchemaName
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
    )
    -- Step 3: Perform the update using the precomputed data
    UPDATE ef
    SET
        ef.Description = IIF(pd.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), pd.SQLDescription), pd.ExistingDescription),
        ef.Type = pd.Type,
        ef.Length = pd.Length,
        ef.Precision = pd.Precision,
        ef.Scale = pd.Scale,
        ef.AllowsNull = pd.AllowsNull,
        ef.DefaultValue = pd.DefaultValue,
        ef.AutoIncrement = pd.AutoIncrement,
        ef.IsVirtual = pd.IsVirtual,
        ef.Sequence = pd.Sequence,
        ef.RelatedEntityID = pd.RelatedEntityID,
        ef.RelatedEntityFieldName = pd.RelatedEntityFieldName,
        ef.IsPrimaryKey = pd.IsPrimaryKey,
        ef.IsUnique = pd.IsUnique,
        ef.${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        PrecomputedData pd
    ON
        ef.ID = pd.EntityFieldID
    WHERE
        pd.VirtualEntity = 0
        AND pd.EntityFieldID IS NOT NULL -- only where we HAVE ALREADY CREATED EntityField records
        AND pd.ExcludedSchemaName IS NULL; -- Only include non-excluded schemas
END
GO
 





DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
GO
CREATE VIEW [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
AS
WITH FilteredColumns AS (
    SELECT *
    FROM sys.all_columns
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
	COALESCE(bt.name, t.name) Type, -- get the type from the base type (bt) if it exists, this is in the case of a user-defined type being used, t.name would be the UDT name.
	IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType, -- we have a user defined type, so pass that to the view caller too
	c.max_length Length,
	c.precision Precision,
	c.scale Scale,
	c.is_nullable AllowsNull,
	IIF(COALESCE(bt.name, t.name) IN ('timestamp', 'rowversion'), 1, IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity)) AutoIncrement,
	c.column_id,
	IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- updated so that we take into account that computed columns are virtual always, previously only looked for existence of a column in table vs. a view
	basetable_columns.object_id,
	dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
	cc.definition ComputedColumnDefinition,
	COALESCE(EP_View.value, EP_Table.value) AS [Description], -- Dynamically choose description - first look at view level if a description was defined there (rare) and then go to table if it was defined there (often not there either)
	EP_View.value AS ViewColumnDescription,
	EP_Table.value AS TableColumnDescription
FROM
	FilteredColumns c
INNER JOIN
	[${flyway:defaultSchema}].vwSQLTablesAndEntities e
ON
  c.object_id = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
	sys.types t 
ON
	c.user_type_id = t.user_type_id
LEFT OUTER JOIN
    sys.types bt
ON
    t.system_type_id = bt.user_type_id AND t.is_user_defined = 1 -- Join to fetch base type for UDTs
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
