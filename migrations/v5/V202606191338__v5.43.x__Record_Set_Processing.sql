/**************************************************************************************************
 * Migration: Record Set Processing & Record Processes (P0)
 *
 * Purpose: Create the three foundational entities for the unified Record Set Processing design
 * (see plans/record-set-processing-and-record-processes.md §4):
 *
 *   1. RecordProcess    (MJ: Record Processes)    - the declarative facade binding
 *                                                    Work × Scope × Trigger
 *   2. ProcessRun       (MJ: Process Runs)         - source-agnostic run header
 *   3. ProcessRunDetail (MJ: Process Run Details)  - generic per-record audit/resume detail
 *
 * Schema/DDL only. CodeGen generates the Entity/EntityField metadata, __mj_CreatedAt/__mj_UpdatedAt
 * columns, foreign-key indexes (IDX_AUTO_MJ_FKEY_*), views, and CRUD stored procedures after this
 * migration runs. Do NOT add those here.
 *
 * Version: 5.43.x
 **************************************************************************************************/

-- ============================================================================
-- 1. RecordProcess (MJ: Record Processes) — the facade definition
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[RecordProcess] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [EntityID] UNIQUEIDENTIFIER NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [WorkType] NVARCHAR(20) NOT NULL,
    [ActionID] UNIQUEIDENTIFIER NULL,
    [AgentID] UNIQUEIDENTIFIER NULL,
    [ScopeType] NVARCHAR(20) NOT NULL,
    [ScopeViewID] UNIQUEIDENTIFIER NULL,
    [ScopeListID] UNIQUEIDENTIFIER NULL,
    [ScopeFilter] NVARCHAR(MAX) NULL,
    [OnChangeEnabled] BIT NOT NULL DEFAULT 0,
    [OnChangeInvocationType] NVARCHAR(30) NULL,
    [OnChangeFilter] NVARCHAR(MAX) NULL,
    [ScheduleEnabled] BIT NOT NULL DEFAULT 0,
    [CronExpression] NVARCHAR(120) NULL,
    [Timezone] NVARCHAR(100) NULL DEFAULT 'UTC',
    [OnDemandEnabled] BIT NOT NULL DEFAULT 1,
    [InputMapping] NVARCHAR(MAX) NULL,
    [OutputMapping] NVARCHAR(MAX) NULL,
    [SkipUnchanged] BIT NOT NULL DEFAULT 1,
    [WatermarkStrategy] NVARCHAR(20) NULL,
    [BatchSize] INT NULL DEFAULT 100,
    [MaxConcurrency] INT NULL DEFAULT 1,
    CONSTRAINT [PK_RecordProcess] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_RecordProcess_Status] CHECK ([Status] IN ('Draft', 'Active', 'Disabled')),
    CONSTRAINT [CK_RecordProcess_WorkType] CHECK ([WorkType] IN ('Action', 'Agent')),
    CONSTRAINT [CK_RecordProcess_ScopeType] CHECK ([ScopeType] IN ('SingleRecord', 'View', 'List', 'Filter')),
    CONSTRAINT [CK_RecordProcess_OnChangeInvocationType] CHECK ([OnChangeInvocationType] IN ('AfterCreate', 'AfterUpdate', 'AfterDelete', 'Validate')),
    CONSTRAINT [CK_RecordProcess_WatermarkStrategy] CHECK ([WatermarkStrategy] IN ('Checksum', 'UpdatedAt', 'None')),
    CONSTRAINT [FK_RecordProcess_Entity] FOREIGN KEY ([EntityID])
        REFERENCES ${flyway:defaultSchema}.[Entity]([ID]),
    CONSTRAINT [FK_RecordProcess_Action] FOREIGN KEY ([ActionID])
        REFERENCES ${flyway:defaultSchema}.[Action]([ID]),
    CONSTRAINT [FK_RecordProcess_Agent] FOREIGN KEY ([AgentID])
        REFERENCES ${flyway:defaultSchema}.[AIAgent]([ID]),
    CONSTRAINT [FK_RecordProcess_ScopeView] FOREIGN KEY ([ScopeViewID])
        REFERENCES ${flyway:defaultSchema}.[UserView]([ID]),
    CONSTRAINT [FK_RecordProcess_ScopeList] FOREIGN KEY ([ScopeListID])
        REFERENCES ${flyway:defaultSchema}.[List]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Declarative facade binding a unit of Work (Action or Agent) to a Scope (record set) and one or more Triggers (on-change / schedule / on-demand). Owns and reconciles the underlying Entity Action and Scheduled Job rows.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable name of the record process', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of what this process does', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the target entity whose records this process operates on', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status: Draft (not yet wired), Active (triggers live), or Disabled', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the work is an Action or an Agent (Agents are dispatched through the Execute Agent action)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'WorkType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Action to run, when WorkType=Action', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'ActionID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the AI Agent to run, when WorkType=Agent. The agent must be top-level and flagged ExposeAsAction.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'AgentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How the record set is scoped for the Schedule and On-Demand triggers: SingleRecord, View, List, or Filter. The On-Change trigger is always single-record and ignores this.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'ScopeType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the User View defining the scope, when ScopeType=View', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'ScopeViewID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the List defining the scope, when ScopeType=List', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'ScopeListID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ad-hoc WHERE clause used to resolve the record set, when ScopeType=Filter', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'ScopeFilter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the process runs per-record on save via an owned Entity Action', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'OnChangeEnabled';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which save event fires the on-change trigger: AfterCreate, AfterUpdate, AfterDelete, or Validate', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'OnChangeInvocationType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Gating expression evaluated against the changed record (with changed-fields context) that compiles into the owned Entity Action Filter', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'OnChangeFilter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the process runs on a cron schedule via an owned Scheduled Job', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'ScheduleEnabled';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cron expression for the schedule trigger, when ScheduleEnabled=1', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'CronExpression';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IANA timezone for evaluating the cron expression (default UTC)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'Timezone';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the process can be run on demand (button / resolver)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'OnDemandEnabled';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON mapping describing how a record maps to the work inputs (optionally including an EntityDocumentID for render-to-text)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'InputMapping';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON mapping describing how the structured output payload writes back (to fields, a child record, or tags)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'OutputMapping';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, records whose watermark indicates no change since last run are skipped', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'SkipUnchanged';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How unchanged records are detected for SkipUnchanged: Checksum, UpdatedAt, or None', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'WatermarkStrategy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records processed per batch (default 100)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'BatchSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum number of records processed concurrently within a batch (default 1)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'RecordProcess', @level2type=N'COLUMN', @level2name=N'MaxConcurrency';
