/* ============================================================================
   eSignature Primitive — Phase 2 Schema
   v5.39.x

   Companion plans: /plans/esignature-primitive.md (design)
                    /plans/esignature-build-plan.md (build)

   Creates the six core entities backing the framework eSignature primitive
   (generalized from the app-secure-messaging DocuSign integration). Consuming
   apps link a domain record to a core "MJ: Signature Requests" row via the
   standard polymorphic EntityID / RecordID pair; documents soft-reference
   "MJ: Artifacts" (+ "MJ: Artifact Versions"); credentials live in the
   Credential Engine ("MJ: Credentials"), referenced by SignatureAccount.

   Tables (all new; no destructive changes):
     SignatureProvider          — provider-type registry (driver key + capabilities)
     SignatureAccount           — per-tenant provider instance (-> Credential)
     SignatureRequest           — envelope lifecycle (polymorphic EntityID/RecordID)
     SignatureRequestDocument   — documents in an envelope (-> Artifact / ArtifactVersion)
     SignatureRequestRecipient  — signers
     SignatureRequestLog        — provider-call / webhook audit

   CodeGen convention (per CLAUDE.md migrations guide):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty for every non-PK / non-FK column so CodeGen surfaces
       descriptions on regen.
     * Provider rows are seeded via metadata files (metadata/signature-providers/),
       NOT SQL INSERTs.

   Entities themselves (entity metadata, views, spCreate/Update/Delete) are
   produced by CodeGen after this migration runs.
   ============================================================================ */


-- ============================================================================
-- 1. SignatureProvider  ("MJ: Signature Providers") — provider-type registry
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.SignatureProvider (
    ID                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                     NVARCHAR(100)    NOT NULL,
    ServerDriverKey          NVARCHAR(100)    NOT NULL,
    IsActive                 BIT              NOT NULL CONSTRAINT DF_SignatureProvider_IsActive DEFAULT (1),
    Priority                 INT              NOT NULL CONSTRAINT DF_SignatureProvider_Priority DEFAULT (0),
    RequiresOAuth            BIT              NOT NULL CONSTRAINT DF_SignatureProvider_RequiresOAuth DEFAULT (1),
    SupportsTemplates        BIT              NOT NULL CONSTRAINT DF_SignatureProvider_SupportsTemplates DEFAULT (0),
    SupportsEmbeddedSigning  BIT              NOT NULL CONSTRAINT DF_SignatureProvider_SupportsEmbeddedSigning DEFAULT (0),
    Configuration            NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_SignatureProvider PRIMARY KEY (ID),
    CONSTRAINT UQ_SignatureProvider_Name UNIQUE (Name)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the eSignature provider type (e.g. DocuSign, Adobe Sign).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseSignatureProvider, ServerDriverKey). MUST match the @RegisterClass key on the concrete driver (e.g. ''DocuSign'').',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'ServerDriverKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this provider type is available for use. Inactive providers are skipped by the engine.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'IsActive';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Selection priority when multiple providers could apply. Lower number = higher priority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this provider requires OAuth-based credentials (vs. a static API key).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'RequiresOAuth';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this provider supports creating envelopes from provider-hosted templates (ApplyTemplate operation).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'SupportsTemplates';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this provider supports embedded (in-app) signing URLs (CreateEmbeddedSigningUrl operation).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'SupportsEmbeddedSigning';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON of non-secret provider-type defaults (e.g. oauthBase, restBase). Merged under per-account Configuration and decrypted credential values at driver initialize().',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureProvider',
    @level2type = N'COLUMN', @level2name = N'Configuration';


