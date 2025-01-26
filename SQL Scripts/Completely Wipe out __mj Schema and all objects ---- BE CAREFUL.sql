DECLARE @ObjectName NVARCHAR(MAX), @ObjectType NVARCHAR(MAX);

-- Declare a cursor to retrieve all objects (functions, stored procedures, views, tables) in the __mj schema
DECLARE cur CURSOR FOR
SELECT name AS ObjectName, type AS ObjectType
FROM sys.objects
WHERE SCHEMA_NAME(schema_id) = '__mj'
  AND type IN ('P', 'V', 'FN', 'TF', 'IF', 'U'); -- P = Stored Procedure, V = View, FN = Scalar Function, TF = Table Function, IF = Inline Table Function, U = Table

-- Open the cursor
OPEN cur;

-- Fetch the first object name and type
FETCH NEXT FROM cur INTO @ObjectName, @ObjectType;

-- Loop through all objects
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Construct the DROP statement based on object type
    DECLARE @Sql NVARCHAR(MAX);
    SET @Sql = CASE @ObjectType
                 WHEN 'P' THEN 'DROP PROCEDURE __mj.' + QUOTENAME(@ObjectName)
                 WHEN 'V' THEN 'DROP VIEW __mj.' + QUOTENAME(@ObjectName)
                 WHEN 'FN' THEN 'DROP FUNCTION __mj.' + QUOTENAME(@ObjectName)
                 WHEN 'TF' THEN 'DROP FUNCTION __mj.' + QUOTENAME(@ObjectName)
                 WHEN 'IF' THEN 'DROP FUNCTION __mj.' + QUOTENAME(@ObjectName)
                 WHEN 'U' THEN 'DROP TABLE __mj.' + QUOTENAME(@ObjectName)
               END;

    PRINT 'Dropping ' + @ObjectType + ': ' + @ObjectName;
    EXEC sp_executesql @Sql;

    -- Fetch the next object name and type
    FETCH NEXT FROM cur INTO @ObjectName, @ObjectType;
END

-- Close and deallocate the cursor
CLOSE cur;
DEALLOCATE cur;

-- Drop the schema itself
DECLARE @DropSchemaSql NVARCHAR(MAX);
SET @DropSchemaSql = 'DROP SCHEMA __mj';
PRINT 'Dropping schema: __mj';
EXEC sp_executesql @DropSchemaSql;

PRINT 'All objects and the schema __mj have been dropped.';
