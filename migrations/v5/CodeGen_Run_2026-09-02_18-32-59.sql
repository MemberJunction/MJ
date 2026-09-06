/* SQL generated to create new entity Members */

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
         '7ada229a-cbdd-4cc6-9056-f70792b088c3',
         'Members',
         NULL,
         NULL,
         NULL,
         'Member',
         'vwMembers',
         'demo',
         1,
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
      );

/* SQL generated to create new application demo */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = '4100e5f8-48ed-4607-85b9-ce1235016e10'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[Application] ([ID], [Name], [Description], [SchemaAutoAddNewEntities], [Path], [AutoUpdatePath], [DefaultForNewUser])
                       VALUES ('4100e5f8-48ed-4607-85b9-ce1235016e10', 'demo', 'Generated for schema', 'demo', 'demo', 1, 0)
   END;

/* Adding role UI to application demo */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = '4100e5f8-48ed-4607-85b9-ce1235016e10' AND [RoleID] = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('4100e5f8-48ed-4607-85b9-ce1235016e10', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0)
   END;

/* Adding role Developer to application demo */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = '4100e5f8-48ed-4607-85b9-ce1235016e10' AND [RoleID] = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('4100e5f8-48ed-4607-85b9-ce1235016e10', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1)
   END;

/* Adding role Integration to application demo */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = '4100e5f8-48ed-4607-85b9-ce1235016e10' AND [RoleID] = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('4100e5f8-48ed-4607-85b9-ce1235016e10', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0)
   END;

/* SQL generated to add new entity Members to application ID: '4100e5f8-48ed-4607-85b9-ce1235016e10' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4100e5f8-48ed-4607-85b9-ce1235016e10', '7ada229a-cbdd-4cc6-9056-f70792b088c3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4100e5f8-48ed-4607-85b9-ce1235016e10'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Members for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ada229a-cbdd-4cc6-9056-f70792b088c3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Members for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ada229a-cbdd-4cc6-9056-f70792b088c3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Members for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ada229a-cbdd-4cc6-9056-f70792b088c3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Activities */

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
         '0463b053-77ab-4329-b372-d982a5810dbf',
         'Activities',
         NULL,
         NULL,
         NULL,
         'Activity',
         'vwActivities',
         'demo',
         1,
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
      );