-- ============================================================================
-- 2. SignatureAccount  ("MJ: Signature Accounts") — per-tenant provider instance
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.SignatureAccount (
    ID                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                 NVARCHAR(200)    NOT NULL,
    SignatureProviderID  UNIQUEIDENTIFIER NOT NULL,
    CredentialID         UNIQUEIDENTIFIER NOT NULL,
    CompanyID            UNIQUEIDENTIFIER NULL,
    IsActive             BIT              NOT NULL CONSTRAINT DF_SignatureAccount_IsActive DEFAULT (1),
    IsDefault            BIT              NOT NULL CONSTRAINT DF_SignatureAccount_IsDefault DEFAULT (0),
    DefaultFromName      NVARCHAR(200)    NULL,
    DefaultFromEmail     NVARCHAR(320)    NULL,
    Configuration        NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_SignatureAccount PRIMARY KEY (ID),
    CONSTRAINT FK_SignatureAccount_SignatureProvider FOREIGN KEY (SignatureProviderID)
        REFERENCES ${flyway:defaultSchema}.SignatureProvider (ID),
    CONSTRAINT FK_SignatureAccount_Credential FOREIGN KEY (CredentialID)
        REFERENCES ${flyway:defaultSchema}.Credential (ID),
    CONSTRAINT FK_SignatureAccount_Company FOREIGN KEY (CompanyID)
        REFERENCES ${flyway:defaultSchema}.Company (ID)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable account name (e.g. "Acme Prod DocuSign").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureAccount',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this account is available for use. Inactive accounts are not pre-initialized by the engine driver cache.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureAccount',
    @level2type = N'COLUMN', @level2name = N'IsActive';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this is the default account for its provider (and Company, when scoped).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureAccount',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default sender display name for envelopes from this account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureAccount',
    @level2type = N'COLUMN', @level2name = N'DefaultFromName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default sender email for envelopes from this account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureAccount',
    @level2type = N'COLUMN', @level2name = N'DefaultFromEmail';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON of non-secret per-account overrides (e.g. accountId, restBase). Merged over provider Configuration and under decrypted credential values at driver initialize().',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureAccount',
    @level2type = N'COLUMN', @level2name = N'Configuration';


-- ============================================================================
-- 3. SignatureRequest  ("MJ: Signature Requests") — envelope lifecycle record
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.SignatureRequest (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SignatureAccountID  UNIQUEIDENTIFIER NOT NULL,
    Name                NVARCHAR(255)    NOT NULL,
    Message             NVARCHAR(MAX)    NULL,
    Status              NVARCHAR(20)     NOT NULL CONSTRAINT DF_SignatureRequest_Status DEFAULT ('Draft'),
    ExternalEnvelopeID  NVARCHAR(255)    NULL,
    EntityID            UNIQUEIDENTIFIER NULL,
    RecordID            NVARCHAR(450)    NULL,
    SentAt              DATETIMEOFFSET   NULL,
    CompletedAt         DATETIMEOFFSET   NULL,
    VoidReason          NVARCHAR(500)    NULL,
    CONSTRAINT PK_SignatureRequest PRIMARY KEY (ID),
    CONSTRAINT FK_SignatureRequest_SignatureAccount FOREIGN KEY (SignatureAccountID)
        REFERENCES ${flyway:defaultSchema}.SignatureAccount (ID),
    CONSTRAINT FK_SignatureRequest_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity (ID),
    CONSTRAINT CK_SignatureRequest_Status
        CHECK (Status IN ('Draft', 'Sent', 'Delivered', 'Signed', 'Completed', 'Declined', 'Voided'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Envelope title / email subject.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional email body / message sent to recipients with the envelope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'Message';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Normalized envelope lifecycle status: Draft, Sent, Delivered, Signed, Completed, Declined, or Voided.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider-side envelope identifier (e.g. DocuSign envelopeId), assigned after the envelope is created.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'ExternalEnvelopeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Polymorphic reference (entity half): the Entity of the originating business record that owns this signature request. NULL for standalone requests. Paired with RecordID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Polymorphic reference (record half): the primary key value of the originating business record in the entity named by EntityID. NULL for standalone requests.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'RecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp the envelope was sent to recipients.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'SentAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp the envelope reached a terminal completed state (all recipients signed).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'CompletedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason supplied when the envelope was voided/cancelled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequest',
    @level2type = N'COLUMN', @level2name = N'VoidReason';


-- ============================================================================
-- 4. SignatureRequestDocument  ("MJ: Signature Request Documents")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.SignatureRequestDocument (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SignatureRequestID  UNIQUEIDENTIFIER NOT NULL,
    ArtifactID          UNIQUEIDENTIFIER NULL,
    ArtifactVersionID   UNIQUEIDENTIFIER NULL,
    Name                NVARCHAR(255)    NOT NULL,
    Sequence            INT              NOT NULL CONSTRAINT DF_SignatureRequestDocument_Sequence DEFAULT (1),
    Role                NVARCHAR(20)     NOT NULL CONSTRAINT DF_SignatureRequestDocument_Role DEFAULT ('Source'),
    CONSTRAINT PK_SignatureRequestDocument PRIMARY KEY (ID),
    CONSTRAINT FK_SignatureRequestDocument_SignatureRequest FOREIGN KEY (SignatureRequestID)
        REFERENCES ${flyway:defaultSchema}.SignatureRequest (ID),
    CONSTRAINT FK_SignatureRequestDocument_Artifact FOREIGN KEY (ArtifactID)
        REFERENCES ${flyway:defaultSchema}.Artifact (ID),
    CONSTRAINT FK_SignatureRequestDocument_ArtifactVersion FOREIGN KEY (ArtifactVersionID)
        REFERENCES ${flyway:defaultSchema}.ArtifactVersion (ID),
    CONSTRAINT CK_SignatureRequestDocument_Role
        CHECK (Role IN ('Source', 'Signed'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Document filename as presented to the provider / signer.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestDocument',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering of this document within the envelope (1-based).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestDocument',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Document role: Source = the document sent for signature; Signed = the executed document downloaded after completion (written back as a new Artifact Version).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestDocument',
    @level2type = N'COLUMN', @level2name = N'Role';


-- ============================================================================
-- 5. SignatureRequestRecipient  ("MJ: Signature Request Recipients")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.SignatureRequestRecipient (
    ID                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SignatureRequestID   UNIQUEIDENTIFIER NOT NULL,
    Email                NVARCHAR(320)    NOT NULL,
    Name                 NVARCHAR(200)    NULL,
    RoutingOrder         INT              NOT NULL CONSTRAINT DF_SignatureRequestRecipient_RoutingOrder DEFAULT (1),
    Role                 NVARCHAR(100)    NULL,
    Status               NVARCHAR(20)     NOT NULL CONSTRAINT DF_SignatureRequestRecipient_Status DEFAULT ('Created'),
    SignedAt             DATETIMEOFFSET   NULL,
    ExternalRecipientID  NVARCHAR(255)    NULL,
    CONSTRAINT PK_SignatureRequestRecipient PRIMARY KEY (ID),
    CONSTRAINT FK_SignatureRequestRecipient_SignatureRequest FOREIGN KEY (SignatureRequestID)
        REFERENCES ${flyway:defaultSchema}.SignatureRequest (ID),
    CONSTRAINT CK_SignatureRequestRecipient_Status
        CHECK (Status IN ('Created', 'Sent', 'Delivered', 'Signed', 'Declined'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Recipient email address.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Recipient display name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Signing order; lower routes first (1-based).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'RoutingOrder';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Template role name for this recipient, when the envelope was created from a provider template.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'Role';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-recipient status: Created, Sent, Delivered, Signed, or Declined.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp this recipient signed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'SignedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider-side recipient identifier, for correlation with provider events.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestRecipient',
    @level2type = N'COLUMN', @level2name = N'ExternalRecipientID';


-- ============================================================================
-- 6. SignatureRequestLog  ("MJ: Signature Request Logs") — provider-call audit
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.SignatureRequestLog (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SignatureRequestID  UNIQUEIDENTIFIER NULL,
    Operation           NVARCHAR(50)     NOT NULL,
    Success             BIT              NOT NULL CONSTRAINT DF_SignatureRequestLog_Success DEFAULT (0),
    StatusBefore        NVARCHAR(20)     NULL,
    StatusAfter         NVARCHAR(20)     NULL,
    Detail              NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_SignatureRequestLog PRIMARY KEY (ID),
    CONSTRAINT FK_SignatureRequestLog_SignatureRequest FOREIGN KEY (SignatureRequestID)
        REFERENCES ${flyway:defaultSchema}.SignatureRequest (ID)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The provider operation logged (e.g. CreateEnvelope, GetEnvelopeStatus, DownloadSignedDocument, VoidEnvelope, Webhook).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestLog',
    @level2type = N'COLUMN', @level2name = N'Operation';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the operation succeeded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestLog',
    @level2type = N'COLUMN', @level2name = N'Success';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Signature request status immediately before the operation, when applicable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestLog',
    @level2type = N'COLUMN', @level2name = N'StatusBefore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Signature request status immediately after the operation, when applicable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestLog',
    @level2type = N'COLUMN', @level2name = N'StatusAfter';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form detail: error text on failure, or normalized event JSON for webhook entries.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SignatureRequestLog',
    @level2type = N'COLUMN', @level2name = N'Detail';
GO







































































/*--------------------------CODEGEN------------------------------*/
/* SQL generated to create new entity MJ: Signature Providers */

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
         '7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2',
         'MJ: Signature Providers',
         'Signature Providers',
         NULL,
         NULL,
         'SignatureProvider',
         'vwSignatureProviders',
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

/* SQL generated to add new entity MJ: Signature Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ee4d69f-16f5-4dc1-9b02-b4af7f8ca8d2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Signature Accounts */

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
         '43e3f77a-c2b3-4672-a53f-4ff28a0c098b',
         'MJ: Signature Accounts',
         'Signature Accounts',
         NULL,
         NULL,
         'SignatureAccount',
         'vwSignatureAccounts',
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

/* SQL generated to add new entity MJ: Signature Accounts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '43e3f77a-c2b3-4672-a53f-4ff28a0c098b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('43e3f77a-c2b3-4672-a53f-4ff28a0c098b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('43e3f77a-c2b3-4672-a53f-4ff28a0c098b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('43e3f77a-c2b3-4672-a53f-4ff28a0c098b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Signature Requests */

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
         'a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4',
         'MJ: Signature Requests',
         'Signature Requests',
         NULL,
         NULL,
         'SignatureRequest',
         'vwSignatureRequests',
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

/* SQL generated to add new entity MJ: Signature Requests to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Requests for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Requests for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Requests for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3b3dfeb-ffca-4f8d-b497-3d2e7fbb02a4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Signature Request Documents */

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
         '975dff8e-dad8-44b6-9722-4d7b138a213f',
         'MJ: Signature Request Documents',
         'Signature Request Documents',
         NULL,
         NULL,
         'SignatureRequestDocument',
         'vwSignatureRequestDocuments',
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

/* SQL generated to add new entity MJ: Signature Request Documents to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '975dff8e-dad8-44b6-9722-4d7b138a213f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('975dff8e-dad8-44b6-9722-4d7b138a213f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('975dff8e-dad8-44b6-9722-4d7b138a213f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('975dff8e-dad8-44b6-9722-4d7b138a213f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Signature Request Recipients */

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
         '2eecc44e-a41f-4521-8c0e-764d4d68ff70',
         'MJ: Signature Request Recipients',
         'Signature Request Recipients',
         NULL,
         NULL,
         'SignatureRequestRecipient',
         'vwSignatureRequestRecipients',
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

/* SQL generated to add new entity MJ: Signature Request Recipients to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2eecc44e-a41f-4521-8c0e-764d4d68ff70', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2eecc44e-a41f-4521-8c0e-764d4d68ff70', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2eecc44e-a41f-4521-8c0e-764d4d68ff70', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2eecc44e-a41f-4521-8c0e-764d4d68ff70', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Signature Request Logs */

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
         '224f170c-5fcc-41f2-906f-b82b30f1eb2a',
         'MJ: Signature Request Logs',
         'Signature Request Logs',
         NULL,
         NULL,
         'SignatureRequestLog',
         'vwSignatureRequestLogs',
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

/* SQL generated to add new entity MJ: Signature Request Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '224f170c-5fcc-41f2-906f-b82b30f1eb2a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('224f170c-5fcc-41f2-906f-b82b30f1eb2a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('224f170c-5fcc-41f2-906f-b82b30f1eb2a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('224f170c-5fcc-41f2-906f-b82b30f1eb2a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequest] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
UPDATE [${flyway:defaultSchema}].[SignatureRequest] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequest] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequest] ADD CONSTRAINT [DF___mj_SignatureRequest___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequest] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
UPDATE [${flyway:defaultSchema}].[SignatureRequest] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequest] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequest */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequest] ADD CONSTRAINT [DF___mj_SignatureRequest___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestDocument] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
UPDATE [${flyway:defaultSchema}].[SignatureRequestDocument] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestDocument] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestDocument] ADD CONSTRAINT [DF___mj_SignatureRequestDocument___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestDocument] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
UPDATE [${flyway:defaultSchema}].[SignatureRequestDocument] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestDocument] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestDocument */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestDocument] ADD CONSTRAINT [DF___mj_SignatureRequestDocument___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
ALTER TABLE [${flyway:defaultSchema}].[SignatureAccount] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
UPDATE [${flyway:defaultSchema}].[SignatureAccount] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
ALTER TABLE [${flyway:defaultSchema}].[SignatureAccount] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
ALTER TABLE [${flyway:defaultSchema}].[SignatureAccount] ADD CONSTRAINT [DF___mj_SignatureAccount___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
ALTER TABLE [${flyway:defaultSchema}].[SignatureAccount] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
UPDATE [${flyway:defaultSchema}].[SignatureAccount] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
ALTER TABLE [${flyway:defaultSchema}].[SignatureAccount] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureAccount */
ALTER TABLE [${flyway:defaultSchema}].[SignatureAccount] ADD CONSTRAINT [DF___mj_SignatureAccount___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestRecipient] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
UPDATE [${flyway:defaultSchema}].[SignatureRequestRecipient] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestRecipient] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestRecipient] ADD CONSTRAINT [DF___mj_SignatureRequestRecipient___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestRecipient] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
UPDATE [${flyway:defaultSchema}].[SignatureRequestRecipient] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestRecipient] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestRecipient */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestRecipient] ADD CONSTRAINT [DF___mj_SignatureRequestRecipient___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
ALTER TABLE [${flyway:defaultSchema}].[SignatureProvider] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
UPDATE [${flyway:defaultSchema}].[SignatureProvider] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
ALTER TABLE [${flyway:defaultSchema}].[SignatureProvider] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
ALTER TABLE [${flyway:defaultSchema}].[SignatureProvider] ADD CONSTRAINT [DF___mj_SignatureProvider___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
ALTER TABLE [${flyway:defaultSchema}].[SignatureProvider] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
UPDATE [${flyway:defaultSchema}].[SignatureProvider] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
ALTER TABLE [${flyway:defaultSchema}].[SignatureProvider] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureProvider */
ALTER TABLE [${flyway:defaultSchema}].[SignatureProvider] ADD CONSTRAINT [DF___mj_SignatureProvider___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
UPDATE [${flyway:defaultSchema}].[SignatureRequestLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestLog] ADD CONSTRAINT [DF___mj_SignatureRequestLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
UPDATE [${flyway:defaultSchema}].[SignatureRequestLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SignatureRequestLog */
ALTER TABLE [${flyway:defaultSchema}].[SignatureRequestLog] ADD CONSTRAINT [DF___mj_SignatureRequestLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e71c719c-20f1-4ede-a4bb-1a05ad3f56b2' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'ID')) BEGIN
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
            'e71c719c-20f1-4ede-a4bb-1a05ad3f56b2',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04a2ede7-1528-48b6-97e0-e7bfcd7c92d5' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'SignatureAccountID')) BEGIN
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
            '04a2ede7-1528-48b6-97e0-e7bfcd7c92d5',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100002,
            'SignatureAccountID',
            'Signature Account ID',
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
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd33a8958-5a04-45ba-9b70-f84881e2cf0c' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'Name')) BEGIN
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
            'd33a8958-5a04-45ba-9b70-f84881e2cf0c',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100003,
            'Name',
            'Name',
            'Envelope title / email subject.',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '875fd874-c53f-41e5-9cdb-2d6468973073' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'Message')) BEGIN
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
            '875fd874-c53f-41e5-9cdb-2d6468973073',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100004,
            'Message',
            'Message',
            'Optional email body / message sent to recipients with the envelope.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0da669d4-15fa-4b9a-ab4d-0d2497166089' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'Status')) BEGIN
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
            '0da669d4-15fa-4b9a-ab4d-0d2497166089',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100005,
            'Status',
            'Status',
            'Normalized envelope lifecycle status: Draft, Sent, Delivered, Signed, Completed, Declined, or Voided.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dac6b9ed-a9b9-4861-8e41-1874cd520be5' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'ExternalEnvelopeID')) BEGIN
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
            'dac6b9ed-a9b9-4861-8e41-1874cd520be5',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100006,
            'ExternalEnvelopeID',
            'External Envelope ID',
            'Provider-side envelope identifier (e.g. DocuSign envelopeId), assigned after the envelope is created.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b70d9fe2-0f70-4bab-b61e-ac46bc496bf3' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'EntityID')) BEGIN
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
            'b70d9fe2-0f70-4bab-b61e-ac46bc496bf3',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100007,
            'EntityID',
            'Entity ID',
            'Polymorphic reference (entity half): the Entity of the originating business record that owns this signature request. NULL for standalone requests. Paired with RecordID.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fd94d7a-1fa7-44d4-94fb-935431801e0e' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'RecordID')) BEGIN
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
            '2fd94d7a-1fa7-44d4-94fb-935431801e0e',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100008,
            'RecordID',
            'Record ID',
            'Polymorphic reference (record half): the primary key value of the originating business record in the entity named by EntityID. NULL for standalone requests.',
            'nvarchar',
            900,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ffe69fd-3d6d-4a6a-8086-b1649c009553' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'SentAt')) BEGIN
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
            '4ffe69fd-3d6d-4a6a-8086-b1649c009553',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100009,
            'SentAt',
            'Sent At',
            'Timestamp the envelope was sent to recipients.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e13825f-dfd5-482b-a4e1-d080c5b1c101' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'CompletedAt')) BEGIN
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
            '8e13825f-dfd5-482b-a4e1-d080c5b1c101',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100010,
            'CompletedAt',
            'Completed At',
            'Timestamp the envelope reached a terminal completed state (all recipients signed).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '947e3ea5-772d-4782-98b9-aeefc2394fa4' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'VoidReason')) BEGIN
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
            '947e3ea5-772d-4782-98b9-aeefc2394fa4',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100011,
            'VoidReason',
            'Void Reason',
            'Reason supplied when the envelope was voided/cancelled.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36b6703c-96c3-4156-8502-f47dd0769744' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = '__mj_CreatedAt')) BEGIN
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
            '36b6703c-96c3-4156-8502-f47dd0769744',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64ca6956-b996-497e-bb2b-dc3376c4a704' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '64ca6956-b996-497e-bb2b-dc3376c4a704',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd2b8f16-0b5e-4752-b44b-f332a5530c56' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'ID')) BEGIN
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
            'dd2b8f16-0b5e-4752-b44b-f332a5530c56',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0ffc7bb-b143-4930-9ef3-08d5729c9c04' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'SignatureRequestID')) BEGIN
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
            'e0ffc7bb-b143-4930-9ef3-08d5729c9c04',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100002,
            'SignatureRequestID',
            'Signature Request ID',
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
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9fc86d8-0586-4b1f-a6b2-6088b02aed06' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'ArtifactID')) BEGIN
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
            'c9fc86d8-0586-4b1f-a6b2-6088b02aed06',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100003,
            'ArtifactID',
            'Artifact ID',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e308445e-1ac1-42a5-b415-08f5974be589' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'ArtifactVersionID')) BEGIN
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
            'e308445e-1ac1-42a5-b415-08f5974be589',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100004,
            'ArtifactVersionID',
            'Artifact Version ID',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a206a8d1-db54-49e2-a641-07d0a77a97c4' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'Name')) BEGIN
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
            'a206a8d1-db54-49e2-a641-07d0a77a97c4',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100005,
            'Name',
            'Name',
            'Document filename as presented to the provider / signer.',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9283e8e-7a9c-42ab-9d7f-2896b3c1a0f4' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'Sequence')) BEGIN
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
            'f9283e8e-7a9c-42ab-9d7f-2896b3c1a0f4',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100006,
            'Sequence',
            'Sequence',
            'Ordering of this document within the envelope (1-based).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a33cac0-8579-4813-8941-80195a300ac5' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'Role')) BEGIN
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
            '1a33cac0-8579-4813-8941-80195a300ac5',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100007,
            'Role',
            'Role',
            'Document role: Source = the document sent for signature; Signed = the executed document downloaded after completion (written back as a new Artifact Version).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Source',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '598ca112-9604-44a5-b218-79ac441e0dae' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = '__mj_CreatedAt')) BEGIN
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
            '598ca112-9604-44a5-b218-79ac441e0dae',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '093b9aac-b391-4ba5-b8fc-26aa0fadbf8c' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '093b9aac-b391-4ba5-b8fc-26aa0fadbf8c',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7b15dc2-cbd6-431b-ab23-be119ee54926' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'ID')) BEGIN
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
            'e7b15dc2-cbd6-431b-ab23-be119ee54926',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bda6373-6ec9-4c18-bd55-17d56b15bfd8' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'Name')) BEGIN
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
            '3bda6373-6ec9-4c18-bd55-17d56b15bfd8',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100002,
            'Name',
            'Name',
            'Human-readable account name (e.g. "Acme Prod DocuSign").',
            'nvarchar',
            400,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40a3f0b5-f4fc-43e0-94ee-bc85ed6af7a5' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'SignatureProviderID')) BEGIN
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
            '40a3f0b5-f4fc-43e0-94ee-bc85ed6af7a5',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100003,
            'SignatureProviderID',
            'Signature Provider ID',
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
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be88e0af-24a9-4cc8-b3e7-27fabf2ad78b' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'CredentialID')) BEGIN
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
            'be88e0af-24a9-4cc8-b3e7-27fabf2ad78b',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100004,
            'CredentialID',
            'Credential ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b86c37b-47ab-4715-a239-1b072cb79fc1' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'CompanyID')) BEGIN
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
            '9b86c37b-47ab-4715-a239-1b072cb79fc1',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100005,
            'CompanyID',
            'Company ID',
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
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd0b6be9-9152-4d05-aa8a-4186448eb827' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'IsActive')) BEGIN
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
            'fd0b6be9-9152-4d05-aa8a-4186448eb827',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100006,
            'IsActive',
            'Is Active',
            'Whether this account is available for use. Inactive accounts are not pre-initialized by the engine driver cache.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b0443ea-fdd3-4df3-a109-f436741dabb9' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'IsDefault')) BEGIN
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
            '5b0443ea-fdd3-4df3-a109-f436741dabb9',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100007,
            'IsDefault',
            'Is Default',
            'Whether this is the default account for its provider (and Company, when scoped).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '756c442e-c593-4dac-bef8-a494ce2b1902' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'DefaultFromName')) BEGIN
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
            '756c442e-c593-4dac-bef8-a494ce2b1902',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100008,
            'DefaultFromName',
            'Default From Name',
            'Default sender display name for envelopes from this account.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '931be8e0-2ad1-485e-87d3-ed8cb3b41e6f' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'DefaultFromEmail')) BEGIN
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
            '931be8e0-2ad1-485e-87d3-ed8cb3b41e6f',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100009,
            'DefaultFromEmail',
            'Default From Email',
            'Default sender email for envelopes from this account.',
            'nvarchar',
            640,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b708d886-ef4a-4e60-9e8c-83200bee3939' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'Configuration')) BEGIN
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
            'b708d886-ef4a-4e60-9e8c-83200bee3939',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100010,
            'Configuration',
            'Configuration',
            'JSON of non-secret per-account overrides (e.g. accountId, restBase). Merged over provider Configuration and under decrypted credential values at driver initialize().',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e16d1554-36c3-477e-9cd5-524b802191d5' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e16d1554-36c3-477e-9cd5-524b802191d5',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d9620e6-6074-49b7-98f6-02b347e7f913' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2d9620e6-6074-49b7-98f6-02b347e7f913',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec4b6a3c-7d36-4c41-af64-e20a04f2eb68' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'ID')) BEGIN
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
            'ec4b6a3c-7d36-4c41-af64-e20a04f2eb68',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff34ff1f-3f9e-4a1b-997b-91bf0e8a628f' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'SignatureRequestID')) BEGIN
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
            'ff34ff1f-3f9e-4a1b-997b-91bf0e8a628f',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100002,
            'SignatureRequestID',
            'Signature Request ID',
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
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d12d760-f6bb-4eb2-82f4-13f518583d95' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'Email')) BEGIN
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
            '4d12d760-f6bb-4eb2-82f4-13f518583d95',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100003,
            'Email',
            'Email',
            'Recipient email address.',
            'nvarchar',
            640,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b87d1bdd-ad99-4c3a-83e4-811a1e389c11' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'Name')) BEGIN
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
            'b87d1bdd-ad99-4c3a-83e4-811a1e389c11',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100004,
            'Name',
            'Name',
            'Recipient display name.',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee9f7851-6abb-442c-8e43-abcbda31a1aa' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'RoutingOrder')) BEGIN
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
            'ee9f7851-6abb-442c-8e43-abcbda31a1aa',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100005,
            'RoutingOrder',
            'Routing Order',
            'Signing order; lower routes first (1-based).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ff77bb5-7e61-449a-a81a-d97daa86b6f5' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'Role')) BEGIN
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
            '4ff77bb5-7e61-449a-a81a-d97daa86b6f5',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100006,
            'Role',
            'Role',
            'Template role name for this recipient, when the envelope was created from a provider template.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d1f72d7-6d09-43a4-98cf-e35ba9f08957' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'Status')) BEGIN
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
            '8d1f72d7-6d09-43a4-98cf-e35ba9f08957',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100007,
            'Status',
            'Status',
            'Per-recipient status: Created, Sent, Delivered, Signed, or Declined.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Created',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4552bdca-0879-4a14-b1c0-b50cb5f84dbd' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'SignedAt')) BEGIN
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
            '4552bdca-0879-4a14-b1c0-b50cb5f84dbd',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100008,
            'SignedAt',
            'Signed At',
            'Timestamp this recipient signed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9dd840b9-bef5-454b-ab7d-6461ec604235' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'ExternalRecipientID')) BEGIN
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
            '9dd840b9-bef5-454b-ab7d-6461ec604235',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100009,
            'ExternalRecipientID',
            'External Recipient ID',
            'Provider-side recipient identifier, for correlation with provider events.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a99a826-45b6-4f2e-bffc-71c30c979f0c' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6a99a826-45b6-4f2e-bffc-71c30c979f0c',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29560860-f17b-4e0d-a317-716f4820c1dd' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '29560860-f17b-4e0d-a317-716f4820c1dd',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73781f9b-7be7-4cc9-9414-c21974ab2a11' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'ID')) BEGIN
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
            '73781f9b-7be7-4cc9-9414-c21974ab2a11',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9aaae97-883f-4d9c-814e-183e2463c5f4' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'Name')) BEGIN
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
            'c9aaae97-883f-4d9c-814e-183e2463c5f4',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100002,
            'Name',
            'Name',
            'Display name of the eSignature provider type (e.g. DocuSign, Adobe Sign).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b335e776-2677-405c-beb4-bc435c53afe3' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'ServerDriverKey')) BEGIN
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
            'b335e776-2677-405c-beb4-bc435c53afe3',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100003,
            'ServerDriverKey',
            'Server Driver Key',
            'Driver key resolved at runtime via MJGlobal.ClassFactory.CreateInstance(BaseSignatureProvider, ServerDriverKey). MUST match the @RegisterClass key on the concrete driver (e.g. ''DocuSign'').',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a845b64d-1d66-4ed6-9ce4-4c7bcae26a8d' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'IsActive')) BEGIN
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
            'a845b64d-1d66-4ed6-9ce4-4c7bcae26a8d',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100004,
            'IsActive',
            'Is Active',
            'Whether this provider type is available for use. Inactive providers are skipped by the engine.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1078b446-e3dc-4a7e-8d46-288724b0a8ba' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'Priority')) BEGIN
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
            '1078b446-e3dc-4a7e-8d46-288724b0a8ba',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100005,
            'Priority',
            'Priority',
            'Selection priority when multiple providers could apply. Lower number = higher priority.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9659f0dd-ecee-4804-9681-b91b8b215cf2' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'RequiresOAuth')) BEGIN
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
            '9659f0dd-ecee-4804-9681-b91b8b215cf2',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100006,
            'RequiresOAuth',
            'Requires O Auth',
            'Whether this provider requires OAuth-based credentials (vs. a static API key).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0f7a466-a1e7-4856-ab2b-335756ec44d1' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'SupportsTemplates')) BEGIN
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
            'c0f7a466-a1e7-4856-ab2b-335756ec44d1',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100007,
            'SupportsTemplates',
            'Supports Templates',
            'Whether this provider supports creating envelopes from provider-hosted templates (ApplyTemplate operation).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bf29a02-9b42-4b60-b13b-8536c42e84e4' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'SupportsEmbeddedSigning')) BEGIN
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
            '1bf29a02-9b42-4b60-b13b-8536c42e84e4',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100008,
            'SupportsEmbeddedSigning',
            'Supports Embedded Signing',
            'Whether this provider supports embedded (in-app) signing URLs (CreateEmbeddedSigningUrl operation).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd27b6ae3-e34b-42dc-9eb5-0b296fc9a934' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = 'Configuration')) BEGIN
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
            'd27b6ae3-e34b-42dc-9eb5-0b296fc9a934',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100009,
            'Configuration',
            'Configuration',
            'JSON of non-secret provider-type defaults (e.g. oauthBase, restBase). Merged under per-account Configuration and decrypted credential values at driver initialize().',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42db4adb-fb7b-49fb-9406-53931316f62a' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '42db4adb-fb7b-49fb-9406-53931316f62a',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d139b93-4fa1-4d9e-801d-84e55f301a03' OR (EntityID = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4d139b93-4fa1-4d9e-801d-84e55f301a03',
            '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', -- Entity: MJ: Signature Providers
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47eacabd-fcb9-4416-b275-763de5377d3d' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'ID')) BEGIN
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
            '47eacabd-fcb9-4416-b275-763de5377d3d',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '02951200-7a4f-4455-a7e5-81b5c68b58b4' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'SignatureRequestID')) BEGIN
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
            '02951200-7a4f-4455-a7e5-81b5c68b58b4',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100002,
            'SignatureRequestID',
            'Signature Request ID',
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
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b98f7e88-badf-44e7-b02a-79d0de1898ea' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'Operation')) BEGIN
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
            'b98f7e88-badf-44e7-b02a-79d0de1898ea',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100003,
            'Operation',
            'Operation',
            'The provider operation logged (e.g. CreateEnvelope, GetEnvelopeStatus, DownloadSignedDocument, VoidEnvelope, Webhook).',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7fbbb1a6-423a-4b6e-8127-490a272a81f2' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'Success')) BEGIN
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
            '7fbbb1a6-423a-4b6e-8127-490a272a81f2',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100004,
            'Success',
            'Success',
            'Whether the operation succeeded.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43ab0872-21f8-4bac-b71a-0f72045df11b' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'StatusBefore')) BEGIN
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
            '43ab0872-21f8-4bac-b71a-0f72045df11b',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100005,
            'StatusBefore',
            'Status Before',
            'Signature request status immediately before the operation, when applicable.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70e5d48f-97fc-4ff4-a427-01e8c9cfcef3' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'StatusAfter')) BEGIN
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
            '70e5d48f-97fc-4ff4-a427-01e8c9cfcef3',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100006,
            'StatusAfter',
            'Status After',
            'Signature request status immediately after the operation, when applicable.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cab58ea9-c662-4a83-b454-f57a4401576b' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'Detail')) BEGIN
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
            'cab58ea9-c662-4a83-b454-f57a4401576b',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100007,
            'Detail',
            'Detail',
            'Free-form detail: error text on failure, or normalized event JSON for webhook entries.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffe370ef-0f9a-47b3-bd54-79d544824832' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ffe370ef-0f9a-47b3-bd54-79d544824832',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'baad8f2e-3e8a-4f3d-8833-f88713cd5a5f' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'baad8f2e-3e8a-4f3d-8833-f88713cd5a5f',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100009,
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

