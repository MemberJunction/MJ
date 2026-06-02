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
         'e23ee8fd-ded2-465f-847b-f10f672fe318',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e23ee8fd-ded2-465f-847b-f10f672fe318', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e23ee8fd-ded2-465f-847b-f10f672fe318', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e23ee8fd-ded2-465f-847b-f10f672fe318', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e23ee8fd-ded2-465f-847b-f10f672fe318', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '057bfc94-eb56-4e73-969d-e2a12912f1b9' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'ID')) BEGIN
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
            '057bfc94-eb56-4e73-969d-e2a12912f1b9',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5728396c-297a-474e-827e-35cafaaf0380' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'Description')) BEGIN
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
            '5728396c-297a-474e-827e-35cafaaf0380',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35797528-ff64-4d7b-8b77-2d6437f009af' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'AffectedTables')) BEGIN
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
            '35797528-ff64-4d7b-8b77-2d6437f009af',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae64c0ab-76cf-4187-80be-3db748d57f93' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'Success')) BEGIN
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
            'ae64c0ab-76cf-4187-80be-3db748d57f93',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40529df2-c4e9-4bd1-b639-ec81c39229c6' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'APIRestarted')) BEGIN
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
            '40529df2-c4e9-4bd1-b639-ec81c39229c6',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb5a0df8-69dc-43e0-85da-f3703341df88' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'GitCommitSuccess')) BEGIN
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
            'cb5a0df8-69dc-43e0-85da-f3703341df88',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d497467-27a6-4c98-9744-4354d4432852' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'BranchName')) BEGIN
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
            '0d497467-27a6-4c98-9744-4354d4432852',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b44176ba-3dc7-4a9c-8816-3d829091041a' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'MigrationFilePath')) BEGIN
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
            'b44176ba-3dc7-4a9c-8816-3d829091041a',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98b9a8c7-655a-416a-843c-9070e7de9430' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'ErrorMessage')) BEGIN
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
            '98b9a8c7-655a-416a-843c-9070e7de9430',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c05ceeb3-1ac0-43b3-a319-1079ce72628a' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'ErrorStep')) BEGIN
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
            'c05ceeb3-1ac0-43b3-a319-1079ce72628a',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '807a59cb-3dd1-4293-958f-02772cb3ffa3' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'StepsJSON')) BEGIN
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
            '807a59cb-3dd1-4293-958f-02772cb3ffa3',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c29388a9-dc06-4d2c-a0ea-2fc926e61122' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'TotalDurationMs')) BEGIN
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
            'c29388a9-dc06-4d2c-a0ea-2fc926e61122',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31aa3496-42aa-4593-a5d7-5651a001b706' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = 'RunAt')) BEGIN
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
            '31aa3496-42aa-4593-a5d7-5651a001b706',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56df91f1-0e10-4c9e-a3ea-839170baef1c' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = '__mj_CreatedAt')) BEGIN
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
            '56df91f1-0e10-4c9e-a3ea-839170baef1c',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dc1e33d-86e2-4f30-852b-4fa8d0393967' OR (EntityID = 'E23EE8FD-DED2-465F-847B-F10F672FE318' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1dc1e33d-86e2-4f30-852b-4fa8d0393967',
            'E23EE8FD-DED2-465F-847B-F10F672FE318', -- Entity: MJ: RSU Audit Logs
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '057BFC94-EB56-4E73-969D-E2A12912F1B9'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '31AA3496-42AA-4593-A5D7-5651A001B706'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '057BFC94-EB56-4E73-969D-E2A12912F1B9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AE64C0AB-76CF-4187-80BE-3DB748D57F93'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C05CEEB3-1AC0-43B3-A319-1079CE72628A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C29388A9-DC06-4D2C-A0EA-2FC926E61122'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '31AA3496-42AA-4593-A5D7-5651A001B706'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0D497467-27A6-4C98-9744-4354D4432852'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C05CEEB3-1AC0-43B3-A319-1079CE72628A'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0D497467-27A6-4C98-9744-4354D4432852'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'E23EE8FD-DED2-465F-847B-F10F672FE318'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '057BFC94-EB56-4E73-969D-E2A12912F1B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5728396C-297A-474E-827E-35CAFAAF0380' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.AffectedTables 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35797528-FF64-4D7B-8B77-2D6437F009AF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE64C0AB-76CF-4187-80BE-3DB748D57F93' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.APIRestarted 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40529DF2-C4E9-4BD1-B639-EC81C39229C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.GitCommitSuccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CB5A0DF8-69DC-43E0-85DA-F3703341DF88' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.BranchName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Deployment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D497467-27A6-4C98-9744-4354D4432852' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.MigrationFilePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Deployment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B44176BA-3DC7-4A9C-8816-3D829091041A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Error Diagnostics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98B9A8C7-655A-416A-843C-9070E7DE9430' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.ErrorStep 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Error Diagnostics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C05CEEB3-1AC0-43B3-A319-1079CE72628A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.StepsJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '807A59CB-3DD1-4293-958F-02772CB3FFA3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.TotalDurationMs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Duration (ms)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C29388A9-DC06-4D2C-A0EA-2FC926E61122' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.RunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '31AA3496-42AA-4593-A5D7-5651A001B706' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '56DF91F1-0E10-4C9E-A3EA-839170BAEF1C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: RSU Audit Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1DC1E33D-86E2-4F30-852B-4FA8D0393967' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-clipboard-list */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-clipboard-list', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E23EE8FD-DED2-465F-847B-F10F672FE318';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c93a134c-8f86-4531-8c68-a62839a3859f', 'E23EE8FD-DED2-465F-847B-F10F672FE318', 'FieldCategoryInfo', '{"Audit Information":{"icon":"fa fa-info-circle","description":"General operational context and timing of the audit log."},"Execution Status":{"icon":"fa fa-check-circle","description":"Flags indicating the outcome of various system processes."},"Deployment Details":{"icon":"fa fa-code-branch","description":"Technical details regarding code branches and migration paths."},"Error Diagnostics":{"icon":"fa fa-exclamation-triangle","description":"Information regarding failures and the steps where they occurred."},"Execution Details":{"icon":"fa fa-tasks","description":"Detailed performance metrics and step-by-step process logs."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('af9fd005-b6e2-41a3-a8d7-df738460ecc7', 'E23EE8FD-DED2-465F-847B-F10F672FE318', 'FieldCategoryIcons', '{"Audit Information":"fa fa-info-circle","Execution Status":"fa fa-check-circle","Deployment Details":"fa fa-code-branch","Error Diagnostics":"fa fa-exclamation-triangle","Execution Details":"fa fa-tasks","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'E23EE8FD-DED2-465F-847B-F10F672FE318';

