-- =============================================================================
-- Migration: V202611151200__v6.3.x__Artifact_Guest_Share_Links_And_WorkingState_Fixes.sql
-- Purpose:
--   1. Create [${flyway:defaultSchema}].[ArtifactGuestShareLink] table for durable
--      server-side tracking, revocation, and access telemetry of Frozen-only
--      external guest share links.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ArtifactGuestShareLink table
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ArtifactGuestShareLink] (
    [ID]                [uniqueidentifier] NOT NULL CONSTRAINT [DF_ArtifactGuestShareLink_ID] DEFAULT (NEWSEQUENTIALID()),
    [ArtifactID]        [uniqueidentifier] NOT NULL,
    [ArtifactVersionID] [uniqueidentifier] NOT NULL,
    [CreatedByUserID]   [uniqueidentifier] NOT NULL,
    [TokenHash]         [nvarchar](128) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [Label]             [nvarchar](200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ExpiresAt]         [datetimeoffset](7) NULL,
    [RevokedAt]         [datetimeoffset](7) NULL,
    [RevokedByUserID]   [uniqueidentifier] NULL,
    [LastAccessedAt]    [datetimeoffset](7) NULL,
    [AccessCount]       [int] NOT NULL CONSTRAINT [DF_ArtifactGuestShareLink_AccessCount] DEFAULT (0),
    CONSTRAINT [PK_ArtifactGuestShareLink] PRIMARY KEY CLUSTERED ([ID] ASC),
    CONSTRAINT [UQ_ArtifactGuestShareLink_TokenHash] UNIQUE NONCLUSTERED ([TokenHash] ASC),
    CONSTRAINT [FK_ArtifactGuestShareLink_Artifact] FOREIGN KEY ([ArtifactID])
        REFERENCES [${flyway:defaultSchema}].[Artifact]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_ArtifactGuestShareLink_ArtifactVersion] FOREIGN KEY ([ArtifactVersionID])
        REFERENCES [${flyway:defaultSchema}].[ArtifactVersion]([ID]) ON DELETE NO ACTION,
    CONSTRAINT [FK_ArtifactGuestShareLink_CreatedByUser] FOREIGN KEY ([CreatedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]) ON DELETE NO ACTION,
    CONSTRAINT [FK_ArtifactGuestShareLink_RevokedByUser] FOREIGN KEY ([RevokedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]) ON DELETE NO ACTION
);
GO

CREATE NONCLUSTERED INDEX [IX_ArtifactGuestShareLink_ArtifactVersionID]
    ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactVersionID] ASC, [RevokedAt] ASC);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores durable server-side records for Frozen-only external guest share links, enabling immediate token revocation, expiration checks, and access auditing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key of the guest share link record (corresponds to token jti / LinkID).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'ID';
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
    @value = N'Unique SHA-256 hex digest of the signed guest share token used for constant-lookup server verification without persisting the raw bearer token.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'TokenHash';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional human-readable label identifying the external recipient or review purpose.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'Label';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UTC timestamp after which the guest share link is expired and must be rejected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UTC timestamp when the guest share link was explicitly revoked, or NULL while active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'RevokedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the User who revoked this guest share link, if revoked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'RevokedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UTC timestamp of the most recent successful guest token resolution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'LastAccessedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total count of successful guest link resolutions recorded for this link.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactGuestShareLink',
    @level2type = N'COLUMN', @level2name = N'AccessCount';
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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'bc48a891-3f71-404d-8a25-cba04697f6aa',
         'MJ: Artifact Guest Share Links',
         'Artifact Guest Share Links',
         'Stores durable server-side records for Frozen-only external guest share links, enabling immediate token revocation, expiration checks, and access auditing.',
         NULL,
         'ArtifactGuestShareLink',
         'vwArtifactGuestShareLinks',
         '${flyway:defaultSchema}',
         1,
         0,
         0,
         0,
         0,
         0,
         0,
         0,
         0,
         0,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Artifact Guest Share Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bc48a891-3f71-404d-8a25-cba04697f6aa', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Artifact Guest Share Links for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bc48a891-3f71-404d-8a25-cba04697f6aa' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bc48a891-3f71-404d-8a25-cba04697f6aa' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Artifact Guest Share Links for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bc48a891-3f71-404d-8a25-cba04697f6aa' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bc48a891-3f71-404d-8a25-cba04697f6aa' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Artifact Guest Share Links for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bc48a891-3f71-404d-8a25-cba04697f6aa' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bc48a891-3f71-404d-8a25-cba04697f6aa' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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

