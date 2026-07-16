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
         'be754a9c-a5be-4c75-ae4a-195abd7ea022',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'be754a9c-a5be-4c75-ae4a-195abd7ea022', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('be754a9c-a5be-4c75-ae4a-195abd7ea022', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('be754a9c-a5be-4c75-ae4a-195abd7ea022', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('be754a9c-a5be-4c75-ae4a-195abd7ea022', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd83d0ba3-3d28-4cd5-9c32-c43e22a389d3' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'ID')) BEGIN
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
            'd83d0ba3-3d28-4cd5-9c32-c43e22a389d3',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ede67598-b3d3-420b-a9c5-60ddb9c743d0' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'Description')) BEGIN
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
            'ede67598-b3d3-420b-a9c5-60ddb9c743d0',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d023231-6a02-44ac-978a-312327b352e6' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'AffectedTables')) BEGIN
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
            '5d023231-6a02-44ac-978a-312327b352e6',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f136fe7f-99b3-4735-ac7c-9cc65831e86b' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'Success')) BEGIN
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
            'f136fe7f-99b3-4735-ac7c-9cc65831e86b',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f22d6376-8319-40ba-b58a-0c420e8bc0b2' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'APIRestarted')) BEGIN
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
            'f22d6376-8319-40ba-b58a-0c420e8bc0b2',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b10b2a65-dba5-486a-9127-f61fd67bd308' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'GitCommitSuccess')) BEGIN
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
            'b10b2a65-dba5-486a-9127-f61fd67bd308',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91eb0335-d138-476d-b3b5-1188b082d36d' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'BranchName')) BEGIN
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
            '91eb0335-d138-476d-b3b5-1188b082d36d',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c790a70-a264-4c3d-bc42-3e36fe47f08c' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'MigrationFilePath')) BEGIN
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
            '6c790a70-a264-4c3d-bc42-3e36fe47f08c',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a49ada90-947d-4ceb-9535-36f544ef0a21' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'ErrorMessage')) BEGIN
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
            'a49ada90-947d-4ceb-9535-36f544ef0a21',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9a0e554-082d-4839-9543-fd05ccdd37f0' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'ErrorStep')) BEGIN
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
            'b9a0e554-082d-4839-9543-fd05ccdd37f0',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa3beba9-c88a-4d42-9d2b-a4b51c0480ce' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'StepsJSON')) BEGIN
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
            'fa3beba9-c88a-4d42-9d2b-a4b51c0480ce',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dcbd4753-d63e-4cb0-b6e9-bd9d7d0e5d32' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'TotalDurationMs')) BEGIN
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
            'dcbd4753-d63e-4cb0-b6e9-bd9d7d0e5d32',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccde273c-57d9-4df7-9ab4-bc46c2faac31' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = 'RunAt')) BEGIN
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
            'ccde273c-57d9-4df7-9ab4-bc46c2faac31',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70ffab7b-afd1-47b3-8ebb-9dca4cc9e0c3' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = '__mj_CreatedAt')) BEGIN
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
            '70ffab7b-afd1-47b3-8ebb-9dca4cc9e0c3',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ebe54d83-7cf0-4f7f-8d70-5965191c453a' OR (EntityID = 'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'ebe54d83-7cf0-4f7f-8d70-5965191c453a',
            'BE754A9C-A5BE-4C75-AE4A-195ABD7EA022', -- Entity: MJ: RSU Audit Logs
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

/* Set soft PK for wild_apricot.Contact.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C2936590-83E2-4920-A09B-8852F9711E69' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Account.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7AC39039-C3FE-4BBB-875A-0EA84FB7819D' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.AttachmentData.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5F920FD4-9BB3-4BFE-AAC1-C6C5A6FE7B69' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.AuditLogItem.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '15FB5C5F-A116-42D1-B4E4-506DBD9178BC' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Bundle.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4E80CAD9-0CB0-41DA-96B6-A35D2D21BE9E' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.CeuRecord.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'EAE7ADC9-6EAB-4983-AA5B-E03A348DF082' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.ContactFieldDescription.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C086A428-1036-49FE-8037-8399C37867B4' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EmailDraft.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4A241AFA-D78A-4DC2-A2DD-613521056070' AND [Name] = 'Id';

/* Set soft FK for wild_apricot.EmailDraft.EventId → Event.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'DEBADAC3-C53E-47E4-87AC-46C35F65A529',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4A241AFA-D78A-4DC2-A2DD-613521056070' AND [Name] = 'EventId';

/* Set soft PK for wild_apricot.EmailLog.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '35F6BB5E-326E-4E35-B7CF-F8335A42016D' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EntityFieldDescription.SystemCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BF3998DE-7023-4B64-99BC-E24185F885F5' AND [Name] = 'SystemCode';

/* Set soft PK for wild_apricot.Event.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DEBADAC3-C53E-47E4-87AC-46C35F65A529' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EventRegistration.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '65F45A4D-A9AF-47CF-A108-74F10B381024' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EventRegistrationType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F1600A6A-9689-486F-83DF-79B68E9961CE' AND [Name] = 'Id';

/* Set soft FK for wild_apricot.EventRegistrationType.EventId → Event.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'DEBADAC3-C53E-47E4-87AC-46C35F65A529',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F1600A6A-9689-486F-83DF-79B68E9961CE' AND [Name] = 'EventId';

/* Set soft PK for wild_apricot.Invoice.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '90A024FD-AB2A-4241-8820-8E92C4247079' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.MembershipGroup.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8B3F1F07-42BE-4ED7-A07D-2F599F21D237' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.MembershipLevel.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AECD8F1D-A5C8-4BED-AD31-AF5CCF9A72AB' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Order.number */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B6FCD45C-701E-4299-AC70-E7A43B356138' AND [Name] = 'number';

/* Set soft PK for wild_apricot.Payment.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9F0BECE1-90EE-489C-BDCB-7DD4D9673FDB' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.PaymentAllocation.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DE43207E-7479-4FFD-9C9D-2FDC40EC62EB' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Product.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A487E271-B7FB-4936-B7EE-87E8985D09C5' AND [Name] = 'id';

/* Set soft PK for wild_apricot.Refund.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '87A0ECB9-BBBC-433A-99B1-91596B3412A0' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.SavedSearch.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1B061CB9-5CE2-43ED-B5AC-5C55ECD29579' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Tender.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5062A9C1-0721-4834-84ED-B806BD58D761' AND [Name] = 'Id';

/* Index for Foreign Keys for Account */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for AttachmentData */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attachment Datas
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for AuditLogItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Bundle */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bundles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for CeuRecord */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Ceu Records
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: vwAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Accounts
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Account
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwAccounts]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwAccounts];
GO

CREATE VIEW [wild_apricot].[vwAccounts]
AS
SELECT
    a.*
FROM
    [wild_apricot].[Account] AS a
GO
GRANT SELECT ON [wild_apricot].[vwAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: Permissions for vwAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: spCreateAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Account
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateAccount];
GO

CREATE PROCEDURE [wild_apricot].[spCreateAccount]
    @SquareRegisterSettings_Clear bit = 0,
    @SquareRegisterSettings nvarchar(MAX) = NULL,
    @Resources_Clear bit = 0,
    @Resources nvarchar(MAX) = NULL,
    @Id nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @PrimaryDomainName_Clear bit = 0,
    @PrimaryDomainName nvarchar(255) = NULL,
    @Localization_Clear bit = 0,
    @Localization nvarchar(MAX) = NULL,
    @BillingPlan_Clear bit = 0,
    @BillingPlan nvarchar(MAX) = NULL,
    @ContactLimitInfo_Clear bit = 0,
    @ContactLimitInfo nvarchar(MAX) = NULL,
    @PaymentSettings_Clear bit = 0,
    @PaymentSettings nvarchar(MAX) = NULL,
    @Currency_Clear bit = 0,
    @Currency nvarchar(MAX) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @TimeZone_Clear bit = 0,
    @TimeZone nvarchar(MAX) = NULL,
    @IsFreeAccount_Clear bit = 0,
    @IsFreeAccount nvarchar(255) = NULL,
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
    [wild_apricot].[Account]
        (
            [SquareRegisterSettings],
                [Resources],
                [Name],
                [PrimaryDomainName],
                [Localization],
                [BillingPlan],
                [ContactLimitInfo],
                [PaymentSettings],
                [Currency],
                [Url],
                [TimeZone],
                [IsFreeAccount],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @SquareRegisterSettings_Clear = 1 THEN NULL ELSE ISNULL(@SquareRegisterSettings, NULL) END,
                CASE WHEN @Resources_Clear = 1 THEN NULL ELSE ISNULL(@Resources, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @PrimaryDomainName_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryDomainName, NULL) END,
                CASE WHEN @Localization_Clear = 1 THEN NULL ELSE ISNULL(@Localization, NULL) END,
                CASE WHEN @BillingPlan_Clear = 1 THEN NULL ELSE ISNULL(@BillingPlan, NULL) END,
                CASE WHEN @ContactLimitInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactLimitInfo, NULL) END,
                CASE WHEN @PaymentSettings_Clear = 1 THEN NULL ELSE ISNULL(@PaymentSettings, NULL) END,
                CASE WHEN @Currency_Clear = 1 THEN NULL ELSE ISNULL(@Currency, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @TimeZone_Clear = 1 THEN NULL ELSE ISNULL(@TimeZone, NULL) END,
                CASE WHEN @IsFreeAccount_Clear = 1 THEN NULL ELSE ISNULL(@IsFreeAccount, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwAccounts] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateAccount] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Accounts */

GRANT EXECUTE ON [wild_apricot].[spCreateAccount] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: spUpdateAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Account
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateAccount];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateAccount]
    @SquareRegisterSettings_Clear bit = 0,
    @SquareRegisterSettings nvarchar(MAX) = NULL,
    @Resources_Clear bit = 0,
    @Resources nvarchar(MAX) = NULL,
    @Id nvarchar(255),
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @PrimaryDomainName_Clear bit = 0,
    @PrimaryDomainName nvarchar(255) = NULL,
    @Localization_Clear bit = 0,
    @Localization nvarchar(MAX) = NULL,
    @BillingPlan_Clear bit = 0,
    @BillingPlan nvarchar(MAX) = NULL,
    @ContactLimitInfo_Clear bit = 0,
    @ContactLimitInfo nvarchar(MAX) = NULL,
    @PaymentSettings_Clear bit = 0,
    @PaymentSettings nvarchar(MAX) = NULL,
    @Currency_Clear bit = 0,
    @Currency nvarchar(MAX) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @TimeZone_Clear bit = 0,
    @TimeZone nvarchar(MAX) = NULL,
    @IsFreeAccount_Clear bit = 0,
    @IsFreeAccount nvarchar(255) = NULL,
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
        [wild_apricot].[Account]
    SET
        [SquareRegisterSettings] = CASE WHEN @SquareRegisterSettings_Clear = 1 THEN NULL ELSE ISNULL(@SquareRegisterSettings, [SquareRegisterSettings]) END,
        [Resources] = CASE WHEN @Resources_Clear = 1 THEN NULL ELSE ISNULL(@Resources, [Resources]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [PrimaryDomainName] = CASE WHEN @PrimaryDomainName_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryDomainName, [PrimaryDomainName]) END,
        [Localization] = CASE WHEN @Localization_Clear = 1 THEN NULL ELSE ISNULL(@Localization, [Localization]) END,
        [BillingPlan] = CASE WHEN @BillingPlan_Clear = 1 THEN NULL ELSE ISNULL(@BillingPlan, [BillingPlan]) END,
        [ContactLimitInfo] = CASE WHEN @ContactLimitInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactLimitInfo, [ContactLimitInfo]) END,
        [PaymentSettings] = CASE WHEN @PaymentSettings_Clear = 1 THEN NULL ELSE ISNULL(@PaymentSettings, [PaymentSettings]) END,
        [Currency] = CASE WHEN @Currency_Clear = 1 THEN NULL ELSE ISNULL(@Currency, [Currency]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [TimeZone] = CASE WHEN @TimeZone_Clear = 1 THEN NULL ELSE ISNULL(@TimeZone, [TimeZone]) END,
        [IsFreeAccount] = CASE WHEN @IsFreeAccount_Clear = 1 THEN NULL ELSE ISNULL(@IsFreeAccount, [IsFreeAccount]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwAccounts]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateAccount] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Account table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateAccount];
GO
CREATE TRIGGER [wild_apricot].trgUpdateAccount
ON [wild_apricot].[Account]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Account]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Account] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Accounts */

GRANT EXECUTE ON [wild_apricot].[spUpdateAccount] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Attachment Datas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attachment Datas
-- Item: vwAttachmentDatas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Attachment Datas
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  AttachmentData
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwAttachmentDatas]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwAttachmentDatas];
GO

CREATE VIEW [wild_apricot].[vwAttachmentDatas]
AS
SELECT
    a.*
FROM
    [wild_apricot].[AttachmentData] AS a
GO
GRANT SELECT ON [wild_apricot].[vwAttachmentDatas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Attachment Datas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attachment Datas
-- Item: Permissions for vwAttachmentDatas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwAttachmentDatas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Attachment Datas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attachment Datas
-- Item: spCreateAttachmentData
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AttachmentData
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateAttachmentData]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateAttachmentData];
GO

CREATE PROCEDURE [wild_apricot].[spCreateAttachmentData]
    @Id nvarchar(255) = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @MimeType_Clear bit = 0,
    @MimeType nvarchar(255) = NULL,
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
    [wild_apricot].[AttachmentData]
        (
            [Data],
                [Name],
                [MimeType],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @MimeType_Clear = 1 THEN NULL ELSE ISNULL(@MimeType, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwAttachmentDatas] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateAttachmentData] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Attachment Datas */

GRANT EXECUTE ON [wild_apricot].[spCreateAttachmentData] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Attachment Datas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attachment Datas
-- Item: spUpdateAttachmentData
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AttachmentData
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateAttachmentData]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateAttachmentData];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateAttachmentData]
    @Id nvarchar(255),
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @MimeType_Clear bit = 0,
    @MimeType nvarchar(255) = NULL,
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
        [wild_apricot].[AttachmentData]
    SET
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [MimeType] = CASE WHEN @MimeType_Clear = 1 THEN NULL ELSE ISNULL(@MimeType, [MimeType]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwAttachmentDatas] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwAttachmentDatas]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateAttachmentData] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AttachmentData table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateAttachmentData]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateAttachmentData];
GO
CREATE TRIGGER [wild_apricot].trgUpdateAttachmentData
ON [wild_apricot].[AttachmentData]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[AttachmentData]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[AttachmentData] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Attachment Datas */

GRANT EXECUTE ON [wild_apricot].[spUpdateAttachmentData] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Audit Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Items
-- Item: vwAuditLogItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Audit Log Items
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  AuditLogItem
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwAuditLogItems]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwAuditLogItems];
GO

CREATE VIEW [wild_apricot].[vwAuditLogItems]
AS
SELECT
    a.*
FROM
    [wild_apricot].[AuditLogItem] AS a
GO
GRANT SELECT ON [wild_apricot].[vwAuditLogItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Audit Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Items
-- Item: Permissions for vwAuditLogItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwAuditLogItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Audit Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Items
-- Item: spCreateAuditLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLogItem
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateAuditLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateAuditLogItem];
GO

CREATE PROCEDURE [wild_apricot].[spCreateAuditLogItem]
    @Properties_Clear bit = 0,
    @Properties nvarchar(MAX) = NULL,
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
    @Document_Clear bit = 0,
    @Document nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Severity_Clear bit = 0,
    @Severity nvarchar(255) = NULL,
    @OrderType_Clear bit = 0,
    @OrderType nvarchar(255) = NULL,
    @DocumentAction_Clear bit = 0,
    @DocumentAction nvarchar(255) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(255) = NULL,
    @Organization_Clear bit = 0,
    @Organization nvarchar(255) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(255) = NULL,
    @DocumentType_Clear bit = 0,
    @DocumentType nvarchar(255) = NULL,
    @Timestamp_Clear bit = 0,
    @Timestamp nvarchar(255) = NULL,
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
    [wild_apricot].[AuditLogItem]
        (
            [Properties],
                [FirstName],
                [Contact],
                [Document],
                [Url],
                [Severity],
                [OrderType],
                [DocumentAction],
                [LastName],
                [Organization],
                [Email],
                [Message],
                [DocumentType],
                [Timestamp],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Properties_Clear = 1 THEN NULL ELSE ISNULL(@Properties, NULL) END,
                CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, NULL) END,
                CASE WHEN @Document_Clear = 1 THEN NULL ELSE ISNULL(@Document, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @Severity_Clear = 1 THEN NULL ELSE ISNULL(@Severity, NULL) END,
                CASE WHEN @OrderType_Clear = 1 THEN NULL ELSE ISNULL(@OrderType, NULL) END,
                CASE WHEN @DocumentAction_Clear = 1 THEN NULL ELSE ISNULL(@DocumentAction, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @Organization_Clear = 1 THEN NULL ELSE ISNULL(@Organization, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @DocumentType_Clear = 1 THEN NULL ELSE ISNULL(@DocumentType, NULL) END,
                CASE WHEN @Timestamp_Clear = 1 THEN NULL ELSE ISNULL(@Timestamp, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwAuditLogItems] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateAuditLogItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Audit Log Items */

GRANT EXECUTE ON [wild_apricot].[spCreateAuditLogItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Audit Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Items
-- Item: spUpdateAuditLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AuditLogItem
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateAuditLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateAuditLogItem];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateAuditLogItem]
    @Properties_Clear bit = 0,
    @Properties nvarchar(MAX) = NULL,
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
    @Document_Clear bit = 0,
    @Document nvarchar(255) = NULL,
    @Id nvarchar(255),
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Severity_Clear bit = 0,
    @Severity nvarchar(255) = NULL,
    @OrderType_Clear bit = 0,
    @OrderType nvarchar(255) = NULL,
    @DocumentAction_Clear bit = 0,
    @DocumentAction nvarchar(255) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(255) = NULL,
    @Organization_Clear bit = 0,
    @Organization nvarchar(255) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(255) = NULL,
    @DocumentType_Clear bit = 0,
    @DocumentType nvarchar(255) = NULL,
    @Timestamp_Clear bit = 0,
    @Timestamp nvarchar(255) = NULL,
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
        [wild_apricot].[AuditLogItem]
    SET
        [Properties] = CASE WHEN @Properties_Clear = 1 THEN NULL ELSE ISNULL(@Properties, [Properties]) END,
        [FirstName] = CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, [FirstName]) END,
        [Contact] = CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, [Contact]) END,
        [Document] = CASE WHEN @Document_Clear = 1 THEN NULL ELSE ISNULL(@Document, [Document]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [Severity] = CASE WHEN @Severity_Clear = 1 THEN NULL ELSE ISNULL(@Severity, [Severity]) END,
        [OrderType] = CASE WHEN @OrderType_Clear = 1 THEN NULL ELSE ISNULL(@OrderType, [OrderType]) END,
        [DocumentAction] = CASE WHEN @DocumentAction_Clear = 1 THEN NULL ELSE ISNULL(@DocumentAction, [DocumentAction]) END,
        [LastName] = CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, [LastName]) END,
        [Organization] = CASE WHEN @Organization_Clear = 1 THEN NULL ELSE ISNULL(@Organization, [Organization]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [DocumentType] = CASE WHEN @DocumentType_Clear = 1 THEN NULL ELSE ISNULL(@DocumentType, [DocumentType]) END,
        [Timestamp] = CASE WHEN @Timestamp_Clear = 1 THEN NULL ELSE ISNULL(@Timestamp, [Timestamp]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwAuditLogItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwAuditLogItems]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateAuditLogItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuditLogItem table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateAuditLogItem]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateAuditLogItem];
