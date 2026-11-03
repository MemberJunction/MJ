-- =====================================================================================
-- Diagnostic Bundles & Flight Recorder Schema (MJ 6.2)
--
-- Introduces four core tables:
--   1. DiagnosticSession: bounded server and client diagnostic recording sessions with
--      tenant isolation, scope targeting, and byte-budget controls.
--   2. DiagnosticSessionChunk: compressed NDJSON capture chunks flushed by server
--      instances and client browsers during a diagnostic session.
--   3. DiagnosticBundle: assembled .mjdiag diagnostic bundles (both locally built
--      bundles and external bundles received via MJAPI intake) with manifest,
--      scrubbing report, automated findings, and MJStorage link.
--   4. DiagnosticSenderRegistration: an installation that is allowed to send diagnostic
--      bundles to this collector, with its enrollment state, signing public key,
--      one-time registration code hash, and daily bundle quota.
--
-- Conventions (migrations/CLAUDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted;
--     CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. DiagnosticSession
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[DiagnosticSession] (
    [ID]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_DiagnosticSession_ID] DEFAULT (newsequentialid()),
    [Name]             NVARCHAR(255)    NOT NULL,
    [Reason]           NVARCHAR(MAX)    NULL,
    [Status]           NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticSession_Status] DEFAULT (N'Active'),
    [ScopeType]        NVARCHAR(30)     NOT NULL CONSTRAINT [DF_DiagnosticSession_ScopeType] DEFAULT (N'Users'),
    [ScopeJSON]        NVARCHAR(MAX)    NULL,
    [Level]            NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticSession_Level] DEFAULT (N'Standard'),
    [CategoriesJSON]   NVARCHAR(MAX)    NULL,
    [ScrubLiterals]    BIT              NOT NULL CONSTRAINT [DF_DiagnosticSession_ScrubLiterals] DEFAULT (0),
    [StartedAt]        DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_DiagnosticSession_StartedAt] DEFAULT (getutcdate()),
    [EndsAt]           DATETIMEOFFSET   NOT NULL,
    [StoppedAt]        DATETIMEOFFSET   NULL,
    [MaxBytes]         BIGINT           NOT NULL CONSTRAINT [DF_DiagnosticSession_MaxBytes] DEFAULT (52428800),
    [CreatedByUserID]  UNIQUEIDENTIFIER NOT NULL,
    [CompanyID]        UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_DiagnosticSession] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DiagnosticSession_CreatedByUser] FOREIGN KEY ([CreatedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_DiagnosticSession_Company] FOREIGN KEY ([CompanyID])
        REFERENCES [${flyway:defaultSchema}].[Company]([ID]),
    CONSTRAINT [CK_DiagnosticSession_Status] CHECK ([Status] IN (N'Active', N'Stopped', N'Expired')),
    CONSTRAINT [CK_DiagnosticSession_ScopeType] CHECK ([ScopeType] IN (N'Users', N'APIKeys', N'Operations', N'BrowserSession', N'Instance')),
    CONSTRAINT [CK_DiagnosticSession_Level] CHECK ([Level] IN (N'Standard', N'Verbose', N'Debug'))
);
GO

-- -------------------------------------------------------------------------------------
-- 2. DiagnosticSessionChunk
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_DiagnosticSessionChunk_ID] DEFAULT (newsequentialid()),
    [DiagnosticSessionID] UNIQUEIDENTIFIER NOT NULL,
    [Source]              NVARCHAR(20)     NOT NULL,
    [HostInstanceLabel]   NVARCHAR(255)    NOT NULL,
    [Sequence]            INT              NOT NULL,
    [ContentKind]         NVARCHAR(30)     NOT NULL,
    [Data]                VARBINARY(MAX)   NOT NULL,
    [EntryCount]          INT              NOT NULL CONSTRAINT [DF_DiagnosticSessionChunk_EntryCount] DEFAULT (0),
    [FirstEntryAt]        DATETIMEOFFSET   NULL,
    [LastEntryAt]         DATETIMEOFFSET   NULL,
    CONSTRAINT [PK_DiagnosticSessionChunk] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DiagnosticSessionChunk_DiagnosticSession] FOREIGN KEY ([DiagnosticSessionID])
        REFERENCES [${flyway:defaultSchema}].[DiagnosticSession]([ID])
        ON DELETE CASCADE,
    CONSTRAINT [UQ_DiagnosticSessionChunk_Session_Source_Host_Kind_Seq]
        UNIQUE ([DiagnosticSessionID], [Source], [HostInstanceLabel], [ContentKind], [Sequence]),
    CONSTRAINT [CK_DiagnosticSessionChunk_Source] CHECK ([Source] IN (N'Server', N'Client')),
    CONSTRAINT [CK_DiagnosticSessionChunk_ContentKind] CHECK ([ContentKind] IN (N'Logs', N'Errors', N'Spans', N'SQL', N'Network', N'Timeline', N'Telemetry', N'Health', N'App'))
);
GO

-- -------------------------------------------------------------------------------------
-- 3. DiagnosticBundle
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[DiagnosticBundle] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_DiagnosticBundle_ID] DEFAULT (newsequentialid()),
    [Name]                NVARCHAR(255)    NOT NULL,
    [Description]         NVARCHAR(MAX)    NULL,
    [Direction]           NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticBundle_Direction] DEFAULT (N'Local'),
    [DiagnosticSessionID] UNIQUEIDENTIFIER NULL,
    [Status]              NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticBundle_Status] DEFAULT (N'Building'),
    [ScrubLiterals]       BIT              NOT NULL CONSTRAINT [DF_DiagnosticBundle_ScrubLiterals] DEFAULT (0),
    [WindowStart]         DATETIMEOFFSET   NULL,
    [WindowEnd]           DATETIMEOFFSET   NULL,
    [FileID]              UNIQUEIDENTIFIER NULL,
    [Data]                VARBINARY(MAX)   NULL,
    [SizeBytes]           BIGINT           NOT NULL CONSTRAINT [DF_DiagnosticBundle_SizeBytes] DEFAULT (0),
    [SHA256]              NCHAR(64)        NULL,
    [ManifestJSON]        NVARCHAR(MAX)    NULL,
    [ScrubReportJSON]     NVARCHAR(MAX)    NULL,
    [FindingsJSON]        NVARCHAR(MAX)    NULL,
    [FailureReason]       NVARCHAR(MAX)    NULL,
    [CreatedByUserID]     UNIQUEIDENTIFIER NULL,
    [ApprovedByUserID]    UNIQUEIDENTIFIER NULL,
    [ApprovedAt]          DATETIMEOFFSET   NULL,
    [Destination]         NVARCHAR(30)     NULL,
    [SentAt]              DATETIMEOFFSET   NULL,
    [ExternalReferenceID] NVARCHAR(255)    NULL,
    [SenderInstallID]     UNIQUEIDENTIFIER NULL,
    [SenderMJVersion]     NVARCHAR(50)     NULL,
    [ContactInfo]         NVARCHAR(500)    NULL,
    [ExpiresAt]           DATETIMEOFFSET   NULL,
    [CompanyID]           UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_DiagnosticBundle] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DiagnosticBundle_DiagnosticSession] FOREIGN KEY ([DiagnosticSessionID])
        REFERENCES [${flyway:defaultSchema}].[DiagnosticSession]([ID])
        ON DELETE SET NULL,
    CONSTRAINT [FK_DiagnosticBundle_File] FOREIGN KEY ([FileID])
        REFERENCES [${flyway:defaultSchema}].[File]([ID])
        ON DELETE SET NULL,
    CONSTRAINT [FK_DiagnosticBundle_CreatedByUser] FOREIGN KEY ([CreatedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_DiagnosticBundle_ApprovedByUser] FOREIGN KEY ([ApprovedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_DiagnosticBundle_Company] FOREIGN KEY ([CompanyID])
        REFERENCES [${flyway:defaultSchema}].[Company]([ID]),
    CONSTRAINT [CK_DiagnosticBundle_Direction] CHECK ([Direction] IN (N'Local', N'Received')),
    CONSTRAINT [CK_DiagnosticBundle_Status] CHECK ([Status] IN (N'Building', N'Receiving', N'Ready', N'Sending', N'Sent', N'Failed', N'Expired')),
    CONSTRAINT [CK_DiagnosticBundle_Destination] CHECK ([Destination] IN (N'MJC', N'CustomerCollector', N'StorageAccount'))
);
GO

-- -------------------------------------------------------------------------------------
-- 4. DiagnosticSenderRegistration
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] (
    [ID]                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_ID] DEFAULT (newsequentialid()),
    [InstallID]                 NVARCHAR(100)    NOT NULL,
    [Name]                      NVARCHAR(255)    NOT NULL,
    [Status]                    NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_Status] DEFAULT (N'Pending'),
    [KeyAlgorithm]              NVARCHAR(20)     NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_KeyAlgorithm] DEFAULT (N'Ed25519'),
    [KeyID]                     NVARCHAR(100)    NULL,
    [PublicKeyBase64]           NVARCHAR(255)    NULL,
    [RegistrationCodeHash]      NVARCHAR(128)    NULL,
    [RegistrationCodeExpiresAt] DATETIMEOFFSET   NULL,
    [EnrolledAt]                DATETIMEOFFSET   NULL,
    [RevokedAt]                 DATETIMEOFFSET   NULL,
    [LastSeenAt]                DATETIMEOFFSET   NULL,
    [MaxBundlesPerDay]          INT              NOT NULL CONSTRAINT [DF_DiagnosticSenderRegistration_MaxBundlesPerDay] DEFAULT (20),
    [Comments]                  NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_DiagnosticSenderRegistration] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DiagnosticSenderRegistration_InstallID] UNIQUE ([InstallID]),
    CONSTRAINT [CK_DiagnosticSenderRegistration_Status] CHECK ([Status] IN (N'Pending', N'Active', N'Revoked')),
    CONSTRAINT [CK_DiagnosticSenderRegistration_KeyAlgorithm] CHECK ([KeyAlgorithm] IN (N'Ed25519'))
);
GO