/* SQL text to insert entity field value with ID ae803047-db7f-49bd-941f-318022832aaf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ae803047-db7f-49bd-941f-318022832aaf', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cdab932a-8c6a-4ee5-ae75-60e138332dc2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cdab932a-8c6a-4ee5-ae75-60e138332dc2', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 2, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e696a16f-2ce3-4c63-a339-2782bc9d3d9b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e696a16f-2ce3-4c63-a339-2782bc9d3d9b', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 3, 'Delivered', 'Delivered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e03dcde2-1635-4290-b15c-f25d9f241768 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e03dcde2-1635-4290-b15c-f25d9f241768', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 4, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 57cf588d-74a8-4251-9f42-4e60f1e06552 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('57cf588d-74a8-4251-9f42-4e60f1e06552', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 5, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 377b95e1-0b46-47ab-a1fe-acd6adebf92e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('377b95e1-0b46-47ab-a1fe-acd6adebf92e', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 6, 'Signed', 'Signed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a1a99dfb-5bc2-4fc3-8cbe-15eae6ace3d0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a1a99dfb-5bc2-4fc3-8cbe-15eae6ace3d0', '0DA669D4-15FA-4B9A-AB4D-0D2497166089', 7, 'Voided', 'Voided', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0DA669D4-15FA-4B9A-AB4D-0D2497166089 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0DA669D4-15FA-4B9A-AB4D-0D2497166089';

/* SQL text to insert entity field value with ID a9d1e07d-b7ec-4a7e-9f81-23f47a80453f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a9d1e07d-b7ec-4a7e-9f81-23f47a80453f', '1A33CAC0-8579-4813-8941-80195A300AC5', 1, 'Signed', 'Signed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b59520d9-07d7-4c3c-8be2-7ae6d22074d3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b59520d9-07d7-4c3c-8be2-7ae6d22074d3', '1A33CAC0-8579-4813-8941-80195A300AC5', 2, 'Source', 'Source', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1A33CAC0-8579-4813-8941-80195A300AC5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1A33CAC0-8579-4813-8941-80195A300AC5';

/* SQL text to insert entity field value with ID 0616403a-5358-4e8f-beea-8275745c27e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0616403a-5358-4e8f-beea-8275745c27e0', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 1, 'Created', 'Created', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2e5f3565-2c73-4057-b66d-3faa27a7f04e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2e5f3565-2c73-4057-b66d-3faa27a7f04e', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 2, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ecdf93f2-7b93-428f-8048-f63356fd6ec7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ecdf93f2-7b93-428f-8048-f63356fd6ec7', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 3, 'Delivered', 'Delivered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 897395f4-9d4f-4b93-94c3-7a06b5fabd63 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('897395f4-9d4f-4b93-94c3-7a06b5fabd63', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 4, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c9bada35-2cf5-4203-8148-9c53934ada4b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c9bada35-2cf5-4203-8148-9c53934ada4b', '8D1F72D7-6D09-43A4-98CF-E35BA9F08957', 5, 'Signed', 'Signed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8D1F72D7-6D09-43A4-98CF-E35BA9F08957 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8D1F72D7-6D09-43A4-98CF-E35BA9F08957';


/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Logs (One To Many via SignatureRequestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2cf25380-195c-4a46-9c37-6fe0d51eb6ca'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2cf25380-195c-4a46-9c37-6fe0d51eb6ca', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', '224F170C-5FCC-41F2-906F-B82B30F1EB2A', 'SignatureRequestID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Recipients (One To Many via SignatureRequestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1818231f-aac0-4a11-a7b3-2a67ca050125'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1818231f-aac0-4a11-a7b3-2a67ca050125', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', '2EECC44E-A41F-4521-8C0E-764D4D68FF70', 'SignatureRequestID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Documents (One To Many via SignatureRequestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3506256c-bd79-4677-9aff-7ccd17a5d0b9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3506256c-bd79-4677-9aff-7ccd17a5d0b9', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'SignatureRequestID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Signature Accounts -> MJ: Signature Requests (One To Many via SignatureAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '29685f42-7fc9-4214-8c87-93f8f29b8f3b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('29685f42-7fc9-4214-8c87-93f8f29b8f3b', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'SignatureAccountID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ: Signature Accounts (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a5934ae8-3f6b-41d6-81ae-a32313b6256e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a5934ae8-3f6b-41d6-81ae-a32313b6256e', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'CompanyID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Signature Requests (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '697bef3c-7bc6-4248-af61-006040a603fd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('697bef3c-7bc6-4248-af61-006040a603fd', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'EntityID', 'One To Many', 1, 1, 62, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifacts -> MJ: Signature Request Documents (One To Many via ArtifactID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '52158d8d-bfaf-4a43-a688-d93ddcd59de7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('52158d8d-bfaf-4a43-a688-d93ddcd59de7', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'ArtifactID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Credentials -> MJ: Signature Accounts (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'df9bea45-2736-4dd5-a039-eb172468ee89'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('df9bea45-2736-4dd5-a039-eb172468ee89', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'CredentialID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Signature Providers -> MJ: Signature Accounts (One To Many via SignatureProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f034dcd3-929b-4e91-8c8d-fbe95dd9b1cb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f034dcd3-929b-4e91-8c8d-fbe95dd9b1cb', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'SignatureProviderID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifact Versions -> MJ: Signature Request Documents (One To Many via ArtifactVersionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2df255ac-d1c5-4b54-9901-602536e53b6d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2df255ac-d1c5-4b54-9901-602536e53b6d', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'ArtifactVersionID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for SignatureAccount */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SignatureProviderID in table SignatureAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureAccount_SignatureProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureAccount_SignatureProviderID ON [${flyway:defaultSchema}].[SignatureAccount] ([SignatureProviderID]);

