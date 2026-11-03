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
         '133bf1fd-e4c0-410d-b847-39b3fd6fbc11',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '133bf1fd-e4c0-410d-b847-39b3fd6fbc11', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '95ae4a10-7d58-4d55-be27-5b934a958411',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '95ae4a10-7d58-4d55-be27-5b934a958411', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'a385086e-1147-4042-ae36-d808ce850ef9',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a385086e-1147-4042-ae36-d808ce850ef9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '0a75d64d-9396-4b77-871a-d88577f2ac4f',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0a75d64d-9396-4b77-871a-d88577f2ac4f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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

/* SQL text to insert 75 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d73cd9a-ebd5-4c84-ad04-730de04bcee4' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d73cd9a-ebd5-4c84-ad04-730de04bcee4',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10bacf04-9a95-4b35-8f0b-34d70fb2fc19' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '10bacf04-9a95-4b35-8f0b-34d70fb2fc19',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed4bec44-fd27-4123-9596-febd77edae75' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'Reason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed4bec44-fd27-4123-9596-febd77edae75',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14b54bf3-b16f-477e-aa04-f88e58a6b6f3' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '14b54bf3-b16f-477e-aa04-f88e58a6b6f3',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0906db6-1d69-4c67-b552-812e12345344' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'ScopeType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0906db6-1d69-4c67-b552-812e12345344',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35265cae-ec4b-4a65-974b-a55af93e3a9f' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'ScopeJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '35265cae-ec4b-4a65-974b-a55af93e3a9f',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83f35dfd-93ed-412a-83c1-66ce415c1e50' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'Level')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83f35dfd-93ed-412a-83c1-66ce415c1e50',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfecff5d-2dc3-4155-8033-4b8da1292598' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'CategoriesJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cfecff5d-2dc3-4155-8033-4b8da1292598',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9dd51870-8edf-441d-91a4-fcedd9d0612b' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'ScrubLiterals')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9dd51870-8edf-441d-91a4-fcedd9d0612b',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1811ddd3-1e6c-4338-8148-21ac96f09bc3' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1811ddd3-1e6c-4338-8148-21ac96f09bc3',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f377b211-e2e0-4ce7-9069-9620f2d48e05' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'EndsAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f377b211-e2e0-4ce7-9069-9620f2d48e05',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '433ad27e-71a6-4f6b-854d-55a8789599c1' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'StoppedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '433ad27e-71a6-4f6b-854d-55a8789599c1',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a13aeb63-1d12-4275-8140-e9d31a13b882' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'MaxBytes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a13aeb63-1d12-4275-8140-e9d31a13b882',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8cf0e0d5-f3d2-4f64-b7a4-01f66e1333f7' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8cf0e0d5-f3d2-4f64-b7a4-01f66e1333f7',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4edf3600-acea-410d-8014-294ced366562' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4edf3600-acea-410d-8014-294ced366562',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0720a793-474d-463f-ab4d-7e9a6a2ff9f9' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0720a793-474d-463f-ab4d-7e9a6a2ff9f9',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '720a573e-634c-4a6e-8915-3d41716cffd9' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '720a573e-634c-4a6e-8915-3d41716cffd9',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3e60710-4797-459e-8f8e-7ac8b18e1e3d' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f3e60710-4797-459e-8f8e-7ac8b18e1e3d',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c9534e2-bf0c-4062-a9c5-462a98d688a5' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'DiagnosticSessionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c9534e2-bf0c-4062-a9c5-462a98d688a5',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65f25294-38fe-4962-ae82-e79654deb7ab' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '65f25294-38fe-4962-ae82-e79654deb7ab',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1829e0ec-705c-4b0a-aeaa-6229a57d18a9' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'HostInstanceLabel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1829e0ec-705c-4b0a-aeaa-6229a57d18a9',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ff87845-c451-4511-837b-3a4571fd4889' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ff87845-c451-4511-837b-3a4571fd4889',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd78c8c45-20c6-461a-a5f9-89f1538caa0f' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'ContentKind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd78c8c45-20c6-461a-a5f9-89f1538caa0f',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '583d39d5-8db1-4367-a310-9ad3efa46332' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'Data')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '583d39d5-8db1-4367-a310-9ad3efa46332',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '79ad6a5b-7fd9-44cd-adf9-619c0d5c8c7d' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'EntryCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '79ad6a5b-7fd9-44cd-adf9-619c0d5c8c7d',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66aee3db-eb2f-48d1-b3e9-22a23ac77fcb' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'FirstEntryAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66aee3db-eb2f-48d1-b3e9-22a23ac77fcb',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d54251c-1f94-492b-9d41-165ec8fa607c' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'LastEntryAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d54251c-1f94-492b-9d41-165ec8fa607c',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8051f5e-d175-4a1b-b838-902bca34700d' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8051f5e-d175-4a1b-b838-902bca34700d',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84d272e8-9cee-4bc2-91d0-e07959e3b5ba' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '84d272e8-9cee-4bc2-91d0-e07959e3b5ba',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edd96485-ab7f-4b90-b8b0-0ff89f5ce083' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'edd96485-ab7f-4b90-b8b0-0ff89f5ce083',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b1302d6-9ec4-44d1-a37a-990917da383d' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0b1302d6-9ec4-44d1-a37a-990917da383d',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bb008bf-de67-444d-9c70-f6ca72ce1e5f' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8bb008bf-de67-444d-9c70-f6ca72ce1e5f',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '329f06fc-164a-44ca-9a37-6db686e80dc9' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Direction')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '329f06fc-164a-44ca-9a37-6db686e80dc9',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b866d87-8bd5-4797-8bd6-a7b82208960e' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'DiagnosticSessionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1b866d87-8bd5-4797-8bd6-a7b82208960e',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3e39419-3f28-487f-8e96-b787a316ae23' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b3e39419-3f28-487f-8e96-b787a316ae23',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03f204c7-74b8-4567-b4e7-8daad2ae52f6' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ScrubLiterals')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03f204c7-74b8-4567-b4e7-8daad2ae52f6',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e30689f-da96-490f-8d50-19e9ce98ea06' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'WindowStart')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5e30689f-da96-490f-8d50-19e9ce98ea06',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b0845fb-9964-49e8-b814-134de5842026' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'WindowEnd')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b0845fb-9964-49e8-b814-134de5842026',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9aa2c46a-16e0-4233-871e-9ffcce400acb' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'FileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9aa2c46a-16e0-4233-871e-9ffcce400acb',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c66bbb4a-991e-448a-83b0-c977d59ddced' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Data')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c66bbb4a-991e-448a-83b0-c977d59ddced',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '008be4d2-d5da-4d58-9c59-c2d0ea75c1a2' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'SizeBytes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '008be4d2-d5da-4d58-9c59-c2d0ea75c1a2',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1103f8ce-c48c-4fe3-ae05-ead4e4516347' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'SHA256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1103f8ce-c48c-4fe3-ae05-ead4e4516347',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '12ddb9b2-bb41-4a3b-8bb8-cea9fc7d6e68' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ManifestJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '12ddb9b2-bb41-4a3b-8bb8-cea9fc7d6e68',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be34ef65-dd3f-4631-944f-18126e0dec06' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ScrubReportJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be34ef65-dd3f-4631-944f-18126e0dec06',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad7dd548-3a48-40b8-843e-16dafe4af6c4' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'FindingsJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad7dd548-3a48-40b8-843e-16dafe4af6c4',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '058765e6-dd09-484f-822e-b466d681e801' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'FailureReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '058765e6-dd09-484f-822e-b466d681e801',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '601f1c45-a56c-4ccd-9a29-efc6a7fee5c4' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '601f1c45-a56c-4ccd-9a29-efc6a7fee5c4',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '999005e6-4821-443f-bb77-e06fe89d87d6' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ApprovedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '999005e6-4821-443f-bb77-e06fe89d87d6',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '374efb56-ca0c-464c-b67f-f63bf4fc71b8' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ApprovedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '374efb56-ca0c-464c-b67f-f63bf4fc71b8',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5486f090-0c0f-4312-ab17-2109820f6866' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Destination')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5486f090-0c0f-4312-ab17-2109820f6866',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6a6729a-6922-4977-97f5-2eb4b9471308' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'SentAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c6a6729a-6922-4977-97f5-2eb4b9471308',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c7bdfed-2462-45fd-9022-6ffe9b9369ba' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ExternalReferenceID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c7bdfed-2462-45fd-9022-6ffe9b9369ba',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e864c1fe-6e5b-4fd7-982a-6d0ec2083c49' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'SenderInstallID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e864c1fe-6e5b-4fd7-982a-6d0ec2083c49',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c10c0183-8895-4cea-aff0-c2b993772bd0' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'SenderMJVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c10c0183-8895-4cea-aff0-c2b993772bd0',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d61de7d-c46e-45fc-bf04-29d295d55aec' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ContactInfo')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0d61de7d-c46e-45fc-bf04-29d295d55aec',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc31da3a-499b-4c7c-b0c9-bf8cf37c25de' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ExpiresAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc31da3a-499b-4c7c-b0c9-bf8cf37c25de',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '928b0221-2753-412e-97c8-58998662fb3b' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '928b0221-2753-412e-97c8-58998662fb3b',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c987f153-54f3-492f-bd74-8b1851199237' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c987f153-54f3-492f-bd74-8b1851199237',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23d783e5-25d1-48f6-9960-2802038ae3fb' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '23d783e5-25d1-48f6-9960-2802038ae3fb',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ba99562-5bcc-4f2a-a4c5-29f35efbd7fc' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ba99562-5bcc-4f2a-a4c5-29f35efbd7fc',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6e61a2e-1d12-4f53-bf96-f610f619baf4' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'InstallID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f6e61a2e-1d12-4f53-bf96-f610f619baf4',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ac7ba3c-7bba-4fd2-8ae0-a60b8d1eb1c6' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ac7ba3c-7bba-4fd2-8ae0-a60b8d1eb1c6',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d1b5770-11ed-494b-8014-9940ccb6930f' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d1b5770-11ed-494b-8014-9940ccb6930f',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca639f48-0665-4b2d-ab83-6709ff9057a3' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'KeyAlgorithm')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca639f48-0665-4b2d-ab83-6709ff9057a3',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c25ba215-389e-46e8-9050-a44bfc676de5' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'KeyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c25ba215-389e-46e8-9050-a44bfc676de5',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b796135f-273b-45bf-8329-65fc9de0ff2e' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'PublicKeyBase64')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b796135f-273b-45bf-8329-65fc9de0ff2e',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e9c4c14e-11ca-494e-a2b4-6513b2b3881c' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'RegistrationCodeHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e9c4c14e-11ca-494e-a2b4-6513b2b3881c',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fc72eb4-086c-4219-a913-6dfe9f8cf7ec' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'RegistrationCodeExpiresAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3fc72eb4-086c-4219-a913-6dfe9f8cf7ec',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7263a223-577a-4f6e-a3a4-36ba4770152a' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'EnrolledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7263a223-577a-4f6e-a3a4-36ba4770152a',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad087aed-aebf-48bc-9182-fac5db00b418' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'RevokedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad087aed-aebf-48bc-9182-fac5db00b418',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2d6fa3e-a824-4b66-b34c-fbdd2d9e60ae' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'LastSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b2d6fa3e-a824-4b66-b34c-fbdd2d9e60ae',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b129ac5-3331-4388-8d98-ae433a401f7a' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'MaxBundlesPerDay')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3b129ac5-3331-4388-8d98-ae433a401f7a',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58b59bb2-ba98-44da-a5ad-fea5aa67a9f2' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = 'Comments')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '58b59bb2-ba98-44da-a5ad-fea5aa67a9f2',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8616eaba-06ea-4daa-a3f8-4e4b053bc0e9' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8616eaba-06ea-4daa-a3f8-4e4b053bc0e9',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95972272-7d48-47b5-9c16-0b37d36c85aa' OR (EntityID = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '95972272-7d48-47b5-9c16-0b37d36c85aa',
            '0A75D64D-9396-4B77-871A-D88577F2AC4F', -- Entity: MJ: Diagnostic Sender Registrations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F'),
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

/* SQL text to insert entity field value with ID fa9b4f3d-3b7f-4d42-9c9c-b2cc4fa8206a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa9b4f3d-3b7f-4d42-9c9c-b2cc4fa8206a', '14B54BF3-B16F-477E-AA04-F88E58A6B6F3', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c334c9c8-a008-4303-884a-91c949ad51de */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c334c9c8-a008-4303-884a-91c949ad51de', '14B54BF3-B16F-477E-AA04-F88E58A6B6F3', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b8bd7d4b-a79a-4ae1-b670-4696c51facd7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b8bd7d4b-a79a-4ae1-b670-4696c51facd7', '14B54BF3-B16F-477E-AA04-F88E58A6B6F3', 3, 'Stopped', 'Stopped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 14B54BF3-B16F-477E-AA04-F88E58A6B6F3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='14B54BF3-B16F-477E-AA04-F88E58A6B6F3';

