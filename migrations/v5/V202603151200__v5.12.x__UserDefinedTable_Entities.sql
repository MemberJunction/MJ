-- UserDefinedTable and UserDefinedField entities
-- Tracks tables created via the User Defined Tables (UDT) pipeline
-- Part of Runtime Schema Update (RSU) Phase 5

-- UserDefinedTable: tracks tables created via the UDT pipeline
CREATE TABLE ${flyway:defaultSchema}.UserDefinedTable (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    SchemaName NVARCHAR(100) NOT NULL DEFAULT 'custom',
    TableName NVARCHAR(200) NOT NULL,
    EntityName NVARCHAR(200) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    PipelineRunID NVARCHAR(200) NULL,
    MigrationFilePath NVARCHAR(500) NULL,
    CONSTRAINT PK_UserDefinedTable PRIMARY KEY (ID),
    CONSTRAINT FK_UserDefinedTable_User FOREIGN KEY (CreatedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID)
);

-- UserDefinedField: tracks fields within user-defined tables
CREATE TABLE ${flyway:defaultSchema}.UserDefinedField (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserDefinedTableID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Type NVARCHAR(50) NOT NULL,
    MaxLength INT NULL,
    Precision INT NULL,
    Scale INT NULL,
    AllowEmpty BIT NOT NULL DEFAULT 1,
    DefaultValue NVARCHAR(500) NULL,
    Sequence INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_UserDefinedField PRIMARY KEY (ID),
    CONSTRAINT FK_UserDefinedField_Table FOREIGN KEY (UserDefinedTableID) REFERENCES ${flyway:defaultSchema}.UserDefinedTable(ID)
);














































----------------- CODEGEN -----------------------