/* SQL generated to add new entity Activities to application ID: '4100E5F8-48ED-4607-85B9-CE1235016E10' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4100E5F8-48ED-4607-85B9-CE1235016E10', '0463b053-77ab-4329-b372-d982a5810dbf', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4100E5F8-48ED-4607-85B9-CE1235016E10'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Activities for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0463b053-77ab-4329-b372-d982a5810dbf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Activities for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0463b053-77ab-4329-b372-d982a5810dbf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Activities for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0463b053-77ab-4329-b372-d982a5810dbf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity demo.Activity */
ALTER TABLE [demo].[Activity] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Activity */
UPDATE [demo].[Activity] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Activity */
ALTER TABLE [demo].[Activity] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Activity */
ALTER TABLE [demo].[Activity] ADD CONSTRAINT [DF_demo_Activity___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Activity */
ALTER TABLE [demo].[Activity] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Activity */
UPDATE [demo].[Activity] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Activity */
ALTER TABLE [demo].[Activity] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Activity */
ALTER TABLE [demo].[Activity] ADD CONSTRAINT [DF_demo_Activity___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Member */
ALTER TABLE [demo].[Member] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Member */
UPDATE [demo].[Member] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Member */
ALTER TABLE [demo].[Member] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity demo.Member */
ALTER TABLE [demo].[Member] ADD CONSTRAINT [DF_demo_Member___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Member */
ALTER TABLE [demo].[Member] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Member */
UPDATE [demo].[Member] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Member */
ALTER TABLE [demo].[Member] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity demo.Member */
ALTER TABLE [demo].[Member] ADD CONSTRAINT [DF_demo_Member___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 20 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '0463B053-77AB-4329-B372-D982A5810DBF'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81325ca2-9067-48ac-b09e-967e369ad14e' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = 'ID')) BEGIN
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
            '81325ca2-9067-48ac-b09e-967e369ad14e',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39cb0860-8148-4f66-a495-114068485e83' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = 'MemberID')) BEGIN
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
            '39cb0860-8148-4f66-a495-114068485e83',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            2,
            'MemberID',
            'Member ID',
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
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a13438c-c65b-4f73-8cd3-9ae6178687ae' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = 'ActivityDate')) BEGIN
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
            '5a13438c-c65b-4f73-8cd3-9ae6178687ae',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            3,
            'ActivityDate',
            'Activity Date',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95f387c2-d500-4622-830b-926c96a21e4f' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = 'ActivityType')) BEGIN
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
            '95f387c2-d500-4622-830b-926c96a21e4f',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            4,
            'ActivityType',
            'Activity Type',
            NULL,
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bca670d-03f8-4730-8dd3-b446be77129f' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = 'Amount')) BEGIN
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
            '1bca670d-03f8-4730-8dd3-b446be77129f',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            5,
            'Amount',
            'Amount',
            NULL,
            'decimal',
            9,
            18,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54d6e0aa-528c-4087-ab2e-fb7a75312d32' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = '__mj_CreatedAt')) BEGIN
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
            '54d6e0aa-528c-4087-ab2e-fb7a75312d32',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4491e6b9-0e0f-4422-b4f1-f40872e002be' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4491e6b9-0e0f-4422-b4f1-f40872e002be',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            7,
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
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '7ADA229A-CBDD-4CC6-9056-F70792B088C3'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75477420-2ac3-41de-8b3d-d7b8e671657a' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'ID')) BEGIN
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
            '75477420-2ac3-41de-8b3d-d7b8e671657a',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41616df7-8d6a-403f-a099-dc45283b463b' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'MemberNumber')) BEGIN
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
            '41616df7-8d6a-403f-a099-dc45283b463b',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            2,
            'MemberNumber',
            'Member Number',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '799f3b4d-b158-44b2-b852-c45cb79198ac' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'FirstName')) BEGIN
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
            '799f3b4d-b158-44b2-b852-c45cb79198ac',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            3,
            'FirstName',
            'First Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1e77837-e8be-4206-ab35-772f46b172e8' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'LastName')) BEGIN
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
            'f1e77837-e8be-4206-ab35-772f46b172e8',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            4,
            'LastName',
            'Last Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf618278-f742-4d0f-b3ac-8df412a9f890' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'City')) BEGIN
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
            'bf618278-f742-4d0f-b3ac-8df412a9f890',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            5,
            'City',
            'City',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90811ca9-80a2-41f5-a09e-4c0542a75071' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'MembershipTenureMonths')) BEGIN
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
            '90811ca9-80a2-41f5-a09e-4c0542a75071',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            6,
            'MembershipTenureMonths',
            'Membership Tenure Months',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fef730ed-732f-42f8-95f9-6175171839c2' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'JoinedAt')) BEGIN
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
            'fef730ed-732f-42f8-95f9-6175171839c2',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            7,
            'JoinedAt',
            'Joined At',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31d28a1d-5854-4fdc-8174-069ef56506cd' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'RenewalDecidedAt')) BEGIN
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
            '31d28a1d-5854-4fdc-8174-069ef56506cd',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            8,
            'RenewalDecidedAt',
            'Renewal Decided At',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85e496cd-f126-42b2-9259-43e9d73847c3' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = 'Renewed')) BEGIN
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
            '85e496cd-f126-42b2-9259-43e9d73847c3',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            9,
            'Renewed',
            'Renewed',
            NULL,
            'nvarchar',
            20,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4faabc24-b871-41a1-997f-6abd8f7a4942' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4faabc24-b871-41a1-997f-6abd8f7a4942',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a95c59a-db0b-49a8-ac69-5a7650d2d8b7' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3a95c59a-db0b-49a8-ac69-5a7650d2d8b7',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            11,
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


