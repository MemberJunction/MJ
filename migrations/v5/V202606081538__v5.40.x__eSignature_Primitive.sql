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
    Title               NVARCHAR(255)    NOT NULL,
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
    @level2type = N'COLUMN', @level2name = N'Title';

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









































































/*---------------------------------------------------CODEGEN--------------------------------------------------*/
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
         'dd777444-c381-412f-919c-d0198fe4b54c',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'dd777444-c381-412f-919c-d0198fe4b54c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('dd777444-c381-412f-919c-d0198fe4b54c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('dd777444-c381-412f-919c-d0198fe4b54c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('dd777444-c381-412f-919c-d0198fe4b54c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '64408373-0375-47bf-965f-eb6fad41d8e4',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '64408373-0375-47bf-965f-eb6fad41d8e4', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('64408373-0375-47bf-965f-eb6fad41d8e4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('64408373-0375-47bf-965f-eb6fad41d8e4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Accounts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('64408373-0375-47bf-965f-eb6fad41d8e4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '0075dbdf-fd00-4568-a7ac-03fdbf55d329',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0075dbdf-fd00-4568-a7ac-03fdbf55d329', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Requests for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0075dbdf-fd00-4568-a7ac-03fdbf55d329', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Requests for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0075dbdf-fd00-4568-a7ac-03fdbf55d329', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Requests for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0075dbdf-fd00-4568-a7ac-03fdbf55d329', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '54571136-d2f3-4ded-9a0e-2d9b6dd7e1be',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '54571136-d2f3-4ded-9a0e-2d9b6dd7e1be', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('54571136-d2f3-4ded-9a0e-2d9b6dd7e1be', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('54571136-d2f3-4ded-9a0e-2d9b6dd7e1be', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Documents for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('54571136-d2f3-4ded-9a0e-2d9b6dd7e1be', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'c15fe41e-040e-4a35-9f27-7a07dfd2f75a',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c15fe41e-040e-4a35-9f27-7a07dfd2f75a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c15fe41e-040e-4a35-9f27-7a07dfd2f75a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c15fe41e-040e-4a35-9f27-7a07dfd2f75a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Recipients for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c15fe41e-040e-4a35-9f27-7a07dfd2f75a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'f9f6f8c8-a29f-42a2-a64e-15ee43098252',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f9f6f8c8-a29f-42a2-a64e-15ee43098252', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f9f6f8c8-a29f-42a2-a64e-15ee43098252', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f9f6f8c8-a29f-42a2-a64e-15ee43098252', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Signature Request Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f9f6f8c8-a29f-42a2-a64e-15ee43098252', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cf9200e-149f-4763-9d47-6c6ca7310099' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'ID')) BEGIN
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
            '5cf9200e-149f-4763-9d47-6c6ca7310099',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4e1bf49-f90c-4f31-bfcf-c5049b6bd445' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'SignatureAccountID')) BEGIN
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
            'e4e1bf49-f90c-4f31-bfcf-c5049b6bd445',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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
            '64408373-0375-47BF-965F-EB6FAD41D8E4',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37b8e7c1-c70b-4414-a18c-2b18c0d36245' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'Title')) BEGIN
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
            '37b8e7c1-c70b-4414-a18c-2b18c0d36245',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
            100003,
            'Title',
            'Title',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a61d503-86b2-4f87-8cfe-a65cc0142b77' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'Message')) BEGIN
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
            '3a61d503-86b2-4f87-8cfe-a65cc0142b77',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3df07a6f-c4e3-4d8e-96d0-710b3a45799b' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'Status')) BEGIN
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
            '3df07a6f-c4e3-4d8e-96d0-710b3a45799b',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '772866a6-fbe7-47f1-bdea-e7dccc8f278d' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'ExternalEnvelopeID')) BEGIN
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
            '772866a6-fbe7-47f1-bdea-e7dccc8f278d',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e51828e6-3866-42ca-a0f8-3cc7d72112ba' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'EntityID')) BEGIN
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
            'e51828e6-3866-42ca-a0f8-3cc7d72112ba',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d9e98c6-c2c7-48e0-8c46-7f57eda49d61' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'RecordID')) BEGIN
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
            '1d9e98c6-c2c7-48e0-8c46-7f57eda49d61',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7075d0c0-55c6-430a-8c62-2cd828f90f64' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'SentAt')) BEGIN
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
            '7075d0c0-55c6-430a-8c62-2cd828f90f64',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1ea675c-dc91-4f60-bd99-a3d920b44f2d' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'CompletedAt')) BEGIN
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
            'e1ea675c-dc91-4f60-bd99-a3d920b44f2d',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6839cd3d-d30a-4bad-a82c-c36671f91286' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'VoidReason')) BEGIN
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
            '6839cd3d-d30a-4bad-a82c-c36671f91286',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29fcd07c-2978-4f44-9196-e1add2724191' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = '__mj_CreatedAt')) BEGIN
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
            '29fcd07c-2978-4f44-9196-e1add2724191',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5eef5ad3-92c4-4b4b-84d5-a903699b08f2' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5eef5ad3-92c4-4b4b-84d5-a903699b08f2',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0e62ff7-5fbb-4ff9-92e9-4f437a318b33' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'ID')) BEGIN
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
            'a0e62ff7-5fbb-4ff9-92e9-4f437a318b33',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6564503a-9231-4069-a8a4-c53856e48e55' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'SignatureRequestID')) BEGIN
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
            '6564503a-9231-4069-a8a4-c53856e48e55',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e9e0448-51d7-4693-97af-84d753a101fe' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'Operation')) BEGIN
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
            '1e9e0448-51d7-4693-97af-84d753a101fe',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '510c984f-0c7e-4e5e-9185-2bb29cc61d27' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'Success')) BEGIN
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
            '510c984f-0c7e-4e5e-9185-2bb29cc61d27',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c2a198b-ed52-469a-8a4b-7821e9c01d65' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'StatusBefore')) BEGIN
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
            '6c2a198b-ed52-469a-8a4b-7821e9c01d65',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '12b3ec2b-843a-4b89-a51b-b4fd5aa16451' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'StatusAfter')) BEGIN
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
            '12b3ec2b-843a-4b89-a51b-b4fd5aa16451',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fd41107-427b-413f-a69e-3f161aba3444' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = 'Detail')) BEGIN
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
            '6fd41107-427b-413f-a69e-3f161aba3444',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1be6013e-c6fb-4a86-aaa7-12ecc1769c76' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1be6013e-c6fb-4a86-aaa7-12ecc1769c76',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93875f79-4ff6-451c-95a9-244443938600' OR (EntityID = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '93875f79-4ff6-451c-95a9-244443938600',
            'F9F6F8C8-A29F-42A2-A64E-15EE43098252', -- Entity: MJ: Signature Request Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b8af4a8-bd9c-430f-8dd5-d123d3fcfb45' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'ID')) BEGIN
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
            '0b8af4a8-bd9c-430f-8dd5-d123d3fcfb45',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd233c1b-0616-46d6-ad62-9662641cd732' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'SignatureRequestID')) BEGIN
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
            'cd233c1b-0616-46d6-ad62-9662641cd732',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fa45fd9-aaae-4fca-847c-874454f13221' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'ArtifactID')) BEGIN
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
            '5fa45fd9-aaae-4fca-847c-874454f13221',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a6b914f-55ed-4684-8266-e34178b42967' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'ArtifactVersionID')) BEGIN
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
            '0a6b914f-55ed-4684-8266-e34178b42967',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a59d086-c037-414d-a727-8a307952d2a7' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'Name')) BEGIN
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
            '4a59d086-c037-414d-a727-8a307952d2a7',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8745e83c-ac66-4415-96a0-79e5b862e531' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'Sequence')) BEGIN
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
            '8745e83c-ac66-4415-96a0-79e5b862e531',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e8002a7-f705-4211-8a53-539e42089999' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'Role')) BEGIN
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
            '1e8002a7-f705-4211-8a53-539e42089999',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '514f8cc5-5607-4e8b-8603-1cfeb647a26c' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = '__mj_CreatedAt')) BEGIN
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
            '514f8cc5-5607-4e8b-8603-1cfeb647a26c',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '153bde51-2dee-4c6e-af5b-cdd21e8ed80e' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '153bde51-2dee-4c6e-af5b-cdd21e8ed80e',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbeba8e4-eda3-4942-9087-8b9bfc42fa18' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'ID')) BEGIN
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
            'bbeba8e4-eda3-4942-9087-8b9bfc42fa18',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0911186-46dd-4a61-99ed-0bd9c5b574b7' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'SignatureRequestID')) BEGIN
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
            'b0911186-46dd-4a61-99ed-0bd9c5b574b7',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67df9f72-d46d-47cf-9a0d-629e5200c269' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'Email')) BEGIN
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
            '67df9f72-d46d-47cf-9a0d-629e5200c269',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3abc4a50-d368-4894-abdd-1319eef7741c' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'Name')) BEGIN
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
            '3abc4a50-d368-4894-abdd-1319eef7741c',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7754d06e-d2ed-4f26-b1ae-d44f74fef59c' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'RoutingOrder')) BEGIN
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
            '7754d06e-d2ed-4f26-b1ae-d44f74fef59c',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '692e65d6-12f5-4dfa-a562-509f6a40d3aa' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'Role')) BEGIN
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
            '692e65d6-12f5-4dfa-a562-509f6a40d3aa',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05440883-e497-4e32-8ed6-52a830b1e2c2' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'Status')) BEGIN
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
            '05440883-e497-4e32-8ed6-52a830b1e2c2',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8606b69f-c70a-43b2-8a49-33f5e475558a' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'SignedAt')) BEGIN
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
            '8606b69f-c70a-43b2-8a49-33f5e475558a',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aba7abe6-37be-404d-a22e-251cc57d45c8' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = 'ExternalRecipientID')) BEGIN
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
            'aba7abe6-37be-404d-a22e-251cc57d45c8',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1998e813-feef-4062-8e9c-b34175be55bb' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1998e813-feef-4062-8e9c-b34175be55bb',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7452445d-e4d0-46e1-841a-c88ad1288ced' OR (EntityID = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7452445d-e4d0-46e1-841a-c88ad1288ced',
            'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', -- Entity: MJ: Signature Request Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0927c056-519c-48e6-866b-047a5ed9499a' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'ID')) BEGIN
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
            '0927c056-519c-48e6-866b-047a5ed9499a',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87064008-5e47-4659-a56d-074ffe872040' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'Name')) BEGIN
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
            '87064008-5e47-4659-a56d-074ffe872040',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '736140cc-d13d-49f9-8b98-8e0e3ba2ec89' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'ServerDriverKey')) BEGIN
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
            '736140cc-d13d-49f9-8b98-8e0e3ba2ec89',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5929f62-f5f1-47fb-9a60-16afc3fd8094' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'IsActive')) BEGIN
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
            'a5929f62-f5f1-47fb-9a60-16afc3fd8094',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95374ea7-57ce-4980-bc32-bf11ebc2502d' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'Priority')) BEGIN
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
            '95374ea7-57ce-4980-bc32-bf11ebc2502d',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a256d1fc-c259-4c84-b9ab-abb311282206' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'RequiresOAuth')) BEGIN
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
            'a256d1fc-c259-4c84-b9ab-abb311282206',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78e093bf-733c-4535-8cea-83b4d4ef8f02' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'SupportsTemplates')) BEGIN
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
            '78e093bf-733c-4535-8cea-83b4d4ef8f02',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe939e74-dac6-4a31-a9e3-5fb43ab79fc5' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'SupportsEmbeddedSigning')) BEGIN
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
            'fe939e74-dac6-4a31-a9e3-5fb43ab79fc5',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1220c4d-0fa7-456c-8fa8-3d6eaef75baa' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = 'Configuration')) BEGIN
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
            'a1220c4d-0fa7-456c-8fa8-3d6eaef75baa',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7ec73de-c1c7-4b1b-a7c7-227ea3b21888' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f7ec73de-c1c7-4b1b-a7c7-227ea3b21888',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '714e3cad-cf29-4ec9-826e-9da3e6df66b7' OR (EntityID = 'DD777444-C381-412F-919C-D0198FE4B54C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '714e3cad-cf29-4ec9-826e-9da3e6df66b7',
            'DD777444-C381-412F-919C-D0198FE4B54C', -- Entity: MJ: Signature Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '422fdbb2-1b12-4a5d-ba3c-33c81d0a7ff2' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'ID')) BEGIN
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
            '422fdbb2-1b12-4a5d-ba3c-33c81d0a7ff2',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e929af02-4d40-45c0-bc62-285b6cfadbe8' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'Name')) BEGIN
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
            'e929af02-4d40-45c0-bc62-285b6cfadbe8',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8cea1d11-3650-49eb-811d-8bc5d7f184fc' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'SignatureProviderID')) BEGIN
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
            '8cea1d11-3650-49eb-811d-8bc5d7f184fc',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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
            'DD777444-C381-412F-919C-D0198FE4B54C',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4165153-5bea-4f75-a73c-e1119bbdcbf2' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'CredentialID')) BEGIN
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
            'a4165153-5bea-4f75-a73c-e1119bbdcbf2',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '560eb704-35ad-4bcb-8e8d-02e747a70aa7' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'CompanyID')) BEGIN
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
            '560eb704-35ad-4bcb-8e8d-02e747a70aa7',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ecd64234-0d63-4079-adad-d0e41a00e9dd' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'IsActive')) BEGIN
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
            'ecd64234-0d63-4079-adad-d0e41a00e9dd',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '712d95cc-8ab4-43f2-80b1-8482d7daaba1' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'IsDefault')) BEGIN
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
            '712d95cc-8ab4-43f2-80b1-8482d7daaba1',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0fc620ee-b884-4cd3-ab4e-4a9ab294092a' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'DefaultFromName')) BEGIN
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
            '0fc620ee-b884-4cd3-ab4e-4a9ab294092a',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64eed22f-74ce-4f67-9fef-88975844c1a8' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'DefaultFromEmail')) BEGIN
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
            '64eed22f-74ce-4f67-9fef-88975844c1a8',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c175f6d-c44d-471c-a275-c624c91cbe53' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'Configuration')) BEGIN
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
            '2c175f6d-c44d-471c-a275-c624c91cbe53',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f07b04f-b520-4946-8254-a23e225597ab' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6f07b04f-b520-4946-8254-a23e225597ab',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9bcb7b9-235a-4c89-bd5c-2046429695b5' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'b9bcb7b9-235a-4c89-bd5c-2046429695b5',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

