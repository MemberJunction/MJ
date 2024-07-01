 -- Set the table name here
DECLARE @TableName NVARCHAR(128) = 'WorkspaceItem';
DECLARE @SchemaName NVARCHAR(128) = '__mj';
DECLARE @SQL NVARCHAR(MAX);
DECLARE @PKName NVARCHAR(128);

-- Check if the table exists in the specified schema
IF NOT EXISTS (
    SELECT 1
    FROM sys.tables AS t
    INNER JOIN sys.schemas AS s ON t.schema_id = s.schema_id
    WHERE s.name = @SchemaName AND t.name = @TableName
)
BEGIN
    RAISERROR('Table %s.%s does not exist.', 16, 1, @SchemaName, @TableName);
    RETURN;
END

-- Generate SQL to change the ID column

-- Step 1: Drop the primary key constraint if it exists
SELECT @PKName = kc.name
FROM sys.key_constraints AS kc
INNER JOIN sys.tables AS t ON kc.parent_object_id = t.object_id
INNER JOIN sys.schemas AS s ON t.schema_id = s.schema_id
WHERE s.name = @SchemaName AND t.name = @TableName AND kc.type = 'PK';

IF @PKName IS NOT NULL
BEGIN
    SET @SQL = 'ALTER TABLE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) + ' DROP CONSTRAINT ' + QUOTENAME(@PKName);
    EXEC sp_executesql @SQL;
END

-- Step 2: Add new uniqueidentifier column
SET @SQL = 'ALTER TABLE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) + ' ADD NewID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() NOT NULL';
EXEC sp_executesql @SQL;

-- Step 3: Update new column with newsequentialid values
SET @SQL = 'UPDATE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) + ' SET NewID = NEWID()';
EXEC sp_executesql @SQL;

-- Step 4: Drop the old ID column
SET @SQL = 'ALTER TABLE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) + ' DROP COLUMN ID';
EXEC sp_executesql @SQL;

-- Step 5: Rename the new column to ID
SET @SQL = 'EXEC sp_rename ''' + @SchemaName + '.' + @TableName + '.NewID'', ''ID'', ''COLUMN''';
EXEC sp_executesql @SQL;

-- Step 6: Recreate the primary key constraint
SET @SQL = 'ALTER TABLE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) + ' ADD CONSTRAINT PK_' + @TableName + '_ID PRIMARY KEY (ID)';
EXEC sp_executesql @SQL;

-- Check the result
SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName));
