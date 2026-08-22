-- =====================================================================================
-- Identity Claims Infrastructure
-- =====================================================================================
-- Introduces IdentityClaimType and IdentityClaim tables to provide a generic,
-- polymorphic identity claiming and account linking primitive in MemberJunction core.
--
-- Supported workflows:
-- 1. Anonymous / Guest Purchases: A guest purchases with an email address. A pending
--    IdentityClaim is created pointing at the entitlement grant, order, or record.
-- 2. Automatic Claim on Login: When a user logs in with a verified email matching
--    NormalizedEmail, IdentityClaimEngine discovers and auto-redeems active claims.
-- 3. Explicit Claim Link: When a purchase email differs from the login account email,
--    a single-use magic link invite verification token confirms email ownership and
--    redeems the claim into the target User / Person account.
-- 4. Extensibility via Plugins: IdentityClaimType specifies DriverClass, which is
--    resolved dynamically at runtime via ClassFactory as a BaseIdentityClaimDriver.
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[IdentityClaimType] (
    [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_IdentityClaimType_ID] DEFAULT (newsequentialid()),
    [Name]                   NVARCHAR(100)    NOT NULL,
    [Description]            NVARCHAR(MAX)    NULL,
    [DriverClass]            NVARCHAR(255)    NOT NULL,
    [Configuration]          NVARCHAR(MAX)    NULL,
    [DefaultExpirationDays]  INT              NOT NULL CONSTRAINT [DF_IdentityClaimType_DefaultExpirationDays] DEFAULT (30),
    [IsActive]               BIT              NOT NULL CONSTRAINT [DF_IdentityClaimType_IsActive] DEFAULT (1),
    [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_IdentityClaimType___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
    [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_IdentityClaimType___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

    CONSTRAINT [PK_IdentityClaimType] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_IdentityClaimType_Name] UNIQUE ([Name])
);
GO

CREATE TABLE [${flyway:defaultSchema}].[IdentityClaim] (
    [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_IdentityClaim_ID] DEFAULT (newsequentialid()),
    [ClaimTypeID]            UNIQUEIDENTIFIER NOT NULL,
    [NormalizedEmail]        NVARCHAR(255)    NOT NULL,
    [EntityID]               UNIQUEIDENTIFIER NULL,
    [RecordID]               NVARCHAR(255)    NULL,
    [PayloadJSON]            NVARCHAR(MAX)    NULL,
    [Status]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_IdentityClaim_Status] DEFAULT (N'Pending'),
    [ExpiresAt]              DATETIMEOFFSET   NOT NULL,
    [ClaimedAt]              DATETIMEOFFSET   NULL,
    [ClaimedByUserID]        UNIQUEIDENTIFIER NULL,
    [MagicLinkInviteID]      UNIQUEIDENTIFIER NULL,
    [MetadataJSON]           NVARCHAR(MAX)    NULL,
    [__mj_CreatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_IdentityClaim___mj_CreatedAt] DEFAULT (sysdatetimeoffset()),
    [__mj_UpdatedAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_IdentityClaim___mj_UpdatedAt] DEFAULT (sysdatetimeoffset()),

    CONSTRAINT [PK_IdentityClaim] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_IdentityClaim_ClaimType] FOREIGN KEY ([ClaimTypeID])
        REFERENCES [${flyway:defaultSchema}].[IdentityClaimType]([ID]),
    CONSTRAINT [FK_IdentityClaim_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_IdentityClaim_User] FOREIGN KEY ([ClaimedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_IdentityClaim_MagicLinkInvite] FOREIGN KEY ([MagicLinkInviteID])
        REFERENCES [${flyway:defaultSchema}].[MagicLinkInvite]([ID]),
    CONSTRAINT [CK_IdentityClaim_Status] CHECK ([Status] IN (N'Pending', N'Claimed', N'Expired', N'Revoked'))
);
GO

CREATE NONCLUSTERED INDEX [IX_IdentityClaim_NormalizedEmail_Status]
    ON [${flyway:defaultSchema}].[IdentityClaim]([NormalizedEmail], [Status])
    INCLUDE ([ClaimTypeID], [EntityID], [RecordID], [ExpiresAt]);
GO

CREATE NONCLUSTERED INDEX [IX_IdentityClaim_ClaimTypeID_Status]
    ON [${flyway:defaultSchema}].[IdentityClaim]([ClaimTypeID], [Status]);
GO