/* SQL generated to create new entity MJ: User Defined Tables */

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
         '2f646b14-284c-48a7-b54a-0f5b220febf0',
         'MJ: User Defined Tables',
         'User Defined Tables',
         NULL,
         NULL,
         'UserDefinedTable',
         'vwUserDefinedTables',
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
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: User Defined Tables to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2f646b14-284c-48a7-b54a-0f5b220febf0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: User Defined Tables for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2f646b14-284c-48a7-b54a-0f5b220febf0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: User Defined Tables for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2f646b14-284c-48a7-b54a-0f5b220febf0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: User Defined Tables for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2f646b14-284c-48a7-b54a-0f5b220febf0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: User Defined Fields */

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
         '8fa10d24-b3fb-4c05-91db-0f7224a8aa34',
         'MJ: User Defined Fields',
         'User Defined Fields',
         NULL,
         NULL,
         'UserDefinedField',
         'vwUserDefinedFields',
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
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: User Defined Fields to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8fa10d24-b3fb-4c05-91db-0f7224a8aa34', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: User Defined Fields for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8fa10d24-b3fb-4c05-91db-0f7224a8aa34', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: User Defined Fields for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8fa10d24-b3fb-4c05-91db-0f7224a8aa34', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: User Defined Fields for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8fa10d24-b3fb-4c05-91db-0f7224a8aa34', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedTable] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
UPDATE [${flyway:defaultSchema}].[UserDefinedTable] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedTable] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedTable] ADD CONSTRAINT [DF___mj_UserDefinedTable___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedTable] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
UPDATE [${flyway:defaultSchema}].[UserDefinedTable] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedTable] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedTable */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedTable] ADD CONSTRAINT [DF___mj_UserDefinedTable___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedField] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
UPDATE [${flyway:defaultSchema}].[UserDefinedField] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedField] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedField] ADD CONSTRAINT [DF___mj_UserDefinedField___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedField] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
UPDATE [${flyway:defaultSchema}].[UserDefinedField] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedField] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserDefinedField */
ALTER TABLE [${flyway:defaultSchema}].[UserDefinedField] ADD CONSTRAINT [DF___mj_UserDefinedField___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1f58054-c5b2-4cfe-adde-c935c4db1a48' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'ID')) BEGIN
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
            'b1f58054-c5b2-4cfe-adde-c935c4db1a48',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '090cc0df-fe8b-47d1-8821-de997bd43446' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'Name')) BEGIN
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
            '090cc0df-fe8b-47d1-8821-de997bd43446',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100002,
            'Name',
            'Name',
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a816a3c4-eb8d-4d1b-8d2d-94c6d5a70b96' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'DisplayName')) BEGIN
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
            'a816a3c4-eb8d-4d1b-8d2d-94c6d5a70b96',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100003,
            'DisplayName',
            'Display Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '703c2145-76af-4a15-b7e0-fc55ae3ba8a3' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'Description')) BEGIN
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
            '703c2145-76af-4a15-b7e0-fc55ae3ba8a3',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100004,
            'Description',
            'Description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '000ab705-be74-45f3-8b80-0600c80093f5' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'SchemaName')) BEGIN
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
            '000ab705-be74-45f3-8b80-0600c80093f5',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100005,
            'SchemaName',
            'Schema Name',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'custom',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4583988e-ad58-414a-b7bf-3da3d048e726' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'TableName')) BEGIN
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
            '4583988e-ad58-414a-b7bf-3da3d048e726',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100006,
            'TableName',
            'Table Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b804c372-cda4-4b19-9673-99d1953aa1ff' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'EntityName')) BEGIN
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
            'b804c372-cda4-4b19-9673-99d1953aa1ff',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100007,
            'EntityName',
            'Entity Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18118ccd-b215-4687-9175-bb08d32dd5cf' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'Status')) BEGIN
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
            '18118ccd-b215-4687-9175-bb08d32dd5cf',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100008,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94904ea8-3d4f-4367-839d-ca02d50b4bad' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'CreatedByUserID')) BEGIN
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
            '94904ea8-3d4f-4367-839d-ca02d50b4bad',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100009,
            'CreatedByUserID',
            'Created By User ID',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd78ab197-3b8b-47a0-b4d2-88dccc6de017' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'PipelineRunID')) BEGIN
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
            'd78ab197-3b8b-47a0-b4d2-88dccc6de017',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100010,
            'PipelineRunID',
            'Pipeline Run ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20308afc-fff4-469b-a827-23f4d245cd5f' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'MigrationFilePath')) BEGIN
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
            '20308afc-fff4-469b-a827-23f4d245cd5f',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21ed5b88-e600-457c-923c-bd44b80670fd' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = '__mj_CreatedAt')) BEGIN
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
            '21ed5b88-e600-457c-923c-bd44b80670fd',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f72aa9a-ac1d-4f1e-ab33-b3324fe831ed' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7f72aa9a-ac1d-4f1e-ab33-b3324fe831ed',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '972ce10b-2d91-4969-b8b0-429faa950a18' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'ID')) BEGIN
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
            '972ce10b-2d91-4969-b8b0-429faa950a18',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccd4f057-fdb7-456d-aed7-39971387bcdb' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'UserDefinedTableID')) BEGIN
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
            'ccd4f057-fdb7-456d-aed7-39971387bcdb',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100002,
            'UserDefinedTableID',
            'User Defined Table ID',
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
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5e8d419-57eb-47b8-a948-2f3a18b85eb0' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'Name')) BEGIN
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
            'b5e8d419-57eb-47b8-a948-2f3a18b85eb0',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100003,
            'Name',
            'Name',
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a55fca66-901b-42d0-b511-d072b8d7f190' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'DisplayName')) BEGIN
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
            'a55fca66-901b-42d0-b511-d072b8d7f190',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100004,
            'DisplayName',
            'Display Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63d41f7a-ad61-4fa6-bda6-7d27cd65c6e1' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'Description')) BEGIN
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
            '63d41f7a-ad61-4fa6-bda6-7d27cd65c6e1',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100005,
            'Description',
            'Description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cc281f2-2373-469e-a65a-6dcd76c720ba' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'Type')) BEGIN
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
            '0cc281f2-2373-469e-a65a-6dcd76c720ba',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100006,
            'Type',
            'Type',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dfd6ef33-d500-4d39-aaec-2efcdd01090e' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'MaxLength')) BEGIN
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
            'dfd6ef33-d500-4d39-aaec-2efcdd01090e',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100007,
            'MaxLength',
            'Max Length',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2474c063-7f1c-4276-aa9e-8d4845ddfffc' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'Precision')) BEGIN
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
            '2474c063-7f1c-4276-aa9e-8d4845ddfffc',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100008,
            'Precision',
            'Precision',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '310a1fe1-d2b6-485f-b149-38ce03e06158' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'Scale')) BEGIN
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
            '310a1fe1-d2b6-485f-b149-38ce03e06158',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100009,
            'Scale',
            'Scale',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20b7df78-7f45-49e4-92eb-6f25bd8d7f37' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'AllowEmpty')) BEGIN
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
            '20b7df78-7f45-49e4-92eb-6f25bd8d7f37',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100010,
            'AllowEmpty',
            'Allow Empty',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed6c1d96-e6e2-4272-884c-8606641f4786' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'DefaultValue')) BEGIN
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
            'ed6c1d96-e6e2-4272-884c-8606641f4786',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100011,
            'DefaultValue',
            'Default Value',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e74af7a4-8691-4c1f-ab6c-7b4946fa2159' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'Sequence')) BEGIN
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
            'e74af7a4-8691-4c1f-ab6c-7b4946fa2159',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100012,
            'Sequence',
            'Sequence',
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41d34d32-826d-4da2-8b00-67ec2c9742e4' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = '__mj_CreatedAt')) BEGIN
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
            '41d34d32-826d-4da2-8b00-67ec2c9742e4',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e35b352-0499-4f27-9c67-c8fac5275535' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0e35b352-0499-4f27-9c67-c8fac5275535',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
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


