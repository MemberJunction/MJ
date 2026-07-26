-- =============================================================================
-- User Routines (P1.5 of the Conversations Phase 1 plan) — schema
-- =============================================================================
-- Users define routines that run an Agent, Action, or Prompt on a cron
-- schedule (RoutineType='Scheduled') or watch for result changes
-- (RoutineType='Monitoring', OnChange via result hashing). A single admin
-- "User Routine Dispatcher" Scheduled Job (seeded via metadata, not SQL)
-- claims due routines and executes them with bounded concurrency, recording
-- each execution in UserRoutineRun and notifying the owner + recipients per
-- NotifyCondition (in-app and/or email). Realtime agents are not valid
-- targets (interactive-only); single-step Proxy agents are.
--
-- DDL originates from the reviewed Conversations Mega Phase 1 consolidated
-- migration (PR #2953), carved out here as its own 5.45 migration — the same
-- pattern used for Skills & Plan Mode. One addition beyond that spec:
-- UserRoutine.RequestedSkillIDs, which lets a routine pre-activate AI Skills
-- for its target agent on every run (5.45 skills-framework synergy).
-- Post-review refinements: StartAt/EndAt activation window; recipient Sequence;
-- NotificationTemplateID (MJ Template-driven notifications, seeded default);
-- run telemetry via linkage only (AgentRunID/PromptRunID/ActionExecutionLogID
-- — no duplicated TokensUsed/Cost columns).
--
-- Row-level owner access, the dispatcher job, entity permissions, and the
-- Routines app metadata are configured via metadata sync in the code phase —
-- never in this migration.
-- =============================================================================

-- ============================================================================
-- 1. UserRoutine  ("MJ: User Routines")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.UserRoutine (
    ID               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserID           UNIQUEIDENTIFIER NOT NULL,
    EnvironmentID    UNIQUEIDENTIFIER NULL,
    Name             NVARCHAR(255)    NOT NULL,
    Description      NVARCHAR(MAX)    NULL,
    Status           NVARCHAR(20)     NOT NULL CONSTRAINT DF_UserRoutine_Status DEFAULT ('Active'),
    RoutineType      NVARCHAR(20)     NOT NULL CONSTRAINT DF_UserRoutine_RoutineType DEFAULT ('Scheduled'),
    TargetType       NVARCHAR(20)     NOT NULL,
    TargetID         UNIQUEIDENTIFIER NOT NULL,
    InitialMessage   NVARCHAR(MAX)    NULL,
    StartingPayload  NVARCHAR(MAX)    NULL,
    RequestedSkillIDs NVARCHAR(MAX)   NULL,
    CronExpression   NVARCHAR(100)    NOT NULL,
    StartAt          DATETIMEOFFSET   NULL,
    EndAt            DATETIMEOFFSET   NULL,
    NotificationTemplateID UNIQUEIDENTIFIER NULL,
    Timezone         NVARCHAR(100)    NOT NULL CONSTRAINT DF_UserRoutine_Timezone DEFAULT ('UTC'),
    NextRunAt        DATETIMEOFFSET   NULL,
    LastRunAt        DATETIMEOFFSET   NULL,
    LastRunStatus    NVARCHAR(20)     NULL,
    LastResultHash   NVARCHAR(100)    NULL,
    NotifyCondition  NVARCHAR(20)     NOT NULL CONSTRAINT DF_UserRoutine_NotifyCondition DEFAULT ('Always'),
    NotifyViaInApp   BIT              NOT NULL CONSTRAINT DF_UserRoutine_NotifyViaInApp DEFAULT (1),
    NotifyViaEmail   BIT              NOT NULL CONSTRAINT DF_UserRoutine_NotifyViaEmail DEFAULT (0),
    CONSTRAINT PK_UserRoutine PRIMARY KEY (ID),
    CONSTRAINT FK_UserRoutine_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_UserRoutine_Environment FOREIGN KEY (EnvironmentID)
        REFERENCES ${flyway:defaultSchema}.Environment (ID),
    CONSTRAINT FK_UserRoutine_NotificationTemplate FOREIGN KEY (NotificationTemplateID)
        REFERENCES ${flyway:defaultSchema}.Template (ID),
    CONSTRAINT CK_UserRoutine_Status
        CHECK (Status IN ('Active', 'Paused', 'Disabled')),
    CONSTRAINT CK_UserRoutine_RoutineType
        CHECK (RoutineType IN ('Scheduled', 'Monitoring')),
    CONSTRAINT CK_UserRoutine_TargetType
        CHECK (TargetType IN ('Agent', 'Action', 'Prompt')),
    CONSTRAINT CK_UserRoutine_LastRunStatus
        CHECK (LastRunStatus IN ('Success', 'Failed', 'Running', 'Skipped')),
    CONSTRAINT CK_UserRoutine_NotifyCondition
        CHECK (NotifyCondition IN ('Always', 'OnSuccess', 'OnFailure', 'OnChange'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Owner of the routine. Routines are private to their owner (row-level access).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional environment scope for the routine.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'EnvironmentID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User-facing routine name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional description of what the routine does.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle status: Active (eligible to run), Paused (temporarily off), Disabled (off).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Scheduled (always notify per NotifyCondition) or Monitoring (intended for OnChange detection via result hashing).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'RoutineType';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'What kind of target this routine runs: Agent, Action, or Prompt. Determines how TargetID is interpreted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'TargetType';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Polymorphic reference resolved by TargetType (AIAgent.ID, Action.ID, or AIPrompt.ID). No FK because the target table varies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'TargetID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For Agent targets, the user message sent to the agent on each run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'InitialMessage';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional JSON starting payload passed to the target on each run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'StartingPayload';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional JSON array of MJ: AI Skills IDs to pre-activate when the routine target is an Agent — threaded as ExecuteAgentParams.requestedSkillIDs so the agent starts each scheduled run with the requested skills'' instructions and tools in effect (subject to all availability gates; ActivationMode does not gate this explicit-request path). Ignored for Action/Prompt targets.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'RequestedSkillIDs';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Standard cron expression evaluated by the dispatcher to determine when the routine is due.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'CronExpression';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional activation window start. An Active routine does not run before this time; once current time passes StartAt the dispatcher begins scheduling it. NULL = eligible immediately.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'StartAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional activation window end. An Active routine stops running once current time passes EndAt — automatic sunset without changing Status. NULL = no end.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'EndAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional MJ Template used to render routine notifications from the runs output data (result summary, status, target info) via the standard MJ templating architecture. When NULL, the system default routine-notification template (seeded via metadata, resolvable per instance — not hardcoded) is used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'NotificationTemplateID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'IANA timezone used when evaluating CronExpression (e.g. America/Chicago).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'Timezone';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Next scheduled run time, computed after each run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'NextRunAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Timestamp of the most recent run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'LastRunAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Outcome of the most recent run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'LastRunStatus';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Hash of the most recent result, used by Monitoring routines to detect change for OnChange notifications.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'LastResultHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When to notify: Always, OnSuccess, OnFailure, or OnChange (result differs from prior run).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'NotifyCondition';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Deliver notifications via in-app notification.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'NotifyViaInApp';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Deliver notifications via email.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine', @level2type = N'COLUMN', @level2name = N'NotifyViaEmail';


-- ============================================================================
-- 2. UserRoutineRecipient  ("MJ: User Routine Recipients")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.UserRoutineRecipient (
    ID         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    RoutineID  UNIQUEIDENTIFIER NOT NULL,
    UserID     UNIQUEIDENTIFIER NULL,
    Email      NVARCHAR(255)    NULL,
    Channel    NVARCHAR(20)     NOT NULL CONSTRAINT DF_UserRoutineRecipient_Channel DEFAULT ('InApp'),
    Sequence   INT              NOT NULL CONSTRAINT DF_UserRoutineRecipient_Sequence DEFAULT (0),
    CONSTRAINT PK_UserRoutineRecipient PRIMARY KEY (ID),
    CONSTRAINT FK_UserRoutineRecipient_Routine FOREIGN KEY (RoutineID)
        REFERENCES ${flyway:defaultSchema}.UserRoutine (ID),
    CONSTRAINT FK_UserRoutineRecipient_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT CK_UserRoutineRecipient_Channel
        CHECK (Channel IN ('InApp', 'Email'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Routine this recipient belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRecipient', @level2type = N'COLUMN', @level2name = N'RoutineID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Internal MJ user recipient (when notifying an existing user). Either UserID or Email is set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRecipient', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'External email recipient (when notifying a non-user). Either UserID or Email is set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRecipient', @level2type = N'COLUMN', @level2name = N'Email';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Delivery channel for this recipient: InApp or Email.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRecipient', @level2type = N'COLUMN', @level2name = N'Channel';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Explicit display/notification ordering of recipients within a routine (ascending).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRecipient', @level2type = N'COLUMN', @level2name = N'Sequence';


-- ============================================================================
-- 3. UserRoutineRun  ("MJ: User Routine Runs")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.UserRoutineRun (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    RoutineID         UNIQUEIDENTIFIER NOT NULL,
    StartedAt         DATETIMEOFFSET   NOT NULL CONSTRAINT DF_UserRoutineRun_StartedAt DEFAULT (SYSDATETIMEOFFSET()),
    CompletedAt       DATETIMEOFFSET   NULL,
    Status            NVARCHAR(20)     NOT NULL CONSTRAINT DF_UserRoutineRun_Status DEFAULT ('Running'),
    AgentRunID        UNIQUEIDENTIFIER NULL,
    PromptRunID       UNIQUEIDENTIFIER NULL,
    ActionExecutionLogID UNIQUEIDENTIFIER NULL,
    ResultSummary     NVARCHAR(MAX)    NULL,
    ResultHash        NVARCHAR(100)    NULL,
    NotificationSent  BIT              NOT NULL CONSTRAINT DF_UserRoutineRun_NotificationSent DEFAULT (0),
    ErrorMessage      NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_UserRoutineRun PRIMARY KEY (ID),
    CONSTRAINT FK_UserRoutineRun_Routine FOREIGN KEY (RoutineID)
        REFERENCES ${flyway:defaultSchema}.UserRoutine (ID),
    CONSTRAINT FK_UserRoutineRun_AgentRun FOREIGN KEY (AgentRunID)
        REFERENCES ${flyway:defaultSchema}.AIAgentRun (ID),
    CONSTRAINT FK_UserRoutineRun_PromptRun FOREIGN KEY (PromptRunID)
        REFERENCES ${flyway:defaultSchema}.AIPromptRun (ID),
    CONSTRAINT FK_UserRoutineRun_ActionExecutionLog FOREIGN KEY (ActionExecutionLogID)
        REFERENCES ${flyway:defaultSchema}.ActionExecutionLog (ID),
    CONSTRAINT CK_UserRoutineRun_Status
        CHECK (Status IN ('Running', 'Success', 'Failed', 'Skipped'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Routine this run belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'RoutineID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the run started.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the run completed (null while running).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'CompletedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Run outcome.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Linked AI Agent Run when the routine target is an agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'AgentRunID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For Prompt targets, links to the MJ: AI Prompt Runs record for this execution — tokens, cost, and full telemetry live there (never duplicated here).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'PromptRunID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For Action targets, links to the MJ: Action Execution Logs record for this execution — params, results, and telemetry live there (never duplicated here).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'ActionExecutionLogID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-readable summary of the run result.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'ResultSummary';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Hash of the result, compared against the routine LastResultHash for OnChange detection.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'ResultHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether a notification was dispatched for this run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'NotificationSent';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Error detail when Status is Failed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'ErrorMessage';


















































-- =============================================================================
-- =============================================================================
-- =============================================================================
--
--                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- against a VIRGIN database built by replaying ALL migrations including the
-- hand-written DDL above — so the EntityField/metadata UUIDs below are the
-- canonical ones every instance replaying this file will carry.
-- It contains the framework plumbing for the new tables: EntityField metadata
-- inserts, base views, stored procedures (spCreate/spUpdate/spDelete),
-- permission grants, and related sp_addextendedproperty calls.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run this
-- full drop-DB/replay/codegen cycle and replace this entire section.
--
-- =============================================================================
-- =============================================================================
-- =============================================================================

/* SQL generated to create new entity MJ: User Routines */

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
         'd6ca6018-d288-4f79-b6a9-168c75c3363b',
         'MJ: User Routines',
         'User Routines',
         NULL,
         NULL,
         'UserRoutine',
         'vwUserRoutines',
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

/* SQL generated to add new entity MJ: User Routines to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd6ca6018-d288-4f79-b6a9-168c75c3363b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routines for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d6ca6018-d288-4f79-b6a9-168c75c3363b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routines for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d6ca6018-d288-4f79-b6a9-168c75c3363b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routines for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d6ca6018-d288-4f79-b6a9-168c75c3363b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: User Routine Recipients */

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
         '90dffdea-6ff8-4721-8730-25ce51209a4b',
         'MJ: User Routine Recipients',
         'User Routine Recipients',
         NULL,
         NULL,
         'UserRoutineRecipient',
         'vwUserRoutineRecipients',
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

/* SQL generated to add new entity MJ: User Routine Recipients to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '90dffdea-6ff8-4721-8730-25ce51209a4b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Recipients for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('90dffdea-6ff8-4721-8730-25ce51209a4b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Recipients for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('90dffdea-6ff8-4721-8730-25ce51209a4b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Recipients for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('90dffdea-6ff8-4721-8730-25ce51209a4b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: User Routine Runs */

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
         '149a0274-47e7-4aae-a64c-77b9f7d0873e',
         'MJ: User Routine Runs',
         'User Routine Runs',
         NULL,
         NULL,
         'UserRoutineRun',
         'vwUserRoutineRuns',
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

/* SQL generated to add new entity MJ: User Routine Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '149a0274-47e7-4aae-a64c-77b9f7d0873e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('149a0274-47e7-4aae-a64c-77b9f7d0873e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('149a0274-47e7-4aae-a64c-77b9f7d0873e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('149a0274-47e7-4aae-a64c-77b9f7d0873e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutine */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutine */
UPDATE [${flyway:defaultSchema}].[UserRoutine] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutine */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutine */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD CONSTRAINT [DF___mj_UserRoutine___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutine */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutine */
UPDATE [${flyway:defaultSchema}].[UserRoutine] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutine */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutine */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD CONSTRAINT [DF___mj_UserRoutine___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRecipient] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
UPDATE [${flyway:defaultSchema}].[UserRoutineRecipient] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRecipient] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRecipient] ADD CONSTRAINT [DF___mj_UserRoutineRecipient___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRecipient] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
UPDATE [${flyway:defaultSchema}].[UserRoutineRecipient] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRecipient] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRecipient */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRecipient] ADD CONSTRAINT [DF___mj_UserRoutineRecipient___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
UPDATE [${flyway:defaultSchema}].[UserRoutineRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRun] ADD CONSTRAINT [DF___mj_UserRoutineRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
UPDATE [${flyway:defaultSchema}].[UserRoutineRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserRoutineRun */
ALTER TABLE [${flyway:defaultSchema}].[UserRoutineRun] ADD CONSTRAINT [DF___mj_UserRoutineRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d1e15ba-591d-4c2f-aadb-88563c71a074' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2d1e15ba-591d-4c2f-aadb-88563c71a074',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0e2528d-3e0c-4d07-97cd-d2a5f2e18e69' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b0e2528d-3e0c-4d07-97cd-d2a5f2e18e69',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100002,
            'UserID',
            'User ID',
            'Owner of the routine. Routines are private to their owner (row-level access).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '584ba54a-84d9-4e76-bf64-b42fb707a171' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'EnvironmentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '584ba54a-84d9-4e76-bf64-b42fb707a171',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100003,
            'EnvironmentID',
            'Environment ID',
            'Optional environment scope for the routine.',
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
            '72975471-6AAB-45C6-B58A-3F1115C921C3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76d890c2-2cf1-482d-9823-111ff82b1589' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '76d890c2-2cf1-482d-9823-111ff82b1589',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100004,
            'Name',
            'Name',
            'User-facing routine name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ccb724b-9b32-408c-8d00-82d64fdf9a76' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0ccb724b-9b32-408c-8d00-82d64fdf9a76',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100005,
            'Description',
            'Description',
            'Optional description of what the routine does.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8dd8f51d-92c3-4c2e-8c3f-949f281865c0' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8dd8f51d-92c3-4c2e-8c3f-949f281865c0',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100006,
            'Status',
            'Status',
            'Lifecycle status: Active (eligible to run), Paused (temporarily off), Disabled (off).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2644d5fa-e13f-4ccd-8c0f-582a223d6790' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'RoutineType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2644d5fa-e13f-4ccd-8c0f-582a223d6790',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100007,
            'RoutineType',
            'Routine Type',
            'Scheduled (always notify per NotifyCondition) or Monitoring (intended for OnChange detection via result hashing).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Scheduled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c773e487-81c6-445f-b1f9-b63922334059' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'TargetType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c773e487-81c6-445f-b1f9-b63922334059',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100008,
            'TargetType',
            'Target Type',
            'What kind of target this routine runs: Agent, Action, or Prompt. Determines how TargetID is interpreted.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abf830ca-1f2c-4121-8ed7-637003b1bb38' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'TargetID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abf830ca-1f2c-4121-8ed7-637003b1bb38',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100009,
            'TargetID',
            'Target ID',
            'Polymorphic reference resolved by TargetType (AIAgent.ID, Action.ID, or AIPrompt.ID). No FK because the target table varies.',
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
            NULL,
            NULL,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '712470d0-f60a-4dea-8eb4-03adb363ba91' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'InitialMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '712470d0-f60a-4dea-8eb4-03adb363ba91',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100010,
            'InitialMessage',
            'Initial Message',
            'For Agent targets, the user message sent to the agent on each run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4af3b243-4d7f-415e-a291-153b52409481' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'StartingPayload')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4af3b243-4d7f-415e-a291-153b52409481',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100011,
            'StartingPayload',
            'Starting Payload',
            'Optional JSON starting payload passed to the target on each run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '202535d1-3e71-488e-ad20-4bf7bb994981' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'RequestedSkillIDs')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '202535d1-3e71-488e-ad20-4bf7bb994981',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100012,
            'RequestedSkillIDs',
            'Requested Skill I Ds',
            'Optional JSON array of MJ: AI Skills IDs to pre-activate when the routine target is an Agent — threaded as ExecuteAgentParams.requestedSkillIDs so the agent starts each scheduled run with the requested skills'' instructions and tools in effect (subject to all availability gates; ActivationMode does not gate this explicit-request path). Ignored for Action/Prompt targets.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '505fb83a-e8f6-4c69-819b-a6777b4aaa4f' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'CronExpression')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '505fb83a-e8f6-4c69-819b-a6777b4aaa4f',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100013,
            'CronExpression',
            'Cron Expression',
            'Standard cron expression evaluated by the dispatcher to determine when the routine is due.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dee9ad88-b7d4-431c-8c89-4d4f6223421d' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'StartAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dee9ad88-b7d4-431c-8c89-4d4f6223421d',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100014,
            'StartAt',
            'Start At',
            'Optional activation window start. An Active routine does not run before this time; once current time passes StartAt the dispatcher begins scheduling it. NULL = eligible immediately.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c8b92bf-5ea8-41bf-be21-c89375d907bf' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'EndAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0c8b92bf-5ea8-41bf-be21-c89375d907bf',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100015,
            'EndAt',
            'End At',
            'Optional activation window end. An Active routine stops running once current time passes EndAt — automatic sunset without changing Status. NULL = no end.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2ec50fb2-b62b-4c11-ab77-f282df8f6c8a' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'NotificationTemplateID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2ec50fb2-b62b-4c11-ab77-f282df8f6c8a',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100016,
            'NotificationTemplateID',
            'Notification Template ID',
            'Optional MJ Template used to render routine notifications from the runs output data (result summary, status, target info) via the standard MJ templating architecture. When NULL, the system default routine-notification template (seeded via metadata, resolvable per instance — not hardcoded) is used.',
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
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd906a039-f1a4-4b29-867a-421f3d0844e2' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'Timezone')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd906a039-f1a4-4b29-867a-421f3d0844e2',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100017,
            'Timezone',
            'Timezone',
            'IANA timezone used when evaluating CronExpression (e.g. America/Chicago).',
            'nvarchar',
            200,
            0,
            0,
            0,
            'UTC',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46977ed9-eb0d-47b3-9cfc-1c51d537512d' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'NextRunAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '46977ed9-eb0d-47b3-9cfc-1c51d537512d',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100018,
            'NextRunAt',
            'Next Run At',
            'Next scheduled run time, computed after each run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba45a96e-d80e-410b-b112-499d08aa0a92' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'LastRunAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba45a96e-d80e-410b-b112-499d08aa0a92',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100019,
            'LastRunAt',
            'Last Run At',
            'Timestamp of the most recent run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91598c2c-8f06-4e78-b775-cdb329ceb384' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'LastRunStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '91598c2c-8f06-4e78-b775-cdb329ceb384',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100020,
            'LastRunStatus',
            'Last Run Status',
            'Outcome of the most recent run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ea37bd4-db55-4ba1-b036-746cfef901de' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'LastResultHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ea37bd4-db55-4ba1-b036-746cfef901de',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100021,
            'LastResultHash',
            'Last Result Hash',
            'Hash of the most recent result, used by Monitoring routines to detect change for OnChange notifications.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad8301a7-a0ad-469c-91d6-30a876b61561' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'NotifyCondition')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad8301a7-a0ad-469c-91d6-30a876b61561',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100022,
            'NotifyCondition',
            'Notify Condition',
            'When to notify: Always, OnSuccess, OnFailure, or OnChange (result differs from prior run).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Always',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'acdad567-0dc5-4732-89ff-4628b20b8a74' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'NotifyViaInApp')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'acdad567-0dc5-4732-89ff-4628b20b8a74',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100023,
            'NotifyViaInApp',
            'Notify Via In App',
            'Deliver notifications via in-app notification.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8c70528-e866-48fa-8be2-d03279431403' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'NotifyViaEmail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8c70528-e866-48fa-8be2-d03279431403',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100024,
            'NotifyViaEmail',
            'Notify Via Email',
            'Deliver notifications via email.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '306f503e-b801-4544-90dd-a94993f2f5d7' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '306f503e-b801-4544-90dd-a94993f2f5d7',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100025,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38b3aab9-0b7b-4cc8-8a96-3b0ba93918b9' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '38b3aab9-0b7b-4cc8-8a96-3b0ba93918b9',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100026,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e455b5b-c101-45b9-bd72-509675c5ea9b' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7e455b5b-c101-45b9-bd72-509675c5ea9b',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7a02cbb-97c8-4f58-b49e-b9d9702f2e6a' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'RoutineID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a7a02cbb-97c8-4f58-b49e-b9d9702f2e6a',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100002,
            'RoutineID',
            'Routine ID',
            'Routine this recipient belongs to.',
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
            'D6CA6018-D288-4F79-B6A9-168C75C3363B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce13e21c-e76b-40ab-8718-0fae9dd1d965' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ce13e21c-e76b-40ab-8718-0fae9dd1d965',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100003,
            'UserID',
            'User ID',
            'Internal MJ user recipient (when notifying an existing user). Either UserID or Email is set.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5eabb901-cb44-4c9a-9fae-4679f58d19bd' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'Email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5eabb901-cb44-4c9a-9fae-4679f58d19bd',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100004,
            'Email',
            'Email',
            'External email recipient (when notifying a non-user). Either UserID or Email is set.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0731edd-711c-466c-9a91-cbf587d300aa' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'Channel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd0731edd-711c-466c-9a91-cbf587d300aa',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100005,
            'Channel',
            'Channel',
            'Delivery channel for this recipient: InApp or Email.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'InApp',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e188cce7-fb74-4482-9cb4-f65a7b5bf2ff' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e188cce7-fb74-4482-9cb4-f65a7b5bf2ff',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100006,
            'Sequence',
            'Sequence',
            'Explicit display/notification ordering of recipients within a routine (ascending).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '723018c4-1e60-4622-a02f-8d85d32c6ab0' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '723018c4-1e60-4622-a02f-8d85d32c6ab0',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a35c1721-aa88-4cc4-af8d-88b8969d5423' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a35c1721-aa88-4cc4-af8d-88b8969d5423',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba7133a2-39bc-4c11-9697-1f2442394c6c' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba7133a2-39bc-4c11-9697-1f2442394c6c',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e9a8f03-958f-4c17-8493-1a95e097d602' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'RoutineID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e9a8f03-958f-4c17-8493-1a95e097d602',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100002,
            'RoutineID',
            'Routine ID',
            'Routine this run belongs to.',
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
            'D6CA6018-D288-4F79-B6A9-168C75C3363B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '991a9918-ae4b-4c3d-83a1-84c4cff3b4f9' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '991a9918-ae4b-4c3d-83a1-84c4cff3b4f9',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100003,
            'StartedAt',
            'Started At',
            'When the run started.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5bc895d7-72fc-49f0-b68e-de2fa9a53e7e' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'CompletedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5bc895d7-72fc-49f0-b68e-de2fa9a53e7e',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100004,
            'CompletedAt',
            'Completed At',
            'When the run completed (null while running).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b04e3f1e-d7c8-43ea-8c30-655e9405bd27' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b04e3f1e-d7c8-43ea-8c30-655e9405bd27',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100005,
            'Status',
            'Status',
            'Run outcome.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Running',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63f5317b-ae27-42eb-b3a6-2125e96b7e71' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'AgentRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '63f5317b-ae27-42eb-b3a6-2125e96b7e71',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100006,
            'AgentRunID',
            'Agent Run ID',
            'Linked AI Agent Run when the routine target is an agent.',
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
            '5190AF93-4C39-4429-BDAA-0AEB492A0256',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b71d5eb5-3348-4382-9578-24c6d027b4d8' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'PromptRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b71d5eb5-3348-4382-9578-24c6d027b4d8',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100007,
            'PromptRunID',
            'Prompt Run ID',
            'For Prompt targets, links to the MJ: AI Prompt Runs record for this execution — tokens, cost, and full telemetry live there (never duplicated here).',
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
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eedb54cc-1a36-40a7-8a9d-b4426587d197' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'ActionExecutionLogID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eedb54cc-1a36-40a7-8a9d-b4426587d197',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100008,
            'ActionExecutionLogID',
            'Action Execution Log ID',
            'For Action targets, links to the MJ: Action Execution Logs record for this execution — params, results, and telemetry live there (never duplicated here).',
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
            '3E248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd9c6f60-0d84-40c4-b8c2-d6abf45f9e16' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'ResultSummary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd9c6f60-0d84-40c4-b8c2-d6abf45f9e16',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100009,
            'ResultSummary',
            'Result Summary',
            'Human-readable summary of the run result.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e54429e3-0861-4532-801d-286675875682' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'ResultHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e54429e3-0861-4532-801d-286675875682',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100010,
            'ResultHash',
            'Result Hash',
            'Hash of the result, compared against the routine LastResultHash for OnChange detection.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2783a568-f159-4681-b6c3-f693c6987872' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'NotificationSent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2783a568-f159-4681-b6c3-f693c6987872',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100011,
            'NotificationSent',
            'Notification Sent',
            'Whether a notification was dispatched for this run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a37fda9c-9f40-4e66-82cb-ad5f4a2f441f' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a37fda9c-9f40-4e66-82cb-ad5f4a2f441f',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100012,
            'ErrorMessage',
            'Error Message',
            'Error detail when Status is Failed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4258725e-c8da-4317-82ff-d3fd29ebdccb' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4258725e-c8da-4317-82ff-d3fd29ebdccb',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7743d3f3-e760-4153-ab41-576ced757db8' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7743d3f3-e760-4153-ab41-576ced757db8',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100014,
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

/* SQL text to insert entity field value with ID 409bd1f9-e6e5-4f84-aed1-d513084e6326 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('409bd1f9-e6e5-4f84-aed1-d513084e6326', '8DD8F51D-92C3-4C2E-8C3F-949F281865C0', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 31987685-6c09-430b-9667-38f71260e592 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('31987685-6c09-430b-9667-38f71260e592', '8DD8F51D-92C3-4C2E-8C3F-949F281865C0', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 715e1bc3-fff7-4233-9180-d8c55ebc5544 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('715e1bc3-fff7-4233-9180-d8c55ebc5544', '8DD8F51D-92C3-4C2E-8C3F-949F281865C0', 3, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8DD8F51D-92C3-4C2E-8C3F-949F281865C0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8DD8F51D-92C3-4C2E-8C3F-949F281865C0';

/* SQL text to insert entity field value with ID 8077c277-68ba-45c6-b9c2-bcbb70710eeb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8077c277-68ba-45c6-b9c2-bcbb70710eeb', '2644D5FA-E13F-4CCD-8C0F-582A223D6790', 1, 'Monitoring', 'Monitoring', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6e618abd-dd66-4c80-ba30-889cc2095ea9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e618abd-dd66-4c80-ba30-889cc2095ea9', '2644D5FA-E13F-4CCD-8C0F-582A223D6790', 2, 'Scheduled', 'Scheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2644D5FA-E13F-4CCD-8C0F-582A223D6790 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2644D5FA-E13F-4CCD-8C0F-582A223D6790';

/* SQL text to insert entity field value with ID b4a55e1a-b7e6-44a1-beca-199b3dccf4a8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4a55e1a-b7e6-44a1-beca-199b3dccf4a8', 'C773E487-81C6-445F-B1F9-B63922334059', 1, 'Action', 'Action', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ff9c5f9b-3415-44ca-885f-a4469de22021 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff9c5f9b-3415-44ca-885f-a4469de22021', 'C773E487-81C6-445F-B1F9-B63922334059', 2, 'Agent', 'Agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 18d9041c-4185-4db2-91cb-4ab9d620d5c5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('18d9041c-4185-4db2-91cb-4ab9d620d5c5', 'C773E487-81C6-445F-B1F9-B63922334059', 3, 'Prompt', 'Prompt', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C773E487-81C6-445F-B1F9-B63922334059 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C773E487-81C6-445F-B1F9-B63922334059';

/* SQL text to insert entity field value with ID 88291e56-3fd5-4bbb-ba3d-9bd0e1b03850 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('88291e56-3fd5-4bbb-ba3d-9bd0e1b03850', '91598C2C-8F06-4E78-B775-CDB329CEB384', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d44e2ca0-3f12-4658-9148-870772cfed8e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d44e2ca0-3f12-4658-9148-870772cfed8e', '91598C2C-8F06-4E78-B775-CDB329CEB384', 2, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 71306b9e-5c57-4899-a6df-27698b1bc902 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71306b9e-5c57-4899-a6df-27698b1bc902', '91598C2C-8F06-4E78-B775-CDB329CEB384', 3, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b03265e8-e26d-4f88-baec-550422fe7780 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b03265e8-e26d-4f88-baec-550422fe7780', '91598C2C-8F06-4E78-B775-CDB329CEB384', 4, 'Success', 'Success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 91598C2C-8F06-4E78-B775-CDB329CEB384 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='91598C2C-8F06-4E78-B775-CDB329CEB384';

/* SQL text to insert entity field value with ID 182e1a61-6d4f-42fd-9402-572353dc23a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('182e1a61-6d4f-42fd-9402-572353dc23a9', 'AD8301A7-A0AD-469C-91D6-30A876B61561', 1, 'Always', 'Always', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f1d86b0e-95dc-4761-8249-51d47f834a20 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1d86b0e-95dc-4761-8249-51d47f834a20', 'AD8301A7-A0AD-469C-91D6-30A876B61561', 2, 'OnChange', 'OnChange', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5767eabb-cc01-42ce-a5b8-af9599402293 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5767eabb-cc01-42ce-a5b8-af9599402293', 'AD8301A7-A0AD-469C-91D6-30A876B61561', 3, 'OnFailure', 'OnFailure', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4aa21587-45d1-4476-aecc-1cc9067c24ad */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4aa21587-45d1-4476-aecc-1cc9067c24ad', 'AD8301A7-A0AD-469C-91D6-30A876B61561', 4, 'OnSuccess', 'OnSuccess', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID AD8301A7-A0AD-469C-91D6-30A876B61561 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='AD8301A7-A0AD-469C-91D6-30A876B61561';

/* SQL text to insert entity field value with ID ef000609-3375-4385-ace3-a2f4a10f771a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef000609-3375-4385-ace3-a2f4a10f771a', 'D0731EDD-711C-466C-9A91-CBF587D300AA', 1, 'Email', 'Email', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ebd0747c-94b0-4082-bc92-503c491ea682 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ebd0747c-94b0-4082-bc92-503c491ea682', 'D0731EDD-711C-466C-9A91-CBF587D300AA', 2, 'InApp', 'InApp', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D0731EDD-711C-466C-9A91-CBF587D300AA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D0731EDD-711C-466C-9A91-CBF587D300AA';

/* SQL text to insert entity field value with ID 6091ebf0-2421-4a9b-853a-2d58a1f34116 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6091ebf0-2421-4a9b-853a-2d58a1f34116', 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7249b023-eb09-4044-97d2-a51087f04526 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7249b023-eb09-4044-97d2-a51087f04526', 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27', 2, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 97b60f68-6ac6-4ec0-9ec2-219a7d30361a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('97b60f68-6ac6-4ec0-9ec2-219a7d30361a', 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27', 3, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 31dcfd2f-31fa-43f2-9814-23030b59b762 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('31dcfd2f-31fa-43f2-9814-23030b59b762', 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27', 4, 'Success', 'Success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B04E3F1E-D7C8-43EA-8C30-655E9405BD27 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B04E3F1E-D7C8-43EA-8C30-655E9405BD27';


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: User Routine Runs (One To Many via AgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a262b970-89e0-4f8d-a4b2-cbdb1213d29a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a262b970-89e0-4f8d-a4b2-cbdb1213d29a', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'AgentRunID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: User Routines -> MJ: User Routine Runs (One To Many via RoutineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8f55cb00-991a-4fcc-aa12-bedaccdcc1cd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8f55cb00-991a-4fcc-aa12-bedaccdcc1cd', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'RoutineID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: User Routines -> MJ: User Routine Recipients (One To Many via RoutineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e8c27416-8273-4773-adea-b22c52c8c7b9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e8c27416-8273-4773-adea-b22c52c8c7b9', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', '90DFFDEA-6FF8-4721-8730-25CE51209A4B', 'RoutineID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Environments -> MJ: User Routines (One To Many via EnvironmentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0a508ea8-d11c-41ff-8c2d-4696b1ca4ea3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0a508ea8-d11c-41ff-8c2d-4696b1ca4ea3', '72975471-6AAB-45C6-B58A-3F1115C921C3', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'EnvironmentID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: User Routines (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '59c4b557-8485-4271-836e-9d9f2219deeb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('59c4b557-8485-4271-836e-9d9f2219deeb', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'UserID', 'One To Many', 1, 1, 108, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: User Routine Recipients (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'aeeab424-5697-459c-ada9-05c4a874b6e4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('aeeab424-5697-459c-ada9-05c4a874b6e4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '90DFFDEA-6FF8-4721-8730-25CE51209A4B', 'UserID', 'One To Many', 1, 1, 109, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Action Execution Logs -> MJ: User Routine Runs (One To Many via ActionExecutionLogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd77a2c9f-b6c9-4037-9d92-1dd092791bc6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d77a2c9f-b6c9-4037-9d92-1dd092791bc6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'ActionExecutionLogID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Templates -> MJ: User Routines (One To Many via NotificationTemplateID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '67cda9cd-86b7-4bcd-935a-e7ca0a8a6ecd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('67cda9cd-86b7-4bcd-935a-e7ca0a8a6ecd', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'NotificationTemplateID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Prompt Runs -> MJ: User Routine Runs (One To Many via PromptRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1a6ba1ba-b746-47d4-8831-ef18f2766ec4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1a6ba1ba-b746-47d4-8831-ef18f2766ec4', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'PromptRunID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for UserRoutineRecipient */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Recipients
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RoutineID in table UserRoutineRecipient
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutineRecipient_RoutineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutineRecipient]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutineRecipient_RoutineID ON [${flyway:defaultSchema}].[UserRoutineRecipient] ([RoutineID]);

-- Index for foreign key UserID in table UserRoutineRecipient
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutineRecipient_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutineRecipient]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutineRecipient_UserID ON [${flyway:defaultSchema}].[UserRoutineRecipient] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID A7A02CBB-97C8-4F58-B49E-B9D9702F2E6A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A7A02CBB-97C8-4F58-B49E-B9D9702F2E6A', @RelatedEntityNameFieldMap='Routine';

/* Index for Foreign Keys for UserRoutineRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RoutineID in table UserRoutineRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutineRun_RoutineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutineRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutineRun_RoutineID ON [${flyway:defaultSchema}].[UserRoutineRun] ([RoutineID]);

-- Index for foreign key AgentRunID in table UserRoutineRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutineRun_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutineRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutineRun_AgentRunID ON [${flyway:defaultSchema}].[UserRoutineRun] ([AgentRunID]);

-- Index for foreign key PromptRunID in table UserRoutineRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutineRun_PromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutineRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutineRun_PromptRunID ON [${flyway:defaultSchema}].[UserRoutineRun] ([PromptRunID]);

-- Index for foreign key ActionExecutionLogID in table UserRoutineRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutineRun_ActionExecutionLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutineRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutineRun_ActionExecutionLogID ON [${flyway:defaultSchema}].[UserRoutineRun] ([ActionExecutionLogID]);

/* SQL text to update entity field related entity name field map for entity field ID 6E9A8F03-958F-4C17-8493-1A95E097D602 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6E9A8F03-958F-4C17-8493-1A95E097D602', @RelatedEntityNameFieldMap='Routine';

/* Index for Foreign Keys for UserRoutine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserRoutine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutine_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutine_UserID ON [${flyway:defaultSchema}].[UserRoutine] ([UserID]);

-- Index for foreign key EnvironmentID in table UserRoutine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutine_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutine_EnvironmentID ON [${flyway:defaultSchema}].[UserRoutine] ([EnvironmentID]);

-- Index for foreign key NotificationTemplateID in table UserRoutine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutine_NotificationTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutine_NotificationTemplateID ON [${flyway:defaultSchema}].[UserRoutine] ([NotificationTemplateID]);

/* SQL text to update entity field related entity name field map for entity field ID B0E2528D-3E0C-4D07-97CD-D2A5F2E18E69 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B0E2528D-3E0C-4D07-97CD-D2A5F2E18E69', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 584BA54A-84D9-4E76-BF64-B42FB707A171 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='584BA54A-84D9-4E76-BF64-B42FB707A171', @RelatedEntityNameFieldMap='Environment';

/* SQL text to update entity field related entity name field map for entity field ID 63F5317B-AE27-42EB-B3A6-2125E96B7E71 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='63F5317B-AE27-42EB-B3A6-2125E96B7E71', @RelatedEntityNameFieldMap='AgentRun';

/* SQL text to update entity field related entity name field map for entity field ID CE13E21C-E76B-40AB-8718-0FAE9DD1D965 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CE13E21C-E76B-40AB-8718-0FAE9DD1D965', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID B71D5EB5-3348-4382-9578-24C6D027B4D8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B71D5EB5-3348-4382-9578-24C6D027B4D8', @RelatedEntityNameFieldMap='PromptRun';

/* Base View SQL for MJ: User Routine Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Recipients
-- Item: vwUserRoutineRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routine Recipients
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserRoutineRecipient
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserRoutineRecipients]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserRoutineRecipients];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserRoutineRecipients]
AS
SELECT
    u.*,
    MJUserRoutine_RoutineID.[Name] AS [Routine],
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[UserRoutineRecipient] AS u
INNER JOIN
    [${flyway:defaultSchema}].[UserRoutine] AS MJUserRoutine_RoutineID
  ON
    [u].[RoutineID] = MJUserRoutine_RoutineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [u].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRoutineRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: User Routine Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Recipients
-- Item: Permissions for vwUserRoutineRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRoutineRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: User Routine Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Recipients
-- Item: spCreateUserRoutineRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRoutineRecipient
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRoutineRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRoutineRecipient];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRoutineRecipient]
    @ID uniqueidentifier = NULL,
    @RoutineID uniqueidentifier,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @Channel nvarchar(20) = NULL,
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRoutineRecipient]
            (
                [ID],
                [RoutineID],
                [UserID],
                [Email],
                [Channel],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RoutineID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@Channel, 'InApp'),
                ISNULL(@Sequence, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRoutineRecipient]
            (
                [RoutineID],
                [UserID],
                [Email],
                [Channel],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RoutineID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@Channel, 'InApp'),
                ISNULL(@Sequence, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRoutineRecipients] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutineRecipient] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: User Routine Recipients */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutineRecipient] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: User Routine Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Recipients
-- Item: spUpdateUserRoutineRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRoutineRecipient
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRoutineRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRoutineRecipient];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRoutineRecipient]
    @ID uniqueidentifier,
    @RoutineID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @Channel nvarchar(20) = NULL,
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutineRecipient]
    SET
        [RoutineID] = ISNULL(@RoutineID, [RoutineID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [Channel] = ISNULL(@Channel, [Channel]),
        [Sequence] = ISNULL(@Sequence, [Sequence])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRoutineRecipients] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRoutineRecipients]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutineRecipient] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutineRecipient table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRoutineRecipient]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRoutineRecipient];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRoutineRecipient
