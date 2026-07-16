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
         '4c486e5e-ffbf-4f01-a4d1-80b71c8e36fe',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4c486e5e-ffbf-4f01-a4d1-80b71c8e36fe', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4c486e5e-ffbf-4f01-a4d1-80b71c8e36fe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4c486e5e-ffbf-4f01-a4d1-80b71c8e36fe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4c486e5e-ffbf-4f01-a4d1-80b71c8e36fe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b602ebf-e2e7-4d55-9f76-d8ee3c61b2ae' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'ID')) BEGIN
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
            '5b602ebf-e2e7-4d55-9f76-d8ee3c61b2ae',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5e80097-8613-408a-b1f4-3808d0410aa4' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'Description')) BEGIN
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
            'd5e80097-8613-408a-b1f4-3808d0410aa4',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fb3759a-7fbf-4d53-8efe-bdb28e6d4424' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'AffectedTables')) BEGIN
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
            '8fb3759a-7fbf-4d53-8efe-bdb28e6d4424',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd655e393-8feb-4197-86fb-4d8981116d98' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'Success')) BEGIN
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
            'd655e393-8feb-4197-86fb-4d8981116d98',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06a0ba94-ec24-4891-b3a2-3192b80bb68c' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'APIRestarted')) BEGIN
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
            '06a0ba94-ec24-4891-b3a2-3192b80bb68c',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31291eb5-9ac8-494a-ba10-cc4b94d23543' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'GitCommitSuccess')) BEGIN
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
            '31291eb5-9ac8-494a-ba10-cc4b94d23543',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c5918d7-36a9-4eae-936e-c51eb7039ed8' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'BranchName')) BEGIN
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
            '1c5918d7-36a9-4eae-936e-c51eb7039ed8',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48b021af-a3dd-4981-bb89-e0a50299e39a' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'MigrationFilePath')) BEGIN
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
            '48b021af-a3dd-4981-bb89-e0a50299e39a',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f7e4d40-8e18-4eb3-b902-05dd5aec9718' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'ErrorMessage')) BEGIN
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
            '6f7e4d40-8e18-4eb3-b902-05dd5aec9718',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa40bf1e-3e6b-4c15-8bb6-e0e7d5322225' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'ErrorStep')) BEGIN
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
            'fa40bf1e-3e6b-4c15-8bb6-e0e7d5322225',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7934cc46-95d7-4276-87a3-a60f3dfdd0d5' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'StepsJSON')) BEGIN
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
            '7934cc46-95d7-4276-87a3-a60f3dfdd0d5',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a370cb8d-5fa5-490a-914d-8dc1f6fe6b45' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'TotalDurationMs')) BEGIN
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
            'a370cb8d-5fa5-490a-914d-8dc1f6fe6b45',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f1f0974-0847-43ce-b226-685b2803e6fe' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = 'RunAt')) BEGIN
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
            '5f1f0974-0847-43ce-b226-685b2803e6fe',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82647731-0c5c-4e0d-bac2-660444b14612' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = '__mj_CreatedAt')) BEGIN
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
            '82647731-0c5c-4e0d-bac2-660444b14612',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69c2a3e3-6b58-43cf-b770-8691132c9630' OR (EntityID = '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '69c2a3e3-6b58-43cf-b770-8691132c9630',
            '4C486E5E-FFBF-4F01-A4D1-80B71C8E36FE', -- Entity: MJ: RSU Audit Logs
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