-- Index for foreign key CredentialID in table SignatureAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureAccount_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureAccount_CredentialID ON [${flyway:defaultSchema}].[SignatureAccount] ([CredentialID]);

-- Index for foreign key CompanyID in table SignatureAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureAccount_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureAccount_CompanyID ON [${flyway:defaultSchema}].[SignatureAccount] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID 40A3F0B5-F4FC-43E0-94EE-BC85ED6AF7A5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='40A3F0B5-F4FC-43E0-94EE-BC85ED6AF7A5', @RelatedEntityNameFieldMap='SignatureProvider';

/* SQL text to update entity field related entity name field map for entity field ID BE88E0AF-24A9-4CC8-B3E7-27FABF2AD78B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BE88E0AF-24A9-4CC8-B3E7-27FABF2AD78B', @RelatedEntityNameFieldMap='Credential';

/* SQL text to update entity field related entity name field map for entity field ID 9B86C37B-47AB-4715-A239-1B072CB79FC1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9B86C37B-47AB-4715-A239-1B072CB79FC1', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: vwSignatureAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Accounts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SignatureAccount
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSignatureAccounts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSignatureAccounts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSignatureAccounts]
AS
SELECT
    s.*,
    MJSignatureProvider_SignatureProviderID.[Name] AS [SignatureProvider],
    MJCredential_CredentialID.[Name] AS [Credential],
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[SignatureAccount] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SignatureProvider] AS MJSignatureProvider_SignatureProviderID
  ON
    [s].[SignatureProviderID] = MJSignatureProvider_SignatureProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [s].[CredentialID] = MJCredential_CredentialID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [s].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: Permissions for vwSignatureAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: spCreateSignatureAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSignatureAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureAccount]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @SignatureProviderID uniqueidentifier,
    @CredentialID uniqueidentifier,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @IsActive bit = NULL,
    @IsDefault bit = NULL,
    @DefaultFromName_Clear bit = 0,
    @DefaultFromName nvarchar(200) = NULL,
    @DefaultFromEmail_Clear bit = 0,
    @DefaultFromEmail nvarchar(320) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SignatureAccount]
            (
                [ID],
                [Name],
                [SignatureProviderID],
                [CredentialID],
                [CompanyID],
                [IsActive],
                [IsDefault],
                [DefaultFromName],
                [DefaultFromEmail],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @SignatureProviderID,
                @CredentialID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@IsDefault, 0),
                CASE WHEN @DefaultFromName_Clear = 1 THEN NULL ELSE ISNULL(@DefaultFromName, NULL) END,
                CASE WHEN @DefaultFromEmail_Clear = 1 THEN NULL ELSE ISNULL(@DefaultFromEmail, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SignatureAccount]
            (
                [Name],
                [SignatureProviderID],
                [CredentialID],
                [CompanyID],
                [IsActive],
                [IsDefault],
                [DefaultFromName],
                [DefaultFromEmail],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @SignatureProviderID,
                @CredentialID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@IsDefault, 0),
                CASE WHEN @DefaultFromName_Clear = 1 THEN NULL ELSE ISNULL(@DefaultFromName, NULL) END,
                CASE WHEN @DefaultFromEmail_Clear = 1 THEN NULL ELSE ISNULL(@DefaultFromEmail, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSignatureAccounts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureAccount] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Signature Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureAccount] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: spUpdateSignatureAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSignatureAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureAccount]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @SignatureProviderID uniqueidentifier = NULL,
    @CredentialID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @IsActive bit = NULL,
    @IsDefault bit = NULL,
    @DefaultFromName_Clear bit = 0,
    @DefaultFromName nvarchar(200) = NULL,
    @DefaultFromEmail_Clear bit = 0,
    @DefaultFromEmail nvarchar(320) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureAccount]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [SignatureProviderID] = ISNULL(@SignatureProviderID, [SignatureProviderID]),
        [CredentialID] = ISNULL(@CredentialID, [CredentialID]),
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [DefaultFromName] = CASE WHEN @DefaultFromName_Clear = 1 THEN NULL ELSE ISNULL(@DefaultFromName, [DefaultFromName]) END,
        [DefaultFromEmail] = CASE WHEN @DefaultFromEmail_Clear = 1 THEN NULL ELSE ISNULL(@DefaultFromEmail, [DefaultFromEmail]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSignatureAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSignatureAccounts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureAccount] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SignatureAccount table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSignatureAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSignatureAccount];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSignatureAccount
ON [${flyway:defaultSchema}].[SignatureAccount]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureAccount]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SignatureAccount] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Signature Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureAccount] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Signature Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Accounts
-- Item: spDeleteSignatureAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSignatureAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureAccount]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SignatureAccount]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureAccount] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Signature Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureAccount] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for SignatureProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for SignatureRequestDocument */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SignatureRequestID in table SignatureRequestDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequestDocument_SignatureRequestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequestDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequestDocument_SignatureRequestID ON [${flyway:defaultSchema}].[SignatureRequestDocument] ([SignatureRequestID]);