ON [${flyway:defaultSchema}].[UserRoutineRecipient]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutineRecipient]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRoutineRecipient] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: User Routine Recipients */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutineRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: User Routine Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Recipients
-- Item: spDeleteUserRoutineRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRoutineRecipient
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRoutineRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRoutineRecipient];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRoutineRecipient]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRoutineRecipient]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutineRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: User Routine Recipients */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutineRecipient] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 2EC50FB2-B62B-4C11-AB77-F282DF8F6C8A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2EC50FB2-B62B-4C11-AB77-F282DF8F6C8A', @RelatedEntityNameFieldMap='NotificationTemplate';

/* Base View SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: vwUserRoutines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserRoutine
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserRoutines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserRoutines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserRoutines]
AS
SELECT
    u.*,
    MJUser_UserID.[Name] AS [User],
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJTemplate_NotificationTemplateID.[Name] AS [NotificationTemplate]
FROM
    [${flyway:defaultSchema}].[UserRoutine] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [u].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [u].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS MJTemplate_NotificationTemplateID
  ON
    [u].[NotificationTemplateID] = MJTemplate_NotificationTemplateID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: Permissions for vwUserRoutines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: spCreateUserRoutine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRoutine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRoutine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRoutine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRoutine]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EnvironmentID_Clear bit = 0,
    @EnvironmentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @RoutineType nvarchar(20) = NULL,
    @TargetType nvarchar(20),
    @TargetID uniqueidentifier,
    @InitialMessage_Clear bit = 0,
    @InitialMessage nvarchar(MAX) = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @RequestedSkillIDs_Clear bit = 0,
    @RequestedSkillIDs nvarchar(MAX) = NULL,
    @CronExpression nvarchar(100),
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @NotificationTemplateID_Clear bit = 0,
    @NotificationTemplateID uniqueidentifier = NULL,
    @Timezone nvarchar(100) = NULL,
    @NextRunAt_Clear bit = 0,
    @NextRunAt datetimeoffset = NULL,
    @LastRunAt_Clear bit = 0,
    @LastRunAt datetimeoffset = NULL,
    @LastRunStatus_Clear bit = 0,
    @LastRunStatus nvarchar(20) = NULL,
    @LastResultHash_Clear bit = 0,
    @LastResultHash nvarchar(100) = NULL,
    @NotifyCondition nvarchar(20) = NULL,
    @NotifyViaInApp bit = NULL,
    @NotifyViaEmail bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRoutine]
            (
                [ID],
                [UserID],
                [EnvironmentID],
                [Name],
                [Description],
                [Status],
                [RoutineType],
                [TargetType],
                [TargetID],
                [InitialMessage],
                [StartingPayload],
                [RequestedSkillIDs],
                [CronExpression],
                [StartAt],
                [EndAt],
                [NotificationTemplateID],
                [Timezone],
                [NextRunAt],
                [LastRunAt],
                [LastRunStatus],
                [LastResultHash],
                [NotifyCondition],
                [NotifyViaInApp],
                [NotifyViaEmail]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                CASE WHEN @EnvironmentID_Clear = 1 THEN NULL ELSE ISNULL(@EnvironmentID, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@RoutineType, 'Scheduled'),
                @TargetType,
                @TargetID,
                CASE WHEN @InitialMessage_Clear = 1 THEN NULL ELSE ISNULL(@InitialMessage, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                CASE WHEN @RequestedSkillIDs_Clear = 1 THEN NULL ELSE ISNULL(@RequestedSkillIDs, NULL) END,
                @CronExpression,
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                CASE WHEN @NotificationTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@NotificationTemplateID, NULL) END,
                ISNULL(@Timezone, 'UTC'),
                CASE WHEN @NextRunAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRunAt, NULL) END,
                CASE WHEN @LastRunAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRunAt, NULL) END,
                CASE WHEN @LastRunStatus_Clear = 1 THEN NULL ELSE ISNULL(@LastRunStatus, NULL) END,
                CASE WHEN @LastResultHash_Clear = 1 THEN NULL ELSE ISNULL(@LastResultHash, NULL) END,
                ISNULL(@NotifyCondition, 'Always'),
                ISNULL(@NotifyViaInApp, 1),
                ISNULL(@NotifyViaEmail, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRoutine]
            (
                [UserID],
                [EnvironmentID],
                [Name],
                [Description],
                [Status],
                [RoutineType],
                [TargetType],
                [TargetID],
                [InitialMessage],
                [StartingPayload],
                [RequestedSkillIDs],
                [CronExpression],
                [StartAt],
                [EndAt],
                [NotificationTemplateID],
                [Timezone],
                [NextRunAt],
                [LastRunAt],
                [LastRunStatus],
                [LastResultHash],
                [NotifyCondition],
                [NotifyViaInApp],
                [NotifyViaEmail]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                CASE WHEN @EnvironmentID_Clear = 1 THEN NULL ELSE ISNULL(@EnvironmentID, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@RoutineType, 'Scheduled'),
                @TargetType,
                @TargetID,
                CASE WHEN @InitialMessage_Clear = 1 THEN NULL ELSE ISNULL(@InitialMessage, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                CASE WHEN @RequestedSkillIDs_Clear = 1 THEN NULL ELSE ISNULL(@RequestedSkillIDs, NULL) END,
                @CronExpression,
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                CASE WHEN @NotificationTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@NotificationTemplateID, NULL) END,
                ISNULL(@Timezone, 'UTC'),
                CASE WHEN @NextRunAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRunAt, NULL) END,
                CASE WHEN @LastRunAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRunAt, NULL) END,
                CASE WHEN @LastRunStatus_Clear = 1 THEN NULL ELSE ISNULL(@LastRunStatus, NULL) END,
                CASE WHEN @LastResultHash_Clear = 1 THEN NULL ELSE ISNULL(@LastResultHash, NULL) END,
                ISNULL(@NotifyCondition, 'Always'),
                ISNULL(@NotifyViaInApp, 1),
                ISNULL(@NotifyViaEmail, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRoutines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: User Routines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: spUpdateUserRoutine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRoutine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRoutine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRoutine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRoutine]
    @ID uniqueidentifier,
    @UserID uniqueidentifier = NULL,
    @EnvironmentID_Clear bit = 0,
    @EnvironmentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @RoutineType nvarchar(20) = NULL,
    @TargetType nvarchar(20) = NULL,
    @TargetID uniqueidentifier = NULL,
    @InitialMessage_Clear bit = 0,
    @InitialMessage nvarchar(MAX) = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @RequestedSkillIDs_Clear bit = 0,
    @RequestedSkillIDs nvarchar(MAX) = NULL,
    @CronExpression nvarchar(100) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @NotificationTemplateID_Clear bit = 0,
    @NotificationTemplateID uniqueidentifier = NULL,
    @Timezone nvarchar(100) = NULL,
    @NextRunAt_Clear bit = 0,
    @NextRunAt datetimeoffset = NULL,
    @LastRunAt_Clear bit = 0,
    @LastRunAt datetimeoffset = NULL,
    @LastRunStatus_Clear bit = 0,
    @LastRunStatus nvarchar(20) = NULL,
    @LastResultHash_Clear bit = 0,
    @LastResultHash nvarchar(100) = NULL,
    @NotifyCondition nvarchar(20) = NULL,
    @NotifyViaInApp bit = NULL,
    @NotifyViaEmail bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutine]
    SET
        [UserID] = ISNULL(@UserID, [UserID]),
        [EnvironmentID] = CASE WHEN @EnvironmentID_Clear = 1 THEN NULL ELSE ISNULL(@EnvironmentID, [EnvironmentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RoutineType] = ISNULL(@RoutineType, [RoutineType]),
        [TargetType] = ISNULL(@TargetType, [TargetType]),
        [TargetID] = ISNULL(@TargetID, [TargetID]),
        [InitialMessage] = CASE WHEN @InitialMessage_Clear = 1 THEN NULL ELSE ISNULL(@InitialMessage, [InitialMessage]) END,
        [StartingPayload] = CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, [StartingPayload]) END,
        [RequestedSkillIDs] = CASE WHEN @RequestedSkillIDs_Clear = 1 THEN NULL ELSE ISNULL(@RequestedSkillIDs, [RequestedSkillIDs]) END,
        [CronExpression] = ISNULL(@CronExpression, [CronExpression]),
        [StartAt] = CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, [StartAt]) END,
        [EndAt] = CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, [EndAt]) END,
        [NotificationTemplateID] = CASE WHEN @NotificationTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@NotificationTemplateID, [NotificationTemplateID]) END,
        [Timezone] = ISNULL(@Timezone, [Timezone]),
        [NextRunAt] = CASE WHEN @NextRunAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRunAt, [NextRunAt]) END,
        [LastRunAt] = CASE WHEN @LastRunAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRunAt, [LastRunAt]) END,
        [LastRunStatus] = CASE WHEN @LastRunStatus_Clear = 1 THEN NULL ELSE ISNULL(@LastRunStatus, [LastRunStatus]) END,
        [LastResultHash] = CASE WHEN @LastResultHash_Clear = 1 THEN NULL ELSE ISNULL(@LastResultHash, [LastResultHash]) END,
        [NotifyCondition] = ISNULL(@NotifyCondition, [NotifyCondition]),
        [NotifyViaInApp] = ISNULL(@NotifyViaInApp, [NotifyViaInApp]),
        [NotifyViaEmail] = ISNULL(@NotifyViaEmail, [NotifyViaEmail])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRoutines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRoutines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRoutine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRoutine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRoutine
ON [${flyway:defaultSchema}].[UserRoutine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutine]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRoutine] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: User Routines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: spDeleteUserRoutine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRoutine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRoutine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRoutine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRoutine]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRoutine]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: User Routines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID EEDB54CC-1A36-40A7-8A9D-B4426587D197 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EEDB54CC-1A36-40A7-8A9D-B4426587D197', @RelatedEntityNameFieldMap='ActionExecutionLog';

/* Base View SQL for MJ: User Routine Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Runs
-- Item: vwUserRoutineRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routine Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserRoutineRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserRoutineRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserRoutineRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserRoutineRuns]
AS
SELECT
    u.*,
    MJUserRoutine_RoutineID.[Name] AS [Routine],
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    MJAIPromptRun_PromptRunID.[RunName] AS [PromptRun],
    MJActionExecutionLog_ActionExecutionLogID.[Action] AS [ActionExecutionLog]
FROM
    [${flyway:defaultSchema}].[UserRoutineRun] AS u
INNER JOIN
    [${flyway:defaultSchema}].[UserRoutine] AS MJUserRoutine_RoutineID
  ON
    [u].[RoutineID] = MJUserRoutine_RoutineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [u].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_PromptRunID
  ON
    [u].[PromptRunID] = MJAIPromptRun_PromptRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwActionExecutionLogs] AS MJActionExecutionLog_ActionExecutionLogID
  ON
    [u].[ActionExecutionLogID] = MJActionExecutionLog_ActionExecutionLogID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRoutineRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: User Routine Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Runs
-- Item: Permissions for vwUserRoutineRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRoutineRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: User Routine Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Runs
-- Item: spCreateUserRoutineRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRoutineRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRoutineRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRoutineRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRoutineRun]
    @ID uniqueidentifier = NULL,
    @RoutineID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @PromptRunID_Clear bit = 0,
    @PromptRunID uniqueidentifier = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @ResultSummary_Clear bit = 0,
    @ResultSummary nvarchar(MAX) = NULL,
    @ResultHash_Clear bit = 0,
    @ResultHash nvarchar(100) = NULL,
    @NotificationSent bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRoutineRun]
            (
                [ID],
                [RoutineID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [AgentRunID],
                [PromptRunID],
                [ActionExecutionLogID],
                [ResultSummary],
                [ResultHash],
                [NotificationSent],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RoutineID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                ISNULL(@Status, 'Running'),
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @PromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@PromptRunID, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @ResultSummary_Clear = 1 THEN NULL ELSE ISNULL(@ResultSummary, NULL) END,
                CASE WHEN @ResultHash_Clear = 1 THEN NULL ELSE ISNULL(@ResultHash, NULL) END,
                ISNULL(@NotificationSent, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRoutineRun]
            (
                [RoutineID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [AgentRunID],
                [PromptRunID],
                [ActionExecutionLogID],
                [ResultSummary],
                [ResultHash],
                [NotificationSent],
                [ErrorMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RoutineID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                ISNULL(@Status, 'Running'),
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @PromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@PromptRunID, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @ResultSummary_Clear = 1 THEN NULL ELSE ISNULL(@ResultSummary, NULL) END,
                CASE WHEN @ResultHash_Clear = 1 THEN NULL ELSE ISNULL(@ResultHash, NULL) END,
                ISNULL(@NotificationSent, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRoutineRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutineRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: User Routine Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutineRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: User Routine Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Runs
-- Item: spUpdateUserRoutineRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRoutineRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRoutineRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRoutineRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRoutineRun]
    @ID uniqueidentifier,
    @RoutineID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @PromptRunID_Clear bit = 0,
    @PromptRunID uniqueidentifier = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @ResultSummary_Clear bit = 0,
    @ResultSummary nvarchar(MAX) = NULL,
    @ResultHash_Clear bit = 0,
    @ResultHash nvarchar(100) = NULL,
    @NotificationSent bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutineRun]
    SET
        [RoutineID] = ISNULL(@RoutineID, [RoutineID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [AgentRunID] = CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, [AgentRunID]) END,
        [PromptRunID] = CASE WHEN @PromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@PromptRunID, [PromptRunID]) END,
        [ActionExecutionLogID] = CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, [ActionExecutionLogID]) END,
        [ResultSummary] = CASE WHEN @ResultSummary_Clear = 1 THEN NULL ELSE ISNULL(@ResultSummary, [ResultSummary]) END,
        [ResultHash] = CASE WHEN @ResultHash_Clear = 1 THEN NULL ELSE ISNULL(@ResultHash, [ResultHash]) END,
        [NotificationSent] = ISNULL(@NotificationSent, [NotificationSent]),
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRoutineRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRoutineRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutineRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutineRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRoutineRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRoutineRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRoutineRun
ON [${flyway:defaultSchema}].[UserRoutineRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutineRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRoutineRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: User Routine Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutineRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: User Routine Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routine Runs
-- Item: spDeleteUserRoutineRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRoutineRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRoutineRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRoutineRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRoutineRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRoutineRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutineRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: User Routine Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutineRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID_Clear = 1, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ParentID_AgentRunID, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ParentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ParentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID_Clear = 1, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID_Clear = 1, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade update on ContentItemTag using cursor to call spUpdateContentItemTag
    DECLARE @MJContentItemTags_AIPromptRunIDID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_ItemID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_Tag nvarchar(200)
    DECLARE @MJContentItemTags_AIPromptRunID_Weight numeric(5, 4)
    DECLARE @MJContentItemTags_AIPromptRunID_TagID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJContentItemTags_AIPromptRunID_Reasoning nvarchar(MAX)
    DECLARE cascade_update_MJContentItemTags_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [ItemID], [Tag], [Weight], [TagID], [AIPromptRunID], [Reasoning]
        FROM [${flyway:defaultSchema}].[ContentItemTag]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJContentItemTags_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJContentItemTags_AIPromptRunID_cursor INTO @MJContentItemTags_AIPromptRunIDID, @MJContentItemTags_AIPromptRunID_ItemID, @MJContentItemTags_AIPromptRunID_Tag, @MJContentItemTags_AIPromptRunID_Weight, @MJContentItemTags_AIPromptRunID_TagID, @MJContentItemTags_AIPromptRunID_AIPromptRunID, @MJContentItemTags_AIPromptRunID_Reasoning

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentItemTags_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentItemTag] @ID = @MJContentItemTags_AIPromptRunIDID, @ItemID = @MJContentItemTags_AIPromptRunID_ItemID, @Tag = @MJContentItemTags_AIPromptRunID_Tag, @Weight = @MJContentItemTags_AIPromptRunID_Weight, @TagID = @MJContentItemTags_AIPromptRunID_TagID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJContentItemTags_AIPromptRunID_AIPromptRunID, @Reasoning = @MJContentItemTags_AIPromptRunID_Reasoning

        FETCH NEXT FROM cascade_update_MJContentItemTags_AIPromptRunID_cursor INTO @MJContentItemTags_AIPromptRunIDID, @MJContentItemTags_AIPromptRunID_ItemID, @MJContentItemTags_AIPromptRunID_Tag, @MJContentItemTags_AIPromptRunID_Weight, @MJContentItemTags_AIPromptRunID_TagID, @MJContentItemTags_AIPromptRunID_AIPromptRunID, @MJContentItemTags_AIPromptRunID_Reasoning
    END

    CLOSE cascade_update_MJContentItemTags_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJContentItemTags_AIPromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor INTO @MJDuplicateRunDetailMatches_AIPromptRunIDID, @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIPromptRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor INTO @MJDuplicateRunDetailMatches_AIPromptRunIDID, @MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_Action, @MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, @MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIPromptRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_PromptRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_PromptRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_PromptRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_PromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_PromptRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_PromptRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_PromptRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_PromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_PromptRunID_cursor INTO @MJUserRoutineRuns_PromptRunIDID, @MJUserRoutineRuns_PromptRunID_RoutineID, @MJUserRoutineRuns_PromptRunID_StartedAt, @MJUserRoutineRuns_PromptRunID_CompletedAt, @MJUserRoutineRuns_PromptRunID_Status, @MJUserRoutineRuns_PromptRunID_AgentRunID, @MJUserRoutineRuns_PromptRunID_PromptRunID, @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @MJUserRoutineRuns_PromptRunID_ResultSummary, @MJUserRoutineRuns_PromptRunID_ResultHash, @MJUserRoutineRuns_PromptRunID_NotificationSent, @MJUserRoutineRuns_PromptRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_PromptRunIDID, @RoutineID = @MJUserRoutineRuns_PromptRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_PromptRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_PromptRunID_CompletedAt, @Status = @MJUserRoutineRuns_PromptRunID_Status, @AgentRunID = @MJUserRoutineRuns_PromptRunID_AgentRunID, @PromptRunID_Clear = 1, @PromptRunID = @MJUserRoutineRuns_PromptRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_PromptRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_PromptRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_PromptRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_PromptRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_PromptRunID_cursor INTO @MJUserRoutineRuns_PromptRunIDID, @MJUserRoutineRuns_PromptRunID_RoutineID, @MJUserRoutineRuns_PromptRunID_StartedAt, @MJUserRoutineRuns_PromptRunID_CompletedAt, @MJUserRoutineRuns_PromptRunID_Status, @MJUserRoutineRuns_PromptRunID_AgentRunID, @MJUserRoutineRuns_PromptRunID_PromptRunID, @MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, @MJUserRoutineRuns_PromptRunID_ResultSummary, @MJUserRoutineRuns_PromptRunID_ResultHash, @MJUserRoutineRuns_PromptRunID_NotificationSent, @MJUserRoutineRuns_PromptRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_PromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceAIAgentRunID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, @MJAIAgentNotes_SourceAIAgentRunID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PlanMode bit
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ParentRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ParentRunID_PlanMode

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt, @MJAIAgentRuns_ParentRunID_AgentSessionID, @MJAIAgentRuns_ParentRunID_PlanMode
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PlanMode bit
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_LastRunID_AgentSessionID, @PlanMode = @MJAIAgentRuns_LastRunID_PlanMode

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt, @MJAIAgentRuns_LastRunID_AgentSessionID, @MJAIAgentRuns_LastRunID_PlanMode
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_Success bit
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopK int
    DECLARE @MJAIPromptRuns_AgentRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_Seed int
    DECLARE @MJAIPromptRuns_AgentRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentRunID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentRunIDID, @PromptID = @MJAIPromptRuns_AgentRunID_PromptID, @ModelID = @MJAIPromptRuns_AgentRunID_ModelID, @VendorID = @MJAIPromptRuns_AgentRunID_VendorID, @AgentID = @MJAIPromptRuns_AgentRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentRunID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentRunID_Messages, @Result = @MJAIPromptRuns_AgentRunID_Result, @TokensUsed = @MJAIPromptRuns_AgentRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentRunID_TotalCost, @Success = @MJAIPromptRuns_AgentRunID_Success, @ErrorMessage = @MJAIPromptRuns_AgentRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentRunID_ParentID, @RunType = @MJAIPromptRuns_AgentRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentRunID_ExecutionOrder, @AgentRunID_Clear = 1, @AgentRunID = @MJAIPromptRuns_AgentRunID_AgentRunID, @Cost = @MJAIPromptRuns_AgentRunID_Cost, @CostCurrency = @MJAIPromptRuns_AgentRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentRunID_Temperature, @TopP = @MJAIPromptRuns_AgentRunID_TopP, @TopK = @MJAIPromptRuns_AgentRunID_TopK, @MinP = @MJAIPromptRuns_AgentRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentRunID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentRunID_Seed, @StopSequences = @MJAIPromptRuns_AgentRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentRunID_ModelSelection, @Status = @MJAIPromptRuns_AgentRunID_Status, @Cancelled = @MJAIPromptRuns_AgentRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentRunID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentRunID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentRunID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentRunID_EffortLevel, @RunName = @MJAIPromptRuns_AgentRunID_RunName, @Comments = @MJAIPromptRuns_AgentRunID_Comments, @TestRunID = @MJAIPromptRuns_AgentRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunIDID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_Action nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt datetimeoffset
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation nvarchar(20)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence numeric(12, 11)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning nvarchar(MAX)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID nvarchar(500)
    DECLARE @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap nvarchar(MAX)
    DECLARE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [DuplicateRunDetailID], [MatchSource], [MatchRecordID], [MatchProbability], [MatchedAt], [Action], [ApprovalStatus], [RecordMergeLogID], [MergeStatus], [MergedAt], [RecordMetadata], [AIAgentRunID], [AIPromptRunID], [LLMRecommendation], [LLMConfidence], [LLMReasoning], [LLMProposedSurvivorRecordID], [LLMProposedFieldMap]
        FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] @ID = @MJDuplicateRunDetailMatches_AIAgentRunIDID, @DuplicateRunDetailID = @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MatchSource = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MatchRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MatchProbability = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MatchedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @Action = @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @ApprovalStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @RecordMergeLogID = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MergeStatus = @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MergedAt = @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @RecordMetadata = @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @AIPromptRunID = @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @LLMRecommendation = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @LLMConfidence = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @LLMReasoning = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @LLMProposedSurvivorRecordID = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @LLMProposedFieldMap = @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap

        FETCH NEXT FROM cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor INTO @MJDuplicateRunDetailMatches_AIAgentRunIDID, @MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, @MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_Action, @MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, @MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, @MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, @MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, @MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSurvivorRecordID, @MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap
    END

    CLOSE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJDuplicateRunDetailMatches_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSessionIteration using cursor to call spUpdateExperimentSessionIteration
    DECLARE @MJExperimentSessionIterations_AIAgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID uniqueidentifier
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Sequence int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Label nvarchar(255)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Score decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_ComputeCost decimal(18, 6)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_TokensUsed int
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_Rationale nvarchar(MAX)
    DECLARE @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentSessionID], [Sequence], [Label], [Status], [Score], [ComputeCost], [TokensUsed], [Rationale], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSessionIteration]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSessionIteration] @ID = @MJExperimentSessionIterations_AIAgentRunIDID, @ExperimentSessionID = @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @Sequence = @MJExperimentSessionIterations_AIAgentRunID_Sequence, @Label = @MJExperimentSessionIterations_AIAgentRunID_Label, @Status = @MJExperimentSessionIterations_AIAgentRunID_Status, @Score = @MJExperimentSessionIterations_AIAgentRunID_Score, @ComputeCost = @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @TokensUsed = @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @Rationale = @MJExperimentSessionIterations_AIAgentRunID_Rationale, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor INTO @MJExperimentSessionIterations_AIAgentRunIDID, @MJExperimentSessionIterations_AIAgentRunID_ExperimentSessionID, @MJExperimentSessionIterations_AIAgentRunID_Sequence, @MJExperimentSessionIterations_AIAgentRunID_Label, @MJExperimentSessionIterations_AIAgentRunID_Status, @MJExperimentSessionIterations_AIAgentRunID_Score, @MJExperimentSessionIterations_AIAgentRunID_ComputeCost, @MJExperimentSessionIterations_AIAgentRunID_TokensUsed, @MJExperimentSessionIterations_AIAgentRunID_Rationale, @MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessionIterations_AIAgentRunID_cursor
    
    -- Cascade update on ExperimentSession using cursor to call spUpdateExperimentSession
    DECLARE @MJExperimentSessions_AgentRunIDID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_ExperimentID uniqueidentifier
    DECLARE @MJExperimentSessions_AgentRunID_Name nvarchar(255)
    DECLARE @MJExperimentSessions_AgentRunID_Goal nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Budget nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Status nvarchar(20)
    DECLARE @MJExperimentSessions_AgentRunID_PlanSpec nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_Leaderboard nvarchar(MAX)
    DECLARE @MJExperimentSessions_AgentRunID_AgentRunID uniqueidentifier
    DECLARE cascade_update_MJExperimentSessions_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [ExperimentID], [Name], [Goal], [Budget], [Status], [PlanSpec], [Leaderboard], [AgentRunID]
        FROM [${flyway:defaultSchema}].[ExperimentSession]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJExperimentSessions_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJExperimentSessions_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateExperimentSession] @ID = @MJExperimentSessions_AgentRunIDID, @ExperimentID = @MJExperimentSessions_AgentRunID_ExperimentID, @Name = @MJExperimentSessions_AgentRunID_Name, @Goal = @MJExperimentSessions_AgentRunID_Goal, @Budget = @MJExperimentSessions_AgentRunID_Budget, @Status = @MJExperimentSessions_AgentRunID_Status, @PlanSpec = @MJExperimentSessions_AgentRunID_PlanSpec, @Leaderboard = @MJExperimentSessions_AgentRunID_Leaderboard, @AgentRunID_Clear = 1, @AgentRunID = @MJExperimentSessions_AgentRunID_AgentRunID

        FETCH NEXT FROM cascade_update_MJExperimentSessions_AgentRunID_cursor INTO @MJExperimentSessions_AgentRunIDID, @MJExperimentSessions_AgentRunID_ExperimentID, @MJExperimentSessions_AgentRunID_Name, @MJExperimentSessions_AgentRunID_Goal, @MJExperimentSessions_AgentRunID_Budget, @MJExperimentSessions_AgentRunID_Status, @MJExperimentSessions_AgentRunID_PlanSpec, @MJExperimentSessions_AgentRunID_Leaderboard, @MJExperimentSessions_AgentRunID_AgentRunID
    END

    CLOSE cascade_update_MJExperimentSessions_AgentRunID_cursor
    DEALLOCATE cascade_update_MJExperimentSessions_AgentRunID_cursor
    
    -- Cascade update on ProcessRunDetail using cursor to call spUpdateProcessRunDetail
    DECLARE @MJProcessRunDetails_AIAgentRunIDID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_ProcessRunID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_EntityID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_RecordID nvarchar(450)
    DECLARE @MJProcessRunDetails_AIAgentRunID_Status nvarchar(20)
    DECLARE @MJProcessRunDetails_AIAgentRunID_StartedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_CompletedAt datetimeoffset
    DECLARE @MJProcessRunDetails_AIAgentRunID_DurationMs int
    DECLARE @MJProcessRunDetails_AIAgentRunID_AttemptCount int
    DECLARE @MJProcessRunDetails_AIAgentRunID_ResultPayload nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJProcessRunDetails_AIAgentRunID_AIAgentRunID uniqueidentifier
    DECLARE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [ProcessRunID], [EntityID], [RecordID], [Status], [StartedAt], [CompletedAt], [DurationMs], [AttemptCount], [ResultPayload], [ErrorMessage], [ActionExecutionLogID], [AIAgentRunID]
        FROM [${flyway:defaultSchema}].[ProcessRunDetail]
        WHERE [AIAgentRunID] = @ID

    OPEN cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJProcessRunDetails_AIAgentRunID_AIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateProcessRunDetail] @ID = @MJProcessRunDetails_AIAgentRunIDID, @ProcessRunID = @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @EntityID = @MJProcessRunDetails_AIAgentRunID_EntityID, @RecordID = @MJProcessRunDetails_AIAgentRunID_RecordID, @Status = @MJProcessRunDetails_AIAgentRunID_Status, @StartedAt = @MJProcessRunDetails_AIAgentRunID_StartedAt, @CompletedAt = @MJProcessRunDetails_AIAgentRunID_CompletedAt, @DurationMs = @MJProcessRunDetails_AIAgentRunID_DurationMs, @AttemptCount = @MJProcessRunDetails_AIAgentRunID_AttemptCount, @ResultPayload = @MJProcessRunDetails_AIAgentRunID_ResultPayload, @ErrorMessage = @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @ActionExecutionLogID = @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @AIAgentRunID_Clear = 1, @AIAgentRunID = @MJProcessRunDetails_AIAgentRunID_AIAgentRunID

        FETCH NEXT FROM cascade_update_MJProcessRunDetails_AIAgentRunID_cursor INTO @MJProcessRunDetails_AIAgentRunIDID, @MJProcessRunDetails_AIAgentRunID_ProcessRunID, @MJProcessRunDetails_AIAgentRunID_EntityID, @MJProcessRunDetails_AIAgentRunID_RecordID, @MJProcessRunDetails_AIAgentRunID_Status, @MJProcessRunDetails_AIAgentRunID_StartedAt, @MJProcessRunDetails_AIAgentRunID_CompletedAt, @MJProcessRunDetails_AIAgentRunID_DurationMs, @MJProcessRunDetails_AIAgentRunID_AttemptCount, @MJProcessRunDetails_AIAgentRunID_ResultPayload, @MJProcessRunDetails_AIAgentRunID_ErrorMessage, @MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, @MJProcessRunDetails_AIAgentRunID_AIAgentRunID
    END

    CLOSE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    DEALLOCATE cascade_update_MJProcessRunDetails_AIAgentRunID_cursor
    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun
    DECLARE @MJUserRoutineRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_RoutineID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_StartedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJUserRoutineRuns_AgentRunID_Status nvarchar(20)
    DECLARE @MJUserRoutineRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_PromptRunID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID uniqueidentifier
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_AgentRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [PromptRunID], [ActionExecutionLogID], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_AgentRunIDID, @RoutineID = @MJUserRoutineRuns_AgentRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_AgentRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_AgentRunID_CompletedAt, @Status = @MJUserRoutineRuns_AgentRunID_Status, @AgentRunID_Clear = 1, @AgentRunID = @MJUserRoutineRuns_AgentRunID_AgentRunID, @PromptRunID = @MJUserRoutineRuns_AgentRunID_PromptRunID, @ActionExecutionLogID = @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @ResultSummary = @MJUserRoutineRuns_AgentRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_AgentRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_AgentRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_AgentRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_PromptRunID, @MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage
    END

    CLOSE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f1ea682-5f73-44be-8811-9279f12c4e88' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f1ea682-5f73-44be-8811-9279f12c4e88',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100053,
            'User',
            'User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a4f5964-b03f-4180-9ec7-63d9b10743ec' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'Environment')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a4f5964-b03f-4180-9ec7-63d9b10743ec',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100054,
            'Environment',
            'Environment',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de64d640-0292-4bc6-bafe-0b0179052af5' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'NotificationTemplate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'de64d640-0292-4bc6-bafe-0b0179052af5',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            100055,
            'NotificationTemplate',
            'Notification Template',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa8aecbd-87a0-4f0c-982e-3380886a3318' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'Routine')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fa8aecbd-87a0-4f0c-982e-3380886a3318',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100017,
            'Routine',
            'Routine',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b86c096-1a20-4a07-9a6c-27f1e9c0bf8d' OR (EntityID = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b86c096-1a20-4a07-9a6c-27f1e9c0bf8d',
            '90DFFDEA-6FF8-4721-8730-25CE51209A4B', -- Entity: MJ: User Routine Recipients
            100018,
            'User',
            'User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dedb4a65-fa5e-4a4f-9ae7-2205a6305f39' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'Routine')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dedb4a65-fa5e-4a4f-9ae7-2205a6305f39',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100029,
            'Routine',
            'Routine',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '720622fa-875d-41f8-ac33-c87e1dad20a6' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'AgentRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '720622fa-875d-41f8-ac33-c87e1dad20a6',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100030,
            'AgentRun',
            'Agent Run',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f2362d4-f61d-4503-ae18-0db944cfeb71' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'PromptRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f2362d4-f61d-4503-ae18-0db944cfeb71',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100031,
            'PromptRun',
            'Prompt Run',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af5ddace-5d3e-4558-9c25-06a7fccb3987' OR (EntityID = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND Name = 'ActionExecutionLog')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af5ddace-5d3e-4558-9c25-06a7fccb3987',
            '149A0274-47E7-4AAE-A64C-77B9F7D0873E', -- Entity: MJ: User Routine Runs
            100032,
            'ActionExecutionLog',
            'Action Execution Log',
            NULL,
            'nvarchar',
            850,
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
               SET IsNameField = 1
               WHERE ID = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D0731EDD-711C-466C-9A91-CBF587D300AA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E188CCE7-FB74-4482-9CB4-F65A7B5BF2FF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FA8AECBD-87A0-4F0C-982E-3380886A3318'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2644D5FA-E13F-4CCD-8C0F-582A223D6790'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C773E487-81C6-445F-B1F9-B63922334059'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '46977ED9-EB0D-47B3-9CFC-1C51D537512D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '91598C2C-8F06-4E78-B775-CDB329CEB384'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2644D5FA-E13F-4CCD-8C0F-582A223D6790'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C773E487-81C6-445F-B1F9-B63922334059'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '2644D5FA-E13F-4CCD-8C0F-582A223D6790'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'C773E487-81C6-445F-B1F9-B63922334059'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '991A9918-AE4B-4C3D-83A1-84C4CFF3B4F9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5BC895D7-72FC-49F0-B68E-DE2FA9A53E7E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DEDB4A65-FA5E-4A4F-9AE7-2205A6305F39'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DEDB4A65-FA5E-4A4F-9AE7-2205A6305F39'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E455B5B-C101-45B9-BD72-509675C5EA9B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.RoutineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Routine',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7A02CBB-97C8-4F58-B49E-B9D9702F2E6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Routine 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Routine Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA8AECBD-87A0-4F0C-982E-3380886A3318' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE13E21C-E76B-40AB-8718-0FAE9DD1D965' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Email Address',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Channel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notification Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0731EDD-711C-466C-9A91-CBF587D300AA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notification Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E188CCE7-FB74-4482-9CB4-F65A7B5BF2FF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '723018C4-1E60-4622-A02F-8D85D32C6AB0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A35C1721-AA88-4CC4-AF8D-88B8969D5423' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-user-clock */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-user-clock', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '90DFFDEA-6FF8-4721-8730-25CE51209A4B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c8f93057-9630-470b-9a23-616ea15bbabd', '90DFFDEA-6FF8-4721-8730-25CE51209A4B', 'FieldCategoryInfo', '{"Routine Association":{"icon":"fa fa-tasks","description":"Links the recipient to the parent routine configuration"},"Recipient Details":{"icon":"fa fa-user","description":"Identification details for internal users or external email contacts"},"Notification Settings":{"icon":"fa fa-bell","description":"Configuration for how and when the recipient receives notifications"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bb30d721-8efa-4220-8891-9c33ec109d8a', '90DFFDEA-6FF8-4721-8730-25CE51209A4B', 'FieldCategoryIcons', '{"Routine Association":"fa fa-tasks","Recipient Details":"fa fa-user","Notification Settings":"fa fa-bell","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '90DFFDEA-6FF8-4721-8730-25CE51209A4B';

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA7133A2-39BC-4C11-9697-1F2442394C6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.RoutineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Routine',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E9A8F03-958F-4C17-8493-1A95E097D602' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.Routine 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Routine Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEDB4A65-FA5E-4A4F-9AE7-2205A6305F39' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '991A9918-AE4B-4C3D-83A1-84C4CFF3B4F9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BC895D7-72FC-49F0-B68E-DE2FA9A53E7E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ResultSummary 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD9C6F60-0D84-40C4-B8C2-D6ABF45F9E16' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ResultHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E54429E3-0861-4532-801D-286675875682' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A37FDA9C-9F40-4E66-82CB-AD5F4A2F441F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.NotificationSent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2783A568-F159-4681-B6C3-F693C6987872' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.AgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linked Executions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63F5317B-AE27-42EB-B3A6-2125E96B7E71' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.AgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linked Executions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Run Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '720622FA-875D-41F8-AC33-C87E1DAD20A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.PromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linked Executions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B71D5EB5-3348-4382-9578-24C6D027B4D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.PromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linked Executions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Run Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F2362D4-F61D-4503-AE18-0DB944CFEB71' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ActionExecutionLogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linked Executions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Execution Log',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EEDB54CC-1A36-40A7-8A9D-B4426587D197' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ActionExecutionLog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linked Executions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Execution Log Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF5DDACE-5D3E-4558-9C25-06A7FCCB3987' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4258725E-C8DA-4317-82FF-D3FD29EBDCCB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7743D3F3-E760-4153-AB41-576CED757DB8' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-play-circle */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-play-circle', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '149A0274-47E7-4AAE-A64C-77B9F7D0873E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0d52f93a-71ae-41d8-b0c2-0abba6174adc', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'FieldCategoryInfo', '{"Routine Context":{"icon":"fa fa-tasks","description":"Information regarding the parent routine configuration"},"Execution Timeline":{"icon":"fa fa-clock","description":"Start and completion timestamps for the run"},"Execution Results":{"icon":"fa fa-check-circle","description":"Outcome status, summaries, error logs, and notifications"},"Linked Executions":{"icon":"fa fa-link","description":"References to associated AI agent, prompt, or action execution logs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9fa76a6b-1bb5-4919-b308-96aa926ddfff', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'FieldCategoryIcons', '{"Routine Context":"fa fa-tasks","Execution Timeline":"fa fa-clock","Execution Results":"fa fa-check-circle","Linked Executions":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '149A0274-47E7-4AAE-A64C-77B9F7D0873E';

/* Set categories for 29 fields */

-- UPDATE Entity Field Category Info MJ: User Routines.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D1E15BA-591D-4C2F-AADB-88563C71A074' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0E2528D-3E0C-4D07-97CD-D2A5F2E18E69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.EnvironmentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '584BA54A-84D9-4E76-BF64-B42FB707A171' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76D890C2-2CF1-482D-9823-111FF82B1589' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CCB724B-9B32-408C-8D00-82D64FDF9A76' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.RoutineType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2644D5FA-E13F-4CCD-8C0F-582A223D6790' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.TargetType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C773E487-81C6-445F-B1F9-B63922334059' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.TargetID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABF830CA-1F2C-4121-8ED7-637003B1BB38' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.InitialMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '712470D0-F60A-4DEA-8EB4-03ADB363BA91' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.StartingPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4AF3B243-4D7F-415E-A291-153B52409481' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.RequestedSkillIDs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested Skill IDs',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '202535D1-3E71-488E-AD20-4BF7BB994981' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.CronExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '505FB83A-E8F6-4C69-819B-A6777B4AAA4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Timezone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D906A039-F1A4-4B29-867A-421F3D0844E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.StartAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEE9AD88-B7D4-431C-8C89-4D4F6223421D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.EndAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C8B92BF-5EA8-41BF-BE21-C89375D907BF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NextRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Timing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46977ED9-EB0D-47B3-9CFC-1C51D537512D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.LastRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA45A96E-D80E-410B-B112-499D08AA0A92' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.LastRunStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91598C2C-8F06-4E78-B775-CDB329CEB384' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.LastResultHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1EA37BD4-DB55-4BA1-B036-746CFEF901DE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotificationTemplateID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Notification Template',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2EC50FB2-B62B-4C11-AB77-F282DF8F6C8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotifyCondition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD8301A7-A0AD-469C-91D6-30A876B61561' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotifyViaInApp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Notify Via In-App',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ACDAD567-0DC5-4732-89FF-4628B20B8A74' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotifyViaEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8C70528-E866-48FA-8BE2-D03279431403' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '306F503E-B801-4544-90DD-A94993F2F5D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38B3AAB9-0B7B-4CC8-8A96-3B0BA93918B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F1EA682-5F73-44BE-8811-9279F12C4E88' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Environment 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A4F5964-B03F-4180-9EC7-63D9B10743EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotificationTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Notification Template Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE64D640-0292-4BC6-BAFE-0B0179052AF5' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-sync-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-sync-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D6CA6018-D288-4F79-B6A9-168C75C3363B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e4388914-e8e6-4dab-81ce-5716275bc8d9', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'FieldCategoryInfo', '{"Routine Configuration":{"icon":"fa fa-cog","description":"General settings and ownership details for the routine."},"Execution Settings":{"icon":"fa fa-play-circle","description":"Configuration for routine targets, payloads, and operational parameters."},"Scheduling and Timing":{"icon":"fa fa-clock","description":"Time-based scheduling logic, cron expressions, and activation windows."},"Execution History":{"icon":"fa fa-history","description":"Audit and state tracking of the most recent routine executions."},"Notifications":{"icon":"fa fa-bell","description":"Notification delivery preferences and templates for routine output."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit fields and display references."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('49e8299f-3848-4296-bb91-b40b000f9dc7', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'FieldCategoryIcons', '{"Routine Configuration":"fa fa-cog","Execution Settings":"fa fa-play-circle","Scheduling and Timing":"fa fa-clock","Execution History":"fa fa-history","Notifications":"fa fa-bell","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D6CA6018-D288-4F79-B6A9-168C75C3363B';