/* Create Entity Relationship: MJ: User Defined Tables -> MJ: User Defined Fields (One To Many via UserDefinedTableID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '85adc41e-0179-4afd-a0cf-a6dd165cfd0c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('85adc41e-0179-4afd-a0cf-a6dd165cfd0c', '2F646B14-284C-48A7-B54A-0F5B220FEBF0', '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', 'UserDefinedTableID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: User Defined Tables (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd9c160cf-35bb-4e73-b2d6-51894d561d4b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d9c160cf-35bb-4e73-b2d6-51894d561d4b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '2F646B14-284C-48A7-B54A-0F5B220FEBF0', 'CreatedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for UserDefinedField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserDefinedTableID in table UserDefinedField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserDefinedField_UserDefinedTableID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserDefinedField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserDefinedField_UserDefinedTableID ON [${flyway:defaultSchema}].[UserDefinedField] ([UserDefinedTableID]);

/* SQL text to update entity field related entity name field map for entity field ID CCD4F057-FDB7-456D-AED7-39971387BCDB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CCD4F057-FDB7-456D-AED7-39971387BCDB', @RelatedEntityNameFieldMap='UserDefinedTable'

/* Index for Foreign Keys for UserDefinedTable */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Tables
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CreatedByUserID in table UserDefinedTable
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserDefinedTable_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserDefinedTable]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserDefinedTable_CreatedByUserID ON [${flyway:defaultSchema}].[UserDefinedTable] ([CreatedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 94904EA8-3D4F-4367-839D-CA02D50B4BAD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='94904EA8-3D4F-4367-839D-CA02D50B4BAD', @RelatedEntityNameFieldMap='CreatedByUser'

/* Base View SQL for MJ: User Defined Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Fields
-- Item: vwUserDefinedFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Defined Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserDefinedField
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserDefinedFields]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserDefinedFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserDefinedFields]
AS
SELECT
    u.*,
    MJUserDefinedTable_UserDefinedTableID.[Name] AS [UserDefinedTable]
FROM
    [${flyway:defaultSchema}].[UserDefinedField] AS u
INNER JOIN
    [${flyway:defaultSchema}].[UserDefinedTable] AS MJUserDefinedTable_UserDefinedTableID
  ON
    [u].[UserDefinedTableID] = MJUserDefinedTable_UserDefinedTableID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserDefinedFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: User Defined Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Fields
-- Item: Permissions for vwUserDefinedFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserDefinedFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User Defined Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Fields
-- Item: spCreateUserDefinedField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserDefinedField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserDefinedField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserDefinedField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserDefinedField]
    @ID uniqueidentifier = NULL,
    @UserDefinedTableID uniqueidentifier,
    @Name nvarchar(200),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @MaxLength int,
    @Precision int,
    @Scale int,
    @AllowEmpty bit = NULL,
    @DefaultValue nvarchar(500),
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserDefinedField]
            (
                [ID],
                [UserDefinedTableID],
                [Name],
                [DisplayName],
                [Description],
                [Type],
                [MaxLength],
                [Precision],
                [Scale],
                [AllowEmpty],
                [DefaultValue],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserDefinedTableID,
                @Name,
                @DisplayName,
                @Description,
                @Type,
                @MaxLength,
                @Precision,
                @Scale,
                ISNULL(@AllowEmpty, 1),
                @DefaultValue,
                ISNULL(@Sequence, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserDefinedField]
            (
                [UserDefinedTableID],
                [Name],
                [DisplayName],
                [Description],
                [Type],
                [MaxLength],
                [Precision],
                [Scale],
                [AllowEmpty],
                [DefaultValue],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserDefinedTableID,
                @Name,
                @DisplayName,
                @Description,
                @Type,
                @MaxLength,
                @Precision,
                @Scale,
                ISNULL(@AllowEmpty, 1),
                @DefaultValue,
                ISNULL(@Sequence, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserDefinedFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserDefinedField] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User Defined Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserDefinedField] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User Defined Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Fields
-- Item: spUpdateUserDefinedField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserDefinedField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserDefinedField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserDefinedField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserDefinedField]
    @ID uniqueidentifier,
    @UserDefinedTableID uniqueidentifier,
    @Name nvarchar(200),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @MaxLength int,
    @Precision int,
    @Scale int,
    @AllowEmpty bit,
    @DefaultValue nvarchar(500),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserDefinedField]
    SET
        [UserDefinedTableID] = @UserDefinedTableID,
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Type] = @Type,
        [MaxLength] = @MaxLength,
        [Precision] = @Precision,
        [Scale] = @Scale,
        [AllowEmpty] = @AllowEmpty,
        [DefaultValue] = @DefaultValue,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserDefinedFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserDefinedFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserDefinedField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserDefinedField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserDefinedField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserDefinedField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserDefinedField
ON [${flyway:defaultSchema}].[UserDefinedField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserDefinedField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserDefinedField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User Defined Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserDefinedField] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User Defined Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Fields
-- Item: spDeleteUserDefinedField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserDefinedField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserDefinedField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserDefinedField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserDefinedField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserDefinedField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserDefinedField] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: User Defined Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserDefinedField] TO [cdp_Integration]



/* Base View SQL for MJ: User Defined Tables */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Tables
-- Item: vwUserDefinedTables
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Defined Tables
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserDefinedTable
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserDefinedTables]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserDefinedTables];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserDefinedTables]
AS
SELECT
    u.*,
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[UserDefinedTable] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [u].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserDefinedTables] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: User Defined Tables */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Tables
-- Item: Permissions for vwUserDefinedTables
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserDefinedTables] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User Defined Tables */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Tables
-- Item: spCreateUserDefinedTable
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserDefinedTable
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserDefinedTable]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserDefinedTable];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserDefinedTable]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @SchemaName nvarchar(100) = NULL,
    @TableName nvarchar(200),
    @EntityName nvarchar(200),
    @Status nvarchar(50) = NULL,
    @CreatedByUserID uniqueidentifier,
    @PipelineRunID nvarchar(200),
    @MigrationFilePath nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserDefinedTable]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [SchemaName],
                [TableName],
                [EntityName],
                [Status],
                [CreatedByUserID],
                [PipelineRunID],
                [MigrationFilePath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                @Description,
                ISNULL(@SchemaName, 'custom'),
                @TableName,
                @EntityName,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @PipelineRunID,
                @MigrationFilePath
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserDefinedTable]
            (
                [Name],
                [DisplayName],
                [Description],
                [SchemaName],
                [TableName],
                [EntityName],
                [Status],
                [CreatedByUserID],
                [PipelineRunID],
                [MigrationFilePath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                @Description,
                ISNULL(@SchemaName, 'custom'),
                @TableName,
                @EntityName,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @PipelineRunID,
                @MigrationFilePath
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserDefinedTables] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserDefinedTable] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User Defined Tables */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserDefinedTable] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User Defined Tables */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Tables
-- Item: spUpdateUserDefinedTable
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserDefinedTable
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserDefinedTable]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserDefinedTable];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserDefinedTable]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @SchemaName nvarchar(100),
    @TableName nvarchar(200),
    @EntityName nvarchar(200),
    @Status nvarchar(50),
    @CreatedByUserID uniqueidentifier,
    @PipelineRunID nvarchar(200),
    @MigrationFilePath nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserDefinedTable]
    SET
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [SchemaName] = @SchemaName,
        [TableName] = @TableName,
        [EntityName] = @EntityName,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID,
        [PipelineRunID] = @PipelineRunID,
        [MigrationFilePath] = @MigrationFilePath
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserDefinedTables] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserDefinedTables]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserDefinedTable] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserDefinedTable table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserDefinedTable]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserDefinedTable];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserDefinedTable
ON [${flyway:defaultSchema}].[UserDefinedTable]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserDefinedTable]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserDefinedTable] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User Defined Tables */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserDefinedTable] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User Defined Tables */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Defined Tables
-- Item: spDeleteUserDefinedTable
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserDefinedTable
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserDefinedTable]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserDefinedTable];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserDefinedTable]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserDefinedTable]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserDefinedTable] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: User Defined Tables */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserDefinedTable] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84d4e699-6289-4596-bfeb-e946ebe1d9ef' OR (EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0' AND Name = 'CreatedByUser')) BEGIN
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
            '84d4e699-6289-4596-bfeb-e946ebe1d9ef',
            '2F646B14-284C-48A7-B54A-0F5B220FEBF0', -- Entity: MJ: User Defined Tables
            100027,
            'CreatedByUser',
            'Created By User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fb777e3-6ebc-4eb2-85b2-65c42e642579' OR (EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34' AND Name = 'UserDefinedTable')) BEGIN
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
            '5fb777e3-6ebc-4eb2-85b2-65c42e642579',
            '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', -- Entity: MJ: User Defined Fields
            100029,
            'UserDefinedTable',
            'User Defined Table',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'A816A3C4-EB8D-4D1B-8D2D-94C6D5A70B96'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A816A3C4-EB8D-4D1B-8D2D-94C6D5A70B96'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '000AB705-BE74-45F3-8B80-0600C80093F5'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4583988E-AD58-414A-B7BF-3DA3D048E726'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '18118CCD-B215-4687-9175-BB08D32DD5CF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '84D4E699-6289-4596-BFEB-E946EBE1D9EF'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A816A3C4-EB8D-4D1B-8D2D-94C6D5A70B96'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '000AB705-BE74-45F3-8B80-0600C80093F5'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4583988E-AD58-414A-B7BF-3DA3D048E726'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B804C372-CDA4-4B19-9673-99D1953AA1FF'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'A55FCA66-901B-42D0-B511-D072B8D7F190'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A55FCA66-901B-42D0-B511-D072B8D7F190'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0CC281F2-2373-469E-A65A-6DCD76C720BA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E74AF7A4-8691-4C1F-AB6C-7B4946FA2159'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5FB777E3-6EBC-4EB2-85B2-65C42E642579'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A55FCA66-901B-42D0-B511-D072B8D7F190'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '63D41F7A-AD61-4FA6-BDA6-7D27CD65C6E1'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '5FB777E3-6EBC-4EB2-85B2-65C42E642579'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: User Defined Tables.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1F58054-C5B2-4CFE-ADDE-C935C4DB1A48' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '090CC0DF-FE8B-47D1-8821-DE997BD43446' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A816A3C4-EB8D-4D1B-8D2D-94C6D5A70B96' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '703C2145-76AF-4A15-B7E0-FC55AE3BA8A3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18118CCD-B215-4687-9175-BB08D32DD5CF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '000AB705-BE74-45F3-8B80-0600C80093F5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.TableName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4583988E-AD58-414A-B7BF-3DA3D048E726' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.EntityName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B804C372-CDA4-4B19-9673-99D1953AA1FF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.PipelineRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D78AB197-3B8B-47A0-B4D2-88DCCC6DE017' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.MigrationFilePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20308AFC-FFF4-469B-A827-23F4D245CD5F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '94904EA8-3D4F-4367-839D-CA02D50B4BAD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84D4E699-6289-4596-BFEB-E946EBE1D9EF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21ED5B88-E600-457C-923C-BD44B80670FD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Tables.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F72AA9A-AC1D-4F1E-AB33-B3324FE831ED' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-table */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-table', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('209449d2-e7e2-456d-81df-ca16d6ae5f63', '2F646B14-284C-48A7-B54A-0F5B220FEBF0', 'FieldCategoryInfo', '{"Table Configuration":{"icon":"fa fa-sliders-h","description":"Basic identification and descriptive information for the user-defined table"},"Technical Mapping":{"icon":"fa fa-database","description":"Physical database details and deployment tracking information"},"System Metadata":{"icon":"fa fa-cog","description":"Internal identifiers and audit trail information"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('135efa92-345d-4679-9afc-1f0ac16a4b48', '2F646B14-284C-48A7-B54A-0F5B220FEBF0', 'FieldCategoryIcons', '{"Table Configuration":"fa fa-sliders-h","Technical Mapping":"fa fa-database","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '2F646B14-284C-48A7-B54A-0F5B220FEBF0'
      

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: User Defined Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '972CE10B-2D91-4969-B8B0-429FAA950A18' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.UserDefinedTableID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCD4F057-FDB7-456D-AED7-39971387BCDB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B5E8D419-57EB-47B8-A948-2F3A18B85EB0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A55FCA66-901B-42D0-B511-D072B8D7F190' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63D41F7A-AD61-4FA6-BDA6-7D27CD65C6E1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CC281F2-2373-469E-A65A-6DCD76C720BA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.MaxLength 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFD6EF33-D500-4D39-AAEC-2EFCDD01090E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2474C063-7F1C-4276-AA9E-8D4845DDFFFC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '310A1FE1-D2B6-485F-B149-38CE03E06158' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.AllowEmpty 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20B7DF78-7F45-49E4-92EB-6F25BD8D7F37' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ED6C1D96-E6E2-4272-884C-8606641F4786' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E74AF7A4-8691-4C1F-AB6C-7B4946FA2159' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41D34D32-826D-4DA2-8B00-67EC2C9742E4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E35B352-0499-4F27-9C67-C8FAC5275535' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: User Defined Fields.UserDefinedTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Table Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FB777E3-6EBC-4EB2-85B2-65C42E642579' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-columns */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-columns', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b99a3008-f3c2-446c-8333-e0188f4e3d4b', '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', 'FieldCategoryInfo', '{"Field Identification":{"icon":"fa fa-id-card","description":"Basic identification and descriptive information for the custom field"},"Data Configuration":{"icon":"fa fa-database","description":"Technical specifications, data types, and validation constraints"},"Table Context":{"icon":"fa fa-table","description":"Information regarding which table this field belongs to and its display order"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('484071ce-ab80-4f2d-b19f-20d90b6e11a3', '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34', 'FieldCategoryIcons', '{"Field Identification":"fa fa-id-card","Data Configuration":"fa fa-database","Table Context":"fa fa-table","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '8FA10D24-B3FB-4C05-91DB-0F7224A8AA34'