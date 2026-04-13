/* SQL generated to create new entity Schema Histories */

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
         [AllowUserSearchAPI]
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
         'b03f9733-36de-4eed-a75c-836b4d099f87',
         'Schema Histories',
         NULL,
         NULL,
         NULL,
         'SchemaHistory',
         'vwSchemaHistories',
         '${flyway:defaultSchema}_integration',
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
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to create new application ${flyway:defaultSchema}_integration */
INSERT INTO [${flyway:defaultSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('aec8cfc5-623f-4e52-b9da-e23f03dfb0df', '${flyway:defaultSchema}_integration', 'Generated for schema', '${flyway:defaultSchema}_integration', 'mjintegration', 1)

/* SQL generated to add new entity Schema Histories to application ID: 'aec8cfc5-623f-4e52-b9da-e23f03dfb0df' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('aec8cfc5-623f-4e52-b9da-e23f03dfb0df', 'b03f9733-36de-4eed-a75c-836b4d099f87', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'aec8cfc5-623f-4e52-b9da-e23f03dfb0df'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity Schema Histories for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b03f9733-36de-4eed-a75c-836b4d099f87', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity Schema Histories for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b03f9733-36de-4eed-a75c-836b4d099f87', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity Schema Histories for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b03f9733-36de-4eed-a75c-836b4d099f87', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
ALTER TABLE [${flyway:defaultSchema}_integration].[SchemaHistory] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
UPDATE [${flyway:defaultSchema}_integration].[SchemaHistory] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
ALTER TABLE [${flyway:defaultSchema}_integration].[SchemaHistory] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
ALTER TABLE [${flyway:defaultSchema}_integration].[SchemaHistory] ADD CONSTRAINT [DF___mj_integration_SchemaHistory___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
ALTER TABLE [${flyway:defaultSchema}_integration].[SchemaHistory] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
UPDATE [${flyway:defaultSchema}_integration].[SchemaHistory] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
ALTER TABLE [${flyway:defaultSchema}_integration].[SchemaHistory] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}_integration.SchemaHistory */
ALTER TABLE [${flyway:defaultSchema}_integration].[SchemaHistory] ADD CONSTRAINT [DF___mj_integration_SchemaHistory___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37cfa6f8-463a-451d-bd09-7fec1459ca71' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'ID')) BEGIN
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
            '37cfa6f8-463a-451d-bd09-7fec1459ca71',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ad5f24a-8276-47fe-bbfa-3d478ec18395' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'IntegrationName')) BEGIN
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
            '9ad5f24a-8276-47fe-bbfa-3d478ec18395',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100002,
            'IntegrationName',
            'Integration Name',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4859e19d-0b44-4dfe-a9cc-dad11624a180' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'SchemaName')) BEGIN
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
            '4859e19d-0b44-4dfe-a9cc-dad11624a180',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100003,
            'SchemaName',
            'Schema Name',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68db8210-631f-4112-85e2-39ff24375e9a' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'TableName')) BEGIN
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
            '68db8210-631f-4112-85e2-39ff24375e9a',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100004,
            'TableName',
            'Table Name',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c58748a-c718-4b2d-9c48-398995da3898' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'OperationType')) BEGIN
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
            '2c58748a-c718-4b2d-9c48-398995da3898',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100005,
            'OperationType',
            'Operation Type',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18209ac7-04d9-43db-aee6-e130337d9f2f' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'DDLStatement')) BEGIN
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
            '18209ac7-04d9-43db-aee6-e130337d9f2f',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100006,
            'DDLStatement',
            'DDL Statement',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df9f5f37-1255-4252-bede-a189c8c776cc' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'ExecutedAt')) BEGIN
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
            'df9f5f37-1255-4252-bede-a189c8c776cc',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100007,
            'ExecutedAt',
            'Executed At',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b706ea2-4f94-4d38-acd3-099f0ced3523' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'ExecutedBy')) BEGIN
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
            '8b706ea2-4f94-4d38-acd3-099f0ced3523',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100008,
            'ExecutedBy',
            'Executed By',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cc2933d-7739-4452-b20f-6a0e4cca5b9b' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'Success')) BEGIN
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
            '5cc2933d-7739-4452-b20f-6a0e4cca5b9b',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100009,
            'Success',
            'Success',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '673df81e-60f8-4e36-aacc-968cf6fda75d' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'ErrorMessage')) BEGIN
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
            '673df81e-60f8-4e36-aacc-968cf6fda75d',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100010,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df16f67d-3781-4151-89f1-bfff533219a9' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'MigrationFile')) BEGIN
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
            'df16f67d-3781-4151-89f1-bfff533219a9',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100011,
            'MigrationFile',
            'Migration File',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1726e124-fca3-45e6-8bb3-98bcac89846c' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = 'AffectedColumns')) BEGIN
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
            '1726e124-fca3-45e6-8bb3-98bcac89846c',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
            100012,
            'AffectedColumns',
            'Affected Columns',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'adc6e806-c4b9-48bd-99b5-9b1f41dcbe05' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = '__mj_CreatedAt')) BEGIN
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
            'adc6e806-c4b9-48bd-99b5-9b1f41dcbe05',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50cee339-f739-4c71-ab17-fcce62af6e35' OR (EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '50cee339-f739-4c71-ab17-fcce62af6e35',
            'B03F9733-36DE-4EED-A75C-836B4D099F87', -- Entity: Schema Histories
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '218afaca-7462-45ac-b6dd-235990233d4c' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsCustom')) BEGIN
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
            '218afaca-7462-45ac-b6dd-235990233d4c',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100050,
            'IsCustom',
            'Is Custom',
            'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
            'bit',
            1,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd07e59b4-62d3-44d7-8991-1eaa72127ce9' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IsCustom')) BEGIN
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
            'd07e59b4-62d3-44d7-8991-1eaa72127ce9',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100047,
            'IsCustom',
            'Is Custom',
            'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
            'bit',
            1,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Index for Foreign Keys for IntegrationObjectField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationObjectID in table IntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID ON [${flyway:defaultSchema}].[IntegrationObjectField] ([IntegrationObjectID]);

