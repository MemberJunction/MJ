DECLARE @SchemaName NVARCHAR(128) = '__mj';

-- Query to find foreign keys in the __mj schema linked to columns that are not UNIQUEIDENTIFIER type
SELECT 
    rt.name AS ReferencedTableName,
    rc.name AS ReferencedColumnName,
    t.name AS TableName,
    c.name AS ColumnName,
    fk.name AS ForeignKeyName,
    TYPE_NAME(c.user_type_id) AS ColumnType
FROM 
    sys.foreign_key_columns fkc
INNER JOIN 
    sys.objects fk ON fkc.constraint_object_id = fk.object_id
INNER JOIN 
    sys.tables t ON fkc.parent_object_id = t.object_id
INNER JOIN 
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN 
    sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
INNER JOIN 
    sys.tables rt ON fkc.referenced_object_id = rt.object_id
INNER JOIN 
    sys.schemas rs ON rt.schema_id = rs.schema_id
INNER JOIN 
    sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
WHERE 
    s.name = @SchemaName
    AND TYPE_NAME(c.user_type_id) <> 'UNIQUEIDENTIFIER'
ORDER BY 
	rt.Name, t.Name




