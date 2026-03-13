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






































































































-- CODEGEN RUN 
/* SQL generated to create new entity MJ: SQL Dialects */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'c6cd026f-239f-4ca8-9adc-50e5b81ef230',
         'MJ: SQL Dialects',
         'SQL Dialects',
         NULL,
         NULL,
         'SQLDialect',
         'vwSQLDialects',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: SQL Dialects to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c6cd026f-239f-4ca8-9adc-50e5b81ef230', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: SQL Dialects for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c6cd026f-239f-4ca8-9adc-50e5b81ef230', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: SQL Dialects for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c6cd026f-239f-4ca8-9adc-50e5b81ef230', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: SQL Dialects for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c6cd026f-239f-4ca8-9adc-50e5b81ef230', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Query SQLs */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'fe37218e-259f-47f2-909d-9aecbe5385db',
         'MJ: Query SQLs',
         'Query SQLs',
         NULL,
         NULL,
         'QuerySQL',
         'vwQuerySQLs',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Query SQLs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fe37218e-259f-47f2-909d-9aecbe5385db', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Query SQLs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fe37218e-259f-47f2-909d-9aecbe5385db', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Query SQLs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fe37218e-259f-47f2-909d-9aecbe5385db', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Query SQLs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fe37218e-259f-47f2-909d-9aecbe5385db', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SQLDialect */
