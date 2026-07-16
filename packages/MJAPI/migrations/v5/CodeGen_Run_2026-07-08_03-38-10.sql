/* SQL generated to create new entity MJ: RSU Audit Logs */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ea77713f-a214-4011-8412-b629697b7f51',
         'MJ: RSU Audit Logs',
         'RSU Audit Logs',
         NULL,
         NULL,
         'RSUAuditLog',
         'vwRSUAuditLogs',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: RSU Audit Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ea77713f-a214-4011-8412-b629697b7f51', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ea77713f-a214-4011-8412-b629697b7f51', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ea77713f-a214-4011-8412-b629697b7f51', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ea77713f-a214-4011-8412-b629697b7f51', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
UPDATE [${flyway:defaultSchema}].[RSUAuditLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD CONSTRAINT [DF___mj_RSUAuditLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
UPDATE [${flyway:defaultSchema}].[RSUAuditLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD CONSTRAINT [DF___mj_RSUAuditLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6bf1c769-a7e1-49b7-98b3-22d208eafbe1' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6bf1c769-a7e1-49b7-98b3-22d208eafbe1',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            NULL,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7c9ba71-ea1a-4b08-b813-09566f13c32c' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7c9ba71-ea1a-4b08-b813-09566f13c32c',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100002,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f997c7c9-84bf-431e-bc85-10f2af90a176' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'AffectedTables')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f997c7c9-84bf-431e-bc85-10f2af90a176',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100003,
            'AffectedTables',
            'Affected Tables',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f78921c4-f35d-45d7-bbf3-e8001273772a' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'Success')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f78921c4-f35d-45d7-bbf3-e8001273772a',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100004,
            'Success',
            'Success',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '564197fc-090e-479b-94e1-14065b60dd9e' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'APIRestarted')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '564197fc-090e-479b-94e1-14065b60dd9e',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100005,
            'APIRestarted',
            'API Restarted',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45a68425-b279-421d-8cbc-a6eb9a71123b' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'GitCommitSuccess')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '45a68425-b279-421d-8cbc-a6eb9a71123b',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100006,
            'GitCommitSuccess',
            'Git Commit Success',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '727b2224-5399-4f96-8341-fad6b5384bcc' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'BranchName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '727b2224-5399-4f96-8341-fad6b5384bcc',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100007,
            'BranchName',
            'Branch Name',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a56bb5a-c087-4f4d-a3cd-535b88a276ce' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'MigrationFilePath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a56bb5a-c087-4f4d-a3cd-535b88a276ce',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100008,
            'MigrationFilePath',
            'Migration File Path',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd16df5c4-8441-4457-93f1-87438059327c' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd16df5c4-8441-4457-93f1-87438059327c',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100009,
            'ErrorMessage',
            'Error Message',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2097605d-3e44-410d-b459-a62386962047' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'ErrorStep')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2097605d-3e44-410d-b459-a62386962047',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100010,
            'ErrorStep',
            'Error Step',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '389d8f46-8fac-4539-8caa-e6a4960f9548' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'StepsJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '389d8f46-8fac-4539-8caa-e6a4960f9548',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100011,
            'StepsJSON',
            'Steps JSON',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4decbad6-958c-4cb1-a754-5cb2c2037c9d' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'TotalDurationMs')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4decbad6-958c-4cb1-a754-5cb2c2037c9d',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100012,
            'TotalDurationMs',
            'Total Duration Ms',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6678fc04-018c-4e9a-968f-c5c672be122e' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = 'RunAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6678fc04-018c-4e9a-968f-c5c672be122e',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100013,
            'RunAt',
            'Run At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b86b054-3739-4fc7-b2dd-08bd8a8b2863' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b86b054-3739-4fc7-b2dd-08bd8a8b2863',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100014,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26098736-1427-46af-8216-bcb1bd01db3f' OR (EntityID = 'EA77713F-A214-4011-8412-B629697B7F51' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26098736-1427-46af-8216-bcb1bd01db3f',
            'EA77713F-A214-4011-8412-B629697B7F51', -- Entity: MJ: RSU Audit Logs
            100015,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'custId';

/* Index for Foreign Keys for CompanyAdmin */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CompanyAdmin
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyAdmin_custId' 
    AND object_id = OBJECT_ID('[acgi].[CompanyAdmin]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyAdmin_custId ON [acgi].[CompanyAdmin] ([custId]);

/* Index for Foreign Keys for Customer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Employee */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Employee
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Employee_custId' 
    AND object_id = OBJECT_ID('[acgi].[Employee]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Employee_custId ON [acgi].[Employee] ([custId]);

/* Base View SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: vwCompanyAdmins
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Company Admins
-----               SCHEMA:      acgi
-----               BASE TABLE:  CompanyAdmin
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCompanyAdmins]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCompanyAdmins];
GO

CREATE VIEW [acgi].[vwCompanyAdmins]
AS
SELECT
    c.*
FROM
    [acgi].[CompanyAdmin] AS c
GO
GRANT SELECT ON [acgi].[vwCompanyAdmins] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: Permissions for vwCompanyAdmins
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCompanyAdmins] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spCreateCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spCreateCompanyAdmin]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @displayNm_Clear bit = 0,
    @displayNm nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CompanyAdmin]
        (
            [custId],
                [displayNm],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [id]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @displayNm_Clear = 1 THEN NULL ELSE ISNULL(@displayNm, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCompanyAdmins] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [acgi].[spCreateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spCreateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spUpdateCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spUpdateCompanyAdmin]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @displayNm_Clear bit = 0,
    @displayNm nvarchar(255) = NULL,
    @id nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CompanyAdmin]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [displayNm] = CASE WHEN @displayNm_Clear = 1 THEN NULL ELSE ISNULL(@displayNm, [displayNm]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCompanyAdmins] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCompanyAdmins]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCompanyAdmin] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyAdmin table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCompanyAdmin]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCompanyAdmin];
GO
CREATE TRIGGER [acgi].trgUpdateCompanyAdmin
ON [acgi].[CompanyAdmin]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CompanyAdmin]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CompanyAdmin] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spUpdateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customers
-----               SCHEMA:      acgi
-----               BASE TABLE:  Customer
-----               PRIMARY KEY: custId
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomers]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomers];
GO

CREATE VIEW [acgi].[vwCustomers]
AS
SELECT
    c.*
FROM
    [acgi].[Customer] AS c
GO
GRANT SELECT ON [acgi].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Permissions for vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spCreateCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomer];
GO

CREATE PROCEDURE [acgi].[spCreateCustomer]
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @custId nvarchar(255) = NULL,
    @suffixName_Clear bit = 0,
    @suffixName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefixName_Clear bit = 0,
    @prefixName nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @custType_Clear bit = 0,
    @custType nvarchar(255) = NULL,
    @informalName_Clear bit = 0,
    @informalName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @toBePurged_Clear bit = 0,
    @toBePurged nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @degreeName_Clear bit = 0,
    @degreeName nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Customer]
        (
            [displayName],
                [suffixName],
                [middleName],
                [prefixName],
                [loginId],
                [createDate],
                [lastName],
                [custType],
                [informalName],
                [firstName],
                [toBePurged],
                [lockCode],
                [degreeName],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [custId]
        )
    VALUES
        (
            CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, NULL) END,
                CASE WHEN @suffixName_Clear = 1 THEN NULL ELSE ISNULL(@suffixName, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @prefixName_Clear = 1 THEN NULL ELSE ISNULL(@prefixName, NULL) END,
                CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, NULL) END,
                CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @custType_Clear = 1 THEN NULL ELSE ISNULL(@custType, NULL) END,
                CASE WHEN @informalName_Clear = 1 THEN NULL ELSE ISNULL(@informalName, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @toBePurged_Clear = 1 THEN NULL ELSE ISNULL(@toBePurged, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @degreeName_Clear = 1 THEN NULL ELSE ISNULL(@degreeName, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @custId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomers] WHERE [custId] = @custId
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customers */

GRANT EXECUTE ON [acgi].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spUpdateCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomer];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomer]
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @custId nvarchar(255),
    @suffixName_Clear bit = 0,
    @suffixName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefixName_Clear bit = 0,
    @prefixName nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @custType_Clear bit = 0,
    @custType nvarchar(255) = NULL,
    @informalName_Clear bit = 0,
    @informalName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @toBePurged_Clear bit = 0,
    @toBePurged nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @degreeName_Clear bit = 0,
    @degreeName nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Customer]
    SET
        [displayName] = CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, [displayName]) END,
        [suffixName] = CASE WHEN @suffixName_Clear = 1 THEN NULL ELSE ISNULL(@suffixName, [suffixName]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [prefixName] = CASE WHEN @prefixName_Clear = 1 THEN NULL ELSE ISNULL(@prefixName, [prefixName]) END,
        [loginId] = CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, [loginId]) END,
        [createDate] = CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, [createDate]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [custType] = CASE WHEN @custType_Clear = 1 THEN NULL ELSE ISNULL(@custType, [custType]) END,
        [informalName] = CASE WHEN @informalName_Clear = 1 THEN NULL ELSE ISNULL(@informalName, [informalName]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [toBePurged] = CASE WHEN @toBePurged_Clear = 1 THEN NULL ELSE ISNULL(@toBePurged, [toBePurged]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [degreeName] = CASE WHEN @degreeName_Clear = 1 THEN NULL ELSE ISNULL(@degreeName, [degreeName]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [custId] = @custId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomers]
                                    WHERE
                                        [custId] = @custId
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Customer table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomer]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomer];
GO
CREATE TRIGGER [acgi].trgUpdateCustomer
ON [acgi].[Customer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Customer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Customer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[custId] = I.[custId];
END;
GO

/* spUpdate Permissions for Customers */

GRANT EXECUTE ON [acgi].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: vwEmployees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Employees
-----               SCHEMA:      acgi
-----               BASE TABLE:  Employee
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwEmployees]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwEmployees];
GO

CREATE VIEW [acgi].[vwEmployees]
AS
SELECT
    e.*
FROM
    [acgi].[Employee] AS e
GO
GRANT SELECT ON [acgi].[vwEmployees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: Permissions for vwEmployees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwEmployees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spCreateEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateEmployee];
GO

CREATE PROCEDURE [acgi].[spCreateEmployee]
    @employeeAttributes_Clear bit = 0,
    @employeeAttributes nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @administrator_Clear bit = 0,
    @administrator nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Employee]
        (
            [employeeAttributes],
                [functionDescr],
                [lastName],
                [titleCodeDescr],
                [custId],
                [firstName],
                [titleCode],
                [lockCode],
                [displayName],
                [administrator],
                [functionCode],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [id]
        )
    VALUES
        (
            CASE WHEN @employeeAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employeeAttributes, NULL) END,
                CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, NULL) END,
                CASE WHEN @administrator_Clear = 1 THEN NULL ELSE ISNULL(@administrator, NULL) END,
                CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwEmployees] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [acgi].[spCreateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Employees */

GRANT EXECUTE ON [acgi].[spCreateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spUpdateEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateEmployee];
GO

CREATE PROCEDURE [acgi].[spUpdateEmployee]
    @employeeAttributes_Clear bit = 0,
    @employeeAttributes nvarchar(255) = NULL,
    @id nvarchar(255),
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @administrator_Clear bit = 0,
    @administrator nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Employee]
    SET
        [employeeAttributes] = CASE WHEN @employeeAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employeeAttributes, [employeeAttributes]) END,
        [functionDescr] = CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, [functionDescr]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [titleCodeDescr] = CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, [titleCodeDescr]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [titleCode] = CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, [titleCode]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [displayName] = CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, [displayName]) END,
        [administrator] = CASE WHEN @administrator_Clear = 1 THEN NULL ELSE ISNULL(@administrator, [administrator]) END,
        [functionCode] = CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, [functionCode]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwEmployees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwEmployees]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateEmployee] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Employee table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateEmployee]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateEmployee];