/* SQL text to insert 13 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b13ddbeb-1ba8-4485-b37b-7e9f89914660' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'ID')) BEGIN
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
            'b13ddbeb-1ba8-4485-b37b-7e9f89914660',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'ID',
            'ID',
            'Primary key of the guest share link record (corresponds to token jti / LinkID).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e34df37a-d22f-4118-9630-604b8da05b7a' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'ArtifactID')) BEGIN
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
            'e34df37a-d22f-4118-9630-604b8da05b7a',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a751f20-a6e0-4f6b-bf78-b1fe77bc7199' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'ArtifactVersionID')) BEGIN
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
            '0a751f20-a6e0-4f6b-bf78-b1fe77bc7199',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2634ae1f-f97a-4d86-8bb4-1aba8dc89297' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'CreatedByUserID')) BEGIN
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
            '2634ae1f-f97a-4d86-8bb4-1aba8dc89297',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3100e1a-1d4d-4173-ba02-610ce1b3f621' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'TokenHash')) BEGIN
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
            'a3100e1a-1d4d-4173-ba02-610ce1b3f621',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'TokenHash',
            'Token Hash',
            'Unique SHA-256 hex digest of the signed guest share token used for constant-lookup server verification without persisting the raw bearer token.',
            'nvarchar',
            256,
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd932c246-fa9d-45cc-b10b-4070ca4a515a' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'Label')) BEGIN
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
            'd932c246-fa9d-45cc-b10b-4070ca4a515a',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1555cbcb-156a-4288-8090-1701cc72051e' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'ExpiresAt')) BEGIN
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
            '1555cbcb-156a-4288-8090-1701cc72051e',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'ExpiresAt',
            'Expires At',
            'UTC timestamp after which the guest share link is expired and must be rejected.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37a122c9-34fc-45b4-9f1e-b5a4419975c3' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'RevokedAt')) BEGIN
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
            '37a122c9-34fc-45b4-9f1e-b5a4419975c3',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'RevokedAt',
            'Revoked At',
            'UTC timestamp when the guest share link was explicitly revoked, or NULL while active.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4dc6f355-a895-45f7-978b-40b707e1dcdc' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'RevokedByUserID')) BEGIN
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
            '4dc6f355-a895-45f7-978b-40b707e1dcdc',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'RevokedByUserID',
            'Revoked By User ID',
            'Foreign key to the User who revoked this guest share link, if revoked.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0333e5de-6d4b-4363-a4c1-18ebccea8618' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'LastAccessedAt')) BEGIN
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
            '0333e5de-6d4b-4363-a4c1-18ebccea8618',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'LastAccessedAt',
            'Last Accessed At',
            'UTC timestamp of the most recent successful guest token resolution.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'baa9e839-e3fa-4044-8d0a-b95df4f9d955' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'AccessCount')) BEGIN
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
            'baa9e839-e3fa-4044-8d0a-b95df4f9d955',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'AccessCount',
            'Access Count',
            'Total count of successful guest link resolutions recorded for this link.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '594fba85-7bce-44dd-910d-d6f24e60f678' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = '__mj_CreatedAt')) BEGIN
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
            '594fba85-7bce-44dd-910d-d6f24e60f678',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b4c5382-3ec0-4a6b-ba4b-5771e9249109' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0b4c5382-3ec0-4a6b-ba4b-5771e9249109',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

/* SQL text to sync entity unique keys (1 added, 0 updated, 0 removed) */
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('f1e3124e-a10e-44f2-a8d9-c8b9fb727eff', 'BC48A891-3F71-404D-8A25-CBA04697F6AA', 'UQ_ArtifactGuestShareLink_TokenHash', 'TokenHash', NULL);