ALTER TABLE [${flyway:defaultSchema}].[SQLDialect] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SQLDialect */
ALTER TABLE [${flyway:defaultSchema}].[SQLDialect] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.QuerySQL */
ALTER TABLE [${flyway:defaultSchema}].[QuerySQL] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.QuerySQL */
ALTER TABLE [${flyway:defaultSchema}].[QuerySQL] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5d25f06d-7fc2-4710-a2f8-b8fe86cd482b'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5d25f06d-7fc2-4710-a2f8-b8fe86cd482b',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ea72829b-b531-497a-aab4-a78dda81c113'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ea72829b-b531-497a-aab4-a78dda81c113',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100002,
            'Name',
            'Name',
            'Unique display name for the SQL dialect (e.g., T-SQL, PostgreSQL)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd690750e-bc40-41f7-8f99-14ab36beab5b'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'PlatformKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd690750e-bc40-41f7-8f99-14ab36beab5b',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100003,
            'PlatformKey',
            'Platform Key',
            'Lowercase identifier matching DatabasePlatform type in code (e.g., sqlserver, postgresql). Used by providers to find their dialect at runtime.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '711ae31a-847e-4c4e-852b-c3390ae480c9'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'DatabaseName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '711ae31a-847e-4c4e-852b-c3390ae480c9',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100004,
            'DatabaseName',
            'Database Name',
            'Name of the database engine (e.g., SQL Server, PostgreSQL, MySQL)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0320a305-4065-4a67-921d-d6cf9c7fba69'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'LanguageName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0320a305-4065-4a67-921d-d6cf9c7fba69',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100005,
            'LanguageName',
            'Language Name',
            'Name of the SQL language variant (e.g., T-SQL, PL/pgSQL, SQL/PSM)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '99b589ba-2c1b-47f3-b7d0-0a1ff1e97198'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'VendorName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '99b589ba-2c1b-47f3-b7d0-0a1ff1e97198',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100006,
            'VendorName',
            'Vendor Name',
            'Primary vendor or organization behind this database (e.g., Microsoft, PostgreSQL Global Development Group)',
            'nvarchar',
            400,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '29663992-2b7e-4b22-b726-f23abea906d2'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'WebURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '29663992-2b7e-4b22-b726-f23abea906d2',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100007,
            'WebURL',
            'Web URL',
            'URL to the database vendor or documentation website',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c948f312-3ed8-4e57-8805-c65d1bde9767'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'Icon')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c948f312-3ed8-4e57-8805-c65d1bde9767',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100008,
            'Icon',
            'Icon',
            'CSS class or icon reference for UI display',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'db0e0e22-3c5b-4e14-bd92-7ee4a6044929'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'db0e0e22-3c5b-4e14-bd92-7ee4a6044929',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100009,
            'Description',
            'Description',
            'Detailed description of this SQL dialect and its characteristics',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '52676912-1fbe-4fc2-a7ee-d816bf3cebe0'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '52676912-1fbe-4fc2-a7ee-d816bf3cebe0',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'be642b48-8232-4584-a0a3-acda406bc297'  OR 
               (EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'be642b48-8232-4584-a0a3-acda406bc297',
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '250edad5-57ff-4ceb-a2a3-3c932c120fa9'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SQLDialectID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '250edad5-57ff-4ceb-a2a3-3c932c120fa9',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            100047,
            'SQLDialectID',
            'SQL Dialect ID',
            'The SQL dialect that the SQL column is written in. Defaults to T-SQL for backward compatibility.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            '1F203987-A37B-4BC1-85B3-BA50DC33C3E0',
            0,
            1,
            0,
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e3cdac73-8b3e-4c31-9c81-f5e780c68436'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e3cdac73-8b3e-4c31-9c81-f5e780c68436',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cf1fb8dc-b8cb-4b59-9d66-40dcfc19eaea'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = 'QueryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cf1fb8dc-b8cb-4b59-9d66-40dcfc19eaea',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100002,
            'QueryID',
            'Query ID',
            'Foreign key to the query this SQL variant belongs to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '1B248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e38f14e4-644a-4a90-a80a-19245ba59e97'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = 'SQLDialectID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e38f14e4-644a-4a90-a80a-19245ba59e97',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100003,
            'SQLDialectID',
            'SQL Dialect ID',
            'Foreign key to the SQL dialect this SQL is written in',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'C6CD026F-239F-4CA8-9ADC-50E5B81EF230',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9b29ac05-61d8-4dd2-9780-ff9040b17140'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = 'SQL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9b29ac05-61d8-4dd2-9780-ff9040b17140',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100004,
            'SQL',
            'SQL',
            'The SQL query text in the specified dialect. May include Nunjucks template parameters.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4ea8cf6e-d64f-4741-816e-61de1b337b0e'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ea8cf6e-d64f-4741-816e-61de1b337b0e',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100005,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '642cf0f5-0277-42e1-9837-1fd764803de6'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '642cf0f5-0277-42e1-9837-1fd764803de6',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100006,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END


/* Create Entity Relationship: MJ: SQL Dialects -> MJ: Queries (One To Many via SQLDialectID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6abdabc9-0b46-489f-91e1-5a127c51efff'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, Sequence)
                              VALUES ('6abdabc9-0b46-489f-91e1-5a127c51efff', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'SQLDialectID', 'One To Many', 1, 1, 6);
   END
                              


/* Create Entity Relationship: MJ: SQL Dialects -> MJ: Query SQLs (One To Many via SQLDialectID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b4081c69-5310-4fb1-825a-b1d2096ff1c6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, Sequence)
                              VALUES ('b4081c69-5310-4fb1-825a-b1d2096ff1c6', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'SQLDialectID', 'One To Many', 1, 1, 1);
   END
                              


/* Create Entity Relationship: MJ: Queries -> MJ: Query SQLs (One To Many via QueryID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5a2809f4-b3b7-44a2-a07a-51e71554e6dc'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, Sequence)
                              VALUES ('5a2809f4-b3b7-44a2-a07a-51e71554e6dc', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'QueryID', 'One To Many', 1, 1, 2);
   END
                              

/* Index for Foreign Keys for QuerySQL */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QueryID in table QuerySQL
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QuerySQL_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QuerySQL]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QuerySQL_QueryID ON [${flyway:defaultSchema}].[QuerySQL] ([QueryID]);

-- Index for foreign key SQLDialectID in table QuerySQL
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_QuerySQL_SQLDialectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[QuerySQL]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_QuerySQL_SQLDialectID ON [${flyway:defaultSchema}].[QuerySQL] ([SQLDialectID]);

