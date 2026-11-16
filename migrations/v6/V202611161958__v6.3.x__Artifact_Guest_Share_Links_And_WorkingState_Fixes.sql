-- =============================================================================
-- Migration: V202611161958__v6.3.x__Artifact_Guest_Share_Links_And_WorkingState_Fixes.sql
-- Purpose:
--   Create [${flyway:defaultSchema}].[ArtifactGuestShareLink] linking a Magic Link
--   resource-share invite (`MagicLinkInvite`) to an immutable pinned `ArtifactVersion`
--   and human-readable recipient `Label` for Frozen-only external guest sharing.
--   Token generation, SHA-256 hashing, expiry, revocation, usage bounds, and audit
--   redemption live in `MagicLinkInvite` / `MagicLinkRedemption`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ArtifactGuestShareLink table
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] (
    [ID]                [uniqueidentifier] NOT NULL CONSTRAINT [DF_ArtifactGuestShareLink_ID] DEFAULT (NEWSEQUENTIALID()),
    [MagicLinkInviteID] [uniqueidentifier] NOT NULL,
    [ArtifactID]        [uniqueidentifier] NOT NULL,
    [ArtifactVersionID] [uniqueidentifier] NOT NULL,
    [CreatedByUserID]   [uniqueidentifier] NOT NULL,
    [Label]             [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CONSTRAINT [PK_ArtifactGuestShareLink] PRIMARY KEY CLUSTERED ([ID] ASC),
    CONSTRAINT [UQ_ArtifactGuestShareLink_MagicLinkInviteID] UNIQUE NONCLUSTERED ([MagicLinkInviteID] ASC),
    CONSTRAINT [FK_ArtifactGuestShareLink_MagicLinkInvite] FOREIGN KEY ([MagicLinkInviteID])
        REFERENCES [${flyway:defaultSchema}].[MagicLinkInvite]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_ArtifactGuestShareLink_Artifact] FOREIGN KEY ([ArtifactID])
        REFERENCES [${flyway:defaultSchema}].[Artifact]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_ArtifactGuestShareLink_ArtifactVersion] FOREIGN KEY ([ArtifactVersionID])
        REFERENCES [${flyway:defaultSchema}].[ArtifactVersion]([ID]) ON DELETE NO ACTION,
    CONSTRAINT [FK_ArtifactGuestShareLink_CreatedByUser] FOREIGN KEY ([CreatedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]) ON DELETE NO ACTION
);
GO

CREATE NONCLUSTERED INDEX [IX_ArtifactGuestShareLink_ArtifactID]
    ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactID] ASC);
GO

CREATE NONCLUSTERED INDEX [IX_ArtifactGuestShareLink_ArtifactVersionID]
    ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactVersionID] ASC);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links an anonymous resource-share MagicLinkInvite to an immutable Frozen ArtifactVersion and optional recipient label for external guest sharing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key of the artifact guest share link binding record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the MagicLinkInvite managing token hashing, expiry, revocation, usage limits, and redemption audit.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the shared Artifact record. Cascades on artifact deletion.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'ArtifactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the specific pinned ArtifactVersion snapshot exposed by this guest link.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'ArtifactVersionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the User who created this external guest share link.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'CreatedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional human-readable label identifying the external recipient or review purpose.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'Label';
