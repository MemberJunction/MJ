/*

DECLARE @TableName NVARCHAR(128) = 'AuditLogType';
DECLARE @ForeignKeyColumnName NVARCHAR(128) = 'ParentID';
DECLARE @ReferencedTableName NVARCHAR(128) = 'AuditLogType';
DECLARE @ReferencedPrimaryKeyColumnName NVARCHAR(128) = 'ID';

DECLARE @SQL NVARCHAR(MAX);
DECLARE @UpdateSQL NVARCHAR(MAX);
DECLARE @NewColumnName NVARCHAR(128);

-- Construct the new column name by appending an underscore
SET @NewColumnName = 'ParentID_';--@ForeignKeyColumnName + '_';

-- Construct the SQL statement to add the new column
SET @SQL = 'ALTER TABLE [__mj].[' + @TableName + '] ADD [' + @NewColumnName + '] UNIQUEIDENTIFIER';

-- Execute the SQL statement to add the new column
EXEC sp_executesql @SQL;

-- Construct the SQL statement to update the new column with the values from the referenced table
SET @UpdateSQL = 'UPDATE tgt ' +
                 'SET tgt.[' + @NewColumnName + '] = src.[ID_] ' +
                 'FROM [__mj].[' + @TableName + '] tgt ' +
                 'INNER JOIN [__mj].[' + @ReferencedTableName + '] src ' +
                 'ON tgt.[' + @ForeignKeyColumnName + '] = src.[' + @ReferencedPrimaryKeyColumnName + ']';

-- Execute the SQL statement to update the new column
EXEC sp_executesql @UpdateSQL;

DECLARE @TestSQL NVARCHAR(MAX);
SET @TestSQL = 'SELECT 
					tgt.ID, tgt.' + @ForeignKeyColumnName + ', tgt.' + @NewColumnName + ', src.ID, src.ID_ 
				FROM 
					__mj.[' + @TableName + '] tgt 
				INNER JOIN
					__mj.[' + @ReferencedTableName + '] src
				ON
					tgt.[' + @NewColumnName + ']= src.ID_' ;
EXEC sp_executesql @TestSQL;
 

*/