/* SQL text to update entity field related entity name field map for entity field ID CF1FB8DC-B8CB-4B59-9D66-40DCFC19EAEA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF1FB8DC-B8CB-4B59-9D66-40DCFC19EAEA',
         @RelatedEntityNameFieldMap='Query'

/* SQL text to update entity field related entity name field map for entity field ID E38F14E4-644A-4A90-A80A-19245BA59E97 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E38F14E4-644A-4A90-A80A-19245BA59E97',
         @RelatedEntityNameFieldMap='SQLDialect'

/* Base View SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: vwQuerySQLs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query SQLs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QuerySQL
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQuerySQLs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQuerySQLs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQuerySQLs]
AS
SELECT
    q.*,
    MJQuery_QueryID.[Name] AS [Query],
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect]
FROM
    [${flyway:defaultSchema}].[QuerySQL] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_QueryID
  ON
    [q].[QueryID] = MJQuery_QueryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SQLDialect] AS MJSQLDialect_SQLDialectID
  ON
    [q].[SQLDialectID] = MJSQLDialect_SQLDialectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQuerySQLs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: Permissions for vwQuerySQLs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQuerySQLs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spCreateQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QuerySQL
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQuerySQL]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQuerySQL];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuerySQL]
    @ID uniqueidentifier = NULL,
    @QueryID uniqueidentifier,
    @SQLDialectID uniqueidentifier,
    @SQL nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QuerySQL]
            (
                [ID],
                [QueryID],
                [SQLDialectID],
                [SQL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueryID,
                @SQLDialectID,
                @SQL
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QuerySQL]
            (
                [QueryID],
                [SQLDialectID],
                [SQL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueryID,
                @SQLDialectID,
                @SQL
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQuerySQLs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuerySQL] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Query SQLs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuerySQL] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spUpdateQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QuerySQL
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQuerySQL]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQuerySQL];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuerySQL]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @SQLDialectID uniqueidentifier,
    @SQL nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QuerySQL]
    SET
        [QueryID] = @QueryID,
        [SQLDialectID] = @SQLDialectID,
        [SQL] = @SQL
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQuerySQLs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQuerySQLs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuerySQL] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QuerySQL table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQuerySQL]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQuerySQL];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuerySQL
ON [${flyway:defaultSchema}].[QuerySQL]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QuerySQL]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QuerySQL] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Query SQLs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuerySQL] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spDeleteQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QuerySQL
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuerySQL]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuerySQL];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuerySQL]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QuerySQL]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuerySQL] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Query SQLs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuerySQL] TO [cdp_Integration]



/* Index for Foreign Keys for SQLDialect */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: vwSQLDialects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: SQL Dialects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SQLDialect
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSQLDialects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSQLDialects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSQLDialects]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SQLDialect] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSQLDialects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: Permissions for vwSQLDialects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSQLDialects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spCreateSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SQLDialect
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSQLDialect]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSQLDialect];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSQLDialect]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @PlatformKey nvarchar(50),
    @DatabaseName nvarchar(100),
    @LanguageName nvarchar(100),
    @VendorName nvarchar(200),
    @WebURL nvarchar(500),
    @Icon nvarchar(500),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SQLDialect]
            (
                [ID],
                [Name],
                [PlatformKey],
                [DatabaseName],
                [LanguageName],
                [VendorName],
                [WebURL],
                [Icon],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @PlatformKey,
                @DatabaseName,
                @LanguageName,
                @VendorName,
                @WebURL,
                @Icon,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SQLDialect]
            (
                [Name],
                [PlatformKey],
                [DatabaseName],
                [LanguageName],
                [VendorName],
                [WebURL],
                [Icon],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @PlatformKey,
                @DatabaseName,
                @LanguageName,
                @VendorName,
                @WebURL,
                @Icon,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSQLDialects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSQLDialect] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: SQL Dialects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSQLDialect] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spUpdateSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SQLDialect
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSQLDialect]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSQLDialect];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSQLDialect]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @PlatformKey nvarchar(50),
    @DatabaseName nvarchar(100),
    @LanguageName nvarchar(100),
    @VendorName nvarchar(200),
    @WebURL nvarchar(500),
    @Icon nvarchar(500),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SQLDialect]
    SET
        [Name] = @Name,
        [PlatformKey] = @PlatformKey,
        [DatabaseName] = @DatabaseName,
        [LanguageName] = @LanguageName,
        [VendorName] = @VendorName,
        [WebURL] = @WebURL,
        [Icon] = @Icon,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSQLDialects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSQLDialects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSQLDialect] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SQLDialect table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSQLDialect]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSQLDialect];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSQLDialect
