-- =====================================================================================
-- Record Cloning: Clone Log Entities and Record Process WorkType
-- =====================================================================================
-- Introduces core infrastructure for Phase 1.4 of the Record Cloning Architecture:
-- 1. RecordCloneLog: Header entity logging every clone execution plan, status, and outcome
-- 2. RecordCloneLogItem: Item entity detailing per-node traversal, actions, and field changes
-- 3. RecordProcess.WorkType: Adds 'Clone' to allow batch record cloning via Record Processes
--
-- Design plan: plans/record-cloning/README.md §10.5, §11.3
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[RecordCloneLog] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RecordCloneLog_ID] DEFAULT (newsequentialid()),
    [RootEntityID]       UNIQUEIDENTIFIER NOT NULL,
    [RootSourceRecordID] NVARCHAR(750)    NOT NULL,
    [RootTargetRecordID] NVARCHAR(750)    NULL,
    [InitiatedByUserID]  UNIQUEIDENTIFIER NOT NULL,
    [Status]             NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RecordCloneLog_Status] DEFAULT (N'Planned'),
    [StartedAt]          DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_RecordCloneLog_StartedAt] DEFAULT (sysdatetimeoffset()),
    [EndedAt]            DATETIMEOFFSET   NULL,
    [PlanHash]           NVARCHAR(64)     NOT NULL,
    [PlanJSON]           NVARCHAR(MAX)    NOT NULL,
    [OptionsJSON]        NVARCHAR(MAX)    NULL,
    [ResultJSON]         NVARCHAR(MAX)    NULL,
    [Reason]             NVARCHAR(MAX)    NULL,
    [ErrorMessage]       NVARCHAR(MAX)    NULL,
    [ProcessRunID]       UNIQUEIDENTIFIER NULL,
    [CreatedCount]       INT              NOT NULL CONSTRAINT [DF_RecordCloneLog_CreatedCount] DEFAULT (0),
    [ReferencedCount]    INT              NOT NULL CONSTRAINT [DF_RecordCloneLog_ReferencedCount] DEFAULT (0),
    [SkippedCount]       INT              NOT NULL CONSTRAINT [DF_RecordCloneLog_SkippedCount] DEFAULT (0),

    CONSTRAINT [PK_RecordCloneLog] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RecordCloneLog_RootEntity] FOREIGN KEY ([RootEntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_RecordCloneLog_InitiatedByUser] FOREIGN KEY ([InitiatedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_RecordCloneLog_ProcessRun] FOREIGN KEY ([ProcessRunID])
        REFERENCES [${flyway:defaultSchema}].[ProcessRun]([ID]),
    CONSTRAINT [CK_RecordCloneLog_Status] CHECK ([Status] IN (N'Planned', N'Running', N'Complete', N'Error', N'Cancelled'))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] (
    [ID]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RecordCloneLogItem_ID] DEFAULT (newsequentialid()),
    [RecordCloneLogID] UNIQUEIDENTIFIER NOT NULL,
    [EntityID]         UNIQUEIDENTIFIER NOT NULL,
    [SourceRecordID]   NVARCHAR(750)    NOT NULL,
    [TargetRecordID]   NVARCHAR(750)    NULL,
    [Depth]            INT              NOT NULL CONSTRAINT [DF_RecordCloneLogItem_Depth] DEFAULT (0),
    [Route]            NVARCHAR(20)     NOT NULL,
    [Status]           NVARCHAR(20)     NOT NULL,
    [Sequence]         INT              NOT NULL CONSTRAINT [DF_RecordCloneLogItem_Sequence] DEFAULT (0),
    [Reason]           NVARCHAR(MAX)    NULL,
    [FieldChangesJSON] NVARCHAR(MAX)    NULL,

    CONSTRAINT [PK_RecordCloneLogItem] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RecordCloneLogItem_Log] FOREIGN KEY ([RecordCloneLogID])
        REFERENCES [${flyway:defaultSchema}].[RecordCloneLog]([ID]),
    CONSTRAINT [FK_RecordCloneLogItem_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [CK_RecordCloneLogItem_Route] CHECK ([Route] IN (N'RootSave', N'Collection', N'Embedded', N'IsAChain', N'Sidecar')),
    CONSTRAINT [CK_RecordCloneLogItem_Status] CHECK ([Status] IN (N'Created', N'Referenced', N'Skipped', N'Failed'))
);
GO