/* SQL text to insert entity field value with ID 08196d40-2772-417a-a3e2-50eae4be3ab8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('08196d40-2772-417a-a3e2-50eae4be3ab8', 'A0906DB6-1D69-4C67-B552-812E12345344', 1, 'APIKeys', 'APIKeys', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 866bf4b6-e741-44f9-a478-63d62cda05e2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('866bf4b6-e741-44f9-a478-63d62cda05e2', 'A0906DB6-1D69-4C67-B552-812E12345344', 2, 'BrowserSession', 'BrowserSession', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f382726b-e420-47b7-9eae-36f11df6ba3d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f382726b-e420-47b7-9eae-36f11df6ba3d', 'A0906DB6-1D69-4C67-B552-812E12345344', 3, 'Instance', 'Instance', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d11d88e3-1685-42ad-915b-fe86d9f2c3ce */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d11d88e3-1685-42ad-915b-fe86d9f2c3ce', 'A0906DB6-1D69-4C67-B552-812E12345344', 4, 'Operations', 'Operations', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 43e07a67-40ee-45df-9f4b-0bdb7c9220c1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('43e07a67-40ee-45df-9f4b-0bdb7c9220c1', 'A0906DB6-1D69-4C67-B552-812E12345344', 5, 'Users', 'Users', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A0906DB6-1D69-4C67-B552-812E12345344 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A0906DB6-1D69-4C67-B552-812E12345344';

