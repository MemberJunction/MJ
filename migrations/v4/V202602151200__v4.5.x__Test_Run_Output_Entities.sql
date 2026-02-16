/**************************************************************************************************
 * Migration: Test Run Output Entities
 *
 * Purpose: Create two new generic entities for storing structured, sequenced outputs from test runs.
 * Any test type can use these for output storage (screenshots, logs, data, video, audio, etc.).
 *
 * Entities created:
 *   1. MJ: Test Run Output Types - Lookup table for output categories
 *   2. MJ: Test Run Outputs - Individual output artifacts from test runs
 *
 * Version: 4.4.x
 **************************************************************************************************/

-- ============================================================================
-- 1. TestRunOutputType (MJ: Test Run Output Types)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[TestRunOutputType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_TestRunOutputType] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_TestRunOutputType_Name] UNIQUE ([Name])
);
GO

-- Extended properties for TestRunOutputType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique name identifying this output type (e.g., Screenshot, Log, Data, Video)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutputType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Description of what this output type represents and when it is used', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutputType', @level2type=N'COLUMN', @level2name=N'Description';
GO

-- ============================================================================
-- 2. TestRunOutput (MJ: Test Run Outputs)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[TestRunOutput] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TestRunID] UNIQUEIDENTIFIER NOT NULL,
    [OutputTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    [StepNumber] INT NULL,
    [Name] NVARCHAR(255) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MimeType] NVARCHAR(100) NULL,
    [InlineData] NVARCHAR(MAX) NULL,
    [FileSizeBytes] INT NULL,
    [Width] INT NULL,
    [Height] INT NULL,
    [DurationSeconds] DECIMAL(10, 3) NULL,
    [Metadata] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_TestRunOutput] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_TestRunOutput_TestRun] FOREIGN KEY ([TestRunID])
        REFERENCES ${flyway:defaultSchema}.[TestRun]([ID]),
    CONSTRAINT [FK_TestRunOutput_OutputType] FOREIGN KEY ([OutputTypeID])
        REFERENCES ${flyway:defaultSchema}.[TestRunOutputType]([ID])
);
GO

-- Extended properties for TestRunOutput
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the parent test run that produced this output', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'TestRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the output type category (Screenshot, Log, Video, etc.)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'OutputTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Chronological ordering for storyboarding outputs across steps', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which step produced this output, for step-based tests like Computer Use', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'StepNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable label for this output (e.g., Step 3 Screenshot)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Additional context about this output', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MIME type of the output data (e.g., image/png, text/plain, application/json, video/mp4)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'MimeType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'InlineData';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Size of the output data in bytes', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'FileSizeBytes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Width in pixels for image or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Width';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Height in pixels for image or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Height';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Duration in seconds for audio or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'DurationSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object with additional metadata about this output (e.g., URL at time of capture, tool calls, error info)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Metadata';
GO

-- ============================================================================
-- 3. Seed TestRunOutputType rows
-- ============================================================================
INSERT INTO ${flyway:defaultSchema}.[TestRunOutputType] ([ID], [Name], [Description])
VALUES
    ('A1B2C3D4-E5F6-7890-ABCD-100000000001', 'Screenshot', 'Image capture at a point in time'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000002', 'Log', 'Text log output'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000003', 'Data', 'Structured JSON data'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000004', 'HTML', 'HTML content'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000005', 'Video', 'Video recording'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000006', 'Audio', 'Audio recording'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000007', 'File', 'Generic file output');
GO



































































































/* SQL generated to create new entity MJ: Test Run Output Types */

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
         'ae5c6f92-eb99-4233-bd17-1fe38d49ed8e',
         'MJ: Test Run Output Types',
         'Test Run Output Types',
         NULL,
         NULL,
         'TestRunOutputType',
         'vwTestRunOutputTypes',
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
   

/* SQL generated to add new entity MJ: Test Run Output Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ae5c6f92-eb99-4233-bd17-1fe38d49ed8e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae5c6f92-eb99-4233-bd17-1fe38d49ed8e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae5c6f92-eb99-4233-bd17-1fe38d49ed8e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae5c6f92-eb99-4233-bd17-1fe38d49ed8e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Test Run Outputs */

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
         '241408a5-bfc5-46fc-b8b1-ed7dd26647c1',
         'MJ: Test Run Outputs',
         'Test Run Outputs',
         NULL,
         NULL,
         'TestRunOutput',
         'vwTestRunOutputs',
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
   

