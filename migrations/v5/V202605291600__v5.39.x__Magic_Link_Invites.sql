-- Migration: Create MagicLinkInvite table
-- Description: Backing store for shareable, single-use, app-scoped magic-link
--   invites that let EXTERNAL users into MJ without a password and without
--   access to the whole Explorer. Each invite is bound to one Application and
--   one (restricted) Role; redeeming it provisions/links a user with exactly
--   that scope and mints a short-lived MJ-issued JWT.
--
-- Security model (see plans/auth0-magic-link.md):
--   * The raw token is NEVER stored — only its SHA-256 hash (TokenHash),
--     mirroring the @memberjunction/api-keys pattern. The raw token lives only
--     in the emailed URL.
--   * Single-use is enforced at redemption: ConsumedAt / UseCount are written in
--     the same transaction that mints the JWT; an already-consumed, expired, or
--     revoked invite is rejected.
--   * The RoleID is the real authorization boundary (entity-level permissions),
--     not the nav filtering.
--
-- NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared
--   here — CodeGen generates those. The UNIQUE constraint on TokenHash IS
--   declared here because it is not a foreign key.

CREATE TABLE ${flyway:defaultSchema}.MagicLinkInvite (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    TokenHash NVARCHAR(128) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    ApplicationID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    ExpiresAt DATETIMEOFFSET NOT NULL,
    ConsumedAt DATETIMEOFFSET NULL,
    MaxUses INT NOT NULL DEFAULT 1,
    UseCount INT NOT NULL DEFAULT 0,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_MagicLinkInvite PRIMARY KEY (ID),
    CONSTRAINT UQ_MagicLinkInvite_TokenHash UNIQUE (TokenHash),
    CONSTRAINT FK_MagicLinkInvite_Application FOREIGN KEY (ApplicationID)
        REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_MagicLinkInvite_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT FK_MagicLinkInvite_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_MagicLinkInvite_Status
        CHECK (Status IN ('Active', 'Consumed', 'Revoked', 'Expired')),
    CONSTRAINT CK_MagicLinkInvite_UseCount
        CHECK (UseCount >= 0 AND UseCount <= MaxUses)
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A shareable, single-use, app-scoped magic-link invite for an external user. Bound to one Application and one restricted Role; redeeming it provisions/links a user with that scope and mints a short-lived MJ-issued JWT. The raw token is never stored — only its SHA-256 hash.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'SHA-256 hash (hex) of the raw magic-link token. The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'TokenHash';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Email address the invite was issued to and delivered at. Becomes the provisioned user''s email on first redemption.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'Email';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Application — the single app this invite grants access to. The provisioned user receives exactly one User Application record for this app.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'ApplicationID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Role — the restricted role assigned to the redeeming user. This role''s entity permissions are the real authorization boundary that confines the external user to the shared app''s data.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'RoleID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Hard expiry for the link. After this instant the invite cannot be redeemed regardless of Status.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'ExpiresAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp of the first successful redemption. NULL while unconsumed. Set in the same transaction that mints the session JWT to enforce single-use semantics.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'ConsumedAt';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Maximum number of times this invite may be redeemed. Defaults to 1 (true single-use). Set higher only for intentionally multi-use links.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'MaxUses';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Number of times this invite has been redeemed so far. Incremented on each successful redemption; redemption is rejected once UseCount reaches MaxUses.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'UseCount';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to User — the internal user who created/shared this invite. Audit trail for who granted external access.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'CreatedByUserID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Lifecycle status: Active (redeemable), Consumed (single-use link fully redeemed), Revoked (manually disabled), Expired (past ExpiresAt). Revoking an unconsumed link is the primary revocation mechanism.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'MagicLinkInvite',
    @level2type=N'COLUMN', @level2name=N'Status';


















































/* SQL generated to create new entity MJ: Magic Link Invites */

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
         '05dc3512-e608-462b-955f-11ba6aef3aae',
         'MJ: Magic Link Invites',
         'Magic Link Invites',
         'A shareable, single-use, app-scoped magic-link invite for an external user. Bound to one Application and one restricted Role; redeeming it provisions/links a user with that scope and mints a short-lived MJ-issued JWT. The raw token is never stored — only its SHA-256 hash.',
         NULL,
         'MagicLinkInvite',
         'vwMagicLinkInvites',
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

/* SQL generated to add new entity MJ: Magic Link Invites to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '05dc3512-e608-462b-955f-11ba6aef3aae', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invites for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('05dc3512-e608-462b-955f-11ba6aef3aae', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invites for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('05dc3512-e608-462b-955f-11ba6aef3aae', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Magic Link Invites for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('05dc3512-e608-462b-955f-11ba6aef3aae', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD CONSTRAINT [DF___mj_MagicLinkInvite___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MagicLinkInvite */
ALTER TABLE [${flyway:defaultSchema}].[MagicLinkInvite] ADD CONSTRAINT [DF___mj_MagicLinkInvite___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3ae0e05-3679-4d33-96dc-cfdca474b86d' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'ID')) BEGIN
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
            'd3ae0e05-3679-4d33-96dc-cfdca474b86d',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f3d5127-17e1-40e0-be01-14a5d00bbf8d' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'TokenHash')) BEGIN
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
            '4f3d5127-17e1-40e0-be01-14a5d00bbf8d',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100002,
            'TokenHash',
            'Token Hash',
            'SHA-256 hash (hex) of the raw magic-link token. The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.',
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
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9dd56199-690e-4d79-bca5-b1b159fe326c' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'Email')) BEGIN
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
            '9dd56199-690e-4d79-bca5-b1b159fe326c',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100003,
            'Email',
            'Email',
            'Email address the invite was issued to and delivered at. Becomes the provisioned user''s email on first redemption.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6ce9f45-656d-42ef-be1e-8a73542da45d' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'ApplicationID')) BEGIN
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
            'd6ce9f45-656d-42ef-be1e-8a73542da45d',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100004,
            'ApplicationID',
            'Application ID',
            'Foreign key to Application — the single app this invite grants access to. The provisioned user receives exactly one User Application record for this app.',
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
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5f8b345-d487-458e-87da-383812299778' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'RoleID')) BEGIN
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
            'c5f8b345-d487-458e-87da-383812299778',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100005,
            'RoleID',
            'Role ID',
            'Foreign key to Role — the restricted role assigned to the redeeming user. This role''s entity permissions are the real authorization boundary that confines the external user to the shared app''s data.',
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
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'deb2f56e-eeb7-489d-b659-ea5a8ef084b6' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'ExpiresAt')) BEGIN
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
            'deb2f56e-eeb7-489d-b659-ea5a8ef084b6',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100006,
            'ExpiresAt',
            'Expires At',
            'Hard expiry for the link. After this instant the invite cannot be redeemed regardless of Status.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95bc5f14-ff85-425f-b2fc-f0aa5c6fcf48' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'ConsumedAt')) BEGIN
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
            '95bc5f14-ff85-425f-b2fc-f0aa5c6fcf48',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100007,
            'ConsumedAt',
            'Consumed At',
            'Timestamp of the first successful redemption. NULL while unconsumed. Set in the same transaction that mints the session JWT to enforce single-use semantics.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9650c390-0efb-483d-9206-af6d793dc209' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'MaxUses')) BEGIN
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
            '9650c390-0efb-483d-9206-af6d793dc209',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100008,
            'MaxUses',
            'Max Uses',
            'Maximum number of times this invite may be redeemed. Defaults to 1 (true single-use). Set higher only for intentionally multi-use links.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34053052-6f2f-4553-87aa-d5905dd864b0' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'UseCount')) BEGIN
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
            '34053052-6f2f-4553-87aa-d5905dd864b0',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100009,
            'UseCount',
            'Use Count',
            'Number of times this invite has been redeemed so far. Incremented on each successful redemption; redemption is rejected once UseCount reaches MaxUses.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '044fa6e0-ec60-47ed-b7b7-b74725a6986f' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'CreatedByUserID')) BEGIN
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
            '044fa6e0-ec60-47ed-b7b7-b74725a6986f',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100010,
            'CreatedByUserID',
            'Created By User ID',
            'Foreign key to User — the internal user who created/shared this invite. Audit trail for who granted external access.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e9f0d18-8548-40b3-8716-50257c8d41e0' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'Status')) BEGIN
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
            '7e9f0d18-8548-40b3-8716-50257c8d41e0',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100011,
            'Status',
            'Status',
            'Lifecycle status: Active (redeemable), Consumed (single-use link fully redeemed), Revoked (manually disabled), Expired (past ExpiresAt). Revoking an unconsumed link is the primary revocation mechanism.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82289e31-65c7-43a5-ac93-acbe526b79d9' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = '__mj_CreatedAt')) BEGIN
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
            '82289e31-65c7-43a5-ac93-acbe526b79d9',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5099de02-7c2f-4148-8ee4-cd264c66a26d' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5099de02-7c2f-4148-8ee4-cd264c66a26d',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
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