/* SQL text to insert entity field value with ID 36356b74-9150-4629-bb58-b707ba60e0b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('36356b74-9150-4629-bb58-b707ba60e0b9', '83F35DFD-93ED-412A-83C1-66CE415C1E50', 1, 'Debug', 'Debug', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a2a90b3c-cd9c-4a9a-9b6c-0dfd28286775 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2a90b3c-cd9c-4a9a-9b6c-0dfd28286775', '83F35DFD-93ED-412A-83C1-66CE415C1E50', 2, 'Standard', 'Standard', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 57f808ed-4e86-4ac4-a647-98c2f931c1a8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('57f808ed-4e86-4ac4-a647-98c2f931c1a8', '83F35DFD-93ED-412A-83C1-66CE415C1E50', 3, 'Verbose', 'Verbose', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 83F35DFD-93ED-412A-83C1-66CE415C1E50 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='83F35DFD-93ED-412A-83C1-66CE415C1E50';

/* SQL text to insert entity field value with ID 2a008b14-d412-431f-8837-1aac64c67814 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2a008b14-d412-431f-8837-1aac64c67814', '65F25294-38FE-4962-AE82-E79654DEB7AB', 1, 'Client', 'Client', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b6b86892-e802-460c-98bf-389ccee20140 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6b86892-e802-460c-98bf-389ccee20140', '65F25294-38FE-4962-AE82-E79654DEB7AB', 2, 'Server', 'Server', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 65F25294-38FE-4962-AE82-E79654DEB7AB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='65F25294-38FE-4962-AE82-E79654DEB7AB';

/* SQL text to insert entity field value with ID 928f9c34-eef0-4e50-86b8-4d200fa9fb52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('928f9c34-eef0-4e50-86b8-4d200fa9fb52', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 1, 'App', 'App', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 865b8c18-4038-47d5-bb7b-effcda6646c7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('865b8c18-4038-47d5-bb7b-effcda6646c7', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 2, 'Errors', 'Errors', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bdec08a6-9e7e-4fec-a322-751b4472a990 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bdec08a6-9e7e-4fec-a322-751b4472a990', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 3, 'Health', 'Health', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5b53e7e2-70a4-4917-8daf-de5c83f5a2c2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5b53e7e2-70a4-4917-8daf-de5c83f5a2c2', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 4, 'Logs', 'Logs', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 496d2fee-cf2f-493b-8e51-cc46a4902ec1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('496d2fee-cf2f-493b-8e51-cc46a4902ec1', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 5, 'Network', 'Network', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 929eff0d-fba9-45ff-b7df-35f618845df6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('929eff0d-fba9-45ff-b7df-35f618845df6', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 6, 'SQL', 'SQL', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 37244f1d-91d9-4be1-8685-07fcc4fd6123 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37244f1d-91d9-4be1-8685-07fcc4fd6123', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 7, 'Spans', 'Spans', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 911be4fb-2614-42fd-b61b-799bb16d22a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('911be4fb-2614-42fd-b61b-799bb16d22a9', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 8, 'Telemetry', 'Telemetry', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 43d71475-ee3e-405e-8718-09f9b60b7416 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('43d71475-ee3e-405e-8718-09f9b60b7416', 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F', 9, 'Timeline', 'Timeline', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D78C8C45-20C6-461A-A5F9-89F1538CAA0F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D78C8C45-20C6-461A-A5F9-89F1538CAA0F';

/* SQL text to insert entity field value with ID 65edb92c-4f63-40d2-919d-22b6beaabb48 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('65edb92c-4f63-40d2-919d-22b6beaabb48', '329F06FC-164A-44CA-9A37-6DB686E80DC9', 1, 'Local', 'Local', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5077c25c-5f66-44f2-9e72-1d212801605f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5077c25c-5f66-44f2-9e72-1d212801605f', '329F06FC-164A-44CA-9A37-6DB686E80DC9', 2, 'Received', 'Received', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 329F06FC-164A-44CA-9A37-6DB686E80DC9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='329F06FC-164A-44CA-9A37-6DB686E80DC9';

/* SQL text to insert entity field value with ID 1e025bc8-7a89-4de1-b607-5df2b2c69416 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1e025bc8-7a89-4de1-b607-5df2b2c69416', 'B3E39419-3F28-487F-8E96-B787A316AE23', 1, 'Building', 'Building', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 038f8158-6566-4a22-a7f0-cfc46757474b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('038f8158-6566-4a22-a7f0-cfc46757474b', 'B3E39419-3F28-487F-8E96-B787A316AE23', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8d1a72ee-f84a-4819-8b34-c4ec156725e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8d1a72ee-f84a-4819-8b34-c4ec156725e0', 'B3E39419-3F28-487F-8E96-B787A316AE23', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 299b18f0-4208-4662-999a-6583e84a19ed */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('299b18f0-4208-4662-999a-6583e84a19ed', 'B3E39419-3F28-487F-8E96-B787A316AE23', 4, 'Ready', 'Ready', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 77aca5e3-79f1-4ede-81a4-7b5c9a3145cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('77aca5e3-79f1-4ede-81a4-7b5c9a3145cb', 'B3E39419-3F28-487F-8E96-B787A316AE23', 5, 'Receiving', 'Receiving', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58a49e58-7b31-4256-bfc7-f49770f5dbf6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58a49e58-7b31-4256-bfc7-f49770f5dbf6', 'B3E39419-3F28-487F-8E96-B787A316AE23', 6, 'Sending', 'Sending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a95cd2f7-cc5d-44ce-8ded-e1ebb0a7dda1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a95cd2f7-cc5d-44ce-8ded-e1ebb0a7dda1', 'B3E39419-3F28-487F-8E96-B787A316AE23', 7, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B3E39419-3F28-487F-8E96-B787A316AE23 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B3E39419-3F28-487F-8E96-B787A316AE23';

/* SQL text to insert entity field value with ID 26554521-cdb8-4096-af82-3b6ab8fc8dd1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26554521-cdb8-4096-af82-3b6ab8fc8dd1', '5486F090-0C0F-4312-AB17-2109820F6866', 1, 'CustomerCollector', 'CustomerCollector', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e419aa4e-e490-4523-a298-04a4b3ef90f7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e419aa4e-e490-4523-a298-04a4b3ef90f7', '5486F090-0C0F-4312-AB17-2109820F6866', 2, 'MJC', 'MJC', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 34e4da0d-e1b4-4567-9197-94e42ea407ac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('34e4da0d-e1b4-4567-9197-94e42ea407ac', '5486F090-0C0F-4312-AB17-2109820F6866', 3, 'StorageAccount', 'StorageAccount', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5486F090-0C0F-4312-AB17-2109820F6866 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5486F090-0C0F-4312-AB17-2109820F6866';

/* SQL text to insert entity field value with ID b7d78e1c-bb00-4dbd-80f6-dde17c5d7263 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b7d78e1c-bb00-4dbd-80f6-dde17c5d7263', '7D1B5770-11ED-494B-8014-9940CCB6930F', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a9d2768c-e40a-4c2d-8219-89e6ed4cc138 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a9d2768c-e40a-4c2d-8219-89e6ed4cc138', '7D1B5770-11ED-494B-8014-9940CCB6930F', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6c179a01-3c58-4e96-97c7-23c64b6154ae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c179a01-3c58-4e96-97c7-23c64b6154ae', '7D1B5770-11ED-494B-8014-9940CCB6930F', 3, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7D1B5770-11ED-494B-8014-9940CCB6930F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7D1B5770-11ED-494B-8014-9940CCB6930F';

/* SQL text to insert entity field value with ID c1bc046b-87a6-446b-a1b9-8a516bfab54f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c1bc046b-87a6-446b-a1b9-8a516bfab54f', 'CA639F48-0665-4B2D-AB83-6709FF9057A3', 1, 'Ed25519', 'Ed25519', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CA639F48-0665-4B2D-AB83-6709FF9057A3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CA639F48-0665-4B2D-AB83-6709FF9057A3';

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


/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Session Chunks (One To Many via DiagnosticSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1f166381-8193-47c0-9d78-0dcfcfa489f9' OR ([EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND [RelatedEntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND [RelatedEntityJoinField] = 'DiagnosticSessionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1f166381-8193-47c0-9d78-0dcfcfa489f9', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', '95AE4A10-7D58-4D55-BE27-5B934A958411', 'DiagnosticSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Bundles (One To Many via DiagnosticSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a273816d-ed8f-4b7a-b226-5a3e0469443b' OR ([EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND [RelatedEntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [RelatedEntityJoinField] = 'DiagnosticSessionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a273816d-ed8f-4b7a-b226-5a3e0469443b', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'A385086E-1147-4042-AE36-D808CE850EF9', 'DiagnosticSessionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ: Diagnostic Sessions (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '02efd5f2-2a23-44d5-97df-74c2d552a2ea' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('02efd5f2-2a23-44d5-97df-74c2d552a2ea', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'CompanyID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ: Diagnostic Bundles (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4f5b987e-18cd-426e-be73-a53fb987042f' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4f5b987e-18cd-426e-be73-a53fb987042f', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'CompanyID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Sessions (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '32f1656d-e417-45f5-a62e-6079ea182784' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('32f1656d-e417-45f5-a62e-6079ea182784', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'CreatedByUserID', 'One To Many', 1, 1, 127, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Bundles (One To Many via CreatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ec738767-0c8d-4a00-8e43-1cc558c355e0' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [RelatedEntityJoinField] = 'CreatedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ec738767-0c8d-4a00-8e43-1cc558c355e0', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'CreatedByUserID', 'One To Many', 1, 1, 128, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Users -> MJ: Diagnostic Bundles (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6d0f56a8-6eda-4400-93e2-116a89930fa1' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [RelatedEntityJoinField] = 'ApprovedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6d0f56a8-6eda-4400-93e2-116a89930fa1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'ApprovedByUserID', 'One To Many', 1, 1, 129, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: Diagnostic Bundles (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '860d2b1e-efce-4e19-a6a1-0bf3a8888426' OR ([EntityID] = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [RelatedEntityJoinField] = 'FileID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('860d2b1e-efce-4e19-a6a1-0bf3a8888426', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'FileID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 1B866D87-8BD5-4797-8BD6-A7B82208960E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1B866D87-8BD5-4797-8BD6-A7B82208960E', @RelatedEntityNameFieldMap='DiagnosticSession';

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

/* SQL text to update entity field related entity name field map for entity field ID 3C9534E2-BF0C-4062-A9C5-462A98D688A5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3C9534E2-BF0C-4062-A9C5-462A98D688A5', @RelatedEntityNameFieldMap='DiagnosticSession';

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

/* SQL text to update entity field related entity name field map for entity field ID 8CF0E0D5-F3D2-4F64-B7A4-01F66E1333F7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8CF0E0D5-F3D2-4F64-B7A4-01F66E1333F7', @RelatedEntityNameFieldMap='CreatedByUser';

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

/* SQL text to update entity field related entity name field map for entity field ID 9AA2C46A-16E0-4233-871E-9FFCCE400ACB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9AA2C46A-16E0-4233-871E-9FFCCE400ACB', @RelatedEntityNameFieldMap='File';

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

/* SQL text to update entity field related entity name field map for entity field ID 4EDF3600-ACEA-410D-8014-294CED366562 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4EDF3600-ACEA-410D-8014-294CED366562', @RelatedEntityNameFieldMap='Company';

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

/* SQL text to update entity field related entity name field map for entity field ID 601F1C45-A56C-4CCD-9A29-EFC6A7FEE5C4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='601F1C45-A56C-4CCD-9A29-EFC6A7FEE5C4', @RelatedEntityNameFieldMap='CreatedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 999005E6-4821-443F-BB77-E06FE89D87D6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='999005E6-4821-443F-BB77-E06FE89D87D6', @RelatedEntityNameFieldMap='ApprovedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 928B0221-2753-412E-97C8-58998662FB3B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='928B0221-2753-412E-97C8-58998662FB3B', @RelatedEntityNameFieldMap='Company';

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c08293ba-fada-4548-8130-bdbaadb414d8' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'CreatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c08293ba-fada-4548-8130-bdbaadb414d8',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18e874fa-5763-445c-add1-340b1d943e8f' OR (EntityID = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND Name = 'Company')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '18e874fa-5763-445c-add1-340b1d943e8f',
            '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ffa316b-8d2e-4b06-8302-ecf87de6bf38' OR (EntityID = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND Name = 'DiagnosticSession')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8ffa316b-8d2e-4b06-8302-ecf87de6bf38',
            '95AE4A10-7D58-4D55-BE27-5B934A958411', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eedc374e-540d-4bfe-8df1-6298fc76eb30' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'DiagnosticSession')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eedc374e-540d-4bfe-8df1-6298fc76eb30',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd922872f-06a0-43dd-8054-c7eb3a26e69f' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'File')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd922872f-06a0-43dd-8054-c7eb3a26e69f',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '225f88a3-f9a2-4b13-a5a1-93c058f7fcd2' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'CreatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '225f88a3-f9a2-4b13-a5a1-93c058f7fcd2',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c60f4895-1b9f-4d4f-9028-402f46622b3d' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'ApprovedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c60f4895-1b9f-4d4f-9028-402f46622b3d',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90d490a2-af3b-4909-b17e-b55c3f013f09' OR (EntityID = 'A385086E-1147-4042-AE36-D808CE850EF9' AND Name = 'Company')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90d490a2-af3b-4909-b17e-b55c3f013f09',
            'A385086E-1147-4042-AE36-D808CE850EF9', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9'),
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
               WHERE ID = '83F35DFD-93ED-412A-83C1-66CE415C1E50'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1811DDD3-1E6C-4338-8148-21AC96F09BC3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '10BACF04-9A95-4B35-8F0B-34D70FB2FC19'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B2D6FA3E-A824-4B66-B34C-FBDD2D9E60AE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3B129AC5-3331-4388-8D98-AE433A401F7A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F6E61A2E-1D12-4F53-BF96-F610F619BAF4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3AC7BA3C-7BBA-4FD2-8AE0-A60B8D1EB1C6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'F6E61A2E-1D12-4F53-BF96-F610F619BAF4'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '79AD6A5B-7FD9-44CD-ADF9-619C0D5C8C7D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '66AEE3DB-EB2F-48D1-B3E9-22A23AC77FCB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8FFA316B-8D2E-4B06-8302-ECF87DE6BF38'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9BA99562-5BCC-4F2A-A4C5-29F35EFBD7FC';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.InstallID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6E61A2E-1D12-4F53-BF96-F610F619BAF4';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3AC7BA3C-7BBA-4FD2-8AE0-A60B8D1EB1C6';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7D1B5770-11ED-494B-8014-9940CCB6930F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.MaxBundlesPerDay 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3B129AC5-3331-4388-8D98-AE433A401F7A';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Registration Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '58B59BB2-BA98-44DA-A5AD-FEA5AA67A9F2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyAlgorithm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CA639F48-0665-4B2D-AB83-6709FF9057A3';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C25BA215-389E-46E8-9050-A44BFC676DE5';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.PublicKeyBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category',
   DisplayName = 'Public Key (Base64)'
WHERE 
   ID = 'B796135F-273B-45BF-8329-65FC9DE0FF2E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Keys',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E9C4C14E-11CA-494E-A2B4-6513B2B3881C';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3FC72EB4-086C-4219-A913-6DFE9F8CF7EC';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.EnrolledAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7263A223-577A-4F6E-A3A4-36BA4770152A';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RevokedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AD087AED-AEBF-48BC-9182-FAC5DB00B418';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.LastSeenAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Activity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B2D6FA3E-A824-4B66-B34C-FBDD2D9E60AE';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8616EABA-06EA-4DAA-A3F8-4E4B053BC0E9';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '95972272-7D48-47B5-9C16-0B37D36C85AA';

/* Set entity icon to fa fa-server */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-server', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1e98990f-0ffd-5dbb-90f0-7a8cb4335d24', '0A75D64D-9396-4B77-871A-D88577F2AC4F', 'FieldCategoryInfo', '{
  "Registration Details": {
    "description": "Core installation identity, status, quotas, and administrator notes",
    "icon": "fa fa-info-circle"
  },
  "Security and Keys": {
    "description": "Cryptographic keys, algorithms, and enrollment authentication codes",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline and Activity": {
    "description": "Enrollment, expiration, revocation, and last activity timestamps",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B3E39419-3F28-487F-8E96-B787A316AE23'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '008BE4D2-D5DA-4D58-9C59-C2D0EA75C1A2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C987F153-54F3-492F-BD74-8B1851199237'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0B1302D6-9EC4-44D1-A37A-990917DA383D'
               AND AutoUpdateUserSearchPredicate = 1;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('33cec053-9d46-500b-a35c-03a4208d6ddc', '0A75D64D-9396-4B77-871A-D88577F2AC4F', 'FieldCategoryIcons', '{
  "Registration Details": "fa fa-info-circle",
  "Security and Keys": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog",
  "Timeline and Activity": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0A75D64D-9396-4B77-871A-D88577F2AC4F';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D73CD9A-EBD5-4C84-AD04-730DE04BCEE4';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '10BACF04-9A95-4B35-8F0B-34D70FB2FC19';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ED4BEC44-FD27-4123-9596-FEBD77EDAE75';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '14B54BF3-B16F-477E-AA04-F88E58A6B6F3';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScopeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Targeting',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A0906DB6-1D69-4C67-B552-812E12345344';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScopeJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope and Targeting',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '35265CAE-EC4B-4A65-974B-A55AF93E3A9F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Level 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '83F35DFD-93ED-412A-83C1-66CE415C1E50';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CategoriesJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'CFECFF5D-2DC3-4155-8033-4B8DA1292598';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScrubLiterals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9DD51870-8EDF-441D-91A4-FCEDD9D0612B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.MaxBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Capture Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A13AEB63-1D12-4275-8140-E9D31A13B882';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Lifespan',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1811DDD3-1E6C-4338-8148-21AC96F09BC3';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.EndsAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Lifespan',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F377B211-E2E0-4CE7-9069-9620F2D48E05';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.StoppedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline and Lifespan',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '433AD27E-71A6-4F6B-854D-55A8789599C1';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category',
   DisplayName = 'Created By User'
WHERE 
   ID = '8CF0E0D5-F3D2-4F64-B7A4-01F66E1333F7';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company'
WHERE 
   ID = '4EDF3600-ACEA-410D-8014-294CED366562';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category',
   DisplayName = 'Created By User Name'
WHERE 
   ID = 'C08293BA-FADA-4548-8130-BDBAADB414D8';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Tenant',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Name'
WHERE 
   ID = '18E874FA-5763-445C-ADD1-340B1D943E8F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0720A793-474D-463F-AB4D-7E9A6A2FF9F9';

-- UPDATE Entity Field Category Info MJ: Diagnostic Sessions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '720A573E-634C-4A6E-8915-3D41716CFFD9';

/* Set entity icon to fa fa-stethoscope */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-stethoscope', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8d81dac6-3d8b-530e-b8ca-90e28a4cea1f', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'FieldCategoryInfo', '{
  "Capture Configuration": {
    "description": "Verbosity levels, categories, scrubbing, and budget limits",
    "icon": "fa fa-sliders-h"
  },
  "Ownership and Tenant": {
    "description": "User and tenant isolation details",
    "icon": "fa fa-building"
  },
  "Scope and Targeting": {
    "description": "Targeting rules and scope configuration for request capture",
    "icon": "fa fa-bullseye"
  },
  "Session Details": {
    "description": "Core identifying details and status of the diagnostic session",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline and Lifespan": {
    "description": "Start, expiration, and stop timestamps for the session",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('f324aeda-7e14-58a7-850b-6b1f7f375dbf', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'FieldCategoryIcons', '{
  "Capture Configuration": "fa fa-sliders-h",
  "Ownership and Tenant": "fa fa-building",
  "Scope and Targeting": "fa fa-bullseye",
  "Session Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog",
  "Timeline and Lifespan": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F3E60710-4797-459E-8F8E-7AC8B18E1E3D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.DiagnosticSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Diagnostic Session'
WHERE 
   ID = '3C9534E2-BF0C-4062-A9C5-462A98D688A5';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '65F25294-38FE-4962-AE82-E79654DEB7AB';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.HostInstanceLabel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1829E0EC-705C-4B0A-AEAA-6229A57D18A9';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1FF87845-C451-4511-837B-3A4571FD4889';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.ContentKind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Payload',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Payload',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '583D39D5-8DB1-4367-A310-9AD3EFA46332';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.EntryCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Payload',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '79AD6A5B-7FD9-44CD-ADF9-619C0D5C8C7D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.FirstEntryAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '66AEE3DB-EB2F-48D1-B3E9-22A23AC77FCB';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.LastEntryAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9D54251C-1F94-492B-9D41-165EC8FA607C';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.DiagnosticSession 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8FFA316B-8D2E-4B06-8302-ECF87DE6BF38';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B8051F5E-D175-4A1B-B838-902BCA34700D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '84D272E8-9CEE-4BC2-91D0-E07959E3B5BA';

/* Set entity icon to fa fa-database */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-database', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '95AE4A10-7D58-4D55-BE27-5B934A958411';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8a15bc51-369d-5b46-a254-d5b6be9e4ebe', '95AE4A10-7D58-4D55-BE27-5B934A958411', 'FieldCategoryInfo', '{
  "Chunk Payload": {
    "description": "Diagnostic payload content, entry counts, and data format details",
    "icon": "fa fa-file-code"
  },
  "Session Information": {
    "description": "Session context, origin tier, and instance identifiers",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline": {
    "description": "Timestamps for the earliest and latest events in the chunk",
    "icon": "fa fa-clock"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a0a0b277-b222-5ec4-a6b5-4b3b8d204f08', '95AE4A10-7D58-4D55-BE27-5B934A958411', 'FieldCategoryIcons', '{
  "Chunk Payload": "fa fa-file-code",
  "Session Information": "fa fa-info-circle",
  "System Metadata": "fa fa-cog",
  "Timeline": "fa fa-clock"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '95AE4A10-7D58-4D55-BE27-5B934A958411';

/* Set categories for 35 fields */

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EDD96485-AB7F-4B90-B8B0-0FF89F5CE083';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0B1302D6-9EC4-44D1-A37A-990917DA383D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8BB008BF-DE67-444D-9C70-F6CA72CE1E5F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Direction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Bundle Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '329F06FC-164A-44CA-9A37-6DB686E80DC9';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.DiagnosticSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source and References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Diagnostic Session'
WHERE 
   ID = '1B866D87-8BD5-4797-8BD6-A7B82208960E';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.DiagnosticSession 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source and References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Diagnostic Session Name'
WHERE 
   ID = 'EEDC374E-540D-4BFE-8DF1-6298FC76EB30';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B3E39419-3F28-487F-8E96-B787A316AE23';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FailureReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '058765E6-DD09-484F-822E-B466D681E801';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ScrubLiterals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content and Findings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '03F204C7-74B8-4567-B4E7-8DAAD2AE52F6';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.WindowStart 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content and Findings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5E30689F-DA96-490F-8D50-19E9CE98EA06';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.WindowEnd 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content and Findings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9B0845FB-9964-49E8-B814-134DE5842026';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ManifestJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content and Findings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '12DDB9B2-BB41-4A3B-8BB8-CEA9FC7D6E68';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ScrubReportJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content and Findings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'BE34EF65-DD3F-4631-944F-18126E0DEC06';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FindingsJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content and Findings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'AD7DD548-3A48-40B8-843E-16DAFE4AF6C4';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'File'
WHERE 
   ID = '9AA2C46A-16E0-4233-871E-9FFCCE400ACB';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.File 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'File Name'
WHERE 
   ID = 'D922872F-06A0-43DD-8054-C7EB3A26E69F';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and File Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C66BBB4A-991E-448A-83B0-C977D59DDCED';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Size (Bytes)'
WHERE 
   ID = '008BE4D2-D5DA-4D58-9C59-C2D0EA75C1A2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SHA256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage and File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'SHA256'
WHERE 
   ID = '1103F8CE-C48C-4FE3-AE05-EAD4E4516347';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CreatedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '601F1C45-A56C-4CCD-9A29-EFC6A7FEE5C4';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CreatedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '225F88A3-F9A2-4B13-A5A1-93C058F7FCD2';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '999005E6-4821-443F-BB77-E06FE89D87D6';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C60F4895-1B9F-4D4F-9028-402F46622B3D';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership and Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '374EFB56-CA0C-464C-B67F-F63BF4FC71B8';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Destination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Transmission Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5486F090-0C0F-4312-AB17-2109820F6866';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SentAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Transmission Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C6A6729A-6922-4977-97F5-2EB4B9471308';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ExternalReferenceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Transmission Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6C7BDFED-2462-45FD-9022-6FFE9B9369BA';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SenderInstallID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Intake and Source Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E864C1FE-6E5B-4FD7-982A-6D0EC2083C49';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SenderMJVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Intake and Source Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C10C0183-8895-4CEA-AFF0-C2B993772BD0';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ContactInfo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Intake and Source Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0D61DE7D-C46E-45FC-BF04-29D295D55AEC';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle and Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BC31DA3A-499B-4C7C-B0C9-BF8CF37C25DE';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source and References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '928B0221-2753-412E-97C8-58998662FB3B';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source and References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '90D490A2-AF3B-4909-B17E-B55C3F013F09';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C987F153-54F3-492F-BD74-8B1851199237';

-- UPDATE Entity Field Category Info MJ: Diagnostic Bundles.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '23D783E5-25D1-48F6-9960-2802038AE3FB';

/* Set entity icon to fa fa-stethoscope */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-stethoscope', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A385086E-1147-4042-AE36-D808CE850EF9';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ea0c70cd-20f1-5e92-b7a5-bc679fa64d2b', 'A385086E-1147-4042-AE36-D808CE850EF9', 'FieldCategoryInfo', '{
  "Bundle Information": {
    "description": "General identification and descriptive details of the diagnostic bundle",
    "icon": "fa fa-info-circle"
  },
  "Content and Findings": {
    "description": "Manifests, scrubbing reports, automated findings, and time windows",
    "icon": "fa fa-file-alt"
  },
  "Intake and Source Context": {
    "description": "Remote sender metadata and contact information for ingested bundles",
    "icon": "fa fa-network-wired"
  },
  "Lifecycle and Status": {
    "description": "Current status, failure reasons, and retention expiration",
    "icon": "fa fa-tasks"
  },
  "Ownership and Approval": {
    "description": "Creators, approvers, and approval timestamps",
    "icon": "fa fa-user-shield"
  },
  "Source and References": {
    "description": "Originating diagnostic session, company scoping, and relationships",
    "icon": "fa fa-link"
  },
  "Storage and File Details": {
    "description": "File storage references, binary data, size, and checksums",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Transmission Details": {
    "description": "External destination, transmission timestamps, and reference IDs",
    "icon": "fa fa-paper-plane"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('29625ba2-5469-58a3-82bf-a07404eba192', 'A385086E-1147-4042-AE36-D808CE850EF9', 'FieldCategoryIcons', '{
  "Bundle Information": "fa fa-info-circle",
  "Content and Findings": "fa fa-file-alt",
  "Intake and Source Context": "fa fa-network-wired",
  "Lifecycle and Status": "fa fa-tasks",
  "Ownership and Approval": "fa fa-user-shield",
  "Source and References": "fa fa-link",
  "Storage and File Details": "fa fa-database",
  "System Metadata": "fa fa-cog",
  "Transmission Details": "fa fa-paper-plane"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A385086E-1147-4042-AE36-D808CE850EF9';