/* SQL generated to add new entity MJ: Test Run Outputs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '241408a5-bfc5-46fc-b8b1-ed7dd26647c1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('241408a5-bfc5-46fc-b8b1-ed7dd26647c1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('241408a5-bfc5-46fc-b8b1-ed7dd26647c1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('241408a5-bfc5-46fc-b8b1-ed7dd26647c1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TestRunOutputType */
ALTER TABLE [${flyway:defaultSchema}].[TestRunOutputType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TestRunOutputType */
ALTER TABLE [${flyway:defaultSchema}].[TestRunOutputType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TestRunOutput */
ALTER TABLE [${flyway:defaultSchema}].[TestRunOutput] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TestRunOutput */
ALTER TABLE [${flyway:defaultSchema}].[TestRunOutput] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '24c41b07-f946-4670-b673-02fe4b308bdb'  OR 
               (EntityID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E' AND Name = 'ID')
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
            '24c41b07-f946-4670-b673-02fe4b308bdb',
            'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', -- Entity: MJ: Test Run Output Types
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
         WHERE ID = 'ee97122b-b620-4653-9d15-af732229d8bb'  OR 
               (EntityID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E' AND Name = 'Name')
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
            'ee97122b-b620-4653-9d15-af732229d8bb',
            'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', -- Entity: MJ: Test Run Output Types
            100002,
            'Name',
            'Name',
            'Unique name identifying this output type (e.g., Screenshot, Log, Data, Video)',
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
         WHERE ID = '362b712f-7708-4eaf-ab7e-80e684964cbc'  OR 
               (EntityID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E' AND Name = 'Description')
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
            '362b712f-7708-4eaf-ab7e-80e684964cbc',
            'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', -- Entity: MJ: Test Run Output Types
            100003,
            'Description',
            'Description',
            'Description of what this output type represents and when it is used',
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
         WHERE ID = '51744570-c77e-4b09-95bb-4d17163cc4fa'  OR 
               (EntityID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E' AND Name = '__mj_CreatedAt')
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
            '51744570-c77e-4b09-95bb-4d17163cc4fa',
            'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', -- Entity: MJ: Test Run Output Types
            100004,
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
         WHERE ID = 'af6bfa32-cbd2-4306-b421-caa4e4e42bde'  OR 
               (EntityID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E' AND Name = '__mj_UpdatedAt')
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
            'af6bfa32-cbd2-4306-b421-caa4e4e42bde',
            'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', -- Entity: MJ: Test Run Output Types
            100005,
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
         WHERE ID = 'eabecd12-c9fc-4b27-9811-9a60d3855caa'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'ID')
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
            'eabecd12-c9fc-4b27-9811-9a60d3855caa',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '80b5ad99-4eba-4394-86ef-b136c913f1c8'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'TestRunID')
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
            '80b5ad99-4eba-4394-86ef-b136c913f1c8',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100002,
            'TestRunID',
            'Test Run ID',
            'Foreign key to the parent test run that produced this output',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA',
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
         WHERE ID = 'cf4e2b1b-6f53-4345-b54c-b643d1dd9e55'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'OutputTypeID')
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
            'cf4e2b1b-6f53-4345-b54c-b643d1dd9e55',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100003,
            'OutputTypeID',
            'Output Type ID',
            'Foreign key to the output type category (Screenshot, Log, Video, etc.)',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E',
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
         WHERE ID = 'c8f15fb7-0b72-469a-9977-1fc5d0a26348'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'Sequence')
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
            'c8f15fb7-0b72-469a-9977-1fc5d0a26348',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100004,
            'Sequence',
            'Sequence',
            'Chronological ordering for storyboarding outputs across steps',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
         WHERE ID = '878558cb-95ae-41d4-b1c8-0a2b62fd36ea'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'StepNumber')
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
            '878558cb-95ae-41d4-b1c8-0a2b62fd36ea',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100005,
            'StepNumber',
            'Step Number',
            'Which step produced this output, for step-based tests like Computer Use',
            'int',
            4,
            10,
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
         WHERE ID = 'f9186714-1fac-4570-833c-99434a1c64f3'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'Name')
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
            'f9186714-1fac-4570-833c-99434a1c64f3',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100006,
            'Name',
            'Name',
            'Human-readable label for this output (e.g., Step 3 Screenshot)',
            'nvarchar',
            510,
            0,
            0,
            1,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '12eef989-41e2-4dac-b8f8-076e3cd42b31'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'Description')
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
            '12eef989-41e2-4dac-b8f8-076e3cd42b31',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100007,
            'Description',
            'Description',
            'Additional context about this output',
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
         WHERE ID = 'abbda45e-68be-481b-8414-065d9bdf5628'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'MimeType')
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
            'abbda45e-68be-481b-8414-065d9bdf5628',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100008,
            'MimeType',
            'Mime Type',
            'MIME type of the output data (e.g., image/png, text/plain, application/json, video/mp4)',
            'nvarchar',
            200,
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
         WHERE ID = '3a13e75f-957f-4c7d-87b0-2ddb98fd050b'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'InlineData')
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
            '3a13e75f-957f-4c7d-87b0-2ddb98fd050b',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100009,
            'InlineData',
            'Inline Data',
            'Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)',
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
         WHERE ID = 'a01706e6-cd0b-4c41-b500-2d1a9e4377b5'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'FileSizeBytes')
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
            'a01706e6-cd0b-4c41-b500-2d1a9e4377b5',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100010,
            'FileSizeBytes',
            'File Size Bytes',
            'Size of the output data in bytes',
            'int',
            4,
            10,
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
         WHERE ID = '1243e5a3-75c5-4e6f-bc16-70262c3a8741'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'Width')
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
            '1243e5a3-75c5-4e6f-bc16-70262c3a8741',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100011,
            'Width',
            'Width',
            'Width in pixels for image or video outputs',
            'int',
            4,
            10,
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
         WHERE ID = '6df99ead-1c18-4a06-a5a2-9ae303222ed8'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'Height')
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
            '6df99ead-1c18-4a06-a5a2-9ae303222ed8',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100012,
            'Height',
            'Height',
            'Height in pixels for image or video outputs',
            'int',
            4,
            10,
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
         WHERE ID = 'c8fab0de-ceea-4d1c-831b-5c4c0291852a'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'DurationSeconds')
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
            'c8fab0de-ceea-4d1c-831b-5c4c0291852a',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100013,
            'DurationSeconds',
            'Duration Seconds',
            'Duration in seconds for audio or video outputs',
            'decimal',
            9,
            10,
            3,
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
         WHERE ID = '3d08a30a-897c-4531-b3c7-57ed1cb42849'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'Metadata')
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
            '3d08a30a-897c-4531-b3c7-57ed1cb42849',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100014,
            'Metadata',
            'Metadata',
            'JSON object with additional metadata about this output (e.g., URL at time of capture, tool calls, error info)',
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
         WHERE ID = '5c91d187-e565-4b8f-a28c-82c270dfee89'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = '__mj_CreatedAt')
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
            '5c91d187-e565-4b8f-a28c-82c270dfee89',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100015,
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
         WHERE ID = '9d519d5c-0083-4716-a39c-b5111fe7add4'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = '__mj_UpdatedAt')
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
            '9d519d5c-0083-4716-a39c-b5111fe7add4',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100016,
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4586dde4-e6d8-4b26-b596-f99f3aaf614a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4586dde4-e6d8-4b26-b596-f99f3aaf614a', 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', 'OutputTypeID', 'One To Many', 1, 1, 'MJ: Test Run Outputs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '75ef810e-fdf9-4cd4-8a6b-56abefbc9bf1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('75ef810e-fdf9-4cd4-8a6b-56abefbc9bf1', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', 'TestRunID', 'One To Many', 1, 1, 'MJ: Test Run Outputs', 2);
   END
                              

/* Index for Foreign Keys for TestRunOutputType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for TestRunOutput */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TestRunID in table TestRunOutput
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunOutput_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunOutput]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunOutput_TestRunID ON [${flyway:defaultSchema}].[TestRunOutput] ([TestRunID]);