CREATE NONCLUSTERED INDEX [IX_IdentityClaim_MagicLinkInviteID]
    ON [${flyway:defaultSchema}].[IdentityClaim]([MagicLinkInviteID])
    WHERE [MagicLinkInviteID] IS NOT NULL;
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions (IdentityClaimType)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Metadata catalog of identity claim types. Each row defines a claim kind whose lifecycle (create, claim, revoke, expire) is executed by a BaseIdentityClaimDriver plugin resolved at runtime from DriverClass via ClassFactory.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name identifying this claim type (e.g., "EntitlementGrant", "PersonAccountLink", "OrgInvite").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description explaining the intent and behavior of this claim type.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Plugin class name implementing BaseIdentityClaimDriver, registered via @RegisterClass(BaseIdentityClaimDriver, DriverClass) and resolved at runtime.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration specific to this claim type driver.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType',
    @level2type = N'COLUMN', @level2name = N'Configuration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default lifespan in days for claims of this type before they expire automatically.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType',
    @level2type = N'COLUMN', @level2name = N'DefaultExpirationDays';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this claim type is active and available for issuing new claims.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaimType',
    @level2type = N'COLUMN', @level2name = N'IsActive';

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions (IdentityClaim)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Records of pending, claimed, or expired identity claims addressed to an email address. Facilitates cross-system entitlement claiming, account linking, and invite verification.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking this claim to its IdentityClaimType definition.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'ClaimTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Normalized lowercase email address of the intended claimant.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'NormalizedEmail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional polymorphic foreign key to the Entity representing the resource being claimed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional primary key / record ID of the specific entity record being claimed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'RecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional payload JSON containing custom data or parameters consumed by the claim type driver during redemption.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'PayloadJSON';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the claim: Pending, Claimed, Expired, or Revoked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp after which this claim can no longer be redeemed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the claim was successfully redeemed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'ClaimedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User ID of the authenticated user who successfully claimed this record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'ClaimedByUserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to a MagicLinkInvite record for email ownership verification links.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional metadata JSON for auditing or tracking client provenance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IdentityClaim',
    @level2type = N'COLUMN', @level2name = N'MetadataJSON';
GO




















































/* ============================================================================================
   ============================================================================================
   ==                                                                                        ==
   ==   EVERYTHING BELOW THIS POINT WAS PRODUCED BY THE MEMBERJUNCTION CodeGen TOOL          ==
   ==                                                                                        ==
   ==   DO NOT EDIT ANY OF IT BY HAND.                                                       ==
   ==                                                                                        ==
   ==   It contains the Entity / EntityField metadata inserts, the generated base view, the  ==
   ==   spCreate / spUpdate / spDelete procedures, permission grants, and extended-property   ==
   ==   descriptions for the IdentityClaimType and IdentityClaim tables.                     ==
   ==                                                                                        ==
   ==   If the hand-written DDL above changes, DO NOT patch this section: re-run              ==
   ==   `mj codegen` and replace this entire block with the new output.                       ==
   ==                                                                                        ==
   ============================================================================================
   ============================================================================================ */

