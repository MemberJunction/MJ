/* SQL generated to create new entity MJ: External Data Source Types */

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
         'cdade3e4-d00a-42e7-b385-ce24d533101e',
         'MJ: External Data Source Types',
         'External Data Source Types',
         NULL,
         NULL,
         'ExternalDataSourceType',
         'vwExternalDataSourceTypes',
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

/* SQL generated to add new entity MJ: External Data Source Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cdade3e4-d00a-42e7-b385-ce24d533101e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: External Data Source Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cdade3e4-d00a-42e7-b385-ce24d533101e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: External Data Source Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cdade3e4-d00a-42e7-b385-ce24d533101e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: External Data Source Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cdade3e4-d00a-42e7-b385-ce24d533101e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: External Data Sources */

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
         '078e485b-0cc4-4e2a-adb8-52fe8e571e88',
         'MJ: External Data Sources',
         'External Data Sources',
         NULL,
         NULL,
         'ExternalDataSource',
         'vwExternalDataSources',
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

/* SQL generated to add new entity MJ: External Data Sources to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '078e485b-0cc4-4e2a-adb8-52fe8e571e88', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: External Data Sources for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('078e485b-0cc4-4e2a-adb8-52fe8e571e88', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: External Data Sources for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('078e485b-0cc4-4e2a-adb8-52fe8e571e88', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: External Data Sources for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('078e485b-0cc4-4e2a-adb8-52fe8e571e88', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSource] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
UPDATE [${flyway:defaultSchema}].[ExternalDataSource] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSource] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSource] ADD CONSTRAINT [DF___mj_ExternalDataSource___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSource] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
UPDATE [${flyway:defaultSchema}].[ExternalDataSource] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSource] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSource */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSource] ADD CONSTRAINT [DF___mj_ExternalDataSource___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSourceType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
UPDATE [${flyway:defaultSchema}].[ExternalDataSourceType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSourceType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSourceType] ADD CONSTRAINT [DF___mj_ExternalDataSourceType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSourceType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
UPDATE [${flyway:defaultSchema}].[ExternalDataSourceType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSourceType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ExternalDataSourceType */
ALTER TABLE [${flyway:defaultSchema}].[ExternalDataSourceType] ADD CONSTRAINT [DF___mj_ExternalDataSourceType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6073a31-6099-4cb8-90bd-764a3f3382b9' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'ID')) BEGIN
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
            'd6073a31-6099-4cb8-90bd-764a3f3382b9',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3403700-67f4-4863-b46a-44b4e1eb7487' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'Name')) BEGIN
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
            'a3403700-67f4-4863-b46a-44b4e1eb7487',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100002,
            'Name',
            'Name',
            'Display name of this configured external data source instance.',
            'nvarchar',
            200,
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27bea194-5df9-4c96-a599-51f27fe862dc' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'Description')) BEGIN
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
            '27bea194-5df9-4c96-a599-51f27fe862dc',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100003,
            'Description',
            'Description',
            'Human-readable description of what this data source connects to and what it is used for.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6aafa18f-a053-49ca-9277-88cc7d74dca7' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'TypeID')) BEGIN
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
            '6aafa18f-a053-49ca-9277-88cc7d74dca7',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100004,
            'TypeID',
            'Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'CDADE3E4-D00A-42E7-B385-CE24D533101E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5625762c-9349-45ed-ac3a-fc69477f9f68' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'CredentialID')) BEGIN
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
            '5625762c-9349-45ed-ac3a-fc69477f9f68',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100005,
            'CredentialID',
            'Credential ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77dbb445-ec5d-4a83-9fed-70a377d61cf6' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'DefaultSchema')) BEGIN
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
            '77dbb445-ec5d-4a83-9fed-70a377d61cf6',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100006,
            'DefaultSchema',
            'Default Schema',
            'Default schema/namespace to resolve unqualified ExternalObjectName values against on the remote system (e.g. a SQL schema, Snowflake schema).',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dafdef8-3233-4516-a637-79480f58453c' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'DefaultDatabase')) BEGIN
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
            '1dafdef8-3233-4516-a637-79480f58453c',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100007,
            'DefaultDatabase',
            'Default Database',
            'Default database/catalog on the remote system (e.g. Snowflake database, MongoDB dbName). Nullable when the driver derives it from connection config.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '723f7529-11d7-48af-b83e-98e405747fab' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'ConnectionConfig')) BEGIN
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
            '723f7529-11d7-48af-b83e-98e405747fab',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100008,
            'ConnectionConfig',
            'Connection Config',
            'JSON blob of NON-SECRET driver configuration (host, port, region, warehouse, replica-set name, pool sizing). All secrets flow through CredentialID -> Credential -> CredentialEngine; never store secrets here.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'afaa651d-9cec-40f2-aa8d-eb6bd2420d7d' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'DefaultCacheTTLSeconds')) BEGIN
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
            'afaa651d-9cec-40f2-aa8d-eb6bd2420d7d',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100009,
            'DefaultCacheTTLSeconds',
            'Default Cache TTL Seconds',
            'Default server-side cache TTL (seconds) for reads against this source. External reads use time-based TTL because no event-driven invalidation is possible on remote systems. Default 300.',
            'int',
            4,
            10,
            0,
            0,
            '(300)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c0236eb-792e-4a66-a780-1c5c96932aeb' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'Status')) BEGIN
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
            '6c0236eb-792e-4a66-a780-1c5c96932aeb',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100010,
            'Status',
            'Status',
            'Operational status of this data source: Active (usable), Disabled (RunView fails fast), or TestFailed (last connection test failed).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48af73c5-cb4f-49fc-81bf-e6feef4a9101' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'LastConnectionTestAt')) BEGIN
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
            '48af73c5-cb4f-49fc-81bf-e6feef4a9101',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100011,
            'LastConnectionTestAt',
            'Last Connection Test At',
            'Timestamp of the most recent connection test against this source.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb311195-2b60-4079-a546-a2e96dba0a02' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'LastConnectionTestResult')) BEGIN
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
            'bb311195-2b60-4079-a546-a2e96dba0a02',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100012,
            'LastConnectionTestResult',
            'Last Connection Test Result',
            'Result message from the most recent connection test (success detail or error text).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c9f2d93-8433-4af4-8d54-daf305cb487e' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1c9f2d93-8433-4af4-8d54-daf305cb487e',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fddf0eec-6a23-430c-b2cd-85335cfa3bb7' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'fddf0eec-6a23-430c-b2cd-85335cfa3bb7',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100014,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c919dae-c8e3-46be-a0b7-a7c96b56dfa8' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExternalDataSourceID')) BEGIN
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
            '3c919dae-c8e3-46be-a0b7-a7c96b56dfa8',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100139,
            'ExternalDataSourceID',
            'External Data Source ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1ec0ed5-1bfa-4170-8ab5-67d57e63375e' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExternalObjectName')) BEGIN
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
            'f1ec0ed5-1bfa-4170-8ab5-67d57e63375e',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100140,
            'ExternalObjectName',
            'External Object Name',
            'Remote object name (table / view / collection) on the external system that backs this entity. Resolved against the data source DefaultSchema/DefaultDatabase when unqualified. Only meaningful when ExternalDataSourceID is set.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0dc54c5-5cf5-4753-94f7-bf85b38c4a35' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExternalDataSourceID')) BEGIN
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
            'a0dc54c5-5cf5-4753-94f7-bf85b38c4a35',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            100053,
            'ExternalDataSourceID',
            'External Data Source ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d64f1b8-273c-4ade-bc2a-15919cc1f0aa' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'ID')) BEGIN
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
            '7d64f1b8-273c-4ade-bc2a-15919cc1f0aa',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf3525c4-6278-483d-9ad8-4ccb8a01f205' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'Name')) BEGIN
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
            'bf3525c4-6278-483d-9ad8-4ccb8a01f205',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100002,
            'Name',
            'Name',
            'Display name of the external data source driver type (e.g. Snowflake, Oracle, MongoDB, PostgreSQL).',
            'nvarchar',
            200,
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ead289c-ac6a-494b-bbf4-f45f7e0d2489' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'Description')) BEGIN
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
            '7ead289c-ac6a-494b-bbf4-f45f7e0d2489',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100003,
            'Description',
            'Description',
            'Human-readable description of the driver type and what remote systems it targets.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8d853c5-4361-4101-a0e9-398ace90071a' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'DriverClass')) BEGIN
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
            'f8d853c5-4361-4101-a0e9-398ace90071a',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100004,
            'DriverClass',
            'Driver Class',
            'Driver class resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseExternalDataSourceDriver, DriverClass). MUST match the @RegisterClass key on the concrete driver (e.g. ''SnowflakeExternalDriver'').',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40913359-7e31-4c54-a11c-298c83b3d5e5' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'RequiredCredentialTypeID')) BEGIN
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
            '40913359-7e31-4c54-a11c-298c83b3d5e5',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100005,
            'RequiredCredentialTypeID',
            'Required Credential Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'D512FF2E-A140-45A2-979A-20657AB77137',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b2d92bc-b258-4f84-9822-fb33ba1f86ef' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'MetadataIntrospectionStrategy')) BEGIN
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
            '3b2d92bc-b258-4f84-9822-fb33ba1f86ef',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100006,
            'MetadataIntrospectionStrategy',
            'Metadata Introspection Strategy',
            'How the metadata-introspection command hydrates Entity/EntityField rows from this driver family: InformationSchema (ANSI INFORMATION_SCHEMA), NativeCatalog (vendor catalog views), SampledDocuments (infer shape from sampled documents, e.g. MongoDB), or Manual (no automated introspection).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Manual',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6a19099-6c1b-4bfa-a888-cb5d0a888a79' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'FilterDialect')) BEGIN
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
            'd6a19099-6c1b-4bfa-a888-cb5d0a888a79',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100007,
            'FilterDialect',
            'Filter Dialect',
            'Dialect the driver expects for RunView filter pass-through: tsql, ansi, pgsql, mysql, oracle, or mongo-ast (MongoDB filter AST translated within the driver).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'ansi',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '148e0d1d-551e-4519-a4b8-3f210733b808' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'PagingStrategy')) BEGIN
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
            '148e0d1d-551e-4519-a4b8-3f210733b808',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100008,
            'PagingStrategy',
            'Paging Strategy',
            'Pagination mechanism the driver uses: OffsetFetch (SQL Server OFFSET/FETCH), LimitOffset (Postgres/MySQL LIMIT/OFFSET), TopSkip, or Cursor.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'LimitOffset',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8754fded-3db8-4fd4-8980-4e7cb9569e2e' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'SupportsSchemaIntrospection')) BEGIN
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
            '8754fded-3db8-4fd4-8980-4e7cb9569e2e',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100009,
            'SupportsSchemaIntrospection',
            'Supports Schema Introspection',
            'Whether the driver can introspect remote schema metadata to assist Entity/EntityField generation.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d7c10f6-1488-4d9f-b3e6-ab9430cd580a' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'SupportsNativeQueries')) BEGIN
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
            '7d7c10f6-1488-4d9f-b3e6-ab9430cd580a',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100010,
            'SupportsNativeQueries',
            'Supports Native Queries',
            'Whether the driver supports native-dialect query execution for MJ Queries that set ExternalDataSourceID.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fb10937-e957-44d5-b690-416fb5dd79cc' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'SupportsReadWrite')) BEGIN
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
            '5fb10937-e957-44d5-b690-416fb5dd79cc',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100011,
            'SupportsReadWrite',
            'Supports Read Write',
            'Reserved for a future write-capable phase. Always 0 in the current read-only design; external entities are read-only.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14efec98-67bd-4f62-9391-f47895b7b4a9' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'Status')) BEGIN
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
            '14efec98-67bd-4f62-9391-f47895b7b4a9',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100012,
            'Status',
            'Status',
            'Lifecycle status of the driver-type catalog entry: Active or Deprecated.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ad3b84f-9847-4375-b451-50fc836b0fe9' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0ad3b84f-9847-4375-b451-50fc836b0fe9',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5077a27-6b66-4656-9fb4-eef56f45d792' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'c5077a27-6b66-4656-9fb4-eef56f45d792',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100014,
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