-- -------------------------------------------------------------------------------------
-- Extend RecordProcess.WorkType to include 'Clone'
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[RecordProcess] DROP CONSTRAINT IF EXISTS [CK_RecordProcess_WorkType];
ALTER TABLE [${flyway:defaultSchema}].[RecordProcess] ADD CONSTRAINT [CK_RecordProcess_WorkType]
    CHECK ([WorkType] IN (N'Action', N'Agent', N'Infer', N'FieldRules', N'ML Model', N'Clone'));
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: RecordCloneLog
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit and coordination header entity for record cloning operations. Captures plan, execution status, counts, and outcome.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the record clone log header record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Entity being cloned as the root of the clone record graph.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'RootEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Source root record identifier, encoded as a compact URL segment.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'RootSourceRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Target root record identifier resulting from the clone, encoded as a compact URL segment. Null while in progress or if failed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'RootTargetRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the User who initiated this clone operation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'InitiatedByUserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current operational status of the clone execution (Planned, Running, Complete, Error, Cancelled).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp (UTC with offset) when the clone operation started.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'StartedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp (UTC with offset) when the clone operation concluded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'EndedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'SHA-256 hash of the execution plan used for concurrency validation and provenance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'PlanHash';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Serialized JSON execution plan detailing all graph nodes, edges, actions, and options.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'PlanJSON';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON request options supplied by the user or client for this clone execution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'OptionsJSON';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Summary result JSON payload containing counts, timings, and created record mappings.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'ResultJSON';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional business justification or user-provided explanation for this clone operation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'Reason';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Error message and diagnostic details if the clone operation failed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'ErrorMessage';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the parent ProcessRun when this clone was executed via a batch RecordProcess.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'ProcessRunID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total count of new records successfully created during this clone operation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'CreatedCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total count of existing records linked or referenced by foreign key rather than copied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'ReferencedCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total count of records intentionally skipped based on relationship or entity clone policies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLog',
    @level2type = N'COLUMN', @level2name = N'SkippedCount';
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: RecordCloneLogItem
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Item-level detail for each node in a record clone operation, capturing traversal route, action, status, and field changes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the record clone log item record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the parent RecordCloneLog header record coordinating this clone execution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'RecordCloneLogID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Entity type of this individual cloned record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Source record key identifier, encoded as a compact URL segment.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'SourceRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Target record key identifier resulting from the clone, encoded as a compact URL segment. Null if skipped or failed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'TargetRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Distance from the root node in the clone record graph (0 for root).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'Depth';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Relationship route traversed to reach this record (RootSave, Collection, Embedded, IsAChain, Sidecar).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'Route';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Execution outcome status for this node (Created, Referenced, Skipped, Failed).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Execution sequence order within the clone transaction.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Diagnostic explanation or reason for the action taken (e.g., skip reason or failure details).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'Reason';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Serialized JSON array of field-level modifications, copies, transforms, resets, and remaps applied to this record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordCloneLogItem',
    @level2type = N'COLUMN', @level2name = N'FieldChangesJSON';
GO

















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================

/* SQL generated to create new entity MJ: Record Clone Logs */

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
         'f8f2154d-d37f-4ee4-a573-ebbd5ed595f7',
         'MJ: Record Clone Logs',
         'Record Clone Logs',
         'Audit and coordination header entity for record cloning operations. Captures plan, execution status, counts, and outcome.',
         NULL,
         'RecordCloneLog',
         'vwRecordCloneLogs',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 0
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

/* SQL generated to add new entity MJ: Record Clone Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f8f2154d-d37f-4ee4-a573-ebbd5ed595f7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Record Clone Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Record Clone Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Record Clone Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f8f2154d-d37f-4ee4-a573-ebbd5ed595f7' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Record Clone Log Items */

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
         '92c4e132-983c-465e-970e-4fde6bbb1799',
         'MJ: Record Clone Log Items',
         'Record Clone Log Items',
         'Item-level detail for each node in a record clone operation, capturing traversal route, action, status, and field changes.',
         NULL,
         'RecordCloneLogItem',
         'vwRecordCloneLogItems',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 0
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

