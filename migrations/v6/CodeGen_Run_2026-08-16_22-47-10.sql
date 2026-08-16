/* SQL generated to create new entity MJ: Form Chrome Rules */

      INSERT INTO [__mj].[Entity] (
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
         '366ccf87-c774-450c-9048-875d1fbfabb9',
         'MJ: Form Chrome Rules',
         'Form Chrome Rules',
         'Install-overlay (L3) pins for generated-form chrome. One row sets Primary / More / None for a parent form''s related entity or contribution. Not app-synced — site admin only.',
         NULL,
         'FormChromeRule',
         'vwFormChromeRules',
         '__mj',
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

/* SQL generated to add new entity MJ: Form Chrome Rules to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '366ccf87-c774-450c-9048-875d1fbfabb9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Form Chrome Rules for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('366ccf87-c774-450c-9048-875d1fbfabb9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Form Chrome Rules for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('366ccf87-c774-450c-9048-875d1fbfabb9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Form Chrome Rules for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('366ccf87-c774-450c-9048-875d1fbfabb9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity __mj.FormChromeRule */
ALTER TABLE [__mj].[FormChromeRule] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.FormChromeRule */
UPDATE [__mj].[FormChromeRule] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.FormChromeRule */
ALTER TABLE [__mj].[FormChromeRule] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.FormChromeRule */
ALTER TABLE [__mj].[FormChromeRule] ADD CONSTRAINT [DF___mj_FormChromeRule___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.FormChromeRule */
ALTER TABLE [__mj].[FormChromeRule] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.FormChromeRule */
UPDATE [__mj].[FormChromeRule] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.FormChromeRule */
ALTER TABLE [__mj].[FormChromeRule] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.FormChromeRule */
ALTER TABLE [__mj].[FormChromeRule] ADD CONSTRAINT [DF___mj_FormChromeRule___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '96c625c0-daee-4117-b263-1a3d7bc03f00' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EmbeddedRecord')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '96c625c0-daee-4117-b263-1a3d7bc03f00',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6') + 65,
            'EmbeddedRecord',
            'Embedded Record',
            'Optional JSON policy object that declares this foreign-key field as a first-class embedded record, so CodeGen can emit {FieldName}_Object / {FieldName}_EnsureObject() on the entity subclass. Shape is IEmbeddedRecordConfig: OnClear (''delete'' | ''orphan'' | ''refuse'', default orphan) and LoadNested (''inherit'' | ''related'', default inherit). RelatedEntity and the FK field name are NOT repeated here — they are this row''s RelatedEntityID and Name. AllowsNull on this same row decides whether the object is provisioned with GetEntityObject (required FK) or via Ensure (nullable FK). NULL means the field is an ordinary FK, which is the default and reproduces pre-feature behaviour exactly.',
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '79df8c31-cebc-4192-9dd9-c1a53f0962f4' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'ID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '79df8c31-cebc-4192-9dd9-c1a53f0962f4',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '1ebe0735-74ca-4931-a6d2-794946dd6473' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'EntityID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '1ebe0735-74ca-4931-a6d2-794946dd6473',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 2,
            'EntityID',
            'Entity ID',
            'Parent form entity this rule applies to.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'a954d984-b7f9-4be6-b05f-e54f1d926032' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'TargetKind')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'a954d984-b7f9-4be6-b05f-e54f1d926032',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 3,
            'TargetKind',
            'Target Kind',
            '''Relationship'' targets a related entity on the parent form. ''Contribution'' targets a form contribution by key.',
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'acd8e07e-6134-4868-8111-55cc927f8d79' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'RelatedEntityID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'acd8e07e-6134-4868-8111-55cc927f8d79',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 4,
            'RelatedEntityID',
            'Related Entity ID',
            'Related entity to pin when TargetKind is Relationship. Null for Contribution rows.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'efff72a1-69a8-4209-8f69-1ceb8dc4170b' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'ContributionKey')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'efff72a1-69a8-4209-8f69-1ceb8dc4170b',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 5,
            'ContributionKey',
            'Contribution Key',
            'Contribution key to pin when TargetKind is Contribution. Null for Relationship rows.',
            'nvarchar',
            512,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '74225cf9-2e6f-4de7-b21e-3333ecea5085' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'Inclusion')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '74225cf9-2e6f-4de7-b21e-3333ecea5085',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 6,
            'Inclusion',
            'Inclusion',
            'How the target appears on the parent form: Primary (first-class rail), More (parked), or None (not a candidate).',
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '5ff944e4-8da9-47c1-b81a-f35fba726a83' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'JoinFields')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '5ff944e4-8da9-47c1-b81a-f35fba726a83',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 7,
            'JoinFields',
            'Join Fields',
            'Optional JSON string array of join field names for a same-table OR filter (Bill-To OR Ship-To). Null keeps the L1 join, if any.',
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '00ab7a0d-a5fb-4d2a-aacd-4fc55dc2d15c' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'Sequence')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '00ab7a0d-a5fb-4d2a-aacd-4fc55dc2d15c',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 8,
            'Sequence',
            'Sequence',
            'Tie-break when more than one rule matches the same target. Higher Sequence wins.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'f2497c21-a354-423f-b173-98eca52ffdd3' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'Title')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            'f2497c21-a354-423f-b173-98eca52ffdd3',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 9,
            'Title',
            'Title',
            'Optional admin display title for this section. Null keeps the relationship DisplayName or contribution name. Survives OpenApp upgrades because the row is keyed by RelatedEntityID / ContributionKey, not by the previous label.',
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '42a754b1-5651-46b0-9033-7147973c823a' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '42a754b1-5651-46b0-9033-7147973c823a',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '22e6a901-d227-4283-861e-41ba512ce9e1' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '22e6a901-d227-4283-861e-41ba512ce9e1',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 11,
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

/* SQL text to insert entity field value with ID ecfea10f-50ec-47d1-8ea2-47e638dd3dc4 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ecfea10f-50ec-47d1-8ea2-47e638dd3dc4', 'A954D984-B7F9-4BE6-B05F-E54F1D926032', 1, 'Contribution', 'Contribution', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d0a9d5f4-76b4-4b35-82c3-624b899f1638 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d0a9d5f4-76b4-4b35-82c3-624b899f1638', 'A954D984-B7F9-4BE6-B05F-E54F1D926032', 2, 'Relationship', 'Relationship', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A954D984-B7F9-4BE6-B05F-E54F1D926032 */
UPDATE [__mj].[EntityField] SET ValueListType='List' WHERE ID='A954D984-B7F9-4BE6-B05F-E54F1D926032';

/* SQL text to insert entity field value with ID 39b440f5-c2f9-433b-877c-af00c9e1d157 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('39b440f5-c2f9-433b-877c-af00c9e1d157', '74225CF9-2E6F-4DE7-B21E-3333ECEA5085', 1, 'More', 'More', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3360d5e9-3058-4e4e-b01e-7c804d491c23 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3360d5e9-3058-4e4e-b01e-7c804d491c23', '74225CF9-2E6F-4DE7-B21E-3333ECEA5085', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0aff49ab-c109-466b-afc5-dec04d119705 */
INSERT INTO [__mj].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0aff49ab-c109-466b-afc5-dec04d119705', '74225CF9-2E6F-4DE7-B21E-3333ECEA5085', 3, 'Primary', 'Primary', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 74225CF9-2E6F-4DE7-B21E-3333ECEA5085 */
UPDATE [__mj].[EntityField] SET ValueListType='List' WHERE ID='74225CF9-2E6F-4DE7-B21E-3333ECEA5085';


/* Create Entity Relationship: MJ: Entities -> MJ: Form Chrome Rules (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = '6a405a95-327a-4c8e-b9b2-547fa6916ea6'
   )
   BEGIN
      INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6a405a95-327a-4c8e-b9b2-547fa6916ea6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '366CCF87-C774-450C-9048-875D1FBFABB9', 'RelatedEntityID', 'One To Many', 1, 1, 84, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Form Chrome Rules (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = '860cf823-3dca-491a-9030-5f981a36d8c6'
   )
   BEGIN
      INSERT INTO [__mj].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('860cf823-3dca-491a-9030-5f981a36d8c6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '366CCF87-C774-450C-9048-875D1FBFABB9', 'EntityID', 'One To Many', 1, 1, 85, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[__mj].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [__mj].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[__mj].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [__mj].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[__mj].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [__mj].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateEntityField];
GO

CREATE PROCEDURE [__mj].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(255) = NULL,
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType_Clear bit = 0,
    @ExtendedType nvarchar(50) = NULL,
    @CodeType_Clear bit = 0,
    @CodeType nvarchar(50) = NULL,
    @DefaultInView bit = NULL,
    @ViewCellTemplate_Clear bit = 0,
    @ViewCellTemplate nvarchar(MAX) = NULL,
    @DefaultColumnWidth_Clear bit = 0,
    @DefaultColumnWidth int = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI_Clear bit = 0,
    @UserSearchParamFormatAPI nvarchar(500) = NULL,
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedEntityFieldName_Clear bit = 0,
    @RelatedEntityFieldName nvarchar(255) = NULL,
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap_Clear bit = 0,
    @RelatedEntityNameFieldMap nvarchar(255) = NULL,
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName_Clear bit = 0,
    @EntityIDFieldName nvarchar(100) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID_Clear bit = 0,
    @EncryptionKeyID uniqueidentifier = NULL,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields_Clear bit = 0,
    @RelatedEntityJoinFields nvarchar(MAX) = NULL,
    @JSONType_Clear bit = 0,
    @JSONType nvarchar(255) = NULL,
    @JSONTypeIsArray bit = NULL,
    @JSONTypeDefinition_Clear bit = 0,
    @JSONTypeDefinition nvarchar(MAX) = NULL,
    @UserSearchPredicateAPI nvarchar(20) = NULL,
    @AutoUpdateUserSearchPredicate bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateExtendedType bit = NULL,
    @IsComputed bit = NULL,
    @EmbeddedRecord_Clear bit = 0,
    @EmbeddedRecord nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [UserSearchPredicateAPI],
                [AutoUpdateUserSearchPredicate],
                [AutoUpdateFullTextSearch],
                [AutoUpdateExtendedType],
                [IsComputed],
                [EmbeddedRecord]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                ISNULL(@ValueListType, 'None'),
                CASE WHEN @ExtendedType_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedType, NULL) END,
                CASE WHEN @CodeType_Clear = 1 THEN NULL ELSE ISNULL(@CodeType, NULL) END,
                ISNULL(@DefaultInView, 0),
                CASE WHEN @ViewCellTemplate_Clear = 1 THEN NULL ELSE ISNULL(@ViewCellTemplate, NULL) END,
                CASE WHEN @DefaultColumnWidth_Clear = 1 THEN NULL ELSE ISNULL(@DefaultColumnWidth, NULL) END,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @UserSearchParamFormatAPI_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchParamFormatAPI, NULL) END,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedEntityFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFieldName, NULL) END,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                CASE WHEN @RelatedEntityNameFieldMap_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityNameFieldMap, NULL) END,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                CASE WHEN @EntityIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@EntityIDFieldName, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                CASE WHEN @EncryptionKeyID_Clear = 1 THEN NULL ELSE ISNULL(@EncryptionKeyID, NULL) END,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                CASE WHEN @RelatedEntityJoinFields_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityJoinFields, NULL) END,
                CASE WHEN @JSONType_Clear = 1 THEN NULL ELSE ISNULL(@JSONType, NULL) END,
                ISNULL(@JSONTypeIsArray, 0),
                CASE WHEN @JSONTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@JSONTypeDefinition, NULL) END,
                ISNULL(@UserSearchPredicateAPI, 'Contains'),
                ISNULL(@AutoUpdateUserSearchPredicate, 1),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateExtendedType, 1),
                ISNULL(@IsComputed, 0),
                CASE WHEN @EmbeddedRecord_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddedRecord, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [UserSearchPredicateAPI],
                [AutoUpdateUserSearchPredicate],
                [AutoUpdateFullTextSearch],
                [AutoUpdateExtendedType],
                [IsComputed],
                [EmbeddedRecord]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                ISNULL(@ValueListType, 'None'),
                CASE WHEN @ExtendedType_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedType, NULL) END,
                CASE WHEN @CodeType_Clear = 1 THEN NULL ELSE ISNULL(@CodeType, NULL) END,
                ISNULL(@DefaultInView, 0),
                CASE WHEN @ViewCellTemplate_Clear = 1 THEN NULL ELSE ISNULL(@ViewCellTemplate, NULL) END,
                CASE WHEN @DefaultColumnWidth_Clear = 1 THEN NULL ELSE ISNULL(@DefaultColumnWidth, NULL) END,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @UserSearchParamFormatAPI_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchParamFormatAPI, NULL) END,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedEntityFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFieldName, NULL) END,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                CASE WHEN @RelatedEntityNameFieldMap_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityNameFieldMap, NULL) END,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                CASE WHEN @EntityIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@EntityIDFieldName, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                CASE WHEN @EncryptionKeyID_Clear = 1 THEN NULL ELSE ISNULL(@EncryptionKeyID, NULL) END,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                CASE WHEN @RelatedEntityJoinFields_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityJoinFields, NULL) END,
                CASE WHEN @JSONType_Clear = 1 THEN NULL ELSE ISNULL(@JSONType, NULL) END,
                ISNULL(@JSONTypeIsArray, 0),
                CASE WHEN @JSONTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@JSONTypeDefinition, NULL) END,
                ISNULL(@UserSearchPredicateAPI, 'Contains'),
                ISNULL(@AutoUpdateUserSearchPredicate, 1),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateExtendedType, 1),
                ISNULL(@IsComputed, 0),
                CASE WHEN @EmbeddedRecord_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddedRecord, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [__mj].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateEntityField];
GO

CREATE PROCEDURE [__mj].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(255) = NULL,
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType_Clear bit = 0,
    @ExtendedType nvarchar(50) = NULL,
    @CodeType_Clear bit = 0,
    @CodeType nvarchar(50) = NULL,
    @DefaultInView bit = NULL,
    @ViewCellTemplate_Clear bit = 0,
    @ViewCellTemplate nvarchar(MAX) = NULL,
    @DefaultColumnWidth_Clear bit = 0,
    @DefaultColumnWidth int = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI_Clear bit = 0,
    @UserSearchParamFormatAPI nvarchar(500) = NULL,
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedEntityFieldName_Clear bit = 0,
    @RelatedEntityFieldName nvarchar(255) = NULL,
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap_Clear bit = 0,
    @RelatedEntityNameFieldMap nvarchar(255) = NULL,
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName_Clear bit = 0,
    @EntityIDFieldName nvarchar(100) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID_Clear bit = 0,
    @EncryptionKeyID uniqueidentifier = NULL,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields_Clear bit = 0,
    @RelatedEntityJoinFields nvarchar(MAX) = NULL,
    @JSONType_Clear bit = 0,
    @JSONType nvarchar(255) = NULL,
    @JSONTypeIsArray bit = NULL,
    @JSONTypeDefinition_Clear bit = 0,
    @JSONTypeDefinition nvarchar(MAX) = NULL,
    @UserSearchPredicateAPI nvarchar(20) = NULL,
    @AutoUpdateUserSearchPredicate bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateExtendedType bit = NULL,
    @IsComputed bit = NULL,
    @EmbeddedRecord_Clear bit = 0,
    @EmbeddedRecord nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EntityField]
    SET
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AutoUpdateDescription] = ISNULL(@AutoUpdateDescription, [AutoUpdateDescription]),
        [IsPrimaryKey] = ISNULL(@IsPrimaryKey, [IsPrimaryKey]),
        [IsUnique] = ISNULL(@IsUnique, [IsUnique]),
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [ValueListType] = ISNULL(@ValueListType, [ValueListType]),
        [ExtendedType] = CASE WHEN @ExtendedType_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedType, [ExtendedType]) END,
        [CodeType] = CASE WHEN @CodeType_Clear = 1 THEN NULL ELSE ISNULL(@CodeType, [CodeType]) END,
        [DefaultInView] = ISNULL(@DefaultInView, [DefaultInView]),
        [ViewCellTemplate] = CASE WHEN @ViewCellTemplate_Clear = 1 THEN NULL ELSE ISNULL(@ViewCellTemplate, [ViewCellTemplate]) END,
        [DefaultColumnWidth] = CASE WHEN @DefaultColumnWidth_Clear = 1 THEN NULL ELSE ISNULL(@DefaultColumnWidth, [DefaultColumnWidth]) END,
        [AllowUpdateAPI] = ISNULL(@AllowUpdateAPI, [AllowUpdateAPI]),
        [AllowUpdateInView] = ISNULL(@AllowUpdateInView, [AllowUpdateInView]),
        [IncludeInUserSearchAPI] = ISNULL(@IncludeInUserSearchAPI, [IncludeInUserSearchAPI]),
        [FullTextSearchEnabled] = ISNULL(@FullTextSearchEnabled, [FullTextSearchEnabled]),
        [UserSearchParamFormatAPI] = CASE WHEN @UserSearchParamFormatAPI_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchParamFormatAPI, [UserSearchParamFormatAPI]) END,
        [IncludeInGeneratedForm] = ISNULL(@IncludeInGeneratedForm, [IncludeInGeneratedForm]),
        [GeneratedFormSection] = ISNULL(@GeneratedFormSection, [GeneratedFormSection]),
        [IsNameField] = ISNULL(@IsNameField, [IsNameField]),
        [RelatedEntityID] = CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, [RelatedEntityID]) END,
        [RelatedEntityFieldName] = CASE WHEN @RelatedEntityFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFieldName, [RelatedEntityFieldName]) END,
        [IncludeRelatedEntityNameFieldInBaseView] = ISNULL(@IncludeRelatedEntityNameFieldInBaseView, [IncludeRelatedEntityNameFieldInBaseView]),
        [RelatedEntityNameFieldMap] = CASE WHEN @RelatedEntityNameFieldMap_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityNameFieldMap, [RelatedEntityNameFieldMap]) END,
        [RelatedEntityDisplayType] = ISNULL(@RelatedEntityDisplayType, [RelatedEntityDisplayType]),
        [EntityIDFieldName] = CASE WHEN @EntityIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@EntityIDFieldName, [EntityIDFieldName]) END,
        [ScopeDefault] = CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, [ScopeDefault]) END,
        [AutoUpdateRelatedEntityInfo] = ISNULL(@AutoUpdateRelatedEntityInfo, [AutoUpdateRelatedEntityInfo]),
        [ValuesToPackWithSchema] = ISNULL(@ValuesToPackWithSchema, [ValuesToPackWithSchema]),
        [Status] = ISNULL(@Status, [Status]),
        [AutoUpdateIsNameField] = ISNULL(@AutoUpdateIsNameField, [AutoUpdateIsNameField]),
        [AutoUpdateDefaultInView] = ISNULL(@AutoUpdateDefaultInView, [AutoUpdateDefaultInView]),
        [AutoUpdateCategory] = ISNULL(@AutoUpdateCategory, [AutoUpdateCategory]),
        [AutoUpdateDisplayName] = ISNULL(@AutoUpdateDisplayName, [AutoUpdateDisplayName]),
        [AutoUpdateIncludeInUserSearchAPI] = ISNULL(@AutoUpdateIncludeInUserSearchAPI, [AutoUpdateIncludeInUserSearchAPI]),
        [Encrypt] = ISNULL(@Encrypt, [Encrypt]),
        [EncryptionKeyID] = CASE WHEN @EncryptionKeyID_Clear = 1 THEN NULL ELSE ISNULL(@EncryptionKeyID, [EncryptionKeyID]) END,
        [AllowDecryptInAPI] = ISNULL(@AllowDecryptInAPI, [AllowDecryptInAPI]),
        [SendEncryptedValue] = ISNULL(@SendEncryptedValue, [SendEncryptedValue]),
        [IsSoftPrimaryKey] = ISNULL(@IsSoftPrimaryKey, [IsSoftPrimaryKey]),
        [IsSoftForeignKey] = ISNULL(@IsSoftForeignKey, [IsSoftForeignKey]),
        [RelatedEntityJoinFields] = CASE WHEN @RelatedEntityJoinFields_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityJoinFields, [RelatedEntityJoinFields]) END,
        [JSONType] = CASE WHEN @JSONType_Clear = 1 THEN NULL ELSE ISNULL(@JSONType, [JSONType]) END,
        [JSONTypeIsArray] = ISNULL(@JSONTypeIsArray, [JSONTypeIsArray]),
        [JSONTypeDefinition] = CASE WHEN @JSONTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@JSONTypeDefinition, [JSONTypeDefinition]) END,
        [UserSearchPredicateAPI] = ISNULL(@UserSearchPredicateAPI, [UserSearchPredicateAPI]),
        [AutoUpdateUserSearchPredicate] = ISNULL(@AutoUpdateUserSearchPredicate, [AutoUpdateUserSearchPredicate]),
        [AutoUpdateFullTextSearch] = ISNULL(@AutoUpdateFullTextSearch, [AutoUpdateFullTextSearch]),
        [AutoUpdateExtendedType] = ISNULL(@AutoUpdateExtendedType, [AutoUpdateExtendedType]),
        [IsComputed] = ISNULL(@IsComputed, [IsComputed]),
        [EmbeddedRecord] = CASE WHEN @EmbeddedRecord_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddedRecord, [EmbeddedRecord]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateEntityField];
GO
CREATE TRIGGER [__mj].trgUpdateEntityField
ON [__mj].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [__mj].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteEntityField];
GO

CREATE PROCEDURE [__mj].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [__mj].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer];

/* Index for Foreign Keys for FormChromeRule */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Form Chrome Rules
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table FormChromeRule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormChromeRule_EntityID' 
    AND object_id = OBJECT_ID('[__mj].[FormChromeRule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormChromeRule_EntityID ON [__mj].[FormChromeRule] ([EntityID]);

-- Index for foreign key RelatedEntityID in table FormChromeRule
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormChromeRule_RelatedEntityID' 
    AND object_id = OBJECT_ID('[__mj].[FormChromeRule]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormChromeRule_RelatedEntityID ON [__mj].[FormChromeRule] ([RelatedEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 1EBE0735-74CA-4931-A6D2-794946DD6473 */
EXEC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1EBE0735-74CA-4931-A6D2-794946DD6473', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID ACD8E07E-6134-4868-8111-55CC927F8D79 */
EXEC [__mj].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ACD8E07E-6134-4868-8111-55CC927F8D79', @RelatedEntityNameFieldMap='RelatedEntity';

/* Base View SQL for MJ: Form Chrome Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Form Chrome Rules
-- Item: vwFormChromeRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Form Chrome Rules
-----               SCHEMA:      __mj
-----               BASE TABLE:  FormChromeRule
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwFormChromeRules]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwFormChromeRules];
GO

CREATE VIEW [__mj].[vwFormChromeRules]
AS
SELECT
    f.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntity_RelatedEntityID.[Name] AS [RelatedEntity]
FROM
    [__mj].[FormChromeRule] AS f
INNER JOIN
    [__mj].[Entity] AS MJEntity_EntityID
  ON
    [f].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [__mj].[Entity] AS MJEntity_RelatedEntityID
  ON
    [f].[RelatedEntityID] = MJEntity_RelatedEntityID.[ID]
GO
GRANT SELECT ON [__mj].[vwFormChromeRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Form Chrome Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Form Chrome Rules
-- Item: Permissions for vwFormChromeRules
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwFormChromeRules] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Form Chrome Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Form Chrome Rules
-- Item: spCreateFormChromeRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormChromeRule
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateFormChromeRule]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateFormChromeRule];
GO

CREATE PROCEDURE [__mj].[spCreateFormChromeRule]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @TargetKind nvarchar(20),
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @Inclusion nvarchar(20),
    @JoinFields_Clear bit = 0,
    @JoinFields nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[FormChromeRule]
            (
                [ID],
                [EntityID],
                [TargetKind],
                [RelatedEntityID],
                [ContributionKey],
                [Inclusion],
                [JoinFields],
                [Sequence],
                [Title]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @TargetKind,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                @Inclusion,
                CASE WHEN @JoinFields_Clear = 1 THEN NULL ELSE ISNULL(@JoinFields, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[FormChromeRule]
            (
                [EntityID],
                [TargetKind],
                [RelatedEntityID],
                [ContributionKey],
                [Inclusion],
                [JoinFields],
                [Sequence],
                [Title]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @TargetKind,
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, NULL) END,
                @Inclusion,
                CASE WHEN @JoinFields_Clear = 1 THEN NULL ELSE ISNULL(@JoinFields, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwFormChromeRules] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateFormChromeRule] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Form Chrome Rules */

GRANT EXECUTE ON [__mj].[spCreateFormChromeRule] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Form Chrome Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Form Chrome Rules
-- Item: spUpdateFormChromeRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormChromeRule
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateFormChromeRule]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateFormChromeRule];
GO

CREATE PROCEDURE [__mj].[spUpdateFormChromeRule]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @TargetKind nvarchar(20) = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @ContributionKey_Clear bit = 0,
    @ContributionKey nvarchar(256) = NULL,
    @Inclusion nvarchar(20) = NULL,
    @JoinFields_Clear bit = 0,
    @JoinFields nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[FormChromeRule]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [TargetKind] = ISNULL(@TargetKind, [TargetKind]),
        [RelatedEntityID] = CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, [RelatedEntityID]) END,
        [ContributionKey] = CASE WHEN @ContributionKey_Clear = 1 THEN NULL ELSE ISNULL(@ContributionKey, [ContributionKey]) END,
        [Inclusion] = ISNULL(@Inclusion, [Inclusion]),
        [JoinFields] = CASE WHEN @JoinFields_Clear = 1 THEN NULL ELSE ISNULL(@JoinFields, [JoinFields]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwFormChromeRules] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwFormChromeRules]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateFormChromeRule] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormChromeRule table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateFormChromeRule]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateFormChromeRule];
GO
CREATE TRIGGER [__mj].trgUpdateFormChromeRule
ON [__mj].[FormChromeRule]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[FormChromeRule]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[FormChromeRule] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Form Chrome Rules */

GRANT EXECUTE ON [__mj].[spUpdateFormChromeRule] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Form Chrome Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Form Chrome Rules
-- Item: spDeleteFormChromeRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormChromeRule
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spDeleteFormChromeRule]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteFormChromeRule];
GO

CREATE PROCEDURE [__mj].[spDeleteFormChromeRule]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[FormChromeRule]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteFormChromeRule] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Form Chrome Rules */

GRANT EXECUTE ON [__mj].[spDeleteFormChromeRule] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '72a614cf-4ca4-40bc-b008-bd7328e94c33' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'Entity')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '72a614cf-4ca4-40bc-b008-bd7328e94c33',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 12,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '10ed6208-18e3-442d-abfb-a32811f7530e' OR (EntityID = '366CCF87-C774-450C-9048-875D1FBFABB9' AND Name = 'RelatedEntity')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            '10ed6208-18e3-442d-abfb-a32811f7530e',
            '366CCF87-C774-450C-9048-875D1FBFABB9', -- Entity: MJ: Form Chrome Rules
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [__mj].[EntityField] WHERE [EntityID] = '366CCF87-C774-450C-9048-875D1FBFABB9') + 13,
            'RelatedEntity',
            'Related Entity',
            NULL,
            'nvarchar',
            510,
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