GO

-- ============================================================================
-- 2. ProcessRun (MJ: Process Runs) — source-agnostic run header
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[ProcessRun] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [RecordProcessID] UNIQUEIDENTIFIER NULL,
    [EntityID] UNIQUEIDENTIFIER NULL,
    [TriggeredBy] NVARCHAR(20) NOT NULL,
    [SourceType] NVARCHAR(20) NOT NULL,
    [SourceID] UNIQUEIDENTIFIER NULL,
    [SourceFilter] NVARCHAR(MAX) NULL,
    [ScheduledJobRunID] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [StartTime] DATETIMEOFFSET NULL,
    [EndTime] DATETIMEOFFSET NULL,
    [TotalItemCount] INT NULL,
    [ProcessedItems] INT NOT NULL DEFAULT 0,
    [SuccessCount] INT NOT NULL DEFAULT 0,
    [ErrorCount] INT NOT NULL DEFAULT 0,
    [SkippedCount] INT NOT NULL DEFAULT 0,
    [LastProcessedOffset] INT NULL,
    [LastProcessedKey] NVARCHAR(450) NULL,
    [BatchSize] INT NULL,
    [CancellationRequested] BIT NOT NULL DEFAULT 0,
    [Configuration] NVARCHAR(MAX) NULL,
    [ErrorMessage] NVARCHAR(MAX) NULL,
    [StartedByUserID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_ProcessRun] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_ProcessRun_TriggeredBy] CHECK ([TriggeredBy] IN ('OnChange', 'Schedule', 'OnDemand', 'Manual')),
    CONSTRAINT [CK_ProcessRun_SourceType] CHECK ([SourceType] IN ('View', 'List', 'Filter', 'Array', 'Keyset', 'SingleRecord')),
    CONSTRAINT [CK_ProcessRun_Status] CHECK ([Status] IN ('Pending', 'Running', 'Paused', 'Completed', 'Failed', 'Cancelled')),
    CONSTRAINT [FK_ProcessRun_RecordProcess] FOREIGN KEY ([RecordProcessID])
        REFERENCES ${flyway:defaultSchema}.[RecordProcess]([ID]),
    CONSTRAINT [FK_ProcessRun_Entity] FOREIGN KEY ([EntityID])
        REFERENCES ${flyway:defaultSchema}.[Entity]([ID]),
    CONSTRAINT [FK_ProcessRun_ScheduledJobRun] FOREIGN KEY ([ScheduledJobRunID])
        REFERENCES ${flyway:defaultSchema}.[ScheduledJobRun]([ID]),
    CONSTRAINT [FK_ProcessRun_StartedByUser] FOREIGN KEY ([StartedByUserID])
        REFERENCES ${flyway:defaultSchema}.[User]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Source-agnostic header for one execution of any set-processing job, whether launched by a Record Process, a Scheduled Job, or a direct engine consumer.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Record Process that spawned this run (NULL for ad-hoc / engine-driven runs)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'RecordProcessID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the entity processed by this run, when the run is entity-scoped', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What triggered this run: OnChange, Schedule, OnDemand, or Manual', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'TriggeredBy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The kind of record-set source resolved for this run: View, List, Filter, Array, Keyset, or SingleRecord', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'SourceType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Polymorphic source identifier (ViewID or ListID) when applicable; no FK because it spans entities', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'SourceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Resolved filter snapshot used to materialize the record set for this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'SourceFilter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Scheduled Job Run that launched this run, when scheduler-launched', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'ScheduledJobRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Run status: Pending, Running, Paused, Completed, Failed, or Cancelled', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the run started', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'StartTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the run ended', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'EndTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Estimated or known total number of records to process', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'TotalItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Count of records processed so far', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'ProcessedItems';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Count of records processed successfully', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'SuccessCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Count of records that failed processing', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'ErrorCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Count of records skipped (e.g., unchanged per watermark)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'SkippedCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Offset-based resume cursor (StartRow) for sources that paginate by offset', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'LastProcessedOffset';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Keyset-based resume cursor (AfterKey) for sources that paginate by seek', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'LastProcessedKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Effective batch size for this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'BatchSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pause/cancel handshake flag honored by the processor between batches', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'CancellationRequested';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON snapshot of the effective configuration for this run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'Configuration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Run-level error message when Status=Failed', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'ErrorMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the user who started the run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRun', @level2type=N'COLUMN', @level2name=N'StartedByUserID';
