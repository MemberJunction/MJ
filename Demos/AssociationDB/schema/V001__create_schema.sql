/******************************************************************************
 * Association Sample Database - Schema Creation
 * File: V001__create_schema.sql
 *
 * Creates the AssociationDemo schema for all sample database tables.
 * Single schema approach for simplified querying and maintenance.
 ******************************************************************************/

-- Drop and recreate AssociationDemo schema (ensures clean install)
IF EXISTS (SELECT * FROM sys.schemas WHERE name = 'AssociationDemo')
BEGIN
    PRINT 'Dropping existing AssociationDemo schema...';

    -- Drop all foreign key constraints first
    DECLARE @sql NVARCHAR(MAX) = '';
    SELECT @sql = @sql + 'ALTER TABLE [' + OBJECT_SCHEMA_NAME(parent_object_id) + '].[' + OBJECT_NAME(parent_object_id) + '] DROP CONSTRAINT [' + name + ']; '
    FROM sys.foreign_keys
    WHERE OBJECT_SCHEMA_NAME(parent_object_id) = 'AssociationDemo';

    IF LEN(@sql) > 0
    BEGIN
        EXEC sp_executesql @sql;
        PRINT '  Dropped all foreign key constraints';
    END

    -- Now drop all tables
    SET @sql = '';
    SELECT @sql = @sql + 'DROP TABLE [AssociationDemo].[' + TABLE_NAME + ']; '
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'AssociationDemo';

    IF LEN(@sql) > 0
    BEGIN
        EXEC sp_executesql @sql;
        PRINT '  Dropped all tables in AssociationDemo schema';
    END

    -- Now drop the schema
    EXEC('DROP SCHEMA AssociationDemo');
    PRINT '  Dropped AssociationDemo schema';
END
GO

-- Create AssociationDemo schema
EXEC('CREATE SCHEMA AssociationDemo');
PRINT 'Created schema: AssociationDemo';
GO

PRINT 'Schema created successfully!';
GO