GO
CREATE TRIGGER [wild_apricot].trgUpdateAuditLogItem
ON [wild_apricot].[AuditLogItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[AuditLogItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[AuditLogItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Audit Log Items */

GRANT EXECUTE ON [wild_apricot].[spUpdateAuditLogItem] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bundles
-- Item: vwBundles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Bundles
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Bundle
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwBundles]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwBundles];
GO

CREATE VIEW [wild_apricot].[vwBundles]
AS
SELECT
    b.*
FROM
    [wild_apricot].[Bundle] AS b
GO
GRANT SELECT ON [wild_apricot].[vwBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bundles
-- Item: Permissions for vwBundles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bundles
-- Item: spCreateBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Bundle
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateBundle];
GO

CREATE PROCEDURE [wild_apricot].[spCreateBundle]
    @MembershipLevel_Clear bit = 0,
    @MembershipLevel nvarchar(255) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @SpacesLeft_Clear bit = 0,
    @SpacesLeft nvarchar(255) = NULL,
    @Members_Clear bit = 0,
    @Members nvarchar(MAX) = NULL,
    @ParticipantsCount_Clear bit = 0,
    @ParticipantsCount nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Administrator_Clear bit = 0,
    @Administrator nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
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
    [wild_apricot].[Bundle]
        (
            [MembershipLevel],
                [Email],
                [SpacesLeft],
                [Members],
                [ParticipantsCount],
                [Url],
                [Administrator],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @MembershipLevel_Clear = 1 THEN NULL ELSE ISNULL(@MembershipLevel, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @SpacesLeft_Clear = 1 THEN NULL ELSE ISNULL(@SpacesLeft, NULL) END,
                CASE WHEN @Members_Clear = 1 THEN NULL ELSE ISNULL(@Members, NULL) END,
                CASE WHEN @ParticipantsCount_Clear = 1 THEN NULL ELSE ISNULL(@ParticipantsCount, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @Administrator_Clear = 1 THEN NULL ELSE ISNULL(@Administrator, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwBundles] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateBundle] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Bundles */

GRANT EXECUTE ON [wild_apricot].[spCreateBundle] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bundles
-- Item: spUpdateBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Bundle
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateBundle];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateBundle]
    @MembershipLevel_Clear bit = 0,
    @MembershipLevel nvarchar(255) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @SpacesLeft_Clear bit = 0,
    @SpacesLeft nvarchar(255) = NULL,
    @Members_Clear bit = 0,
    @Members nvarchar(MAX) = NULL,
    @ParticipantsCount_Clear bit = 0,
    @ParticipantsCount nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Administrator_Clear bit = 0,
    @Administrator nvarchar(255) = NULL,
    @Id nvarchar(255),
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
        [wild_apricot].[Bundle]
    SET
        [MembershipLevel] = CASE WHEN @MembershipLevel_Clear = 1 THEN NULL ELSE ISNULL(@MembershipLevel, [MembershipLevel]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [SpacesLeft] = CASE WHEN @SpacesLeft_Clear = 1 THEN NULL ELSE ISNULL(@SpacesLeft, [SpacesLeft]) END,
        [Members] = CASE WHEN @Members_Clear = 1 THEN NULL ELSE ISNULL(@Members, [Members]) END,
        [ParticipantsCount] = CASE WHEN @ParticipantsCount_Clear = 1 THEN NULL ELSE ISNULL(@ParticipantsCount, [ParticipantsCount]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [Administrator] = CASE WHEN @Administrator_Clear = 1 THEN NULL ELSE ISNULL(@Administrator, [Administrator]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwBundles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwBundles]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateBundle] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Bundle table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateBundle]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateBundle];
GO
CREATE TRIGGER [wild_apricot].trgUpdateBundle
ON [wild_apricot].[Bundle]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Bundle]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Bundle] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Bundles */

GRANT EXECUTE ON [wild_apricot].[spUpdateBundle] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Ceu Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Ceu Records
-- Item: vwCeuRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Ceu Records
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  CeuRecord
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwCeuRecords]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwCeuRecords];
GO

CREATE VIEW [wild_apricot].[vwCeuRecords]
AS
SELECT
    c.*
FROM
    [wild_apricot].[CeuRecord] AS c
GO
GRANT SELECT ON [wild_apricot].[vwCeuRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Ceu Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Ceu Records
-- Item: Permissions for vwCeuRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwCeuRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Ceu Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Ceu Records
-- Item: spCreateCeuRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CeuRecord
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateCeuRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateCeuRecord];
GO

CREATE PROCEDURE [wild_apricot].[spCreateCeuRecord]
    @CEUType_Clear bit = 0,
    @CEUType nvarchar(255) = NULL,
    @InstructorProvider_Clear bit = 0,
    @InstructorProvider nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @RecordStatus_Clear bit = 0,
    @RecordStatus nvarchar(255) = NULL,
    @InternalNotes_Clear bit = 0,
    @InternalNotes nvarchar(255) = NULL,
    @ActivityTitle_Clear bit = 0,
    @ActivityTitle nvarchar(255) = NULL,
    @SourceRefId_Clear bit = 0,
    @SourceRefId nvarchar(255) = NULL,
    @CreationDate_Clear bit = 0,
    @CreationDate nvarchar(255) = NULL,
    @CertificateUrl_Clear bit = 0,
    @CertificateUrl nvarchar(255) = NULL,
    @LastModified_Clear bit = 0,
    @LastModified nvarchar(255) = NULL,
    @PublicNotes_Clear bit = 0,
    @PublicNotes nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @CreditsEarned_Clear bit = 0,
    @CreditsEarned nvarchar(255) = NULL,
    @EndDate_Clear bit = 0,
    @EndDate nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(MAX) = NULL,
    @SourceType_Clear bit = 0,
    @SourceType nvarchar(255) = NULL,
    @ExpiryDate_Clear bit = 0,
    @ExpiryDate nvarchar(255) = NULL,
    @StartDate_Clear bit = 0,
    @StartDate nvarchar(255) = NULL,
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
    [wild_apricot].[CeuRecord]
        (
            [CEUType],
                [InstructorProvider],
                [RecordStatus],
                [InternalNotes],
                [ActivityTitle],
                [SourceRefId],
                [CreationDate],
                [CertificateUrl],
                [LastModified],
                [PublicNotes],
                [Url],
                [CreditsEarned],
                [EndDate],
                [Contact],
                [SourceType],
                [ExpiryDate],
                [StartDate],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @CEUType_Clear = 1 THEN NULL ELSE ISNULL(@CEUType, NULL) END,
                CASE WHEN @InstructorProvider_Clear = 1 THEN NULL ELSE ISNULL(@InstructorProvider, NULL) END,
                CASE WHEN @RecordStatus_Clear = 1 THEN NULL ELSE ISNULL(@RecordStatus, NULL) END,
                CASE WHEN @InternalNotes_Clear = 1 THEN NULL ELSE ISNULL(@InternalNotes, NULL) END,
                CASE WHEN @ActivityTitle_Clear = 1 THEN NULL ELSE ISNULL(@ActivityTitle, NULL) END,
                CASE WHEN @SourceRefId_Clear = 1 THEN NULL ELSE ISNULL(@SourceRefId, NULL) END,
                CASE WHEN @CreationDate_Clear = 1 THEN NULL ELSE ISNULL(@CreationDate, NULL) END,
                CASE WHEN @CertificateUrl_Clear = 1 THEN NULL ELSE ISNULL(@CertificateUrl, NULL) END,
                CASE WHEN @LastModified_Clear = 1 THEN NULL ELSE ISNULL(@LastModified, NULL) END,
                CASE WHEN @PublicNotes_Clear = 1 THEN NULL ELSE ISNULL(@PublicNotes, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @CreditsEarned_Clear = 1 THEN NULL ELSE ISNULL(@CreditsEarned, NULL) END,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, NULL) END,
                CASE WHEN @SourceType_Clear = 1 THEN NULL ELSE ISNULL(@SourceType, NULL) END,
                CASE WHEN @ExpiryDate_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryDate, NULL) END,
                CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwCeuRecords] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateCeuRecord] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Ceu Records */

GRANT EXECUTE ON [wild_apricot].[spCreateCeuRecord] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Ceu Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Ceu Records
-- Item: spUpdateCeuRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CeuRecord
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateCeuRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateCeuRecord];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateCeuRecord]
    @CEUType_Clear bit = 0,
    @CEUType nvarchar(255) = NULL,
    @InstructorProvider_Clear bit = 0,
    @InstructorProvider nvarchar(255) = NULL,
    @Id nvarchar(255),
    @RecordStatus_Clear bit = 0,
    @RecordStatus nvarchar(255) = NULL,
    @InternalNotes_Clear bit = 0,
    @InternalNotes nvarchar(255) = NULL,
    @ActivityTitle_Clear bit = 0,
    @ActivityTitle nvarchar(255) = NULL,
    @SourceRefId_Clear bit = 0,
    @SourceRefId nvarchar(255) = NULL,
    @CreationDate_Clear bit = 0,
    @CreationDate nvarchar(255) = NULL,
    @CertificateUrl_Clear bit = 0,
    @CertificateUrl nvarchar(255) = NULL,
    @LastModified_Clear bit = 0,
    @LastModified nvarchar(255) = NULL,
    @PublicNotes_Clear bit = 0,
    @PublicNotes nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @CreditsEarned_Clear bit = 0,
    @CreditsEarned nvarchar(255) = NULL,
    @EndDate_Clear bit = 0,
    @EndDate nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(MAX) = NULL,
    @SourceType_Clear bit = 0,
    @SourceType nvarchar(255) = NULL,
    @ExpiryDate_Clear bit = 0,
    @ExpiryDate nvarchar(255) = NULL,
    @StartDate_Clear bit = 0,
    @StartDate nvarchar(255) = NULL,
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
        [wild_apricot].[CeuRecord]
    SET
        [CEUType] = CASE WHEN @CEUType_Clear = 1 THEN NULL ELSE ISNULL(@CEUType, [CEUType]) END,
        [InstructorProvider] = CASE WHEN @InstructorProvider_Clear = 1 THEN NULL ELSE ISNULL(@InstructorProvider, [InstructorProvider]) END,
        [RecordStatus] = CASE WHEN @RecordStatus_Clear = 1 THEN NULL ELSE ISNULL(@RecordStatus, [RecordStatus]) END,
        [InternalNotes] = CASE WHEN @InternalNotes_Clear = 1 THEN NULL ELSE ISNULL(@InternalNotes, [InternalNotes]) END,
        [ActivityTitle] = CASE WHEN @ActivityTitle_Clear = 1 THEN NULL ELSE ISNULL(@ActivityTitle, [ActivityTitle]) END,
        [SourceRefId] = CASE WHEN @SourceRefId_Clear = 1 THEN NULL ELSE ISNULL(@SourceRefId, [SourceRefId]) END,
        [CreationDate] = CASE WHEN @CreationDate_Clear = 1 THEN NULL ELSE ISNULL(@CreationDate, [CreationDate]) END,
        [CertificateUrl] = CASE WHEN @CertificateUrl_Clear = 1 THEN NULL ELSE ISNULL(@CertificateUrl, [CertificateUrl]) END,
        [LastModified] = CASE WHEN @LastModified_Clear = 1 THEN NULL ELSE ISNULL(@LastModified, [LastModified]) END,
        [PublicNotes] = CASE WHEN @PublicNotes_Clear = 1 THEN NULL ELSE ISNULL(@PublicNotes, [PublicNotes]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [CreditsEarned] = CASE WHEN @CreditsEarned_Clear = 1 THEN NULL ELSE ISNULL(@CreditsEarned, [CreditsEarned]) END,
        [EndDate] = CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, [EndDate]) END,
        [Contact] = CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, [Contact]) END,
        [SourceType] = CASE WHEN @SourceType_Clear = 1 THEN NULL ELSE ISNULL(@SourceType, [SourceType]) END,
        [ExpiryDate] = CASE WHEN @ExpiryDate_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryDate, [ExpiryDate]) END,
        [StartDate] = CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, [StartDate]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwCeuRecords] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwCeuRecords]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateCeuRecord] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CeuRecord table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateCeuRecord]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateCeuRecord];
GO
CREATE TRIGGER [wild_apricot].trgUpdateCeuRecord
ON [wild_apricot].[CeuRecord]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[CeuRecord]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[CeuRecord] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Ceu Records */

GRANT EXECUTE ON [wild_apricot].[spUpdateCeuRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: spDeleteAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Account
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteAccount];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteAccount]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Account]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteAccount] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Accounts */

GRANT EXECUTE ON [wild_apricot].[spDeleteAccount] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Attachment Datas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attachment Datas
-- Item: spDeleteAttachmentData
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AttachmentData
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteAttachmentData]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteAttachmentData];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteAttachmentData]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[AttachmentData]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteAttachmentData] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Attachment Datas */

GRANT EXECUTE ON [wild_apricot].[spDeleteAttachmentData] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Audit Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Audit Log Items
-- Item: spDeleteAuditLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AuditLogItem
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteAuditLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteAuditLogItem];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteAuditLogItem]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[AuditLogItem]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteAuditLogItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Audit Log Items */

GRANT EXECUTE ON [wild_apricot].[spDeleteAuditLogItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bundles
-- Item: spDeleteBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Bundle
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteBundle];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteBundle]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Bundle]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteBundle] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Bundles */

GRANT EXECUTE ON [wild_apricot].[spDeleteBundle] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Ceu Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Ceu Records
-- Item: spDeleteCeuRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CeuRecord
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteCeuRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteCeuRecord];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteCeuRecord]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[CeuRecord]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteCeuRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Ceu Records */

GRANT EXECUTE ON [wild_apricot].[spDeleteCeuRecord] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ContactFieldDescription */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Field Descriptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Contact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for EmailDraft */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Drafts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EmailDraft
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EmailDraft_EventId' 
    AND object_id = OBJECT_ID('[wild_apricot].[EmailDraft]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EmailDraft_EventId ON [wild_apricot].[EmailDraft] ([EventId]);

/* Index for Foreign Keys for EmailLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for EntityFieldDescription */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Descriptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Contact Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Field Descriptions
-- Item: vwContactFieldDescriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Field Descriptions
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  ContactFieldDescription
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwContactFieldDescriptions]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwContactFieldDescriptions];
GO

CREATE VIEW [wild_apricot].[vwContactFieldDescriptions]
AS
SELECT
    c.*
FROM
    [wild_apricot].[ContactFieldDescription] AS c
GO
GRANT SELECT ON [wild_apricot].[vwContactFieldDescriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Field Descriptions
-- Item: Permissions for vwContactFieldDescriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwContactFieldDescriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Field Descriptions
-- Item: spCreateContactFieldDescription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactFieldDescription
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateContactFieldDescription]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateContactFieldDescription];
GO