-- Index for foreign key ArtifactID in table SignatureRequestDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequestDocument_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequestDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequestDocument_ArtifactID ON [${flyway:defaultSchema}].[SignatureRequestDocument] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table SignatureRequestDocument
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequestDocument_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequestDocument]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequestDocument_ArtifactVersionID ON [${flyway:defaultSchema}].[SignatureRequestDocument] ([ArtifactVersionID]);

/* SQL text to update entity field related entity name field map for entity field ID E0FFC7BB-B143-4930-9EF3-08D5729C9C04 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E0FFC7BB-B143-4930-9EF3-08D5729C9C04', @RelatedEntityNameFieldMap='SignatureRequest';

/* Index for Foreign Keys for SignatureRequestLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SignatureRequestID in table SignatureRequestLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequestLog_SignatureRequestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequestLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequestLog_SignatureRequestID ON [${flyway:defaultSchema}].[SignatureRequestLog] ([SignatureRequestID]);

/* SQL text to update entity field related entity name field map for entity field ID 02951200-7A4F-4455-A7E5-81B5C68B58B4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='02951200-7A4F-4455-A7E5-81B5C68B58B4', @RelatedEntityNameFieldMap='SignatureRequest';

/* Index for Foreign Keys for SignatureRequestRecipient */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SignatureRequestID in table SignatureRequestRecipient
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequestRecipient_SignatureRequestID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequestRecipient]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequestRecipient_SignatureRequestID ON [${flyway:defaultSchema}].[SignatureRequestRecipient] ([SignatureRequestID]);

/* SQL text to update entity field related entity name field map for entity field ID FF34FF1F-3F9E-4A1B-997B-91BF0E8A628F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF34FF1F-3F9E-4A1B-997B-91BF0E8A628F', @RelatedEntityNameFieldMap='SignatureRequest';

/* Index for Foreign Keys for SignatureRequest */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SignatureAccountID in table SignatureRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequest_SignatureAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequest_SignatureAccountID ON [${flyway:defaultSchema}].[SignatureRequest] ([SignatureAccountID]);

-- Index for foreign key EntityID in table SignatureRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SignatureRequest_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SignatureRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SignatureRequest_EntityID ON [${flyway:defaultSchema}].[SignatureRequest] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 04A2EDE7-1528-48B6-97E0-E7BFCD7C92D5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='04A2EDE7-1528-48B6-97E0-E7BFCD7C92D5', @RelatedEntityNameFieldMap='SignatureAccount';

