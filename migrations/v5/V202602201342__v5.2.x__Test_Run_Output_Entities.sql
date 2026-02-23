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
    ('e946773a-09ac-445e-8ab9-075be4f397d8', 'Screenshot', 'Image capture at a point in time'),
    ('b11b2c55-6f8e-42d2-a876-beba05c768be', 'Log', 'Text log output'),
    ('e8ac7fb0-e7f9-4fc6-9791-2a623dc85d2c', 'Data', 'Structured JSON data'),
    ('37fb1881-356d-4fd3-8689-f8fb5f3cab18', 'HTML', 'HTML content'),
    ('1c25ceef-bea1-4484-bf80-b5a3d25a8381', 'Video', 'Video recording'),
    ('023be4c1-abbb-4de1-b017-5acbfdcf7cba', 'Audio', 'Audio recording'),
    ('c223778a-eb3f-41c8-8fa3-4faf2262b189', 'File', 'Generic file output');
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
         'c8f50a7b-d4d2-4ac0-be92-8b7f6483ee94',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c8f50a7b-d4d2-4ac0-be92-8b7f6483ee94', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c8f50a7b-d4d2-4ac0-be92-8b7f6483ee94', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c8f50a7b-d4d2-4ac0-be92-8b7f6483ee94', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Test Run Output Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c8f50a7b-d4d2-4ac0-be92-8b7f6483ee94', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '9081fd46-1eaf-487a-9f6c-af6679d65cd8',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9081fd46-1eaf-487a-9f6c-af6679d65cd8', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9081fd46-1eaf-487a-9f6c-af6679d65cd8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9081fd46-1eaf-487a-9f6c-af6679d65cd8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Test Run Outputs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9081fd46-1eaf-487a-9f6c-af6679d65cd8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         WHERE ID = 'ea56125c-5f4c-4b58-9932-f97985cf7552'  OR 
               (EntityID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94' AND Name = 'ID')
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
            'ea56125c-5f4c-4b58-9932-f97985cf7552',
            'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', -- Entity: MJ: Test Run Output Types
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
         WHERE ID = '1c9b6404-1dad-451f-bc19-8f42d7f02dfa'  OR 
               (EntityID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94' AND Name = 'Name')
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
            '1c9b6404-1dad-451f-bc19-8f42d7f02dfa',
            'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', -- Entity: MJ: Test Run Output Types
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
         WHERE ID = '13321ae0-3aa2-4705-8361-47bc679e3784'  OR 
               (EntityID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94' AND Name = 'Description')
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
            '13321ae0-3aa2-4705-8361-47bc679e3784',
            'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', -- Entity: MJ: Test Run Output Types
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
         WHERE ID = 'a7c31957-eb83-4ae2-a3ba-15c96867d976'  OR 
               (EntityID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94' AND Name = '__mj_CreatedAt')
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
            'a7c31957-eb83-4ae2-a3ba-15c96867d976',
            'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', -- Entity: MJ: Test Run Output Types
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
         WHERE ID = 'b13abbc2-3597-430b-b273-10253f6dbf7f'  OR 
               (EntityID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94' AND Name = '__mj_UpdatedAt')
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
            'b13abbc2-3597-430b-b273-10253f6dbf7f',
            'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', -- Entity: MJ: Test Run Output Types
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
         WHERE ID = 'dc362872-24fa-48c4-a74b-c236b6b76aa0'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'ID')
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
            'dc362872-24fa-48c4-a74b-c236b6b76aa0',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '1eef9657-70fd-44d5-a9b9-8328022830d4'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'TestRunID')
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
            '1eef9657-70fd-44d5-a9b9-8328022830d4',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '3ac5720d-4327-432f-9fe7-1486ebb84109'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'OutputTypeID')
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
            '3ac5720d-4327-432f-9fe7-1486ebb84109',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
            'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94',
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
         WHERE ID = '88854ac8-e11e-409c-a912-5d506afb8d3b'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'Sequence')
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
            '88854ac8-e11e-409c-a912-5d506afb8d3b',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = 'f035c9bd-42c4-44e1-9319-15ee41ead694'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'StepNumber')
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
            'f035c9bd-42c4-44e1-9319-15ee41ead694',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = 'cc5dd3f1-8b25-41f0-93c3-2db1f70fac88'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'Name')
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
            'cc5dd3f1-8b25-41f0-93c3-2db1f70fac88',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '997d9cbb-c916-412d-b7d2-5b5aa3bae4ed'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'Description')
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
            '997d9cbb-c916-412d-b7d2-5b5aa3bae4ed',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = 'f768a543-7d98-44b1-bfcc-d32f6527a5c5'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'MimeType')
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
            'f768a543-7d98-44b1-bfcc-d32f6527a5c5',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '36773038-33ae-42df-90e6-05b83408ee7e'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'InlineData')
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
            '36773038-33ae-42df-90e6-05b83408ee7e',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = 'c0d41598-0d88-49ce-8642-da14ccade2ce'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'FileSizeBytes')
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
            'c0d41598-0d88-49ce-8642-da14ccade2ce',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '58610d24-9956-41e5-a219-48f5b6c78dbd'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'Width')
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
            '58610d24-9956-41e5-a219-48f5b6c78dbd',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '5f6c5868-6389-4da6-9a8d-406db03f7cdf'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'Height')
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
            '5f6c5868-6389-4da6-9a8d-406db03f7cdf',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '5ba531df-3d07-433b-bcf9-f652f43c02e5'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'DurationSeconds')
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
            '5ba531df-3d07-433b-bcf9-f652f43c02e5',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = 'da0a3956-e102-4b17-8c67-fed887e7365e'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'Metadata')
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
            'da0a3956-e102-4b17-8c67-fed887e7365e',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '0ce148dd-906f-45a2-9185-aecbad1ba6ac'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = '__mj_CreatedAt')
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
            '0ce148dd-906f-45a2-9185-aecbad1ba6ac',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '8acc344e-6134-432e-8629-a2e738fa7eeb'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = '__mj_UpdatedAt')
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
            '8acc344e-6134-432e-8629-a2e738fa7eeb',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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