CREATE PROCEDURE [wild_apricot].[spCreateContactFieldDescription]
    @MemberOnly_Clear bit = 0,
    @MemberOnly nvarchar(255) = NULL,
    @ExistsInLevels_Clear bit = 0,
    @ExistsInLevels nvarchar(MAX) = NULL,
    @MemberAccess_Clear bit = 0,
    @MemberAccess nvarchar(400) = NULL,
    @ExtraCharge_Clear bit = 0,
    @ExtraCharge nvarchar(MAX) = NULL,
    @Id nvarchar(255) = NULL,
    @RulesAndTermsInfo_Clear bit = 0,
    @RulesAndTermsInfo nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @FieldType_Clear bit = 0,
    @FieldType nvarchar(400) = NULL,
    @SystemCode_Clear bit = 0,
    @SystemCode nvarchar(255) = NULL,
    @FieldInstructions_Clear bit = 0,
    @FieldInstructions nvarchar(255) = NULL,
    @ProrateInApplication_Clear bit = 0,
    @ProrateInApplication nvarchar(255) = NULL,
    @AdminOnly_Clear bit = 0,
    @AdminOnly nvarchar(255) = NULL,
    @AllowedValues_Clear bit = 0,
    @AllowedValues nvarchar(MAX) = NULL,
    @IsEditable_Clear bit = 0,
    @IsEditable nvarchar(255) = NULL,
    @DisplayType_Clear bit = 0,
    @DisplayType nvarchar(255) = NULL,
    @RenewalPolicy_Clear bit = 0,
    @RenewalPolicy nvarchar(MAX) = NULL,
    @IsBuiltIn_Clear bit = 0,
    @IsBuiltIn nvarchar(255) = NULL,
    @SupportSearch_Clear bit = 0,
    @SupportSearch nvarchar(255) = NULL,
    @Access_Clear bit = 0,
    @Access nvarchar(400) = NULL,
    @IsSystem_Clear bit = 0,
    @IsSystem nvarchar(255) = NULL,
    @Order_Clear bit = 0,
    @Order nvarchar(255) = NULL,
    @FieldName_Clear bit = 0,
    @FieldName nvarchar(255) = NULL,
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
    [wild_apricot].[ContactFieldDescription]
        (
            [MemberOnly],
                [ExistsInLevels],
                [MemberAccess],
                [ExtraCharge],
                [RulesAndTermsInfo],
                [Description],
                [FieldType],
                [SystemCode],
                [FieldInstructions],
                [ProrateInApplication],
                [AdminOnly],
                [AllowedValues],
                [IsEditable],
                [DisplayType],
                [RenewalPolicy],
                [IsBuiltIn],
                [SupportSearch],
                [Access],
                [IsSystem],
                [Order],
                [FieldName],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @MemberOnly_Clear = 1 THEN NULL ELSE ISNULL(@MemberOnly, NULL) END,
                CASE WHEN @ExistsInLevels_Clear = 1 THEN NULL ELSE ISNULL(@ExistsInLevels, NULL) END,
                CASE WHEN @MemberAccess_Clear = 1 THEN NULL ELSE ISNULL(@MemberAccess, NULL) END,
                CASE WHEN @ExtraCharge_Clear = 1 THEN NULL ELSE ISNULL(@ExtraCharge, NULL) END,
                CASE WHEN @RulesAndTermsInfo_Clear = 1 THEN NULL ELSE ISNULL(@RulesAndTermsInfo, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @FieldType_Clear = 1 THEN NULL ELSE ISNULL(@FieldType, NULL) END,
                CASE WHEN @SystemCode_Clear = 1 THEN NULL ELSE ISNULL(@SystemCode, NULL) END,
                CASE WHEN @FieldInstructions_Clear = 1 THEN NULL ELSE ISNULL(@FieldInstructions, NULL) END,
                CASE WHEN @ProrateInApplication_Clear = 1 THEN NULL ELSE ISNULL(@ProrateInApplication, NULL) END,
                CASE WHEN @AdminOnly_Clear = 1 THEN NULL ELSE ISNULL(@AdminOnly, NULL) END,
                CASE WHEN @AllowedValues_Clear = 1 THEN NULL ELSE ISNULL(@AllowedValues, NULL) END,
                CASE WHEN @IsEditable_Clear = 1 THEN NULL ELSE ISNULL(@IsEditable, NULL) END,
                CASE WHEN @DisplayType_Clear = 1 THEN NULL ELSE ISNULL(@DisplayType, NULL) END,
                CASE WHEN @RenewalPolicy_Clear = 1 THEN NULL ELSE ISNULL(@RenewalPolicy, NULL) END,
                CASE WHEN @IsBuiltIn_Clear = 1 THEN NULL ELSE ISNULL(@IsBuiltIn, NULL) END,
                CASE WHEN @SupportSearch_Clear = 1 THEN NULL ELSE ISNULL(@SupportSearch, NULL) END,
                CASE WHEN @Access_Clear = 1 THEN NULL ELSE ISNULL(@Access, NULL) END,
                CASE WHEN @IsSystem_Clear = 1 THEN NULL ELSE ISNULL(@IsSystem, NULL) END,
                CASE WHEN @Order_Clear = 1 THEN NULL ELSE ISNULL(@Order, NULL) END,
                CASE WHEN @FieldName_Clear = 1 THEN NULL ELSE ISNULL(@FieldName, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwContactFieldDescriptions] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateContactFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Field Descriptions */

GRANT EXECUTE ON [wild_apricot].[spCreateContactFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Field Descriptions
-- Item: spUpdateContactFieldDescription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactFieldDescription
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateContactFieldDescription]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateContactFieldDescription];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateContactFieldDescription]
    @MemberOnly_Clear bit = 0,
    @MemberOnly nvarchar(255) = NULL,
    @ExistsInLevels_Clear bit = 0,
    @ExistsInLevels nvarchar(MAX) = NULL,
    @MemberAccess_Clear bit = 0,
    @MemberAccess nvarchar(400) = NULL,
    @ExtraCharge_Clear bit = 0,
    @ExtraCharge nvarchar(MAX) = NULL,
    @Id nvarchar(255),
    @RulesAndTermsInfo_Clear bit = 0,
    @RulesAndTermsInfo nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @FieldType_Clear bit = 0,
    @FieldType nvarchar(400) = NULL,
    @SystemCode_Clear bit = 0,
    @SystemCode nvarchar(255) = NULL,
    @FieldInstructions_Clear bit = 0,
    @FieldInstructions nvarchar(255) = NULL,
    @ProrateInApplication_Clear bit = 0,
    @ProrateInApplication nvarchar(255) = NULL,
    @AdminOnly_Clear bit = 0,
    @AdminOnly nvarchar(255) = NULL,
    @AllowedValues_Clear bit = 0,
    @AllowedValues nvarchar(MAX) = NULL,
    @IsEditable_Clear bit = 0,
    @IsEditable nvarchar(255) = NULL,
    @DisplayType_Clear bit = 0,
    @DisplayType nvarchar(255) = NULL,
    @RenewalPolicy_Clear bit = 0,
    @RenewalPolicy nvarchar(MAX) = NULL,
    @IsBuiltIn_Clear bit = 0,
    @IsBuiltIn nvarchar(255) = NULL,
    @SupportSearch_Clear bit = 0,
    @SupportSearch nvarchar(255) = NULL,
    @Access_Clear bit = 0,
    @Access nvarchar(400) = NULL,
    @IsSystem_Clear bit = 0,
    @IsSystem nvarchar(255) = NULL,
    @Order_Clear bit = 0,
    @Order nvarchar(255) = NULL,
    @FieldName_Clear bit = 0,
    @FieldName nvarchar(255) = NULL,
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
        [wild_apricot].[ContactFieldDescription]
    SET
        [MemberOnly] = CASE WHEN @MemberOnly_Clear = 1 THEN NULL ELSE ISNULL(@MemberOnly, [MemberOnly]) END,
        [ExistsInLevels] = CASE WHEN @ExistsInLevels_Clear = 1 THEN NULL ELSE ISNULL(@ExistsInLevels, [ExistsInLevels]) END,
        [MemberAccess] = CASE WHEN @MemberAccess_Clear = 1 THEN NULL ELSE ISNULL(@MemberAccess, [MemberAccess]) END,
        [ExtraCharge] = CASE WHEN @ExtraCharge_Clear = 1 THEN NULL ELSE ISNULL(@ExtraCharge, [ExtraCharge]) END,
        [RulesAndTermsInfo] = CASE WHEN @RulesAndTermsInfo_Clear = 1 THEN NULL ELSE ISNULL(@RulesAndTermsInfo, [RulesAndTermsInfo]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [FieldType] = CASE WHEN @FieldType_Clear = 1 THEN NULL ELSE ISNULL(@FieldType, [FieldType]) END,
        [SystemCode] = CASE WHEN @SystemCode_Clear = 1 THEN NULL ELSE ISNULL(@SystemCode, [SystemCode]) END,
        [FieldInstructions] = CASE WHEN @FieldInstructions_Clear = 1 THEN NULL ELSE ISNULL(@FieldInstructions, [FieldInstructions]) END,
        [ProrateInApplication] = CASE WHEN @ProrateInApplication_Clear = 1 THEN NULL ELSE ISNULL(@ProrateInApplication, [ProrateInApplication]) END,
        [AdminOnly] = CASE WHEN @AdminOnly_Clear = 1 THEN NULL ELSE ISNULL(@AdminOnly, [AdminOnly]) END,
        [AllowedValues] = CASE WHEN @AllowedValues_Clear = 1 THEN NULL ELSE ISNULL(@AllowedValues, [AllowedValues]) END,
        [IsEditable] = CASE WHEN @IsEditable_Clear = 1 THEN NULL ELSE ISNULL(@IsEditable, [IsEditable]) END,
        [DisplayType] = CASE WHEN @DisplayType_Clear = 1 THEN NULL ELSE ISNULL(@DisplayType, [DisplayType]) END,
        [RenewalPolicy] = CASE WHEN @RenewalPolicy_Clear = 1 THEN NULL ELSE ISNULL(@RenewalPolicy, [RenewalPolicy]) END,
        [IsBuiltIn] = CASE WHEN @IsBuiltIn_Clear = 1 THEN NULL ELSE ISNULL(@IsBuiltIn, [IsBuiltIn]) END,
        [SupportSearch] = CASE WHEN @SupportSearch_Clear = 1 THEN NULL ELSE ISNULL(@SupportSearch, [SupportSearch]) END,
        [Access] = CASE WHEN @Access_Clear = 1 THEN NULL ELSE ISNULL(@Access, [Access]) END,
        [IsSystem] = CASE WHEN @IsSystem_Clear = 1 THEN NULL ELSE ISNULL(@IsSystem, [IsSystem]) END,
        [Order] = CASE WHEN @Order_Clear = 1 THEN NULL ELSE ISNULL(@Order, [Order]) END,
        [FieldName] = CASE WHEN @FieldName_Clear = 1 THEN NULL ELSE ISNULL(@FieldName, [FieldName]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwContactFieldDescriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwContactFieldDescriptions]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateContactFieldDescription] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactFieldDescription table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateContactFieldDescription]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateContactFieldDescription];
GO
CREATE TRIGGER [wild_apricot].trgUpdateContactFieldDescription
ON [wild_apricot].[ContactFieldDescription]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[ContactFieldDescription]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[ContactFieldDescription] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Contact Field Descriptions */

GRANT EXECUTE ON [wild_apricot].[spUpdateContactFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Contact
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwContacts]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwContacts];
GO

CREATE VIEW [wild_apricot].[vwContacts]
AS
SELECT
    c.*
FROM
    [wild_apricot].[Contact] AS c
GO
GRANT SELECT ON [wild_apricot].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Permissions for vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spCreateContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateContact];
GO

CREATE PROCEDURE [wild_apricot].[spCreateContact]
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(255) = NULL,
    @FieldValues_Clear bit = 0,
    @FieldValues nvarchar(MAX) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @IsAccountAdministrator_Clear bit = 0,
    @IsAccountAdministrator nvarchar(255) = NULL,
    @TermsOfUseAccepted_Clear bit = 0,
    @TermsOfUseAccepted nvarchar(255) = NULL,
    @MembershipLevel_Clear bit = 0,
    @MembershipLevel nvarchar(255) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @MembershipEnabled_Clear bit = 0,
    @MembershipEnabled nvarchar(255) = NULL,
    @Organization_Clear bit = 0,
    @Organization nvarchar(255) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(255) = NULL,
    @ProfileLastUpdated_Clear bit = 0,
    @ProfileLastUpdated nvarchar(255) = NULL,
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
    [wild_apricot].[Contact]
        (
            [FirstName],
                [FieldValues],
                [LastName],
                [Url],
                [IsAccountAdministrator],
                [TermsOfUseAccepted],
                [MembershipLevel],
                [Email],
                [MembershipEnabled],
                [Organization],
                [DisplayName],
                [Status],
                [ProfileLastUpdated],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                CASE WHEN @FieldValues_Clear = 1 THEN NULL ELSE ISNULL(@FieldValues, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @IsAccountAdministrator_Clear = 1 THEN NULL ELSE ISNULL(@IsAccountAdministrator, NULL) END,
                CASE WHEN @TermsOfUseAccepted_Clear = 1 THEN NULL ELSE ISNULL(@TermsOfUseAccepted, NULL) END,
                CASE WHEN @MembershipLevel_Clear = 1 THEN NULL ELSE ISNULL(@MembershipLevel, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @MembershipEnabled_Clear = 1 THEN NULL ELSE ISNULL(@MembershipEnabled, NULL) END,
                CASE WHEN @Organization_Clear = 1 THEN NULL ELSE ISNULL(@Organization, NULL) END,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @ProfileLastUpdated_Clear = 1 THEN NULL ELSE ISNULL(@ProfileLastUpdated, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwContacts] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateContact] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contacts */

GRANT EXECUTE ON [wild_apricot].[spCreateContact] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spUpdateContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateContact];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateContact]
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(255) = NULL,
    @FieldValues_Clear bit = 0,
    @FieldValues nvarchar(MAX) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @IsAccountAdministrator_Clear bit = 0,
    @IsAccountAdministrator nvarchar(255) = NULL,
    @TermsOfUseAccepted_Clear bit = 0,
    @TermsOfUseAccepted nvarchar(255) = NULL,
    @MembershipLevel_Clear bit = 0,
    @MembershipLevel nvarchar(255) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @Id nvarchar(255),
    @MembershipEnabled_Clear bit = 0,
    @MembershipEnabled nvarchar(255) = NULL,
    @Organization_Clear bit = 0,
    @Organization nvarchar(255) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(255) = NULL,
    @ProfileLastUpdated_Clear bit = 0,
    @ProfileLastUpdated nvarchar(255) = NULL,
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
        [wild_apricot].[Contact]
    SET
        [FirstName] = CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, [FirstName]) END,
        [FieldValues] = CASE WHEN @FieldValues_Clear = 1 THEN NULL ELSE ISNULL(@FieldValues, [FieldValues]) END,
        [LastName] = CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, [LastName]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [IsAccountAdministrator] = CASE WHEN @IsAccountAdministrator_Clear = 1 THEN NULL ELSE ISNULL(@IsAccountAdministrator, [IsAccountAdministrator]) END,
        [TermsOfUseAccepted] = CASE WHEN @TermsOfUseAccepted_Clear = 1 THEN NULL ELSE ISNULL(@TermsOfUseAccepted, [TermsOfUseAccepted]) END,
        [MembershipLevel] = CASE WHEN @MembershipLevel_Clear = 1 THEN NULL ELSE ISNULL(@MembershipLevel, [MembershipLevel]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [MembershipEnabled] = CASE WHEN @MembershipEnabled_Clear = 1 THEN NULL ELSE ISNULL(@MembershipEnabled, [MembershipEnabled]) END,
        [Organization] = CASE WHEN @Organization_Clear = 1 THEN NULL ELSE ISNULL(@Organization, [Organization]) END,
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END,
        [ProfileLastUpdated] = CASE WHEN @ProfileLastUpdated_Clear = 1 THEN NULL ELSE ISNULL(@ProfileLastUpdated, [ProfileLastUpdated]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwContacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwContacts]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Contact table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateContact]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateContact];
GO
CREATE TRIGGER [wild_apricot].trgUpdateContact
ON [wild_apricot].[Contact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Contact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Contact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Contacts */

GRANT EXECUTE ON [wild_apricot].[spUpdateContact] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Email Drafts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Drafts
-- Item: vwEmailDrafts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Drafts
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  EmailDraft
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwEmailDrafts]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwEmailDrafts];
GO

CREATE VIEW [wild_apricot].[vwEmailDrafts]
AS
SELECT
    e.*
FROM
    [wild_apricot].[EmailDraft] AS e
GO
GRANT SELECT ON [wild_apricot].[vwEmailDrafts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Drafts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Drafts
-- Item: Permissions for vwEmailDrafts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwEmailDrafts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Drafts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Drafts
-- Item: spCreateEmailDraft
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EmailDraft
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateEmailDraft]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateEmailDraft];
GO

CREATE PROCEDURE [wild_apricot].[spCreateEmailDraft]
    @Body_Clear bit = 0,
    @Body nvarchar(255) = NULL,
    @Recipients_Clear bit = 0,
    @Recipients nvarchar(MAX) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
    @Subject_Clear bit = 0,
    @Subject nvarchar(255) = NULL,
    @Modifier_Clear bit = 0,
    @Modifier nvarchar(MAX) = NULL,
    @IsScheduled_Clear bit = 0,
    @IsScheduled nvarchar(255) = NULL,
    @ScheduledDate_Clear bit = 0,
    @ScheduledDate nvarchar(255) = NULL,
    @Creator_Clear bit = 0,
    @Creator nvarchar(MAX) = NULL,
    @ReplyToAddress_Clear bit = 0,
    @ReplyToAddress nvarchar(255) = NULL,
    @ReplyToName_Clear bit = 0,
    @ReplyToName nvarchar(255) = NULL,
    @IsLinkTrackingAllowed_Clear bit = 0,
    @IsLinkTrackingAllowed nvarchar(255) = NULL,
    @LastChangedDate_Clear bit = 0,
    @LastChangedDate nvarchar(255) = NULL,
    @EventId_Clear bit = 0,
    @EventId nvarchar(255) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(400) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Id nvarchar(255) = NULL,
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
    [wild_apricot].[EmailDraft]
        (
            [Body],
                [Recipients],
                [CreatedDate],
                [Subject],
                [Modifier],
                [IsScheduled],
                [ScheduledDate],
                [Creator],
                [ReplyToAddress],
                [ReplyToName],
                [IsLinkTrackingAllowed],
                [LastChangedDate],
                [EventId],
                [Type],
                [Url],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Body_Clear = 1 THEN NULL ELSE ISNULL(@Body, NULL) END,
                CASE WHEN @Recipients_Clear = 1 THEN NULL ELSE ISNULL(@Recipients, NULL) END,
                CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, NULL) END,
                CASE WHEN @Subject_Clear = 1 THEN NULL ELSE ISNULL(@Subject, NULL) END,
                CASE WHEN @Modifier_Clear = 1 THEN NULL ELSE ISNULL(@Modifier, NULL) END,
                CASE WHEN @IsScheduled_Clear = 1 THEN NULL ELSE ISNULL(@IsScheduled, NULL) END,
                CASE WHEN @ScheduledDate_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledDate, NULL) END,
                CASE WHEN @Creator_Clear = 1 THEN NULL ELSE ISNULL(@Creator, NULL) END,
                CASE WHEN @ReplyToAddress_Clear = 1 THEN NULL ELSE ISNULL(@ReplyToAddress, NULL) END,
                CASE WHEN @ReplyToName_Clear = 1 THEN NULL ELSE ISNULL(@ReplyToName, NULL) END,
                CASE WHEN @IsLinkTrackingAllowed_Clear = 1 THEN NULL ELSE ISNULL(@IsLinkTrackingAllowed, NULL) END,
                CASE WHEN @LastChangedDate_Clear = 1 THEN NULL ELSE ISNULL(@LastChangedDate, NULL) END,
                CASE WHEN @EventId_Clear = 1 THEN NULL ELSE ISNULL(@EventId, NULL) END,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwEmailDrafts] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateEmailDraft] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Drafts */

GRANT EXECUTE ON [wild_apricot].[spCreateEmailDraft] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Drafts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Drafts
-- Item: spUpdateEmailDraft
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EmailDraft
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateEmailDraft]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateEmailDraft];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateEmailDraft]
    @Body_Clear bit = 0,
    @Body nvarchar(255) = NULL,
    @Recipients_Clear bit = 0,
    @Recipients nvarchar(MAX) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
    @Subject_Clear bit = 0,
    @Subject nvarchar(255) = NULL,
    @Modifier_Clear bit = 0,
    @Modifier nvarchar(MAX) = NULL,
    @IsScheduled_Clear bit = 0,
    @IsScheduled nvarchar(255) = NULL,
    @ScheduledDate_Clear bit = 0,
    @ScheduledDate nvarchar(255) = NULL,
    @Creator_Clear bit = 0,
    @Creator nvarchar(MAX) = NULL,
    @ReplyToAddress_Clear bit = 0,
    @ReplyToAddress nvarchar(255) = NULL,
    @ReplyToName_Clear bit = 0,
    @ReplyToName nvarchar(255) = NULL,
    @IsLinkTrackingAllowed_Clear bit = 0,
    @IsLinkTrackingAllowed nvarchar(255) = NULL,
    @LastChangedDate_Clear bit = 0,
    @LastChangedDate nvarchar(255) = NULL,
    @EventId_Clear bit = 0,
    @EventId nvarchar(255) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(400) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Id nvarchar(255),
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
        [wild_apricot].[EmailDraft]
    SET
        [Body] = CASE WHEN @Body_Clear = 1 THEN NULL ELSE ISNULL(@Body, [Body]) END,
        [Recipients] = CASE WHEN @Recipients_Clear = 1 THEN NULL ELSE ISNULL(@Recipients, [Recipients]) END,
        [CreatedDate] = CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, [CreatedDate]) END,
        [Subject] = CASE WHEN @Subject_Clear = 1 THEN NULL ELSE ISNULL(@Subject, [Subject]) END,
        [Modifier] = CASE WHEN @Modifier_Clear = 1 THEN NULL ELSE ISNULL(@Modifier, [Modifier]) END,
        [IsScheduled] = CASE WHEN @IsScheduled_Clear = 1 THEN NULL ELSE ISNULL(@IsScheduled, [IsScheduled]) END,
        [ScheduledDate] = CASE WHEN @ScheduledDate_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledDate, [ScheduledDate]) END,
        [Creator] = CASE WHEN @Creator_Clear = 1 THEN NULL ELSE ISNULL(@Creator, [Creator]) END,
        [ReplyToAddress] = CASE WHEN @ReplyToAddress_Clear = 1 THEN NULL ELSE ISNULL(@ReplyToAddress, [ReplyToAddress]) END,
        [ReplyToName] = CASE WHEN @ReplyToName_Clear = 1 THEN NULL ELSE ISNULL(@ReplyToName, [ReplyToName]) END,
        [IsLinkTrackingAllowed] = CASE WHEN @IsLinkTrackingAllowed_Clear = 1 THEN NULL ELSE ISNULL(@IsLinkTrackingAllowed, [IsLinkTrackingAllowed]) END,
        [LastChangedDate] = CASE WHEN @LastChangedDate_Clear = 1 THEN NULL ELSE ISNULL(@LastChangedDate, [LastChangedDate]) END,
        [EventId] = CASE WHEN @EventId_Clear = 1 THEN NULL ELSE ISNULL(@EventId, [EventId]) END,
        [Type] = CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, [Type]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwEmailDrafts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwEmailDrafts]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateEmailDraft] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EmailDraft table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateEmailDraft]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateEmailDraft];
GO
CREATE TRIGGER [wild_apricot].trgUpdateEmailDraft
ON [wild_apricot].[EmailDraft]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[EmailDraft]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[EmailDraft] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Email Drafts */

GRANT EXECUTE ON [wild_apricot].[spUpdateEmailDraft] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Email Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Logs
-- Item: vwEmailLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Logs
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  EmailLog
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwEmailLogs]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwEmailLogs];
GO

CREATE VIEW [wild_apricot].[vwEmailLogs]
AS
SELECT
    e.*
FROM
    [wild_apricot].[EmailLog] AS e
GO
GRANT SELECT ON [wild_apricot].[vwEmailLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Logs
-- Item: Permissions for vwEmailLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwEmailLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Logs
-- Item: spCreateEmailLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EmailLog
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateEmailLog]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateEmailLog];
GO