/* Deterministic search-flag hygiene — seed name fields */

         UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [IncludeInUserSearchAPI] = 1,
             [UserSearchPredicateAPI] = 'BeginsWith'
         WHERE [ID] IN (
            SELECT ranked.[ID] FROM (
               SELECT f.[ID],
                      ROW_NUMBER() OVER (
                         PARTITION BY f.[EntityID]
                         ORDER BY f.[Sequence], f.[Name]
                      ) AS rn
               FROM [${flyway:defaultSchema}].[EntityField] f
               INNER JOIN [${flyway:defaultSchema}].[Entity] e ON e.[ID] = f.[EntityID]
               WHERE LOWER(f.[Name]) IN ('name','title','firstname','lastname','middlename','displayname','fullname','label')
                 AND f.[AutoUpdateIncludeInUserSearchAPI] = 1
                 AND f.[IncludeInUserSearchAPI] = 0
                 AND ISNULL(f.[IsPrimaryKey], 0) = 0
                 AND ISNULL(f.[IsVirtual], 0) = 0
                 AND LOWER(f.[Type]) IN ('nvarchar','varchar','char','nchar')
                 AND ISNULL(f.[Length], 0) <> -1
                 AND e.[VirtualEntity] = 0
                 AND e.[AllowUserSearchAPI] = 1
                 AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
                 AND NOT ((e.[Name] = 'Logs' OR e.[Name] LIKE '% Logs') OR (e.[Name] = 'Log' OR e.[Name] LIKE '% Log') OR (e.[Name] = 'Runs' OR e.[Name] LIKE '% Runs') OR (e.[Name] = 'Run' OR e.[Name] LIKE '% Run') OR (e.[Name] = 'Run History' OR e.[Name] LIKE '% Run History') OR (e.[Name] = 'Run Steps' OR e.[Name] LIKE '% Run Steps') OR (e.[Name] = 'Run Messages' OR e.[Name] LIKE '% Run Messages') OR (e.[Name] = 'Execution Logs' OR e.[Name] LIKE '% Execution Logs') OR (e.[Name] = 'Details' OR e.[Name] LIKE '% Details') OR (e.[Name] = 'Detail' OR e.[Name] LIKE '% Detail') OR (e.[Name] = 'Lines' OR e.[Name] LIKE '% Lines') OR (e.[Name] = 'Line' OR e.[Name] LIKE '% Line') OR (e.[Name] = 'Items' OR e.[Name] LIKE '% Items') OR (e.[Name] = 'Item' OR e.[Name] LIKE '% Item') OR (e.[Name] = 'Steps' OR e.[Name] LIKE '% Steps') OR (e.[Name] = 'Step' OR e.[Name] LIKE '% Step') OR (e.[Name] = 'Params' OR e.[Name] LIKE '% Params') OR (e.[Name] = 'Param' OR e.[Name] LIKE '% Param') OR (e.[Name] = 'Mappings' OR e.[Name] LIKE '% Mappings') OR (e.[Name] = 'Mapping' OR e.[Name] LIKE '% Mapping') OR (e.[Name] = 'Audit' OR e.[Name] LIKE 'Audit %' OR e.[Name] LIKE '% Audit' OR e.[Name] LIKE '% Audit %') OR (e.[Name] = 'Record Change' OR e.[Name] LIKE 'Record Change %' OR e.[Name] LIKE '% Record Change' OR e.[Name] LIKE '% Record Change %'))
                 AND e.[SchemaName] NOT IN ('sys','staging')
                 AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
            ) ranked
            WHERE ranked.rn <= 3
         );