-- Index for foreign key RelatedIntegrationObjectID in table IntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegrationObjectID ON [${flyway:defaultSchema}].[IntegrationObjectField] ([RelatedIntegrationObjectID]);

/* Index for Foreign Keys for IntegrationObject */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationID in table IntegrationObject
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObject]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID ON [${flyway:defaultSchema}].[IntegrationObject] ([IntegrationID]);

/* Base View SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Object Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationObjectField
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationObjectFields]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationObjectFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationObjectFields]
AS
SELECT
    i.*,
    MJIntegrationObject_IntegrationObjectID.[Name] AS [IntegrationObject],
    MJIntegrationObject_RelatedIntegrationObjectID.[Name] AS [RelatedIntegrationObject]
FROM
    [${flyway:defaultSchema}].[IntegrationObjectField] AS i
INNER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_IntegrationObjectID
  ON
    [i].[IntegrationObjectID] = MJIntegrationObject_IntegrationObjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_RelatedIntegrationObjectID
  ON
    [i].[RelatedIntegrationObjectID] = MJIntegrationObject_RelatedIntegrationObjectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Permissions for vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spCreateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObjectField]
    @ID uniqueidentifier = NULL,
    @IntegrationObjectID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @Type nvarchar(100),
    @Length int,
    @Precision int,
    @Scale int,
    @AllowsNull bit = NULL,
    @DefaultValue nvarchar(255),
    @IsPrimaryKey bit = NULL,
    @IsUniqueKey bit = NULL,
    @IsReadOnly bit = NULL,
    @IsRequired bit = NULL,
    @RelatedIntegrationObjectID uniqueidentifier,
    @RelatedIntegrationObjectFieldName nvarchar(255),
    @Sequence int = NULL,
    @Configuration nvarchar(MAX),
    @Status nvarchar(25) = NULL,
    @IsCustom bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObjectField]
            (
                [ID],
                [IntegrationObjectID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectID],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status],
                [IsCustom]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationObjectID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @Type,
                @Length,
                @Precision,
                @Scale,
                ISNULL(@AllowsNull, 1),
                @DefaultValue,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                @RelatedIntegrationObjectID,
                @RelatedIntegrationObjectFieldName,
                ISNULL(@Sequence, 0),
                @Configuration,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsCustom, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObjectField]
            (
                [IntegrationObjectID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectID],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status],
                [IsCustom]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationObjectID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @Type,
                @Length,
                @Precision,
                @Scale,
                ISNULL(@AllowsNull, 1),
                @DefaultValue,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                @RelatedIntegrationObjectID,
                @RelatedIntegrationObjectFieldName,
                ISNULL(@Sequence, 0),
                @Configuration,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsCustom, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationObjectFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spUpdateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObjectField]
    @ID uniqueidentifier,
    @IntegrationObjectID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @Type nvarchar(100),
    @Length int,
    @Precision int,
    @Scale int,
    @AllowsNull bit,
    @DefaultValue nvarchar(255),
    @IsPrimaryKey bit,
    @IsUniqueKey bit,
    @IsReadOnly bit,
    @IsRequired bit,
    @RelatedIntegrationObjectID uniqueidentifier,
    @RelatedIntegrationObjectFieldName nvarchar(255),
    @Sequence int,
    @Configuration nvarchar(MAX),
    @Status nvarchar(25),
    @IsCustom bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObjectField]
    SET
        [IntegrationObjectID] = @IntegrationObjectID,
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Category] = @Category,
        [Type] = @Type,
        [Length] = @Length,
        [Precision] = @Precision,
        [Scale] = @Scale,
        [AllowsNull] = @AllowsNull,
        [DefaultValue] = @DefaultValue,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUniqueKey] = @IsUniqueKey,
        [IsReadOnly] = @IsReadOnly,
        [IsRequired] = @IsRequired,
        [RelatedIntegrationObjectID] = @RelatedIntegrationObjectID,
        [RelatedIntegrationObjectFieldName] = @RelatedIntegrationObjectFieldName,
        [Sequence] = @Sequence,
        [Configuration] = @Configuration,
        [Status] = @Status,
        [IsCustom] = @IsCustom
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationObjectFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationObjectFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObjectField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationObjectField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationObjectField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationObjectField
ON [${flyway:defaultSchema}].[IntegrationObjectField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObjectField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationObjectField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Objects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationObjects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationObjects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationObjects]
AS
SELECT
    i.*,
    MJIntegration_IntegrationID.[Name] AS [Integration]
FROM
    [${flyway:defaultSchema}].[IntegrationObject] AS i
INNER JOIN
    [${flyway:defaultSchema}].[Integration] AS MJIntegration_IntegrationID
  ON
    [i].[IntegrationID] = MJIntegration_IntegrationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Permissions for vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spCreateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObject]
    @ID uniqueidentifier = NULL,
    @IntegrationID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @APIPath nvarchar(500),
    @ResponseDataKey nvarchar(255),
    @DefaultPageSize int = NULL,
    @SupportsPagination bit = NULL,
    @PaginationType nvarchar(20) = NULL,
    @SupportsIncrementalSync bit = NULL,
    @SupportsWrite bit = NULL,
    @DefaultQueryParams nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Sequence int = NULL,
    @Status nvarchar(25) = NULL,
    @WriteAPIPath nvarchar(500),
    @WriteMethod nvarchar(10),
    @DeleteMethod nvarchar(10),
    @IsCustom bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObject]
            (
                [ID],
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status],
                [WriteAPIPath],
                [WriteMethod],
                [DeleteMethod],
                [IsCustom]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @APIPath,
                @ResponseDataKey,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                @DefaultQueryParams,
                @Configuration,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                @WriteAPIPath,
                @WriteMethod,
                @DeleteMethod,
                ISNULL(@IsCustom, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObject]
            (
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status],
                [WriteAPIPath],
                [WriteMethod],
                [DeleteMethod],
                [IsCustom]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @APIPath,
                @ResponseDataKey,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                @DefaultQueryParams,
                @Configuration,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                @WriteAPIPath,
                @WriteMethod,
                @DeleteMethod,
                ISNULL(@IsCustom, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationObjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObject] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObject] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spUpdateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObject]
    @ID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @APIPath nvarchar(500),
    @ResponseDataKey nvarchar(255),
    @DefaultPageSize int,
    @SupportsPagination bit,
    @PaginationType nvarchar(20),
    @SupportsIncrementalSync bit,
    @SupportsWrite bit,
    @DefaultQueryParams nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Sequence int,
    @Status nvarchar(25),
    @WriteAPIPath nvarchar(500),
    @WriteMethod nvarchar(10),
    @DeleteMethod nvarchar(10),
    @IsCustom bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObject]
    SET
        [IntegrationID] = @IntegrationID,
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Category] = @Category,
        [APIPath] = @APIPath,
        [ResponseDataKey] = @ResponseDataKey,
        [DefaultPageSize] = @DefaultPageSize,
        [SupportsPagination] = @SupportsPagination,
        [PaginationType] = @PaginationType,
        [SupportsIncrementalSync] = @SupportsIncrementalSync,
        [SupportsWrite] = @SupportsWrite,
        [DefaultQueryParams] = @DefaultQueryParams,
        [Configuration] = @Configuration,
        [Sequence] = @Sequence,
        [Status] = @Status,
        [WriteAPIPath] = @WriteAPIPath,
        [WriteMethod] = @WriteMethod,
        [DeleteMethod] = @DeleteMethod,
        [IsCustom] = @IsCustom
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationObjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationObjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObject table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationObject]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationObject];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationObject
ON [${flyway:defaultSchema}].[IntegrationObject]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObject]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationObject] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObject] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spDeleteIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObjectField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationObjectField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Integration]



/* spDelete SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spDeleteIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationObject]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Integration]



/* Index for Foreign Keys for SchemaHistory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Schema Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Histories
-- Item: vwSchemaHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Schema Histories
-----               SCHEMA:      ${flyway:defaultSchema}_integration
-----               BASE TABLE:  SchemaHistory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}_integration].[vwSchemaHistories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}_integration].[vwSchemaHistories];
GO

CREATE VIEW [${flyway:defaultSchema}_integration].[vwSchemaHistories]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}_integration].[SchemaHistory] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}_integration].[vwSchemaHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for Schema Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Histories
-- Item: Permissions for vwSchemaHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}_integration].[vwSchemaHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Schema Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Histories
-- Item: spCreateSchemaHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SchemaHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}_integration].[spCreateSchemaHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}_integration].[spCreateSchemaHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}_integration].[spCreateSchemaHistory]
    @ID uniqueidentifier = NULL,
    @IntegrationName nvarchar(200),
    @SchemaName nvarchar(200),
    @TableName nvarchar(200),
    @OperationType nvarchar(50),
    @DDLStatement nvarchar(MAX),
    @ExecutedAt datetimeoffset = NULL,
    @ExecutedBy nvarchar(200),
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @MigrationFile nvarchar(500),
    @AffectedColumns nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}_integration].[SchemaHistory]
            (
                [ID],
                [IntegrationName],
                [SchemaName],
                [TableName],
                [OperationType],
                [DDLStatement],
                [ExecutedAt],
                [ExecutedBy],
                [Success],
                [ErrorMessage],
                [MigrationFile],
                [AffectedColumns]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationName,
                @SchemaName,
                @TableName,
                @OperationType,
                @DDLStatement,
                ISNULL(@ExecutedAt, getutcdate()),
                @ExecutedBy,
                ISNULL(@Success, 1),
                @ErrorMessage,
                @MigrationFile,
                @AffectedColumns
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}_integration].[SchemaHistory]
            (
                [IntegrationName],
                [SchemaName],
                [TableName],
                [OperationType],
                [DDLStatement],
                [ExecutedAt],
                [ExecutedBy],
                [Success],
                [ErrorMessage],
                [MigrationFile],
                [AffectedColumns]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationName,
                @SchemaName,
                @TableName,
                @OperationType,
                @DDLStatement,
                ISNULL(@ExecutedAt, getutcdate()),
                @ExecutedBy,
                ISNULL(@Success, 1),
                @ErrorMessage,
                @MigrationFile,
                @AffectedColumns
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}_integration].[vwSchemaHistories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}_integration].[spCreateSchemaHistory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Schema Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}_integration].[spCreateSchemaHistory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Schema Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Histories
-- Item: spUpdateSchemaHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SchemaHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}_integration].[spUpdateSchemaHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}_integration].[spUpdateSchemaHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}_integration].[spUpdateSchemaHistory]
    @ID uniqueidentifier,
    @IntegrationName nvarchar(200),
    @SchemaName nvarchar(200),
    @TableName nvarchar(200),
    @OperationType nvarchar(50),
    @DDLStatement nvarchar(MAX),
    @ExecutedAt datetimeoffset,
    @ExecutedBy nvarchar(200),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @MigrationFile nvarchar(500),
    @AffectedColumns nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}_integration].[SchemaHistory]
    SET
        [IntegrationName] = @IntegrationName,
        [SchemaName] = @SchemaName,
        [TableName] = @TableName,
        [OperationType] = @OperationType,
        [DDLStatement] = @DDLStatement,
        [ExecutedAt] = @ExecutedAt,
        [ExecutedBy] = @ExecutedBy,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [MigrationFile] = @MigrationFile,
        [AffectedColumns] = @AffectedColumns
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}_integration].[vwSchemaHistories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}_integration].[vwSchemaHistories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}_integration].[spUpdateSchemaHistory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SchemaHistory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}_integration].[trgUpdateSchemaHistory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}_integration].[trgUpdateSchemaHistory];
GO
CREATE TRIGGER [${flyway:defaultSchema}_integration].trgUpdateSchemaHistory
ON [${flyway:defaultSchema}_integration].[SchemaHistory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}_integration].[SchemaHistory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}_integration].[SchemaHistory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Schema Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}_integration].[spUpdateSchemaHistory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Schema Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Schema Histories
-- Item: spDeleteSchemaHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SchemaHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}_integration].[spDeleteSchemaHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}_integration].[spDeleteSchemaHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}_integration].[spDeleteSchemaHistory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}_integration].[SchemaHistory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}_integration].[spDeleteSchemaHistory] TO [cdp_Integration]
    

/* spDelete Permissions for Schema Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}_integration].[spDeleteSchemaHistory] TO [cdp_Integration]



/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '9AD5F24A-8276-47FE-BBFA-3D478EC18395'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '68DB8210-631F-4112-85E2-39FF24375E9A'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '2C58748A-C718-4B2D-9C48-398995DA3898'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9AD5F24A-8276-47FE-BBFA-3D478EC18395'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '68DB8210-631F-4112-85E2-39FF24375E9A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2C58748A-C718-4B2D-9C48-398995DA3898'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DF9F5F37-1255-4252-BEDE-A189C8C776CC'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5CC2933D-7739-4452-B20F-6A0E4CCA5B9B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DF16F67D-3781-4151-89F1-BFFF533219A9'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '9AD5F24A-8276-47FE-BBFA-3D478EC18395'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4859E19D-0B44-4DFE-A9CC-DAD11624A180'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '68DB8210-631F-4112-85E2-39FF24375E9A'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2C58748A-C718-4B2D-9C48-398995DA3898'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8B706EA2-4F94-4D38-ACD3-099F0CED3523'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'DF16F67D-3781-4151-89F1-BFFF533219A9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D07E59B4-62D3-44D7-8991-1EAA72127CE9'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A41406EF-D751-4E1D-8B03-537EC3F5ED26'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'EB935245-A13B-46BA-B54C-BEDE08FAFEC0'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info Schema Histories.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37CFA6F8-463A-451D-BD09-7FEC1459CA71' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.IntegrationName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema Change Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9AD5F24A-8276-47FE-BBFA-3D478EC18395' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema Change Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4859E19D-0B44-4DFE-A9CC-DAD11624A180' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.TableName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema Change Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68DB8210-631F-4112-85E2-39FF24375E9A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.OperationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema Change Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C58748A-C718-4B2D-9C48-398995DA3898' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.MigrationFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema Change Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF16F67D-3781-4151-89F1-BFFF533219A9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.DDLStatement 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '18209AC7-04D9-43DB-AEE6-E130337D9F2F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.ExecutedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF9F5F37-1255-4252-BEDE-A189C8C776CC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.ExecutedBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B706EA2-4F94-4D38-ACD3-099F0CED3523' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5CC2933D-7739-4452-B20F-6A0E4CCA5B9B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '673DF81E-60F8-4E36-AACC-968CF6FDA75D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.AffectedColumns 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1726E124-FCA3-45E6-8BB3-98BCAC89846C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADC6E806-C4B9-48BD-99B5-9B1F41DCBE05' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info Schema Histories.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '50CEE339-F739-4C71-AB17-FCCE62AF6E35' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-history', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'B03F9733-36DE-4EED-A75C-836B4D099F87'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('142e27e6-795a-46a9-9400-baf9caac19db', 'B03F9733-36DE-4EED-A75C-836B4D099F87', 'FieldCategoryInfo', '{"Schema Change Context":{"icon":"fa fa-database","description":"Details regarding the source, target, and intent of the database schema modification"},"Execution Details":{"icon":"fa fa-terminal","description":"Technical logs of the SQL execution, including the statement, timing, and outcome"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ffe9ca72-77f0-4f83-8e6f-463622852380', 'B03F9733-36DE-4EED-A75C-836B4D099F87', 'FieldCategoryIcons', '{"Schema Change Context":"fa fa-database","Execution Details":"fa fa-terminal","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'B03F9733-36DE-4EED-A75C-836B4D099F87'
      

/* Set categories for 24 fields */