/* Base View SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: vwSignatureProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SignatureProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSignatureProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSignatureProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSignatureProviders]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SignatureProvider] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: Permissions for vwSignatureProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: spCreateSignatureProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSignatureProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @ServerDriverKey nvarchar(100),
    @IsActive bit = NULL,
    @Priority int = NULL,
    @RequiresOAuth bit = NULL,
    @SupportsTemplates bit = NULL,
    @SupportsEmbeddedSigning bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SignatureProvider]
            (
                [ID],
                [Name],
                [ServerDriverKey],
                [IsActive],
                [Priority],
                [RequiresOAuth],
                [SupportsTemplates],
                [SupportsEmbeddedSigning],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ServerDriverKey,
                ISNULL(@IsActive, 1),
                ISNULL(@Priority, 0),
                ISNULL(@RequiresOAuth, 1),
                ISNULL(@SupportsTemplates, 0),
                ISNULL(@SupportsEmbeddedSigning, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SignatureProvider]
            (
                [Name],
                [ServerDriverKey],
                [IsActive],
                [Priority],
                [RequiresOAuth],
                [SupportsTemplates],
                [SupportsEmbeddedSigning],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ServerDriverKey,
                ISNULL(@IsActive, 1),
                ISNULL(@Priority, 0),
                ISNULL(@RequiresOAuth, 1),
                ISNULL(@SupportsTemplates, 0),
                ISNULL(@SupportsEmbeddedSigning, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSignatureProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Signature Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureProvider] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: spUpdateSignatureProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSignatureProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureProvider]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @ServerDriverKey nvarchar(100) = NULL,
    @IsActive bit = NULL,
    @Priority int = NULL,
    @RequiresOAuth bit = NULL,
    @SupportsTemplates bit = NULL,
    @SupportsEmbeddedSigning bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureProvider]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [ServerDriverKey] = ISNULL(@ServerDriverKey, [ServerDriverKey]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [RequiresOAuth] = ISNULL(@RequiresOAuth, [RequiresOAuth]),
        [SupportsTemplates] = ISNULL(@SupportsTemplates, [SupportsTemplates]),
        [SupportsEmbeddedSigning] = ISNULL(@SupportsEmbeddedSigning, [SupportsEmbeddedSigning]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSignatureProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSignatureProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SignatureProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSignatureProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSignatureProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSignatureProvider
ON [${flyway:defaultSchema}].[SignatureProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SignatureProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Signature Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Signature Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Providers
-- Item: spDeleteSignatureProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSignatureProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SignatureProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Signature Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureProvider] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: vwSignatureRequestLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Request Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SignatureRequestLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSignatureRequestLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSignatureRequestLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSignatureRequestLogs]
AS
SELECT
    s.*,
    MJSignatureRequest_SignatureRequestID.[Name] AS [SignatureRequest]
FROM
    [${flyway:defaultSchema}].[SignatureRequestLog] AS s
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SignatureRequest] AS MJSignatureRequest_SignatureRequestID
  ON
    [s].[SignatureRequestID] = MJSignatureRequest_SignatureRequestID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequestLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: Permissions for vwSignatureRequestLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequestLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: spCreateSignatureRequestLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequestLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSignatureRequestLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequestLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequestLog]
    @ID uniqueidentifier = NULL,
    @SignatureRequestID_Clear bit = 0,
    @SignatureRequestID uniqueidentifier = NULL,
    @Operation nvarchar(50),
    @Success bit = NULL,
    @StatusBefore_Clear bit = 0,
    @StatusBefore nvarchar(20) = NULL,
    @StatusAfter_Clear bit = 0,
    @StatusAfter nvarchar(20) = NULL,
    @Detail_Clear bit = 0,
    @Detail nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequestLog]
            (
                [ID],
                [SignatureRequestID],
                [Operation],
                [Success],
                [StatusBefore],
                [StatusAfter],
                [Detail]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @SignatureRequestID_Clear = 1 THEN NULL ELSE ISNULL(@SignatureRequestID, NULL) END,
                @Operation,
                ISNULL(@Success, 0),
                CASE WHEN @StatusBefore_Clear = 1 THEN NULL ELSE ISNULL(@StatusBefore, NULL) END,
                CASE WHEN @StatusAfter_Clear = 1 THEN NULL ELSE ISNULL(@StatusAfter, NULL) END,
                CASE WHEN @Detail_Clear = 1 THEN NULL ELSE ISNULL(@Detail, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequestLog]
            (
                [SignatureRequestID],
                [Operation],
                [Success],
                [StatusBefore],
                [StatusAfter],
                [Detail]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @SignatureRequestID_Clear = 1 THEN NULL ELSE ISNULL(@SignatureRequestID, NULL) END,
                @Operation,
                ISNULL(@Success, 0),
                CASE WHEN @StatusBefore_Clear = 1 THEN NULL ELSE ISNULL(@StatusBefore, NULL) END,
                CASE WHEN @StatusAfter_Clear = 1 THEN NULL ELSE ISNULL(@StatusAfter, NULL) END,
                CASE WHEN @Detail_Clear = 1 THEN NULL ELSE ISNULL(@Detail, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSignatureRequestLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequestLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Signature Request Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequestLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: spUpdateSignatureRequestLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequestLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSignatureRequestLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequestLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequestLog]
    @ID uniqueidentifier,
    @SignatureRequestID_Clear bit = 0,
    @SignatureRequestID uniqueidentifier = NULL,
    @Operation nvarchar(50) = NULL,
    @Success bit = NULL,
    @StatusBefore_Clear bit = 0,
    @StatusBefore nvarchar(20) = NULL,
    @StatusAfter_Clear bit = 0,
    @StatusAfter nvarchar(20) = NULL,
    @Detail_Clear bit = 0,
    @Detail nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequestLog]
    SET
        [SignatureRequestID] = CASE WHEN @SignatureRequestID_Clear = 1 THEN NULL ELSE ISNULL(@SignatureRequestID, [SignatureRequestID]) END,
        [Operation] = ISNULL(@Operation, [Operation]),
        [Success] = ISNULL(@Success, [Success]),
        [StatusBefore] = CASE WHEN @StatusBefore_Clear = 1 THEN NULL ELSE ISNULL(@StatusBefore, [StatusBefore]) END,
        [StatusAfter] = CASE WHEN @StatusAfter_Clear = 1 THEN NULL ELSE ISNULL(@StatusAfter, [StatusAfter]) END,
        [Detail] = CASE WHEN @Detail_Clear = 1 THEN NULL ELSE ISNULL(@Detail, [Detail]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSignatureRequestLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSignatureRequestLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequestLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SignatureRequestLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSignatureRequestLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSignatureRequestLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSignatureRequestLog
ON [${flyway:defaultSchema}].[SignatureRequestLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequestLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SignatureRequestLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Signature Request Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequestLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Signature Request Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Logs
-- Item: spDeleteSignatureRequestLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequestLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSignatureRequestLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequestLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequestLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SignatureRequestLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequestLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Signature Request Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequestLog] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID C9FC86D8-0586-4B1F-A6B2-6088B02AED06 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C9FC86D8-0586-4B1F-A6B2-6088B02AED06', @RelatedEntityNameFieldMap='Artifact';

/* SQL text to update entity field related entity name field map for entity field ID B70D9FE2-0F70-4BAB-B61E-AC46BC496BF3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B70D9FE2-0F70-4BAB-B61E-AC46BC496BF3', @RelatedEntityNameFieldMap='Entity';

/* Base View SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: vwSignatureRequestRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Request Recipients
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SignatureRequestRecipient
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSignatureRequestRecipients]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSignatureRequestRecipients];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSignatureRequestRecipients]
AS
SELECT
    s.*,
    MJSignatureRequest_SignatureRequestID.[Name] AS [SignatureRequest]
FROM
    [${flyway:defaultSchema}].[SignatureRequestRecipient] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SignatureRequest] AS MJSignatureRequest_SignatureRequestID
  ON
    [s].[SignatureRequestID] = MJSignatureRequest_SignatureRequestID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequestRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: Permissions for vwSignatureRequestRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequestRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: spCreateSignatureRequestRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequestRecipient
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSignatureRequestRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequestRecipient];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequestRecipient]
    @ID uniqueidentifier = NULL,
    @SignatureRequestID uniqueidentifier,
    @Email nvarchar(320),
    @Name_Clear bit = 0,
    @Name nvarchar(200) = NULL,
    @RoutingOrder int = NULL,
    @Role_Clear bit = 0,
    @Role nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL,
    @SignedAt_Clear bit = 0,
    @SignedAt datetimeoffset = NULL,
    @ExternalRecipientID_Clear bit = 0,
    @ExternalRecipientID nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequestRecipient]
            (
                [ID],
                [SignatureRequestID],
                [Email],
                [Name],
                [RoutingOrder],
                [Role],
                [Status],
                [SignedAt],
                [ExternalRecipientID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SignatureRequestID,
                @Email,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                ISNULL(@RoutingOrder, 1),
                CASE WHEN @Role_Clear = 1 THEN NULL ELSE ISNULL(@Role, NULL) END,
                ISNULL(@Status, 'Created'),
                CASE WHEN @SignedAt_Clear = 1 THEN NULL ELSE ISNULL(@SignedAt, NULL) END,
                CASE WHEN @ExternalRecipientID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalRecipientID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequestRecipient]
            (
                [SignatureRequestID],
                [Email],
                [Name],
                [RoutingOrder],
                [Role],
                [Status],
                [SignedAt],
                [ExternalRecipientID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SignatureRequestID,
                @Email,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                ISNULL(@RoutingOrder, 1),
                CASE WHEN @Role_Clear = 1 THEN NULL ELSE ISNULL(@Role, NULL) END,
                ISNULL(@Status, 'Created'),
                CASE WHEN @SignedAt_Clear = 1 THEN NULL ELSE ISNULL(@SignedAt, NULL) END,
                CASE WHEN @ExternalRecipientID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalRecipientID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSignatureRequestRecipients] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequestRecipient] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Signature Request Recipients */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequestRecipient] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: spUpdateSignatureRequestRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequestRecipient
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSignatureRequestRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequestRecipient];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequestRecipient]
    @ID uniqueidentifier,
    @SignatureRequestID uniqueidentifier = NULL,
    @Email nvarchar(320) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(200) = NULL,
    @RoutingOrder int = NULL,
    @Role_Clear bit = 0,
    @Role nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL,
    @SignedAt_Clear bit = 0,
    @SignedAt datetimeoffset = NULL,
    @ExternalRecipientID_Clear bit = 0,
    @ExternalRecipientID nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequestRecipient]
    SET
        [SignatureRequestID] = ISNULL(@SignatureRequestID, [SignatureRequestID]),
        [Email] = ISNULL(@Email, [Email]),
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [RoutingOrder] = ISNULL(@RoutingOrder, [RoutingOrder]),
        [Role] = CASE WHEN @Role_Clear = 1 THEN NULL ELSE ISNULL(@Role, [Role]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SignedAt] = CASE WHEN @SignedAt_Clear = 1 THEN NULL ELSE ISNULL(@SignedAt, [SignedAt]) END,
        [ExternalRecipientID] = CASE WHEN @ExternalRecipientID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalRecipientID, [ExternalRecipientID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSignatureRequestRecipients] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSignatureRequestRecipients]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequestRecipient] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SignatureRequestRecipient table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSignatureRequestRecipient]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSignatureRequestRecipient];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSignatureRequestRecipient
ON [${flyway:defaultSchema}].[SignatureRequestRecipient]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequestRecipient]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SignatureRequestRecipient] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Signature Request Recipients */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequestRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Signature Request Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Recipients
-- Item: spDeleteSignatureRequestRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequestRecipient
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSignatureRequestRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequestRecipient];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequestRecipient]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SignatureRequestRecipient]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequestRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Signature Request Recipients */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequestRecipient] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID E308445E-1AC1-42A5-B415-08F5974BE589 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E308445E-1AC1-42A5-B415-08F5974BE589', @RelatedEntityNameFieldMap='ArtifactVersion';