/* SQL text to insert entity field value with ID f1377dd1-e9c0-466c-be40-9e77a6cfb8d2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1377dd1-e9c0-466c-be40-9e77a6cfb8d2', '7E9F0D18-8548-40B3-8716-50257C8D41E0', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c514ca77-c291-420b-9bf5-4e584af7b480 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c514ca77-c291-420b-9bf5-4e584af7b480', '7E9F0D18-8548-40B3-8716-50257C8D41E0', 2, 'Consumed', 'Consumed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3c3ae187-9e80-4297-8f09-d8c70db04a66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c3ae187-9e80-4297-8f09-d8c70db04a66', '7E9F0D18-8548-40B3-8716-50257C8D41E0', 3, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d602c2d1-fae2-446c-a2c9-7e9a576e10c6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d602c2d1-fae2-446c-a2c9-7e9a576e10c6', '7E9F0D18-8548-40B3-8716-50257C8D41E0', 4, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7E9F0D18-8548-40B3-8716-50257C8D41E0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7E9F0D18-8548-40B3-8716-50257C8D41E0';


/* Create Entity Relationship: MJ: Roles -> MJ: Magic Link Invites (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '98b4a1d7-5453-4c7a-8156-e88624ade589'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('98b4a1d7-5453-4c7a-8156-e88624ade589', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '05DC3512-E608-462B-955F-11BA6AEF3AAE', 'RoleID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Magic Link Invites (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9b9787b9-b376-4ffb-8622-04fe6d5355f3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9b9787b9-b376-4ffb-8622-04fe6d5355f3', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '05DC3512-E608-462B-955F-11BA6AEF3AAE', 'CreatedByUserID', 'One To Many', 1, 1, 99, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Applications -> MJ: Magic Link Invites (One To Many via ApplicationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dce3c666-c7bb-4c74-82b7-f6366d21e898'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dce3c666-c7bb-4c74-82b7-f6366d21e898', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '05DC3512-E608-462B-955F-11BA6AEF3AAE', 'ApplicationID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for MagicLinkInvite */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_ApplicationID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([ApplicationID]);