-- UPDATE Entity Field Category Info MJ: Integration Objects.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5F7651F-56E2-4E92-A9FE-CFCD61B58B25' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C7B2511-B32A-4E05-AD8F-71A8D7438E96' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '17416191-6BA9-4D7D-B38D-5D32220C994E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0EAB738-4BB1-499F-80FC-AA8A0B46B389' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F19F87B-4609-4738-97D6-8627DE23AF4B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DBFED2A5-355D-4617-B4F8-237B4D3B2365' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F0F0147-386F-45C8-AA9F-021C26B634A5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9057E47C-7633-4B86-8ADF-F09044FE4470' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '027BC6FB-AC73-41C5-8856-981FB0031897' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.IsCustom 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D07E59B4-62D3-44D7-8991-1EAA72127CE9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.APIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CFA6C37-9057-4662-8C40-F835AA972EDF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.ResponseDataKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADE52A5E-ADBA-4414-AAE2-12B535F85AC3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultQueryParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '38708EAC-BEC9-4BD1-AFA5-AF93A00F0FEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration JSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'ED9326F4-6377-4FB3-84FA-EBCC9859FC07' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.WriteAPIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0BEDA5A-9F7B-4611-867D-59AA8EF8B849' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.WriteMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0FC7DA1-9649-427C-AEE2-DF31700F7512' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DeleteMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3006B046-676A-4DF8-B861-2A9A8EFE059D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultPageSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85D95D3F-DAD6-492D-90AF-5207D16780EE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsPagination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27719863-6129-44D5-A77C-7827DB58BD91' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.PaginationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '248DBCEF-E551-4913-8579-200B33459E16' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsIncrementalSync 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C73A053E-44E2-40A8-9A0A-899E6E28AF4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E48963CB-3027-4554-BF48-52ECA282D983' AND AutoUpdateCategory = 1

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C29BAC47-FD92-4209-B600-998618C2A052' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EA456AD-785F-4E37-B397-8FF6F2040810' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'API Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F087BB9D-A16E-4778-A711-026B5CDB5ECB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB935245-A13B-46BA-B54C-BEDE08FAFEC0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'UI Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE592595-E4FD-458A-A892-918DB3ABC0B8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Length 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A184FA33-D1E3-4341-854A-63BA62571622' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC62F3D1-514C-4850-A884-098ACCEA440C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A27F5839-CA61-42FC-B724-C4F885FB5FA0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.AllowsNull 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F48E0A4-576C-4746-AF78-0CED62880881' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E996E3E-68A6-468D-92B5-B1E7D905AB64' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A41406EF-D751-4E1D-8B03-537EC3F5ED26' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsUniqueKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB6D509C-4DDC-4F2B-A2ED-6ABDEFD210A5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B8579C3-5351-4263-AEF4-BB44E30D4B4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsRequired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22A62BF2-861B-4B29-A7E1-B69B476E706E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFD4B858-690A-4AD6-9BCE-DACBE0F0BDF3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BC346A1-8015-4F20-9247-CB0039EE14E4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '2EFA2D36-459B-4433-BFBC-4E76E8A5A461' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A40B0908-76CC-4D93-B7FF-659D450CDF19' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E19F566-6FFB-4B64-96C9-8EA44B3DAE08' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsCustom 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '218AFACA-7462-45AC-B6DD-235990233D4C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1ED4D02-2463-457C-9C8D-761D24CC5288' AND AutoUpdateCategory = 1