-- -------------------------------------------------------------------------------------
-- 5. Extended properties (Table & Column descriptions)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Bounded server and client diagnostic recording sessions with tenant isolation, scope targeting, and byte-budget controls.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-readable label for the diagnostic session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional explanation of why this diagnostic session was started (such as a ticket number or reproduction notes).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'Reason';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Current lifecycle status of the diagnostic session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Determines which incoming requests are matched and captured by this session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'ScopeType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON specification of targeted UserIDs, APIKeyIDs, GraphQL/RemoteOperation names, or BrowserSessionID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'ScopeJSON';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Capture verbosity level applied to requests matched by this session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'Level';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON array of diagnostic categories enabled for this session (e.g., Logs, SQL, Spans, Network, Telemetry).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'CategoriesJSON';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When true, replaces inline SQL and filter string/number/UUID literals with ? placeholders in addition to mandatory credential scrubbing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'ScrubLiterals';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'UTC timestamp when the diagnostic session became active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'StartedAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'UTC timestamp when the diagnostic session automatically expires.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'EndsAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'UTC timestamp when the diagnostic session was manually stopped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'StoppedAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Maximum total compressed chunk bytes allowed for this session before capture stops (defaults to 50 MB).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'MaxBytes';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User who initiated the diagnostic session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'CreatedByUserID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional tenant CompanyID isolating session capture in multi-tenant deployments.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSession',
    @level2type = N'COLUMN', @level2name = N'CompanyID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Compressed NDJSON capture chunks flushed by server instances and client browsers during a diagnostic session.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Owning diagnostic session for this chunk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'DiagnosticSessionID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Origin tier that produced the chunk (Server or Client).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'Source';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Process UUID, hostname, or browser tab identifier that flushed this chunk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'HostInstanceLabel';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Monotonically increasing sequence number per (DiagnosticSessionID, Source, HostInstanceLabel, ContentKind).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Type of diagnostic data stored in this chunk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'ContentKind';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'DEFLATE/gzip compressed NDJSON or JSON payload (~256 KB max per chunk).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'Data';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Number of records or events contained in this chunk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'EntryCount';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Timestamp of the earliest event in this chunk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'FirstEntryAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Timestamp of the latest event in this chunk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSessionChunk',
    @level2type = N'COLUMN', @level2name = N'LastEntryAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Assembled .mjdiag diagnostic bundles (both locally built bundles and external bundles received via MJAPI intake) with manifest, scrubbing report, automated findings, and MJStorage link.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display name of the diagnostic bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional description or summary notes attached to the bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Indicates whether this bundle was built locally on this instance (Local) or ingested via the MJAPI intake endpoint (Received).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'Direction';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Source diagnostic session when built from a server session; NULL for client-only or received bundles.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'DiagnosticSessionID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Current lifecycle status of the diagnostic bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'True when inline SQL and filter literals were normalized to ? placeholders in this bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ScrubLiterals';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Start of the time window covered by this bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'WindowStart';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'End of the time window covered by this bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'WindowEnd';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Reference to MJ: Files when the bundle archive is persisted in MJStorage.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'FileID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Fallback binary storage for the .mjdiag archive when no MJStorage account is configured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'Data';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Total size of the .mjdiag archive in bytes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'SizeBytes';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Hex-encoded SHA-256 digest of the unencrypted .mjdiag archive.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'SHA256';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Parsed manifest.json contents including file inventory and SHA-256 digests.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ManifestJSON';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Summary counts of credential tokens scrubbed and literals normalized across all bundle entries.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ScrubReportJSON';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Automated rules-engine diagnostic findings extracted from this bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'FindingsJSON';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Error details when Status is Failed (e.g., build error, send failure, or malware/structural verification rejection).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'FailureReason';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User who built or uploaded this bundle; NULL for remotely ingested bundles.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'CreatedByUserID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Administrator who approved sending this bundle externally.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ApprovedByUserID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'UTC timestamp when external transmission was approved.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ApprovedAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Target external destination when sending a bundle (MJC, CustomerCollector, or StorageAccount).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'Destination';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'UTC timestamp when the bundle was transmitted to Destination.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'SentAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Reference ID returned by the receiving collector intake endpoint.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ExternalReferenceID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'InstallID of the sender instance when Direction = Received.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'SenderInstallID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'MemberJunction version reported by the sender instance when Direction = Received.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'SenderMJVersion';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional reporter or administrator contact information on received bundles.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ContactInfo';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'UTC timestamp when this bundle becomes eligible for automatic retention purge.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'ExpiresAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional tenant CompanyID scoping this diagnostic bundle.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticBundle',
    @level2type = N'COLUMN', @level2name = N'CompanyID';

-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'An installation that is allowed to send diagnostic bundles to this collector. Holds its enrollment state, the public key that verifies its signed requests, the hash of its one-time registration code, and its daily bundle quota.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique identifier of the sender registration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Installation ID of the sending MemberJunction instance. Unique per registration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'InstallID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display name of the customer or installation that sends the bundles.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle status of the registration. Pending: created, waiting for the sender to enroll with its registration code. Active: enrolled, bundles are accepted. Revoked: bundles are refused.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Signature algorithm of the sender public key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'KeyAlgorithm';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Identifier of the sender signing key. Set at enrollment; a key rotation replaces it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'KeyID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Base64-encoded public key that verifies the sender signed requests. Set at enrollment.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'PublicKeyBase64';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 hex digest of the one-time registration code. The plain code is never stored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'RegistrationCodeHash';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time after which the one-time registration code can no longer be used to enroll.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'RegistrationCodeExpiresAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time the sender enrolled its public key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'EnrolledAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time the registration was revoked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'RevokedAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Time of the last authenticated request from the sender.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'LastSeenAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Maximum number of bundles the collector accepts from this sender per day.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'MaxBundlesPerDay';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Free-form administrator notes about the registration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DiagnosticSenderRegistration',
    @level2type = N'COLUMN', @level2name = N'Comments';

GO




























































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- Output of `mj codegen` for DiagnosticSession, DiagnosticSessionChunk,
-- DiagnosticBundle and DiagnosticSenderRegistration: Entity / EntityField /
-- EntityFieldValue / EntityPermission / ApplicationEntity / EntityRelationship
-- inserts, the __mj_CreatedAt / __mj_UpdatedAt columns and update triggers,
-- FK indexes, base views, spCreate / spUpdate / spDelete procedures, permission
-- grants, and field and entity settings.
-- If the hand-written DDL above changes, re-run CodeGen and replace this section.
-- =============================================================================