ON [${flyway:defaultSchema}].[SQLDialect]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SQLDialect]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SQLDialect] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: SQL Dialects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSQLDialect] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spDeleteSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SQLDialect
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSQLDialect]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSQLDialect];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSQLDialect]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SQLDialect]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSQLDialect] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: SQL Dialects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSQLDialect] TO [cdp_Integration]



/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

-- Index for foreign key EmbeddingModelID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID ON [${flyway:defaultSchema}].[Query] ([EmbeddingModelID]);

-- Index for foreign key SQLDialectID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_SQLDialectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_SQLDialectID ON [${flyway:defaultSchema}].[Query] ([SQLDialectID]);

/* SQL text to update entity field related entity name field map for entity field ID 250EDAD5-57FF-4CEB-A2A3-3C932C120FA9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='250EDAD5-57FF-4CEB-A2A3-3C932C120FA9',
         @RelatedEntityNameFieldMap='SQLDialect'

/* Base View SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID.[Name] AS [Category],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS MJQueryCategory_CategoryID
  ON
    [q].[CategoryID] = MJQueryCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [q].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SQLDialect] AS MJSQLDialect_SQLDialectID
  ON
    [q].[SQLDialectID] = MJSQLDialect_SQLDialectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15) = NULL,
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes int,
    @CacheMaxSize int,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @CacheValidationSQL nvarchar(MAX),
    @SQLDialectID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [ID],
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                ISNULL(@Status, 'Pending'),
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                @CacheTTLMinutes,
                @CacheMaxSize,
                @EmbeddingVector,
                @EmbeddingModelID,
                @CacheValidationSQL,
                CASE @SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @CategoryID,
                @UserQuestion,
                @Description,
                @SQL,
                @TechnicalDescription,
                @OriginalSQL,
                @Feedback,
                ISNULL(@Status, 'Pending'),
                @QualityRank,
                @ExecutionCostRank,
                @UsesTemplate,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                @CacheTTLMinutes,
                @CacheMaxSize,
                @EmbeddingVector,
                @EmbeddingModelID,
                @CacheValidationSQL,
                CASE @SQLDialectID WHEN '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @CategoryID uniqueidentifier,
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int,
    @UsesTemplate bit,
    @AuditQueryRuns bit,
    @CacheEnabled bit,
    @CacheTTLMinutes int,
    @CacheMaxSize int,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier,
    @CacheValidationSQL nvarchar(MAX),
    @SQLDialectID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = @Name,
        [CategoryID] = @CategoryID,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank,
        [UsesTemplate] = @UsesTemplate,
        [AuditQueryRuns] = @AuditQueryRuns,
        [CacheEnabled] = @CacheEnabled,
        [CacheTTLMinutes] = @CacheTTLMinutes,
        [CacheMaxSize] = @CacheMaxSize,
        [EmbeddingVector] = @EmbeddingVector,
        [EmbeddingModelID] = @EmbeddingModelID,
        [CacheValidationSQL] = @CacheValidationSQL,
        [SQLDialectID] = @SQLDialectID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuery
ON [${flyway:defaultSchema}].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Query] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem
    DECLARE @MJDataContextItems_QueryIDID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_DataContextID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_Type nvarchar(50)
    DECLARE @MJDataContextItems_QueryID_ViewID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_QueryID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_EntityID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_RecordID nvarchar(450)
    DECLARE @MJDataContextItems_QueryID_SQL nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_DataJSON nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_LastRefreshedAt datetimeoffset
    DECLARE @MJDataContextItems_QueryID_Description nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_CodeName nvarchar(255)
    DECLARE cascade_update_MJDataContextItems_QueryID_cursor CURSOR FOR
        SELECT [ID], [DataContextID], [Type], [ViewID], [QueryID], [EntityID], [RecordID], [SQL], [DataJSON], [LastRefreshedAt], [Description], [CodeName]
        FROM [${flyway:defaultSchema}].[DataContextItem]
        WHERE [QueryID] = @ID

    OPEN cascade_update_MJDataContextItems_QueryID_cursor
    FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDataContextItems_QueryID_QueryID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @MJDataContextItems_QueryIDID, @DataContextID = @MJDataContextItems_QueryID_DataContextID, @Type = @MJDataContextItems_QueryID_Type, @ViewID = @MJDataContextItems_QueryID_ViewID, @QueryID = @MJDataContextItems_QueryID_QueryID, @EntityID = @MJDataContextItems_QueryID_EntityID, @RecordID = @MJDataContextItems_QueryID_RecordID, @SQL = @MJDataContextItems_QueryID_SQL, @DataJSON = @MJDataContextItems_QueryID_DataJSON, @LastRefreshedAt = @MJDataContextItems_QueryID_LastRefreshedAt, @Description = @MJDataContextItems_QueryID_Description, @CodeName = @MJDataContextItems_QueryID_CodeName

        FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName
    END

    CLOSE cascade_update_MJDataContextItems_QueryID_cursor
    DEALLOCATE cascade_update_MJDataContextItems_QueryID_cursor
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity
    DECLARE @MJQueryEntities_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryEntities_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryEntity]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryEntities_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @ID = @MJQueryEntities_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryEntities_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryEntities_QueryID_cursor
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField
    DECLARE @MJQueryFields_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryFields_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryField]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryFields_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @ID = @MJQueryFields_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryFields_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryFields_QueryID_cursor
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter
    DECLARE @MJQueryParameters_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryParameters_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryParameter]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryParameters_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @ID = @MJQueryParameters_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryParameters_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryParameters_QueryID_cursor
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission
    DECLARE @MJQueryPermissions_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryPermissions_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryPermission]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryPermissions_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @ID = @MJQueryPermissions_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryPermissions_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryPermissions_QueryID_cursor
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL
    DECLARE @MJQuerySQLs_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQuerySQLs_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QuerySQL]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQuerySQLs_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteQuerySQL] @ID = @MJQuerySQLs_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    END
    
    CLOSE cascade_delete_MJQuerySQLs_QueryID_cursor
    DEALLOCATE cascade_delete_MJQuerySQLs_QueryID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2f42f7b6-12ec-4f34-8a1c-981879499727'  OR 
               (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SQLDialect')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2f42f7b6-12ec-4f34-8a1c-981879499727',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            100051,
            'SQLDialect',
            'SQL Dialect',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3d6b3d9a-599c-4ee0-80e3-8f8ff3735849'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = 'Query')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3d6b3d9a-599c-4ee0-80e3-8f8ff3735849',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100013,
            'Query',
            'Query',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd15d419-8f40-4c0c-b365-880b6a84702e'  OR 
               (EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB' AND Name = 'SQLDialect')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd15d419-8f40-4c0c-b365-880b6a84702e',
            'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
            100014,
            'SQLDialect',
            'SQL Dialect',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = 'D690750E-BC40-41F7-8F99-14AB36BEAB5B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = '711AE31A-847E-4C4E-852B-C3390AE480C9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = '0320A305-4065-4A67-921D-D6CF9C7FBA69'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = '99B589BA-2C1B-47F3-B7D0-0A1FF1E97198'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D690750E-BC40-41F7-8F99-14AB36BEAB5B'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '711AE31A-847E-4C4E-852B-C3390AE480C9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0320A305-4065-4A67-921D-D6CF9C7FBA69'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '99B589BA-2C1B-47F3-B7D0-0A1FF1E97198'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = '2F42F7B6-12EC-4F34-8A1C-981879499727'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2F42F7B6-12EC-4F34-8A1C-981879499727'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = '642CF0F5-0277-42E1-9837-1FD764803DE6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET DefaultInView = 1
               WHERE ID = 'FD15D419-8F40-4C0C-B365-880B6A84702E'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].EntityField
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'FD15D419-8F40-4C0C-B365-880B6A84702E'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: SQL Dialects.ID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D25F06D-7FC2-4710-A2F8-B8FE86CD482B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.Name 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Dialect Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA72829B-B531-497A-AAB4-A78DDA81C113' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.DatabaseName 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Dialect Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '711AE31A-847E-4C4E-852B-C3390AE480C9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.LanguageName 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Dialect Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0320A305-4065-4A67-921D-D6CF9C7FBA69' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.Description 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Dialect Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB0E0E22-3C5B-4E14-BD92-7EE4A6044929' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.PlatformKey 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Integration & Resources',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D690750E-BC40-41F7-8F99-14AB36BEAB5B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.Icon 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Integration & Resources',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C948F312-3ED8-4E57-8805-C65D1BDE9767' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.VendorName 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Integration & Resources',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99B589BA-2C1B-47F3-B7D0-0A1FF1E97198' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.WebURL 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Integration & Resources',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '29663992-2B7E-4B22-B726-F23ABEA906D2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52676912-1FBE-4FC2-A7EE-D816BF3CEBE0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: SQL Dialects.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE642B48-8232-4584-A0A3-ACDA406BC297' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-database */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-database', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ef11701f-c84d-4aef-99da-d46e1b6bd6a6', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'FieldCategoryInfo', '{"Dialect Information":{"icon":"fa fa-language","description":"Core identification and descriptive details of the SQL dialect and its language variant"},"Integration & Resources":{"icon":"fa fa-microchip","description":"Technical keys for system integration, UI icons, and external vendor resources"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit tracking timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c717fe16-f343-4c57-b239-499e30406a65', 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', 'FieldCategoryIcons', '{"Dialect Information":"fa fa-language","Integration & Resources":"fa fa-microchip","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C6CD026F-239F-4CA8-9ADC-50E5B81EF230'
      

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Query SQLs.SQL 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'SQL Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'SQL Query',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '9B29AC05-61D8-4DD2-9780-FF9040B17140' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.SQLDialectID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'SQL Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'SQL Dialect',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E38F14E4-644A-4A90-A80A-19245BA59E97' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.SQLDialect 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'SQL Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dialect Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD15D419-8F40-4C0C-B365-880B6A84702E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.QueryID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Query Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF1FB8DC-B8CB-4B59-9D66-40DCFC19EAEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.Query 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Query Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D6B3D9A-599C-4EE0-80E3-8F8FF3735849' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.ID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3CDAC73-8B3E-4C31-9C81-F5E780C68436' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EA8CF6E-D64F-4741-816E-61DE1B337B0E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Query SQLs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '642CF0F5-0277-42E1-9837-1FD764803DE6' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-terminal */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-terminal', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'FE37218E-259F-47F2-909D-9AECBE5385DB'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e0028b4a-3728-4974-9946-900431a745e3', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'FieldCategoryInfo', '{"SQL Definition":{"icon":"fa fa-code","description":"The actual SQL code and the specific dialect (PostgreSQL, SQL Server, etc.) it is written for"},"Query Context":{"icon":"fa fa-link","description":"Relationships linking this SQL variant to its parent query definition"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3590cfc4-ba8c-4b1c-82d2-e8215ae5d207', 'FE37218E-259F-47F2-909D-9AECBE5385DB', 'FieldCategoryIcons', '{"SQL Definition":"fa fa-code","Query Context":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'FE37218E-259F-47F2-909D-9AECBE5385DB'
      

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: Queries.ID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '874317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Name 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '884317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CategoryID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Category 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Category Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '774E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.UserQuestion 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B45717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Description 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '894317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.SQL 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '8B4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.SQLDialectID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'SQL Dialect',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '250EDAD5-57FF-4CEB-A2A3-3C932C120FA9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.SQLDialect 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'SQL Dialect Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F42F7B6-12EC-4F34-8A1C-981879499727' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.TechnicalDescription 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B55717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.OriginalSQL 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '8C4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.UsesTemplate 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F2BFC6F-5E7F-4DE7-9A35-66FD6E8731AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Feedback 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '724E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.Status 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '734E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.QualityRank 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '744E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.ExecutionCostRank 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B65717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.AuditQueryRuns 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CA275F3-757F-4D4D-8EE3-2443393CD676' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheEnabled 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F075DB33-92E3-45D9-86BB-08711205829D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheTTLMinutes 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Cache TTL (Minutes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0420AC10-6902-484B-B976-1C51573EDF4C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheMaxSize 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89288495-3472-436F-860D-AEE7F746CFF9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.CacheValidationSQL 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '2DF7C600-B13B-4E58-9DCD-173C82F13770' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingVector 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'CDBF7167-76D6-41DE-A50D-01CBFFEDC1E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00136468-3433-4B6C-BCEF-649E76497AFC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B241317-2875-4E3C-B80E-952C7270A308' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '274D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Queries.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].EntityField
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '284D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

