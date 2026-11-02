-- =====================================================================================
-- Diagnostic Bundles & Flight Recorder Schema (MJ 6.2)
--
-- Introduces three core tables:
--   1. DiagnosticSession: bounded server and client diagnostic recording sessions with
--      tenant isolation, scope targeting, and byte-budget controls.
--   2. DiagnosticSessionChunk: compressed NDJSON capture chunks flushed by server
--      instances and client browsers during a diagnostic session.
--   3. DiagnosticBundle: assembled .mjdiag diagnostic bundles (both locally built
--      bundles and external bundles received via MJAPI intake) with manifest,
--      scrubbing report, automated findings, and MJStorage link.
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
-- 4. Extended properties (Table & Column descriptions)
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

GO




























































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- Contains Entity / EntityField / EntityPermission / EntityRelationship inserts,
-- regenerated base views, spCreate / spUpdate / spDelete procedures, FK indexes,
-- and permission grants for DiagnosticSession, DiagnosticSessionChunk, and DiagnosticBundle.
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
         [UserViewMaxRows],
         [Icon],
         [__mj_CreatedAt],
         [__mj_UpdatedAt]
      )
      VALUES (
         '8f71c490-5b21-4e3a-9c14-101000000001',
         'MJ: Diagnostic Sessions',
         'Diagnostic Sessions',
         'Bounded server and client diagnostic recording sessions with tenant isolation, scope targeting, and byte-budget controls.',
         NULL,
         'DiagnosticSession',
         'vwDiagnosticSessions',
         '${flyway:defaultSchema}',
         1,
         0,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000,
         'fa fa-stethoscope',
         GETUTCDATE(),
         GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Diagnostic Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
   ([ApplicationID], [EntityID], [Sequence], [DefaultForNewUser], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8f71c490-5b21-4e3a-9c14-101000000001', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-101000000001' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-101000000001' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-101000000001' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-101000000001' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-101000000001' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-101000000001' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL text to add special date fields __mj_CreatedAt and __mj_UpdatedAt to DiagnosticSession */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_DiagnosticSession___mj_CreatedAt] DEFAULT GETUTCDATE();
GO
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_DiagnosticSession___mj_UpdatedAt] DEFAULT GETUTCDATE();
GO

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000101' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000101',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000102' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000102',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000103' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'Reason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000103',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000104' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000104',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000001', '8F71C490-5B21-4E3A-9C14-101000000104', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000002', '8F71C490-5B21-4E3A-9C14-101000000104', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000003', '8F71C490-5B21-4E3A-9C14-101000000104', 3, 'Stopped', 'Stopped', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-101000000104';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000105' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'ScopeType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000105',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000004', '8F71C490-5B21-4E3A-9C14-101000000105', 1, 'APIKeys', 'APIKeys', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000005', '8F71C490-5B21-4E3A-9C14-101000000105', 2, 'BrowserSession', 'BrowserSession', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000006', '8F71C490-5B21-4E3A-9C14-101000000105', 3, 'Instance', 'Instance', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000007', '8F71C490-5B21-4E3A-9C14-101000000105', 4, 'Operations', 'Operations', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000008', '8F71C490-5B21-4E3A-9C14-101000000105', 5, 'Users', 'Users', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-101000000105';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000106' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'ScopeJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000106',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000107' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'Level')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000107',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000009', '8F71C490-5B21-4E3A-9C14-101000000107', 1, 'Debug', 'Debug', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000010', '8F71C490-5B21-4E3A-9C14-101000000107', 2, 'Standard', 'Standard', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000011', '8F71C490-5B21-4E3A-9C14-101000000107', 3, 'Verbose', 'Verbose', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-101000000107';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000108' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'CategoriesJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000108',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000109' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'ScrubLiterals')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000109',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000110' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000110',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000111' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'EndsAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000111',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000112' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'StoppedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000112',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000113' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'MaxBytes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000113',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000114' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000114',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000115' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000115',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000116' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000116',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000117' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000117',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000118' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'CreatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000118',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-101000000119' OR (EntityID = '8F71C490-5B21-4E3A-9C14-101000000001' AND Name = 'Company')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-101000000119',
            '8F71C490-5B21-4E3A-9C14-101000000001', -- Entity: MJ: Diagnostic Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-101000000001'),
            'Company',
            'Company',
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

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticSession_CreatedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticSession_CreatedByUserID ON [${flyway:defaultSchema}].[DiagnosticSession] ([CreatedByUserID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-101000000114', @RelatedEntityNameFieldMap='CreatedByUser';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticSession_CompanyID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticSession_CompanyID ON [${flyway:defaultSchema}].[DiagnosticSession] ([CompanyID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-101000000115', @RelatedEntityNameFieldMap='Company';

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
         [UserViewMaxRows],
         [Icon],
         [__mj_CreatedAt],
         [__mj_UpdatedAt]
      )
      VALUES (
         '8f71c490-5b21-4e3a-9c14-102000000001',
         'MJ: Diagnostic Session Chunks',
         'Diagnostic Session Chunks',
         'Compressed NDJSON capture chunks flushed by server instances and client browsers during a diagnostic session.',
         NULL,
         'DiagnosticSessionChunk',
         'vwDiagnosticSessionChunks',
         '${flyway:defaultSchema}',
         1,
         0,
         0,
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         1000,
         'fa fa-layer-group',
         GETUTCDATE(),
         GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Diagnostic Session Chunks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
   ([ApplicationID], [EntityID], [Sequence], [DefaultForNewUser], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8f71c490-5b21-4e3a-9c14-102000000001', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-102000000001' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-102000000001' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-102000000001' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-102000000001' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-102000000001' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-102000000001' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL text to add special date fields __mj_CreatedAt and __mj_UpdatedAt to DiagnosticSessionChunk */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_DiagnosticSessionChunk___mj_CreatedAt] DEFAULT GETUTCDATE();
GO
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticSessionChunk] ADD [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_DiagnosticSessionChunk___mj_UpdatedAt] DEFAULT GETUTCDATE();
GO

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000101' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000101',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000102' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'DiagnosticSessionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000102',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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
            '8F71C490-5B21-4E3A-9C14-101000000001',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000103' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000103',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000012', '8F71C490-5B21-4E3A-9C14-102000000103', 1, 'Client', 'Client', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000013', '8F71C490-5B21-4E3A-9C14-102000000103', 2, 'Server', 'Server', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-102000000103';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000104' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'HostInstanceLabel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000104',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000105' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000105',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000106' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'ContentKind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000106',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000014', '8F71C490-5B21-4E3A-9C14-102000000106', 1, 'App', 'App', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000015', '8F71C490-5B21-4E3A-9C14-102000000106', 2, 'Errors', 'Errors', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000016', '8F71C490-5B21-4E3A-9C14-102000000106', 3, 'Health', 'Health', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000017', '8F71C490-5B21-4E3A-9C14-102000000106', 4, 'Logs', 'Logs', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000018', '8F71C490-5B21-4E3A-9C14-102000000106', 5, 'Network', 'Network', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000019', '8F71C490-5B21-4E3A-9C14-102000000106', 6, 'SQL', 'SQL', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000020', '8F71C490-5B21-4E3A-9C14-102000000106', 7, 'Spans', 'Spans', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000021', '8F71C490-5B21-4E3A-9C14-102000000106', 8, 'Telemetry', 'Telemetry', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000022', '8F71C490-5B21-4E3A-9C14-102000000106', 9, 'Timeline', 'Timeline', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-102000000106';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000107' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'Data')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000107',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000108' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'EntryCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000108',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000109' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'FirstEntryAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000109',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000110' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'LastEntryAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000110',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000111' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000111',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000112' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000112',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-102000000113' OR (EntityID = '8F71C490-5B21-4E3A-9C14-102000000001' AND Name = 'DiagnosticSession')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-102000000113',
            '8F71C490-5B21-4E3A-9C14-102000000001', -- Entity: MJ: Diagnostic Session Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-102000000001'),
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

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticSessionChunk_DiagnosticSessionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticSessionChunk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticSessionChunk_DiagnosticSessionID ON [${flyway:defaultSchema}].[DiagnosticSessionChunk] ([DiagnosticSessionID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-102000000102', @RelatedEntityNameFieldMap='DiagnosticSession';

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
         [UserViewMaxRows],
         [Icon],
         [__mj_CreatedAt],
         [__mj_UpdatedAt]
      )
      VALUES (
         '8f71c490-5b21-4e3a-9c14-103000000001',
         'MJ: Diagnostic Bundles',
         'Diagnostic Bundles',
         'Assembled .mjdiag diagnostic bundles (both locally built bundles and external bundles received via MJAPI intake) with manifest, scrubbing report, automated findings, and MJStorage link.',
         NULL,
         'DiagnosticBundle',
         'vwDiagnosticBundles',
         '${flyway:defaultSchema}',
         1,
         0,
         0,
         0,
         0,
         0,
         0,
         1,
         1,
         1,
         1000,
         'fa fa-box-open',
         GETUTCDATE(),
         GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Diagnostic Bundles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
   ([ApplicationID], [EntityID], [Sequence], [DefaultForNewUser], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8f71c490-5b21-4e3a-9c14-103000000001', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-103000000001' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-103000000001' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-103000000001' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-103000000001' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
   ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST('8f71c490-5b21-4e3a-9c14-103000000001' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
WHERE NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
   WHERE [EntityID] = CAST('8f71c490-5b21-4e3a-9c14-103000000001' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
);

/* SQL text to add special date fields __mj_CreatedAt and __mj_UpdatedAt to DiagnosticBundle */
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ADD [__mj_CreatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_DiagnosticBundle___mj_CreatedAt] DEFAULT GETUTCDATE();
GO
ALTER TABLE [${flyway:defaultSchema}].[DiagnosticBundle] ADD [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF___mj_DiagnosticBundle___mj_UpdatedAt] DEFAULT GETUTCDATE();
GO

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000101' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000101',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000102' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000102',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000103' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000103',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000104' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Direction')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000104',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000023', '8F71C490-5B21-4E3A-9C14-103000000104', 1, 'Local', 'Local', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000024', '8F71C490-5B21-4E3A-9C14-103000000104', 2, 'Received', 'Received', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-103000000104';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000105' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'DiagnosticSessionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000105',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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
            '8F71C490-5B21-4E3A-9C14-101000000001',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000106' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000106',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000025', '8F71C490-5B21-4E3A-9C14-103000000106', 1, 'Building', 'Building', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000026', '8F71C490-5B21-4E3A-9C14-103000000106', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000027', '8F71C490-5B21-4E3A-9C14-103000000106', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000028', '8F71C490-5B21-4E3A-9C14-103000000106', 4, 'Ready', 'Ready', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000029', '8F71C490-5B21-4E3A-9C14-103000000106', 5, 'Receiving', 'Receiving', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000030', '8F71C490-5B21-4E3A-9C14-103000000106', 6, 'Sending', 'Sending', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000031', '8F71C490-5B21-4E3A-9C14-103000000106', 7, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-103000000106';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000107' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ScrubLiterals')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000107',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000108' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'WindowStart')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000108',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000109' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'WindowEnd')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000109',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000110' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'FileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000110',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000111' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Data')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000111',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000112' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'SizeBytes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000112',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000113' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'SHA256')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000113',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
            'SHA256',
            'SHA256',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000114' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ManifestJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000114',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000115' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ScrubReportJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000115',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000116' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'FindingsJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000116',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000117' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'FailureReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000117',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000118' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000118',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000119' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ApprovedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000119',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000120' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ApprovedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000120',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000121' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Destination')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000121',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000032', '8F71C490-5B21-4E3A-9C14-103000000121', 1, 'CustomerCollector', 'CustomerCollector', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000033', '8F71C490-5B21-4E3A-9C14-103000000121', 2, 'MJC', 'MJC', GETUTCDATE(), GETUTCDATE());

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8f71c490-5b21-4e3a-9c14-109000000034', '8F71C490-5B21-4E3A-9C14-103000000121', 3, 'StorageAccount', 'StorageAccount', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8F71C490-5B21-4E3A-9C14-103000000121';

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000122' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'SentAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000122',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000123' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ExternalReferenceID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000123',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000124' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'SenderInstallID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000124',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000125' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'SenderMJVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000125',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000126' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ContactInfo')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000126',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000127' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ExpiresAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000127',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000128' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000128',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000129' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000129',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000130' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000130',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000131' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'DiagnosticSession')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000131',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000132' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'File')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000132',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000133' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'CreatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000133',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000134' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'ApprovedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000134',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f71c490-5b21-4e3a-9c14-103000000135' OR (EntityID = '8F71C490-5B21-4E3A-9C14-103000000001' AND Name = 'Company')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f71c490-5b21-4e3a-9c14-103000000135',
            '8F71C490-5B21-4E3A-9C14-103000000001', -- Entity: MJ: Diagnostic Bundles
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F71C490-5B21-4E3A-9C14-103000000001'),
            'Company',
            'Company',
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

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_DiagnosticSessionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_DiagnosticSessionID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([DiagnosticSessionID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-103000000105', @RelatedEntityNameFieldMap='DiagnosticSession';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_FileID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_FileID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([FileID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-103000000110', @RelatedEntityNameFieldMap='File';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_CreatedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_CreatedByUserID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([CreatedByUserID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-103000000118', @RelatedEntityNameFieldMap='CreatedByUser';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_ApprovedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_ApprovedByUserID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([ApprovedByUserID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-103000000119', @RelatedEntityNameFieldMap='ApprovedByUser';

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DiagnosticBundle_CompanyID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DiagnosticBundle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DiagnosticBundle_CompanyID ON [${flyway:defaultSchema}].[DiagnosticBundle] ([CompanyID]);

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F71C490-5B21-4E3A-9C14-103000000128', @RelatedEntityNameFieldMap='Company';


-- Base View for MJ: Diagnostic Sessions
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
GO

-- Base View for MJ: Diagnostic Session Chunks
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticSessionChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticSessionChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticSessionChunks]
AS
SELECT
    c.*,
    MJDiagnosticSession_DiagnosticSessionID.[Name] AS [DiagnosticSession]
FROM
    [${flyway:defaultSchema}].[DiagnosticSessionChunk] AS c
INNER JOIN
    [${flyway:defaultSchema}].[DiagnosticSession] AS MJDiagnosticSession_DiagnosticSessionID
  ON
    [c].[DiagnosticSessionID] = MJDiagnosticSession_DiagnosticSessionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO

-- Base View for MJ: Diagnostic Bundles
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDiagnosticBundles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDiagnosticBundles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDiagnosticBundles]
AS
SELECT
    b.*,
    MJDiagnosticSession_DiagnosticSessionID.[Name] AS [DiagnosticSession],
    MJFile_FileID.[Name] AS [File],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser],
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[DiagnosticBundle] AS b
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DiagnosticSession] AS MJDiagnosticSession_DiagnosticSessionID
  ON
    [b].[DiagnosticSessionID] = MJDiagnosticSession_DiagnosticSessionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [b].[FileID] = MJFile_FileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [b].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [b].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [b].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDiagnosticBundles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO


IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSession]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Reason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ScopeType nvarchar(30) = NULL,
    @ScopeJSON nvarchar(MAX) = NULL,
    @Level nvarchar(20) = NULL,
    @CategoriesJSON nvarchar(MAX) = NULL,
    @ScrubLiterals bit = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndsAt datetimeoffset = NULL,
    @StoppedAt datetimeoffset = NULL,
    @MaxBytes bigint = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
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
                @Reason,
                @Status,
                @ScopeType,
                @ScopeJSON,
                @Level,
                @CategoriesJSON,
                @ScrubLiterals,
                @StartedAt,
                @EndsAt,
                @StoppedAt,
                @MaxBytes,
                @CreatedByUserID,
                @CompanyID
            )
    END
    ELSE
    BEGIN
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
                @Reason,
                @Status,
                @ScopeType,
                @ScopeJSON,
                @Level,
                @CategoriesJSON,
                @ScrubLiterals,
                @StartedAt,
                @EndsAt,
                @StoppedAt,
                @MaxBytes,
                @CreatedByUserID,
                @CompanyID
            )
    END
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];
GO

IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticSession]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Reason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ScopeType nvarchar(30) = NULL,
    @ScopeJSON nvarchar(MAX) = NULL,
    @Level nvarchar(20) = NULL,
    @CategoriesJSON nvarchar(MAX) = NULL,
    @ScrubLiterals bit = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndsAt datetimeoffset = NULL,
    @StoppedAt datetimeoffset = NULL,
    @MaxBytes bigint = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticSession]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [Status] = ISNULL(@Status, [Status]),
        [ScopeType] = ISNULL(@ScopeType, [ScopeType]),
        [ScopeJSON] = ISNULL(@ScopeJSON, [ScopeJSON]),
        [Level] = ISNULL(@Level, [Level]),
        [CategoriesJSON] = ISNULL(@CategoriesJSON, [CategoriesJSON]),
        [ScrubLiterals] = ISNULL(@ScrubLiterals, [ScrubLiterals]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndsAt] = ISNULL(@EndsAt, [EndsAt]),
        [StoppedAt] = ISNULL(@StoppedAt, [StoppedAt]),
        [MaxBytes] = ISNULL(@MaxBytes, [MaxBytes]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID])
    WHERE
        [ID] = @ID

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessions] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSession] TO [cdp_Developer], [cdp_Integration];
GO

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

IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [${flyway:defaultSchema}].[DiagnosticSession] WHERE [ID] = @ID
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID]
    ELSE
        SELECT @ID AS [ID]
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSession] TO [cdp_Developer], [cdp_Integration];
GO


IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk]
    @ID uniqueidentifier = NULL,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Source nvarchar(20) = NULL,
    @HostInstanceLabel nvarchar(255) = NULL,
    @Sequence int = NULL,
    @ContentKind nvarchar(30) = NULL,
    @Data varbinary(MAX) = NULL,
    @EntryCount int = NULL,
    @FirstEntryAt datetimeoffset = NULL,
    @LastEntryAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
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
                @EntryCount,
                @FirstEntryAt,
                @LastEntryAt
            )
    END
    ELSE
    BEGIN
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
                @EntryCount,
                @FirstEntryAt,
                @LastEntryAt
            )
    END
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];
GO

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
    @FirstEntryAt datetimeoffset = NULL,
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
        [FirstEntryAt] = ISNULL(@FirstEntryAt, [FirstEntryAt]),
        [LastEntryAt] = ISNULL(@LastEntryAt, [LastEntryAt])
    WHERE
        [ID] = @ID

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticSessionChunks] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];
GO

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

IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [${flyway:defaultSchema}].[DiagnosticSessionChunk] WHERE [ID] = @ID
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID]
    ELSE
        SELECT @ID AS [ID]
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticSessionChunk] TO [cdp_Developer], [cdp_Integration];
GO


IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDiagnosticBundle]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description nvarchar(MAX) = NULL,
    @Direction nvarchar(20) = NULL,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ScrubLiterals bit = NULL,
    @WindowStart datetimeoffset = NULL,
    @WindowEnd datetimeoffset = NULL,
    @FileID uniqueidentifier = NULL,
    @Data varbinary(MAX) = NULL,
    @SizeBytes bigint = NULL,
    @SHA256 nchar(64) = NULL,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ScrubReportJSON nvarchar(MAX) = NULL,
    @FindingsJSON nvarchar(MAX) = NULL,
    @FailureReason nvarchar(MAX) = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt datetimeoffset = NULL,
    @Destination nvarchar(30) = NULL,
    @SentAt datetimeoffset = NULL,
    @ExternalReferenceID nvarchar(255) = NULL,
    @SenderInstallID uniqueidentifier = NULL,
    @SenderMJVersion nvarchar(50) = NULL,
    @ContactInfo nvarchar(500) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
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
                @Description,
                @Direction,
                @DiagnosticSessionID,
                @Status,
                @ScrubLiterals,
                @WindowStart,
                @WindowEnd,
                @FileID,
                @Data,
                @SizeBytes,
                @SHA256,
                @ManifestJSON,
                @ScrubReportJSON,
                @FindingsJSON,
                @FailureReason,
                @CreatedByUserID,
                @ApprovedByUserID,
                @ApprovedAt,
                @Destination,
                @SentAt,
                @ExternalReferenceID,
                @SenderInstallID,
                @SenderMJVersion,
                @ContactInfo,
                @ExpiresAt,
                @CompanyID
            )
    END
    ELSE
    BEGIN
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
                @Description,
                @Direction,
                @DiagnosticSessionID,
                @Status,
                @ScrubLiterals,
                @WindowStart,
                @WindowEnd,
                @FileID,
                @Data,
                @SizeBytes,
                @SHA256,
                @ManifestJSON,
                @ScrubReportJSON,
                @FindingsJSON,
                @FailureReason,
                @CreatedByUserID,
                @ApprovedByUserID,
                @ApprovedAt,
                @Destination,
                @SentAt,
                @ExternalReferenceID,
                @SenderInstallID,
                @SenderMJVersion,
                @ContactInfo,
                @ExpiresAt,
                @CompanyID
            )
    END
    SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];