CREATE PROCEDURE [wild_apricot].[spCreateEmailLog]
    @Id nvarchar(255) = NULL,
    @EmailsIdentifiers_Clear bit = 0,
    @EmailsIdentifiers nvarchar(MAX) = NULL,
    @Emails_Clear bit = 0,
    @Emails nvarchar(255) = NULL,
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
    [wild_apricot].[EmailLog]
        (
            [EmailsIdentifiers],
                [Emails],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @EmailsIdentifiers_Clear = 1 THEN NULL ELSE ISNULL(@EmailsIdentifiers, NULL) END,
                CASE WHEN @Emails_Clear = 1 THEN NULL ELSE ISNULL(@Emails, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwEmailLogs] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateEmailLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Logs */

GRANT EXECUTE ON [wild_apricot].[spCreateEmailLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Logs
-- Item: spUpdateEmailLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EmailLog
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateEmailLog]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateEmailLog];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateEmailLog]
    @Id nvarchar(255),
    @EmailsIdentifiers_Clear bit = 0,
    @EmailsIdentifiers nvarchar(MAX) = NULL,
    @Emails_Clear bit = 0,
    @Emails nvarchar(255) = NULL,
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
        [wild_apricot].[EmailLog]
    SET
        [EmailsIdentifiers] = CASE WHEN @EmailsIdentifiers_Clear = 1 THEN NULL ELSE ISNULL(@EmailsIdentifiers, [EmailsIdentifiers]) END,
        [Emails] = CASE WHEN @Emails_Clear = 1 THEN NULL ELSE ISNULL(@Emails, [Emails]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwEmailLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwEmailLogs]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateEmailLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EmailLog table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateEmailLog]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateEmailLog];
GO
CREATE TRIGGER [wild_apricot].trgUpdateEmailLog
ON [wild_apricot].[EmailLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[EmailLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[EmailLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Email Logs */

GRANT EXECUTE ON [wild_apricot].[spUpdateEmailLog] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Entity Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Descriptions
-- Item: vwEntityFieldDescriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Entity Field Descriptions
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  EntityFieldDescription
-----               PRIMARY KEY: SystemCode
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwEntityFieldDescriptions]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwEntityFieldDescriptions];
GO

CREATE VIEW [wild_apricot].[vwEntityFieldDescriptions]
AS
SELECT
    e.*
FROM
    [wild_apricot].[EntityFieldDescription] AS e
GO
GRANT SELECT ON [wild_apricot].[vwEntityFieldDescriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Entity Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Descriptions
-- Item: Permissions for vwEntityFieldDescriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwEntityFieldDescriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Entity Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Descriptions
-- Item: spCreateEntityFieldDescription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldDescription
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateEntityFieldDescription]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateEntityFieldDescription];
GO

CREATE PROCEDURE [wild_apricot].[spCreateEntityFieldDescription]
    @SystemCode nvarchar(255) = NULL,
    @DisplayType_Clear bit = 0,
    @DisplayType nvarchar(255) = NULL,
    @FieldInstructions_Clear bit = 0,
    @FieldInstructions nvarchar(255) = NULL,
    @IsSystem_Clear bit = 0,
    @IsSystem nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Order_Clear bit = 0,
    @Order nvarchar(255) = NULL,
    @RulesAndTermsInfo_Clear bit = 0,
    @RulesAndTermsInfo nvarchar(MAX) = NULL,
    @AllowedValues_Clear bit = 0,
    @AllowedValues nvarchar(MAX) = NULL,
    @FieldName_Clear bit = 0,
    @FieldName nvarchar(255) = NULL,
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
    [wild_apricot].[EntityFieldDescription]
        (
            [DisplayType],
                [FieldInstructions],
                [IsSystem],
                [Description],
                [Order],
                [RulesAndTermsInfo],
                [AllowedValues],
                [FieldName],
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
                [SystemCode]
        )
    VALUES
        (
            CASE WHEN @DisplayType_Clear = 1 THEN NULL ELSE ISNULL(@DisplayType, NULL) END,
                CASE WHEN @FieldInstructions_Clear = 1 THEN NULL ELSE ISNULL(@FieldInstructions, NULL) END,
                CASE WHEN @IsSystem_Clear = 1 THEN NULL ELSE ISNULL(@IsSystem, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Order_Clear = 1 THEN NULL ELSE ISNULL(@Order, NULL) END,
                CASE WHEN @RulesAndTermsInfo_Clear = 1 THEN NULL ELSE ISNULL(@RulesAndTermsInfo, NULL) END,
                CASE WHEN @AllowedValues_Clear = 1 THEN NULL ELSE ISNULL(@AllowedValues, NULL) END,
                CASE WHEN @FieldName_Clear = 1 THEN NULL ELSE ISNULL(@FieldName, NULL) END,
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
                @SystemCode
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwEntityFieldDescriptions] WHERE [SystemCode] = @SystemCode
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateEntityFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Entity Field Descriptions */

GRANT EXECUTE ON [wild_apricot].[spCreateEntityFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Entity Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Descriptions
-- Item: spUpdateEntityFieldDescription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFieldDescription
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateEntityFieldDescription]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateEntityFieldDescription];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateEntityFieldDescription]
    @SystemCode nvarchar(255),
    @DisplayType_Clear bit = 0,
    @DisplayType nvarchar(255) = NULL,
    @FieldInstructions_Clear bit = 0,
    @FieldInstructions nvarchar(255) = NULL,
    @IsSystem_Clear bit = 0,
    @IsSystem nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Order_Clear bit = 0,
    @Order nvarchar(255) = NULL,
    @RulesAndTermsInfo_Clear bit = 0,
    @RulesAndTermsInfo nvarchar(MAX) = NULL,
    @AllowedValues_Clear bit = 0,
    @AllowedValues nvarchar(MAX) = NULL,
    @FieldName_Clear bit = 0,
    @FieldName nvarchar(255) = NULL,
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
        [wild_apricot].[EntityFieldDescription]
    SET
        [DisplayType] = CASE WHEN @DisplayType_Clear = 1 THEN NULL ELSE ISNULL(@DisplayType, [DisplayType]) END,
        [FieldInstructions] = CASE WHEN @FieldInstructions_Clear = 1 THEN NULL ELSE ISNULL(@FieldInstructions, [FieldInstructions]) END,
        [IsSystem] = CASE WHEN @IsSystem_Clear = 1 THEN NULL ELSE ISNULL(@IsSystem, [IsSystem]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Order] = CASE WHEN @Order_Clear = 1 THEN NULL ELSE ISNULL(@Order, [Order]) END,
        [RulesAndTermsInfo] = CASE WHEN @RulesAndTermsInfo_Clear = 1 THEN NULL ELSE ISNULL(@RulesAndTermsInfo, [RulesAndTermsInfo]) END,
        [AllowedValues] = CASE WHEN @AllowedValues_Clear = 1 THEN NULL ELSE ISNULL(@AllowedValues, [AllowedValues]) END,
        [FieldName] = CASE WHEN @FieldName_Clear = 1 THEN NULL ELSE ISNULL(@FieldName, [FieldName]) END,
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
        [SystemCode] = @SystemCode

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwEntityFieldDescriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwEntityFieldDescriptions]
                                    WHERE
                                        [SystemCode] = @SystemCode
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateEntityFieldDescription] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldDescription table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateEntityFieldDescription]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateEntityFieldDescription];
GO
CREATE TRIGGER [wild_apricot].trgUpdateEntityFieldDescription
ON [wild_apricot].[EntityFieldDescription]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[EntityFieldDescription]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[EntityFieldDescription] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[SystemCode] = I.[SystemCode];
END;
GO

/* spUpdate Permissions for Entity Field Descriptions */

GRANT EXECUTE ON [wild_apricot].[spUpdateEntityFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Field Descriptions
-- Item: spDeleteContactFieldDescription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactFieldDescription
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteContactFieldDescription]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteContactFieldDescription];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteContactFieldDescription]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[ContactFieldDescription]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteContactFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Field Descriptions */

GRANT EXECUTE ON [wild_apricot].[spDeleteContactFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spDeleteContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteContact]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteContact];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteContact]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Contact]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteContact] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contacts */

GRANT EXECUTE ON [wild_apricot].[spDeleteContact] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Drafts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Drafts
-- Item: spDeleteEmailDraft
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EmailDraft
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteEmailDraft]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteEmailDraft];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteEmailDraft]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[EmailDraft]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteEmailDraft] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Drafts */

GRANT EXECUTE ON [wild_apricot].[spDeleteEmailDraft] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Logs
-- Item: spDeleteEmailLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EmailLog
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteEmailLog]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteEmailLog];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteEmailLog]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[EmailLog]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteEmailLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Logs */

GRANT EXECUTE ON [wild_apricot].[spDeleteEmailLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Entity Field Descriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Field Descriptions
-- Item: spDeleteEntityFieldDescription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldDescription
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteEntityFieldDescription]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteEntityFieldDescription];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteEntityFieldDescription]
    @SystemCode nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[EntityFieldDescription]
    WHERE
        [SystemCode] = @SystemCode


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [SystemCode] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @SystemCode AS [SystemCode] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteEntityFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Entity Field Descriptions */

GRANT EXECUTE ON [wild_apricot].[spDeleteEntityFieldDescription] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for EventRegistrationType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventId in table EventRegistrationType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventRegistrationType_EventId' 
    AND object_id = OBJECT_ID('[wild_apricot].[EventRegistrationType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventRegistrationType_EventId ON [wild_apricot].[EventRegistrationType] ([EventId]);

/* Index for Foreign Keys for EventRegistration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Event */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Invoice */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for MembershipGroup */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Event Registration Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Types
-- Item: vwEventRegistrationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Registration Types
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  EventRegistrationType
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwEventRegistrationTypes]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwEventRegistrationTypes];
GO

CREATE VIEW [wild_apricot].[vwEventRegistrationTypes]
AS
SELECT
    e.*
FROM
    [wild_apricot].[EventRegistrationType] AS e
GO
GRANT SELECT ON [wild_apricot].[vwEventRegistrationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Event Registration Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Types
-- Item: Permissions for vwEventRegistrationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwEventRegistrationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Event Registration Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Types
-- Item: spCreateEventRegistrationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventRegistrationType
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateEventRegistrationType]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateEventRegistrationType];
GO

CREATE PROCEDURE [wild_apricot].[spCreateEventRegistrationType]
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @AvailableThrough_Clear bit = 0,
    @AvailableThrough nvarchar(255) = NULL,
    @CurrentRegistrantsCount_Clear bit = 0,
    @CurrentRegistrantsCount nvarchar(255) = NULL,
    @MaximumRegistrantsCount_Clear bit = 0,
    @MaximumRegistrantsCount nvarchar(255) = NULL,
    @CancellationBehaviour_Clear bit = 0,
    @CancellationBehaviour nvarchar(400) = NULL,
    @BasePrice_Clear bit = 0,
    @BasePrice nvarchar(255) = NULL,
    @UseTaxScopeSettings_Clear bit = 0,
    @UseTaxScopeSettings nvarchar(255) = NULL,
    @IsWaitlistEnabled_Clear bit = 0,
    @IsWaitlistEnabled nvarchar(255) = NULL,
    @GuestRegistrationPolicy_Clear bit = 0,
    @GuestRegistrationPolicy nvarchar(400) = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom nvarchar(255) = NULL,
    @CancellationDaysBeforeEvent_Clear bit = 0,
    @CancellationDaysBeforeEvent nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @GuestPrice_Clear bit = 0,
    @GuestPrice nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @RegistrationCode_Clear bit = 0,
    @RegistrationCode nvarchar(255) = NULL,
    @IsEnabled_Clear bit = 0,
    @IsEnabled nvarchar(255) = NULL,
    @EventId_Clear bit = 0,
    @EventId nvarchar(255) = NULL,
    @Availability_Clear bit = 0,
    @Availability nvarchar(400) = NULL,
    @IsGuestRegistrationRequired_Clear bit = 0,
    @IsGuestRegistrationRequired nvarchar(255) = NULL,
    @UnavailabilityPolicy_Clear bit = 0,
    @UnavailabilityPolicy nvarchar(400) = NULL,
    @AvailableForMembershipLevels_Clear bit = 0,
    @AvailableForMembershipLevels nvarchar(MAX) = NULL,
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
    [wild_apricot].[EventRegistrationType]
        (
            [Description],
                [AvailableThrough],
                [CurrentRegistrantsCount],
                [MaximumRegistrantsCount],
                [CancellationBehaviour],
                [BasePrice],
                [UseTaxScopeSettings],
                [IsWaitlistEnabled],
                [GuestRegistrationPolicy],
                [AvailableFrom],
                [CancellationDaysBeforeEvent],
                [Url],
                [GuestPrice],
                [Name],
                [RegistrationCode],
                [IsEnabled],
                [EventId],
                [Availability],
                [IsGuestRegistrationRequired],
                [UnavailabilityPolicy],
                [AvailableForMembershipLevels],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @AvailableThrough_Clear = 1 THEN NULL ELSE ISNULL(@AvailableThrough, NULL) END,
                CASE WHEN @CurrentRegistrantsCount_Clear = 1 THEN NULL ELSE ISNULL(@CurrentRegistrantsCount, NULL) END,
                CASE WHEN @MaximumRegistrantsCount_Clear = 1 THEN NULL ELSE ISNULL(@MaximumRegistrantsCount, NULL) END,
                CASE WHEN @CancellationBehaviour_Clear = 1 THEN NULL ELSE ISNULL(@CancellationBehaviour, NULL) END,
                CASE WHEN @BasePrice_Clear = 1 THEN NULL ELSE ISNULL(@BasePrice, NULL) END,
                CASE WHEN @UseTaxScopeSettings_Clear = 1 THEN NULL ELSE ISNULL(@UseTaxScopeSettings, NULL) END,
                CASE WHEN @IsWaitlistEnabled_Clear = 1 THEN NULL ELSE ISNULL(@IsWaitlistEnabled, NULL) END,
                CASE WHEN @GuestRegistrationPolicy_Clear = 1 THEN NULL ELSE ISNULL(@GuestRegistrationPolicy, NULL) END,
                CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, NULL) END,
                CASE WHEN @CancellationDaysBeforeEvent_Clear = 1 THEN NULL ELSE ISNULL(@CancellationDaysBeforeEvent, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @GuestPrice_Clear = 1 THEN NULL ELSE ISNULL(@GuestPrice, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @RegistrationCode_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCode, NULL) END,
                CASE WHEN @IsEnabled_Clear = 1 THEN NULL ELSE ISNULL(@IsEnabled, NULL) END,
                CASE WHEN @EventId_Clear = 1 THEN NULL ELSE ISNULL(@EventId, NULL) END,
                CASE WHEN @Availability_Clear = 1 THEN NULL ELSE ISNULL(@Availability, NULL) END,
                CASE WHEN @IsGuestRegistrationRequired_Clear = 1 THEN NULL ELSE ISNULL(@IsGuestRegistrationRequired, NULL) END,
                CASE WHEN @UnavailabilityPolicy_Clear = 1 THEN NULL ELSE ISNULL(@UnavailabilityPolicy, NULL) END,
                CASE WHEN @AvailableForMembershipLevels_Clear = 1 THEN NULL ELSE ISNULL(@AvailableForMembershipLevels, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwEventRegistrationTypes] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateEventRegistrationType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Event Registration Types */

GRANT EXECUTE ON [wild_apricot].[spCreateEventRegistrationType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Event Registration Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Types
-- Item: spUpdateEventRegistrationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventRegistrationType
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateEventRegistrationType]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateEventRegistrationType];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateEventRegistrationType]
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Id nvarchar(255),
    @AvailableThrough_Clear bit = 0,
    @AvailableThrough nvarchar(255) = NULL,
    @CurrentRegistrantsCount_Clear bit = 0,
    @CurrentRegistrantsCount nvarchar(255) = NULL,
    @MaximumRegistrantsCount_Clear bit = 0,
    @MaximumRegistrantsCount nvarchar(255) = NULL,
    @CancellationBehaviour_Clear bit = 0,
    @CancellationBehaviour nvarchar(400) = NULL,
    @BasePrice_Clear bit = 0,
    @BasePrice nvarchar(255) = NULL,
    @UseTaxScopeSettings_Clear bit = 0,
    @UseTaxScopeSettings nvarchar(255) = NULL,
    @IsWaitlistEnabled_Clear bit = 0,
    @IsWaitlistEnabled nvarchar(255) = NULL,
    @GuestRegistrationPolicy_Clear bit = 0,
    @GuestRegistrationPolicy nvarchar(400) = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom nvarchar(255) = NULL,
    @CancellationDaysBeforeEvent_Clear bit = 0,
    @CancellationDaysBeforeEvent nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @GuestPrice_Clear bit = 0,
    @GuestPrice nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @RegistrationCode_Clear bit = 0,
    @RegistrationCode nvarchar(255) = NULL,
    @IsEnabled_Clear bit = 0,
    @IsEnabled nvarchar(255) = NULL,
    @EventId_Clear bit = 0,
    @EventId nvarchar(255) = NULL,
    @Availability_Clear bit = 0,
    @Availability nvarchar(400) = NULL,
    @IsGuestRegistrationRequired_Clear bit = 0,
    @IsGuestRegistrationRequired nvarchar(255) = NULL,
    @UnavailabilityPolicy_Clear bit = 0,
    @UnavailabilityPolicy nvarchar(400) = NULL,
    @AvailableForMembershipLevels_Clear bit = 0,
    @AvailableForMembershipLevels nvarchar(MAX) = NULL,
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
        [wild_apricot].[EventRegistrationType]
    SET
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AvailableThrough] = CASE WHEN @AvailableThrough_Clear = 1 THEN NULL ELSE ISNULL(@AvailableThrough, [AvailableThrough]) END,
        [CurrentRegistrantsCount] = CASE WHEN @CurrentRegistrantsCount_Clear = 1 THEN NULL ELSE ISNULL(@CurrentRegistrantsCount, [CurrentRegistrantsCount]) END,
        [MaximumRegistrantsCount] = CASE WHEN @MaximumRegistrantsCount_Clear = 1 THEN NULL ELSE ISNULL(@MaximumRegistrantsCount, [MaximumRegistrantsCount]) END,
        [CancellationBehaviour] = CASE WHEN @CancellationBehaviour_Clear = 1 THEN NULL ELSE ISNULL(@CancellationBehaviour, [CancellationBehaviour]) END,
        [BasePrice] = CASE WHEN @BasePrice_Clear = 1 THEN NULL ELSE ISNULL(@BasePrice, [BasePrice]) END,
        [UseTaxScopeSettings] = CASE WHEN @UseTaxScopeSettings_Clear = 1 THEN NULL ELSE ISNULL(@UseTaxScopeSettings, [UseTaxScopeSettings]) END,
        [IsWaitlistEnabled] = CASE WHEN @IsWaitlistEnabled_Clear = 1 THEN NULL ELSE ISNULL(@IsWaitlistEnabled, [IsWaitlistEnabled]) END,
        [GuestRegistrationPolicy] = CASE WHEN @GuestRegistrationPolicy_Clear = 1 THEN NULL ELSE ISNULL(@GuestRegistrationPolicy, [GuestRegistrationPolicy]) END,
        [AvailableFrom] = CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, [AvailableFrom]) END,
        [CancellationDaysBeforeEvent] = CASE WHEN @CancellationDaysBeforeEvent_Clear = 1 THEN NULL ELSE ISNULL(@CancellationDaysBeforeEvent, [CancellationDaysBeforeEvent]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [GuestPrice] = CASE WHEN @GuestPrice_Clear = 1 THEN NULL ELSE ISNULL(@GuestPrice, [GuestPrice]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [RegistrationCode] = CASE WHEN @RegistrationCode_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCode, [RegistrationCode]) END,
        [IsEnabled] = CASE WHEN @IsEnabled_Clear = 1 THEN NULL ELSE ISNULL(@IsEnabled, [IsEnabled]) END,
        [EventId] = CASE WHEN @EventId_Clear = 1 THEN NULL ELSE ISNULL(@EventId, [EventId]) END,
        [Availability] = CASE WHEN @Availability_Clear = 1 THEN NULL ELSE ISNULL(@Availability, [Availability]) END,
        [IsGuestRegistrationRequired] = CASE WHEN @IsGuestRegistrationRequired_Clear = 1 THEN NULL ELSE ISNULL(@IsGuestRegistrationRequired, [IsGuestRegistrationRequired]) END,
        [UnavailabilityPolicy] = CASE WHEN @UnavailabilityPolicy_Clear = 1 THEN NULL ELSE ISNULL(@UnavailabilityPolicy, [UnavailabilityPolicy]) END,
        [AvailableForMembershipLevels] = CASE WHEN @AvailableForMembershipLevels_Clear = 1 THEN NULL ELSE ISNULL(@AvailableForMembershipLevels, [AvailableForMembershipLevels]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwEventRegistrationTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwEventRegistrationTypes]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateEventRegistrationType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventRegistrationType table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateEventRegistrationType]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateEventRegistrationType];