/* SQL generated to create new entity MJ: Diagnostic Sessions */

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
         'd83818a2-e62d-40ea-9243-c2d1175411ac',
         'MJ: Diagnostic Sessions',
         'Diagnostic Sessions',
         'Bounded server and client diagnostic recording sessions with tenant isolation, scope targeting, and byte-budget controls.',
         NULL,
         'DiagnosticSession',
         'vwDiagnosticSessions',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Diagnostic Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd83818a2-e62d-40ea-9243-c2d1175411ac', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d83818a2-e62d-40ea-9243-c2d1175411ac' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d83818a2-e62d-40ea-9243-c2d1175411ac' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d83818a2-e62d-40ea-9243-c2d1175411ac' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d83818a2-e62d-40ea-9243-c2d1175411ac' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d83818a2-e62d-40ea-9243-c2d1175411ac' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d83818a2-e62d-40ea-9243-c2d1175411ac' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Diagnostic Session Chunks */

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
         'a5b20694-ec9e-4beb-a402-0081504aa78b',
         'MJ: Diagnostic Session Chunks',
         'Diagnostic Session Chunks',
         'Compressed NDJSON capture chunks flushed by server instances and client browsers during a diagnostic session.',
         NULL,
         'DiagnosticSessionChunk',
         'vwDiagnosticSessionChunks',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Diagnostic Session Chunks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a5b20694-ec9e-4beb-a402-0081504aa78b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('a5b20694-ec9e-4beb-a402-0081504aa78b' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('a5b20694-ec9e-4beb-a402-0081504aa78b' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('a5b20694-ec9e-4beb-a402-0081504aa78b' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('a5b20694-ec9e-4beb-a402-0081504aa78b' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('a5b20694-ec9e-4beb-a402-0081504aa78b' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('a5b20694-ec9e-4beb-a402-0081504aa78b' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Diagnostic Bundles */

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
         'd3aad653-5b9a-4075-94c0-a2a490823d4e',
         'MJ: Diagnostic Bundles',
         'Diagnostic Bundles',
         'Assembled .mjdiag diagnostic bundles (both locally built bundles and external bundles received via MJAPI intake) with manifest, scrubbing report, automated findings, and MJStorage link.',
         NULL,
         'DiagnosticBundle',
         'vwDiagnosticBundles',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Diagnostic Bundles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd3aad653-5b9a-4075-94c0-a2a490823d4e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d3aad653-5b9a-4075-94c0-a2a490823d4e' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d3aad653-5b9a-4075-94c0-a2a490823d4e' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d3aad653-5b9a-4075-94c0-a2a490823d4e' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d3aad653-5b9a-4075-94c0-a2a490823d4e' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d3aad653-5b9a-4075-94c0-a2a490823d4e' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d3aad653-5b9a-4075-94c0-a2a490823d4e' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Diagnostic Sender Registrations */

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
         '7680f8bd-1da5-4664-81cc-2225eb4299a7',
         'MJ: Diagnostic Sender Registrations',
         'Diagnostic Sender Registrations',
         'An installation that is allowed to send diagnostic bundles to this collector. Holds its enrollment state, the public key that verifies its signed requests, the hash of its one-time registration code, and its daily bundle quota.',
         NULL,
         'DiagnosticSenderRegistration',
         'vwDiagnosticSenderRegistrations',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Diagnostic Sender Registrations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7680f8bd-1da5-4664-81cc-2225eb4299a7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7680f8bd-1da5-4664-81cc-2225eb4299a7' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7680f8bd-1da5-4664-81cc-2225eb4299a7' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7680f8bd-1da5-4664-81cc-2225eb4299a7' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7680f8bd-1da5-4664-81cc-2225eb4299a7' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7680f8bd-1da5-4664-81cc-2225eb4299a7' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7680f8bd-1da5-4664-81cc-2225eb4299a7' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
UPDATE [${flyway:defaultSchema}].[DiagnosticSessionChunk] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ADD CONSTRAINT [DF___mj_DiagnosticSessionChunk___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
UPDATE [${flyway:defaultSchema}].[DiagnosticSessionChunk] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ADD CONSTRAINT [DF___mj_DiagnosticSessionChunk___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
UPDATE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD CONSTRAINT [DF___mj_DiagnosticSenderRegistration___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
UPDATE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSenderRegistration */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSenderRegistration] ADD CONSTRAINT [DF___mj_DiagnosticSenderRegistration___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
UPDATE [${flyway:defaultSchema}].[DiagnosticBundle] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ADD CONSTRAINT [DF___mj_DiagnosticBundle___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
UPDATE [${flyway:defaultSchema}].[DiagnosticBundle] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ADD CONSTRAINT [DF___mj_DiagnosticBundle___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
UPDATE [${flyway:defaultSchema}].[DiagnosticSession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ADD CONSTRAINT [DF___mj_DiagnosticSession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
UPDATE [${flyway:defaultSchema}].[DiagnosticSession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ADD CONSTRAINT [DF___mj_DiagnosticSession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 75 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92210665-7cbe-464d-a0f3-321349bb576b' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'ID')) BEGIN
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
            '92210665-7cbe-464d-a0f3-321349bb576b',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72168bca-4b51-457b-afc9-167326fbe1a4' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'DiagnosticSessionID')) BEGIN
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
            '72168bca-4b51-457b-afc9-167326fbe1a4',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'DiagnosticSessionID',
            'Diagnostic Session ID',
            'Owning diagnostic session for this chunk.',
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
            'D83818A2-E62D-40EA-9243-C2D1175411AC',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc039dc4-e227-4836-b237-cb312edb05e0' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'Source')) BEGIN
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
            'bc039dc4-e227-4836-b237-cb312edb05e0',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'Source',
            'Source',
            'Origin tier that produced the chunk (Server or Client).',
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42d629e0-cef2-447e-84d2-124bfcc82a47' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'HostInstanceLabel')) BEGIN
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
            '42d629e0-cef2-447e-84d2-124bfcc82a47',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'HostInstanceLabel',
            'Host Instance Label',
            'Process UUID, hostname, or browser tab identifier that flushed this chunk.',
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61c5f07f-89f7-48c3-beb4-8354a88c0423' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'Sequence')) BEGIN
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
            '61c5f07f-89f7-48c3-beb4-8354a88c0423',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'Sequence',
            'Sequence',
            'Monotonically increasing sequence number per (DiagnosticSessionID, Source, HostInstanceLabel, ContentKind).',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e91151ea-695e-40f1-ac51-f918454da4d0' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'ContentKind')) BEGIN
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
            'e91151ea-695e-40f1-ac51-f918454da4d0',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'ContentKind',
            'Content Kind',
            'Type of diagnostic data stored in this chunk.',
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78db8811-5731-4f94-b5e3-9f44ccdfa766' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'Data')) BEGIN
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
            '78db8811-5731-4f94-b5e3-9f44ccdfa766',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'Data',
            'Data',
            'DEFLATE/gzip compressed NDJSON or JSON payload (~256 KB max per chunk).',
            'varbinary',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'deb5678d-ec9b-4db8-b1cd-ec3ef7cda71a' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'EntryCount')) BEGIN
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
            'deb5678d-ec9b-4db8-b1cd-ec3ef7cda71a',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'EntryCount',
            'Entry Count',
            'Number of records or events contained in this chunk.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01f2994d-8667-4834-b9f5-b05b23303c24' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'FirstEntryAt')) BEGIN
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
            '01f2994d-8667-4834-b9f5-b05b23303c24',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'FirstEntryAt',
            'First Entry At',
            'Timestamp of the earliest event in this chunk.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94a9fc0e-6770-4394-ab47-ce152192cc10' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'LastEntryAt')) BEGIN
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
            '94a9fc0e-6770-4394-ab47-ce152192cc10',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'LastEntryAt',
            'Last Entry At',
            'Timestamp of the latest event in this chunk.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18d6e6b6-4d05-4865-91bf-d0650e25e12e' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '18d6e6b6-4d05-4865-91bf-d0650e25e12e',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52934c2d-ffb4-4ef9-9416-73ec4ed4c1a9' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '52934c2d-ffb4-4ef9-9416-73ec4ed4c1a9',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'feaa52e1-360e-4774-81fb-7b3dec9a1738' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'ID')) BEGIN
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
            'feaa52e1-360e-4774-81fb-7b3dec9a1738',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'ID',
            'ID',
            'Unique identifier of the sender registration.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23c5308d-2c15-46a6-bc53-16adacc8fb74' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'InstallID')) BEGIN
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
            '23c5308d-2c15-46a6-bc53-16adacc8fb74',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'InstallID',
            'Install ID',
            'Installation ID of the sending MemberJunction instance. Unique per registration.',
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c63dbeb8-cb74-415c-a8b2-ac20fc66bfa6' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'Name')) BEGIN
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
            'c63dbeb8-cb74-415c-a8b2-ac20fc66bfa6',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'Name',
            'Name',
            'Display name of the customer or installation that sends the bundles.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '620f41d8-532d-420d-bfd0-549e404dfc34' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'Status')) BEGIN
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
            '620f41d8-532d-420d-bfd0-549e404dfc34',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'Status',
            'Status',
            'Lifecycle status of the registration. Pending: created, waiting for the sender to enroll with its registration code. Active: enrolled, bundles are accepted. Revoked: bundles are refused.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd33265b5-34fe-4765-a09c-c3dd5212ba6b' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'KeyAlgorithm')) BEGIN
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
            'd33265b5-34fe-4765-a09c-c3dd5212ba6b',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'KeyAlgorithm',
            'Key Algorithm',
            'Signature algorithm of the sender public key.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Ed25519',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3b4f241-0a0a-464a-8f91-c49532f502cc' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'KeyID')) BEGIN
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
            'b3b4f241-0a0a-464a-8f91-c49532f502cc',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'KeyID',
            'Key ID',
            'Identifier of the sender signing key. Set at enrollment; a key rotation replaces it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd39fffe7-bb97-4a50-b028-93d17d4c4fe3' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'PublicKeyBase64')) BEGIN
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
            'd39fffe7-bb97-4a50-b028-93d17d4c4fe3',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'PublicKeyBase64',
            'Public Key Base 64',
            'Base64-encoded public key that verifies the sender signed requests. Set at enrollment.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2be187da-8771-4521-9067-ed5058e5ab97' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'RegistrationCodeHash')) BEGIN
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
            '2be187da-8771-4521-9067-ed5058e5ab97',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'RegistrationCodeHash',
            'Registration Code Hash',
            'SHA-256 hex digest of the one-time registration code. The plain code is never stored.',
            'nvarchar',
            256,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87738366-263a-4480-8874-ceb178445606' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'RegistrationCodeExpiresAt')) BEGIN
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
            '87738366-263a-4480-8874-ceb178445606',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'RegistrationCodeExpiresAt',
            'Registration Code Expires At',
            'Time after which the one-time registration code can no longer be used to enroll.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e06922fb-e7c9-4b1c-8f55-ada49775fb75' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'EnrolledAt')) BEGIN
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
            'e06922fb-e7c9-4b1c-8f55-ada49775fb75',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'EnrolledAt',
            'Enrolled At',
            'Time the sender enrolled its public key.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '654fa598-6390-40c3-89b1-16f94fc336af' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'RevokedAt')) BEGIN
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
            '654fa598-6390-40c3-89b1-16f94fc336af',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'RevokedAt',
            'Revoked At',
            'Time the registration was revoked.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '229552f8-6c5f-4cb2-b279-e4655732c2a5' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'LastSeenAt')) BEGIN
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
            '229552f8-6c5f-4cb2-b279-e4655732c2a5',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'LastSeenAt',
            'Last Seen At',
            'Time of the last authenticated request from the sender.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92469c19-5ea5-42df-b466-cc3db5b7740b' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'MaxBundlesPerDay')) BEGIN
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
            '92469c19-5ea5-42df-b466-cc3db5b7740b',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'MaxBundlesPerDay',
            'Max Bundles Per Day',
            'Maximum number of bundles the collector accepts from this sender per day.',
            'int',
            4,
            10,
            0,
            0,
            '(20)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90c0f86a-b035-4889-9545-d22558399ea2' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = 'Comments')) BEGIN
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
            '90c0f86a-b035-4889-9545-d22558399ea2',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
            'Comments',
            'Comments',
            'Free-form administrator notes about the registration.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef629ac8-f225-42ce-acae-ff29d213f9c2' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ef629ac8-f225-42ce-acae-ff29d213f9c2',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd88aa667-8f2f-4b3e-b38d-87faa310d266' OR (EntityID = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd88aa667-8f2f-4b3e-b38d-87faa310d266',
            '7680F8BD-1DA5-4664-81CC-2225EB4299A7', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71992e90-7c1e-460d-bd31-791d2d0eddde' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ID')) BEGIN
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
            '71992e90-7c1e-460d-bd31-791d2d0eddde',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21106266-910e-43ab-abe3-aa5ed911314d' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Name')) BEGIN
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
            '21106266-910e-43ab-abe3-aa5ed911314d',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'Name',
            'Name',
            'Display name of the diagnostic bundle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5e68c2e-41aa-4e67-97d8-3bc62174d59d' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Description')) BEGIN
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
            'c5e68c2e-41aa-4e67-97d8-3bc62174d59d',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'Description',
            'Description',
            'Optional description or summary notes attached to the bundle.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '226b9ca7-5fdb-444d-99ac-618b573dc703' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Direction')) BEGIN
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
            '226b9ca7-5fdb-444d-99ac-618b573dc703',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'Direction',
            'Direction',
            'Indicates whether this bundle was built locally on this instance (Local) or ingested via the MJAPI intake endpoint (Received).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Local',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdec5719-7946-4367-884f-ffb3bc620cbc' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'DiagnosticSessionID')) BEGIN
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
            'cdec5719-7946-4367-884f-ffb3bc620cbc',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'DiagnosticSessionID',
            'Diagnostic Session ID',
            'Source diagnostic session when built from a server session; NULL for client-only or received bundles.',
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
            'D83818A2-E62D-40EA-9243-C2D1175411AC',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '469602a1-9d6f-48aa-ad64-b70a48fef38e' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Status')) BEGIN
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
            '469602a1-9d6f-48aa-ad64-b70a48fef38e',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'Status',
            'Status',
            'Current lifecycle status of the diagnostic bundle.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Building',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca2539bd-bc9c-4b7b-8385-7b3d9b76ae9e' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ScrubLiterals')) BEGIN
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
            'ca2539bd-bc9c-4b7b-8385-7b3d9b76ae9e',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ScrubLiterals',
            'Scrub Literals',
            'True when inline SQL and filter literals were normalized to ? placeholders in this bundle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71280090-eb5f-490a-9108-d8fa1da9f264' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'WindowStart')) BEGIN
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
            '71280090-eb5f-490a-9108-d8fa1da9f264',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'WindowStart',
            'Window Start',
            'Start of the time window covered by this bundle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67683c2a-0a1c-4e6e-8f43-e6f89b6586c7' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'WindowEnd')) BEGIN
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
            '67683c2a-0a1c-4e6e-8f43-e6f89b6586c7',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'WindowEnd',
            'Window End',
            'End of the time window covered by this bundle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3335a61-8bd1-4416-90ea-ac65269d7b80' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'FileID')) BEGIN
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
            'd3335a61-8bd1-4416-90ea-ac65269d7b80',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'FileID',
            'File ID',
            'Reference to MJ: Files when the bundle archive is persisted in MJStorage.',
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
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61e09b1a-6e15-46ef-b0f5-1c304507beac' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Data')) BEGIN
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
            '61e09b1a-6e15-46ef-b0f5-1c304507beac',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'Data',
            'Data',
            'Fallback binary storage for the .mjdiag archive when no MJStorage account is configured.',
            'varbinary',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce1b783e-7afb-4c66-a0c8-359c24dcbd11' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'SizeBytes')) BEGIN
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
            'ce1b783e-7afb-4c66-a0c8-359c24dcbd11',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'SizeBytes',
            'Size Bytes',
            'Total size of the .mjdiag archive in bytes.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1561d65-10fe-4b6b-ba80-30be25d926e4' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'SHA256')) BEGIN
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
            'c1561d65-10fe-4b6b-ba80-30be25d926e4',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'SHA256',
            'Sha 256',
            'Hex-encoded SHA-256 digest of the unencrypted .mjdiag archive.',
            'nchar',
            128,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e898d0d-39c4-4aee-b38b-f138ce3fcde2' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ManifestJSON')) BEGIN
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
            '4e898d0d-39c4-4aee-b38b-f138ce3fcde2',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ManifestJSON',
            'Manifest JSON',
            'Parsed manifest.json contents including file inventory and SHA-256 digests.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '635e72ad-5692-408e-a98e-8088b0c6fc09' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ScrubReportJSON')) BEGIN
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
            '635e72ad-5692-408e-a98e-8088b0c6fc09',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ScrubReportJSON',
            'Scrub Report JSON',
            'Summary counts of credential tokens scrubbed and literals normalized across all bundle entries.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ba8e940-33d4-4dc0-86d5-76340ae53921' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'FindingsJSON')) BEGIN
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
            '5ba8e940-33d4-4dc0-86d5-76340ae53921',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'FindingsJSON',
            'Findings JSON',
            'Automated rules-engine diagnostic findings extracted from this bundle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '883e6ce7-cf5a-4276-937d-ec70480fc823' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'FailureReason')) BEGIN
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
            '883e6ce7-cf5a-4276-937d-ec70480fc823',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'FailureReason',
            'Failure Reason',
            'Error details when Status is Failed (e.g., build error, send failure, or malware/structural verification rejection).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '666a271a-40fe-4adc-9fe0-d52e64f82d3e' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'CreatedByUserID')) BEGIN
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
            '666a271a-40fe-4adc-9fe0-d52e64f82d3e',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'CreatedByUserID',
            'Created By User ID',
            'User who built or uploaded this bundle; NULL for remotely ingested bundles.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0e50d95-6be4-4f3b-a71a-ebbb2db48101' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ApprovedByUserID')) BEGIN
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
            'b0e50d95-6be4-4f3b-a71a-ebbb2db48101',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ApprovedByUserID',
            'Approved By User ID',
            'Administrator who approved sending this bundle externally.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65540dba-e972-458c-b523-c57eafd24a42' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ApprovedAt')) BEGIN
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
            '65540dba-e972-458c-b523-c57eafd24a42',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ApprovedAt',
            'Approved At',
            'UTC timestamp when external transmission was approved.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64e2435a-02c6-4688-aba3-b05612e69ead' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Destination')) BEGIN
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
            '64e2435a-02c6-4688-aba3-b05612e69ead',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'Destination',
            'Destination',
            'Target external destination when sending a bundle (MJC, CustomerCollector, or StorageAccount).',
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1aea44ea-8908-4556-91ae-b10728daff77' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'SentAt')) BEGIN
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
            '1aea44ea-8908-4556-91ae-b10728daff77',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'SentAt',
            'Sent At',
            'UTC timestamp when the bundle was transmitted to Destination.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b85a691e-5146-4263-82a5-7d5d7338d0ff' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ExternalReferenceID')) BEGIN
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
            'b85a691e-5146-4263-82a5-7d5d7338d0ff',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ExternalReferenceID',
            'External Reference ID',
            'Reference ID returned by the receiving collector intake endpoint.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d2a4187-10f8-416d-8c65-aee61c27d653' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'SenderInstallID')) BEGIN
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
            '8d2a4187-10f8-416d-8c65-aee61c27d653',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'SenderInstallID',
            'Sender Install ID',
            'InstallID of the sender instance when Direction = Received.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f79b945-203b-498c-8871-7d6126f1ef46' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'SenderMJVersion')) BEGIN
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
            '6f79b945-203b-498c-8871-7d6126f1ef46',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'SenderMJVersion',
            'Sender MJ Version',
            'MemberJunction version reported by the sender instance when Direction = Received.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8200ea9c-b129-442b-b221-db9a93aa7780' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ContactInfo')) BEGIN
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
            '8200ea9c-b129-442b-b221-db9a93aa7780',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ContactInfo',
            'Contact Info',
            'Optional reporter or administrator contact information on received bundles.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e649ab90-e9e5-4b6b-bd3d-e6dac9a3d35e' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ExpiresAt')) BEGIN
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
            'e649ab90-e9e5-4b6b-bd3d-e6dac9a3d35e',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ExpiresAt',
            'Expires At',
            'UTC timestamp when this bundle becomes eligible for automatic retention purge.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10f82559-ae1f-451f-ad0a-00d509d58c8a' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'CompanyID')) BEGIN
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
            '10f82559-ae1f-451f-ad0a-00d509d58c8a',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'CompanyID',
            'Company ID',
            'Optional tenant CompanyID scoping this diagnostic bundle.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd464283c-4ac5-4365-b614-d61ffc045e3e' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd464283c-4ac5-4365-b614-d61ffc045e3e',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d3f49ae-5959-41e4-bf59-40e737499880' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9d3f49ae-5959-41e4-bf59-40e737499880',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d57649f-3694-4399-95f9-fb6aa970691f' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'ID')) BEGIN
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
            '0d57649f-3694-4399-95f9-fb6aa970691f',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '754ff87b-8341-453a-975d-ab9caae553e2' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'Name')) BEGIN
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
            '754ff87b-8341-453a-975d-ab9caae553e2',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'Name',
            'Name',
            'Human-readable label for the diagnostic session.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de4c9a0a-fab6-470c-9c1d-37980a8c2792' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'Reason')) BEGIN
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
            'de4c9a0a-fab6-470c-9c1d-37980a8c2792',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'Reason',
            'Reason',
            'Optional explanation of why this diagnostic session was started (such as a ticket number or reproduction notes).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94dd344e-f20c-489f-8fd7-f5fa6e7ba19a' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'Status')) BEGIN
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
            '94dd344e-f20c-489f-8fd7-f5fa6e7ba19a',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'Status',
            'Status',
            'Current lifecycle status of the diagnostic session.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57d1c951-dfcf-4754-a3d1-3f13b6ecdbc1' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'ScopeType')) BEGIN
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
            '57d1c951-dfcf-4754-a3d1-3f13b6ecdbc1',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'ScopeType',
            'Scope Type',
            'Determines which incoming requests are matched and captured by this session.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Users',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '104f5ada-3d67-49d1-9486-7dc41c475183' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'ScopeJSON')) BEGIN
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
            '104f5ada-3d67-49d1-9486-7dc41c475183',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'ScopeJSON',
            'Scope JSON',
            'JSON specification of targeted UserIDs, APIKeyIDs, GraphQL/RemoteOperation names, or BrowserSessionID.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bf08c60-a005-4cc3-a730-6aa48bf64d86' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'Level')) BEGIN
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
            '3bf08c60-a005-4cc3-a730-6aa48bf64d86',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'Level',
            'Level',
            'Capture verbosity level applied to requests matched by this session.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Standard',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65051c13-cba4-4879-b0e6-e004ff972553' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'CategoriesJSON')) BEGIN
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
            '65051c13-cba4-4879-b0e6-e004ff972553',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'CategoriesJSON',
            'Categories JSON',
            'JSON array of diagnostic categories enabled for this session (e.g., Logs, SQL, Spans, Network, Telemetry).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3fe8ee6-f207-4242-b4d0-bfcd27a88ab6' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'ScrubLiterals')) BEGIN
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
            'f3fe8ee6-f207-4242-b4d0-bfcd27a88ab6',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'ScrubLiterals',
            'Scrub Literals',
            'When true, replaces inline SQL and filter string/number/UUID literals with ? placeholders in addition to mandatory credential scrubbing.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1564eaa6-84f0-4fa7-bf4d-3394d442a8b1' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'StartedAt')) BEGIN
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
            '1564eaa6-84f0-4fa7-bf4d-3394d442a8b1',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'StartedAt',
            'Started At',
            'UTC timestamp when the diagnostic session became active.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61f4070e-b90d-4f76-896e-c95ba652aaba' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'EndsAt')) BEGIN
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
            '61f4070e-b90d-4f76-896e-c95ba652aaba',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'EndsAt',
            'Ends At',
            'UTC timestamp when the diagnostic session automatically expires.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9b850ee-cfde-428c-8aed-5f3ffecbd40d' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'StoppedAt')) BEGIN
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
            'a9b850ee-cfde-428c-8aed-5f3ffecbd40d',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'StoppedAt',
            'Stopped At',
            'UTC timestamp when the diagnostic session was manually stopped.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8f29b3e-bc24-4bd6-b799-ea932025869b' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'MaxBytes')) BEGIN
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
            'd8f29b3e-bc24-4bd6-b799-ea932025869b',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'MaxBytes',
            'Max Bytes',
            'Maximum total compressed chunk bytes allowed for this session before capture stops (defaults to 50 MB).',
            'bigint',
            8,
            19,
            0,
            0,
            '(52428800)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e52bcee5-cc97-4d8b-94bc-2c95e5368f48' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'CreatedByUserID')) BEGIN
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
            'e52bcee5-cc97-4d8b-94bc-2c95e5368f48',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'CreatedByUserID',
            'Created By User ID',
            'User who initiated the diagnostic session.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5048c5fb-8b97-4270-9b9d-115dc22ac99f' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'CompanyID')) BEGIN
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
            '5048c5fb-8b97-4270-9b9d-115dc22ac99f',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
            'CompanyID',
            'Company ID',
            'Optional tenant CompanyID isolating session capture in multi-tenant deployments.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1446c757-b326-47a9-8823-1bce91c9938b' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1446c757-b326-47a9-8823-1bce91c9938b',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b9a235d-6609-4cbe-a6b0-c495ae9f368a' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7b9a235d-6609-4cbe-a6b0-c495ae9f368a',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
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