/* Create Entity Relationship: MJ: Test Runs -> MJ: Test Run Outputs (One To Many via TestRunID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1e163a6d-ffeb-4770-b276-f302d7267463'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1e163a6d-ffeb-4770-b276-f302d7267463', '5DFD821D-E23E-43D3-8A41-60A7D36AE1BA', '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', 'TestRunID', 'One To Many', 1, 1, 'MJ: Test Run Outputs', 1);
   END
                              


/* Create Entity Relationship: MJ: Test Run Output Types -> MJ: Test Run Outputs (One To Many via OutputTypeID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '82cbbc83-623f-4061-978f-de3e315be710'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('82cbbc83-623f-4061-978f-de3e315be710', 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', 'OutputTypeID', 'One To Many', 1, 1, 'MJ: Test Run Outputs', 2);
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

/* SQL text to update entity field related entity name field map for entity field ID 1EEF9657-70FD-44D5-A9B9-8328022830D4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1EEF9657-70FD-44D5-A9B9-8328022830D4',
         @RelatedEntityNameFieldMap='TestRun'

/* SQL text to update entity field related entity name field map for entity field ID 3AC5720D-4327-432F-9FE7-1486EBB84109 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3AC5720D-4327-432F-9FE7-1486EBB84109',
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
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJTestRunOutputType_OutputTypeID.[Name] AS [OutputType]
FROM
    [${flyway:defaultSchema}].[TestRunOutput] AS t
INNER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [t].[TestRunID] = MJTestRun_TestRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[TestRunOutputType] AS MJTestRunOutputType_OutputTypeID
  ON
    [t].[OutputTypeID] = MJTestRunOutputType_OutputTypeID.[ID]
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
         WHERE ID = '4825e62e-7b04-42e8-b62e-c986d1881a89'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'TestRun')
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
            '4825e62e-7b04-42e8-b62e-c986d1881a89',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
         WHERE ID = '6dc40152-a5d9-446f-8263-2ef3abee58a2'  OR 
               (EntityID = '9081FD46-1EAF-487A-9F6C-AF6679D65CD8' AND Name = 'OutputType')
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
            '6dc40152-a5d9-446f-8263-2ef3abee58a2',
            '9081FD46-1EAF-487A-9F6C-AF6679D65CD8', -- Entity: MJ: Test Run Outputs
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
            WHERE ID = '1C9B6404-1DAD-451F-BC19-8F42D7F02DFA'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1C9B6404-1DAD-451F-BC19-8F42D7F02DFA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '13321AE0-3AA2-4705-8361-47BC679E3784'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C9B6404-1DAD-451F-BC19-8F42D7F02DFA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 5 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA56125C-5F4C-4B58-9932-F97985CF7552'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C9B6404-1DAD-451F-BC19-8F42D7F02DFA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Output Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13321AE0-3AA2-4705-8361-47BC679E3784'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A7C31957-EB83-4AE2-A3BA-15C96867D976'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B13ABBC2-3597-430B-B273-10253F6DBF7F'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-file-alt */

               UPDATE [${flyway:defaultSchema}].Entity
               SET Icon = 'fa fa-file-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94'
            

/* Insert FieldCategoryInfo setting for entity */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('2d134f3a-622c-47ac-8013-88f32990c54e', 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', 'FieldCategoryInfo', '{"Output Type Details":{"icon":"fa fa-tag","description":"Basic identification and descriptive information for the test run output category"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
         

/* Insert FieldCategoryIcons setting (legacy) */

            INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
            VALUES ('a3003744-94b2-4144-b385-8b5e632c7a19', 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94', 'FieldCategoryIcons', '{"Output Type Details":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
         

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].ApplicationEntity
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C8F50A7B-D4D2-4AC0-BE92-8B7F6483EE94'
      