GO
CREATE TRIGGER [wild_apricot].trgUpdateEventRegistrationType
ON [wild_apricot].[EventRegistrationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[EventRegistrationType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[EventRegistrationType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Event Registration Types */

GRANT EXECUTE ON [wild_apricot].[spUpdateEventRegistrationType] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: vwEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Registrations
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  EventRegistration
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwEventRegistrations]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwEventRegistrations];
GO

CREATE VIEW [wild_apricot].[vwEventRegistrations]
AS
SELECT
    e.*
FROM
    [wild_apricot].[EventRegistration] AS e
GO
GRANT SELECT ON [wild_apricot].[vwEventRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: Permissions for vwEventRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwEventRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spCreateEventRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventRegistration
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateEventRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateEventRegistration];
GO

CREATE PROCEDURE [wild_apricot].[spCreateEventRegistration]
    @ShowToPublic_Clear bit = 0,
    @ShowToPublic nvarchar(255) = NULL,
    @IsPaid_Clear bit = 0,
    @IsPaid nvarchar(255) = NULL,
    @RegistrationDate_Clear bit = 0,
    @RegistrationDate nvarchar(255) = NULL,
    @OnWaitlist_Clear bit = 0,
    @OnWaitlist nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(MAX) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(400) = NULL,
    @Id nvarchar(255) = NULL,
    @RegistrationType_Clear bit = 0,
    @RegistrationType nvarchar(MAX) = NULL,
    @RegistrationFields_Clear bit = 0,
    @RegistrationFields nvarchar(MAX) = NULL,
    @RecreateInvoice_Clear bit = 0,
    @RecreateInvoice nvarchar(255) = NULL,
    @RegistrationTypeId_Clear bit = 0,
    @RegistrationTypeId nvarchar(255) = NULL,
    @PaidSum_Clear bit = 0,
    @PaidSum nvarchar(255) = NULL,
    @ParentRegistration_Clear bit = 0,
    @ParentRegistration nvarchar(MAX) = NULL,
    @Memo_Clear bit = 0,
    @Memo nvarchar(255) = NULL,
    @RegistrationFee_Clear bit = 0,
    @RegistrationFee nvarchar(255) = NULL,
    @GuestRegistrationsSummary_Clear bit = 0,
    @GuestRegistrationsSummary nvarchar(MAX) = NULL,
    @IsCheckedIn_Clear bit = 0,
    @IsCheckedIn nvarchar(255) = NULL,
    @Organization_Clear bit = 0,
    @Organization nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Event_Clear bit = 0,
    @Event nvarchar(MAX) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @IsGuestRegistration_Clear bit = 0,
    @IsGuestRegistration nvarchar(255) = NULL,
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
    [wild_apricot].[EventRegistration]
        (
            [ShowToPublic],
                [IsPaid],
                [RegistrationDate],
                [OnWaitlist],
                [Contact],
                [Status],
                [RegistrationType],
                [RegistrationFields],
                [RecreateInvoice],
                [RegistrationTypeId],
                [PaidSum],
                [ParentRegistration],
                [Memo],
                [RegistrationFee],
                [GuestRegistrationsSummary],
                [IsCheckedIn],
                [Organization],
                [Url],
                [Event],
                [DisplayName],
                [IsGuestRegistration],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @ShowToPublic_Clear = 1 THEN NULL ELSE ISNULL(@ShowToPublic, NULL) END,
                CASE WHEN @IsPaid_Clear = 1 THEN NULL ELSE ISNULL(@IsPaid, NULL) END,
                CASE WHEN @RegistrationDate_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationDate, NULL) END,
                CASE WHEN @OnWaitlist_Clear = 1 THEN NULL ELSE ISNULL(@OnWaitlist, NULL) END,
                CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, NULL) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @RegistrationType_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationType, NULL) END,
                CASE WHEN @RegistrationFields_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationFields, NULL) END,
                CASE WHEN @RecreateInvoice_Clear = 1 THEN NULL ELSE ISNULL(@RecreateInvoice, NULL) END,
                CASE WHEN @RegistrationTypeId_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationTypeId, NULL) END,
                CASE WHEN @PaidSum_Clear = 1 THEN NULL ELSE ISNULL(@PaidSum, NULL) END,
                CASE WHEN @ParentRegistration_Clear = 1 THEN NULL ELSE ISNULL(@ParentRegistration, NULL) END,
                CASE WHEN @Memo_Clear = 1 THEN NULL ELSE ISNULL(@Memo, NULL) END,
                CASE WHEN @RegistrationFee_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationFee, NULL) END,
                CASE WHEN @GuestRegistrationsSummary_Clear = 1 THEN NULL ELSE ISNULL(@GuestRegistrationsSummary, NULL) END,
                CASE WHEN @IsCheckedIn_Clear = 1 THEN NULL ELSE ISNULL(@IsCheckedIn, NULL) END,
                CASE WHEN @Organization_Clear = 1 THEN NULL ELSE ISNULL(@Organization, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @Event_Clear = 1 THEN NULL ELSE ISNULL(@Event, NULL) END,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @IsGuestRegistration_Clear = 1 THEN NULL ELSE ISNULL(@IsGuestRegistration, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwEventRegistrations] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateEventRegistration] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Event Registrations */

GRANT EXECUTE ON [wild_apricot].[spCreateEventRegistration] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spUpdateEventRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventRegistration
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateEventRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateEventRegistration];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateEventRegistration]
    @ShowToPublic_Clear bit = 0,
    @ShowToPublic nvarchar(255) = NULL,
    @IsPaid_Clear bit = 0,
    @IsPaid nvarchar(255) = NULL,
    @RegistrationDate_Clear bit = 0,
    @RegistrationDate nvarchar(255) = NULL,
    @OnWaitlist_Clear bit = 0,
    @OnWaitlist nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(MAX) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(400) = NULL,
    @Id nvarchar(255),
    @RegistrationType_Clear bit = 0,
    @RegistrationType nvarchar(MAX) = NULL,
    @RegistrationFields_Clear bit = 0,
    @RegistrationFields nvarchar(MAX) = NULL,
    @RecreateInvoice_Clear bit = 0,
    @RecreateInvoice nvarchar(255) = NULL,
    @RegistrationTypeId_Clear bit = 0,
    @RegistrationTypeId nvarchar(255) = NULL,
    @PaidSum_Clear bit = 0,
    @PaidSum nvarchar(255) = NULL,
    @ParentRegistration_Clear bit = 0,
    @ParentRegistration nvarchar(MAX) = NULL,
    @Memo_Clear bit = 0,
    @Memo nvarchar(255) = NULL,
    @RegistrationFee_Clear bit = 0,
    @RegistrationFee nvarchar(255) = NULL,
    @GuestRegistrationsSummary_Clear bit = 0,
    @GuestRegistrationsSummary nvarchar(MAX) = NULL,
    @IsCheckedIn_Clear bit = 0,
    @IsCheckedIn nvarchar(255) = NULL,
    @Organization_Clear bit = 0,
    @Organization nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Event_Clear bit = 0,
    @Event nvarchar(MAX) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @IsGuestRegistration_Clear bit = 0,
    @IsGuestRegistration nvarchar(255) = NULL,
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
        [wild_apricot].[EventRegistration]
    SET
        [ShowToPublic] = CASE WHEN @ShowToPublic_Clear = 1 THEN NULL ELSE ISNULL(@ShowToPublic, [ShowToPublic]) END,
        [IsPaid] = CASE WHEN @IsPaid_Clear = 1 THEN NULL ELSE ISNULL(@IsPaid, [IsPaid]) END,
        [RegistrationDate] = CASE WHEN @RegistrationDate_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationDate, [RegistrationDate]) END,
        [OnWaitlist] = CASE WHEN @OnWaitlist_Clear = 1 THEN NULL ELSE ISNULL(@OnWaitlist, [OnWaitlist]) END,
        [Contact] = CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, [Contact]) END,
        [Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END,
        [RegistrationType] = CASE WHEN @RegistrationType_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationType, [RegistrationType]) END,
        [RegistrationFields] = CASE WHEN @RegistrationFields_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationFields, [RegistrationFields]) END,
        [RecreateInvoice] = CASE WHEN @RecreateInvoice_Clear = 1 THEN NULL ELSE ISNULL(@RecreateInvoice, [RecreateInvoice]) END,
        [RegistrationTypeId] = CASE WHEN @RegistrationTypeId_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationTypeId, [RegistrationTypeId]) END,
        [PaidSum] = CASE WHEN @PaidSum_Clear = 1 THEN NULL ELSE ISNULL(@PaidSum, [PaidSum]) END,
        [ParentRegistration] = CASE WHEN @ParentRegistration_Clear = 1 THEN NULL ELSE ISNULL(@ParentRegistration, [ParentRegistration]) END,
        [Memo] = CASE WHEN @Memo_Clear = 1 THEN NULL ELSE ISNULL(@Memo, [Memo]) END,
        [RegistrationFee] = CASE WHEN @RegistrationFee_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationFee, [RegistrationFee]) END,
        [GuestRegistrationsSummary] = CASE WHEN @GuestRegistrationsSummary_Clear = 1 THEN NULL ELSE ISNULL(@GuestRegistrationsSummary, [GuestRegistrationsSummary]) END,
        [IsCheckedIn] = CASE WHEN @IsCheckedIn_Clear = 1 THEN NULL ELSE ISNULL(@IsCheckedIn, [IsCheckedIn]) END,
        [Organization] = CASE WHEN @Organization_Clear = 1 THEN NULL ELSE ISNULL(@Organization, [Organization]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [Event] = CASE WHEN @Event_Clear = 1 THEN NULL ELSE ISNULL(@Event, [Event]) END,
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [IsGuestRegistration] = CASE WHEN @IsGuestRegistration_Clear = 1 THEN NULL ELSE ISNULL(@IsGuestRegistration, [IsGuestRegistration]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwEventRegistrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwEventRegistrations]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateEventRegistration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventRegistration table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateEventRegistration]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateEventRegistration];
GO
CREATE TRIGGER [wild_apricot].trgUpdateEventRegistration
ON [wild_apricot].[EventRegistration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[EventRegistration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[EventRegistration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Event Registrations */

GRANT EXECUTE ON [wild_apricot].[spUpdateEventRegistration] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Events
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Event
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwEvents]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwEvents];
GO

CREATE VIEW [wild_apricot].[vwEvents]
AS
SELECT
    e.*
FROM
    [wild_apricot].[Event] AS e
GO
GRANT SELECT ON [wild_apricot].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Permissions for vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spCreateEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateEvent];
GO

CREATE PROCEDURE [wild_apricot].[spCreateEvent]
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @EndTimeSpecified_Clear bit = 0,
    @EndTimeSpecified nvarchar(255) = NULL,
    @InviteeStat_Clear bit = 0,
    @InviteeStat nvarchar(MAX) = NULL,
    @CheckedInAttendeesNumber_Clear bit = 0,
    @CheckedInAttendeesNumber nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Location_Clear bit = 0,
    @Location nvarchar(255) = NULL,
    @EndDate_Clear bit = 0,
    @EndDate nvarchar(255) = NULL,
    @HasEnabledRegistrationTypes_Clear bit = 0,
    @HasEnabledRegistrationTypes nvarchar(255) = NULL,
    @ConfirmedRegistrationsCount_Clear bit = 0,
    @ConfirmedRegistrationsCount nvarchar(255) = NULL,
    @RegistrationsLimit_Clear bit = 0,
    @RegistrationsLimit nvarchar(255) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @PendingRegistrationsCount_Clear bit = 0,
    @PendingRegistrationsCount nvarchar(255) = NULL,
    @AccessLevel_Clear bit = 0,
    @AccessLevel nvarchar(400) = NULL,
    @Sessions_Clear bit = 0,
    @Sessions nvarchar(MAX) = NULL,
    @Tags_Clear bit = 0,
    @Tags nvarchar(MAX) = NULL,
    @Id nvarchar(255) = NULL,
    @StartTimeSpecified_Clear bit = 0,
    @StartTimeSpecified nvarchar(255) = NULL,
    @StartDate_Clear bit = 0,
    @StartDate nvarchar(255) = NULL,
    @EventType_Clear bit = 0,
    @EventType nvarchar(255) = NULL,
    @RegistrationEnabled_Clear bit = 0,
    @RegistrationEnabled nvarchar(255) = NULL,
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
    [wild_apricot].[Event]
        (
            [Name],
                [EndTimeSpecified],
                [InviteeStat],
                [CheckedInAttendeesNumber],
                [Url],
                [Location],
                [EndDate],
                [HasEnabledRegistrationTypes],
                [ConfirmedRegistrationsCount],
                [RegistrationsLimit],
                [Details],
                [PendingRegistrationsCount],
                [AccessLevel],
                [Sessions],
                [Tags],
                [StartTimeSpecified],
                [StartDate],
                [EventType],
                [RegistrationEnabled],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @EndTimeSpecified_Clear = 1 THEN NULL ELSE ISNULL(@EndTimeSpecified, NULL) END,
                CASE WHEN @InviteeStat_Clear = 1 THEN NULL ELSE ISNULL(@InviteeStat, NULL) END,
                CASE WHEN @CheckedInAttendeesNumber_Clear = 1 THEN NULL ELSE ISNULL(@CheckedInAttendeesNumber, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @Location_Clear = 1 THEN NULL ELSE ISNULL(@Location, NULL) END,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                CASE WHEN @HasEnabledRegistrationTypes_Clear = 1 THEN NULL ELSE ISNULL(@HasEnabledRegistrationTypes, NULL) END,
                CASE WHEN @ConfirmedRegistrationsCount_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedRegistrationsCount, NULL) END,
                CASE WHEN @RegistrationsLimit_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationsLimit, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @PendingRegistrationsCount_Clear = 1 THEN NULL ELSE ISNULL(@PendingRegistrationsCount, NULL) END,
                CASE WHEN @AccessLevel_Clear = 1 THEN NULL ELSE ISNULL(@AccessLevel, NULL) END,
                CASE WHEN @Sessions_Clear = 1 THEN NULL ELSE ISNULL(@Sessions, NULL) END,
                CASE WHEN @Tags_Clear = 1 THEN NULL ELSE ISNULL(@Tags, NULL) END,
                CASE WHEN @StartTimeSpecified_Clear = 1 THEN NULL ELSE ISNULL(@StartTimeSpecified, NULL) END,
                CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, NULL) END,
                CASE WHEN @EventType_Clear = 1 THEN NULL ELSE ISNULL(@EventType, NULL) END,
                CASE WHEN @RegistrationEnabled_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationEnabled, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwEvents] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateEvent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Events */

GRANT EXECUTE ON [wild_apricot].[spCreateEvent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spUpdateEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateEvent];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateEvent]
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @EndTimeSpecified_Clear bit = 0,
    @EndTimeSpecified nvarchar(255) = NULL,
    @InviteeStat_Clear bit = 0,
    @InviteeStat nvarchar(MAX) = NULL,
    @CheckedInAttendeesNumber_Clear bit = 0,
    @CheckedInAttendeesNumber nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @Location_Clear bit = 0,
    @Location nvarchar(255) = NULL,
    @EndDate_Clear bit = 0,
    @EndDate nvarchar(255) = NULL,
    @HasEnabledRegistrationTypes_Clear bit = 0,
    @HasEnabledRegistrationTypes nvarchar(255) = NULL,
    @ConfirmedRegistrationsCount_Clear bit = 0,
    @ConfirmedRegistrationsCount nvarchar(255) = NULL,
    @RegistrationsLimit_Clear bit = 0,
    @RegistrationsLimit nvarchar(255) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @PendingRegistrationsCount_Clear bit = 0,
    @PendingRegistrationsCount nvarchar(255) = NULL,
    @AccessLevel_Clear bit = 0,
    @AccessLevel nvarchar(400) = NULL,
    @Sessions_Clear bit = 0,
    @Sessions nvarchar(MAX) = NULL,
    @Tags_Clear bit = 0,
    @Tags nvarchar(MAX) = NULL,
    @Id nvarchar(255),
    @StartTimeSpecified_Clear bit = 0,
    @StartTimeSpecified nvarchar(255) = NULL,
    @StartDate_Clear bit = 0,
    @StartDate nvarchar(255) = NULL,
    @EventType_Clear bit = 0,
    @EventType nvarchar(255) = NULL,
    @RegistrationEnabled_Clear bit = 0,
    @RegistrationEnabled nvarchar(255) = NULL,
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
        [wild_apricot].[Event]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [EndTimeSpecified] = CASE WHEN @EndTimeSpecified_Clear = 1 THEN NULL ELSE ISNULL(@EndTimeSpecified, [EndTimeSpecified]) END,
        [InviteeStat] = CASE WHEN @InviteeStat_Clear = 1 THEN NULL ELSE ISNULL(@InviteeStat, [InviteeStat]) END,
        [CheckedInAttendeesNumber] = CASE WHEN @CheckedInAttendeesNumber_Clear = 1 THEN NULL ELSE ISNULL(@CheckedInAttendeesNumber, [CheckedInAttendeesNumber]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [Location] = CASE WHEN @Location_Clear = 1 THEN NULL ELSE ISNULL(@Location, [Location]) END,
        [EndDate] = CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, [EndDate]) END,
        [HasEnabledRegistrationTypes] = CASE WHEN @HasEnabledRegistrationTypes_Clear = 1 THEN NULL ELSE ISNULL(@HasEnabledRegistrationTypes, [HasEnabledRegistrationTypes]) END,
        [ConfirmedRegistrationsCount] = CASE WHEN @ConfirmedRegistrationsCount_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedRegistrationsCount, [ConfirmedRegistrationsCount]) END,
        [RegistrationsLimit] = CASE WHEN @RegistrationsLimit_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationsLimit, [RegistrationsLimit]) END,
        [Details] = CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, [Details]) END,
        [PendingRegistrationsCount] = CASE WHEN @PendingRegistrationsCount_Clear = 1 THEN NULL ELSE ISNULL(@PendingRegistrationsCount, [PendingRegistrationsCount]) END,
        [AccessLevel] = CASE WHEN @AccessLevel_Clear = 1 THEN NULL ELSE ISNULL(@AccessLevel, [AccessLevel]) END,
        [Sessions] = CASE WHEN @Sessions_Clear = 1 THEN NULL ELSE ISNULL(@Sessions, [Sessions]) END,
        [Tags] = CASE WHEN @Tags_Clear = 1 THEN NULL ELSE ISNULL(@Tags, [Tags]) END,
        [StartTimeSpecified] = CASE WHEN @StartTimeSpecified_Clear = 1 THEN NULL ELSE ISNULL(@StartTimeSpecified, [StartTimeSpecified]) END,
        [StartDate] = CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, [StartDate]) END,
        [EventType] = CASE WHEN @EventType_Clear = 1 THEN NULL ELSE ISNULL(@EventType, [EventType]) END,
        [RegistrationEnabled] = CASE WHEN @RegistrationEnabled_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationEnabled, [RegistrationEnabled]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwEvents]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Event table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateEvent];
