/******************************************************************************
 * Association Sample Database - Schema Creation
 * File: V001__create_schema.sql
 *
 * Creates the AssociationDemo schema for all sample database tables.
 * Single schema approach for simplified querying and maintenance.
 ******************************************************************************/

-- Create AssociationDemo schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'AssociationDemo')
BEGIN
    EXEC('CREATE SCHEMA AssociationDemo');
    PRINT 'Created schema: AssociationDemo';
END
GO

PRINT 'Schema created successfully!';
GO
