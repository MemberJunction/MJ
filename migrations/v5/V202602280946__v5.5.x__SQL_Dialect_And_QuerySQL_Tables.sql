/**************************************************************************************************
 * Migration: SQL Dialect and Query SQL Tables
 *
 * Purpose: Add multi-dialect SQL support for the Query system. Queries can now store
 * dialect-specific SQL variants (e.g., T-SQL, PostgreSQL) so the correct SQL is executed
 * at runtime based on the active database platform.
 *
 * Entities created:
 *   1. MJ: SQL Dialects - Lookup table for SQL language dialects
 *   2. MJ: Query SQLs - Dialect-specific SQL for each query
 *
 * Entity modified:
 *   1. MJ: Queries - Added SQLDialectID column (defaults to T-SQL dialect)
 *
 * Version: 5.5.x
 **************************************************************************************************/

-- ============================================================================
-- 1. SQLDialect (MJ: SQL Dialects)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[SQLDialect] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [PlatformKey] NVARCHAR(50) NOT NULL,
    [DatabaseName] NVARCHAR(100) NOT NULL,
    [LanguageName] NVARCHAR(100) NOT NULL,
    [VendorName] NVARCHAR(200) NULL,
    [WebURL] NVARCHAR(500) NULL,
    [Icon] NVARCHAR(500) NULL,
    [Description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_SQLDialect] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_SQLDialect_Name] UNIQUE ([Name]),
    CONSTRAINT [UQ_SQLDialect_PlatformKey] UNIQUE ([PlatformKey])
);
GO

-- Extended properties for SQLDialect
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique display name for the SQL dialect (e.g., T-SQL, PostgreSQL)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lowercase identifier matching DatabasePlatform type in code (e.g., sqlserver, postgresql). Used by providers to find their dialect at runtime.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'PlatformKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the database engine (e.g., SQL Server, PostgreSQL, MySQL)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'DatabaseName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name of the SQL language variant (e.g., T-SQL, PL/pgSQL, SQL/PSM)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'LanguageName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary vendor or organization behind this database (e.g., Microsoft, PostgreSQL Global Development Group)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'VendorName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'URL to the database vendor or documentation website', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'WebURL';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'CSS class or icon reference for UI display', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'Icon';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Detailed description of this SQL dialect and its characteristics', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'SQLDialect', @level2type=N'COLUMN', @level2name=N'Description';
GO

-- ============================================================================
-- 2. Seed SQLDialect rows
-- ============================================================================
INSERT INTO ${flyway:defaultSchema}.[SQLDialect] ([ID], [Name], [PlatformKey], [DatabaseName], [LanguageName], [VendorName], [WebURL], [Icon], [Description])
VALUES
    ('1F203987-A37B-4BC1-85B3-BA50DC33C3E0', 'T-SQL', 'sqlserver', 'SQL Server', 'T-SQL', 'Microsoft', 'https://learn.microsoft.com/en-us/sql/', 'fa-brands fa-microsoft', 'Transact-SQL dialect used by Microsoft SQL Server and Azure SQL Database'),
    ('426915F2-D4FE-4AB9-97A8-39063561DE9F', 'PostgreSQL', 'postgresql', 'PostgreSQL', 'PL/pgSQL', 'PostgreSQL Global Development Group', 'https://www.postgresql.org/', 'fa-solid fa-database', 'PostgreSQL SQL dialect with PL/pgSQL procedural extensions');
GO

-- ============================================================================
-- 3. QuerySQL (MJ: Query SQLs)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[QuerySQL] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [QueryID] UNIQUEIDENTIFIER NOT NULL,
    [SQLDialectID] UNIQUEIDENTIFIER NOT NULL,
    [SQL] NVARCHAR(MAX) NOT NULL,
    CONSTRAINT [PK_QuerySQL] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_QuerySQL_Query] FOREIGN KEY ([QueryID])
        REFERENCES ${flyway:defaultSchema}.[Query]([ID]),
    CONSTRAINT [FK_QuerySQL_SQLDialect] FOREIGN KEY ([SQLDialectID])
        REFERENCES ${flyway:defaultSchema}.[SQLDialect]([ID]),
    CONSTRAINT [UQ_QuerySQL_Query_Dialect] UNIQUE ([QueryID], [SQLDialectID])
);
GO

-- Extended properties for QuerySQL
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the query this SQL variant belongs to', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'QuerySQL', @level2type=N'COLUMN', @level2name=N'QueryID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the SQL dialect this SQL is written in', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'QuerySQL', @level2type=N'COLUMN', @level2name=N'SQLDialectID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The SQL query text in the specified dialect. May include Nunjucks template parameters.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'QuerySQL', @level2type=N'COLUMN', @level2name=N'SQL';
GO

-- ============================================================================
-- 4. Add SQLDialectID to Query table (defaults to T-SQL)
-- ============================================================================
ALTER TABLE ${flyway:defaultSchema}.[Query]
ADD [SQLDialectID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_Query_SQLDialect] FOREIGN KEY
    REFERENCES ${flyway:defaultSchema}.[SQLDialect]([ID]);
GO

-- Set existing queries to T-SQL dialect
UPDATE ${flyway:defaultSchema}.[Query]
SET [SQLDialectID] = '1F203987-A37B-4BC1-85B3-BA50DC33C3E0';
GO

-- Now make it NOT NULL with a default
ALTER TABLE ${flyway:defaultSchema}.[Query]
ALTER COLUMN [SQLDialectID] UNIQUEIDENTIFIER NOT NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.[Query]
ADD CONSTRAINT [DF_Query_SQLDialectID] DEFAULT ('1F203987-A37B-4BC1-85B3-BA50DC33C3E0') FOR [SQLDialectID];
GO

-- Extended property for the new column
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The SQL dialect that the SQL column is written in. Defaults to T-SQL for backward compatibility.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Query', @level2type=N'COLUMN', @level2name=N'SQLDialectID';
GO