/* Create Entity Relationship: Members -> Activities (One To Many via MemberID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd1f81908-c5d3-49c8-8440-4b85334e74c1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d1f81908-c5d3-49c8-8440-4b85334e74c1', '7ADA229A-CBDD-4CC6-9056-F70792B088C3', '0463B053-77AB-4329-B372-D982A5810DBF', 'MemberID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Activity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MemberID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_MemberID' 
    AND object_id = OBJECT_ID('[demo].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_MemberID ON [demo].[Activity] ([MemberID]);

/* Index for Foreign Keys for Member */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities
-----               SCHEMA:      demo
-----               BASE TABLE:  Activity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[demo].[vwActivities]', 'V') IS NOT NULL
    DROP VIEW [demo].[vwActivities];
GO

CREATE VIEW [demo].[vwActivities]
AS
SELECT
    a.*
FROM
    [demo].[Activity] AS a
GO
GRANT SELECT ON [demo].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Permissions for vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [demo].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spCreateActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[demo].[spCreateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spCreateActivity];
GO

CREATE PROCEDURE [demo].[spCreateActivity]
    @ID uniqueidentifier = NULL,
    @MemberID uniqueidentifier,
    @ActivityDate datetimeoffset,
    @ActivityType_Clear bit = 0,
    @ActivityType nvarchar(50) = NULL,
    @Amount_Clear bit = 0,
    @Amount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [demo].[Activity]
            (
                [ID],
                [MemberID],
                [ActivityDate],
                [ActivityType],
                [Amount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MemberID,
                @ActivityDate,
                CASE WHEN @ActivityType_Clear = 1 THEN NULL ELSE ISNULL(@ActivityType, NULL) END,
                CASE WHEN @Amount_Clear = 1 THEN NULL ELSE ISNULL(@Amount, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [demo].[Activity]
            (
                [MemberID],
                [ActivityDate],
                [ActivityType],
                [Amount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MemberID,
                @ActivityDate,
                CASE WHEN @ActivityType_Clear = 1 THEN NULL ELSE ISNULL(@ActivityType, NULL) END,
                CASE WHEN @Amount_Clear = 1 THEN NULL ELSE ISNULL(@Amount, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [demo].[vwActivities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [demo].[spCreateActivity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities */

GRANT EXECUTE ON [demo].[spCreateActivity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spUpdateActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[demo].[spUpdateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spUpdateActivity];
GO

CREATE PROCEDURE [demo].[spUpdateActivity]
    @ID uniqueidentifier,
    @MemberID uniqueidentifier = NULL,
    @ActivityDate datetimeoffset = NULL,
    @ActivityType_Clear bit = 0,
    @ActivityType nvarchar(50) = NULL,
    @Amount_Clear bit = 0,
    @Amount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Activity]
    SET
        [MemberID] = ISNULL(@MemberID, [MemberID]),
        [ActivityDate] = ISNULL(@ActivityDate, [ActivityDate]),
        [ActivityType] = CASE WHEN @ActivityType_Clear = 1 THEN NULL ELSE ISNULL(@ActivityType, [ActivityType]) END,
        [Amount] = CASE WHEN @Amount_Clear = 1 THEN NULL ELSE ISNULL(@Amount, [Amount]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [demo].[vwActivities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [demo].[vwActivities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [demo].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Activity table
------------------------------------------------------------
IF OBJECT_ID('[demo].[trgUpdateActivity]', 'TR') IS NOT NULL
    DROP TRIGGER [demo].[trgUpdateActivity];
GO
CREATE TRIGGER [demo].trgUpdateActivity
ON [demo].[Activity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Activity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [demo].[Activity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Activities */

GRANT EXECUTE ON [demo].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Members
-----               SCHEMA:      demo
-----               BASE TABLE:  Member
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[demo].[vwMembers]', 'V') IS NOT NULL
    DROP VIEW [demo].[vwMembers];
GO

CREATE VIEW [demo].[vwMembers]
AS
SELECT
    m.*
FROM
    [demo].[Member] AS m
GO
GRANT SELECT ON [demo].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Permissions for vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [demo].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spCreateMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[demo].[spCreateMember]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spCreateMember];
GO

CREATE PROCEDURE [demo].[spCreateMember]
    @ID uniqueidentifier = NULL,
    @MemberNumber nvarchar(20),
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(100) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(100) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @MembershipTenureMonths_Clear bit = 0,
    @MembershipTenureMonths int = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @RenewalDecidedAt_Clear bit = 0,
    @RenewalDecidedAt datetimeoffset = NULL,
    @Renewed_Clear bit = 0,
    @Renewed nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [demo].[Member]
            (
                [ID],
                [MemberNumber],
                [FirstName],
                [LastName],
                [City],
                [MembershipTenureMonths],
                [JoinedAt],
                [RenewalDecidedAt],
                [Renewed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MemberNumber,
                CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @MembershipTenureMonths_Clear = 1 THEN NULL ELSE ISNULL(@MembershipTenureMonths, NULL) END,
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @RenewalDecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@RenewalDecidedAt, NULL) END,
                CASE WHEN @Renewed_Clear = 1 THEN NULL ELSE ISNULL(@Renewed, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [demo].[Member]
            (
                [MemberNumber],
                [FirstName],
                [LastName],
                [City],
                [MembershipTenureMonths],
                [JoinedAt],
                [RenewalDecidedAt],
                [Renewed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MemberNumber,
                CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @MembershipTenureMonths_Clear = 1 THEN NULL ELSE ISNULL(@MembershipTenureMonths, NULL) END,
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @RenewalDecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@RenewalDecidedAt, NULL) END,
                CASE WHEN @Renewed_Clear = 1 THEN NULL ELSE ISNULL(@Renewed, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [demo].[vwMembers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [demo].[spCreateMember] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Members */

GRANT EXECUTE ON [demo].[spCreateMember] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spUpdateMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[demo].[spUpdateMember]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spUpdateMember];
GO

CREATE PROCEDURE [demo].[spUpdateMember]
    @ID uniqueidentifier,
    @MemberNumber nvarchar(20) = NULL,
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(100) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(100) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @MembershipTenureMonths_Clear bit = 0,
    @MembershipTenureMonths int = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @RenewalDecidedAt_Clear bit = 0,
    @RenewalDecidedAt datetimeoffset = NULL,
    @Renewed_Clear bit = 0,
    @Renewed nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Member]
    SET
        [MemberNumber] = ISNULL(@MemberNumber, [MemberNumber]),
        [FirstName] = CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, [FirstName]) END,
        [LastName] = CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, [LastName]) END,
        [City] = CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, [City]) END,
        [MembershipTenureMonths] = CASE WHEN @MembershipTenureMonths_Clear = 1 THEN NULL ELSE ISNULL(@MembershipTenureMonths, [MembershipTenureMonths]) END,
        [JoinedAt] = CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, [JoinedAt]) END,
        [RenewalDecidedAt] = CASE WHEN @RenewalDecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@RenewalDecidedAt, [RenewalDecidedAt]) END,
        [Renewed] = CASE WHEN @Renewed_Clear = 1 THEN NULL ELSE ISNULL(@Renewed, [Renewed]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [demo].[vwMembers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [demo].[vwMembers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [demo].[spUpdateMember] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Member table
------------------------------------------------------------
IF OBJECT_ID('[demo].[trgUpdateMember]', 'TR') IS NOT NULL
    DROP TRIGGER [demo].[trgUpdateMember];
GO
CREATE TRIGGER [demo].trgUpdateMember
ON [demo].[Member]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Member]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [demo].[Member] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Members */

GRANT EXECUTE ON [demo].[spUpdateMember] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spDeleteActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[demo].[spDeleteActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spDeleteActivity];
GO

CREATE PROCEDURE [demo].[spDeleteActivity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [demo].[Activity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [demo].[spDeleteActivity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities */

GRANT EXECUTE ON [demo].[spDeleteActivity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spDeleteMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[demo].[spDeleteMember]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spDeleteMember];
GO

CREATE PROCEDURE [demo].[spDeleteMember]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [demo].[Member]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [demo].[spDeleteMember] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Members */

GRANT EXECUTE ON [demo].[spDeleteMember] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '95F387C2-D500-4622-830B-926C96A21E4F'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5A13438C-C65B-4F73-8CD3-9AE6178687AE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '95F387C2-D500-4622-830B-926C96A21E4F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1BCA670D-03F8-4730-8DD3-B446BE77129F'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '0463B053-77AB-4329-B372-D982A5810DBF'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '799F3B4D-B158-44B2-B852-C45CB79198AC'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '41616DF7-8D6A-403F-A099-DC45283B463B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '799F3B4D-B158-44B2-B852-C45CB79198AC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F1E77837-E8BE-4206-AB35-772F46B172E8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF618278-F742-4D0F-B3AC-8DF412A9F890'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FEF730ED-732F-42F8-95F9-6175171839C2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '85E496CD-F126-42B2-9259-43E9D73847C3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '41616DF7-8D6A-403F-A099-DC45283B463B'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '799F3B4D-B158-44B2-B852-C45CB79198AC'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F1E77837-E8BE-4206-AB35-772F46B172E8'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '799F3B4D-B158-44B2-B852-C45CB79198AC'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F1E77837-E8BE-4206-AB35-772F46B172E8'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '41616DF7-8D6A-403F-A099-DC45283B463B'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info Activities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81325CA2-9067-48AC-B09E-967E369AD14E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.MemberID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Member',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39CB0860-8148-4F66-A495-114068485E83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.ActivityDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A13438C-C65B-4F73-8CD3-9AE6178687AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.ActivityType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95F387C2-D500-4622-830B-926C96A21E4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.Amount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BCA670D-03F8-4730-8DD3-B446BE77129F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54D6E0AA-528C-4087-AB2E-FB7A75312D32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4491E6B9-0E0F-4422-B4F1-F40872E002BE' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-tasks */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-tasks', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0463B053-77AB-4329-B372-D982A5810DBF';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fb8fad2a-48bd-4b4f-880a-69de3b1f36e2', '0463B053-77AB-4329-B372-D982A5810DBF', 'FieldCategoryInfo', '{"Activity Details":{"icon":"fa fa-clipboard-list","description":"Core information regarding the member activity, including type, date, and financial impact"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('519338e9-2a9e-4bad-8737-cbd05665730d', '0463B053-77AB-4329-B372-D982A5810DBF', 'FieldCategoryIcons', '{"Activity Details":"fa fa-clipboard-list","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0463B053-77AB-4329-B372-D982A5810DBF';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info Members.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '75477420-2AC3-41DE-8B3D-D7B8E671657A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.MemberNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Member Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41616DF7-8D6A-403F-A099-DC45283B463B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Member Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '799F3B4D-B158-44B2-B852-C45CB79198AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Member Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1E77837-E8BE-4206-AB35-772F46B172E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.City 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Member Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoCity',
   CodeType = NULL
WHERE 
   ID = 'BF618278-F742-4D0F-B3AC-8DF412A9F890' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.MembershipTenureMonths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tenure (Months)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '90811CA9-80A2-41F5-A09E-4C0542A75071' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.JoinedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEF730ED-732F-42F8-95F9-6175171839C2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.RenewalDecidedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '31D28A1D-5854-4FDC-8174-069EF56506CD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.Renewed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85E496CD-F126-42B2-9259-43E9D73847C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FAABC24-B871-41A1-997F-6ABD8F7A4942' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Members.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A95C59A-DB0B-49A8-AC69-5A7650D2D8B7' AND AutoUpdateCategory = 1;

/* Set SupportsGeoCoding = true for Members */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET [SupportsGeoCoding] = 1
            WHERE [ID] = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND [AutoUpdateSupportsGeoCoding] = 1;

/* Set entity icon to fa fa-users */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-users', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7ADA229A-CBDD-4CC6-9056-F70792B088C3';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('77e1db8e-8c0b-488c-9dea-2f60b95a5ea4', '7ADA229A-CBDD-4CC6-9056-F70792B088C3', 'FieldCategoryInfo', '{"Member Profile":{"icon":"fa fa-user","description":"Core identifying information for the member"},"Membership Details":{"icon":"fa fa-calendar-check","description":"Information regarding membership tenure, joining dates, and renewal status"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('eb90978e-cf97-45b6-9673-d9c8178fc797', '7ADA229A-CBDD-4CC6-9056-F70792B088C3', 'FieldCategoryIcons', '{"Member Profile":"fa fa-user","Membership Details":"fa fa-calendar-check","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7ADA229A-CBDD-4CC6-9056-F70792B088C3';

/* Index for Foreign Keys for Member */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Members
-----               SCHEMA:      demo
-----               BASE TABLE:  Member
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[demo].[vwMembers]', 'V') IS NOT NULL
    DROP VIEW [demo].[vwMembers];
GO

CREATE VIEW [demo].[vwMembers]
AS
SELECT
    m.*,    ${flyway:defaultSchema}_rgc.[Latitude] AS [${flyway:defaultSchema}_Latitude],
    ${flyway:defaultSchema}_rgc.[Longitude] AS [${flyway:defaultSchema}_Longitude]
FROM
    [demo].[Member] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwRecordGeoCodes] AS ${flyway:defaultSchema}_rgc
  ON
    ${flyway:defaultSchema}_rgc.[EntityID] = '7ADA229A-CBDD-4CC6-9056-F70792B088C3'
    AND ${flyway:defaultSchema}_rgc.[RecordID] = CAST([m].[ID] AS NVARCHAR(450))
    AND ${flyway:defaultSchema}_rgc.[LocationType] = 'Primary'
GO
GRANT SELECT ON [demo].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Permissions for vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [demo].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spCreateMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[demo].[spCreateMember]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spCreateMember];
GO

CREATE PROCEDURE [demo].[spCreateMember]
    @ID uniqueidentifier = NULL,
    @MemberNumber nvarchar(20),
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(100) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(100) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @MembershipTenureMonths_Clear bit = 0,
    @MembershipTenureMonths int = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @RenewalDecidedAt_Clear bit = 0,
    @RenewalDecidedAt datetimeoffset = NULL,
    @Renewed_Clear bit = 0,
    @Renewed nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [demo].[Member]
            (
                [ID],
                [MemberNumber],
                [FirstName],
                [LastName],
                [City],
                [MembershipTenureMonths],
                [JoinedAt],
                [RenewalDecidedAt],
                [Renewed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MemberNumber,
                CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @MembershipTenureMonths_Clear = 1 THEN NULL ELSE ISNULL(@MembershipTenureMonths, NULL) END,
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @RenewalDecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@RenewalDecidedAt, NULL) END,
                CASE WHEN @Renewed_Clear = 1 THEN NULL ELSE ISNULL(@Renewed, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [demo].[Member]
            (
                [MemberNumber],
                [FirstName],
                [LastName],
                [City],
                [MembershipTenureMonths],
                [JoinedAt],
                [RenewalDecidedAt],
                [Renewed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MemberNumber,
                CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @MembershipTenureMonths_Clear = 1 THEN NULL ELSE ISNULL(@MembershipTenureMonths, NULL) END,
                CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, NULL) END,
                CASE WHEN @RenewalDecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@RenewalDecidedAt, NULL) END,
                CASE WHEN @Renewed_Clear = 1 THEN NULL ELSE ISNULL(@Renewed, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [demo].[vwMembers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [demo].[spCreateMember] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Members */

GRANT EXECUTE ON [demo].[spCreateMember] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spUpdateMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[demo].[spUpdateMember]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spUpdateMember];
GO

CREATE PROCEDURE [demo].[spUpdateMember]
    @ID uniqueidentifier,
    @MemberNumber nvarchar(20) = NULL,
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(100) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(100) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @MembershipTenureMonths_Clear bit = 0,
    @MembershipTenureMonths int = NULL,
    @JoinedAt_Clear bit = 0,
    @JoinedAt datetimeoffset = NULL,
    @RenewalDecidedAt_Clear bit = 0,
    @RenewalDecidedAt datetimeoffset = NULL,
    @Renewed_Clear bit = 0,
    @Renewed nvarchar(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Member]
    SET
        [MemberNumber] = ISNULL(@MemberNumber, [MemberNumber]),
        [FirstName] = CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, [FirstName]) END,
        [LastName] = CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, [LastName]) END,
        [City] = CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, [City]) END,
        [MembershipTenureMonths] = CASE WHEN @MembershipTenureMonths_Clear = 1 THEN NULL ELSE ISNULL(@MembershipTenureMonths, [MembershipTenureMonths]) END,
        [JoinedAt] = CASE WHEN @JoinedAt_Clear = 1 THEN NULL ELSE ISNULL(@JoinedAt, [JoinedAt]) END,
        [RenewalDecidedAt] = CASE WHEN @RenewalDecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@RenewalDecidedAt, [RenewalDecidedAt]) END,
        [Renewed] = CASE WHEN @Renewed_Clear = 1 THEN NULL ELSE ISNULL(@Renewed, [Renewed]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [demo].[vwMembers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [demo].[vwMembers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [demo].[spUpdateMember] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Member table
------------------------------------------------------------
IF OBJECT_ID('[demo].[trgUpdateMember]', 'TR') IS NOT NULL
    DROP TRIGGER [demo].[trgUpdateMember];
GO
CREATE TRIGGER [demo].trgUpdateMember
ON [demo].[Member]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Member]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [demo].[Member] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Members */

GRANT EXECUTE ON [demo].[spUpdateMember] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spDeleteMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[demo].[spDeleteMember]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spDeleteMember];
GO

CREATE PROCEDURE [demo].[spDeleteMember]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [demo].[Member]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [demo].[spDeleteMember] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Members */

GRANT EXECUTE ON [demo].[spDeleteMember] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '7ADA229A-CBDD-4CC6-9056-F70792B088C3'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce8266db-0e44-442b-920d-af72a0546bc0' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = '${flyway:defaultSchema}_Latitude')) BEGIN
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
            'ce8266db-0e44-442b-920d-af72a0546bc0',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            12,
            '${flyway:defaultSchema}_Latitude',
            'Mj Latitude',
            NULL,
            'decimal',
            9,
            10,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '911c2fb1-45b2-4f6c-96f1-c669510018af' OR (EntityID = '7ADA229A-CBDD-4CC6-9056-F70792B088C3' AND Name = '${flyway:defaultSchema}_Longitude')) BEGIN
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
            '911c2fb1-45b2-4f6c-96f1-c669510018af',
            '7ADA229A-CBDD-4CC6-9056-F70792B088C3', -- Entity: Members
            13,
            '${flyway:defaultSchema}_Longitude',
            'Mj Longitude',
            NULL,
            'decimal',
            9,
            10,
            6,
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

/* Set ExtendedType=GeoLatitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLatitude' WHERE [Name] = '${flyway:defaultSchema}_Latitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('7ADA229A-CBDD-4CC6-9056-F70792B088C3');

/* Set ExtendedType=GeoLongitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLongitude' WHERE [Name] = '${flyway:defaultSchema}_Longitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('7ADA229A-CBDD-4CC6-9056-F70792B088C3');