/* SQL generated to create new entity MJ: Identity Claim Types */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[Entity] ([ID], [Name], [DisplayName], [Description], [BaseTable], [BaseView], [SchemaName], [IncludeInAPI], [AllowUserSearchAPI], [AllowCaching], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [AllowAllRowsAPI], [AllowCreateAPI], [AllowUpdateAPI], [AllowDeleteAPI], [UserViewMaxRows], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', N'MJ: Identity Claim Types', N'Identity Claim Types', N'Metadata catalog of identity claim types. Each row defines a claim kind whose lifecycle (create, claim, revoke, expire) is executed by a BaseIdentityClaimDriver plugin resolved at runtime from DriverClass via ClassFactory.', 'IdentityClaimType', 'vwIdentityClaimTypes', '${flyway:defaultSchema}', 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1000, GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL generated to create new entity MJ: Identity Claims */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = '58C8C895-E3AA-48C2-BA68-808337235873') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[Entity] ([ID], [Name], [DisplayName], [Description], [BaseTable], [BaseView], [SchemaName], [IncludeInAPI], [AllowUserSearchAPI], [AllowCaching], [TrackRecordChanges], [AuditRecordAccess], [AuditViewRuns], [AllowAllRowsAPI], [AllowCreateAPI], [AllowUpdateAPI], [AllowDeleteAPI], [UserViewMaxRows], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', N'MJ: Identity Claims', N'Identity Claims', N'Records of pending, claimed, or expired identity claims addressed to an email address. Facilitates cross-system entitlement claiming, account linking, and invite verification.', 'IdentityClaim', 'vwIdentityClaims', '${flyway:defaultSchema}', 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1000, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '30BBD5D1-7CB6-497F-AEF0-D09D877A77BE') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('30BBD5D1-7CB6-497F-AEF0-D09D877A77BE', '58C8C895-E3AA-48C2-BA68-808337235873', 1, 'ID', N'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 0, 1, N'(newsequentialid())', 0, 0, 0, 1, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '505DF1FB-2C77-40CD-80D6-6AFDAF64840F') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('505DF1FB-2C77-40CD-80D6-6AFDAF64840F', '58C8C895-E3AA-48C2-BA68-808337235873', 2, 'ClaimTypeID', N'Claim Type ID', N'Foreign key linking this claim to its IdentityClaimType definition.', 'uniqueidentifier', 16, 0, 0, 0, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '58A944F6-B04C-4779-A18B-3BC1F69B0DE5') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('58A944F6-B04C-4779-A18B-3BC1F69B0DE5', '58C8C895-E3AA-48C2-BA68-808337235873', 3, 'NormalizedEmail', N'Email Address', N'Normalized lowercase email address of the intended claimant.', 'nvarchar', 510, 0, 0, 0, 0, 0, NULL, 0, 1, 1, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '23CE09B7-480A-4A7B-8167-C6883F5657C3') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('23CE09B7-480A-4A7B-8167-C6883F5657C3', '58C8C895-E3AA-48C2-BA68-808337235873', 4, 'EntityID', N'Entity ID', N'Optional polymorphic foreign key to the Entity representing the resource being claimed.', 'uniqueidentifier', 16, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '4A3B8B1C-CF1D-4E4C-B121-3867182AE9CA') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('4A3B8B1C-CF1D-4E4C-B121-3867182AE9CA', '58C8C895-E3AA-48C2-BA68-808337235873', 5, 'RecordID', N'Record ID', N'Optional primary key / record ID of the specific entity record being claimed.', 'nvarchar', 510, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'FFF9A882-5BC1-4173-96EF-29750C1F6044') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('FFF9A882-5BC1-4173-96EF-29750C1F6044', '58C8C895-E3AA-48C2-BA68-808337235873', 6, 'PayloadJSON', N'Payload', N'Optional payload JSON containing custom data or parameters consumed by the claim type driver during redemption.', 'nvarchar', -1, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('F925BD99-4B5A-48A4-878A-385E8F2D87E7', '58C8C895-E3AA-48C2-BA68-808337235873', 7, 'Status', N'Status', N'Current lifecycle state of the claim: Pending, Claimed, Expired, or Revoked.', 'nvarchar', 40, 0, 0, 0, 0, 0, N'(N''Pending'')', 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '92AFA877-0447-4DC3-996B-092937CA4588') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('92AFA877-0447-4DC3-996B-092937CA4588', '58C8C895-E3AA-48C2-BA68-808337235873', 8, 'ExpiresAt', N'Expires At', N'Timestamp after which this claim can no longer be redeemed.', 'datetimeoffset', 10, 34, 7, 0, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'E56874D9-11BB-46AC-A9DA-9E4CD8E063E9') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('E56874D9-11BB-46AC-A9DA-9E4CD8E063E9', '58C8C895-E3AA-48C2-BA68-808337235873', 9, 'ClaimedAt', N'Claimed At', N'Timestamp when the claim was successfully redeemed.', 'datetimeoffset', 10, 34, 7, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'FF9B7A6A-B843-4738-BD9C-4A4375C419D5') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('FF9B7A6A-B843-4738-BD9C-4A4375C419D5', '58C8C895-E3AA-48C2-BA68-808337235873', 10, 'ClaimedByUserID', N'Claimed By User ID', N'User ID of the authenticated user who successfully claimed this record.', 'uniqueidentifier', 16, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'BC1D99CC-1017-4E62-A6F0-E3F51F09FD61') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('BC1D99CC-1017-4E62-A6F0-E3F51F09FD61', '58C8C895-E3AA-48C2-BA68-808337235873', 11, 'MagicLinkInviteID', N'Magic Link Invite ID', N'Optional link to a MagicLinkInvite record for email ownership verification links.', 'uniqueidentifier', 16, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'E10A6C7E-4E18-4CE0-98B8-C7E8E71A8793') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('E10A6C7E-4E18-4CE0-98B8-C7E8E71A8793', '58C8C895-E3AA-48C2-BA68-808337235873', 12, 'MetadataJSON', N'Metadata', N'Optional metadata JSON for auditing or tracking client provenance.', 'nvarchar', -1, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '0812F91A-485A-4034-B5F2-6A899EC31092') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('0812F91A-485A-4034-B5F2-6A899EC31092', '58C8C895-E3AA-48C2-BA68-808337235873', 13, '__mj_CreatedAt', N'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 0, 0, N'(getutcdate())', 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '08A875E4-26CF-497D-852C-51C80A0366BA') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('08A875E4-26CF-497D-852C-51C80A0366BA', '58C8C895-E3AA-48C2-BA68-808337235873', 14, '__mj_UpdatedAt', N'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 0, 0, N'(getutcdate())', 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'F422E0D8-C434-426A-86F3-36855CD0B19B') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('F422E0D8-C434-426A-86F3-36855CD0B19B', '58C8C895-E3AA-48C2-BA68-808337235873', 15, 'ClaimType', N'Claim Type', NULL, 'nvarchar', 200, 0, 0, 0, 1, 0, NULL, 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '5EAE7159-786D-437F-9C15-15F95636D671') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('5EAE7159-786D-437F-9C15-15F95636D671', '58C8C895-E3AA-48C2-BA68-808337235873', 16, 'Entity', N'Entity', NULL, 'nvarchar', 510, 0, 0, 1, 1, 0, NULL, 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'CB5FD7B8-DE25-4DC2-831F-E56D84B6A342') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('CB5FD7B8-DE25-4DC2-831F-E56D84B6A342', '58C8C895-E3AA-48C2-BA68-808337235873', 17, 'ClaimedByUser', N'Claimed By User', NULL, 'nvarchar', 200, 0, 0, 1, 1, 0, NULL, 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '949B9775-418F-4BAB-B327-05173CFC8E2E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('949B9775-418F-4BAB-B327-05173CFC8E2E', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 1, 'ID', N'ID', NULL, 'uniqueidentifier', 16, 0, 0, 0, 0, 1, N'(newsequentialid())', 0, 0, 0, 1, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'DA33F399-95BD-4567-A075-F2AA566FE171') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('DA33F399-95BD-4567-A075-F2AA566FE171', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 2, 'Name', N'Name', N'Unique name identifying this claim type (e.g., "EntitlementGrant", "PersonAccountLink", "OrgInvite").', 'nvarchar', 200, 0, 0, 0, 0, 0, NULL, 0, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '9F45D75B-134A-47D9-B658-818665B77CCE') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('9F45D75B-134A-47D9-B658-818665B77CCE', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 3, 'Description', N'Description', N'Optional description explaining the intent and behavior of this claim type.', 'nvarchar', -1, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '9980B013-AD4C-4F3B-845E-C5F85BB84BF2') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('9980B013-AD4C-4F3B-845E-C5F85BB84BF2', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 4, 'DriverClass', N'Driver Class', N'Plugin class name implementing BaseIdentityClaimDriver, registered via @RegisterClass(BaseIdentityClaimDriver, DriverClass) and resolved at runtime.', 'nvarchar', 510, 0, 0, 0, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '741E180B-317E-49DC-BAC6-8E926B333DA3') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('741E180B-317E-49DC-BAC6-8E926B333DA3', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 5, 'Configuration', N'Configuration', N'JSON configuration specific to this claim type driver.', 'nvarchar', -1, 0, 0, 1, 0, 0, NULL, 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '9DF9130E-2F49-4FE4-88EA-E3553132008B') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('9DF9130E-2F49-4FE4-88EA-E3553132008B', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 6, 'DefaultExpirationDays', N'Default Expiration Days', N'Default lifespan in days for claims of this type before they expire automatically.', 'int', 4, 10, 0, 0, 0, 0, N'((30))', 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'B1E4E5D4-99DA-4F84-84F4-4ADEA963CBA5') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('B1E4E5D4-99DA-4F84-84F4-4ADEA963CBA5', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 7, 'IsActive', N'Is Active', N'Whether this claim type is active and available for issuing new claims.', 'bit', 1, 1, 0, 0, 0, 0, N'((1))', 0, 1, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '86ABE3CF-1DDD-47A8-82AD-D372708BE687') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('86ABE3CF-1DDD-47A8-82AD-D372708BE687', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 8, '__mj_CreatedAt', N'Created At', NULL, 'datetimeoffset', 10, 34, 7, 0, 0, 0, N'(getutcdate())', 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = '45DEA1D2-7DB0-40F9-A8A0-E740C322F3AF') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [IsVirtual], [IsPrimaryKey], [DefaultValue], [AutoIncrement], [AllowUpdateAPI], [IsNameField], [IncludeInUserSearchAPI], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('45DEA1D2-7DB0-40F9-A8A0-E740C322F3AF', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 9, '__mj_UpdatedAt', N'Updated At', NULL, 'datetimeoffset', 10, 34, 7, 0, 0, 0, N'(getutcdate())', 0, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = '58C8C895-E3AA-48C2-BA68-808337235873' AND [RoleID] = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityPermission] ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = '58C8C895-E3AA-48C2-BA68-808337235873' AND [RoleID] = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityPermission] ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = '58C8C895-E3AA-48C2-BA68-808337235873' AND [RoleID] = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityPermission] ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('58C8C895-E3AA-48C2-BA68-808337235873', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB' AND [RoleID] = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityPermission] ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB' AND [RoleID] = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityPermission] ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END
GO
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB' AND [RoleID] = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E') BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityPermission] ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES ('38D9DE43-C0C2-45DA-81BB-A815B30F86FB', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END
GO

/* vwIdentityClaimTypes.view.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: vwIdentityClaimTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Identity Claim Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  IdentityClaimType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIdentityClaimTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIdentityClaimTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIdentityClaimTypes]
AS
SELECT
    i.*
FROM
    [${flyway:defaultSchema}].[IdentityClaimType] AS i
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaimTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

/* vwIdentityClaimTypes.view.permissions.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: Permissions for vwIdentityClaimTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaimTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

/* vwIdentityClaims.view.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: vwIdentityClaims
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Identity Claims
-----               SCHEMA:      __mj
-----               BASE TABLE:  IdentityClaim
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIdentityClaims]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIdentityClaims];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIdentityClaims]
AS
SELECT
    i.*,
    MJIdentityClaimType_ClaimTypeID.[Name] AS [ClaimType],
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_ClaimedByUserID.[Name] AS [ClaimedByUser]
FROM
    [${flyway:defaultSchema}].[IdentityClaim] AS i
INNER JOIN
    [${flyway:defaultSchema}].[IdentityClaimType] AS MJIdentityClaimType_ClaimTypeID
  ON
    [i].[ClaimTypeID] = MJIdentityClaimType_ClaimTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [i].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ClaimedByUserID
  ON
    [i].[ClaimedByUserID] = MJUser_ClaimedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaims] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

/* vwIdentityClaims.view.permissions.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: Permissions for vwIdentityClaims
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIdentityClaims] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

/* spCreateIdentityClaimType.sp.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: spCreateIdentityClaimType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IdentityClaimType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIdentityClaimType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaimType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaimType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255),
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @DefaultExpirationDays int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaimType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [DefaultExpirationDays],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@DefaultExpirationDays, 30),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaimType]
            (
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [DefaultExpirationDays],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@DefaultExpirationDays, 30),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIdentityClaimTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaimType] TO [cdp_Developer], [cdp_Integration]
    
GO

/* spCreateIdentityClaimType.sp.permissions.generated.sql */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaimType] TO [cdp_Developer], [cdp_Integration]


