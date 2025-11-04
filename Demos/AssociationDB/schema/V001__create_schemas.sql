/******************************************************************************
 * Association Sample Database - Schema Creation
 * File: V001__create_schemas.sql
 *
 * Creates all database schemas for the association management system.
 * This separates different business domains into logical schemas.
 ******************************************************************************/

-- Create membership schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'membership')
BEGIN
    EXEC('CREATE SCHEMA membership');
    PRINT 'Created schema: membership';
END
GO

-- Create events schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'events')
BEGIN
    EXEC('CREATE SCHEMA events');
    PRINT 'Created schema: events';
END
GO

-- Create learning schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'learning')
BEGIN
    EXEC('CREATE SCHEMA learning');
    PRINT 'Created schema: learning';
END
GO

-- Create finance schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'finance')
BEGIN
    EXEC('CREATE SCHEMA finance');
    PRINT 'Created schema: finance';
END
GO

-- Create marketing schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'marketing')
BEGIN
    EXEC('CREATE SCHEMA marketing');
    PRINT 'Created schema: marketing';
END
GO

-- Create email schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'email')
BEGIN
    EXEC('CREATE SCHEMA email');
    PRINT 'Created schema: email';
END
GO

-- Create chapters schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'chapters')
BEGIN
    EXEC('CREATE SCHEMA chapters');
    PRINT 'Created schema: chapters';
END
GO

-- Create governance schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'governance')
BEGIN
    EXEC('CREATE SCHEMA governance');
    PRINT 'Created schema: governance';
END
GO

PRINT 'All schemas created successfully!';
PRINT 'Schemas: membership, events, learning, finance, marketing, email, chapters, governance';
GO