GO
CREATE TRIGGER [wild_apricot].trgUpdateEvent
ON [wild_apricot].[Event]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Event]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Event] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Events */

GRANT EXECUTE ON [wild_apricot].[spUpdateEvent] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: vwInvoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Invoices
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Invoice
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwInvoices]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwInvoices];
GO

CREATE VIEW [wild_apricot].[vwInvoices]
AS
SELECT
    i.*
FROM
    [wild_apricot].[Invoice] AS i
GO
GRANT SELECT ON [wild_apricot].[vwInvoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: Permissions for vwInvoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwInvoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: spCreateInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Invoice
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateInvoice];
GO

CREATE PROCEDURE [wild_apricot].[spCreateInvoice]
    @Memo_Clear bit = 0,
    @Memo nvarchar(255) = NULL,
    @OrderDetails_Clear bit = 0,
    @OrderDetails nvarchar(MAX) = NULL,
    @OrderType_Clear bit = 0,
    @OrderType nvarchar(400) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @PaidAmount_Clear bit = 0,
    @PaidAmount nvarchar(255) = NULL,
    @DocumentDate_Clear bit = 0,
    @DocumentDate nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @DocumentNumber_Clear bit = 0,
    @DocumentNumber nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
    @PublicMemo_Clear bit = 0,
    @PublicMemo nvarchar(255) = NULL,
    @UpdatedDate_Clear bit = 0,
    @UpdatedDate nvarchar(255) = NULL,
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @IsPaid_Clear bit = 0,
    @IsPaid nvarchar(255) = NULL,
    @EventRegistration_Clear bit = 0,
    @EventRegistration nvarchar(255) = NULL,
    @VoidedDate_Clear bit = 0,
    @VoidedDate nvarchar(255) = NULL,
    @UpdatedBy_Clear bit = 0,
    @UpdatedBy nvarchar(255) = NULL,
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
    [wild_apricot].[Invoice]
        (
            [Memo],
                [OrderDetails],
                [OrderType],
                [Value],
                [PaidAmount],
                [DocumentDate],
                [Contact],
                [DocumentNumber],
                [Url],
                [CreatedDate],
                [PublicMemo],
                [UpdatedDate],
                [CreatedBy],
                [IsPaid],
                [EventRegistration],
                [VoidedDate],
                [UpdatedBy],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Memo_Clear = 1 THEN NULL ELSE ISNULL(@Memo, NULL) END,
                CASE WHEN @OrderDetails_Clear = 1 THEN NULL ELSE ISNULL(@OrderDetails, NULL) END,
                CASE WHEN @OrderType_Clear = 1 THEN NULL ELSE ISNULL(@OrderType, NULL) END,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @PaidAmount_Clear = 1 THEN NULL ELSE ISNULL(@PaidAmount, NULL) END,
                CASE WHEN @DocumentDate_Clear = 1 THEN NULL ELSE ISNULL(@DocumentDate, NULL) END,
                CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, NULL) END,
                CASE WHEN @DocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@DocumentNumber, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, NULL) END,
                CASE WHEN @PublicMemo_Clear = 1 THEN NULL ELSE ISNULL(@PublicMemo, NULL) END,
                CASE WHEN @UpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedDate, NULL) END,
                CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, NULL) END,
                CASE WHEN @IsPaid_Clear = 1 THEN NULL ELSE ISNULL(@IsPaid, NULL) END,
                CASE WHEN @EventRegistration_Clear = 1 THEN NULL ELSE ISNULL(@EventRegistration, NULL) END,
                CASE WHEN @VoidedDate_Clear = 1 THEN NULL ELSE ISNULL(@VoidedDate, NULL) END,
                CASE WHEN @UpdatedBy_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedBy, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwInvoices] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateInvoice] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Invoices */

GRANT EXECUTE ON [wild_apricot].[spCreateInvoice] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: spUpdateInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Invoice
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateInvoice];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateInvoice]
    @Memo_Clear bit = 0,
    @Memo nvarchar(255) = NULL,
    @OrderDetails_Clear bit = 0,
    @OrderDetails nvarchar(MAX) = NULL,
    @OrderType_Clear bit = 0,
    @OrderType nvarchar(400) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @PaidAmount_Clear bit = 0,
    @PaidAmount nvarchar(255) = NULL,
    @DocumentDate_Clear bit = 0,
    @DocumentDate nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
    @Id nvarchar(255),
    @DocumentNumber_Clear bit = 0,
    @DocumentNumber nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
    @PublicMemo_Clear bit = 0,
    @PublicMemo nvarchar(255) = NULL,
    @UpdatedDate_Clear bit = 0,
    @UpdatedDate nvarchar(255) = NULL,
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @IsPaid_Clear bit = 0,
    @IsPaid nvarchar(255) = NULL,
    @EventRegistration_Clear bit = 0,
    @EventRegistration nvarchar(255) = NULL,
    @VoidedDate_Clear bit = 0,
    @VoidedDate nvarchar(255) = NULL,
    @UpdatedBy_Clear bit = 0,
    @UpdatedBy nvarchar(255) = NULL,
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
        [wild_apricot].[Invoice]
    SET
        [Memo] = CASE WHEN @Memo_Clear = 1 THEN NULL ELSE ISNULL(@Memo, [Memo]) END,
        [OrderDetails] = CASE WHEN @OrderDetails_Clear = 1 THEN NULL ELSE ISNULL(@OrderDetails, [OrderDetails]) END,
        [OrderType] = CASE WHEN @OrderType_Clear = 1 THEN NULL ELSE ISNULL(@OrderType, [OrderType]) END,
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [PaidAmount] = CASE WHEN @PaidAmount_Clear = 1 THEN NULL ELSE ISNULL(@PaidAmount, [PaidAmount]) END,
        [DocumentDate] = CASE WHEN @DocumentDate_Clear = 1 THEN NULL ELSE ISNULL(@DocumentDate, [DocumentDate]) END,
        [Contact] = CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, [Contact]) END,
        [DocumentNumber] = CASE WHEN @DocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@DocumentNumber, [DocumentNumber]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [CreatedDate] = CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, [CreatedDate]) END,
        [PublicMemo] = CASE WHEN @PublicMemo_Clear = 1 THEN NULL ELSE ISNULL(@PublicMemo, [PublicMemo]) END,
        [UpdatedDate] = CASE WHEN @UpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedDate, [UpdatedDate]) END,
        [CreatedBy] = CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, [CreatedBy]) END,
        [IsPaid] = CASE WHEN @IsPaid_Clear = 1 THEN NULL ELSE ISNULL(@IsPaid, [IsPaid]) END,
        [EventRegistration] = CASE WHEN @EventRegistration_Clear = 1 THEN NULL ELSE ISNULL(@EventRegistration, [EventRegistration]) END,
        [VoidedDate] = CASE WHEN @VoidedDate_Clear = 1 THEN NULL ELSE ISNULL(@VoidedDate, [VoidedDate]) END,
        [UpdatedBy] = CASE WHEN @UpdatedBy_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedBy, [UpdatedBy]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwInvoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwInvoices]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateInvoice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Invoice table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateInvoice]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateInvoice];
GO
CREATE TRIGGER [wild_apricot].trgUpdateInvoice
ON [wild_apricot].[Invoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Invoice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Invoice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Invoices */

GRANT EXECUTE ON [wild_apricot].[spUpdateInvoice] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Membership Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Groups
-- Item: vwMembershipGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Membership Groups
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  MembershipGroup
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwMembershipGroups]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwMembershipGroups];
GO

CREATE VIEW [wild_apricot].[vwMembershipGroups]
AS
SELECT
    m.*
FROM
    [wild_apricot].[MembershipGroup] AS m
GO
GRANT SELECT ON [wild_apricot].[vwMembershipGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Membership Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Groups
-- Item: Permissions for vwMembershipGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwMembershipGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Membership Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Groups
-- Item: spCreateMembershipGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MembershipGroup
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateMembershipGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateMembershipGroup];
GO

CREATE PROCEDURE [wild_apricot].[spCreateMembershipGroup]
    @Id nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContactsCount_Clear bit = 0,
    @ContactsCount nvarchar(255) = NULL,
    @ContactIds_Clear bit = 0,
    @ContactIds nvarchar(MAX) = NULL,
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
    [wild_apricot].[MembershipGroup]
        (
            [Description],
                [Name],
                [ContactsCount],
                [ContactIds],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @ContactsCount_Clear = 1 THEN NULL ELSE ISNULL(@ContactsCount, NULL) END,
                CASE WHEN @ContactIds_Clear = 1 THEN NULL ELSE ISNULL(@ContactIds, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwMembershipGroups] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateMembershipGroup] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Membership Groups */

GRANT EXECUTE ON [wild_apricot].[spCreateMembershipGroup] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Membership Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Groups
-- Item: spUpdateMembershipGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MembershipGroup
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateMembershipGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateMembershipGroup];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateMembershipGroup]
    @Id nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContactsCount_Clear bit = 0,
    @ContactsCount nvarchar(255) = NULL,
    @ContactIds_Clear bit = 0,
    @ContactIds nvarchar(MAX) = NULL,
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
        [wild_apricot].[MembershipGroup]
    SET
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [ContactsCount] = CASE WHEN @ContactsCount_Clear = 1 THEN NULL ELSE ISNULL(@ContactsCount, [ContactsCount]) END,
        [ContactIds] = CASE WHEN @ContactIds_Clear = 1 THEN NULL ELSE ISNULL(@ContactIds, [ContactIds]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwMembershipGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwMembershipGroups]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateMembershipGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MembershipGroup table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateMembershipGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateMembershipGroup];
GO
CREATE TRIGGER [wild_apricot].trgUpdateMembershipGroup
ON [wild_apricot].[MembershipGroup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[MembershipGroup]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[MembershipGroup] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Membership Groups */

GRANT EXECUTE ON [wild_apricot].[spUpdateMembershipGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Event Registration Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registration Types
-- Item: spDeleteEventRegistrationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventRegistrationType
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteEventRegistrationType]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteEventRegistrationType];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteEventRegistrationType]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[EventRegistrationType]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteEventRegistrationType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Event Registration Types */

GRANT EXECUTE ON [wild_apricot].[spDeleteEventRegistrationType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Event Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Registrations
-- Item: spDeleteEventRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventRegistration
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteEventRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteEventRegistration];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteEventRegistration]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[EventRegistration]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteEventRegistration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Event Registrations */

GRANT EXECUTE ON [wild_apricot].[spDeleteEventRegistration] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spDeleteEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteEvent];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteEvent]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Event]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Events */

GRANT EXECUTE ON [wild_apricot].[spDeleteEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: spDeleteInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Invoice
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteInvoice];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteInvoice]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Invoice]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteInvoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Invoices */

GRANT EXECUTE ON [wild_apricot].[spDeleteInvoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Membership Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Groups
-- Item: spDeleteMembershipGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MembershipGroup
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteMembershipGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteMembershipGroup];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteMembershipGroup]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[MembershipGroup]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteMembershipGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Membership Groups */

GRANT EXECUTE ON [wild_apricot].[spDeleteMembershipGroup] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MembershipLevel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Levels
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Membership Levels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Levels
-- Item: vwMembershipLevels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Membership Levels
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  MembershipLevel
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwMembershipLevels]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwMembershipLevels];
GO

CREATE VIEW [wild_apricot].[vwMembershipLevels]
AS
SELECT
    m.*
FROM
    [wild_apricot].[MembershipLevel] AS m
GO
GRANT SELECT ON [wild_apricot].[vwMembershipLevels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Membership Levels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Levels
-- Item: Permissions for vwMembershipLevels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwMembershipLevels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Membership Levels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Levels
-- Item: spCreateMembershipLevel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MembershipLevel
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateMembershipLevel]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateMembershipLevel];
GO

CREATE PROCEDURE [wild_apricot].[spCreateMembershipLevel]
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @BundleMembersLimit_Clear bit = 0,
    @BundleMembersLimit nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @PublicCanApply_Clear bit = 0,
    @PublicCanApply nvarchar(255) = NULL,
    @MembershipFee_Clear bit = 0,
    @MembershipFee nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @MemberCanChangeToLevels_Clear bit = 0,
    @MemberCanChangeToLevels nvarchar(MAX) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(255) = NULL,
    @RenewalPeriod_Clear bit = 0,
    @RenewalPeriod nvarchar(MAX) = NULL,
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
    [wild_apricot].[MembershipLevel]
        (
            [Description],
                [BundleMembersLimit],
                [PublicCanApply],
                [MembershipFee],
                [Name],
                [MemberCanChangeToLevels],
                [Type],
                [RenewalPeriod],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @BundleMembersLimit_Clear = 1 THEN NULL ELSE ISNULL(@BundleMembersLimit, NULL) END,
                CASE WHEN @PublicCanApply_Clear = 1 THEN NULL ELSE ISNULL(@PublicCanApply, NULL) END,
                CASE WHEN @MembershipFee_Clear = 1 THEN NULL ELSE ISNULL(@MembershipFee, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @MemberCanChangeToLevels_Clear = 1 THEN NULL ELSE ISNULL(@MemberCanChangeToLevels, NULL) END,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, NULL) END,
                CASE WHEN @RenewalPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RenewalPeriod, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwMembershipLevels] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateMembershipLevel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Membership Levels */

GRANT EXECUTE ON [wild_apricot].[spCreateMembershipLevel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Membership Levels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Levels
-- Item: spUpdateMembershipLevel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MembershipLevel
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateMembershipLevel]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateMembershipLevel];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateMembershipLevel]
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @BundleMembersLimit_Clear bit = 0,
    @BundleMembersLimit nvarchar(255) = NULL,
    @Id nvarchar(255),
    @PublicCanApply_Clear bit = 0,
    @PublicCanApply nvarchar(255) = NULL,
    @MembershipFee_Clear bit = 0,
    @MembershipFee nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @MemberCanChangeToLevels_Clear bit = 0,
    @MemberCanChangeToLevels nvarchar(MAX) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(255) = NULL,
    @RenewalPeriod_Clear bit = 0,
    @RenewalPeriod nvarchar(MAX) = NULL,
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
        [wild_apricot].[MembershipLevel]
    SET
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [BundleMembersLimit] = CASE WHEN @BundleMembersLimit_Clear = 1 THEN NULL ELSE ISNULL(@BundleMembersLimit, [BundleMembersLimit]) END,
        [PublicCanApply] = CASE WHEN @PublicCanApply_Clear = 1 THEN NULL ELSE ISNULL(@PublicCanApply, [PublicCanApply]) END,
        [MembershipFee] = CASE WHEN @MembershipFee_Clear = 1 THEN NULL ELSE ISNULL(@MembershipFee, [MembershipFee]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [MemberCanChangeToLevels] = CASE WHEN @MemberCanChangeToLevels_Clear = 1 THEN NULL ELSE ISNULL(@MemberCanChangeToLevels, [MemberCanChangeToLevels]) END,
        [Type] = CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, [Type]) END,
        [RenewalPeriod] = CASE WHEN @RenewalPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RenewalPeriod, [RenewalPeriod]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwMembershipLevels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwMembershipLevels]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateMembershipLevel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MembershipLevel table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateMembershipLevel]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateMembershipLevel];
GO
CREATE TRIGGER [wild_apricot].trgUpdateMembershipLevel
ON [wild_apricot].[MembershipLevel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[MembershipLevel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[MembershipLevel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Membership Levels */

GRANT EXECUTE ON [wild_apricot].[spUpdateMembershipLevel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Membership Levels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Membership Levels
-- Item: spDeleteMembershipLevel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MembershipLevel
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteMembershipLevel]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteMembershipLevel];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteMembershipLevel]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[MembershipLevel]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteMembershipLevel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Membership Levels */

GRANT EXECUTE ON [wild_apricot].[spDeleteMembershipLevel] TO [cdp_Developer], [cdp_Integration];

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

/* Index for Foreign Keys for Order */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Orders
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Order
-----               PRIMARY KEY: number
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwOrders]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwOrders];
GO

CREATE VIEW [wild_apricot].[vwOrders]
AS
SELECT
    o.*
FROM
    [wild_apricot].[Order] AS o
GO
GRANT SELECT ON [wild_apricot].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Permissions for vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spCreateOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Order
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateOrder];
GO

CREATE PROCEDURE [wild_apricot].[spCreateOrder]
    @isTaxesApplied_Clear bit = 0,
    @isTaxesApplied nvarchar(255) = NULL,
    @deliveryOption_Clear bit = 0,
    @deliveryOption nvarchar(MAX) = NULL,
    @contactId_Clear bit = 0,
    @contactId nvarchar(255) = NULL,
    @subTotal_Clear bit = 0,
    @subTotal nvarchar(255) = NULL,
    @isTaxesIncludedTotal_Clear bit = 0,
    @isTaxesIncludedTotal nvarchar(255) = NULL,
    @invoiceId_Clear bit = 0,
    @invoiceId nvarchar(255) = NULL,
    @externalNote_Clear bit = 0,
    @externalNote nvarchar(MAX) = NULL,
    @products_Clear bit = 0,
    @products nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(400) = NULL,
    @total_Clear bit = 0,
    @total nvarchar(255) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(255) = NULL,
    @internalNote_Clear bit = 0,
    @internalNote nvarchar(MAX) = NULL,
    @billingPerson_Clear bit = 0,
    @billingPerson nvarchar(MAX) = NULL,
    @comment_Clear bit = 0,
    @comment nvarchar(255) = NULL,
    @shippingAddress_Clear bit = 0,
    @shippingAddress nvarchar(MAX) = NULL,
    @created_Clear bit = 0,
    @created nvarchar(255) = NULL,
    @paymentStatus_Clear bit = 0,
    @paymentStatus nvarchar(400) = NULL,
    @number nvarchar(255) = NULL,
    @invoiceNumber_Clear bit = 0,
    @invoiceNumber nvarchar(255) = NULL,
    @currency_Clear bit = 0,
    @currency nvarchar(MAX) = NULL,
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
    [wild_apricot].[Order]
        (
            [isTaxesApplied],
                [deliveryOption],
                [contactId],
                [subTotal],
                [isTaxesIncludedTotal],
                [invoiceId],
                [externalNote],
                [products],
                [status],
                [total],
                [url],
                [internalNote],
                [billingPerson],
                [comment],
                [shippingAddress],
                [created],
                [paymentStatus],
                [invoiceNumber],
                [currency],
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
                [number]
        )
    VALUES
        (
            CASE WHEN @isTaxesApplied_Clear = 1 THEN NULL ELSE ISNULL(@isTaxesApplied, NULL) END,
                CASE WHEN @deliveryOption_Clear = 1 THEN NULL ELSE ISNULL(@deliveryOption, NULL) END,
                CASE WHEN @contactId_Clear = 1 THEN NULL ELSE ISNULL(@contactId, NULL) END,
                CASE WHEN @subTotal_Clear = 1 THEN NULL ELSE ISNULL(@subTotal, NULL) END,
                CASE WHEN @isTaxesIncludedTotal_Clear = 1 THEN NULL ELSE ISNULL(@isTaxesIncludedTotal, NULL) END,
                CASE WHEN @invoiceId_Clear = 1 THEN NULL ELSE ISNULL(@invoiceId, NULL) END,
                CASE WHEN @externalNote_Clear = 1 THEN NULL ELSE ISNULL(@externalNote, NULL) END,
                CASE WHEN @products_Clear = 1 THEN NULL ELSE ISNULL(@products, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @total_Clear = 1 THEN NULL ELSE ISNULL(@total, NULL) END,
                CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, NULL) END,
                CASE WHEN @internalNote_Clear = 1 THEN NULL ELSE ISNULL(@internalNote, NULL) END,
                CASE WHEN @billingPerson_Clear = 1 THEN NULL ELSE ISNULL(@billingPerson, NULL) END,
                CASE WHEN @comment_Clear = 1 THEN NULL ELSE ISNULL(@comment, NULL) END,
                CASE WHEN @shippingAddress_Clear = 1 THEN NULL ELSE ISNULL(@shippingAddress, NULL) END,
                CASE WHEN @created_Clear = 1 THEN NULL ELSE ISNULL(@created, NULL) END,
                CASE WHEN @paymentStatus_Clear = 1 THEN NULL ELSE ISNULL(@paymentStatus, NULL) END,
                CASE WHEN @invoiceNumber_Clear = 1 THEN NULL ELSE ISNULL(@invoiceNumber, NULL) END,
                CASE WHEN @currency_Clear = 1 THEN NULL ELSE ISNULL(@currency, NULL) END,
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
                @number
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwOrders] WHERE [number] = @number
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateOrder] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Orders */