/* Create Entity Relationship: MJ: Users -> MJ: Artifact Guest Share Links (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3f15a655-460f-4ca7-9e2b-01947621e6da' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3f15a655-460f-4ca7-9e2b-01947621e6da', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BC48A891-3F71-404D-8A25-CBA04697F6AA', 'CreatedByUserID', 'One To Many', 0, 0, 131, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Artifact Guest Share Links (One To Many via RevokedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '93a88402-7559-4bf4-a936-5a8adbaaad72' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND [RelatedEntityJoinField] = 'RevokedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('93a88402-7559-4bf4-a936-5a8adbaaad72', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BC48A891-3F71-404D-8A25-CBA04697F6AA', 'RevokedByUserID', 'One To Many', 0, 0, 132, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifacts -> MJ: Artifact Guest Share Links (One To Many via ArtifactID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '70f84d62-4500-4c66-95a6-886e9391ad05' OR ([EntityID] = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND [RelatedEntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND [RelatedEntityJoinField] = 'ArtifactID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('70f84d62-4500-4c66-95a6-886e9391ad05', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'BC48A891-3F71-404D-8A25-CBA04697F6AA', 'ArtifactID', 'One To Many', 0, 0, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifact Versions -> MJ: Artifact Guest Share Links (One To Many via ArtifactVersionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cab834ac-50fc-49fd-876e-ec403b1d5e41' OR ([EntityID] = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND [RelatedEntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND [RelatedEntityJoinField] = 'ArtifactVersionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cab834ac-50fc-49fd-876e-ec403b1d5e41', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'BC48A891-3F71-404D-8A25-CBA04697F6AA', 'ArtifactVersionID', 'One To Many', 0, 0, 7, GETUTCDATE(), GETUTCDATE())
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
-- Index for foreign key ArtifactID in table ArtifactGuestShareLink
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ArtifactID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ArtifactGuestShareLink
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactVersionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ArtifactVersionID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_ArtifactVersionID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([ArtifactVersionID]);

-- Index for foreign key CreatedByUserID in table ArtifactGuestShareLink
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_CreatedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'CreatedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_CreatedByUserID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([CreatedByUserID]);

-- Index for foreign key RevokedByUserID in table ArtifactGuestShareLink
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_RevokedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactGuestShareLink]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RevokedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactGuestShareLink_RevokedByUserID ON [${flyway:defaultSchema}].[ArtifactGuestShareLink] ([RevokedByUserID]);

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
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    MJUser_RevokedByUserID.[Name] AS [RevokedByUser]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_RevokedByUserID
  ON
    [a].[RevokedByUserID] = MJUser_RevokedByUserID.[ID]
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
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CreatedByUserID uniqueidentifier,
    @TokenHash nvarchar(128),
    @Label_Clear bit = 0,
    @Label nvarchar(200) = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevokedByUserID_Clear bit = 0,
    @RevokedByUserID uniqueidentifier = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL
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
                [ArtifactID],
                [ArtifactVersionID],
                [CreatedByUserID],
                [TokenHash],
                [Label],
                [ExpiresAt],
                [RevokedAt],
                [RevokedByUserID],
                [LastAccessedAt],
                [AccessCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ArtifactID,
                @ArtifactVersionID,
                @CreatedByUserID,
                @TokenHash,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevokedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RevokedByUserID, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ArtifactGuestShareLink]
            (
                [ArtifactID],
                [ArtifactVersionID],
                [CreatedByUserID],
                [TokenHash],
                [Label],
                [ExpiresAt],
                [RevokedAt],
                [RevokedByUserID],
                [LastAccessedAt],
                [AccessCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ArtifactID,
                @ArtifactVersionID,
                @CreatedByUserID,
                @TokenHash,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevokedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RevokedByUserID, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0)
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
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @TokenHash nvarchar(128) = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(200) = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevokedByUserID_Clear bit = 0,
    @RevokedByUserID uniqueidentifier = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactGuestShareLink]
    SET
        [ArtifactID] = ISNULL(@ArtifactID, [ArtifactID]),
        [ArtifactVersionID] = ISNULL(@ArtifactVersionID, [ArtifactVersionID]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [TokenHash] = ISNULL(@TokenHash, [TokenHash]),
        [Label] = CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, [Label]) END,
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [RevokedAt] = CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, [RevokedAt]) END,
        [RevokedByUserID] = CASE WHEN @RevokedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RevokedByUserID, [RevokedByUserID]) END,
        [LastAccessedAt] = CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, [LastAccessedAt]) END,
        [AccessCount] = ISNULL(@AccessCount, [AccessCount]),
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


/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b77c36da-aaba-46cc-a55f-b2d13c9ebe1c' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'Artifact')) BEGIN
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
            'b77c36da-aaba-46cc-a55f-b2d13c9ebe1c',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70466d95-a563-4b2f-8e95-8f1591f39440' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'ArtifactVersion')) BEGIN
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
            '70466d95-a563-4b2f-8e95-8f1591f39440',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '863ee393-050d-4b90-a3a2-7c32a8ec3e8c' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'CreatedByUser')) BEGIN
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
            '863ee393-050d-4b90-a3a2-7c32a8ec3e8c',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa8530c3-75bb-40cb-ac08-a33c757fb0e8' OR (EntityID = 'BC48A891-3F71-404D-8A25-CBA04697F6AA' AND Name = 'RevokedByUser')) BEGIN
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
            'aa8530c3-75bb-40cb-ac08-a33c757fb0e8',
            'BC48A891-3F71-404D-8A25-CBA04697F6AA', -- Entity: MJ: Artifact Guest Share Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BC48A891-3F71-404D-8A25-CBA04697F6AA'),
            'RevokedByUser',
            'Revoked By User',
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