GO

/* spUpdateIdentityClaimType.sp.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: spUpdateIdentityClaimType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IdentityClaimType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIdentityClaimType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaimType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaimType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @DefaultExpirationDays int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaimType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [DefaultExpirationDays] = ISNULL(@DefaultExpirationDays, [DefaultExpirationDays]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIdentityClaimTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIdentityClaimTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaimType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IdentityClaimType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIdentityClaimType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIdentityClaimType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIdentityClaimType
ON [${flyway:defaultSchema}].[IdentityClaimType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaimType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IdentityClaimType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        
GO

/* spUpdateIdentityClaimType.sp.permissions.generated.sql */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaimType] TO [cdp_Developer], [cdp_Integration]


GO

/* spDeleteIdentityClaimType.sp.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claim Types
-- Item: spDeleteIdentityClaimType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IdentityClaimType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIdentityClaimType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaimType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaimType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IdentityClaimType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaimType] TO [cdp_Developer], [cdp_Integration]
    
GO

/* spDeleteIdentityClaimType.sp.permissions.generated.sql */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaimType] TO [cdp_Developer], [cdp_Integration]


GO

/* spCreateIdentityClaim.sp.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: spCreateIdentityClaim
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IdentityClaim
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIdentityClaim]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaim];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIdentityClaim]
    @ID uniqueidentifier = NULL,
    @ClaimTypeID uniqueidentifier,
    @NormalizedEmail nvarchar(255),
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(255) = NULL,
    @PayloadJSON_Clear bit = 0,
    @PayloadJSON nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset,
    @ClaimedAt_Clear bit = 0,
    @ClaimedAt datetimeoffset = NULL,
    @ClaimedByUserID_Clear bit = 0,
    @ClaimedByUserID uniqueidentifier = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaim]
            (
                [ID],
                [ClaimTypeID],
                [NormalizedEmail],
                [EntityID],
                [RecordID],
                [PayloadJSON],
                [Status],
                [ExpiresAt],
                [ClaimedAt],
                [ClaimedByUserID],
                [MagicLinkInviteID],
                [MetadataJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ClaimTypeID,
                @NormalizedEmail,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END,
                CASE WHEN @PayloadJSON_Clear = 1 THEN NULL ELSE ISNULL(@PayloadJSON, NULL) END,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @ClaimedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedAt, NULL) END,
                CASE WHEN @ClaimedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedByUserID, NULL) END,
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IdentityClaim]
            (
                [ClaimTypeID],
                [NormalizedEmail],
                [EntityID],
                [RecordID],
                [PayloadJSON],
                [Status],
                [ExpiresAt],
                [ClaimedAt],
                [ClaimedByUserID],
                [MagicLinkInviteID],
                [MetadataJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ClaimTypeID,
                @NormalizedEmail,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END,
                CASE WHEN @PayloadJSON_Clear = 1 THEN NULL ELSE ISNULL(@PayloadJSON, NULL) END,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @ClaimedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedAt, NULL) END,
                CASE WHEN @ClaimedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedByUserID, NULL) END,
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIdentityClaims] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaim] TO [cdp_Developer], [cdp_Integration]
    
GO

/* spCreateIdentityClaim.sp.permissions.generated.sql */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIdentityClaim] TO [cdp_Developer], [cdp_Integration]