-- Index for foreign key RoleID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_RoleID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([RoleID]);

-- Index for foreign key CreatedByUserID in table MagicLinkInvite
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MagicLinkInvite_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MagicLinkInvite]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MagicLinkInvite_CreatedByUserID ON [${flyway:defaultSchema}].[MagicLinkInvite] ([CreatedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID D6CE9F45-656D-42EF-BE1E-8A73542DA45D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D6CE9F45-656D-42EF-BE1E-8A73542DA45D', @RelatedEntityNameFieldMap='Application';

/* SQL text to update entity field related entity name field map for entity field ID C5F8B345-D487-458E-87DA-383812299778 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C5F8B345-D487-458E-87DA-383812299778', @RelatedEntityNameFieldMap='Role';

/* SQL text to update entity field related entity name field map for entity field ID 044FA6E0-EC60-47ED-B7B7-B74725A6986F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='044FA6E0-EC60-47ED-B7B7-B74725A6986F', @RelatedEntityNameFieldMap='CreatedByUser';

/* Base View SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: vwMagicLinkInvites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invites
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MagicLinkInvite
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMagicLinkInvites]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMagicLinkInvites];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMagicLinkInvites]
AS
SELECT
    m.*,
    MJApplication_ApplicationID.[Name] AS [Application],
    MJRole_RoleID.[Name] AS [Role],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[MagicLinkInvite] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [m].[ApplicationID] = MJApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [m].[RoleID] = MJRole_RoleID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [m].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInvites] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: Permissions for vwMagicLinkInvites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMagicLinkInvites] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: spCreateMagicLinkInvite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagicLinkInvite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMagicLinkInvite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInvite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMagicLinkInvite]
    @ID uniqueidentifier = NULL,
    @TokenHash nvarchar(128),
    @Email nvarchar(255),
    @ApplicationID uniqueidentifier,
    @RoleID uniqueidentifier,
    @ExpiresAt datetimeoffset,
    @ConsumedAt_Clear bit = 0,
    @ConsumedAt datetimeoffset = NULL,
    @MaxUses int = NULL,
    @UseCount int = NULL,
    @CreatedByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInvite]
            (
                [ID],
                [TokenHash],
                [Email],
                [ApplicationID],
                [RoleID],
                [ExpiresAt],
                [ConsumedAt],
                [MaxUses],
                [UseCount],
                [CreatedByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TokenHash,
                @Email,
                @ApplicationID,
                @RoleID,
                @ExpiresAt,
                CASE WHEN @ConsumedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConsumedAt, NULL) END,
                ISNULL(@MaxUses, 1),
                ISNULL(@UseCount, 0),
                @CreatedByUserID,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MagicLinkInvite]
            (
                [TokenHash],
                [Email],
                [ApplicationID],
                [RoleID],
                [ExpiresAt],
                [ConsumedAt],
                [MaxUses],
                [UseCount],
                [CreatedByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TokenHash,
                @Email,
                @ApplicationID,
                @RoleID,
                @ExpiresAt,
                CASE WHEN @ConsumedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConsumedAt, NULL) END,
                ISNULL(@MaxUses, 1),
                ISNULL(@UseCount, 0),
                @CreatedByUserID,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMagicLinkInvites] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Magic Link Invites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: spUpdateMagicLinkInvite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagicLinkInvite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMagicLinkInvite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInvite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMagicLinkInvite]
    @ID uniqueidentifier,
    @TokenHash nvarchar(128) = NULL,
    @Email nvarchar(255) = NULL,
    @ApplicationID uniqueidentifier = NULL,
    @RoleID uniqueidentifier = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @ConsumedAt_Clear bit = 0,
    @ConsumedAt datetimeoffset = NULL,
    @MaxUses int = NULL,
    @UseCount int = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInvite]
    SET
        [TokenHash] = ISNULL(@TokenHash, [TokenHash]),
        [Email] = ISNULL(@Email, [Email]),
        [ApplicationID] = ISNULL(@ApplicationID, [ApplicationID]),
        [RoleID] = ISNULL(@RoleID, [RoleID]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [ConsumedAt] = CASE WHEN @ConsumedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConsumedAt, [ConsumedAt]) END,
        [MaxUses] = ISNULL(@MaxUses, [MaxUses]),
        [UseCount] = ISNULL(@UseCount, [UseCount]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMagicLinkInvites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMagicLinkInvites]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInvite table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMagicLinkInvite]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMagicLinkInvite];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMagicLinkInvite
ON [${flyway:defaultSchema}].[MagicLinkInvite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MagicLinkInvite]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MagicLinkInvite] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Magic Link Invites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Magic Link Invites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Magic Link Invites
-- Item: spDeleteMagicLinkInvite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagicLinkInvite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMagicLinkInvite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInvite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMagicLinkInvite]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MagicLinkInvite]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Magic Link Invites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0d0fa1c-08b2-4b3e-a98b-b290092d2e3a' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'Application')) BEGIN
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
            'c0d0fa1c-08b2-4b3e-a98b-b290092d2e3a',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100027,
            'Application',
            'Application',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9189b0f4-c769-43a0-961c-81ff6bbc4982' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'Role')) BEGIN
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
            '9189b0f4-c769-43a0-961c-81ff6bbc4982',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100028,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '486c60f7-ca0c-495a-9b9e-ffeee805406d' OR (EntityID = '05DC3512-E608-462B-955F-11BA6AEF3AAE' AND Name = 'CreatedByUser')) BEGIN
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
            '486c60f7-ca0c-495a-9b9e-ffeee805406d',
            '05DC3512-E608-462B-955F-11BA6AEF3AAE', -- Entity: MJ: Magic Link Invites
            100029,
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