-- Index for foreign key OutputTypeID in table TestRunOutput
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TestRunOutput_OutputTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TestRunOutput]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TestRunOutput_OutputTypeID ON [${flyway:defaultSchema}].[TestRunOutput] ([OutputTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 80B5AD99-4EBA-4394-86EF-B136C913F1C8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='80B5AD99-4EBA-4394-86EF-B136C913F1C8',
         @RelatedEntityNameFieldMap='TestRun'

/* Base View SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: vwTestRunOutputTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Run Output Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRunOutputType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRunOutputTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRunOutputTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRunOutputTypes]
AS
SELECT
    t.*
FROM
    [${flyway:defaultSchema}].[TestRunOutputType] AS t
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunOutputTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: Permissions for vwTestRunOutputTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunOutputTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spCreateTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRunOutputType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunOutputType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunOutputType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRunOutputType]
            (
                [ID],
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRunOutputType]
            (
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRunOutputTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunOutputType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Run Output Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunOutputType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spUpdateTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRunOutputType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunOutputType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunOutputType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunOutputType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRunOutputTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRunOutputTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunOutputType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunOutputType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRunOutputType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRunOutputType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRunOutputType
ON [${flyway:defaultSchema}].[TestRunOutputType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunOutputType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRunOutputType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Run Output Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunOutputType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spDeleteTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRunOutputType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunOutputType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunOutputType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRunOutputType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunOutputType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Run Output Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunOutputType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID CF4E2B1B-6F53-4345-B54C-B643D1DD9E55 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF4E2B1B-6F53-4345-B54C-B643D1DD9E55',
         @RelatedEntityNameFieldMap='OutputType'

/* Base View SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: vwTestRunOutputs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Run Outputs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestRunOutput
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestRunOutputs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestRunOutputs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestRunOutputs]
AS
SELECT
    t.*,
    TestRun_TestRunID.[Test] AS [TestRun],
    TestRunOutputType_OutputTypeID.[Name] AS [OutputType]
FROM
    [${flyway:defaultSchema}].[TestRunOutput] AS t
INNER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS TestRun_TestRunID
  ON
    [t].[TestRunID] = TestRun_TestRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[TestRunOutputType] AS TestRunOutputType_OutputTypeID
  ON
    [t].[OutputTypeID] = TestRunOutputType_OutputTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunOutputs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: Permissions for vwTestRunOutputs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestRunOutputs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spCreateTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunOutput
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRunOutput]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunOutput];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunOutput]
    @ID uniqueidentifier = NULL,
    @TestRunID uniqueidentifier,
    @OutputTypeID uniqueidentifier,
    @Sequence int = NULL,
    @StepNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @MimeType nvarchar(100),
    @InlineData nvarchar(MAX),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds decimal(10, 3),
    @Metadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRunOutput]
            (
                [ID],
                [TestRunID],
                [OutputTypeID],
                [Sequence],
                [StepNumber],
                [Name],
                [Description],
                [MimeType],
                [InlineData],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestRunID,
                @OutputTypeID,
                ISNULL(@Sequence, 0),
                @StepNumber,
                @Name,
                @Description,
                @MimeType,
                @InlineData,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @Metadata
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRunOutput]
            (
                [TestRunID],
                [OutputTypeID],
                [Sequence],
                [StepNumber],
                [Name],
                [Description],
                [MimeType],
                [InlineData],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestRunID,
                @OutputTypeID,
                ISNULL(@Sequence, 0),
                @StepNumber,
                @Name,
                @Description,
                @MimeType,
                @InlineData,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @Metadata
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestRunOutputs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunOutput] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Run Outputs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunOutput] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spUpdateTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunOutput
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRunOutput]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunOutput];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunOutput]
    @ID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @OutputTypeID uniqueidentifier,
    @Sequence int,
    @StepNumber int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @MimeType nvarchar(100),
    @InlineData nvarchar(MAX),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds decimal(10, 3),
    @Metadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunOutput]
    SET
        [TestRunID] = @TestRunID,
        [OutputTypeID] = @OutputTypeID,
        [Sequence] = @Sequence,
        [StepNumber] = @StepNumber,
        [Name] = @Name,
        [Description] = @Description,
        [MimeType] = @MimeType,
        [InlineData] = @InlineData,
        [FileSizeBytes] = @FileSizeBytes,
        [Width] = @Width,
        [Height] = @Height,
        [DurationSeconds] = @DurationSeconds,
        [Metadata] = @Metadata
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestRunOutputs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestRunOutputs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunOutput] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunOutput table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRunOutput]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRunOutput];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRunOutput
ON [${flyway:defaultSchema}].[TestRunOutput]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunOutput]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRunOutput] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Run Outputs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunOutput] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spDeleteTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunOutput
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestRunOutput]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunOutput];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestRunOutput]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestRunOutput]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunOutput] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Run Outputs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestRunOutput] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7e2bd4a5-902d-44ad-8b57-2d138ef5f197'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'TestRun')
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
            '7e2bd4a5-902d-44ad-8b57-2d138ef5f197',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100033,
            'TestRun',
            'Test Run',
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
         WHERE ID = '294f866d-2b7c-4cd2-9bb8-151428eeb8a0'  OR 
               (EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1' AND Name = 'OutputType')
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
            '294f866d-2b7c-4cd2-9bb8-151428eeb8a0',
            '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', -- Entity: MJ: Test Run Outputs
            100034,
            'OutputType',
            'Output Type',
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
            SET IsNameField = 1
            WHERE ID = 'F9186714-1FAC-4570-833C-99434A1C64F3'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C8F15FB7-0B72-469A-9977-1FC5D0A26348'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '878558CB-95AE-41D4-B1C8-0A2B62FD36EA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F9186714-1FAC-4570-833C-99434A1C64F3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '294F866D-2B7C-4CD2-9BB8-151428EEB8A0'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F9186714-1FAC-4570-833C-99434A1C64F3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '12EEF989-41E2-4DAC-B8F8-076E3CD42B31'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ABBDA45E-68BE-481B-8414-065D9BDF5628'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '294F866D-2B7C-4CD2-9BB8-151428EEB8A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'EE97122B-B620-4653-9D15-AF732229D8BB'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EE97122B-B620-4653-9D15-AF732229D8BB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '362B712F-7708-4EAF-AB7E-80E684964CBC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EE97122B-B620-4653-9D15-AF732229D8BB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 5 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24C41B07-F946-4670-B673-02FE4B308BDB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE97122B-B620-4653-9D15-AF732229D8BB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '362B712F-7708-4EAF-AB7E-80E684964CBC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '51744570-C77E-4B09-95BB-4D17163CC4FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF6BFA32-CBD2-4306-B421-CAA4E4E42BDE'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-tag', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E'
            

/* Insert FieldCategoryInfo setting for entity */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('2cdba9c0-396e-40dc-95f1-dd50f62dbf3a', 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', 'FieldCategoryInfo', '{"Output Type Details":{"icon":"fa fa-file-alt","description":"Core information describing each test run output type"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE())
         

/* Insert FieldCategoryIcons setting (legacy) */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('a6468864-cb38-4e1f-8159-0ab04f221b76', 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E', 'FieldCategoryIcons', '{"Output Type Details":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
         

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'AE5C6F92-EB99-4233-BD17-1FE38D49ED8E'
      

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EABECD12-C9FC-4B27-9811-9A60D3855CAA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80B5AD99-4EBA-4394-86EF-B136C913F1C8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Test Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E2BD4A5-902D-44AD-8B57-2D138EF5F197'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF4E2B1B-6F53-4345-B54C-B643D1DD9E55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Type (Label)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294F866D-2B7C-4CD2-9BB8-151428EEB8A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C8F15FB7-0B72-469A-9977-1FC5D0A26348'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Step Number',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '878558CB-95AE-41D4-B1C8-0A2B62FD36EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content & Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F9186714-1FAC-4570-833C-99434A1C64F3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content & Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12EEF989-41E2-4DAC-B8F8-076E3CD42B31'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content & Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'MIME Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ABBDA45E-68BE-481B-8414-065D9BDF5628'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content & Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A13E75F-957F-4C7D-87B0-2DDB98FD050B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content & Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Size (bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A01706E6-CD0B-4C41-B500-2D1A9E4377B5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Width (px)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1243E5A3-75C5-4E6F-BC16-70262C3A8741'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Height (px)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6DF99EAD-1C18-4A06-A5A2-9AE303222ED8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C8FAB0DE-CEEA-4D1C-831B-5C4C0291852A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Metadata',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3D08A30A-897C-4531-B3C7-57ED1CB42849'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C91D187-E565-4B8F-A28C-82C270DFEE89'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D519D5C-0083-4716-A39C-B5111FE7ADD4'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-photo-video */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-photo-video', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1'
            

/* Insert FieldCategoryInfo setting for entity */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('d7e46708-4873-41f2-a5f1-dae69fe314ef', '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Core identifiers, relationships, and ordering information for each test run output"},"Content & Data":{"icon":"fa fa-file-alt","description":"Descriptive labels and the actual payload data of the output"},"Media Metadata":{"icon":"fa fa-image","description":"Technical attributes such as dimensions, duration, and supplemental JSON metadata"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
         

/* Insert FieldCategoryIcons setting (legacy) */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('b47df547-17f5-447d-b987-f4ce998d10be', '241408A5-BFC5-46FC-B8B1-ED7DD26647C1', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Content & Data":"fa fa-file-alt","Media Metadata":"fa fa-image","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
         

/* Set DefaultForNewUser=1 for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '241408A5-BFC5-46FC-B8B1-ED7DD26647C1'
      