GO
CREATE TRIGGER [acgi].trgUpdateEmployee
ON [acgi].[Employee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Employee]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Employee] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Employees */

GRANT EXECUTE ON [acgi].[spUpdateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spDeleteCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spDeleteCompanyAdmin]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CompanyAdmin]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spDeleteCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spDeleteCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomer];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomer]
    @custId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Customer]
    WHERE
        [custId] = @custId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [custId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @custId AS [custId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customers */

GRANT EXECUTE ON [acgi].[spDeleteCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spDeleteEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteEmployee];
GO

CREATE PROCEDURE [acgi].[spDeleteEmployee]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Employee]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteEmployee] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Employees */

GRANT EXECUTE ON [acgi].[spDeleteEmployee] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for RSUAuditLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: vwRSUAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: RSU Audit Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RSUAuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRSUAuditLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRSUAuditLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRSUAuditLogs]
AS
SELECT
    r.*
FROM
    [${flyway:defaultSchema}].[RSUAuditLog] AS r
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRSUAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: Permissions for vwRSUAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRSUAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: spCreateRSUAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RSUAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRSUAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRSUAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRSUAuditLog]
    @Description nvarchar(500),
    @AffectedTables_Clear bit = 0,
    @AffectedTables nvarchar(MAX) = NULL,
    @Success bit,
    @APIRestarted bit = NULL,
    @GitCommitSuccess bit = NULL,
    @BranchName_Clear bit = 0,
    @BranchName nvarchar(200) = NULL,
    @MigrationFilePath_Clear bit = 0,
    @MigrationFilePath nvarchar(500) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ErrorStep_Clear bit = 0,
    @ErrorStep nvarchar(100) = NULL,
    @StepsJSON_Clear bit = 0,
    @StepsJSON nvarchar(MAX) = NULL,
    @TotalDurationMs_Clear bit = 0,
    @TotalDurationMs int = NULL,
    @RunAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [${flyway:defaultSchema}].[RSUAuditLog]
        (
            [Description],
                [AffectedTables],
                [Success],
                [APIRestarted],
                [GitCommitSuccess],
                [BranchName],
                [MigrationFilePath],
                [ErrorMessage],
                [ErrorStep],
                [StepsJSON],
                [TotalDurationMs],
                [RunAt]
        )
    VALUES
        (
            @Description,
                CASE WHEN @AffectedTables_Clear = 1 THEN NULL ELSE ISNULL(@AffectedTables, NULL) END,
                @Success,
                ISNULL(@APIRestarted, 0),
                ISNULL(@GitCommitSuccess, 0),
                CASE WHEN @BranchName_Clear = 1 THEN NULL ELSE ISNULL(@BranchName, NULL) END,
                CASE WHEN @MigrationFilePath_Clear = 1 THEN NULL ELSE ISNULL(@MigrationFilePath, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ErrorStep_Clear = 1 THEN NULL ELSE ISNULL(@ErrorStep, NULL) END,
                CASE WHEN @StepsJSON_Clear = 1 THEN NULL ELSE ISNULL(@StepsJSON, NULL) END,
                CASE WHEN @TotalDurationMs_Clear = 1 THEN NULL ELSE ISNULL(@TotalDurationMs, NULL) END,
                ISNULL(@RunAt, getutcdate())
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRSUAuditLogs] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: RSU Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: spUpdateRSUAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RSUAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRSUAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRSUAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRSUAuditLog]
    @ID int,
    @Description nvarchar(500) = NULL,
    @AffectedTables_Clear bit = 0,
    @AffectedTables nvarchar(MAX) = NULL,
    @Success bit = NULL,
    @APIRestarted bit = NULL,
    @GitCommitSuccess bit = NULL,
    @BranchName_Clear bit = 0,
    @BranchName nvarchar(200) = NULL,
    @MigrationFilePath_Clear bit = 0,
    @MigrationFilePath nvarchar(500) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ErrorStep_Clear bit = 0,
    @ErrorStep nvarchar(100) = NULL,
    @StepsJSON_Clear bit = 0,
    @StepsJSON nvarchar(MAX) = NULL,
    @TotalDurationMs_Clear bit = 0,
    @TotalDurationMs int = NULL,
    @RunAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RSUAuditLog]
    SET
        [Description] = ISNULL(@Description, [Description]),
        [AffectedTables] = CASE WHEN @AffectedTables_Clear = 1 THEN NULL ELSE ISNULL(@AffectedTables, [AffectedTables]) END,
        [Success] = ISNULL(@Success, [Success]),
        [APIRestarted] = ISNULL(@APIRestarted, [APIRestarted]),
        [GitCommitSuccess] = ISNULL(@GitCommitSuccess, [GitCommitSuccess]),
        [BranchName] = CASE WHEN @BranchName_Clear = 1 THEN NULL ELSE ISNULL(@BranchName, [BranchName]) END,
        [MigrationFilePath] = CASE WHEN @MigrationFilePath_Clear = 1 THEN NULL ELSE ISNULL(@MigrationFilePath, [MigrationFilePath]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ErrorStep] = CASE WHEN @ErrorStep_Clear = 1 THEN NULL ELSE ISNULL(@ErrorStep, [ErrorStep]) END,
        [StepsJSON] = CASE WHEN @StepsJSON_Clear = 1 THEN NULL ELSE ISNULL(@StepsJSON, [StepsJSON]) END,
        [TotalDurationMs] = CASE WHEN @TotalDurationMs_Clear = 1 THEN NULL ELSE ISNULL(@TotalDurationMs, [TotalDurationMs]) END,
        [RunAt] = ISNULL(@RunAt, [RunAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRSUAuditLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRSUAuditLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRSUAuditLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RSUAuditLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRSUAuditLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRSUAuditLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRSUAuditLog
ON [${flyway:defaultSchema}].[RSUAuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RSUAuditLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RSUAuditLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: RSU Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: spDeleteRSUAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RSUAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRSUAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRSUAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRSUAuditLog]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RSUAuditLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: RSU Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'custId';