/* SQL text to insert entity field value with ID 39f46dfe-cff6-4d60-9267-5f2ebf7d98e9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('39f46dfe-cff6-4d60-9267-5f2ebf7d98e9', '3B2D92BC-B258-4F84-9822-FB33BA1F86EF', 1, 'InformationSchema', 'InformationSchema', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 88160840-1171-4d8b-931c-c67566bb4ce2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('88160840-1171-4d8b-931c-c67566bb4ce2', '3B2D92BC-B258-4F84-9822-FB33BA1F86EF', 2, 'Manual', 'Manual', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f1b28864-c688-4030-b4ae-6e4c055b5ad2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1b28864-c688-4030-b4ae-6e4c055b5ad2', '3B2D92BC-B258-4F84-9822-FB33BA1F86EF', 3, 'NativeCatalog', 'NativeCatalog', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0ad7e34a-f1b3-49d1-8355-6bf209723f6c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0ad7e34a-f1b3-49d1-8355-6bf209723f6c', '3B2D92BC-B258-4F84-9822-FB33BA1F86EF', 4, 'SampledDocuments', 'SampledDocuments', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3B2D92BC-B258-4F84-9822-FB33BA1F86EF */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3B2D92BC-B258-4F84-9822-FB33BA1F86EF';

/* SQL text to insert entity field value with ID 2ff4652d-7304-4ba5-8502-fc0b1dd53999 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2ff4652d-7304-4ba5-8502-fc0b1dd53999', 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79', 1, 'ansi', 'ansi', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 89415e8d-cd5e-4e86-801f-fe00db2f7a52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('89415e8d-cd5e-4e86-801f-fe00db2f7a52', 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79', 2, 'mongo-ast', 'mongo-ast', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dc537248-18cf-4634-8e33-132f9a7f3f7a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dc537248-18cf-4634-8e33-132f9a7f3f7a', 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79', 3, 'mysql', 'mysql', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ae5d4906-3417-4406-ae54-bf94f60f1046 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ae5d4906-3417-4406-ae54-bf94f60f1046', 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79', 4, 'oracle', 'oracle', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 100a5314-97a6-4aaf-9855-e06ae522c0f7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('100a5314-97a6-4aaf-9855-e06ae522c0f7', 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79', 5, 'pgsql', 'pgsql', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 93655491-92ee-4567-87b5-13021a55e2f7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('93655491-92ee-4567-87b5-13021a55e2f7', 'D6A19099-6C1B-4BFA-A888-CB5D0A888A79', 6, 'tsql', 'tsql', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D6A19099-6C1B-4BFA-A888-CB5D0A888A79 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D6A19099-6C1B-4BFA-A888-CB5D0A888A79';

/* SQL text to insert entity field value with ID 4a5d72bd-e9d6-4ee6-9104-5d04a1d312d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4a5d72bd-e9d6-4ee6-9104-5d04a1d312d8', '148E0D1D-551E-4519-A4B8-3F210733B808', 1, 'Cursor', 'Cursor', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6a859c35-05fc-4863-b4ea-0458ce81b199 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6a859c35-05fc-4863-b4ea-0458ce81b199', '148E0D1D-551E-4519-A4B8-3F210733B808', 2, 'LimitOffset', 'LimitOffset', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 05b21524-ac55-47b4-bc29-c602e038dd74 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('05b21524-ac55-47b4-bc29-c602e038dd74', '148E0D1D-551E-4519-A4B8-3F210733B808', 3, 'OffsetFetch', 'OffsetFetch', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cf5516cc-6358-42d4-8897-e4b707b6b7a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cf5516cc-6358-42d4-8897-e4b707b6b7a9', '148E0D1D-551E-4519-A4B8-3F210733B808', 4, 'TopSkip', 'TopSkip', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 148E0D1D-551E-4519-A4B8-3F210733B808 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='148E0D1D-551E-4519-A4B8-3F210733B808';

/* SQL text to insert entity field value with ID 76c93713-8d79-4bdf-a250-f50c465d01c4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76c93713-8d79-4bdf-a250-f50c465d01c4', '14EFEC98-67BD-4F62-9391-F47895B7B4A9', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 968bb886-0701-41e2-80dd-661ae3bc03e6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('968bb886-0701-41e2-80dd-661ae3bc03e6', '14EFEC98-67BD-4F62-9391-F47895B7B4A9', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 14EFEC98-67BD-4F62-9391-F47895B7B4A9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='14EFEC98-67BD-4F62-9391-F47895B7B4A9';

/* SQL text to insert entity field value with ID a0beb3c7-eac2-4fdf-89c3-51accdc48590 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a0beb3c7-eac2-4fdf-89c3-51accdc48590', '6C0236EB-792E-4A66-A780-1C5C96932AEB', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8387838c-4c47-4736-95bb-997788b94183 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8387838c-4c47-4736-95bb-997788b94183', '6C0236EB-792E-4A66-A780-1C5C96932AEB', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b170bc1d-0157-4aad-8d2c-6196a58ecc5e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b170bc1d-0157-4aad-8d2c-6196a58ecc5e', '6C0236EB-792E-4A66-A780-1C5C96932AEB', 3, 'TestFailed', 'TestFailed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6C0236EB-792E-4A66-A780-1C5C96932AEB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6C0236EB-792E-4A66-A780-1C5C96932AEB';


/* Create Entity Relationship: MJ: Credential Types -> MJ: External Data Source Types (One To Many via RequiredCredentialTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cccf715d-2712-4e46-9ea0-6ec825bf80f0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cccf715d-2712-4e46-9ea0-6ec825bf80f0', 'D512FF2E-A140-45A2-979A-20657AB77137', 'CDADE3E4-D00A-42E7-B385-CE24D533101E', 'RequiredCredentialTypeID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: External Data Sources -> MJ: Queries (One To Many via ExternalDataSourceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9e00884a-f97a-4b05-a3ae-45aa8e26958b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9e00884a-f97a-4b05-a3ae-45aa8e26958b', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'ExternalDataSourceID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: External Data Sources -> MJ: Entities (One To Many via ExternalDataSourceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cdca657b-1e6f-443e-8369-f043a772d012'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cdca657b-1e6f-443e-8369-f043a772d012', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ExternalDataSourceID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Credentials -> MJ: External Data Sources (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2b763a98-6684-40d0-aad9-73d618e205e4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2b763a98-6684-40d0-aad9-73d618e205e4', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'CredentialID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: External Data Source Types -> MJ: External Data Sources (One To Many via TypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9b131f8e-b389-4d3a-8941-9ecef5c4bad5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9b131f8e-b389-4d3a-8941-9ecef5c4bad5', 'CDADE3E4-D00A-42E7-B385-CE24D533101E', '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', 'TypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

-- Index for foreign key ExternalDataSourceID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID ON [${flyway:defaultSchema}].[Entity] ([ExternalDataSourceID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @NameSuffix_Clear bit = 0,
    @NameSuffix nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog_Clear bit = 0,
    @FullTextCatalog nvarchar(255) = NULL,
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex_Clear bit = 0,
    @FullTextIndex nvarchar(255) = NULL,
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction_Clear bit = 0,
    @FullTextSearchFunction nvarchar(255) = NULL,
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows_Clear bit = 0,
    @UserViewMaxRows int = NULL,
    @spCreate_Clear bit = 0,
    @spCreate nvarchar(255) = NULL,
    @spUpdate_Clear bit = 0,
    @spUpdate nvarchar(255) = NULL,
    @spDelete_Clear bit = 0,
    @spDelete nvarchar(255) = NULL,
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch_Clear bit = 0,
    @spMatch nvarchar(255) = NULL,
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName_Clear bit = 0,
    @EntityObjectSubclassName nvarchar(255) = NULL,
    @EntityObjectSubclassImport_Clear bit = 0,
    @EntityObjectSubclassImport nvarchar(255) = NULL,
    @PreferredCommunicationField_Clear bit = 0,
    @PreferredCommunicationField nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder_Clear bit = 0,
    @RowsToPackSampleOrder nvarchar(MAX) = NULL,
    @AutoRowCountFrequency_Clear bit = 0,
    @AutoRowCountFrequency int = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @RowCountRunAt_Clear bit = 0,
    @RowCountRunAt datetimeoffset = NULL,
    @Status nvarchar(25) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL,
    @AllowCaching bit = NULL,
    @DetectExternalChanges bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @ExternalObjectName_Clear bit = 0,
    @ExternalObjectName nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding],
                [AllowCaching],
                [DetectExternalChanges],
                [ExternalDataSourceID],
                [ExternalObjectName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, NULL) END,
                ISNULL(@FullTextCatalogGenerated, 1),
                CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, NULL) END,
                ISNULL(@FullTextIndexGenerated, 1),
                CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, NULL) END,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, 1000) END,
                CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, NULL) END,
                CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, NULL) END,
                CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, NULL) END,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, NULL) END,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, NULL) END,
                CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, NULL) END,
                CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, NULL) END,
                CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, NULL) END,
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1),
                ISNULL(@AllowCaching, 0),
                ISNULL(@DetectExternalChanges, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding],
                [AllowCaching],
                [DetectExternalChanges],
                [ExternalDataSourceID],
                [ExternalObjectName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, NULL) END,
                ISNULL(@FullTextCatalogGenerated, 1),
                CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, NULL) END,
                ISNULL(@FullTextIndexGenerated, 1),
                CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, NULL) END,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, 1000) END,
                CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, NULL) END,
                CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, NULL) END,
                CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, NULL) END,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, NULL) END,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, NULL) END,
                CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, NULL) END,
                CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, NULL) END,
                CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, NULL) END,
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1),
                ISNULL(@AllowCaching, 0),
                ISNULL(@DetectExternalChanges, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @NameSuffix_Clear bit = 0,
    @NameSuffix nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255) = NULL,
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog_Clear bit = 0,
    @FullTextCatalog nvarchar(255) = NULL,
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex_Clear bit = 0,
    @FullTextIndex nvarchar(255) = NULL,
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction_Clear bit = 0,
    @FullTextSearchFunction nvarchar(255) = NULL,
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows_Clear bit = 0,
    @UserViewMaxRows int = NULL,
    @spCreate_Clear bit = 0,
    @spCreate nvarchar(255) = NULL,
    @spUpdate_Clear bit = 0,
    @spUpdate nvarchar(255) = NULL,
    @spDelete_Clear bit = 0,
    @spDelete nvarchar(255) = NULL,
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch_Clear bit = 0,
    @spMatch nvarchar(255) = NULL,
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName_Clear bit = 0,
    @EntityObjectSubclassName nvarchar(255) = NULL,
    @EntityObjectSubclassImport_Clear bit = 0,
    @EntityObjectSubclassImport nvarchar(255) = NULL,
    @PreferredCommunicationField_Clear bit = 0,
    @PreferredCommunicationField nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder_Clear bit = 0,
    @RowsToPackSampleOrder nvarchar(MAX) = NULL,
    @AutoRowCountFrequency_Clear bit = 0,
    @AutoRowCountFrequency int = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @RowCountRunAt_Clear bit = 0,
    @RowCountRunAt datetimeoffset = NULL,
    @Status nvarchar(25) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL,
    @AllowCaching bit = NULL,
    @DetectExternalChanges bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @ExternalObjectName_Clear bit = 0,
    @ExternalObjectName nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [NameSuffix] = CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, [NameSuffix]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AutoUpdateDescription] = ISNULL(@AutoUpdateDescription, [AutoUpdateDescription]),
        [BaseView] = ISNULL(@BaseView, [BaseView]),
        [BaseViewGenerated] = ISNULL(@BaseViewGenerated, [BaseViewGenerated]),
        [VirtualEntity] = ISNULL(@VirtualEntity, [VirtualEntity]),
        [TrackRecordChanges] = ISNULL(@TrackRecordChanges, [TrackRecordChanges]),
        [AuditRecordAccess] = ISNULL(@AuditRecordAccess, [AuditRecordAccess]),
        [AuditViewRuns] = ISNULL(@AuditViewRuns, [AuditViewRuns]),
        [IncludeInAPI] = ISNULL(@IncludeInAPI, [IncludeInAPI]),
        [AllowAllRowsAPI] = ISNULL(@AllowAllRowsAPI, [AllowAllRowsAPI]),
        [AllowUpdateAPI] = ISNULL(@AllowUpdateAPI, [AllowUpdateAPI]),
        [AllowCreateAPI] = ISNULL(@AllowCreateAPI, [AllowCreateAPI]),
        [AllowDeleteAPI] = ISNULL(@AllowDeleteAPI, [AllowDeleteAPI]),
        [CustomResolverAPI] = ISNULL(@CustomResolverAPI, [CustomResolverAPI]),
        [AllowUserSearchAPI] = ISNULL(@AllowUserSearchAPI, [AllowUserSearchAPI]),
        [FullTextSearchEnabled] = ISNULL(@FullTextSearchEnabled, [FullTextSearchEnabled]),
        [FullTextCatalog] = CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, [FullTextCatalog]) END,
        [FullTextCatalogGenerated] = ISNULL(@FullTextCatalogGenerated, [FullTextCatalogGenerated]),
        [FullTextIndex] = CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, [FullTextIndex]) END,
        [FullTextIndexGenerated] = ISNULL(@FullTextIndexGenerated, [FullTextIndexGenerated]),
        [FullTextSearchFunction] = CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, [FullTextSearchFunction]) END,
        [FullTextSearchFunctionGenerated] = ISNULL(@FullTextSearchFunctionGenerated, [FullTextSearchFunctionGenerated]),
        [UserViewMaxRows] = CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, [UserViewMaxRows]) END,
        [spCreate] = CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, [spCreate]) END,
        [spUpdate] = CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, [spUpdate]) END,
        [spDelete] = CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, [spDelete]) END,
        [spCreateGenerated] = ISNULL(@spCreateGenerated, [spCreateGenerated]),
        [spUpdateGenerated] = ISNULL(@spUpdateGenerated, [spUpdateGenerated]),
        [spDeleteGenerated] = ISNULL(@spDeleteGenerated, [spDeleteGenerated]),
        [CascadeDeletes] = ISNULL(@CascadeDeletes, [CascadeDeletes]),
        [DeleteType] = ISNULL(@DeleteType, [DeleteType]),
        [AllowRecordMerge] = ISNULL(@AllowRecordMerge, [AllowRecordMerge]),
        [spMatch] = CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, [spMatch]) END,
        [RelationshipDefaultDisplayType] = ISNULL(@RelationshipDefaultDisplayType, [RelationshipDefaultDisplayType]),
        [UserFormGenerated] = ISNULL(@UserFormGenerated, [UserFormGenerated]),
        [EntityObjectSubclassName] = CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, [EntityObjectSubclassName]) END,
        [EntityObjectSubclassImport] = CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, [EntityObjectSubclassImport]) END,
        [PreferredCommunicationField] = CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, [PreferredCommunicationField]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [ScopeDefault] = CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, [ScopeDefault]) END,
        [RowsToPackWithSchema] = ISNULL(@RowsToPackWithSchema, [RowsToPackWithSchema]),
        [RowsToPackSampleMethod] = ISNULL(@RowsToPackSampleMethod, [RowsToPackSampleMethod]),
        [RowsToPackSampleCount] = ISNULL(@RowsToPackSampleCount, [RowsToPackSampleCount]),
        [RowsToPackSampleOrder] = CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, [RowsToPackSampleOrder]) END,
        [AutoRowCountFrequency] = CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, [AutoRowCountFrequency]) END,
        [RowCount] = CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, [RowCount]) END,
        [RowCountRunAt] = CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, [RowCountRunAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [AllowMultipleSubtypes] = ISNULL(@AllowMultipleSubtypes, [AllowMultipleSubtypes]),
        [AutoUpdateFullTextSearch] = ISNULL(@AutoUpdateFullTextSearch, [AutoUpdateFullTextSearch]),
        [AutoUpdateAllowUserSearchAPI] = ISNULL(@AutoUpdateAllowUserSearchAPI, [AutoUpdateAllowUserSearchAPI]),
        [TrustServerCacheCompletely] = ISNULL(@TrustServerCacheCompletely, [TrustServerCacheCompletely]),
        [SupportsGeoCoding] = ISNULL(@SupportsGeoCoding, [SupportsGeoCoding]),
        [AutoUpdateSupportsGeoCoding] = ISNULL(@AutoUpdateSupportsGeoCoding, [AutoUpdateSupportsGeoCoding]),
        [AllowCaching] = ISNULL(@AllowCaching, [AllowCaching]),
        [DetectExternalChanges] = ISNULL(@DetectExternalChanges, [DetectExternalChanges]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [ExternalObjectName] = CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, [ExternalObjectName]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ExternalDataSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RequiredCredentialTypeID in table ExternalDataSourceType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalDataSourceType_RequiredCredentialTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalDataSourceType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalDataSourceType_RequiredCredentialTypeID ON [${flyway:defaultSchema}].[ExternalDataSourceType] ([RequiredCredentialTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 40913359-7E31-4C54-A11C-298C83B3D5E5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='40913359-7E31-4C54-A11C-298C83B3D5E5', @RelatedEntityNameFieldMap='RequiredCredentialType';

/* Index for Foreign Keys for ExternalDataSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TypeID in table ExternalDataSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalDataSource_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalDataSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalDataSource_TypeID ON [${flyway:defaultSchema}].[ExternalDataSource] ([TypeID]);

-- Index for foreign key CredentialID in table ExternalDataSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ExternalDataSource_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ExternalDataSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ExternalDataSource_CredentialID ON [${flyway:defaultSchema}].[ExternalDataSource] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID 6AAFA18F-A053-49CA-9277-88CC7D74DCA7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6AAFA18F-A053-49CA-9277-88CC7D74DCA7', @RelatedEntityNameFieldMap='Type';

/* SQL text to update entity field related entity name field map for entity field ID 5625762C-9349-45ED-AC3A-FC69477F9F68 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5625762C-9349-45ED-AC3A-FC69477F9F68', @RelatedEntityNameFieldMap='Credential';

/* Base View SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: vwExternalDataSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: External Data Source Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExternalDataSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExternalDataSourceTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExternalDataSourceTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExternalDataSourceTypes]
AS
SELECT
    e.*,
    MJCredentialType_RequiredCredentialTypeID.[Name] AS [RequiredCredentialType]
FROM
    [${flyway:defaultSchema}].[ExternalDataSourceType] AS e
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS MJCredentialType_RequiredCredentialTypeID
  ON
    [e].[RequiredCredentialTypeID] = MJCredentialType_RequiredCredentialTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalDataSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: Permissions for vwExternalDataSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalDataSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: spCreateExternalDataSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalDataSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalDataSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSourceType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255),
    @RequiredCredentialTypeID_Clear bit = 0,
    @RequiredCredentialTypeID uniqueidentifier = NULL,
    @MetadataIntrospectionStrategy nvarchar(50) = NULL,
    @FilterDialect nvarchar(50) = NULL,
    @PagingStrategy nvarchar(50) = NULL,
    @SupportsSchemaIntrospection bit = NULL,
    @SupportsNativeQueries bit = NULL,
    @SupportsReadWrite bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSourceType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [RequiredCredentialTypeID],
                [MetadataIntrospectionStrategy],
                [FilterDialect],
                [PagingStrategy],
                [SupportsSchemaIntrospection],
                [SupportsNativeQueries],
                [SupportsReadWrite],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @RequiredCredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequiredCredentialTypeID, NULL) END,
                ISNULL(@MetadataIntrospectionStrategy, 'Manual'),
                ISNULL(@FilterDialect, 'ansi'),
                ISNULL(@PagingStrategy, 'LimitOffset'),
                ISNULL(@SupportsSchemaIntrospection, 1),
                ISNULL(@SupportsNativeQueries, 1),
                ISNULL(@SupportsReadWrite, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSourceType]
            (
                [Name],
                [Description],
                [DriverClass],
                [RequiredCredentialTypeID],
                [MetadataIntrospectionStrategy],
                [FilterDialect],
                [PagingStrategy],
                [SupportsSchemaIntrospection],
                [SupportsNativeQueries],
                [SupportsReadWrite],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @RequiredCredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequiredCredentialTypeID, NULL) END,
                ISNULL(@MetadataIntrospectionStrategy, 'Manual'),
                ISNULL(@FilterDialect, 'ansi'),
                ISNULL(@PagingStrategy, 'LimitOffset'),
                ISNULL(@SupportsSchemaIntrospection, 1),
                ISNULL(@SupportsNativeQueries, 1),
                ISNULL(@SupportsReadWrite, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalDataSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: External Data Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: spUpdateExternalDataSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalDataSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalDataSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @RequiredCredentialTypeID_Clear bit = 0,
    @RequiredCredentialTypeID uniqueidentifier = NULL,
    @MetadataIntrospectionStrategy nvarchar(50) = NULL,
    @FilterDialect nvarchar(50) = NULL,
    @PagingStrategy nvarchar(50) = NULL,
    @SupportsSchemaIntrospection bit = NULL,
    @SupportsNativeQueries bit = NULL,
    @SupportsReadWrite bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSourceType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [RequiredCredentialTypeID] = CASE WHEN @RequiredCredentialTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequiredCredentialTypeID, [RequiredCredentialTypeID]) END,
        [MetadataIntrospectionStrategy] = ISNULL(@MetadataIntrospectionStrategy, [MetadataIntrospectionStrategy]),
        [FilterDialect] = ISNULL(@FilterDialect, [FilterDialect]),
        [PagingStrategy] = ISNULL(@PagingStrategy, [PagingStrategy]),
        [SupportsSchemaIntrospection] = ISNULL(@SupportsSchemaIntrospection, [SupportsSchemaIntrospection]),
        [SupportsNativeQueries] = ISNULL(@SupportsNativeQueries, [SupportsNativeQueries]),
        [SupportsReadWrite] = ISNULL(@SupportsReadWrite, [SupportsReadWrite]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalDataSourceTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalDataSourceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSourceType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalDataSourceType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalDataSourceType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalDataSourceType
ON [${flyway:defaultSchema}].[ExternalDataSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalDataSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: External Data Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: External Data Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Source Types
-- Item: spDeleteExternalDataSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExternalDataSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExternalDataSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalDataSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalDataSourceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExternalDataSourceType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: External Data Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalDataSourceType] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: vwExternalDataSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: External Data Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ExternalDataSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwExternalDataSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwExternalDataSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwExternalDataSources]
AS
SELECT
    e.*,
    MJExternalDataSourceType_TypeID.[Name] AS [Type],
    MJCredential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[ExternalDataSource] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ExternalDataSourceType] AS MJExternalDataSourceType_TypeID
  ON
    [e].[TypeID] = MJExternalDataSourceType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [e].[CredentialID] = MJCredential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalDataSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: Permissions for vwExternalDataSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwExternalDataSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: spCreateExternalDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExternalDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateExternalDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateExternalDataSource]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @DefaultSchema_Clear bit = 0,
    @DefaultSchema nvarchar(255) = NULL,
    @DefaultDatabase_Clear bit = 0,
    @DefaultDatabase nvarchar(255) = NULL,
    @ConnectionConfig_Clear bit = 0,
    @ConnectionConfig nvarchar(MAX) = NULL,
    @DefaultCacheTTLSeconds int = NULL,
    @Status nvarchar(20) = NULL,
    @LastConnectionTestAt_Clear bit = 0,
    @LastConnectionTestAt datetimeoffset = NULL,
    @LastConnectionTestResult_Clear bit = 0,
    @LastConnectionTestResult nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSource]
            (
                [ID],
                [Name],
                [Description],
                [TypeID],
                [CredentialID],
                [DefaultSchema],
                [DefaultDatabase],
                [ConnectionConfig],
                [DefaultCacheTTLSeconds],
                [Status],
                [LastConnectionTestAt],
                [LastConnectionTestResult]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                CASE WHEN @DefaultSchema_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSchema, NULL) END,
                CASE WHEN @DefaultDatabase_Clear = 1 THEN NULL ELSE ISNULL(@DefaultDatabase, NULL) END,
                CASE WHEN @ConnectionConfig_Clear = 1 THEN NULL ELSE ISNULL(@ConnectionConfig, NULL) END,
                ISNULL(@DefaultCacheTTLSeconds, 300),
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastConnectionTestAt_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestAt, NULL) END,
                CASE WHEN @LastConnectionTestResult_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestResult, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ExternalDataSource]
            (
                [Name],
                [Description],
                [TypeID],
                [CredentialID],
                [DefaultSchema],
                [DefaultDatabase],
                [ConnectionConfig],
                [DefaultCacheTTLSeconds],
                [Status],
                [LastConnectionTestAt],
                [LastConnectionTestResult]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TypeID,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                CASE WHEN @DefaultSchema_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSchema, NULL) END,
                CASE WHEN @DefaultDatabase_Clear = 1 THEN NULL ELSE ISNULL(@DefaultDatabase, NULL) END,
                CASE WHEN @ConnectionConfig_Clear = 1 THEN NULL ELSE ISNULL(@ConnectionConfig, NULL) END,
                ISNULL(@DefaultCacheTTLSeconds, 300),
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastConnectionTestAt_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestAt, NULL) END,
                CASE WHEN @LastConnectionTestResult_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestResult, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwExternalDataSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: External Data Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: spUpdateExternalDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExternalDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateExternalDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateExternalDataSource]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TypeID uniqueidentifier = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @DefaultSchema_Clear bit = 0,
    @DefaultSchema nvarchar(255) = NULL,
    @DefaultDatabase_Clear bit = 0,
    @DefaultDatabase nvarchar(255) = NULL,
    @ConnectionConfig_Clear bit = 0,
    @ConnectionConfig nvarchar(MAX) = NULL,
    @DefaultCacheTTLSeconds int = NULL,
    @Status nvarchar(20) = NULL,
    @LastConnectionTestAt_Clear bit = 0,
    @LastConnectionTestAt datetimeoffset = NULL,
    @LastConnectionTestResult_Clear bit = 0,
    @LastConnectionTestResult nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSource]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TypeID] = ISNULL(@TypeID, [TypeID]),
        [CredentialID] = CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, [CredentialID]) END,
        [DefaultSchema] = CASE WHEN @DefaultSchema_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSchema, [DefaultSchema]) END,
        [DefaultDatabase] = CASE WHEN @DefaultDatabase_Clear = 1 THEN NULL ELSE ISNULL(@DefaultDatabase, [DefaultDatabase]) END,
        [ConnectionConfig] = CASE WHEN @ConnectionConfig_Clear = 1 THEN NULL ELSE ISNULL(@ConnectionConfig, [ConnectionConfig]) END,
        [DefaultCacheTTLSeconds] = ISNULL(@DefaultCacheTTLSeconds, [DefaultCacheTTLSeconds]),
        [Status] = ISNULL(@Status, [Status]),
        [LastConnectionTestAt] = CASE WHEN @LastConnectionTestAt_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestAt, [LastConnectionTestAt]) END,
        [LastConnectionTestResult] = CASE WHEN @LastConnectionTestResult_Clear = 1 THEN NULL ELSE ISNULL(@LastConnectionTestResult, [LastConnectionTestResult]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwExternalDataSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwExternalDataSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExternalDataSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateExternalDataSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateExternalDataSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateExternalDataSource
ON [${flyway:defaultSchema}].[ExternalDataSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ExternalDataSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ExternalDataSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: External Data Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: External Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: External Data Sources
-- Item: spDeleteExternalDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExternalDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteExternalDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteExternalDataSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ExternalDataSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalDataSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: External Data Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteExternalDataSource] TO [cdp_Developer], [cdp_Integration];

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

-- Index for foreign key ExternalDataSourceID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID ON [${flyway:defaultSchema}].[Query] ([ExternalDataSourceID]);

/* SQL text to update entity field related entity name field map for entity field ID A0DC54C5-5CF5-4753-94F7-BF85B38C4A35 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A0DC54C5-5CF5-4753-94F7-BF85B38C4A35', @RelatedEntityNameFieldMap='ExternalDataSource';

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
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect],
    MJExternalDataSource_ExternalDataSourceID.[Name] AS [ExternalDataSource]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExternalDataSource] AS MJExternalDataSource_ExternalDataSourceID
  ON
    [q].[ExternalDataSourceID] = MJExternalDataSource_ExternalDataSourceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

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
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL
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
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END
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
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

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
    @Name nvarchar(255) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [UserQuestion] = CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, [UserQuestion]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SQL] = CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, [SQL]) END,
        [TechnicalDescription] = CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, [TechnicalDescription]) END,
        [OriginalSQL] = CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, [OriginalSQL]) END,
        [Feedback] = CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, [Feedback]) END,
        [Status] = ISNULL(@Status, [Status]),
        [QualityRank] = CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, [QualityRank]) END,
        [ExecutionCostRank] = CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, [ExecutionCostRank]) END,
        [UsesTemplate] = CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, [UsesTemplate]) END,
        [AuditQueryRuns] = ISNULL(@AuditQueryRuns, [AuditQueryRuns]),
        [CacheEnabled] = ISNULL(@CacheEnabled, [CacheEnabled]),
        [CacheTTLMinutes] = CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, [CacheTTLMinutes]) END,
        [CacheMaxSize] = CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, [CacheMaxSize]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [CacheValidationSQL] = CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, [CacheValidationSQL]) END,
        [SQLDialectID] = ISNULL(@SQLDialectID, [SQLDialectID]),
        [Reusable] = ISNULL(@Reusable, [Reusable]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration];

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
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @MJDataContextItems_QueryIDID, @DataContextID = @MJDataContextItems_QueryID_DataContextID, @Type = @MJDataContextItems_QueryID_Type, @ViewID = @MJDataContextItems_QueryID_ViewID, @QueryID_Clear = 1, @QueryID = @MJDataContextItems_QueryID_QueryID, @EntityID = @MJDataContextItems_QueryID_EntityID, @RecordID = @MJDataContextItems_QueryID_RecordID, @SQL = @MJDataContextItems_QueryID_SQL, @DataJSON = @MJDataContextItems_QueryID_DataJSON, @LastRefreshedAt = @MJDataContextItems_QueryID_LastRefreshedAt, @Description = @MJDataContextItems_QueryID_Description, @CodeName = @MJDataContextItems_QueryID_CodeName

        FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName
    END

    CLOSE cascade_update_MJDataContextItems_QueryID_cursor
    DEALLOCATE cascade_update_MJDataContextItems_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_DependsOnQueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [DependsOnQueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_DependsOnQueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c373866-c3d1-416d-a104-3a049981e125' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'Type')) BEGIN
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
            '2c373866-c3d1-416d-a104-3a049981e125',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100029,
            'Type',
            'Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31445afd-4067-4a95-8794-f40b9e27c145' OR (EntityID = '078E485B-0CC4-4E2A-ADB8-52FE8E571E88' AND Name = 'Credential')) BEGIN
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
            '31445afd-4067-4a95-8794-f40b9e27c145',
            '078E485B-0CC4-4E2A-ADB8-52FE8E571E88', -- Entity: MJ: External Data Sources
            100030,
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71c80e4f-6b53-4e83-87c5-f964f76a8468' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ExternalDataSource')) BEGIN
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
            '71c80e4f-6b53-4e83-87c5-f964f76a8468',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            100057,
            'ExternalDataSource',
            'External Data Source',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3770f28-703b-4e79-b7cb-d90f71c1d173' OR (EntityID = 'CDADE3E4-D00A-42E7-B385-CE24D533101E' AND Name = 'RequiredCredentialType')) BEGIN
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
            'c3770f28-703b-4e79-b7cb-d90f71c1d173',
            'CDADE3E4-D00A-42E7-B385-CE24D533101E', -- Entity: MJ: External Data Source Types
            100029,
            'RequiredCredentialType',
            'Required Credential Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';