GO

/* spUpdateIdentityClaim.sp.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: spUpdateIdentityClaim
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IdentityClaim
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIdentityClaim]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaim];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIdentityClaim]
    @ID uniqueidentifier,
    @ClaimTypeID uniqueidentifier = NULL,
    @NormalizedEmail nvarchar(255) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(255) = NULL,
    @PayloadJSON_Clear bit = 0,
    @PayloadJSON nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @ClaimedAt_Clear bit = 0,
    @ClaimedAt datetimeoffset = NULL,
    @ClaimedByUserID_Clear bit = 0,
    @ClaimedByUserID uniqueidentifier = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaim]
    SET
        [ClaimTypeID] = ISNULL(@ClaimTypeID, [ClaimTypeID]),
        [NormalizedEmail] = ISNULL(@NormalizedEmail, [NormalizedEmail]),
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [RecordID] = CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, [RecordID]) END,
        [PayloadJSON] = CASE WHEN @PayloadJSON_Clear = 1 THEN NULL ELSE ISNULL(@PayloadJSON, [PayloadJSON]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [ClaimedAt] = CASE WHEN @ClaimedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedAt, [ClaimedAt]) END,
        [ClaimedByUserID] = CASE WHEN @ClaimedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ClaimedByUserID, [ClaimedByUserID]) END,
        [MagicLinkInviteID] = CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, [MagicLinkInviteID]) END,
        [MetadataJSON] = CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, [MetadataJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIdentityClaims] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIdentityClaims]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaim] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IdentityClaim table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIdentityClaim]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIdentityClaim];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIdentityClaim
ON [${flyway:defaultSchema}].[IdentityClaim]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IdentityClaim]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IdentityClaim] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        
GO

/* spUpdateIdentityClaim.sp.permissions.generated.sql */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIdentityClaim] TO [cdp_Developer], [cdp_Integration]


GO

/* spDeleteIdentityClaim.sp.generated.sql */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Identity Claims
-- Item: spDeleteIdentityClaim
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IdentityClaim
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIdentityClaim]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaim];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIdentityClaim]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IdentityClaim]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaim] TO [cdp_Developer], [cdp_Integration]
    
GO

/* spDeleteIdentityClaim.sp.permissions.generated.sql */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIdentityClaim] TO [cdp_Developer], [cdp_Integration]


GO