/* Set soft PK for hubspot.contacts.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '94365E45-A9D6-442D-9003-B1E04E5941DE' AND [Name] = 'id';

/* Index for Foreign Keys for contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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
-----               SCHEMA:      hubspot
-----               BASE TABLE:  contacts
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[hubspot].[vwContacts]', 'V') IS NOT NULL
    DROP VIEW [hubspot].[vwContacts];
GO

CREATE VIEW [hubspot].[vwContacts]
AS
SELECT
    c.*
FROM
    [hubspot].[contacts] AS c
GO
GRANT SELECT ON [hubspot].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Permissions for vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [hubspot].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spCreatecontacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contacts
------------------------------------------------------------
IF OBJECT_ID('[hubspot].[spCreatecontacts]', 'P') IS NOT NULL
    DROP PROCEDURE [hubspot].[spCreatecontacts];
GO

CREATE PROCEDURE [hubspot].[spCreatecontacts]
    @properties_Clear bit = 0,
    @properties nvarchar(MAX) = NULL,
    @archivedAt_Clear bit = 0,
    @archivedAt nvarchar(255) = NULL,
    @updatedAt_Clear bit = 0,
    @updatedAt nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(255) = NULL,
    @createdAt_Clear bit = 0,
    @createdAt nvarchar(255) = NULL,
    @archived_Clear bit = 0,
    @archived nvarchar(255) = NULL,
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
    [hubspot].[contacts]
        (
            [properties],
                [archivedAt],
                [updatedAt],
                [url],
                [createdAt],
                [archived],
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
            CASE WHEN @properties_Clear = 1 THEN NULL ELSE ISNULL(@properties, NULL) END,
                CASE WHEN @archivedAt_Clear = 1 THEN NULL ELSE ISNULL(@archivedAt, NULL) END,
                CASE WHEN @updatedAt_Clear = 1 THEN NULL ELSE ISNULL(@updatedAt, NULL) END,
                CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, NULL) END,
                CASE WHEN @createdAt_Clear = 1 THEN NULL ELSE ISNULL(@createdAt, NULL) END,
                CASE WHEN @archived_Clear = 1 THEN NULL ELSE ISNULL(@archived, NULL) END,
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
    SELECT * FROM [hubspot].[vwContacts] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [hubspot].[spCreatecontacts] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contacts */

GRANT EXECUTE ON [hubspot].[spCreatecontacts] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spUpdatecontacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contacts
------------------------------------------------------------
IF OBJECT_ID('[hubspot].[spUpdatecontacts]', 'P') IS NOT NULL
    DROP PROCEDURE [hubspot].[spUpdatecontacts];
GO

CREATE PROCEDURE [hubspot].[spUpdatecontacts]
    @properties_Clear bit = 0,
    @properties nvarchar(MAX) = NULL,
    @archivedAt_Clear bit = 0,
    @archivedAt nvarchar(255) = NULL,
    @updatedAt_Clear bit = 0,
    @updatedAt nvarchar(255) = NULL,
    @id nvarchar(255),
    @url_Clear bit = 0,
    @url nvarchar(255) = NULL,
    @createdAt_Clear bit = 0,
    @createdAt nvarchar(255) = NULL,
    @archived_Clear bit = 0,
    @archived nvarchar(255) = NULL,
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
        [hubspot].[contacts]
    SET
        [properties] = CASE WHEN @properties_Clear = 1 THEN NULL ELSE ISNULL(@properties, [properties]) END,
        [archivedAt] = CASE WHEN @archivedAt_Clear = 1 THEN NULL ELSE ISNULL(@archivedAt, [archivedAt]) END,
        [updatedAt] = CASE WHEN @updatedAt_Clear = 1 THEN NULL ELSE ISNULL(@updatedAt, [updatedAt]) END,
        [url] = CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, [url]) END,
        [createdAt] = CASE WHEN @createdAt_Clear = 1 THEN NULL ELSE ISNULL(@createdAt, [createdAt]) END,
        [archived] = CASE WHEN @archived_Clear = 1 THEN NULL ELSE ISNULL(@archived, [archived]) END,
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
        SELECT TOP 0 * FROM [hubspot].[vwContacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [hubspot].[vwContacts]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [hubspot].[spUpdatecontacts] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contacts table
------------------------------------------------------------
IF OBJECT_ID('[hubspot].[trgUpdatecontacts]', 'TR') IS NOT NULL
    DROP TRIGGER [hubspot].[trgUpdatecontacts];
GO
CREATE TRIGGER [hubspot].trgUpdatecontacts
ON [hubspot].[contacts]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [hubspot].[contacts]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [hubspot].[contacts] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Contacts */

GRANT EXECUTE ON [hubspot].[spUpdatecontacts] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spDeletecontacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contacts
------------------------------------------------------------
IF OBJECT_ID('[hubspot].[spDeletecontacts]', 'P') IS NOT NULL
    DROP PROCEDURE [hubspot].[spDeletecontacts];
GO

CREATE PROCEDURE [hubspot].[spDeletecontacts]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [hubspot].[contacts]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [hubspot].[spDeletecontacts] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contacts */

GRANT EXECUTE ON [hubspot].[spDeletecontacts] TO [cdp_Developer], [cdp_Integration];

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

/* Set soft PK for hubspot.contacts.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '94365E45-A9D6-442D-9003-B1E04E5941DE' AND [Name] = 'id';