/* Base View SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: vwSignatureRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SignatureRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSignatureRequests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSignatureRequests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSignatureRequests]
AS
SELECT
    s.*,
    MJSignatureAccount_SignatureAccountID.[Name] AS [SignatureAccount],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[SignatureRequest] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SignatureAccount] AS MJSignatureAccount_SignatureAccountID
  ON
    [s].[SignatureAccountID] = MJSignatureAccount_SignatureAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [s].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: Permissions for vwSignatureRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: spCreateSignatureRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSignatureRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequest]
    @ID uniqueidentifier = NULL,
    @SignatureAccountID uniqueidentifier,
    @Name nvarchar(255),
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalEnvelopeID_Clear bit = 0,
    @ExternalEnvelopeID nvarchar(255) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(450) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @VoidReason_Clear bit = 0,
    @VoidReason nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequest]
            (
                [ID],
                [SignatureAccountID],
                [Name],
                [Message],
                [Status],
                [ExternalEnvelopeID],
                [EntityID],
                [RecordID],
                [SentAt],
                [CompletedAt],
                [VoidReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SignatureAccountID,
                @Name,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @ExternalEnvelopeID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEnvelopeID, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @VoidReason_Clear = 1 THEN NULL ELSE ISNULL(@VoidReason, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequest]
            (
                [SignatureAccountID],
                [Name],
                [Message],
                [Status],
                [ExternalEnvelopeID],
                [EntityID],
                [RecordID],
                [SentAt],
                [CompletedAt],
                [VoidReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SignatureAccountID,
                @Name,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @ExternalEnvelopeID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEnvelopeID, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @VoidReason_Clear = 1 THEN NULL ELSE ISNULL(@VoidReason, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSignatureRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequest] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Signature Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequest] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: spUpdateSignatureRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSignatureRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequest]
    @ID uniqueidentifier,
    @SignatureAccountID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalEnvelopeID_Clear bit = 0,
    @ExternalEnvelopeID nvarchar(255) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(450) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @VoidReason_Clear bit = 0,
    @VoidReason nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequest]
    SET
        [SignatureAccountID] = ISNULL(@SignatureAccountID, [SignatureAccountID]),
        [Name] = ISNULL(@Name, [Name]),
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExternalEnvelopeID] = CASE WHEN @ExternalEnvelopeID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalEnvelopeID, [ExternalEnvelopeID]) END,
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [RecordID] = CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, [RecordID]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [VoidReason] = CASE WHEN @VoidReason_Clear = 1 THEN NULL ELSE ISNULL(@VoidReason, [VoidReason]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSignatureRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSignatureRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SignatureRequest table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSignatureRequest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSignatureRequest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSignatureRequest
ON [${flyway:defaultSchema}].[SignatureRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequest]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SignatureRequest] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Signature Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Signature Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Requests
-- Item: spDeleteSignatureRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSignatureRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SignatureRequest]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Signature Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequest] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: vwSignatureRequestDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Signature Request Documents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SignatureRequestDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSignatureRequestDocuments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSignatureRequestDocuments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSignatureRequestDocuments]
AS
SELECT
    s.*,
    MJSignatureRequest_SignatureRequestID.[Name] AS [SignatureRequest],
    MJArtifact_ArtifactID.[Name] AS [Artifact],
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[SignatureRequestDocument] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SignatureRequest] AS MJSignatureRequest_SignatureRequestID
  ON
    [s].[SignatureRequestID] = MJSignatureRequest_SignatureRequestID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Artifact] AS MJArtifact_ArtifactID
  ON
    [s].[ArtifactID] = MJArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_ArtifactVersionID
  ON
    [s].[ArtifactVersionID] = MJArtifactVersion_ArtifactVersionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequestDocuments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: Permissions for vwSignatureRequestDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSignatureRequestDocuments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: spCreateSignatureRequestDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SignatureRequestDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSignatureRequestDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequestDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSignatureRequestDocument]
    @ID uniqueidentifier = NULL,
    @SignatureRequestID uniqueidentifier,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Sequence int = NULL,
    @Role nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequestDocument]
            (
                [ID],
                [SignatureRequestID],
                [ArtifactID],
                [ArtifactVersionID],
                [Name],
                [Sequence],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SignatureRequestID,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                @Name,
                ISNULL(@Sequence, 1),
                ISNULL(@Role, 'Source')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SignatureRequestDocument]
            (
                [SignatureRequestID],
                [ArtifactID],
                [ArtifactVersionID],
                [Name],
                [Sequence],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SignatureRequestID,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                @Name,
                ISNULL(@Sequence, 1),
                ISNULL(@Role, 'Source')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSignatureRequestDocuments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequestDocument] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Signature Request Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSignatureRequestDocument] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: spUpdateSignatureRequestDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SignatureRequestDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSignatureRequestDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequestDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSignatureRequestDocument]
    @ID uniqueidentifier,
    @SignatureRequestID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Sequence int = NULL,
    @Role nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequestDocument]
    SET
        [SignatureRequestID] = ISNULL(@SignatureRequestID, [SignatureRequestID]),
        [ArtifactID] = CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, [ArtifactID]) END,
        [ArtifactVersionID] = CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, [ArtifactVersionID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Role] = ISNULL(@Role, [Role])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSignatureRequestDocuments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSignatureRequestDocuments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequestDocument] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SignatureRequestDocument table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSignatureRequestDocument]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSignatureRequestDocument];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSignatureRequestDocument
ON [${flyway:defaultSchema}].[SignatureRequestDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SignatureRequestDocument]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SignatureRequestDocument] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Signature Request Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSignatureRequestDocument] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Signature Request Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Signature Request Documents
-- Item: spDeleteSignatureRequestDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SignatureRequestDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSignatureRequestDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequestDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSignatureRequestDocument]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SignatureRequestDocument]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequestDocument] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Signature Request Documents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSignatureRequestDocument] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6b694fe-3781-4744-a329-b5da6551ca69' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'SignatureAccount')) BEGIN
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
            'd6b694fe-3781-4744-a329-b5da6551ca69',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100027,
            'SignatureAccount',
            'Signature Account',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7c4167b-0472-479f-bf34-dcc29d25e5a8' OR (EntityID = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4' AND Name = 'Entity')) BEGIN
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
            'c7c4167b-0472-479f-bf34-dcc29d25e5a8',
            'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', -- Entity: MJ: Signature Requests
            100028,
            'Entity',
            'Entity',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e461b212-c8ce-412d-bfbb-ae354bb22816' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'SignatureRequest')) BEGIN
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
            'e461b212-c8ce-412d-bfbb-ae354bb22816',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100019,
            'SignatureRequest',
            'Signature Request',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ca5248b-60c4-4ca0-b967-94bbe3edc162' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'Artifact')) BEGIN
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
            '7ca5248b-60c4-4ca0-b967-94bbe3edc162',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100020,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef3b6f24-3da4-4aad-9720-fefc1bdf9cc4' OR (EntityID = '975DFF8E-DAD8-44B6-9722-4D7B138A213F' AND Name = 'ArtifactVersion')) BEGIN
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
            'ef3b6f24-3da4-4aad-9720-fefc1bdf9cc4',
            '975DFF8E-DAD8-44B6-9722-4D7B138A213F', -- Entity: MJ: Signature Request Documents
            100021,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34f399f0-a74c-454a-a64b-385a3e89fc9b' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'SignatureProvider')) BEGIN
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
            '34f399f0-a74c-454a-a64b-385a3e89fc9b',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100025,
            'SignatureProvider',
            'Signature Provider',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10acca90-272e-4424-8c5c-b56ee86ff6ac' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'Credential')) BEGIN
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
            '10acca90-272e-4424-8c5c-b56ee86ff6ac',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100026,
            'Credential',
            'Credential',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d9459ef-1391-48fc-9c12-145fb18d2411' OR (EntityID = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B' AND Name = 'Company')) BEGIN
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
            '0d9459ef-1391-48fc-9c12-145fb18d2411',
            '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', -- Entity: MJ: Signature Accounts
            100027,
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f6f1bf1-64de-4330-ab2c-aa161eb9defc' OR (EntityID = '2EECC44E-A41F-4521-8C0E-764D4D68FF70' AND Name = 'SignatureRequest')) BEGIN
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
            '1f6f1bf1-64de-4330-ab2c-aa161eb9defc',
            '2EECC44E-A41F-4521-8C0E-764D4D68FF70', -- Entity: MJ: Signature Request Recipients
            100023,
            'SignatureRequest',
            'Signature Request',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a6b9f8a-6ed0-4617-9034-67dd097caccf' OR (EntityID = '224F170C-5FCC-41F2-906F-B82B30F1EB2A' AND Name = 'SignatureRequest')) BEGIN
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
            '8a6b9f8a-6ed0-4617-9034-67dd097caccf',
            '224F170C-5FCC-41F2-906F-B82B30F1EB2A', -- Entity: MJ: Signature Request Logs
            100019,
            'SignatureRequest',
            'Signature Request',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A845B64D-1D66-4ED6-9CE4-4C7BCAE26A8D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1078B446-E3DC-4A7E-8D46-288724B0A8BA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9659F0DD-ECEE-4804-9681-B91B8B215CF2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C0F7A466-A1E7-4856-AB2B-335756EC44D1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1BF29A02-9B42-4B60-B13B-8536C42E84E4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B335E776-2677-405C-BEB4-BC435C53AFE3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C9AAAE97-883F-4D9C-814E-183E2463C5F4'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B335E776-2677-405C-BEB4-BC435C53AFE3'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F9283E8E-7A9C-42AB-9D7F-2896B3C1A0F4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1A33CAC0-8579-4813-8941-80195A300AC5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E461B212-C8CE-412D-BFBB-AE354BB22816'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1A33CAC0-8579-4813-8941-80195A300AC5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E461B212-C8CE-412D-BFBB-AE354BB22816'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '1A33CAC0-8579-4813-8941-80195A300AC5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0DA669D4-15FA-4B9A-AB4D-0D2497166089'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4FFE69FD-3D6D-4A6A-8086-B1649C009553'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8E13825F-DFD5-482B-A4E1-D080C5B1C101'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D6B694FE-3781-4744-A329-B5DA6551CA69'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DAC6B9ED-A9B9-4861-8E41-1874CD520BE5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'DAC6B9ED-A9B9-4861-8E41-1874CD520BE5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7FBBB1A6-423A-4B6E-8127-490A272A81F2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '43AB0872-21F8-4BAC-B71A-0F72045DF11B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FFE370EF-0F9A-47B3-BD54-79D544824832'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '43AB0872-21F8-4BAC-B71A-0F72045DF11B'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '43AB0872-21F8-4BAC-B71A-0F72045DF11B'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EE9F7851-6ABB-442C-8E43-ABCBDA31A1AA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8D1F72D7-6D09-43A4-98CF-E35BA9F08957'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '4D12D760-F6BB-4EB2-82F4-13F518583D95'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FD0B6BE9-9152-4D05-AA8A-4186448EB827'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5B0443EA-FDD3-4DF3-A109-F436741DABB9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '34F399F0-A74C-454A-A64B-385A3E89FC9B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '756C442E-C593-4DAC-BEF8-A494CE2B1902'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '34F399F0-A74C-454A-A64B-385A3E89FC9B'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3BDA6373-6EC9-4C18-BD55-17D56B15BFD8'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '34F399F0-A74C-454A-A64B-385A3E89FC9B'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Signature Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73781F9B-7BE7-4CC9-9414-C21974AB2A11' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C9AAAE97-883F-4D9C-814E-183E2463C5F4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.ServerDriverKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B335E776-2677-405C-BEB4-BC435C53AFE3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A845B64D-1D66-4ED6-9CE4-4C7BCAE26A8D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1078B446-E3DC-4A7E-8D46-288724B0A8BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.RequiresOAuth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capabilities and Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requires OAuth',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9659F0DD-ECEE-4804-9681-B91B8B215CF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.SupportsTemplates 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capabilities and Security',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0F7A466-A1E7-4856-AB2B-335756EC44D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.SupportsEmbeddedSigning 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capabilities and Security',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BF29A02-9B42-4B60-B13B-8536C42E84E4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capabilities and Security',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D27B6AE3-E34B-42DC-9EB5-0B296FC9A934' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42DB4ADB-FB7B-49FB-9406-53931316F62A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D139B93-4FA1-4D9E-801D-84E55F301A03' AND AutoUpdateCategory = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '47EACABD-FCB9-4416-B275-763DE5377D3D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.SignatureRequestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02951200-7A4F-4455-A7E5-81B5C68B58B4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.SignatureRequest 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A6B9F8A-6ED0-4617-9034-67DD097CACCF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.Operation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B98F7E88-BADF-44E7-B02A-79D0DE1898EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7FBBB1A6-423A-4B6E-8127-490A272A81F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.StatusBefore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43AB0872-21F8-4BAC-B71A-0F72045DF11B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.StatusAfter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70E5D48F-97FC-4FF4-A427-01E8C9CFCEF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.Detail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'CAB58EA9-C662-4A83-B454-F57A4401576B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFE370EF-0F9A-47B3-BD54-79D544824832' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAAD8F2E-3E8A-4F3D-8833-F88713CD5A5F' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '224F170C-5FCC-41F2-906F-B82B30F1EB2A';

/* Set entity icon to fa fa-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1c9eb987-5000-4f9c-ba46-4b809c1d7c4e', '224F170C-5FCC-41F2-906F-B82B30F1EB2A', 'FieldCategoryInfo', '{"Request Context":{"icon":"fa fa-file-signature","description":"Links the log entry to the specific signature request"},"Operation Details":{"icon":"fa fa-cogs","description":"Information about the specific operation performed and its outcome"},"Status Tracking":{"icon":"fa fa-exchange-alt","description":"Tracks state changes before and after the operation"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('84551335-11b4-4f25-ad97-91e9ac61af41', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', 'FieldCategoryInfo', '{"Provider Configuration":{"icon":"fa fa-sliders-h","description":"Core identification, activation, and operational settings for the signature provider."},"Capabilities and Security":{"icon":"fa fa-shield-alt","description":"Functional capabilities, authentication requirements, and technical configuration parameters."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('aba268f4-dadd-4416-93c5-48d55d47ec14', '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2', 'FieldCategoryIcons', '{"Provider Configuration":"fa fa-sliders-h","Capabilities and Security":"fa fa-shield-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('efc38dc7-29f1-4ba5-bd03-a8da92149f29', '224F170C-5FCC-41F2-906F-B82B30F1EB2A', 'FieldCategoryIcons', '{"Request Context":"fa fa-file-signature","Operation Details":"fa fa-cogs","Status Tracking":"fa fa-exchange-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7EE4D69F-16F5-4DC1-9B02-B4AF7F8CA8D2';

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '224F170C-5FCC-41F2-906F-B82B30F1EB2A';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD2B8F16-0B5E-4752-B44B-F332A5530C56' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.SignatureRequestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E0FFC7BB-B143-4930-9EF3-08D5729C9C04' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.SignatureRequest 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E461B212-C8CE-412D-BFBB-AE354BB22816' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ArtifactID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C9FC86D8-0586-4B1F-A6B2-6088B02AED06' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Artifact 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CA5248B-60C4-4CA0-B967-94BBE3EDC162' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ArtifactVersionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Version',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E308445E-1AC1-42A5-B415-08F5974BE589' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ArtifactVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Version Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF3B6F24-3DA4-4AAD-9720-FEFC1BDF9CC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Document Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A206A8D1-DB54-49E2-A641-07D0A77A97C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9283E8E-7A9C-42AB-9D7F-2896B3C1A0F4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Document Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A33CAC0-8579-4813-8941-80195A300AC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '598CA112-9604-44A5-B218-79AC441E0DAE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '093B9AAC-B391-4BA5-B8FC-26AA0FADBF8C' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '975DFF8E-DAD8-44B6-9722-4D7B138A213F';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('654eac24-728a-4739-b5ad-a20f88f3f77e', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'FieldCategoryInfo', '{"Document Context":{"icon":"fa fa-link","description":"Links to parent signature requests and related document artifacts"},"Document Details":{"icon":"fa fa-file-alt","description":"Configuration details for the document including naming, ordering, and usage role"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0aec54c8-c3a7-410f-abb9-4783a0d172b2', '975DFF8E-DAD8-44B6-9722-4D7B138A213F', 'FieldCategoryIcons', '{"Document Context":"fa fa-link","Document Details":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '975DFF8E-DAD8-44B6-9722-4D7B138A213F';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EC4B6A3C-7D36-4C41-AF64-E20A04F2EB68' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.SignatureRequestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF34FF1F-3F9E-4A1B-997B-91BF0E8A628F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.SignatureRequest 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F6F1BF1-64DE-4330-AB2C-AA161EB9DEFC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '4D12D760-F6BB-4EB2-82F4-13F518583D95' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B87D1BDD-AD99-4C3A-83E4-811A1E389C11' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FF77BB5-7E61-449A-A81A-D97DAA86B6F5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.RoutingOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE9F7851-6ABB-442C-8E43-ABCBDA31A1AA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D1F72D7-6D09-43A4-98CF-E35BA9F08957' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.SignedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4552BDCA-0879-4A14-B1C0-B50CB5F84DBD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.ExternalRecipientID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9DD840B9-BEF5-454B-AB7D-6461EC604235' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A99A826-45B6-4F2E-BFFC-71C30C979F0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29560860-F17B-4E0D-A317-716F4820C1DD' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-envelope-open-text */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-envelope-open-text', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '2EECC44E-A41F-4521-8C0E-764D4D68FF70';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9a98f354-b7b4-4ddb-9eb4-a37e150fceeb', '2EECC44E-A41F-4521-8C0E-764D4D68FF70', 'FieldCategoryInfo', '{"Recipient Information":{"icon":"fa fa-user","description":"Basic contact details and assigned roles for the recipient"},"Workflow Settings":{"icon":"fa fa-tasks","description":"Signing order, status tracking, and provider integration details"},"Request Association":{"icon":"fa fa-link","description":"Linkages to the parent signature request entity"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('adb8153d-36df-4e4c-aaa7-64b14b271f42', '2EECC44E-A41F-4521-8C0E-764D4D68FF70', 'FieldCategoryIcons', '{"Recipient Information":"fa fa-user","Workflow Settings":"fa fa-tasks","Request Association":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '2EECC44E-A41F-4521-8C0E-764D4D68FF70';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Signature Requests.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E71C719C-20F1-4EDE-A4BB-1A05AD3F56B2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.SignatureAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04A2EDE7-1528-48B6-97E0-E7BFCD7C92D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.SignatureAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6B694FE-3781-4744-A329-B5DA6551CA69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D33A8958-5A04-45BA-9B70-F84881E2CF0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '875FD874-C53F-41E5-9CDB-2D6468973073' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DA669D4-15FA-4B9A-AB4D-0D2497166089' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.ExternalEnvelopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DAC6B9ED-A9B9-4861-8E41-1874CD520BE5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.VoidReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Request Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '947E3EA5-772D-4782-98B9-AEEFC2394FA4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Records',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B70D9FE2-0F70-4BAB-B61E-AC46BC496BF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Records',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7C4167B-0472-479F-BF34-DCC29D25E5A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Records',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FD94D7A-1FA7-44D4-94FB-935431801E0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.SentAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FFE69FD-3D6D-4A6A-8086-B1649C009553' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E13825F-DFD5-482B-A4E1-D080C5B1C101' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '36B6703C-96C3-4156-8502-F47DD0769744' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64CA6956-B996-497E-BB2B-DC3376C4A704' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3099f3fa-c903-4ac0-9c1d-552991834fd6', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'FieldCategoryInfo', '{"Request Details":{"icon":"fa fa-info-circle","description":"Core information about the signature request and account"},"Request Status":{"icon":"fa fa-tasks","description":"Lifecycle status and external provider tracking information"},"Related Records":{"icon":"fa fa-link","description":"Links to the originating business records"},"Timeline":{"icon":"fa fa-clock","description":"Key event timestamps for the request lifecycle"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4c60fbb5-8595-49cb-af53-1018240f01d9', 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4', 'FieldCategoryIcons', '{"Request Details":"fa fa-info-circle","Request Status":"fa fa-tasks","Related Records":"fa fa-link","Timeline":"fa fa-clock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A3B3DFEB-FFCA-4F8D-B497-3D2E7FBB02A4';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Signature Accounts.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E7B15DC2-CBD6-431B-AB23-BE119EE54926' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3BDA6373-6EC9-4C18-BD55-17D56B15BFD8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.SignatureProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Provider',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40A3F0B5-F4FC-43E0-94EE-BC85ED6AF7A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE88E0AF-24A9-4CC8-B3E7-27FABF2AD78B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B86C37B-47AB-4715-A239-1B072CB79FC1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD0B6BE9-9152-4D05-AA8A-4186448EB827' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B0443EA-FDD3-4DF3-A109-F436741DABB9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.DefaultFromName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sender Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '756C442E-C593-4DAC-BEF8-A494CE2B1902' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.DefaultFromEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sender Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '931BE8E0-2AD1-485E-87D3-ED8CB3B41E6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B708D886-EF4A-4E60-9E8C-83200BEE3939' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.SignatureProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Provider Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34F399F0-A74C-454A-A64B-385A3E89FC9B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Credential 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '10ACCA90-272E-4424-8C5C-B56EE86FF6AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D9459EF-1391-48FC-9C12-145FB18D2411' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E16D1554-36C3-477E-9CD5-524B802191D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D9620E6-6074-49B7-98F6-02B347E7F913' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b75d6f57-f87f-423a-8d14-9496210c0b0d', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'FieldCategoryInfo', '{"Account Details":{"icon":"fa fa-info-circle","description":"Basic identification and naming information for the signature account."},"Account Configuration":{"icon":"fa fa-cogs","description":"Technical settings, provider links, and JSON configuration overrides."},"Account Status":{"icon":"fa fa-check-circle","description":"Operational status and default settings for the account."},"Sender Settings":{"icon":"fa fa-envelope","description":"Default identity information used when sending envelopes."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2d497758-0a56-4611-aac0-c5ea9f8f2260', '43E3F77A-C2B3-4672-A53F-4FF28A0C098B', 'FieldCategoryIcons', '{"Account Details":"fa fa-info-circle","Account Configuration":"fa fa-cogs","Account Status":"fa fa-check-circle","Sender Settings":"fa fa-envelope","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '43E3F77A-C2B3-4672-A53F-4FF28A0C098B';