GO

-- ============================================================================
-- 3. ProcessRunDetail (MJ: Process Run Details) — per-record audit / resume
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[ProcessRunDetail] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProcessRunID] UNIQUEIDENTIFIER NOT NULL,
    [EntityID] UNIQUEIDENTIFIER NOT NULL,
    [RecordID] NVARCHAR(450) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [StartedAt] DATETIMEOFFSET NULL,
    [CompletedAt] DATETIMEOFFSET NULL,
    [DurationMs] INT NULL,
    [AttemptCount] INT NOT NULL DEFAULT 0,
    [ResultPayload] NVARCHAR(MAX) NULL,
    [ErrorMessage] NVARCHAR(MAX) NULL,
    [ActionExecutionLogID] UNIQUEIDENTIFIER NULL,
    [AIAgentRunID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_ProcessRunDetail] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_ProcessRunDetail_Status] CHECK ([Status] IN ('Pending', 'Succeeded', 'Failed', 'Skipped')),
    CONSTRAINT [FK_ProcessRunDetail_ProcessRun] FOREIGN KEY ([ProcessRunID])
        REFERENCES ${flyway:defaultSchema}.[ProcessRun]([ID]),
    CONSTRAINT [FK_ProcessRunDetail_Entity] FOREIGN KEY ([EntityID])
        REFERENCES ${flyway:defaultSchema}.[Entity]([ID]),
    CONSTRAINT [FK_ProcessRunDetail_ActionExecutionLog] FOREIGN KEY ([ActionExecutionLogID])
        REFERENCES ${flyway:defaultSchema}.[ActionExecutionLog]([ID]),
    CONSTRAINT [FK_ProcessRunDetail_AIAgentRun] FOREIGN KEY ([AIAgentRunID])
        REFERENCES ${flyway:defaultSchema}.[AIAgentRun]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-record detail for a Process Run: powers audit, resume (skip already-done records), and the run-viewer UX. One row per processed record.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the parent Process Run', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'ProcessRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the entity of the processed record. Stored (not inherited) because a single run may span entities for ad-hoc / engine-driven runs.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key of the processed record, stored as text to remain composite-key safe', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'RecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-record status: Pending, Succeeded, Failed, or Skipped', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing of this record started', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'StartedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing of this record completed', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'CompletedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Processing duration for this record in milliseconds', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'DurationMs';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of processing attempts for this record (supports retry)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'AttemptCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Structured output payload (JSON) produced for this record', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'ResultPayload';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-record error message when Status=Failed', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'ErrorMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Action Execution Log for deep tracing, when the work was an Action', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'ActionExecutionLogID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the AI Agent Run for deep tracing, when the work was an Agent', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'ProcessRunDetail', @level2type=N'COLUMN', @level2name=N'AIAgentRunID';
GO