/* SQL text to insert entity field value with ID 2ef06f73-bcc8-439d-85c5-44f0f80b4bf2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2ef06f73-bcc8-439d-85c5-44f0f80b4bf2', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8900d547-bd9d-4be0-82a1-a1f527607645 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8900d547-bd9d-4be0-82a1-a1f527607645', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 2, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 603c91ae-beba-4751-bb29-41e29cf2fa65 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('603c91ae-beba-4751-bb29-41e29cf2fa65', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 3, 'Delivered', 'Delivered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ff31ea00-d4ca-4014-99f2-bdfc1df48c07 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff31ea00-d4ca-4014-99f2-bdfc1df48c07', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 4, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 95010442-645b-43b0-bee2-3da6953203fa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('95010442-645b-43b0-bee2-3da6953203fa', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 5, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 49b23e1c-b522-4c75-8720-93a37014656e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('49b23e1c-b522-4c75-8720-93a37014656e', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 6, 'Signed', 'Signed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a28ac8d1-09fc-49a0-8675-6f2f950f5981 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a28ac8d1-09fc-49a0-8675-6f2f950f5981', '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B', 7, 'Voided', 'Voided', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3DF07A6F-C4E3-4D8E-96D0-710B3A45799B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3DF07A6F-C4E3-4D8E-96D0-710B3A45799B';

/* SQL text to insert entity field value with ID d3ca4a47-3d35-49b4-a07a-ef92a4e70ca3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3ca4a47-3d35-49b4-a07a-ef92a4e70ca3', '1E8002A7-F705-4211-8A53-539E42089999', 1, 'Signed', 'Signed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1745cc2e-8aaf-4f10-85d8-f12a237f6c1c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1745cc2e-8aaf-4f10-85d8-f12a237f6c1c', '1E8002A7-F705-4211-8A53-539E42089999', 2, 'Source', 'Source', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1E8002A7-F705-4211-8A53-539E42089999 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1E8002A7-F705-4211-8A53-539E42089999';

/* SQL text to insert entity field value with ID 7994f62e-170f-435a-a9a8-de96d3375175 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7994f62e-170f-435a-a9a8-de96d3375175', '05440883-E497-4E32-8ED6-52A830B1E2C2', 1, 'Created', 'Created', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5d7650bf-fb6a-4687-a202-7089555f227b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5d7650bf-fb6a-4687-a202-7089555f227b', '05440883-E497-4E32-8ED6-52A830B1E2C2', 2, 'Declined', 'Declined', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1d5c1a1e-1588-44d6-ba07-61b623b9f276 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d5c1a1e-1588-44d6-ba07-61b623b9f276', '05440883-E497-4E32-8ED6-52A830B1E2C2', 3, 'Delivered', 'Delivered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ededeaee-bd79-4c13-b6bb-6cfe7475da28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ededeaee-bd79-4c13-b6bb-6cfe7475da28', '05440883-E497-4E32-8ED6-52A830B1E2C2', 4, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 27ba0c7d-5adc-4478-8227-b5dedb6a3cfa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('27ba0c7d-5adc-4478-8227-b5dedb6a3cfa', '05440883-E497-4E32-8ED6-52A830B1E2C2', 5, 'Signed', 'Signed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 05440883-E497-4E32-8ED6-52A830B1E2C2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='05440883-E497-4E32-8ED6-52A830B1E2C2';


/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Logs (One To Many via SignatureRequestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5884b2ec-8f9e-4576-98c7-4ad426c7e471'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5884b2ec-8f9e-4576-98c7-4ad426c7e471', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', 'F9F6F8C8-A29F-42A2-A64E-15EE43098252', 'SignatureRequestID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Documents (One To Many via SignatureRequestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '612eef9c-ddf0-4a9d-81f3-1fa70fe7e59e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('612eef9c-ddf0-4a9d-81f3-1fa70fe7e59e', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', 'SignatureRequestID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Signature Requests -> MJ: Signature Request Recipients (One To Many via SignatureRequestID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0d41a323-964e-4de1-a849-582ab51f5901'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0d41a323-964e-4de1-a849-582ab51f5901', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', 'SignatureRequestID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ: Signature Accounts (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '03957182-91ea-45ec-8ce3-e6c810c99df3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('03957182-91ea-45ec-8ce3-e6c810c99df3', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '64408373-0375-47BF-965F-EB6FAD41D8E4', 'CompanyID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Signature Requests (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9704872b-6a17-4d82-855f-0cda023ba618'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9704872b-6a17-4d82-855f-0cda023ba618', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', 'EntityID', 'One To Many', 1, 1, 62, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifacts -> MJ: Signature Request Documents (One To Many via ArtifactID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '25b5cef3-4d21-4f0e-940e-4be1abceb8bd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('25b5cef3-4d21-4f0e-940e-4be1abceb8bd', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', 'ArtifactID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Credentials -> MJ: Signature Accounts (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c45b78e1-17f4-4357-b5cf-e2b58ee3208e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c45b78e1-17f4-4357-b5cf-e2b58ee3208e', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '64408373-0375-47BF-965F-EB6FAD41D8E4', 'CredentialID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Signature Providers -> MJ: Signature Accounts (One To Many via SignatureProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '41d26906-16d1-4def-b177-34ff5184e52b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('41d26906-16d1-4def-b177-34ff5184e52b', 'DD777444-C381-412F-919C-D0198FE4B54C', '64408373-0375-47BF-965F-EB6FAD41D8E4', 'SignatureProviderID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifact Versions -> MJ: Signature Request Documents (One To Many via ArtifactVersionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a404459c-05d4-479e-aa3f-c54b41913139'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a404459c-05d4-479e-aa3f-c54b41913139', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', 'ArtifactVersionID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Signature Accounts -> MJ: Signature Requests (One To Many via SignatureAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0621c92d-eeea-47ba-a79c-18b849613cd8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0621c92d-eeea-47ba-a79c-18b849613cd8', '64408373-0375-47BF-965F-EB6FAD41D8E4', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', 'SignatureAccountID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 8CEA1D11-3650-49EB-811D-8BC5D7F184FC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8CEA1D11-3650-49EB-811D-8BC5D7F184FC', @RelatedEntityNameFieldMap='SignatureProvider';

/* SQL text to update entity field related entity name field map for entity field ID A4165153-5BEA-4F75-A73C-E1119BBDCBF2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A4165153-5BEA-4F75-A73C-E1119BBDCBF2', @RelatedEntityNameFieldMap='Credential';

/* SQL text to update entity field related entity name field map for entity field ID 560EB704-35AD-4BCB-8E8D-02E747A70AA7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='560EB704-35AD-4BCB-8E8D-02E747A70AA7', @RelatedEntityNameFieldMap='Company';

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

/* SQL text to update entity field related entity name field map for entity field ID 5FA45FD9-AAAE-4FCA-847C-874454F13221 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5FA45FD9-AAAE-4FCA-847C-874454F13221', @RelatedEntityNameFieldMap='Artifact';

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

/* SQL text to update entity field related entity name field map for entity field ID E4E1BF49-F90C-4F31-BFCF-C5049B6BD445 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E4E1BF49-F90C-4F31-BFCF-C5049B6BD445', @RelatedEntityNameFieldMap='SignatureAccount';

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
    s.*
FROM
    [${flyway:defaultSchema}].[SignatureRequestLog] AS s
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
    s.*
FROM
    [${flyway:defaultSchema}].[SignatureRequestRecipient] AS s
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

/* SQL text to update entity field related entity name field map for entity field ID E51828E6-3866-42CA-A0F8-3CC7D72112BA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E51828E6-3866-42CA-A0F8-3CC7D72112BA', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 0A6B914F-55ED-4684-8266-E34178B42967 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0A6B914F-55ED-4684-8266-E34178B42967', @RelatedEntityNameFieldMap='ArtifactVersion';

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
    @Title nvarchar(255),
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
                [Title],
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
                @Title,
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
                [Title],
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
                @Title,
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
    @Title nvarchar(255) = NULL,
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
        [Title] = ISNULL(@Title, [Title]),
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
    MJArtifact_ArtifactID.[Name] AS [Artifact],
    MJArtifactVersion_ArtifactVersionID.[Name] AS [ArtifactVersion]
FROM
    [${flyway:defaultSchema}].[SignatureRequestDocument] AS s
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7de20e0-12b6-4105-ba3d-6a0e97db7b75' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'SignatureAccount')) BEGIN
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
            'd7de20e0-12b6-4105-ba3d-6a0e97db7b75',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db5436ac-78f5-4b2d-acb0-408c8fb37f6c' OR (EntityID = '0075DBDF-FD00-4568-A7AC-03FDBF55D329' AND Name = 'Entity')) BEGIN
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
            'db5436ac-78f5-4b2d-acb0-408c8fb37f6c',
            '0075DBDF-FD00-4568-A7AC-03FDBF55D329', -- Entity: MJ: Signature Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dca03b76-895d-481f-ba81-10b13fbce0a3' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'Artifact')) BEGIN
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
            'dca03b76-895d-481f-ba81-10b13fbce0a3',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
            100019,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64280299-21d3-4c3a-a089-1d46e08075fd' OR (EntityID = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE' AND Name = 'ArtifactVersion')) BEGIN
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
            '64280299-21d3-4c3a-a089-1d46e08075fd',
            '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', -- Entity: MJ: Signature Request Documents
            100020,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '776f45a5-3475-44f6-9789-5eb70acef0ca' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'SignatureProvider')) BEGIN
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
            '776f45a5-3475-44f6-9789-5eb70acef0ca',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b58ab39e-29eb-43db-b092-305a9a13eb42' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'Credential')) BEGIN
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
            'b58ab39e-29eb-43db-b092-305a9a13eb42',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0feac7ed-4328-4d76-8cc6-998f4a79b5eb' OR (EntityID = '64408373-0375-47BF-965F-EB6FAD41D8E4' AND Name = 'Company')) BEGIN
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
            '0feac7ed-4328-4d76-8cc6-998f4a79b5eb',
            '64408373-0375-47BF-965F-EB6FAD41D8E4', -- Entity: MJ: Signature Accounts
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8745E83C-AC66-4415-96A0-79E5B862E531'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1E8002A7-F705-4211-8A53-539E42089999'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1E8002A7-F705-4211-8A53-539E42089999'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '4A59D086-C037-414D-A727-8A307952D2A7'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '1E8002A7-F705-4211-8A53-539E42089999'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '736140CC-D13D-49F9-8B98-8E0E3BA2EC89'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A5929F62-F5F1-47FB-9A60-16AFC3FD8094'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '95374EA7-57CE-4980-BC32-BF11EBC2502D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '736140CC-D13D-49F9-8B98-8E0E3BA2EC89'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '87064008-5E47-4659-A56D-074FFE872040'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '736140CC-D13D-49F9-8B98-8E0E3BA2EC89'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '67DF9F72-D46D-47CF-9A0D-629E5200C269'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '67DF9F72-D46D-47CF-9A0D-629E5200C269'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7754D06E-D2ED-4F26-B1AE-D44F74FEF59C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '05440883-E497-4E32-8ED6-52A830B1E2C2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '67DF9F72-D46D-47CF-9A0D-629E5200C269'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '692E65D6-12F5-4DFA-A562-509F6A40D3AA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ABA7ABE6-37BE-404D-A22E-251CC57D45C8'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3ABC4A50-D368-4894-ABDD-1319EEF7741C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '67DF9F72-D46D-47CF-9A0D-629E5200C269'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '692E65D6-12F5-4DFA-A562-509F6A40D3AA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'ABA7ABE6-37BE-404D-A22E-251CC57D45C8'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '37B8E7C1-C70B-4414-A18C-2B18C0D36245'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '37B8E7C1-C70B-4414-A18C-2B18C0D36245'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7075D0C0-55C6-430A-8C62-2CD828F90F64'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E1EA675C-DC91-4F60-BD99-A3D920B44F2D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '37B8E7C1-C70B-4414-A18C-2B18C0D36245'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '772866A6-FBE7-47F1-BDEA-E7DCCC8F278D'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6839CD3D-D30A-4BAD-A82C-C36671F91286'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '37B8E7C1-C70B-4414-A18C-2B18C0D36245'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '772866A6-FBE7-47F1-BDEA-E7DCCC8F278D'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '1E9E0448-51D7-4693-97AF-84D753A101FE'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1E9E0448-51D7-4693-97AF-84D753A101FE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '510C984F-0C7E-4E5E-9185-2BB29CC61D27'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6C2A198B-ED52-469A-8A4B-7821E9C01D65'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '12B3EC2B-843A-4B89-A51B-B4FD5AA16451'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1BE6013E-C6FB-4A86-AAA7-12ECC1769C76'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1E9E0448-51D7-4693-97AF-84D753A101FE'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C2A198B-ED52-469A-8A4B-7821E9C01D65'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '12B3EC2B-843A-4B89-A51B-B4FD5AA16451'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6FD41107-427B-413F-A69E-3F161ABA3444'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1E9E0448-51D7-4693-97AF-84D753A101FE'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '6C2A198B-ED52-469A-8A4B-7821E9C01D65'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '12B3EC2B-843A-4B89-A51B-B4FD5AA16451'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ECD64234-0D63-4079-ADAD-D0E41A00E9DD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '712D95CC-8AB4-43F2-80B1-8482D7DAABA1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '776F45A5-3475-44F6-9789-5EB70ACEF0CA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0FEAC7ED-4328-4D76-8CC6-998F4A79B5EB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0FC620EE-B884-4CD3-AB4E-4A9AB294092A'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64EED22F-74CE-4F67-9FEF-88975844C1A8'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '776F45A5-3475-44F6-9789-5EB70ACEF0CA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0FEAC7ED-4328-4D76-8CC6-998F4A79B5EB'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E929AF02-4D40-45C0-BC62-285B6CFADBE8'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '776F45A5-3475-44F6-9789-5EB70ACEF0CA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0FEAC7ED-4328-4D76-8CC6-998F4A79B5EB'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0FC620EE-B884-4CD3-AB4E-4A9AB294092A'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '64EED22F-74CE-4F67-9FEF-88975844C1A8'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B8AF4A8-BD9C-430F-8DD5-D123D3FCFB45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.SignatureRequestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signature Request',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD233C1B-0616-46D6-AD62-9662641CD732' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ArtifactID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Reference',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FA45FD9-AAAE-4FCA-847C-874454F13221' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ArtifactVersionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Reference',
   GeneratedFormSection = 'Category',
   DisplayName = 'Artifact Version',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A6B914F-55ED-4684-8266-E34178B42967' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Document Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A59D086-C037-414D-A727-8A307952D2A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8745E83C-AC66-4415-96A0-79E5B862E531' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Document Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E8002A7-F705-4211-8A53-539E42089999' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '514F8CC5-5607-4E8B-8603-1CFEB647A26C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '153BDE51-2DEE-4C6E-AF5B-CDD21E8ED80E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.Artifact 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Reference',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCA03B76-895D-481F-BA81-10B13FBCE0A3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Documents.ArtifactVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Artifact Reference',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64280299-21D3-4C3A-A089-1D46E08075FD' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6674b6a0-0c72-49af-b03d-23feb93b72b5', '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', 'FieldCategoryInfo', '{"Signature Request":{"icon":"fa fa-envelope-open-text","description":"Fields that associate the document with its signature request envelope"},"Artifact Reference":{"icon":"fa fa-file-alt","description":"Identifiers linking to the underlying artifact and its specific version"},"Document Details":{"icon":"fa fa-file","description":"Core information about the document such as name, order and role in the signing process"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('19536c3a-1d2f-4b31-8c31-888fe01e018e', '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE', 'FieldCategoryIcons', '{"Signature Request":"fa fa-envelope-open-text","Artifact Reference":"fa fa-file-alt","Document Details":"fa fa-file","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '54571136-D2F3-4DED-9A0E-2D9B6DD7E1BE';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Signature Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0927C056-519C-48E6-866B-047A5ED9499A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87064008-5E47-4659-A56D-074FFE872040' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.ServerDriverKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '736140CC-D13D-49F9-8B98-8E0E3BA2EC89' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Availability',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A5929F62-F5F1-47FB-9A60-16AFC3FD8094' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Availability',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95374EA7-57CE-4980-BC32-BF11EBC2502D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.RequiresOAuth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requires OAuth',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A256D1FC-C259-4C84-B9AB-ABB311282206' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.SupportsTemplates 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78E093BF-733C-4535-8CEA-83B4D4EF8F02' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.SupportsEmbeddedSigning 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Capabilities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE939E74-DAC6-4A31-A9E3-5FB43AB79FC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A1220C4D-0FA7-456C-8FA8-3D6EAEF75BAA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7EC73DE-C1C7-4B1B-A7C7-227EA3B21888' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '714E3CAD-CF29-4EC9-826E-9DA3E6DF66B7' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'DD777444-C381-412F-919C-D0198FE4B54C';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('08541823-27d5-4603-81ad-d0ffbd8439f5', 'DD777444-C381-412F-919C-D0198FE4B54C', 'FieldCategoryInfo', '{"Provider Definition":{"icon":"fa fa-file-alt","description":"Core identification and technical details of the eSignature provider"},"Provider Availability":{"icon":"fa fa-toggle-on","description":"Controls whether the provider is active and its selection priority"},"Authentication Settings":{"icon":"fa fa-lock","description":"How credentials are obtained for the provider (OAuth vs. static keys)"},"Feature Capabilities":{"icon":"fa fa-cogs","description":"Supported eSignature features such as templates and embedded signing"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f48400f7-5ebf-4bb5-b306-267c46b2a30d', 'DD777444-C381-412F-919C-D0198FE4B54C', 'FieldCategoryIcons', '{"Provider Definition":"fa fa-file-alt","Provider Availability":"fa fa-toggle-on","Authentication Settings":"fa fa-lock","Feature Capabilities":"fa fa-cogs","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'DD777444-C381-412F-919C-D0198FE4B54C';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BBEBA8E4-EDA3-4942-9087-8B9BFC42FA18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.SignatureRequestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signature Request Linking',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0911186-46DD-4A61-99ED-0BD9C5B574B7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Contact',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '67DF9F72-D46D-47CF-9A0D-629E5200C269' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Contact',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3ABC4A50-D368-4894-ABDD-1319EEF7741C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.RoutingOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signing Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7754D06E-D2ED-4F26-B1AE-D44F74FEF59C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signing Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '692E65D6-12F5-4DFA-A562-509F6A40D3AA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '05440883-E497-4E32-8ED6-52A830B1E2C2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.SignedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signing Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8606B69F-C70A-43B2-8A49-33F5E475558A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.ExternalRecipientID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'External Integration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABA7ABE6-37BE-404D-A22E-251CC57D45C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1998E813-FEEF-4062-8E9C-B34175BE55BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Recipients.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7452445D-E4D0-46E1-841A-C88AD1288CED' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-envelope-open-text */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-envelope-open-text', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8a4e41a2-34e7-4309-bddc-49ce9b78ec77', 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"},"Signature Request Linking":{"icon":"fa fa-link","description":"Links recipients to their signature request"},"Recipient Contact":{"icon":"fa fa-address-card","description":"Contact information for the signature recipient"},"Signing Workflow":{"icon":"fa fa-tasks","description":"Settings that control signing order and role within the workflow"},"Signing Status":{"icon":"fa fa-flag-checkered","description":"Current status of the recipient in the signing process"},"Signing Timeline":{"icon":"fa fa-calendar-alt","description":"Dates and timestamps related to the signing actions"},"External Integration":{"icon":"fa fa-plug","description":"Identifiers for external e‑signature provider integration"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('43e9ca11-2561-47ee-af0d-841ead23d302', 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A', 'FieldCategoryIcons', '{"System Metadata":"fa fa-cog","Signature Request Linking":"fa fa-link","Recipient Contact":"fa fa-address-card","Signing Workflow":"fa fa-tasks","Signing Status":"fa fa-flag-checkered","Signing Timeline":"fa fa-calendar-alt","External Integration":"fa fa-plug"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C15FE41E-040E-4A35-9F27-7A07DFD2F75A';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0E62FF7-5FBB-4FF9-92E9-4F437A318B33' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.SignatureRequestID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Signature Request Reference',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Request',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6564503A-9231-4069-A8A4-C53856E48E55' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.Operation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E9E0448-51D7-4693-97AF-84D753A101FE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.Success 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '510C984F-0C7E-4E5E-9185-2BB29CC61D27' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.StatusBefore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status Change',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C2A198B-ED52-469A-8A4B-7821E9C01D65' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.StatusAfter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status Change',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12B3EC2B-843A-4B89-A51B-B4FD5AA16451' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.Detail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FD41107-427B-413F-A69E-3F161ABA3444' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BE6013E-C6FB-4A86-AAA7-12ECC1769C76' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Request Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93875F79-4FF6-451C-95A9-244443938600' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('68478d1a-7178-40a0-8c73-091a61160471', 'F9F6F8C8-A29F-42A2-A64E-15EE43098252', 'FieldCategoryInfo', '{"Signature Request Reference":{"icon":"fa fa-link","description":"Reference to the related signature request record"},"Operation Details":{"icon":"fa fa-cogs","description":"Information about the operation performed and its outcome"},"Status Change":{"icon":"fa fa-exchange-alt","description":"Before and after status values surrounding the operation"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1ae267ab-422d-430b-9f7f-5a4d943989ea', 'F9F6F8C8-A29F-42A2-A64E-15EE43098252', 'FieldCategoryIcons', '{"Signature Request Reference":"fa fa-link","Operation Details":"fa fa-cogs","Status Change":"fa fa-exchange-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F9F6F8C8-A29F-42A2-A64E-15EE43098252';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Signature Requests.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5CF9200E-149F-4763-9D47-6C6CA7310099' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.SignatureAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Envelope Info',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4E1BF49-F90C-4F31-BFCF-C5049B6BD445' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.SignatureAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Envelope Info',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D7DE20E0-12B6-4105-BA3D-6A0E97DB7B75' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Title 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Envelope Info',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37B8E7C1-C70B-4414-A18C-2B18C0D36245' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Message 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Envelope Info',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A61D503-86B2-4F87-8CFE-A65CC0142B77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Envelope Info',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DF07A6F-C4E3-4D8E-96D0-710B3A45799B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.ExternalEnvelopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Envelope Info',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '772866A6-FBE7-47F1-BDEA-E7DCCC8F278D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.SentAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle & Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7075D0C0-55C6-430A-8C62-2CD828F90F64' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle & Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1EA675C-DC91-4F60-BD99-A3D920B44F2D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.VoidReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle & Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6839CD3D-D30A-4BAD-A82C-C36671F91286' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Origin Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E51828E6-3866-42CA-A0F8-3CC7D72112BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Origin Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D9E98C6-C2C7-48E0-8C46-7F57EDA49D61' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Origin Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB5436AC-78F5-4B2D-ACB0-408C8FB37F6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29FCD07C-2978-4F44-9196-E1ADD2724191' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Requests.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EEF5AD3-92C4-4B4B-84D5-A903699B08F2' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0075DBDF-FD00-4568-A7AC-03FDBF55D329';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1fece692-ed12-4921-9dc3-c4f5863a57e7', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', 'FieldCategoryInfo', '{"Envelope Info":{"icon":"fa fa-envelope-open-text","description":"Core details of the signature envelope including account, title, message, status and external identifiers"},"Lifecycle & Timing":{"icon":"fa fa-clock","description":"Timestamps and status changes that track the envelope''s progress"},"Origin Context":{"icon":"fa fa-link","description":"References to the business record that originated the signature request"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1ce8515d-d184-430c-a3ef-0e7735ddf9da', '0075DBDF-FD00-4568-A7AC-03FDBF55D329', 'FieldCategoryIcons', '{"Envelope Info":"fa fa-envelope-open-text","Lifecycle & Timing":"fa fa-clock","Origin Context":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: medium) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0075DBDF-FD00-4568-A7AC-03FDBF55D329';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Signature Accounts.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '422FDBB2-1B12-4A5D-BA3C-33C81D0A7FF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E929AF02-4D40-45C0-BC62-285B6CFADBE8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.SignatureProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Signature Provider',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8CEA1D11-3650-49EB-811D-8BC5D7F184FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4165153-5BEA-4F75-A73C-E1119BBDCBF2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '560EB704-35AD-4BCB-8E8D-02E747A70AA7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ECD64234-0D63-4079-ADAD-D0E41A00E9DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '712D95CC-8AB4-43F2-80B1-8482D7DAABA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.DefaultFromName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Default Envelope Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FC620EE-B884-4CD3-AB4E-4A9AB294092A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.DefaultFromEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Default Envelope Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '64EED22F-74CE-4F67-9FEF-88975844C1A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '2C175F6D-C44D-471C-A275-C624C91CBE53' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6F07B04F-B520-4946-8254-A23E225597AB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9BCB7B9-235A-4C89-BD5C-2046429695B5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.SignatureProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lookup Fields',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '776F45A5-3475-44F6-9789-5EB70ACEF0CA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Credential 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lookup Fields',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B58AB39E-29EB-43DB-B092-305A9A13EB42' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Signature Accounts.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lookup Fields',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FEAC7ED-4328-4D76-8CC6-998F4A79B5EB' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-lock */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-lock', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '64408373-0375-47BF-965F-EB6FAD41D8E4';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4fd37b1b-8a9c-469d-b04c-df8f55fd2492', '64408373-0375-47BF-965F-EB6FAD41D8E4', 'FieldCategoryInfo', '{"Account Details":{"icon":"fa fa-id-card","description":"Core identifying information for the signature account"},"Relationships":{"icon":"fa fa-link","description":"Links to related entities such as provider, credential, and company"},"Account Status":{"icon":"fa fa-flag-checkered","description":"Flags that control availability and default selection of the account"},"Default Envelope Settings":{"icon":"fa fa-envelope-open-text","description":"Default sender name and email used when creating envelopes"},"Advanced Settings":{"icon":"fa fa-sliders-h","description":"JSON configuration overrides specific to this account"},"Lookup Fields":{"icon":"fa fa-search","description":"Denormalized display names for related entities"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9d76ed80-b32e-4175-b38b-5a71ea58e432', '64408373-0375-47BF-965F-EB6FAD41D8E4', 'FieldCategoryIcons', '{"Account Details":"fa fa-id-card","Relationships":"fa fa-link","Account Status":"fa fa-flag-checkered","Default Envelope Settings":"fa fa-envelope-open-text","Advanced Settings":"fa fa-sliders-h","Lookup Fields":"fa fa-search","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '64408373-0375-47BF-965F-EB6FAD41D8E4';