GRANT EXECUTE ON [wild_apricot].[spCreateOrder] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spUpdateOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Order
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateOrder];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateOrder]
    @isTaxesApplied_Clear bit = 0,
    @isTaxesApplied nvarchar(255) = NULL,
    @deliveryOption_Clear bit = 0,
    @deliveryOption nvarchar(MAX) = NULL,
    @contactId_Clear bit = 0,
    @contactId nvarchar(255) = NULL,
    @subTotal_Clear bit = 0,
    @subTotal nvarchar(255) = NULL,
    @isTaxesIncludedTotal_Clear bit = 0,
    @isTaxesIncludedTotal nvarchar(255) = NULL,
    @invoiceId_Clear bit = 0,
    @invoiceId nvarchar(255) = NULL,
    @externalNote_Clear bit = 0,
    @externalNote nvarchar(MAX) = NULL,
    @products_Clear bit = 0,
    @products nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(400) = NULL,
    @total_Clear bit = 0,
    @total nvarchar(255) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(255) = NULL,
    @internalNote_Clear bit = 0,
    @internalNote nvarchar(MAX) = NULL,
    @billingPerson_Clear bit = 0,
    @billingPerson nvarchar(MAX) = NULL,
    @comment_Clear bit = 0,
    @comment nvarchar(255) = NULL,
    @shippingAddress_Clear bit = 0,
    @shippingAddress nvarchar(MAX) = NULL,
    @created_Clear bit = 0,
    @created nvarchar(255) = NULL,
    @paymentStatus_Clear bit = 0,
    @paymentStatus nvarchar(400) = NULL,
    @number nvarchar(255),
    @invoiceNumber_Clear bit = 0,
    @invoiceNumber nvarchar(255) = NULL,
    @currency_Clear bit = 0,
    @currency nvarchar(MAX) = NULL,
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
        [wild_apricot].[Order]
    SET
        [isTaxesApplied] = CASE WHEN @isTaxesApplied_Clear = 1 THEN NULL ELSE ISNULL(@isTaxesApplied, [isTaxesApplied]) END,
        [deliveryOption] = CASE WHEN @deliveryOption_Clear = 1 THEN NULL ELSE ISNULL(@deliveryOption, [deliveryOption]) END,
        [contactId] = CASE WHEN @contactId_Clear = 1 THEN NULL ELSE ISNULL(@contactId, [contactId]) END,
        [subTotal] = CASE WHEN @subTotal_Clear = 1 THEN NULL ELSE ISNULL(@subTotal, [subTotal]) END,
        [isTaxesIncludedTotal] = CASE WHEN @isTaxesIncludedTotal_Clear = 1 THEN NULL ELSE ISNULL(@isTaxesIncludedTotal, [isTaxesIncludedTotal]) END,
        [invoiceId] = CASE WHEN @invoiceId_Clear = 1 THEN NULL ELSE ISNULL(@invoiceId, [invoiceId]) END,
        [externalNote] = CASE WHEN @externalNote_Clear = 1 THEN NULL ELSE ISNULL(@externalNote, [externalNote]) END,
        [products] = CASE WHEN @products_Clear = 1 THEN NULL ELSE ISNULL(@products, [products]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [total] = CASE WHEN @total_Clear = 1 THEN NULL ELSE ISNULL(@total, [total]) END,
        [url] = CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, [url]) END,
        [internalNote] = CASE WHEN @internalNote_Clear = 1 THEN NULL ELSE ISNULL(@internalNote, [internalNote]) END,
        [billingPerson] = CASE WHEN @billingPerson_Clear = 1 THEN NULL ELSE ISNULL(@billingPerson, [billingPerson]) END,
        [comment] = CASE WHEN @comment_Clear = 1 THEN NULL ELSE ISNULL(@comment, [comment]) END,
        [shippingAddress] = CASE WHEN @shippingAddress_Clear = 1 THEN NULL ELSE ISNULL(@shippingAddress, [shippingAddress]) END,
        [created] = CASE WHEN @created_Clear = 1 THEN NULL ELSE ISNULL(@created, [created]) END,
        [paymentStatus] = CASE WHEN @paymentStatus_Clear = 1 THEN NULL ELSE ISNULL(@paymentStatus, [paymentStatus]) END,
        [invoiceNumber] = CASE WHEN @invoiceNumber_Clear = 1 THEN NULL ELSE ISNULL(@invoiceNumber, [invoiceNumber]) END,
        [currency] = CASE WHEN @currency_Clear = 1 THEN NULL ELSE ISNULL(@currency, [currency]) END,
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
        [number] = @number

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwOrders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwOrders]
                                    WHERE
                                        [number] = @number
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateOrder] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Order table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateOrder]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateOrder];
GO
CREATE TRIGGER [wild_apricot].trgUpdateOrder
ON [wild_apricot].[Order]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Order]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Order] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[number] = I.[number];
END;
GO

/* spUpdate Permissions for Orders */

GRANT EXECUTE ON [wild_apricot].[spUpdateOrder] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spDeleteOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Order
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteOrder];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteOrder]
    @number nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Order]
    WHERE
        [number] = @number


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [number] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @number AS [number] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteOrder] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Orders */

GRANT EXECUTE ON [wild_apricot].[spDeleteOrder] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PaymentAllocation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Allocations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Payment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Refund */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Refunds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for SavedSearch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Saved Searches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Payment Allocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Allocations
-- Item: vwPaymentAllocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Payment Allocations
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  PaymentAllocation
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwPaymentAllocations]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwPaymentAllocations];
GO

CREATE VIEW [wild_apricot].[vwPaymentAllocations]
AS
SELECT
    p.*
FROM
    [wild_apricot].[PaymentAllocation] AS p
GO
GRANT SELECT ON [wild_apricot].[vwPaymentAllocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Payment Allocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Allocations
-- Item: Permissions for vwPaymentAllocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwPaymentAllocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Payment Allocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Allocations
-- Item: spCreatePaymentAllocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentAllocation
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreatePaymentAllocation]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreatePaymentAllocation];
GO

CREATE PROCEDURE [wild_apricot].[spCreatePaymentAllocation]
    @Id nvarchar(255) = NULL,
    @InvoiceNumber_Clear bit = 0,
    @InvoiceNumber nvarchar(255) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @PaymentDate_Clear bit = 0,
    @PaymentDate nvarchar(255) = NULL,
    @PaymentType_Clear bit = 0,
    @PaymentType nvarchar(400) = NULL,
    @RefundDate_Clear bit = 0,
    @RefundDate nvarchar(255) = NULL,
    @Payment_Clear bit = 0,
    @Payment nvarchar(255) = NULL,
    @Invoice_Clear bit = 0,
    @Invoice nvarchar(255) = NULL,
    @InvoiceDate_Clear bit = 0,
    @InvoiceDate nvarchar(255) = NULL,
    @Refund_Clear bit = 0,
    @Refund nvarchar(255) = NULL,
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
    [wild_apricot].[PaymentAllocation]
        (
            [InvoiceNumber],
                [Value],
                [PaymentDate],
                [PaymentType],
                [RefundDate],
                [Payment],
                [Invoice],
                [InvoiceDate],
                [Refund],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @InvoiceNumber_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceNumber, NULL) END,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @PaymentDate_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDate, NULL) END,
                CASE WHEN @PaymentType_Clear = 1 THEN NULL ELSE ISNULL(@PaymentType, NULL) END,
                CASE WHEN @RefundDate_Clear = 1 THEN NULL ELSE ISNULL(@RefundDate, NULL) END,
                CASE WHEN @Payment_Clear = 1 THEN NULL ELSE ISNULL(@Payment, NULL) END,
                CASE WHEN @Invoice_Clear = 1 THEN NULL ELSE ISNULL(@Invoice, NULL) END,
                CASE WHEN @InvoiceDate_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceDate, NULL) END,
                CASE WHEN @Refund_Clear = 1 THEN NULL ELSE ISNULL(@Refund, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwPaymentAllocations] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreatePaymentAllocation] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Payment Allocations */

GRANT EXECUTE ON [wild_apricot].[spCreatePaymentAllocation] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Payment Allocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Allocations
-- Item: spUpdatePaymentAllocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentAllocation
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdatePaymentAllocation]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdatePaymentAllocation];
GO

CREATE PROCEDURE [wild_apricot].[spUpdatePaymentAllocation]
    @Id nvarchar(255),
    @InvoiceNumber_Clear bit = 0,
    @InvoiceNumber nvarchar(255) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @PaymentDate_Clear bit = 0,
    @PaymentDate nvarchar(255) = NULL,
    @PaymentType_Clear bit = 0,
    @PaymentType nvarchar(400) = NULL,
    @RefundDate_Clear bit = 0,
    @RefundDate nvarchar(255) = NULL,
    @Payment_Clear bit = 0,
    @Payment nvarchar(255) = NULL,
    @Invoice_Clear bit = 0,
    @Invoice nvarchar(255) = NULL,
    @InvoiceDate_Clear bit = 0,
    @InvoiceDate nvarchar(255) = NULL,
    @Refund_Clear bit = 0,
    @Refund nvarchar(255) = NULL,
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
        [wild_apricot].[PaymentAllocation]
    SET
        [InvoiceNumber] = CASE WHEN @InvoiceNumber_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceNumber, [InvoiceNumber]) END,
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [PaymentDate] = CASE WHEN @PaymentDate_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDate, [PaymentDate]) END,
        [PaymentType] = CASE WHEN @PaymentType_Clear = 1 THEN NULL ELSE ISNULL(@PaymentType, [PaymentType]) END,
        [RefundDate] = CASE WHEN @RefundDate_Clear = 1 THEN NULL ELSE ISNULL(@RefundDate, [RefundDate]) END,
        [Payment] = CASE WHEN @Payment_Clear = 1 THEN NULL ELSE ISNULL(@Payment, [Payment]) END,
        [Invoice] = CASE WHEN @Invoice_Clear = 1 THEN NULL ELSE ISNULL(@Invoice, [Invoice]) END,
        [InvoiceDate] = CASE WHEN @InvoiceDate_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceDate, [InvoiceDate]) END,
        [Refund] = CASE WHEN @Refund_Clear = 1 THEN NULL ELSE ISNULL(@Refund, [Refund]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwPaymentAllocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwPaymentAllocations]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdatePaymentAllocation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentAllocation table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdatePaymentAllocation]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdatePaymentAllocation];
GO
CREATE TRIGGER [wild_apricot].trgUpdatePaymentAllocation
ON [wild_apricot].[PaymentAllocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[PaymentAllocation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[PaymentAllocation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Payment Allocations */

GRANT EXECUTE ON [wild_apricot].[spUpdatePaymentAllocation] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: vwPayments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Payments
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Payment
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwPayments]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwPayments];
GO

CREATE VIEW [wild_apricot].[vwPayments]
AS
SELECT
    p.*
FROM
    [wild_apricot].[Payment] AS p
GO
GRANT SELECT ON [wild_apricot].[vwPayments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: Permissions for vwPayments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwPayments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: spCreatePayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Payment
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreatePayment]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreatePayment];
GO

CREATE PROCEDURE [wild_apricot].[spCreatePayment]
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @PaymentMethodID_Clear bit = 0,
    @PaymentMethodID nvarchar(255) = NULL,
    @FieldValues_Clear bit = 0,
    @FieldValues nvarchar(MAX) = NULL,
    @UpdatedBy_Clear bit = 0,
    @UpdatedBy nvarchar(255) = NULL,
    @RefundedAmount_Clear bit = 0,
    @RefundedAmount nvarchar(255) = NULL,
    @DocumentDate_Clear bit = 0,
    @DocumentDate nvarchar(255) = NULL,
    @PublicComment_Clear bit = 0,
    @PublicComment nvarchar(255) = NULL,
    @UpdatedDate_Clear bit = 0,
    @UpdatedDate nvarchar(255) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(400) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
    @AllocatedValue_Clear bit = 0,
    @AllocatedValue nvarchar(255) = NULL,
    @Comment_Clear bit = 0,
    @Comment nvarchar(255) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @Tender_Clear bit = 0,
    @Tender nvarchar(MAX) = NULL,
    @DonationId_Clear bit = 0,
    @DonationId nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
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
    [wild_apricot].[Payment]
        (
            [CreatedBy],
                [PaymentMethodID],
                [FieldValues],
                [UpdatedBy],
                [RefundedAmount],
                [DocumentDate],
                [PublicComment],
                [UpdatedDate],
                [Type],
                [Contact],
                [AllocatedValue],
                [Comment],
                [Value],
                [Tender],
                [DonationId],
                [Url],
                [CreatedDate],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, NULL) END,
                CASE WHEN @PaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentMethodID, NULL) END,
                CASE WHEN @FieldValues_Clear = 1 THEN NULL ELSE ISNULL(@FieldValues, NULL) END,
                CASE WHEN @UpdatedBy_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedBy, NULL) END,
                CASE WHEN @RefundedAmount_Clear = 1 THEN NULL ELSE ISNULL(@RefundedAmount, NULL) END,
                CASE WHEN @DocumentDate_Clear = 1 THEN NULL ELSE ISNULL(@DocumentDate, NULL) END,
                CASE WHEN @PublicComment_Clear = 1 THEN NULL ELSE ISNULL(@PublicComment, NULL) END,
                CASE WHEN @UpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedDate, NULL) END,
                CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, NULL) END,
                CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, NULL) END,
                CASE WHEN @AllocatedValue_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedValue, NULL) END,
                CASE WHEN @Comment_Clear = 1 THEN NULL ELSE ISNULL(@Comment, NULL) END,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Tender_Clear = 1 THEN NULL ELSE ISNULL(@Tender, NULL) END,
                CASE WHEN @DonationId_Clear = 1 THEN NULL ELSE ISNULL(@DonationId, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwPayments] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreatePayment] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Payments */

GRANT EXECUTE ON [wild_apricot].[spCreatePayment] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: spUpdatePayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Payment
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdatePayment]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdatePayment];
GO

CREATE PROCEDURE [wild_apricot].[spUpdatePayment]
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @PaymentMethodID_Clear bit = 0,
    @PaymentMethodID nvarchar(255) = NULL,
    @FieldValues_Clear bit = 0,
    @FieldValues nvarchar(MAX) = NULL,
    @UpdatedBy_Clear bit = 0,
    @UpdatedBy nvarchar(255) = NULL,
    @RefundedAmount_Clear bit = 0,
    @RefundedAmount nvarchar(255) = NULL,
    @DocumentDate_Clear bit = 0,
    @DocumentDate nvarchar(255) = NULL,
    @PublicComment_Clear bit = 0,
    @PublicComment nvarchar(255) = NULL,
    @UpdatedDate_Clear bit = 0,
    @UpdatedDate nvarchar(255) = NULL,
    @Type_Clear bit = 0,
    @Type nvarchar(400) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
    @AllocatedValue_Clear bit = 0,
    @AllocatedValue nvarchar(255) = NULL,
    @Comment_Clear bit = 0,
    @Comment nvarchar(255) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @Tender_Clear bit = 0,
    @Tender nvarchar(MAX) = NULL,
    @DonationId_Clear bit = 0,
    @DonationId nvarchar(255) = NULL,
    @Id nvarchar(255),
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
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
        [wild_apricot].[Payment]
    SET
        [CreatedBy] = CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, [CreatedBy]) END,
        [PaymentMethodID] = CASE WHEN @PaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentMethodID, [PaymentMethodID]) END,
        [FieldValues] = CASE WHEN @FieldValues_Clear = 1 THEN NULL ELSE ISNULL(@FieldValues, [FieldValues]) END,
        [UpdatedBy] = CASE WHEN @UpdatedBy_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedBy, [UpdatedBy]) END,
        [RefundedAmount] = CASE WHEN @RefundedAmount_Clear = 1 THEN NULL ELSE ISNULL(@RefundedAmount, [RefundedAmount]) END,
        [DocumentDate] = CASE WHEN @DocumentDate_Clear = 1 THEN NULL ELSE ISNULL(@DocumentDate, [DocumentDate]) END,
        [PublicComment] = CASE WHEN @PublicComment_Clear = 1 THEN NULL ELSE ISNULL(@PublicComment, [PublicComment]) END,
        [UpdatedDate] = CASE WHEN @UpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedDate, [UpdatedDate]) END,
        [Type] = CASE WHEN @Type_Clear = 1 THEN NULL ELSE ISNULL(@Type, [Type]) END,
        [Contact] = CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, [Contact]) END,
        [AllocatedValue] = CASE WHEN @AllocatedValue_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedValue, [AllocatedValue]) END,
        [Comment] = CASE WHEN @Comment_Clear = 1 THEN NULL ELSE ISNULL(@Comment, [Comment]) END,
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [Tender] = CASE WHEN @Tender_Clear = 1 THEN NULL ELSE ISNULL(@Tender, [Tender]) END,
        [DonationId] = CASE WHEN @DonationId_Clear = 1 THEN NULL ELSE ISNULL(@DonationId, [DonationId]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [CreatedDate] = CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, [CreatedDate]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwPayments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwPayments]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdatePayment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Payment table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdatePayment]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdatePayment];
GO
CREATE TRIGGER [wild_apricot].trgUpdatePayment
ON [wild_apricot].[Payment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Payment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Payment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Payments */

GRANT EXECUTE ON [wild_apricot].[spUpdatePayment] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Products
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Product
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwProducts];
GO

CREATE VIEW [wild_apricot].[vwProducts]
AS
SELECT
    p.*
FROM
    [wild_apricot].[Product] AS p
GO
GRANT SELECT ON [wild_apricot].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spCreateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateProduct];
GO