GO

IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDiagnosticBundle]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description nvarchar(MAX) = NULL,
    @Direction nvarchar(20) = NULL,
    @DiagnosticSessionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ScrubLiterals bit = NULL,
    @WindowStart datetimeoffset = NULL,
    @WindowEnd datetimeoffset = NULL,
    @FileID uniqueidentifier = NULL,
    @Data varbinary(MAX) = NULL,
    @SizeBytes bigint = NULL,
    @SHA256 nchar(64) = NULL,
    @ManifestJSON nvarchar(MAX) = NULL,
    @ScrubReportJSON nvarchar(MAX) = NULL,
    @FindingsJSON nvarchar(MAX) = NULL,
    @FailureReason nvarchar(MAX) = NULL,
    @CreatedByUserID uniqueidentifier = NULL,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt datetimeoffset = NULL,
    @Destination nvarchar(30) = NULL,
    @SentAt datetimeoffset = NULL,
    @ExternalReferenceID nvarchar(255) = NULL,
    @SenderInstallID uniqueidentifier = NULL,
    @SenderMJVersion nvarchar(50) = NULL,
    @ContactInfo nvarchar(500) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @CompanyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DiagnosticBundle]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = ISNULL(@Description, [Description]),
        [Direction] = ISNULL(@Direction, [Direction]),
        [DiagnosticSessionID] = ISNULL(@DiagnosticSessionID, [DiagnosticSessionID]),
        [Status] = ISNULL(@Status, [Status]),
        [ScrubLiterals] = ISNULL(@ScrubLiterals, [ScrubLiterals]),
        [WindowStart] = ISNULL(@WindowStart, [WindowStart]),
        [WindowEnd] = ISNULL(@WindowEnd, [WindowEnd]),
        [FileID] = ISNULL(@FileID, [FileID]),
        [Data] = ISNULL(@Data, [Data]),
        [SizeBytes] = ISNULL(@SizeBytes, [SizeBytes]),
        [SHA256] = ISNULL(@SHA256, [SHA256]),
        [ManifestJSON] = ISNULL(@ManifestJSON, [ManifestJSON]),
        [ScrubReportJSON] = ISNULL(@ScrubReportJSON, [ScrubReportJSON]),
        [FindingsJSON] = ISNULL(@FindingsJSON, [FindingsJSON]),
        [FailureReason] = ISNULL(@FailureReason, [FailureReason]),
        [CreatedByUserID] = ISNULL(@CreatedByUserID, [CreatedByUserID]),
        [ApprovedByUserID] = ISNULL(@ApprovedByUserID, [ApprovedByUserID]),
        [ApprovedAt] = ISNULL(@ApprovedAt, [ApprovedAt]),
        [Destination] = ISNULL(@Destination, [Destination]),
        [SentAt] = ISNULL(@SentAt, [SentAt]),
        [ExternalReferenceID] = ISNULL(@ExternalReferenceID, [ExternalReferenceID]),
        [SenderInstallID] = ISNULL(@SenderInstallID, [SenderInstallID]),
        [SenderMJVersion] = ISNULL(@SenderMJVersion, [SenderMJVersion]),
        [ContactInfo] = ISNULL(@ContactInfo, [ContactInfo]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID])
    WHERE
        [ID] = @ID

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwDiagnosticBundles] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];
GO

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

IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDiagnosticBundle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticBundle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDiagnosticBundle]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [${flyway:defaultSchema}].[DiagnosticBundle] WHERE [ID] = @ID
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID]
    ELSE
        SELECT @ID AS [ID]
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDiagnosticBundle] TO [cdp_Developer], [cdp_Integration];
GO