/* SQL generated to add new entity MJ: Record Clone Log Items to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '92c4e132-983c-465e-970e-4fde6bbb1799', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Record Clone Log Items for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Record Clone Log Items for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Record Clone Log Items for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('92c4e132-983c-465e-970e-4fde6bbb1799' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
UPDATE [${flyway:defaultSchema}].[RecordCloneLogItem] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] ADD CONSTRAINT [DF___mj_RecordCloneLogItem___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
UPDATE [${flyway:defaultSchema}].[RecordCloneLogItem] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLogItem */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLogItem] ADD CONSTRAINT [DF___mj_RecordCloneLogItem___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
UPDATE [${flyway:defaultSchema}].[RecordCloneLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLog] ADD CONSTRAINT [DF___mj_RecordCloneLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
UPDATE [${flyway:defaultSchema}].[RecordCloneLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordCloneLog */
ALTER TABLE [${flyway:defaultSchema}].[RecordCloneLog] ADD CONSTRAINT [DF___mj_RecordCloneLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 33 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0cdb4d5-6a7b-4a0a-96c9-1c839d8afa12' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0cdb4d5-6a7b-4a0a-96c9-1c839d8afa12',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'ID',
            'ID',
            'Unique identifier for the record clone log item record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3221cf63-5522-4473-a99a-cc566d37500f' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'RecordCloneLogID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3221cf63-5522-4473-a99a-cc566d37500f',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'RecordCloneLogID',
            'Record Clone Log ID',
            'Foreign key to the parent RecordCloneLog header record coordinating this clone execution.',
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
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'adde9665-c1f5-4bb2-9dac-76cfb3779370' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'adde9665-c1f5-4bb2-9dac-76cfb3779370',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'EntityID',
            'Entity ID',
            'Foreign key to the Entity type of this individual cloned record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90e2f4bc-fdd9-41a3-94dd-64086b27517a' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'SourceRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90e2f4bc-fdd9-41a3-94dd-64086b27517a',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'SourceRecordID',
            'Source Record ID',
            'Source record key identifier, encoded as a compact URL segment.',
            'nvarchar',
            1500,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abad0121-03a0-4a1c-96f9-1f8d2f1ef203' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'TargetRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abad0121-03a0-4a1c-96f9-1f8d2f1ef203',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'TargetRecordID',
            'Target Record ID',
            'Target record key identifier resulting from the clone, encoded as a compact URL segment. Null if skipped or failed.',
            'nvarchar',
            1500,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e332914-27f1-4479-9b95-086265206ea1' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'Depth')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7e332914-27f1-4479-9b95-086265206ea1',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'Depth',
            'Depth',
            'Distance from the root node in the clone record graph (0 for root).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6b70085-b758-40b8-8ff6-919b73cc4a22' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'Route')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd6b70085-b758-40b8-8ff6-919b73cc4a22',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'Route',
            'Route',
            'Relationship route traversed to reach this record (RootSave, Collection, Embedded, IsAChain, Sidecar).',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b99174de-be9a-4e36-a6a4-d03b7f8835f3' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b99174de-be9a-4e36-a6a4-d03b7f8835f3',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'Status',
            'Status',
            'Execution outcome status for this node (Created, Referenced, Skipped, Failed).',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3423f051-1375-49e7-af72-012997200529' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3423f051-1375-49e7-af72-012997200529',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'Sequence',
            'Sequence',
            'Execution sequence order within the clone transaction.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfbb8a27-eb9c-480b-81b6-ff79e19466ae' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'Reason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cfbb8a27-eb9c-480b-81b6-ff79e19466ae',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'Reason',
            'Reason',
            'Diagnostic explanation or reason for the action taken (e.g., skip reason or failure details).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bfec803b-5524-43af-ba8c-ff51b5f5f424' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'FieldChangesJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bfec803b-5524-43af-ba8c-ff51b5f5f424',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'FieldChangesJSON',
            'Field Changes JSON',
            'Serialized JSON array of field-level modifications, copies, transforms, resets, and remaps applied to this record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bdff371d-c6e8-4ccd-ae0f-1165d21b8784' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bdff371d-c6e8-4ccd-ae0f-1165d21b8784',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd4b31c5-da2a-433f-9d35-8954236483c2' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fd4b31c5-da2a-433f-9d35-8954236483c2',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6259924c-9bfe-4fba-9e4b-f785033b6bb8' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6259924c-9bfe-4fba-9e4b-f785033b6bb8',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'ID',
            'ID',
            'Unique identifier for the record clone log header record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a80ccd12-73d9-49c5-a14b-17f91c08cb16' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'RootEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a80ccd12-73d9-49c5-a14b-17f91c08cb16',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'RootEntityID',
            'Root Entity ID',
            'Foreign key to the Entity being cloned as the root of the clone record graph.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b29429d-587e-4229-8882-beb1dfe7bc2a' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'RootSourceRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b29429d-587e-4229-8882-beb1dfe7bc2a',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'RootSourceRecordID',
            'Root Source Record ID',
            'Source root record identifier, encoded as a compact URL segment.',
            'nvarchar',
            1500,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96eeeed2-dfa7-4f11-a7f0-d1cb27593cbf' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'RootTargetRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '96eeeed2-dfa7-4f11-a7f0-d1cb27593cbf',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'RootTargetRecordID',
            'Root Target Record ID',
            'Target root record identifier resulting from the clone, encoded as a compact URL segment. Null while in progress or if failed.',
            'nvarchar',
            1500,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fbccca0-a6cc-4fae-aa41-1cc13d37bcde' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'InitiatedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fbccca0-a6cc-4fae-aa41-1cc13d37bcde',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'InitiatedByUserID',
            'Initiated By User ID',
            'Foreign key to the User who initiated this clone operation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c328256-b943-4359-9169-8a43719f7183' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9c328256-b943-4359-9169-8a43719f7183',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'Status',
            'Status',
            'Current operational status of the clone execution (Planned, Running, Complete, Error, Cancelled).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Planned',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70532031-6126-40d1-a751-95653a5b5dda' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '70532031-6126-40d1-a751-95653a5b5dda',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'StartedAt',
            'Started At',
            'Timestamp (UTC with offset) when the clone operation started.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d6d28a1-cb9d-45be-9aaf-b2cd3475ac18' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'EndedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d6d28a1-cb9d-45be-9aaf-b2cd3475ac18',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'EndedAt',
            'Ended At',
            'Timestamp (UTC with offset) when the clone operation concluded.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '614815db-2050-4672-953f-e3c67804a9b2' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'PlanHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '614815db-2050-4672-953f-e3c67804a9b2',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'PlanHash',
            'Plan Hash',
            'SHA-256 hash of the execution plan used for concurrency validation and provenance.',
            'nvarchar',
            128,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c02ef3a4-1973-4a1f-add1-51b3e6c4ac09' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'PlanJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c02ef3a4-1973-4a1f-add1-51b3e6c4ac09',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'PlanJSON',
            'Plan JSON',
            'Serialized JSON execution plan detailing all graph nodes, edges, actions, and options.',
            'nvarchar',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4f7308e-b155-4a79-9d77-0ff125e23c9e' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'OptionsJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd4f7308e-b155-4a79-9d77-0ff125e23c9e',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'OptionsJSON',
            'Options JSON',
            'JSON request options supplied by the user or client for this clone execution.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2f31a62-1d55-4556-9764-b52f9156cc21' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'ResultJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2f31a62-1d55-4556-9764-b52f9156cc21',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'ResultJSON',
            'Result JSON',
            'Summary result JSON payload containing counts, timings, and created record mappings.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd7abb88-8674-446d-bb40-f6ca8876902c' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'Reason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd7abb88-8674-446d-bb40-f6ca8876902c',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'Reason',
            'Reason',
            'Optional business justification or user-provided explanation for this clone operation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c06b4d5-ba4e-4684-b93e-55e225fc2ad0' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8c06b4d5-ba4e-4684-b93e-55e225fc2ad0',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'ErrorMessage',
            'Error Message',
            'Error message and diagnostic details if the clone operation failed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42430da2-df5c-481b-b2eb-09ee1c4aa8e5' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'ProcessRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42430da2-df5c-481b-b2eb-09ee1c4aa8e5',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'ProcessRunID',
            'Process Run ID',
            'Foreign key to the parent ProcessRun when this clone was executed via a batch RecordProcess.',
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
            '9989A9A4-5546-4552-A765-B27EE399BFEA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c29d948b-714e-42d5-bb53-59c86773b1f5' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'CreatedCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c29d948b-714e-42d5-bb53-59c86773b1f5',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'CreatedCount',
            'Created Count',
            'Total count of new records successfully created during this clone operation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42468489-1002-4c3a-8800-0114c4f7ebc4' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'ReferencedCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42468489-1002-4c3a-8800-0114c4f7ebc4',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'ReferencedCount',
            'Referenced Count',
            'Total count of existing records linked or referenced by foreign key rather than copied.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e935b625-a12a-427b-b1cd-282f2e65ffd4' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'SkippedCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e935b625-a12a-427b-b1cd-282f2e65ffd4',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'SkippedCount',
            'Skipped Count',
            'Total count of records intentionally skipped based on relationship or entity clone policies.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d9c9ee7-ec06-4476-984d-7fda0c75596f' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d9c9ee7-ec06-4476-984d-7fda0c75596f',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ca0e3b8-358f-4aa5-9236-39c2dcc6c8f1' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ca0e3b8-358f-4aa5-9236-39c2dcc6c8f1',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
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

/* SQL text to insert entity field value with ID f5a5017c-42c1-4efc-931d-18be8b6a6650 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f5a5017c-42c1-4efc-931d-18be8b6a6650', '9C328256-B943-4359-9169-8A43719F7183', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f536c7d-f558-4064-ad31-6eefef95d29f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f536c7d-f558-4064-ad31-6eefef95d29f', '9C328256-B943-4359-9169-8A43719F7183', 2, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dbe4ae0e-393b-4741-b54b-8dbefb1cae36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dbe4ae0e-393b-4741-b54b-8dbefb1cae36', '9C328256-B943-4359-9169-8A43719F7183', 3, 'Error', 'Error', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fb796f2e-24fb-4a25-800a-008987000df5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fb796f2e-24fb-4a25-800a-008987000df5', '9C328256-B943-4359-9169-8A43719F7183', 4, 'Planned', 'Planned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1f8a23f5-9a1c-4d1d-b2c3-07ee2f8168d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1f8a23f5-9a1c-4d1d-b2c3-07ee2f8168d8', '9C328256-B943-4359-9169-8A43719F7183', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9C328256-B943-4359-9169-8A43719F7183 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9C328256-B943-4359-9169-8A43719F7183';

/* SQL text to insert entity field value with ID 883e3814-efb0-444f-af57-65ecfb910b06 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('883e3814-efb0-444f-af57-65ecfb910b06', 'D6B70085-B758-40B8-8FF6-919B73CC4A22', 1, 'Collection', 'Collection', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e9e0d618-264c-4148-9614-e43d3abc2673 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e9e0d618-264c-4148-9614-e43d3abc2673', 'D6B70085-B758-40B8-8FF6-919B73CC4A22', 2, 'Embedded', 'Embedded', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 22242ee5-a169-4770-9fa9-a0c541cc42f2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22242ee5-a169-4770-9fa9-a0c541cc42f2', 'D6B70085-B758-40B8-8FF6-919B73CC4A22', 3, 'IsAChain', 'IsAChain', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3b8bbdfa-46c0-4878-a07c-624f7dd1b08a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3b8bbdfa-46c0-4878-a07c-624f7dd1b08a', 'D6B70085-B758-40B8-8FF6-919B73CC4A22', 4, 'RootSave', 'RootSave', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 80d2793e-22b2-47a5-a454-eacfb4ba6420 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('80d2793e-22b2-47a5-a454-eacfb4ba6420', 'D6B70085-B758-40B8-8FF6-919B73CC4A22', 5, 'Sidecar', 'Sidecar', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D6B70085-B758-40B8-8FF6-919B73CC4A22 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D6B70085-B758-40B8-8FF6-919B73CC4A22';

/* SQL text to insert entity field value with ID 30971927-652b-409e-a06d-30493fe8a480 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('30971927-652b-409e-a06d-30493fe8a480', 'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3', 1, 'Created', 'Created', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2a971349-e7d6-4919-ada1-5070036b4aa6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2a971349-e7d6-4919-ada1-5070036b4aa6', 'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5d91a24e-000b-4b39-8e25-23e228a879c9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5d91a24e-000b-4b39-8e25-23e228a879c9', 'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3', 3, 'Referenced', 'Referenced', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dd6e00ca-60c7-4ea9-a012-9ce7cd314b27 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dd6e00ca-60c7-4ea9-a012-9ce7cd314b27', 'B99174DE-BE9A-4E36-A6A4-D03B7F8835F3', 4, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B99174DE-BE9A-4E36-A6A4-D03B7F8835F3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B99174DE-BE9A-4E36-A6A4-D03B7F8835F3';

/* SQL text to insert entity field value with ID 5f10449d-491c-4fdf-9b3c-0d4ae3183541 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f10449d-491c-4fdf-9b3c-0d4ae3183541', '58345D95-711E-470F-BD28-1AA4AD8214D2', 3, 'Clone', 'Clone', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='D355DD72-601D-4CEB-A7E3-709C2C8B2E98';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='17B04C7F-47ED-49ED-B92E-C069F2ED620E';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='444187B1-4C04-4FF3-98E9-B98499A068FB';


/* Create Entity Relationship: MJ: Entities -> MJ: Record Clone Log Items (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '94d852f2-9350-4ec4-a9a6-fdf5a0be7021'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('94d852f2-9350-4ec4-a9a6-fdf5a0be7021', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '92C4E132-983C-465E-970E-4FDE6BBB1799', 'EntityID', 'One To Many', 1, 1, 79, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Record Clone Logs (One To Many via RootEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2b11c581-1072-4aae-b6ec-50b821791276'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2b11c581-1072-4aae-b6ec-50b821791276', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'RootEntityID', 'One To Many', 1, 1, 80, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Record Clone Logs (One To Many via InitiatedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ad4e8092-eb0f-4758-a90f-29ea7ffac179'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ad4e8092-eb0f-4758-a90f-29ea7ffac179', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'InitiatedByUserID', 'One To Many', 1, 1, 106, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Process Runs -> MJ: Record Clone Logs (One To Many via ProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'df7e27c2-5291-4a94-b852-ed8188baed9b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('df7e27c2-5291-4a94-b852-ed8188baed9b', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', 'ProcessRunID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Record Clone Logs -> MJ: Record Clone Log Items (One To Many via RecordCloneLogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5d36f79a-dd07-43d1-8eda-f65272ab3cbc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5d36f79a-dd07-43d1-8eda-f65272ab3cbc', 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', '92C4E132-983C-465E-970E-4FDE6BBB1799', 'RecordCloneLogID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for RecordCloneLogItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordCloneLogID in table RecordCloneLogItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordCloneLogItem_RecordCloneLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordCloneLogItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordCloneLogItem_RecordCloneLogID ON [${flyway:defaultSchema}].[RecordCloneLogItem] ([RecordCloneLogID]);

-- Index for foreign key EntityID in table RecordCloneLogItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordCloneLogItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordCloneLogItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordCloneLogItem_EntityID ON [${flyway:defaultSchema}].[RecordCloneLogItem] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID ADDE9665-C1F5-4BB2-9DAC-76CFB3779370 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ADDE9665-C1F5-4BB2-9DAC-76CFB3779370', @RelatedEntityNameFieldMap='Entity';

/* Index for Foreign Keys for RecordCloneLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RootEntityID in table RecordCloneLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordCloneLog_RootEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordCloneLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordCloneLog_RootEntityID ON [${flyway:defaultSchema}].[RecordCloneLog] ([RootEntityID]);

-- Index for foreign key InitiatedByUserID in table RecordCloneLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordCloneLog_InitiatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordCloneLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordCloneLog_InitiatedByUserID ON [${flyway:defaultSchema}].[RecordCloneLog] ([InitiatedByUserID]);

-- Index for foreign key ProcessRunID in table RecordCloneLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordCloneLog_ProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordCloneLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordCloneLog_ProcessRunID ON [${flyway:defaultSchema}].[RecordCloneLog] ([ProcessRunID]);

/* SQL text to update entity field related entity name field map for entity field ID A80CCD12-73D9-49C5-A14B-17F91C08CB16 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A80CCD12-73D9-49C5-A14B-17F91C08CB16', @RelatedEntityNameFieldMap='RootEntity';

/* SQL text to update entity field related entity name field map for entity field ID 8FBCCCA0-A6CC-4FAE-AA41-1CC13D37BCDE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8FBCCCA0-A6CC-4FAE-AA41-1CC13D37BCDE', @RelatedEntityNameFieldMap='InitiatedByUser';

/* Base View SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: vwRecordCloneLogItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Clone Log Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordCloneLogItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordCloneLogItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordCloneLogItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordCloneLogItems]
AS
SELECT
    r.*,
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[RecordCloneLogItem] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [r].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordCloneLogItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: Permissions for vwRecordCloneLogItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordCloneLogItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: spCreateRecordCloneLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordCloneLogItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordCloneLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLogItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLogItem]
    @ID uniqueidentifier = NULL,
    @RecordCloneLogID uniqueidentifier,
    @EntityID uniqueidentifier,
    @SourceRecordID nvarchar(750),
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(750) = NULL,
    @Depth int = NULL,
    @Route nvarchar(20),
    @Status nvarchar(20),
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @FieldChangesJSON_Clear bit = 0,
    @FieldChangesJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLogItem]
            (
                [ID],
                [RecordCloneLogID],
                [EntityID],
                [SourceRecordID],
                [TargetRecordID],
                [Depth],
                [Route],
                [Status],
                [Sequence],
                [Reason],
                [FieldChangesJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecordCloneLogID,
                @EntityID,
                @SourceRecordID,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                ISNULL(@Depth, 0),
                @Route,
                @Status,
                ISNULL(@Sequence, 0),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @FieldChangesJSON_Clear = 1 THEN NULL ELSE ISNULL(@FieldChangesJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLogItem]
            (
                [RecordCloneLogID],
                [EntityID],
                [SourceRecordID],
                [TargetRecordID],
                [Depth],
                [Route],
                [Status],
                [Sequence],
                [Reason],
                [FieldChangesJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecordCloneLogID,
                @EntityID,
                @SourceRecordID,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                ISNULL(@Depth, 0),
                @Route,
                @Status,
                ISNULL(@Sequence, 0),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @FieldChangesJSON_Clear = 1 THEN NULL ELSE ISNULL(@FieldChangesJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordCloneLogItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Record Clone Log Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: spUpdateRecordCloneLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordCloneLogItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordCloneLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem]
    @ID uniqueidentifier,
    @RecordCloneLogID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @SourceRecordID nvarchar(750) = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(750) = NULL,
    @Depth int = NULL,
    @Route nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @FieldChangesJSON_Clear bit = 0,
    @FieldChangesJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLogItem]
    SET
        [RecordCloneLogID] = ISNULL(@RecordCloneLogID, [RecordCloneLogID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [SourceRecordID] = ISNULL(@SourceRecordID, [SourceRecordID]),
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [Depth] = ISNULL(@Depth, [Depth]),
        [Route] = ISNULL(@Route, [Route]),
        [Status] = ISNULL(@Status, [Status]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [FieldChangesJSON] = CASE WHEN @FieldChangesJSON_Clear = 1 THEN NULL ELSE ISNULL(@FieldChangesJSON, [FieldChangesJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordCloneLogItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordCloneLogItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLogItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordCloneLogItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordCloneLogItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordCloneLogItem
ON [${flyway:defaultSchema}].[RecordCloneLogItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLogItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordCloneLogItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Record Clone Log Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: spDeleteRecordCloneLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordCloneLogItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordCloneLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordCloneLogItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordCloneLogItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordCloneLogItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Record Clone Log Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: vwRecordCloneLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Clone Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordCloneLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordCloneLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordCloneLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordCloneLogs]
AS
SELECT
    r.*,
    MJEntity_RootEntityID.[Name] AS [RootEntity],
    MJUser_InitiatedByUserID.[Name] AS [InitiatedByUser]
FROM
    [${flyway:defaultSchema}].[RecordCloneLog] AS r
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_RootEntityID
  ON
    [r].[RootEntityID] = MJEntity_RootEntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_InitiatedByUserID
  ON
    [r].[InitiatedByUserID] = MJUser_InitiatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordCloneLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: Permissions for vwRecordCloneLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordCloneLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: spCreateRecordCloneLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordCloneLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordCloneLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLog]
    @ID uniqueidentifier = NULL,
    @RootEntityID uniqueidentifier,
    @RootSourceRecordID nvarchar(750),
    @RootTargetRecordID_Clear bit = 0,
    @RootTargetRecordID nvarchar(750) = NULL,
    @InitiatedByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @PlanHash nvarchar(64),
    @PlanJSON nvarchar(MAX),
    @OptionsJSON_Clear bit = 0,
    @OptionsJSON nvarchar(MAX) = NULL,
    @ResultJSON_Clear bit = 0,
    @ResultJSON nvarchar(MAX) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @CreatedCount int = NULL,
    @ReferencedCount int = NULL,
    @SkippedCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLog]
            (
                [ID],
                [RootEntityID],
                [RootSourceRecordID],
                [RootTargetRecordID],
                [InitiatedByUserID],
                [Status],
                [StartedAt],
                [EndedAt],
                [PlanHash],
                [PlanJSON],
                [OptionsJSON],
                [ResultJSON],
                [Reason],
                [ErrorMessage],
                [ProcessRunID],
                [CreatedCount],
                [ReferencedCount],
                [SkippedCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RootEntityID,
                @RootSourceRecordID,
                CASE WHEN @RootTargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@RootTargetRecordID, NULL) END,
                @InitiatedByUserID,
                ISNULL(@Status, 'Planned'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @PlanHash,
                @PlanJSON,
                CASE WHEN @OptionsJSON_Clear = 1 THEN NULL ELSE ISNULL(@OptionsJSON, NULL) END,
                CASE WHEN @ResultJSON_Clear = 1 THEN NULL ELSE ISNULL(@ResultJSON, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                ISNULL(@CreatedCount, 0),
                ISNULL(@ReferencedCount, 0),
                ISNULL(@SkippedCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLog]
            (
                [RootEntityID],
                [RootSourceRecordID],
                [RootTargetRecordID],
                [InitiatedByUserID],
                [Status],
                [StartedAt],
                [EndedAt],
                [PlanHash],
                [PlanJSON],
                [OptionsJSON],
                [ResultJSON],
                [Reason],
                [ErrorMessage],
                [ProcessRunID],
                [CreatedCount],
                [ReferencedCount],
                [SkippedCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RootEntityID,
                @RootSourceRecordID,
                CASE WHEN @RootTargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@RootTargetRecordID, NULL) END,
                @InitiatedByUserID,
                ISNULL(@Status, 'Planned'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @PlanHash,
                @PlanJSON,
                CASE WHEN @OptionsJSON_Clear = 1 THEN NULL ELSE ISNULL(@OptionsJSON, NULL) END,
                CASE WHEN @ResultJSON_Clear = 1 THEN NULL ELSE ISNULL(@ResultJSON, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                ISNULL(@CreatedCount, 0),
                ISNULL(@ReferencedCount, 0),
                ISNULL(@SkippedCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordCloneLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Record Clone Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: spUpdateRecordCloneLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordCloneLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordCloneLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLog]
    @ID uniqueidentifier,
    @RootEntityID uniqueidentifier = NULL,
    @RootSourceRecordID nvarchar(750) = NULL,
    @RootTargetRecordID_Clear bit = 0,
    @RootTargetRecordID nvarchar(750) = NULL,
    @InitiatedByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @PlanHash nvarchar(64) = NULL,
    @PlanJSON nvarchar(MAX) = NULL,
    @OptionsJSON_Clear bit = 0,
    @OptionsJSON nvarchar(MAX) = NULL,
    @ResultJSON_Clear bit = 0,
    @ResultJSON nvarchar(MAX) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @CreatedCount int = NULL,
    @ReferencedCount int = NULL,
    @SkippedCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLog]
    SET
        [RootEntityID] = ISNULL(@RootEntityID, [RootEntityID]),
        [RootSourceRecordID] = ISNULL(@RootSourceRecordID, [RootSourceRecordID]),
        [RootTargetRecordID] = CASE WHEN @RootTargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@RootTargetRecordID, [RootTargetRecordID]) END,
        [InitiatedByUserID] = ISNULL(@InitiatedByUserID, [InitiatedByUserID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [PlanHash] = ISNULL(@PlanHash, [PlanHash]),
        [PlanJSON] = ISNULL(@PlanJSON, [PlanJSON]),
        [OptionsJSON] = CASE WHEN @OptionsJSON_Clear = 1 THEN NULL ELSE ISNULL(@OptionsJSON, [OptionsJSON]) END,
        [ResultJSON] = CASE WHEN @ResultJSON_Clear = 1 THEN NULL ELSE ISNULL(@ResultJSON, [ResultJSON]) END,
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ProcessRunID] = CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, [ProcessRunID]) END,
        [CreatedCount] = ISNULL(@CreatedCount, [CreatedCount]),
        [ReferencedCount] = ISNULL(@ReferencedCount, [ReferencedCount]),
        [SkippedCount] = ISNULL(@SkippedCount, [SkippedCount])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordCloneLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordCloneLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordCloneLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordCloneLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordCloneLog
ON [${flyway:defaultSchema}].[RecordCloneLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordCloneLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Record Clone Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: spDeleteRecordCloneLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordCloneLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordCloneLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordCloneLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordCloneLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordCloneLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Record Clone Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2478eeb0-1160-4a43-87dc-4403b97276ce' OR (EntityID = '92C4E132-983C-465E-970E-4FDE6BBB1799' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2478eeb0-1160-4a43-87dc-4403b97276ce',
            '92C4E132-983C-465E-970E-4FDE6BBB1799', -- Entity: MJ: Record Clone Log Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '92C4E132-983C-465E-970E-4FDE6BBB1799'),
            'Entity',
            'Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '653c536c-edf5-4496-aa0e-cd2af08bee89' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'RootEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '653c536c-edf5-4496-aa0e-cd2af08bee89',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'RootEntity',
            'Root Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd15a10e8-de3b-4386-ba0f-654a62621ea9' OR (EntityID = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7' AND Name = 'InitiatedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd15a10e8-de3b-4386-ba0f-654a62621ea9',
            'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7', -- Entity: MJ: Record Clone Logs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F8F2154D-D37F-4EE4-A573-EBBD5ED595F7'),
            'InitiatedByUser',
            'Initiated By User',
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