GO






















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
/* SQL generated to create new entity MJ: Artifact Guest Share Links */
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
         '1ae4fed7-b3ec-425b-bd9a-26f17a6f7222',
         'MJ: Artifact Guest Share Links',
         'Artifact Guest Share Links',
         'Links an anonymous resource-share MagicLinkInvite to an immutable Frozen ArtifactVersion and optional recipient label for external guest sharing.',
         NULL,
         'ArtifactGuestShareLink',
         'vwArtifactGuestShareLinks',
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
/* SQL generated to add new entity MJ: Artifact Guest Share Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1ae4fed7-b3ec-425b-bd9a-26f17a6f7222', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());
/* SQL generated to add new permission for entity MJ: Artifact Guest Share Links for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1ae4fed7-b3ec-425b-bd9a-26f17a6f7222' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1ae4fed7-b3ec-425b-bd9a-26f17a6f7222' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );
/* SQL generated to add new permission for entity MJ: Artifact Guest Share Links for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1ae4fed7-b3ec-425b-bd9a-26f17a6f7222' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1ae4fed7-b3ec-425b-bd9a-26f17a6f7222' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );
/* SQL generated to add new permission for entity MJ: Artifact Guest Share Links for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1ae4fed7-b3ec-425b-bd9a-26f17a6f7222' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1ae4fed7-b3ec-425b-bd9a-26f17a6f7222' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
UPDATE [${flyway:defaultSchema}].[ArtifactGuestShareLink] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] ADD CONSTRAINT [DF___mj_ArtifactGuestShareLink___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
UPDATE [${flyway:defaultSchema}].[ArtifactGuestShareLink] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO
/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactGuestShareLink */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] ADD CONSTRAINT [DF___mj_ArtifactGuestShareLink___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f595635e-cc99-4ffc-9151-36aa0c0512ef' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'ID')) BEGIN
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
            'f595635e-cc99-4ffc-9151-36aa0c0512ef',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'ID',
            'ID',
            'Primary key of the artifact guest share link binding record.',
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f7ec0a4-9408-48a3-87d9-c847fcc9b54e' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'MagicLinkInviteID')) BEGIN
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
            '0f7ec0a4-9408-48a3-87d9-c847fcc9b54e',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'MagicLinkInviteID',
            'Magic Link Invite ID',
            'Foreign key to the MagicLinkInvite managing token hashing, expiry, revocation, usage limits, and redemption audit.',
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
            'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '531a3948-3cbb-4209-8e3c-3079d15af7f2' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'ArtifactID')) BEGIN
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
            '531a3948-3cbb-4209-8e3c-3079d15af7f2',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'ArtifactID',
            'Artifact ID',
            'Foreign key to the shared Artifact record. Cascades on artifact deletion.',
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
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f07b7c51-f532-48e1-b4c1-31f8b34b76ac' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'ArtifactVersionID')) BEGIN
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
            'f07b7c51-f532-48e1-b4c1-31f8b34b76ac',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'ArtifactVersionID',
            'Artifact Version ID',
            'Foreign key to the specific pinned ArtifactVersion snapshot exposed by this guest link.',
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
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cd350b5-2fe5-42da-957b-a6e9c9e6e47e' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'CreatedByUserID')) BEGIN
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
            '5cd350b5-2fe5-42da-957b-a6e9c9e6e47e',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'CreatedByUserID',
            'Created By User ID',
            'Foreign key to the User who created this external guest share link.',
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
      END;
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f2efb34-49d4-4b0d-b5a1-472f25b2863e' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'Label')) BEGIN
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
            '6f2efb34-49d4-4b0d-b5a1-472f25b2863e',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'Label',
            'Label',
            'Optional human-readable label identifying the external recipient or review purpose.',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5fbf005-6aa8-41f8-b811-a86ee50f1b74' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f5fbf005-6aa8-41f8-b811-a86ee50f1b74',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '655ac861-efbc-4480-ad8b-6455bb79c64a' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '655ac861-efbc-4480-ad8b-6455bb79c64a',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
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

/* Create Entity Relationship: MJ: Users -> MJ: Artifact Guest Share Links (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f5fc0cb7-3081-4b6b-9702-17cf2f1248dd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f5fc0cb7-3081-4b6b-9702-17cf2f1248dd', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', 'CreatedByUserID', 'One To Many', 1, 1, 131, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ: Artifacts -> MJ: Artifact Guest Share Links (One To Many via ArtifactID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c8697bc5-cd15-4992-9a3e-edd1c7dd5746'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c8697bc5-cd15-4992-9a3e-edd1c7dd5746', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', 'ArtifactID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Artifact Guest Share Links (One To Many via MagicLinkInviteID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '58d27707-e858-4a11-834a-766ef2dbc6e5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('58d27707-e858-4a11-834a-766ef2dbc6e5', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', 'MagicLinkInviteID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ: Artifact Versions -> MJ: Artifact Guest Share Links (One To Many via ArtifactVersionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '48fd8c06-0386-4767-b9a7-7a5acd341223'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('48fd8c06-0386-4767-b9a7-7a5acd341223', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', 'ArtifactVersionID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
/* Index for Foreign Keys for ArtifactGuestShareLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Guest Share Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MagicLinkInviteID in table ArtifactGuestShareLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_MagicLinkInviteID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_MagicLinkInviteID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([MagicLinkInviteID]);
-- Index for foreign key ArtifactID in table ArtifactGuestShareLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactID]);
-- Index for foreign key ArtifactVersionID in table ArtifactGuestShareLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactVersionID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactVersionID]);
-- Index for foreign key CreatedByUserID in table ArtifactGuestShareLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_CreatedByUserID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([CreatedByUserID]);
/* Base View SQL for MJ: Artifact Guest Share Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Guest Share Links
-- Item: vwArtifactGuestShareLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Guest Share Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactGuestShareLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactGuestShareLinks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactGuestShareLinks];
GO
CREATE VIEW [${flyway:defaultSchema}].[vwArtifactGuestShareLinks]
AS
SELECT
    a.*,
    MJArtifact_ArtifactID.[Name] AS [Artifact],
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[ArtifactGuestShareLink] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Artifact] AS MJArtifact_ArtifactID
  ON
    [a].[ArtifactID] = MJArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [a].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [a].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactGuestShareLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* Base View Permissions SQL for MJ: Artifact Guest Share Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Guest Share Links
-- Item: Permissions for vwArtifactGuestShareLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactGuestShareLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* spCreate SQL for MJ: Artifact Guest Share Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Guest Share Links
-- Item: spCreateArtifactGuestShareLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactGuestShareLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactGuestShareLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactGuestShareLink];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactGuestShareLink]
    @ID uniqueidentifier = NULL,
    @MagicLinkInviteID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CreatedByUserID uniqueidentifier,
    @Label_Clear bit = 0,
    @Label nvarchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ArtifactGuestShareLink]
            (
                [ID],
                [MagicLinkInviteID],
                [ArtifactID],
                [ArtifactVersionID],
                [CreatedByUserID],
                [Label]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MagicLinkInviteID,
                @ArtifactID,
                @ArtifactVersionID,
                @CreatedByUserID,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactGuestShareLink]
            (
                [MagicLinkInviteID],
                [ArtifactID],
                [ArtifactVersionID],
                [CreatedByUserID],
                [Label]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MagicLinkInviteID,
                @ArtifactID,
                @ArtifactVersionID,
                @CreatedByUserID,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactGuestShareLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactGuestShareLink] TO [cdp_Developer], [cdp_Integration];
/* spCreate Permissions for MJ: Artifact Guest Share Links */
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactGuestShareLink] TO [cdp_Developer], [cdp_Integration];
/* spUpdate SQL for MJ: Artifact Guest Share Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Guest Share Links
-- Item: spUpdateArtifactGuestShareLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactGuestShareLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactGuestShareLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactGuestShareLink];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactGuestShareLink]
    @ID uniqueidentifier,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactGuestShareLink]
    SET
        [MagicLinkInviteID] = ISNULL(@MagicLinkInviteID, [MagicLinkInviteID]),
        [ArtifactID] = ISNULL(@ArtifactID, [ArtifactID]),
        [ArtifactVersionID] = ISNULL(@ArtifactVersionID, [ArtifactVersionID]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [Label] = CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, [Label]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID
    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactGuestShareLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactGuestShareLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactGuestShareLink] TO [cdp_Developer], [cdp_Integration]
GO
------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactGuestShareLink table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactGuestShareLink]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactGuestShareLink];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactGuestShareLink
ON [${flyway:defaultSchema}].[ArtifactGuestShareLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[ArtifactGuestShareLink]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[ArtifactGuestShareLink] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO
/* spUpdate Permissions for MJ: Artifact Guest Share Links */
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactGuestShareLink] TO [cdp_Developer], [cdp_Integration];
/* spDelete SQL for MJ: Artifact Guest Share Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Guest Share Links
-- Item: spDeleteArtifactGuestShareLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactGuestShareLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactGuestShareLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactGuestShareLink];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactGuestShareLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactGuestShareLink]
    WHERE
        [ID] = @ID

    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactGuestShareLink] TO [cdp_Developer], [cdp_Integration];
/* spDelete Permissions for MJ: Artifact Guest Share Links */
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactGuestShareLink] TO [cdp_Developer], [cdp_Integration];
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ba7abc8-8e6b-436c-8359-057e574db16a' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'Artifact')) BEGIN
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
            '8ba7abc8-8e6b-436c-8359-057e574db16a',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'Artifact',
            'Artifact',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a2d862f-f6b7-4c21-b144-e8f44c354618' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'ArtifactVersion')) BEGIN
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
            '9a2d862f-f6b7-4c21-b144-e8f44c354618',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'ArtifactVersion',
            'Artifact Version',
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
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'acb8e293-c48d-4d86-bfda-45d2781216f7' OR (EntityID = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222' AND Name = 'CreatedByUser')) BEGIN
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
            'acb8e293-c48d-4d86-bfda-45d2781216f7',
            '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1AE4FED7-B3EC-425B-BD9A-26F17A6F7222'),
            'CreatedByUser',
            'Created By User',
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