/* SQL text to insert entity field value with ID 9bcafe08-38be-4ed4-876e-46b1c3680beb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bcafe08-38be-4ed4-876e-46b1c3680beb', '94DD344E-F20C-489F-8FD7-F5FA6E7BA19A', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7842f677-05c6-422e-922b-304a8c4108d0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7842f677-05c6-422e-922b-304a8c4108d0', '94DD344E-F20C-489F-8FD7-F5FA6E7BA19A', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 97f59e2c-f90a-4d12-a558-0103d6960322 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('97f59e2c-f90a-4d12-a558-0103d6960322', '94DD344E-F20C-489F-8FD7-F5FA6E7BA19A', 3, 'Stopped', 'Stopped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 94DD344E-F20C-489F-8FD7-F5FA6E7BA19A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='94DD344E-F20C-489F-8FD7-F5FA6E7BA19A';

/* SQL text to insert entity field value with ID 9852436d-3991-4b17-a7e8-bd20210a4043 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9852436d-3991-4b17-a7e8-bd20210a4043', '57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1', 1, 'APIKeys', 'APIKeys', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f0cc14a-98bf-4fba-b312-9ba0ac101b9d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f0cc14a-98bf-4fba-b312-9ba0ac101b9d', '57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1', 2, 'BrowserSession', 'BrowserSession', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ffc0cf82-096a-4caa-a147-3bba74fcbda1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ffc0cf82-096a-4caa-a147-3bba74fcbda1', '57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1', 3, 'Instance', 'Instance', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f6d9325a-2911-40fb-8514-d6c7cc8d14f9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6d9325a-2911-40fb-8514-d6c7cc8d14f9', '57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1', 4, 'Operations', 'Operations', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 92308446-2d55-466e-86dc-1ac90de392ca */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('92308446-2d55-466e-86dc-1ac90de392ca', '57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1', 5, 'Users', 'Users', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1';

/* SQL text to insert entity field value with ID d007f459-2a8f-422e-af26-0ddc650b2c3c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d007f459-2a8f-422e-af26-0ddc650b2c3c', '3BF08C60-A005-4CC3-A730-6AA48BF64D86', 1, 'Debug', 'Debug', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 83a65d7b-b4bd-4c92-82f5-09c8439f747e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('83a65d7b-b4bd-4c92-82f5-09c8439f747e', '3BF08C60-A005-4CC3-A730-6AA48BF64D86', 2, 'Standard', 'Standard', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5230d3a1-e5f9-4524-81f6-3d191a5fa000 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5230d3a1-e5f9-4524-81f6-3d191a5fa000', '3BF08C60-A005-4CC3-A730-6AA48BF64D86', 3, 'Verbose', 'Verbose', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3BF08C60-A005-4CC3-A730-6AA48BF64D86 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3BF08C60-A005-4CC3-A730-6AA48BF64D86';

/* SQL text to insert entity field value with ID 0b678409-3010-425d-8a51-0367dea5b578 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0b678409-3010-425d-8a51-0367dea5b578', 'BC039DC4-E227-4836-B237-CB312EDB05E0', 1, 'Client', 'Client', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0515170f-1cc2-43d5-9600-6f876cc61c9f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0515170f-1cc2-43d5-9600-6f876cc61c9f', 'BC039DC4-E227-4836-B237-CB312EDB05E0', 2, 'Server', 'Server', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BC039DC4-E227-4836-B237-CB312EDB05E0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BC039DC4-E227-4836-B237-CB312EDB05E0';

/* SQL text to insert entity field value with ID 40c92434-53ed-4a3d-a3b3-9d4718c8954e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('40c92434-53ed-4a3d-a3b3-9d4718c8954e', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 1, 'App', 'App', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ac91d9eb-06e9-4a2e-870a-2ea1c108aebc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ac91d9eb-06e9-4a2e-870a-2ea1c108aebc', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 2, 'Errors', 'Errors', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4ab9aacd-b200-4e95-8af2-858229bed0fc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4ab9aacd-b200-4e95-8af2-858229bed0fc', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 3, 'Health', 'Health', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7bdfae4c-37e6-470d-bb19-93808b73822b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7bdfae4c-37e6-470d-bb19-93808b73822b', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 4, 'Logs', 'Logs', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 51979d71-1eed-473f-88ea-97af05b0fed0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('51979d71-1eed-473f-88ea-97af05b0fed0', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 5, 'Network', 'Network', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID acb1ffc0-060e-41bd-bf85-80e0dba86fcb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('acb1ffc0-060e-41bd-bf85-80e0dba86fcb', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 6, 'SQL', 'SQL', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 82f9ba29-83ec-40f2-9244-1d004c34e42e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82f9ba29-83ec-40f2-9244-1d004c34e42e', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 7, 'Spans', 'Spans', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b5830951-0d4f-4290-9de4-fd5deb3d56b7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b5830951-0d4f-4290-9de4-fd5deb3d56b7', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 8, 'Telemetry', 'Telemetry', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e94abecb-670f-4e09-a56a-c7ef6d466c70 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e94abecb-670f-4e09-a56a-c7ef6d466c70', 'E91151EA-695E-40F1-AC51-F918454DA4D0', 9, 'Timeline', 'Timeline', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E91151EA-695E-40F1-AC51-F918454DA4D0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E91151EA-695E-40F1-AC51-F918454DA4D0';

/* SQL text to insert entity field value with ID a932ef12-6f31-4fb5-8ae4-5c093eb2f519 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a932ef12-6f31-4fb5-8ae4-5c093eb2f519', '226B9CA7-5FDB-444D-99AC-618B573DC703', 1, 'Local', 'Local', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c542ba27-8292-4e5a-92b2-4b849de5d295 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c542ba27-8292-4e5a-92b2-4b849de5d295', '226B9CA7-5FDB-444D-99AC-618B573DC703', 2, 'Received', 'Received', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 226B9CA7-5FDB-444D-99AC-618B573DC703 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='226B9CA7-5FDB-444D-99AC-618B573DC703';

/* SQL text to insert entity field value with ID 9bc5a0d7-287e-4843-9145-494df039b593 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bc5a0d7-287e-4843-9145-494df039b593', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 1, 'Building', 'Building', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 39b5ac14-f0b6-4747-8340-f09bebd7fc94 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('39b5ac14-f0b6-4747-8340-f09bebd7fc94', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0a84b59c-8372-4447-933a-b74a7d94a63f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0a84b59c-8372-4447-933a-b74a7d94a63f', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7f4ed990-fdeb-45af-b515-efd620784524 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7f4ed990-fdeb-45af-b515-efd620784524', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 4, 'Ready', 'Ready', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a5e7d5ce-b521-4e6b-b733-5515654d6cbf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a5e7d5ce-b521-4e6b-b733-5515654d6cbf', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 5, 'Receiving', 'Receiving', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 86f64637-95f5-4988-a09e-07c60407c445 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('86f64637-95f5-4988-a09e-07c60407c445', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 6, 'Sending', 'Sending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 67677e54-ecef-4f88-ba85-ff2dc7d365e2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('67677e54-ecef-4f88-ba85-ff2dc7d365e2', '469602A1-9D6F-48AA-AD64-B70A48FEF38E', 7, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 469602A1-9D6F-48AA-AD64-B70A48FEF38E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='469602A1-9D6F-48AA-AD64-B70A48FEF38E';

/* SQL text to insert entity field value with ID 80ba450f-2083-4500-8d5f-f5cf4cec3db4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('80ba450f-2083-4500-8d5f-f5cf4cec3db4', '64E2435A-02C6-4688-ABA3-B05612E69EAD', 1, 'CustomerCollector', 'CustomerCollector', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 44d29376-3883-4635-9ae1-f3c181f1391f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('44d29376-3883-4635-9ae1-f3c181f1391f', '64E2435A-02C6-4688-ABA3-B05612E69EAD', 2, 'MJC', 'MJC', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ea3c42cd-3acc-49dd-b4e9-2fcd6dcfa512 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ea3c42cd-3acc-49dd-b4e9-2fcd6dcfa512', '64E2435A-02C6-4688-ABA3-B05612E69EAD', 3, 'StorageAccount', 'StorageAccount', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 64E2435A-02C6-4688-ABA3-B05612E69EAD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='64E2435A-02C6-4688-ABA3-B05612E69EAD';

/* SQL text to insert entity field value with ID 5ce85ecd-5f18-41e7-8ed8-6c600e22d740 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ce85ecd-5f18-41e7-8ed8-6c600e22d740', '620F41D8-532D-420D-BFD0-549E404DFC34', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ef4c0f19-6a76-4cac-b8c7-b4ec8d539539 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef4c0f19-6a76-4cac-b8c7-b4ec8d539539', '620F41D8-532D-420D-BFD0-549E404DFC34', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c05e59b5-af9f-405f-a647-045e4a0599b4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c05e59b5-af9f-405f-a647-045e4a0599b4', '620F41D8-532D-420D-BFD0-549E404DFC34', 3, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 620F41D8-532D-420D-BFD0-549E404DFC34 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='620F41D8-532D-420D-BFD0-549E404DFC34';

/* SQL text to insert entity field value with ID e7d49c87-d867-4dba-b9e5-33e9b5c6bacf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e7d49c87-d867-4dba-b9e5-33e9b5c6bacf', 'D33265B5-34FE-4765-A09C-C3DD5212BA6B', 1, 'Ed25519', 'Ed25519', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D33265B5-34FE-4765-A09C-C3DD5212BA6B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D33265B5-34FE-4765-A09C-C3DD5212BA6B';

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Companies -> MJ: Diagnostic Bundles (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ba68e05b-5254-44a1-be20-2d8a2c848959' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ba68e05b-5254-44a1-be20-2d8a2c848959', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'CompanyID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Companies -> MJ: Diagnostic Sessions (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9051985e-2f7e-4de5-ab38-ddd3c8542598' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9051985e-2f7e-4de5-ab38-ddd3c8542598', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'D83818A2-E62D-40EA-9243-C2D1175411AC', 'CompanyID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Bundles (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5fd21170-5e0d-4f8f-ac3c-ccaa233fcb5a' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5fd21170-5e0d-4f8f-ac3c-ccaa233fcb5a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'CreatedByUserID', 'One To Many', 1, 1, 126, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Bundles (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'adda12fb-cee2-477d-82ba-eff2c32c677e' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [RelatedEntityJoinField] = 'ApprovedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('adda12fb-cee2-477d-82ba-eff2c32c677e', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'ApprovedByUserID', 'One To Many', 1, 1, 127, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Sessions (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '17e0d1e6-2b06-4020-a43b-f36d2986dae3' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('17e0d1e6-2b06-4020-a43b-f36d2986dae3', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D83818A2-E62D-40EA-9243-C2D1175411AC', 'CreatedByUserID', 'One To Many', 1, 1, 128, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: Diagnostic Bundles (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4eb34d16-9cf0-4409-94af-9d80ed739b2f' OR ([EntityID] = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [RelatedEntityJoinField] = 'FileID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4eb34d16-9cf0-4409-94af-9d80ed739b2f', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'FileID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Session Chunks (One To Many via DiagnosticSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '564f7cd9-c80c-43a3-b464-48c84f506ca8' OR ([EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND [RelatedEntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND [RelatedEntityJoinField] = 'DiagnosticSessionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('564f7cd9-c80c-43a3-b464-48c84f506ca8', 'D83818A2-E62D-40EA-9243-C2D1175411AC', 'A5B20694-EC9E-4BEB-A402-0081504AA78B', 'DiagnosticSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Bundles (One To Many via DiagnosticSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e02d963d-097d-49b5-8670-ef611ce7fc77' OR ([EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND [RelatedEntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [RelatedEntityJoinField] = 'DiagnosticSessionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e02d963d-097d-49b5-8670-ef611ce7fc77', 'D83818A2-E62D-40EA-9243-C2D1175411AC', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'DiagnosticSessionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for DiagnosticBundle */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DiagnosticSessionID in table DiagnosticBundle
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_DiagnosticSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_DiagnosticSessionID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([DiagnosticSessionID]);

-- Index for foreign key FileID in table DiagnosticBundle
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_FileID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([FileID]);

-- Index for foreign key CreatedByUserID in table DiagnosticBundle
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_CreatedByUserID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([CreatedByUserID]);

-- Index for foreign key ApprovedByUserID in table DiagnosticBundle
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_ApprovedByUserID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([ApprovedByUserID]);

-- Index for foreign key CompanyID in table DiagnosticBundle
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_CompanyID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID CDEC5719-7946-4367-884F-FFB3BC620CBC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CDEC5719-7946-4367-884F-FFB3BC620CBC', @RelatedEntityNameFieldMap='DiagnosticSession';

/* Index for Foreign Keys for DiagnosticSenderRegistration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for DiagnosticSessionChunk */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DiagnosticSessionID in table DiagnosticSessionChunk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticSessionChunk_DiagnosticSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticSessionChunk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticSessionChunk_DiagnosticSessionID ON [${flyway:defaultSchema}].[DiagnosticSessionChunk] ([DiagnosticSessionID]);

/* SQL text to update entity field related entity name field map for entity field ID 72168BCA-4B51-457B-AFC9-167326FBE1A4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='72168BCA-4B51-457B-AFC9-167326FBE1A4', @RelatedEntityNameFieldMap='DiagnosticSession';

/* Index for Foreign Keys for DiagnosticSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CreatedByUserID in table DiagnosticSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticSession_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticSession_CreatedByUserID ON [${flyway:defaultSchema}].[DiagnosticSession] ([CreatedByUserID]);

-- Index for foreign key CompanyID in table DiagnosticSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticSession_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticSession_CompanyID ON [${flyway:defaultSchema}].[DiagnosticSession] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID E52BCEE5-CC97-4D8B-94BC-2C95E5368F48 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E52BCEE5-CC97-4D8B-94BC-2C95E5368F48', @RelatedEntityNameFieldMap='CreatedByUser';

/* Base View SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: vwDiagnosticSenderRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Sender Registrations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticSenderRegistration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations]
AS
SELECT
    d.*
FROM
    [${flyway:defaultSchema}].[DiagnosticSenderRegistration] AS d
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: Permissions for vwDiagnosticSenderRegistrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: spCreateDiagnosticSenderRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticSenderRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration]
    @ID uniqueidentifier = NULL,
    @InstallID nvarchar(100),
    @Name nvarchar(255),
    @Status nvarchar(20) = NULL,
    @KeyAlgorithm nvarchar(20) = NULL,
    @KeyID_Clear bit = 0,
    @KeyID nvarchar(100) = NULL,
    @PublicKeyBase64_Clear bit = 0,
    @PublicKeyBase64 nvarchar(255) = NULL,
    @RegistrationCodeHash_Clear bit = 0,
    @RegistrationCodeHash nvarchar(128) = NULL,
    @RegistrationCodeExpiresAt_Clear bit = 0,
    @RegistrationCodeExpiresAt datetimeoffset = NULL,
    @EnrolledAt_Clear bit = 0,
    @EnrolledAt datetimeoffset = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @MaxBundlesPerDay int = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
            (
                [ID],
                [InstallID],
                [Name],
                [Status],
                [KeyAlgorithm],
                [KeyID],
                [PublicKeyBase64],
                [RegistrationCodeHash],
                [RegistrationCodeExpiresAt],
                [EnrolledAt],
                [RevokedAt],
                [LastSeenAt],
                [MaxBundlesPerDay],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @InstallID,
                @Name,
                ISNULL(@Status, 'Pending'),
                ISNULL(@KeyAlgorithm, 'Ed25519'),
                CASE WHEN @KeyID_Clear = 1 THEN NULL ELSE ISNULL(@KeyID, NULL) END,
                CASE WHEN @PublicKeyBase64_Clear = 1 THEN NULL ELSE ISNULL(@PublicKeyBase64, NULL) END,
                CASE WHEN @RegistrationCodeHash_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeHash, NULL) END,
                CASE WHEN @RegistrationCodeExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeExpiresAt, NULL) END,
                CASE WHEN @EnrolledAt_Clear = 1 THEN NULL ELSE ISNULL(@EnrolledAt, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                ISNULL(@MaxBundlesPerDay, 20),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
            (
                [InstallID],
                [Name],
                [Status],
                [KeyAlgorithm],
                [KeyID],
                [PublicKeyBase64],
                [RegistrationCodeHash],
                [RegistrationCodeExpiresAt],
                [EnrolledAt],
                [RevokedAt],
                [LastSeenAt],
                [MaxBundlesPerDay],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @InstallID,
                @Name,
                ISNULL(@Status, 'Pending'),
                ISNULL(@KeyAlgorithm, 'Ed25519'),
                CASE WHEN @KeyID_Clear = 1 THEN NULL ELSE ISNULL(@KeyID, NULL) END,
                CASE WHEN @PublicKeyBase64_Clear = 1 THEN NULL ELSE ISNULL(@PublicKeyBase64, NULL) END,
                CASE WHEN @RegistrationCodeHash_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeHash, NULL) END,
                CASE WHEN @RegistrationCodeExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeExpiresAt, NULL) END,
                CASE WHEN @EnrolledAt_Clear = 1 THEN NULL ELSE ISNULL(@EnrolledAt, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                ISNULL(@MaxBundlesPerDay, 20),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Sender Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: spUpdateDiagnosticSenderRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticSenderRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration]
    @ID uniqueidentifier,
    @InstallID nvarchar(100) = NULL,
    @Name nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @KeyAlgorithm nvarchar(20) = NULL,
    @KeyID_Clear bit = 0,
    @KeyID nvarchar(100) = NULL,
    @PublicKeyBase64_Clear bit = 0,
    @PublicKeyBase64 nvarchar(255) = NULL,
    @RegistrationCodeHash_Clear bit = 0,
    @RegistrationCodeHash nvarchar(128) = NULL,
    @RegistrationCodeExpiresAt_Clear bit = 0,
    @RegistrationCodeExpiresAt datetimeoffset = NULL,
    @EnrolledAt_Clear bit = 0,
    @EnrolledAt datetimeoffset = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @MaxBundlesPerDay int = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
    SET
        [InstallID] = ISNULL(@InstallID, [InstallID]),
        [Name] = ISNULL(@Name, [Name]),
        [Status] = ISNULL(@Status, [Status]),
        [KeyAlgorithm] = ISNULL(@KeyAlgorithm, [KeyAlgorithm]),
        [KeyID] = CASE WHEN @KeyID_Clear = 1 THEN NULL ELSE ISNULL(@KeyID, [KeyID]) END,
        [PublicKeyBase64] = CASE WHEN @PublicKeyBase64_Clear = 1 THEN NULL ELSE ISNULL(@PublicKeyBase64, [PublicKeyBase64]) END,
        [RegistrationCodeHash] = CASE WHEN @RegistrationCodeHash_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeHash, [RegistrationCodeHash]) END,
        [RegistrationCodeExpiresAt] = CASE WHEN @RegistrationCodeExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@RegistrationCodeExpiresAt, [RegistrationCodeExpiresAt]) END,
        [EnrolledAt] = CASE WHEN @EnrolledAt_Clear = 1 THEN NULL ELSE ISNULL(@EnrolledAt, [EnrolledAt]) END,
        [RevokedAt] = CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, [RevokedAt]) END,
        [LastSeenAt] = CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, [LastSeenAt]) END,
        [MaxBundlesPerDay] = ISNULL(@MaxBundlesPerDay, [MaxBundlesPerDay]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticSenderRegistrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSenderRegistration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticSenderRegistration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticSenderRegistration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticSenderRegistration
ON [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Sender Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Sender Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sender Registrations
-- Item: spDeleteDiagnosticSenderRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticSenderRegistration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticSenderRegistration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Sender Registrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSenderRegistration] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID D3335A61-8BD1-4416-90EA-AC65269D7B80 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D3335A61-8BD1-4416-90EA-AC65269D7B80', @RelatedEntityNameFieldMap='File';

/* SQL text to update entity field related entity name field map for entity field ID 5048C5FB-8B97-4270-9B9D-115DC22AC99F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5048C5FB-8B97-4270-9B9D-115DC22AC99F', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: vwDiagnosticSessionChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Session Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticSessionChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticSessionChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticSessionChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticSessionChunks]
AS
SELECT
    d.*,
    MJDiagnosticSession_DiagnosticSessionID.[Name] AS [DiagnosticSession]
FROM
    [${flyway:defaultSchema}].[DiagnosticSessionChunk] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DiagnosticSession] AS MJDiagnosticSession_DiagnosticSessionID
  ON
    [d].[DiagnosticSessionID] = MJDiagnosticSession_DiagnosticSessionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: Permissions for vwDiagnosticSessionChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: spCreateDiagnosticSessionChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticSessionChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk]
    @ID uniqueidentifier = NULL,
    @DiagnosticSessionID uniqueidentifier,
    @Source nvarchar(20),
    @HostInstanceLabel nvarchar(255),
    @Sequence int,
    @ContentKind nvarchar(30),
    @Data varbinary(MAX),
    @EntryCount int = NULL,
    @FirstEntryAt_Clear bit = 0,
    @FirstEntryAt datetimeoffset = NULL,
    @LastEntryAt_Clear bit = 0,
    @LastEntryAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSessionChunk]
            (
                [ID],
                [DiagnosticSessionID],
                [Source],
                [HostInstanceLabel],
                [Sequence],
                [ContentKind],
                [Data],
                [EntryCount],
                [FirstEntryAt],
                [LastEntryAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DiagnosticSessionID,
                @Source,
                @HostInstanceLabel,
                @Sequence,
                @ContentKind,
                @Data,
                ISNULL(@EntryCount, 0),
                CASE WHEN @FirstEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstEntryAt, NULL) END,
                CASE WHEN @LastEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEntryAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSessionChunk]
            (
                [DiagnosticSessionID],
                [Source],
                [HostInstanceLabel],
                [Sequence],
                [ContentKind],
                [Data],
                [EntryCount],
                [FirstEntryAt],
                [LastEntryAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DiagnosticSessionID,
                @Source,
                @HostInstanceLabel,
                @Sequence,
                @ContentKind,
                @Data,
                ISNULL(@EntryCount, 0),
                CASE WHEN @FirstEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstEntryAt, NULL) END,
                CASE WHEN @LastEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEntryAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Session Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: spUpdateDiagnosticSessionChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticSessionChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk]
    @ID uniqueidentifier,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Source nvarchar(20) = NULL,
    @HostInstanceLabel nvarchar(255) = NULL,
    @Sequence int = NULL,
    @ContentKind nvarchar(30) = NULL,
    @Data varbinary(MAX) = NULL,
    @EntryCount int = NULL,
    @FirstEntryAt_Clear bit = 0,
    @FirstEntryAt datetimeoffset = NULL,
    @LastEntryAt_Clear bit = 0,
    @LastEntryAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSessionChunk]
    SET
        [DiagnosticSessionID] = ISNULL(@DiagnosticSessionID, [DiagnosticSessionID]),
        [Source] = ISNULL(@Source, [Source]),
        [HostInstanceLabel] = ISNULL(@HostInstanceLabel, [HostInstanceLabel]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ContentKind] = ISNULL(@ContentKind, [ContentKind]),
        [Data] = ISNULL(@Data, [Data]),
        [EntryCount] = ISNULL(@EntryCount, [EntryCount]),
        [FirstEntryAt] = CASE WHEN @FirstEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstEntryAt, [FirstEntryAt]) END,
        [LastEntryAt] = CASE WHEN @LastEntryAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEntryAt, [LastEntryAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticSessionChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSessionChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticSessionChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticSessionChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticSessionChunk
ON [${flyway:defaultSchema}].[DiagnosticSessionChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSessionChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticSessionChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Session Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Session Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Session Chunks
-- Item: spDeleteDiagnosticSessionChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticSessionChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticSessionChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Session Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 666A271A-40FE-4ADC-9FE0-D52E64F82D3E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='666A271A-40FE-4ADC-9FE0-D52E64F82D3E', @RelatedEntityNameFieldMap='CreatedByUser';

/* Base View SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: vwDiagnosticSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticSessions]
AS
SELECT
    d.*,
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[DiagnosticSession] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [d].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [d].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: Permissions for vwDiagnosticSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: spCreateDiagnosticSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSession]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ScopeType nvarchar(30) = NULL,
    @ScopeJSON_Clear bit = 0,
    @ScopeJSON nvarchar(MAX) = NULL,
    @Level nvarchar(20) = NULL,
    @CategoriesJSON_Clear bit = 0,
    @CategoriesJSON nvarchar(MAX) = NULL,
    @ScrubLiterals bit = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndsAt datetimeoffset,
    @StoppedAt_Clear bit = 0,
    @StoppedAt datetimeoffset = NULL,
    @MaxBytes bigint = NULL,
    @CreatedByUserID uniqueidentifier,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSession]
            (
                [ID],
                [Name],
                [Reason],
                [Status],
                [ScopeType],
                [ScopeJSON],
                [Level],
                [CategoriesJSON],
                [ScrubLiterals],
                [StartedAt],
                [EndsAt],
                [StoppedAt],
                [MaxBytes],
                [CreatedByUserID],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@ScopeType, 'Users'),
                CASE WHEN @ScopeJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeJSON, NULL) END,
                ISNULL(@Level, 'Standard'),
                CASE WHEN @CategoriesJSON_Clear = 1 THEN NULL ELSE ISNULL(@CategoriesJSON, NULL) END,
                ISNULL(@ScrubLiterals, 0),
                ISNULL(@StartedAt, getutcdate()),
                @EndsAt,
                CASE WHEN @StoppedAt_Clear = 1 THEN NULL ELSE ISNULL(@StoppedAt, NULL) END,
                ISNULL(@MaxBytes, 52428800),
                @CreatedByUserID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticSession]
            (
                [Name],
                [Reason],
                [Status],
                [ScopeType],
                [ScopeJSON],
                [Level],
                [CategoriesJSON],
                [ScrubLiterals],
                [StartedAt],
                [EndsAt],
                [StoppedAt],
                [MaxBytes],
                [CreatedByUserID],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@ScopeType, 'Users'),
                CASE WHEN @ScopeJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeJSON, NULL) END,
                ISNULL(@Level, 'Standard'),
                CASE WHEN @CategoriesJSON_Clear = 1 THEN NULL ELSE ISNULL(@CategoriesJSON, NULL) END,
                ISNULL(@ScrubLiterals, 0),
                ISNULL(@StartedAt, getutcdate()),
                @EndsAt,
                CASE WHEN @StoppedAt_Clear = 1 THEN NULL ELSE ISNULL(@StoppedAt, NULL) END,
                ISNULL(@MaxBytes, 52428800),
                @CreatedByUserID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: spUpdateDiagnosticSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSession]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ScopeType nvarchar(30) = NULL,
    @ScopeJSON_Clear bit = 0,
    @ScopeJSON nvarchar(MAX) = NULL,
    @Level nvarchar(20) = NULL,
    @CategoriesJSON_Clear bit = 0,
    @CategoriesJSON nvarchar(MAX) = NULL,
    @ScrubLiterals bit = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndsAt datetimeoffset = NULL,
    @StoppedAt_Clear bit = 0,
    @StoppedAt datetimeoffset = NULL,
    @MaxBytes bigint = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSession]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ScopeType] = ISNULL(@ScopeType, [ScopeType]),
        [ScopeJSON] = CASE WHEN @ScopeJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeJSON, [ScopeJSON]) END,
        [Level] = ISNULL(@Level, [Level]),
        [CategoriesJSON] = CASE WHEN @CategoriesJSON_Clear = 1 THEN NULL ELSE ISNULL(@CategoriesJSON, [CategoriesJSON]) END,
        [ScrubLiterals] = ISNULL(@ScrubLiterals, [ScrubLiterals]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndsAt] = ISNULL(@EndsAt, [EndsAt]),
        [StoppedAt] = CASE WHEN @StoppedAt_Clear = 1 THEN NULL ELSE ISNULL(@StoppedAt, [StoppedAt]) END,
        [MaxBytes] = ISNULL(@MaxBytes, [MaxBytes]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticSession
ON [${flyway:defaultSchema}].[DiagnosticSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Sessions
-- Item: spDeleteDiagnosticSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSession] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID B0E50D95-6BE4-4F3B-A71A-EBBB2DB48101 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B0E50D95-6BE4-4F3B-A71A-EBBB2DB48101', @RelatedEntityNameFieldMap='ApprovedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 10F82559-AE1F-451F-AD0A-00D509D58C8A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='10F82559-AE1F-451F-AD0A-00D509D58C8A', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: vwDiagnosticBundles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Bundles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DiagnosticBundle
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticBundles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticBundles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticBundles]
AS
SELECT
    d.*,
    MJDiagnosticSession_DiagnosticSessionID.[Name] AS [DiagnosticSession],
    MJFile_FileID.[Name] AS [File],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser],
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[DiagnosticBundle] AS d
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DiagnosticSession] AS MJDiagnosticSession_DiagnosticSessionID
  ON
    [d].[DiagnosticSessionID] = MJDiagnosticSession_DiagnosticSessionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [d].[FileID] = MJFile_FileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [d].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [d].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: Permissions for vwDiagnosticBundles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: spCreateDiagnosticBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DiagnosticBundle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticBundle]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Direction nvarchar(20) = NULL,
    @DiagnosticSessionID_Clear bit = 0,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ScrubLiterals bit = NULL,
    @WindowStart_Clear bit = 0,
    @WindowStart datetimeoffset = NULL,
    @WindowEnd_Clear bit = 0,
    @WindowEnd datetimeoffset = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data varbinary(MAX) = NULL,
    @SizeBytes bigint = NULL,
    @SHA256_Clear bit = 0,
    @SHA256 nchar(64) = NULL,
    @ManifestJSON_Clear bit = 0,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ScrubReportJSON_Clear bit = 0,
    @ScrubReportJSON nvarchar(MAX) = NULL,
    @FindingsJSON_Clear bit = 0,
    @FindingsJSON nvarchar(MAX) = NULL,
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(MAX) = NULL,
    @CreatedByUserID_Clear bit = 0,
    @CreatedByUserID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @Destination_Clear bit = 0,
    @Destination nvarchar(30) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(255) = NULL,
    @SenderInstallID_Clear bit = 0,
    @SenderInstallID uniqueidentifier = NULL,
    @SenderMJVersion_Clear bit = 0,
    @SenderMJVersion nvarchar(50) = NULL,
    @ContactInfo_Clear bit = 0,
    @ContactInfo nvarchar(500) = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticBundle]
            (
                [ID],
                [Name],
                [Description],
                [Direction],
                [DiagnosticSessionID],
                [Status],
                [ScrubLiterals],
                [WindowStart],
                [WindowEnd],
                [FileID],
                [Data],
                [SizeBytes],
                [SHA256],
                [ManifestJSON],
                [ScrubReportJSON],
                [FindingsJSON],
                [FailureReason],
                [CreatedByUserID],
                [ApprovedByUserID],
                [ApprovedAt],
                [Destination],
                [SentAt],
                [ExternalReferenceID],
                [SenderInstallID],
                [SenderMJVersion],
                [ContactInfo],
                [ExpiresAt],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Direction, 'Local'),
                CASE WHEN @DiagnosticSessionID_Clear = 1 THEN NULL ELSE ISNULL(@DiagnosticSessionID, NULL) END,
                ISNULL(@Status, 'Building'),
                ISNULL(@ScrubLiterals, 0),
                CASE WHEN @WindowStart_Clear = 1 THEN NULL ELSE ISNULL(@WindowStart, NULL) END,
                CASE WHEN @WindowEnd_Clear = 1 THEN NULL ELSE ISNULL(@WindowEnd, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                ISNULL(@SizeBytes, 0),
                CASE WHEN @SHA256_Clear = 1 THEN NULL ELSE ISNULL(@SHA256, NULL) END,
                CASE WHEN @ManifestJSON_Clear = 1 THEN NULL ELSE ISNULL(@ManifestJSON, NULL) END,
                CASE WHEN @ScrubReportJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScrubReportJSON, NULL) END,
                CASE WHEN @FindingsJSON_Clear = 1 THEN NULL ELSE ISNULL(@FindingsJSON, NULL) END,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @Destination_Clear = 1 THEN NULL ELSE ISNULL(@Destination, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @SenderInstallID_Clear = 1 THEN NULL ELSE ISNULL(@SenderInstallID, NULL) END,
                CASE WHEN @SenderMJVersion_Clear = 1 THEN NULL ELSE ISNULL(@SenderMJVersion, NULL) END,
                CASE WHEN @ContactInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactInfo, NULL) END,
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DiagnosticBundle]
            (
                [Name],
                [Description],
                [Direction],
                [DiagnosticSessionID],
                [Status],
                [ScrubLiterals],
                [WindowStart],
                [WindowEnd],
                [FileID],
                [Data],
                [SizeBytes],
                [SHA256],
                [ManifestJSON],
                [ScrubReportJSON],
                [FindingsJSON],
                [FailureReason],
                [CreatedByUserID],
                [ApprovedByUserID],
                [ApprovedAt],
                [Destination],
                [SentAt],
                [ExternalReferenceID],
                [SenderInstallID],
                [SenderMJVersion],
                [ContactInfo],
                [ExpiresAt],
                [CompanyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Direction, 'Local'),
                CASE WHEN @DiagnosticSessionID_Clear = 1 THEN NULL ELSE ISNULL(@DiagnosticSessionID, NULL) END,
                ISNULL(@Status, 'Building'),
                ISNULL(@ScrubLiterals, 0),
                CASE WHEN @WindowStart_Clear = 1 THEN NULL ELSE ISNULL(@WindowStart, NULL) END,
                CASE WHEN @WindowEnd_Clear = 1 THEN NULL ELSE ISNULL(@WindowEnd, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                ISNULL(@SizeBytes, 0),
                CASE WHEN @SHA256_Clear = 1 THEN NULL ELSE ISNULL(@SHA256, NULL) END,
                CASE WHEN @ManifestJSON_Clear = 1 THEN NULL ELSE ISNULL(@ManifestJSON, NULL) END,
                CASE WHEN @ScrubReportJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScrubReportJSON, NULL) END,
                CASE WHEN @FindingsJSON_Clear = 1 THEN NULL ELSE ISNULL(@FindingsJSON, NULL) END,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END,
                CASE WHEN @Destination_Clear = 1 THEN NULL ELSE ISNULL(@Destination, NULL) END,
                CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @SenderInstallID_Clear = 1 THEN NULL ELSE ISNULL(@SenderInstallID, NULL) END,
                CASE WHEN @SenderMJVersion_Clear = 1 THEN NULL ELSE ISNULL(@SenderMJVersion, NULL) END,
                CASE WHEN @ContactInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactInfo, NULL) END,
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Diagnostic Bundles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: spUpdateDiagnosticBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DiagnosticBundle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticBundle]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Direction nvarchar(20) = NULL,
    @DiagnosticSessionID_Clear bit = 0,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ScrubLiterals bit = NULL,
    @WindowStart_Clear bit = 0,
    @WindowStart datetimeoffset = NULL,
    @WindowEnd_Clear bit = 0,
    @WindowEnd datetimeoffset = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data varbinary(MAX) = NULL,
    @SizeBytes bigint = NULL,
    @SHA256_Clear bit = 0,
    @SHA256 nchar(64) = NULL,
    @ManifestJSON_Clear bit = 0,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ScrubReportJSON_Clear bit = 0,
    @ScrubReportJSON nvarchar(MAX) = NULL,
    @FindingsJSON_Clear bit = 0,
    @FindingsJSON nvarchar(MAX) = NULL,
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(MAX) = NULL,
    @CreatedByUserID_Clear bit = 0,
    @CreatedByUserID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL,
    @Destination_Clear bit = 0,
    @Destination nvarchar(30) = NULL,
    @SentAt_Clear bit = 0,
    @SentAt datetimeoffset = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(255) = NULL,
    @SenderInstallID_Clear bit = 0,
    @SenderInstallID uniqueidentifier = NULL,
    @SenderMJVersion_Clear bit = 0,
    @SenderMJVersion nvarchar(50) = NULL,
    @ContactInfo_Clear bit = 0,
    @ContactInfo nvarchar(500) = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticBundle]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Direction] = ISNULL(@Direction, [Direction]),
        [DiagnosticSessionID] = CASE WHEN @DiagnosticSessionID_Clear = 1 THEN NULL ELSE ISNULL(@DiagnosticSessionID, [DiagnosticSessionID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ScrubLiterals] = ISNULL(@ScrubLiterals, [ScrubLiterals]),
        [WindowStart] = CASE WHEN @WindowStart_Clear = 1 THEN NULL ELSE ISNULL(@WindowStart, [WindowStart]) END,
        [WindowEnd] = CASE WHEN @WindowEnd_Clear = 1 THEN NULL ELSE ISNULL(@WindowEnd, [WindowEnd]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [SizeBytes] = ISNULL(@SizeBytes, [SizeBytes]),
        [SHA256] = CASE WHEN @SHA256_Clear = 1 THEN NULL ELSE ISNULL(@SHA256, [SHA256]) END,
        [ManifestJSON] = CASE WHEN @ManifestJSON_Clear = 1 THEN NULL ELSE ISNULL(@ManifestJSON, [ManifestJSON]) END,
        [ScrubReportJSON] = CASE WHEN @ScrubReportJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScrubReportJSON, [ScrubReportJSON]) END,
        [FindingsJSON] = CASE WHEN @FindingsJSON_Clear = 1 THEN NULL ELSE ISNULL(@FindingsJSON, [FindingsJSON]) END,
        [FailureReason] = CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, [FailureReason]) END,
        [CreatedByUserID] = CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, [CreatedByUserID]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END,
        [Destination] = CASE WHEN @Destination_Clear = 1 THEN NULL ELSE ISNULL(@Destination, [Destination]) END,
        [SentAt] = CASE WHEN @SentAt_Clear = 1 THEN NULL ELSE ISNULL(@SentAt, [SentAt]) END,
        [ExternalReferenceID] = CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, [ExternalReferenceID]) END,
        [SenderInstallID] = CASE WHEN @SenderInstallID_Clear = 1 THEN NULL ELSE ISNULL(@SenderInstallID, [SenderInstallID]) END,
        [SenderMJVersion] = CASE WHEN @SenderMJVersion_Clear = 1 THEN NULL ELSE ISNULL(@SenderMJVersion, [SenderMJVersion]) END,
        [ContactInfo] = CASE WHEN @ContactInfo_Clear = 1 THEN NULL ELSE ISNULL(@ContactInfo, [ContactInfo]) END,
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDiagnosticBundles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticBundle table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDiagnosticBundle]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDiagnosticBundle];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDiagnosticBundle
ON [${flyway:defaultSchema}].[DiagnosticBundle]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticBundle]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DiagnosticBundle] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Diagnostic Bundles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Diagnostic Bundles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Diagnostic Bundles
-- Item: spDeleteDiagnosticBundle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DiagnosticBundle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticBundle]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DiagnosticBundle]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Diagnostic Bundles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fd02426-cdd3-4c0b-9851-5e40ef242ff5' OR (EntityID = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND Name = 'DiagnosticSession')) BEGIN
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
            '6fd02426-cdd3-4c0b-9851-5e40ef242ff5',
            'A5B20694-EC9E-4BEB-A402-0081504AA78B', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B'),
            'DiagnosticSession',
            'Diagnostic Session',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11ebfa09-30d0-4569-aca7-a732a3390506' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'DiagnosticSession')) BEGIN
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
            '11ebfa09-30d0-4569-aca7-a732a3390506',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'DiagnosticSession',
            'Diagnostic Session',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e6c5053-4336-479f-9557-fd78e1ff0251' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'File')) BEGIN
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
            '0e6c5053-4336-479f-9557-fd78e1ff0251',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c24d38a-02c8-458a-b585-c7cea8317929' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'CreatedByUser')) BEGIN
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
            '9c24d38a-02c8-458a-b585-c7cea8317929',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2efd21a-7610-47ad-906f-6783e59768ed' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'ApprovedByUser')) BEGIN
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
            'd2efd21a-7610-47ad-906f-6783e59768ed',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
            'ApprovedByUser',
            'Approved By User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '903a950a-55cc-4286-99ba-5bcda1b7bda8' OR (EntityID = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND Name = 'Company')) BEGIN
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
            '903a950a-55cc-4286-99ba-5bcda1b7bda8',
            'D3AAD653-5B9A-4075-94C0-A2A490823D4E', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39da2564-48cf-4dd4-a133-d424397ef39c' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'CreatedByUser')) BEGIN
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
            '39da2564-48cf-4dd4-a133-d424397ef39c',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9c29344-20a5-44f2-9a44-eed9a294c58c' OR (EntityID = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND Name = 'Company')) BEGIN
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
            'f9c29344-20a5-44f2-9a44-eed9a294c58c',
            'D83818A2-E62D-40EA-9243-C2D1175411AC', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC'),
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
               WHERE ID = '469602A1-9D6F-48AA-AD64-B70A48FEF38E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CE1B783E-7AFB-4C66-A0C8-359C24DCBD11'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '64E2435A-02C6-4688-ABA3-B05612E69EAD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D464283C-4AC5-4365-B614-D61FFC045E3E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '21106266-910E-43AB-ABE3-AA5ED911314D'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '229552F8-6C5F-4CB2-B279-E4655732C2A5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '92469C19-5EA5-42DF-B466-CC3DB5B7740B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '23C5308D-2C15-46A6-BC53-16ADACC8FB74'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C63DBEB8-CB74-415C-A8B2-AC20FC66BFA6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '23C5308D-2C15-46A6-BC53-16ADACC8FB74'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'E91151EA-695E-40F1-AC51-F918454DA4D0'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E91151EA-695E-40F1-AC51-F918454DA4D0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DEB5678D-EC9B-4DB8-B1CD-EC3EF7CDA71A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '01F2994D-8667-4834-B9F5-B05B23303C24'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6FD02426-CDD3-4C0B-9851-5E40EF242FF5'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3BF08C60-A005-4CC3-A730-6AA48BF64D86'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1564EAA6-84F0-4FA7-BF4D-3394D442A8B1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '754FF87B-8341-453A-975D-AB9CAAE553E2'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '92210665-7CBE-464D-A0F3-321349BB576B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.DiagnosticSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Diagnostic Session'
WHERE 
   ID = '72168BCA-4B51-457B-AFC9-167326FBE1A4';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.DiagnosticSession 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6FD02426-CDD3-4C0B-9851-5E40EF242FF5';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BC039DC4-E227-4836-B237-CB312EDB05E0';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.HostInstanceLabel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '42D629E0-CEF2-447E-84D2-124BFCC82A47';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '61C5F07F-89F7-48C3-BEB4-8354A88C0423';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.ContentKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E91151EA-695E-40F1-AC51-F918454DA4D0';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '78DB8811-5731-4F94-B5E3-9F44CCDFA766';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.EntryCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DEB5678D-EC9B-4DB8-B1CD-EC3EF7CDA71A';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.FirstEntryAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '01F2994D-8667-4834-B9F5-B05B23303C24';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.LastEntryAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '94A9FC0E-6770-4394-AB47-CE152192CC10';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '18D6E6B6-4D05-4865-91BF-D0650E25E12E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '52934C2D-FFB4-4EF9-9416-73EC4ED4C1A9';

/* Set entity icon to fa fa-database */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-database', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('72570627-cd80-5774-888d-d919c0840554', 'A5B20694-EC9E-4BEB-A402-0081504AA78B', 'FieldCategoryInfo', '{
  "Chunk Details": {
    "description": "Payload contents, sequence, and record counts for the capture chunk",
    "icon": "fa fa-file-code"
  },
  "Session Information": {
    "description": "Session context and origin details for the diagnostic chunk",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline": {
    "description": "Timestamps covering the range of events within the chunk",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('cebf2974-f34e-5571-84f5-5d1d2806581a', 'A5B20694-EC9E-4BEB-A402-0081504AA78B', 'FieldCategoryIcons', '{
  "Chunk Details": "fa fa-file-code",
  "Session Information": "fa fa-info-circle",
  "System Metadata": "fa fa-cog",
  "Timeline": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A5B20694-EC9E-4BEB-A402-0081504AA78B';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FEAA52E1-360E-4774-81FB-7B3DEC9A1738';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.InstallID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '23C5308D-2C15-46A6-BC53-16ADACC8FB74';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C63DBEB8-CB74-415C-A8B2-AC20FC66BFA6';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '620F41D8-532D-420D-BFD0-549E404DFC34';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.MaxBundlesPerDay 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '92469C19-5EA5-42DF-B466-CC3DB5B7740B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyAlgorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D33265B5-34FE-4765-A09C-C3DD5212BA6B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B3B4F241-0A0A-464A-8F91-C49532F502CC';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.PublicKeyBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category',
   DisplayName = 'Public Key (Base64)'
WHERE 
   ID = 'D39FFFE7-BB97-4A50-B028-93D17D4C4FE3';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2BE187DA-8771-4521-9067-ED5058E5AB97';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '87738366-263A-4480-8874-CEB178445606';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.EnrolledAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E06922FB-E7C9-4B1C-8F55-ADA49775FB75';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RevokedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '654FA598-6390-40C3-89B1-16F94FC336AF';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.LastSeenAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '229552F8-6C5F-4CB2-B279-E4655732C2A5';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '90C0F86A-B035-4889-9545-D22558399EA2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EF629AC8-F225-42CE-ACAE-FF29D213F9C2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D88AA667-8F2F-4B3E-B38D-87FAA310D266';

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2d2fa526-e263-58f6-8981-7a612d6ab2d4', '7680F8BD-1DA5-4664-81CC-2225EB4299A7', 'FieldCategoryInfo', '{
  "Registration Details": {
    "description": "Core information, names, statuses, and operational limits of the registration",
    "icon": "fa fa-id-card"
  },
  "Security and Keys": {
    "description": "Cryptographic keys, algorithms, and registration code verification data",
    "icon": "fa fa-lock"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline and Activity": {
    "description": "Timestamps tracking enrollment, expiration, revocation, and activity",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3ae4dafe-0aa0-5d37-b431-b628e668f9de', '7680F8BD-1DA5-4664-81CC-2225EB4299A7', 'FieldCategoryIcons', '{
  "Registration Details": "fa fa-id-card",
  "Security and Keys": "fa fa-lock",
  "System Metadata": "fa fa-cog",
  "Timeline and Activity": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7680F8BD-1DA5-4664-81CC-2225EB4299A7';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0D57649F-3694-4399-95F9-FB6AA970691F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '754FF87B-8341-453A-975D-AB9CAAE553E2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DE4C9A0A-FAB6-470C-9C1D-37980A8C2792';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '94DD344E-F20C-489F-8FD7-F5FA6E7BA19A';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScopeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '57D1C951-DFCF-4754-A3D1-3F13B6ECDBC1';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScopeJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Targeting and Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '104F5ADA-3D67-49D1-9486-7DC41C475183';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Level 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3BF08C60-A005-4CC3-A730-6AA48BF64D86';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CategoriesJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '65051C13-CBA4-4879-B0E6-E004FF972553';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScrubLiterals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F3FE8EE6-F207-4242-B4D0-BFCD27A88AB6';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.MaxBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D8F29B3E-BC24-4BD6-B799-EA932025869B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1564EAA6-84F0-4FA7-BF4D-3394D442A8B1';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.EndsAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '61F4070E-B90D-4F76-896E-C95BA652AABA';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.StoppedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A9B850EE-CFDE-428C-8AED-5F3FFECBD40D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E52BCEE5-CC97-4D8B-94BC-2C95E5368F48';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5048C5FB-8B97-4270-9B9D-115DC22AC99F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '39DA2564-48CF-4DD4-A133-D424397EF39C';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F9C29344-20A5-44F2-9A44-EED9A294C58C';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1446C757-B326-47A9-8823-1BCE91C9938B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7B9A235D-6609-4CBE-A6B0-C495AE9F368A';

/* Set categories for 35 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '71992E90-7C1E-460D-BD31-791D2D0EDDDE';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '21106266-910E-43AB-ABE3-AA5ED911314D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C5E68C2E-41AA-4E67-97D8-3BC62174D59D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Direction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '226B9CA7-5FDB-444D-99AC-618B573DC703';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '469602A1-9D6F-48AA-AD64-B70A48FEF38E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.DiagnosticSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CDEC5719-7946-4367-884F-FFB3BC620CBC';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.DiagnosticSession 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '11EBFA09-30D0-4569-ACA7-A732A3390506';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.WindowStart 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '71280090-EB5F-490A-9108-D8FA1DA9F264';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.WindowEnd 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '67683C2A-0A1C-4E6E-8F43-E6F89B6586C7';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ScrubLiterals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Scrubbing',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CA2539BD-BC9C-4B7B-8385-7B3D9B76AE9E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ScrubReportJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Scrubbing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scrub Report',
   ExtendedType = 'JSON'
WHERE 
   ID = '635E72AD-5692-408E-A98E-8088B0C6FC09';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FindingsJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Analysis and Findings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Findings',
   ExtendedType = 'JSON'
WHERE 
   ID = '5BA8E940-33D4-4DC0-86D5-76340AE53921';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and Archive',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D3335A61-8BD1-4416-90EA-AC65269D7B80';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.File 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and Archive',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0E6C5053-4336-479F-9557-FD78E1FF0251';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and Archive',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '61E09B1A-6E15-46EF-B0F5-1C304507BEAC';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and Archive',
   GeneratedFormSection = 'Category',
   DisplayName = 'Size (Bytes)'
WHERE 
   ID = 'CE1B783E-7AFB-4C66-A0C8-359C24DCBD11';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SHA256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and Archive',
   GeneratedFormSection = 'Category',
   DisplayName = 'SHA256'
WHERE 
   ID = 'C1561D65-10FE-4B6B-BA80-30BE25D926E4';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ManifestJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and Archive',
   GeneratedFormSection = 'Category',
   DisplayName = 'Manifest',
   ExtendedType = 'JSON'
WHERE 
   ID = '4E898D0D-39C4-4AEE-B38B-F138CE3FCDE2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FailureReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Error Tracking',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '883E6CE7-CF5A-4276-937D-EC70480FC823';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '666A271A-40FE-4ADC-9FE0-D52E64F82D3E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9C24D38A-02C8-458A-B585-C7CEA8317929';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B0E50D95-6BE4-4F3B-A71A-EBBB2DB48101';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D2EFD21A-7610-47AD-906F-6783E59768ED';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '65540DBA-E972-458C-B523-C57EAFD24A42';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Destination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Transmission Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '64E2435A-02C6-4688-ABA3-B05612E69EAD';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SentAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Transmission Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1AEA44EA-8908-4556-91AE-B10728DAFF77';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ExternalReferenceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Transmission Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B85A691E-5146-4263-82A5-7D5D7338D0FF';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SenderInstallID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sender Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8D2A4187-10F8-416D-8C65-AEE61C27D653';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SenderMJVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sender Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6F79B945-203B-498C-8871-7D6126F1EF46';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ContactInfo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sender Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8200EA9C-B129-442B-B221-DB9A93AA7780';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E649AB90-E9E5-4B6B-BD3D-E6DAC9A3D35E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '10F82559-AE1F-451F-AD0A-00D509D58C8A';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '903A950A-55CC-4286-99BA-5BCDA1B7BDA8';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D464283C-4AC5-4365-B614-D61FFC045E3E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9D3F49AE-5959-41E4-BF59-40E737499880';

/* Set entity icon to fa fa-stethoscope */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-stethoscope', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e6804625-99ef-5ba6-8f79-19658fe07205', 'D83818A2-E62D-40EA-9243-C2D1175411AC', 'FieldCategoryInfo', '{
  "Capture Configuration": {
    "description": "Verbosity levels, budget controls, and capture settings",
    "icon": "fa fa-sliders-h"
  },
  "Ownership and Tenant": {
    "description": "Creator user and tenant isolation details",
    "icon": "fa fa-building"
  },
  "Session Details": {
    "description": "General identification and status details for the diagnostic session",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Targeting and Scope": {
    "description": "Targeting rules and specifications for matching incoming requests",
    "icon": "fa fa-crosshairs"
  },
  "Timeline": {
    "description": "Start, expiration, and stop timestamps for session execution",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c5044c5b-3b6e-5624-8d0d-f70783f7ad3d', 'D83818A2-E62D-40EA-9243-C2D1175411AC', 'FieldCategoryIcons', '{
  "Capture Configuration": "fa fa-sliders-h",
  "Ownership and Tenant": "fa fa-building",
  "Session Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog",
  "Targeting and Scope": "fa fa-crosshairs",
  "Timeline": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D83818A2-E62D-40EA-9243-C2D1175411AC';

/* Set entity icon to fa fa-stethoscope */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-stethoscope', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a2868638-4d23-5df8-b9de-ce522ceaa8ed', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'FieldCategoryInfo', '{
  "Analysis and Findings": {
    "description": "Automated rules-engine diagnostic findings and results",
    "icon": "fa fa-chart-line"
  },
  "Bundle Details": {
    "description": "Core descriptive and relational metadata for the diagnostic bundle",
    "icon": "fa fa-box"
  },
  "Ownership and Approval": {
    "description": "Creators, approvers, and administrative sign-offs",
    "icon": "fa fa-user-check"
  },
  "Security and Scrubbing": {
    "description": "Configuration and reports regarding literal scrubbing and data protection",
    "icon": "fa fa-shield-alt"
  },
  "Sender Information": {
    "description": "Origin instance details for ingested external bundles",
    "icon": "fa fa-network-wired"
  },
  "Status and Error Tracking": {
    "description": "Failure details and execution status messages",
    "icon": "fa fa-exclamation-triangle"
  },
  "Storage and Archive": {
    "description": "File manifests, binary archives, storage links, and checksums",
    "icon": "fa fa-database"
  },
  "Timeline and Scope": {
    "description": "Time windows, coverage, and expiration retention dates",
    "icon": "fa fa-clock"
  },
  "Transmission Details": {
    "description": "External destination, delivery timestamps, and reference IDs",
    "icon": "fa fa-paper-plane"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0ea1fe4d-b972-52ee-98b9-d2ac05202dcf', 'D3AAD653-5B9A-4075-94C0-A2A490823D4E', 'FieldCategoryIcons', '{
  "Analysis and Findings": "fa fa-chart-line",
  "Bundle Details": "fa fa-box",
  "Ownership and Approval": "fa fa-user-check",
  "Security and Scrubbing": "fa fa-shield-alt",
  "Sender Information": "fa fa-network-wired",
  "Status and Error Tracking": "fa fa-exclamation-triangle",
  "Storage and Archive": "fa fa-database",
  "Timeline and Scope": "fa fa-clock",
  "Transmission Details": "fa fa-paper-plane"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D3AAD653-5B9A-4075-94C0-A2A490823D4E';