CREATE PROCEDURE [wild_apricot].[spCreateProduct]
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(255) = NULL,
    @stock_Clear bit = 0,
    @stock nvarchar(255) = NULL,
    @productOptions_Clear bit = 0,
    @productOptions nvarchar(MAX) = NULL,
    @created_Clear bit = 0,
    @created nvarchar(255) = NULL,
    @trackInventory_Clear bit = 0,
    @trackInventory nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(400) = NULL,
    @productVariants_Clear bit = 0,
    @productVariants nvarchar(MAX) = NULL,
    @ecourseProduct_Clear bit = 0,
    @ecourseProduct nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(400) = NULL,
    @pictures_Clear bit = 0,
    @pictures nvarchar(MAX) = NULL,
    @outOfStock_Clear bit = 0,
    @outOfStock nvarchar(255) = NULL,
    @price_Clear bit = 0,
    @price nvarchar(MAX) = NULL,
    @totalStock_Clear bit = 0,
    @totalStock nvarchar(255) = NULL,
    @digitalProduct_Clear bit = 0,
    @digitalProduct nvarchar(MAX) = NULL,
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
    [wild_apricot].[Product]
        (
            [description],
                [tags],
                [url],
                [stock],
                [productOptions],
                [created],
                [trackInventory],
                [title],
                [type],
                [productVariants],
                [ecourseProduct],
                [status],
                [pictures],
                [outOfStock],
                [price],
                [totalStock],
                [digitalProduct],
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
            CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, NULL) END,
                CASE WHEN @stock_Clear = 1 THEN NULL ELSE ISNULL(@stock, NULL) END,
                CASE WHEN @productOptions_Clear = 1 THEN NULL ELSE ISNULL(@productOptions, NULL) END,
                CASE WHEN @created_Clear = 1 THEN NULL ELSE ISNULL(@created, NULL) END,
                CASE WHEN @trackInventory_Clear = 1 THEN NULL ELSE ISNULL(@trackInventory, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @productVariants_Clear = 1 THEN NULL ELSE ISNULL(@productVariants, NULL) END,
                CASE WHEN @ecourseProduct_Clear = 1 THEN NULL ELSE ISNULL(@ecourseProduct, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @pictures_Clear = 1 THEN NULL ELSE ISNULL(@pictures, NULL) END,
                CASE WHEN @outOfStock_Clear = 1 THEN NULL ELSE ISNULL(@outOfStock, NULL) END,
                CASE WHEN @price_Clear = 1 THEN NULL ELSE ISNULL(@price, NULL) END,
                CASE WHEN @totalStock_Clear = 1 THEN NULL ELSE ISNULL(@totalStock, NULL) END,
                CASE WHEN @digitalProduct_Clear = 1 THEN NULL ELSE ISNULL(@digitalProduct, NULL) END,
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
    SELECT * FROM [wild_apricot].[vwProducts] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateProduct] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Products */

GRANT EXECUTE ON [wild_apricot].[spCreateProduct] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spUpdateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateProduct];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateProduct]
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(255) = NULL,
    @stock_Clear bit = 0,
    @stock nvarchar(255) = NULL,
    @productOptions_Clear bit = 0,
    @productOptions nvarchar(MAX) = NULL,
    @created_Clear bit = 0,
    @created nvarchar(255) = NULL,
    @trackInventory_Clear bit = 0,
    @trackInventory nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @id nvarchar(255),
    @type_Clear bit = 0,
    @type nvarchar(400) = NULL,
    @productVariants_Clear bit = 0,
    @productVariants nvarchar(MAX) = NULL,
    @ecourseProduct_Clear bit = 0,
    @ecourseProduct nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(400) = NULL,
    @pictures_Clear bit = 0,
    @pictures nvarchar(MAX) = NULL,
    @outOfStock_Clear bit = 0,
    @outOfStock nvarchar(255) = NULL,
    @price_Clear bit = 0,
    @price nvarchar(MAX) = NULL,
    @totalStock_Clear bit = 0,
    @totalStock nvarchar(255) = NULL,
    @digitalProduct_Clear bit = 0,
    @digitalProduct nvarchar(MAX) = NULL,
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
        [wild_apricot].[Product]
    SET
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [url] = CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, [url]) END,
        [stock] = CASE WHEN @stock_Clear = 1 THEN NULL ELSE ISNULL(@stock, [stock]) END,
        [productOptions] = CASE WHEN @productOptions_Clear = 1 THEN NULL ELSE ISNULL(@productOptions, [productOptions]) END,
        [created] = CASE WHEN @created_Clear = 1 THEN NULL ELSE ISNULL(@created, [created]) END,
        [trackInventory] = CASE WHEN @trackInventory_Clear = 1 THEN NULL ELSE ISNULL(@trackInventory, [trackInventory]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [productVariants] = CASE WHEN @productVariants_Clear = 1 THEN NULL ELSE ISNULL(@productVariants, [productVariants]) END,
        [ecourseProduct] = CASE WHEN @ecourseProduct_Clear = 1 THEN NULL ELSE ISNULL(@ecourseProduct, [ecourseProduct]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [pictures] = CASE WHEN @pictures_Clear = 1 THEN NULL ELSE ISNULL(@pictures, [pictures]) END,
        [outOfStock] = CASE WHEN @outOfStock_Clear = 1 THEN NULL ELSE ISNULL(@outOfStock, [outOfStock]) END,
        [price] = CASE WHEN @price_Clear = 1 THEN NULL ELSE ISNULL(@price, [price]) END,
        [totalStock] = CASE WHEN @totalStock_Clear = 1 THEN NULL ELSE ISNULL(@totalStock, [totalStock]) END,
        [digitalProduct] = CASE WHEN @digitalProduct_Clear = 1 THEN NULL ELSE ISNULL(@digitalProduct, [digitalProduct]) END,
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
        SELECT TOP 0 * FROM [wild_apricot].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwProducts]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateProduct];
GO
CREATE TRIGGER [wild_apricot].trgUpdateProduct
ON [wild_apricot].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Products */

GRANT EXECUTE ON [wild_apricot].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Refunds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Refunds
-- Item: vwRefunds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Refunds
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Refund
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwRefunds]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwRefunds];
GO

CREATE VIEW [wild_apricot].[vwRefunds]
AS
SELECT
    r.*
FROM
    [wild_apricot].[Refund] AS r
GO
GRANT SELECT ON [wild_apricot].[vwRefunds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Refunds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Refunds
-- Item: Permissions for vwRefunds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwRefunds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Refunds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Refunds
-- Item: spCreateRefund
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Refund
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateRefund]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateRefund];
GO

CREATE PROCEDURE [wild_apricot].[spCreateRefund]
    @DocumentDate_Clear bit = 0,
    @DocumentDate nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @SettledValue_Clear bit = 0,
    @SettledValue nvarchar(255) = NULL,
    @UpdatedBy_Clear bit = 0,
    @UpdatedBy nvarchar(255) = NULL,
    @Tender_Clear bit = 0,
    @Tender nvarchar(MAX) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @PublicComment_Clear bit = 0,
    @PublicComment nvarchar(255) = NULL,
    @Comment_Clear bit = 0,
    @Comment nvarchar(255) = NULL,
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
    @UpdatedDate_Clear bit = 0,
    @UpdatedDate nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
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
    [wild_apricot].[Refund]
        (
            [DocumentDate],
                [Url],
                [SettledValue],
                [UpdatedBy],
                [Tender],
                [Value],
                [PublicComment],
                [Comment],
                [CreatedBy],
                [CreatedDate],
                [UpdatedDate],
                [Contact],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @DocumentDate_Clear = 1 THEN NULL ELSE ISNULL(@DocumentDate, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
                CASE WHEN @SettledValue_Clear = 1 THEN NULL ELSE ISNULL(@SettledValue, NULL) END,
                CASE WHEN @UpdatedBy_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedBy, NULL) END,
                CASE WHEN @Tender_Clear = 1 THEN NULL ELSE ISNULL(@Tender, NULL) END,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @PublicComment_Clear = 1 THEN NULL ELSE ISNULL(@PublicComment, NULL) END,
                CASE WHEN @Comment_Clear = 1 THEN NULL ELSE ISNULL(@Comment, NULL) END,
                CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, NULL) END,
                CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, NULL) END,
                CASE WHEN @UpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedDate, NULL) END,
                CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwRefunds] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateRefund] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Refunds */

GRANT EXECUTE ON [wild_apricot].[spCreateRefund] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Refunds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Refunds
-- Item: spUpdateRefund
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Refund
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateRefund]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateRefund];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateRefund]
    @DocumentDate_Clear bit = 0,
    @DocumentDate nvarchar(255) = NULL,
    @Id nvarchar(255),
    @Url_Clear bit = 0,
    @Url nvarchar(MAX) = NULL,
    @SettledValue_Clear bit = 0,
    @SettledValue nvarchar(255) = NULL,
    @UpdatedBy_Clear bit = 0,
    @UpdatedBy nvarchar(255) = NULL,
    @Tender_Clear bit = 0,
    @Tender nvarchar(MAX) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(255) = NULL,
    @PublicComment_Clear bit = 0,
    @PublicComment nvarchar(255) = NULL,
    @Comment_Clear bit = 0,
    @Comment nvarchar(255) = NULL,
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @CreatedDate_Clear bit = 0,
    @CreatedDate nvarchar(255) = NULL,
    @UpdatedDate_Clear bit = 0,
    @UpdatedDate nvarchar(255) = NULL,
    @Contact_Clear bit = 0,
    @Contact nvarchar(255) = NULL,
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
        [wild_apricot].[Refund]
    SET
        [DocumentDate] = CASE WHEN @DocumentDate_Clear = 1 THEN NULL ELSE ISNULL(@DocumentDate, [DocumentDate]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
        [SettledValue] = CASE WHEN @SettledValue_Clear = 1 THEN NULL ELSE ISNULL(@SettledValue, [SettledValue]) END,
        [UpdatedBy] = CASE WHEN @UpdatedBy_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedBy, [UpdatedBy]) END,
        [Tender] = CASE WHEN @Tender_Clear = 1 THEN NULL ELSE ISNULL(@Tender, [Tender]) END,
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [PublicComment] = CASE WHEN @PublicComment_Clear = 1 THEN NULL ELSE ISNULL(@PublicComment, [PublicComment]) END,
        [Comment] = CASE WHEN @Comment_Clear = 1 THEN NULL ELSE ISNULL(@Comment, [Comment]) END,
        [CreatedBy] = CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, [CreatedBy]) END,
        [CreatedDate] = CASE WHEN @CreatedDate_Clear = 1 THEN NULL ELSE ISNULL(@CreatedDate, [CreatedDate]) END,
        [UpdatedDate] = CASE WHEN @UpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@UpdatedDate, [UpdatedDate]) END,
        [Contact] = CASE WHEN @Contact_Clear = 1 THEN NULL ELSE ISNULL(@Contact, [Contact]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwRefunds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwRefunds]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateRefund] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Refund table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateRefund]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateRefund];
GO
CREATE TRIGGER [wild_apricot].trgUpdateRefund
ON [wild_apricot].[Refund]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Refund]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Refund] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Refunds */

GRANT EXECUTE ON [wild_apricot].[spUpdateRefund] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Saved Searches
-- Item: vwSavedSearches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Saved Searches
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  SavedSearch
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwSavedSearches]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwSavedSearches];
GO

CREATE VIEW [wild_apricot].[vwSavedSearches]
AS
SELECT
    s.*
FROM
    [wild_apricot].[SavedSearch] AS s
GO
GRANT SELECT ON [wild_apricot].[vwSavedSearches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Saved Searches
-- Item: Permissions for vwSavedSearches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwSavedSearches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Saved Searches
-- Item: spCreateSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SavedSearch
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateSavedSearch]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateSavedSearch];
GO

CREATE PROCEDURE [wild_apricot].[spCreateSavedSearch]
    @ContactIds_Clear bit = 0,
    @ContactIds nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
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
    [wild_apricot].[SavedSearch]
        (
            [ContactIds],
                [Description],
                [Name],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @ContactIds_Clear = 1 THEN NULL ELSE ISNULL(@ContactIds, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwSavedSearches] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateSavedSearch] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Saved Searches */

GRANT EXECUTE ON [wild_apricot].[spCreateSavedSearch] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Saved Searches
-- Item: spUpdateSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SavedSearch
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateSavedSearch]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateSavedSearch];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateSavedSearch]
    @ContactIds_Clear bit = 0,
    @ContactIds nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Id nvarchar(255),
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
        [wild_apricot].[SavedSearch]
    SET
        [ContactIds] = CASE WHEN @ContactIds_Clear = 1 THEN NULL ELSE ISNULL(@ContactIds, [ContactIds]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwSavedSearches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwSavedSearches]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateSavedSearch] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SavedSearch table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateSavedSearch]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateSavedSearch];
GO
CREATE TRIGGER [wild_apricot].trgUpdateSavedSearch
ON [wild_apricot].[SavedSearch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[SavedSearch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[SavedSearch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Saved Searches */

GRANT EXECUTE ON [wild_apricot].[spUpdateSavedSearch] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Payment Allocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payment Allocations
-- Item: spDeletePaymentAllocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentAllocation
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeletePaymentAllocation]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeletePaymentAllocation];
GO

CREATE PROCEDURE [wild_apricot].[spDeletePaymentAllocation]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[PaymentAllocation]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeletePaymentAllocation] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Payment Allocations */

GRANT EXECUTE ON [wild_apricot].[spDeletePaymentAllocation] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: spDeletePayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Payment
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeletePayment]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeletePayment];
GO

CREATE PROCEDURE [wild_apricot].[spDeletePayment]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Payment]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeletePayment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Payments */

GRANT EXECUTE ON [wild_apricot].[spDeletePayment] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spDeleteProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteProduct];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteProduct]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Product]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Products */

GRANT EXECUTE ON [wild_apricot].[spDeleteProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Refunds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Refunds
-- Item: spDeleteRefund
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Refund
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteRefund]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteRefund];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteRefund]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Refund]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteRefund] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Refunds */

GRANT EXECUTE ON [wild_apricot].[spDeleteRefund] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Saved Searches
-- Item: spDeleteSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SavedSearch
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteSavedSearch]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteSavedSearch];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteSavedSearch]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[SavedSearch]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteSavedSearch] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Saved Searches */

GRANT EXECUTE ON [wild_apricot].[spDeleteSavedSearch] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Tender */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tenders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Tenders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tenders
-- Item: vwTenders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Tenders
-----               SCHEMA:      wild_apricot
-----               BASE TABLE:  Tender
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[vwTenders]', 'V') IS NOT NULL
    DROP VIEW [wild_apricot].[vwTenders];
GO

CREATE VIEW [wild_apricot].[vwTenders]
AS
SELECT
    t.*
FROM
    [wild_apricot].[Tender] AS t
GO
GRANT SELECT ON [wild_apricot].[vwTenders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Tenders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tenders
-- Item: Permissions for vwTenders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [wild_apricot].[vwTenders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Tenders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tenders
-- Item: spCreateTender
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tender
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spCreateTender]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spCreateTender];
GO

CREATE PROCEDURE [wild_apricot].[spCreateTender]
    @IsCustom_Clear bit = 0,
    @IsCustom nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @DisplayPosition_Clear bit = 0,
    @DisplayPosition nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(255) = NULL,
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
    [wild_apricot].[Tender]
        (
            [IsCustom],
                [Name],
                [DisplayPosition],
                [Url],
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
                [Id]
        )
    VALUES
        (
            CASE WHEN @IsCustom_Clear = 1 THEN NULL ELSE ISNULL(@IsCustom, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @DisplayPosition_Clear = 1 THEN NULL ELSE ISNULL(@DisplayPosition, NULL) END,
                CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, NULL) END,
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
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [wild_apricot].[vwTenders] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [wild_apricot].[spCreateTender] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Tenders */

GRANT EXECUTE ON [wild_apricot].[spCreateTender] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Tenders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tenders
-- Item: spUpdateTender
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tender
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spUpdateTender]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spUpdateTender];
GO

CREATE PROCEDURE [wild_apricot].[spUpdateTender]
    @IsCustom_Clear bit = 0,
    @IsCustom nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Id nvarchar(255),
    @DisplayPosition_Clear bit = 0,
    @DisplayPosition nvarchar(255) = NULL,
    @Url_Clear bit = 0,
    @Url nvarchar(255) = NULL,
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
        [wild_apricot].[Tender]
    SET
        [IsCustom] = CASE WHEN @IsCustom_Clear = 1 THEN NULL ELSE ISNULL(@IsCustom, [IsCustom]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [DisplayPosition] = CASE WHEN @DisplayPosition_Clear = 1 THEN NULL ELSE ISNULL(@DisplayPosition, [DisplayPosition]) END,
        [Url] = CASE WHEN @Url_Clear = 1 THEN NULL ELSE ISNULL(@Url, [Url]) END,
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
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [wild_apricot].[vwTenders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [wild_apricot].[vwTenders]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [wild_apricot].[spUpdateTender] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tender table
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[trgUpdateTender]', 'TR') IS NOT NULL
    DROP TRIGGER [wild_apricot].[trgUpdateTender];
GO
CREATE TRIGGER [wild_apricot].trgUpdateTender
ON [wild_apricot].[Tender]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [wild_apricot].[Tender]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [wild_apricot].[Tender] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Tenders */

GRANT EXECUTE ON [wild_apricot].[spUpdateTender] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Tenders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tenders
-- Item: spDeleteTender
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tender
------------------------------------------------------------
IF OBJECT_ID('[wild_apricot].[spDeleteTender]', 'P') IS NOT NULL
    DROP PROCEDURE [wild_apricot].[spDeleteTender];
GO

CREATE PROCEDURE [wild_apricot].[spDeleteTender]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [wild_apricot].[Tender]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [wild_apricot].[spDeleteTender] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Tenders */

GRANT EXECUTE ON [wild_apricot].[spDeleteTender] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for wild_apricot.Contact.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C2936590-83E2-4920-A09B-8852F9711E69' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Account.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7AC39039-C3FE-4BBB-875A-0EA84FB7819D' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.AttachmentData.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5F920FD4-9BB3-4BFE-AAC1-C6C5A6FE7B69' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.AuditLogItem.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '15FB5C5F-A116-42D1-B4E4-506DBD9178BC' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Bundle.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4E80CAD9-0CB0-41DA-96B6-A35D2D21BE9E' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.CeuRecord.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'EAE7ADC9-6EAB-4983-AA5B-E03A348DF082' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.ContactFieldDescription.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C086A428-1036-49FE-8037-8399C37867B4' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EmailDraft.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4A241AFA-D78A-4DC2-A2DD-613521056070' AND [Name] = 'Id';

/* Set soft FK for wild_apricot.EmailDraft.EventId → Event.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'DEBADAC3-C53E-47E4-87AC-46C35F65A529',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4A241AFA-D78A-4DC2-A2DD-613521056070' AND [Name] = 'EventId';

/* Set soft PK for wild_apricot.EmailLog.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '35F6BB5E-326E-4E35-B7CF-F8335A42016D' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EntityFieldDescription.SystemCode */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BF3998DE-7023-4B64-99BC-E24185F885F5' AND [Name] = 'SystemCode';

/* Set soft PK for wild_apricot.Event.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DEBADAC3-C53E-47E4-87AC-46C35F65A529' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EventRegistration.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '65F45A4D-A9AF-47CF-A108-74F10B381024' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.EventRegistrationType.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F1600A6A-9689-486F-83DF-79B68E9961CE' AND [Name] = 'Id';

/* Set soft FK for wild_apricot.EventRegistrationType.EventId → Event.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'DEBADAC3-C53E-47E4-87AC-46C35F65A529',
                                    [RelatedEntityFieldName] = 'Id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F1600A6A-9689-486F-83DF-79B68E9961CE' AND [Name] = 'EventId';

/* Set soft PK for wild_apricot.Invoice.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '90A024FD-AB2A-4241-8820-8E92C4247079' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.MembershipGroup.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8B3F1F07-42BE-4ED7-A07D-2F599F21D237' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.MembershipLevel.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AECD8F1D-A5C8-4BED-AD31-AF5CCF9A72AB' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Order.number */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B6FCD45C-701E-4299-AC70-E7A43B356138' AND [Name] = 'number';

/* Set soft PK for wild_apricot.Payment.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9F0BECE1-90EE-489C-BDCB-7DD4D9673FDB' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.PaymentAllocation.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'DE43207E-7479-4FFD-9C9D-2FDC40EC62EB' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Product.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A487E271-B7FB-4936-B7EE-87E8985D09C5' AND [Name] = 'id';

/* Set soft PK for wild_apricot.Refund.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '87A0ECB9-BBBC-433A-99B1-91596B3412A0' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.SavedSearch.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1B061CB9-5CE2-43ED-B5AC-5C55ECD29579' AND [Name] = 'Id';

/* Set soft PK for wild_apricot.Tender.Id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5062A9C1-0721-4834-84ED-B806BD58D761' AND [Name] = 'Id';

