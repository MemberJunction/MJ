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
    TokensUsed        INT              NULL,
    Cost              DECIMAL(18,6)    NULL,
    ResultSummary     NVARCHAR(MAX)    NULL,
    ResultHash        NVARCHAR(100)    NULL,
    NotificationSent  BIT              NOT NULL CONSTRAINT DF_UserRoutineRun_NotificationSent DEFAULT (0),
    ErrorMessage      NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_UserRoutineRun PRIMARY KEY (ID),
    CONSTRAINT FK_UserRoutineRun_Routine FOREIGN KEY (RoutineID)
        REFERENCES ${flyway:defaultSchema}.UserRoutine (ID),
    CONSTRAINT FK_UserRoutineRun_AgentRun FOREIGN KEY (AgentRunID)
        REFERENCES ${flyway:defaultSchema}.AIAgentRun (ID),
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
    @value = N'Total tokens used by this run (if applicable).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'TokensUsed';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Total cost of this run (if applicable).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutineRun', @level2type = N'COLUMN', @level2name = N'Cost';
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
-- after the hand-written DDL above was applied to the development database.
-- It contains the framework plumbing for the new tables: EntityField metadata
-- inserts, base views, stored procedures (spCreate/spUpdate/spDelete),
-- permission grants, and related sp_addextendedproperty calls.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
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
         '0b84a3d0-2114-42a0-a0f0-7848e86e9fbf',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0b84a3d0-2114-42a0-a0f0-7848e86e9fbf', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routines for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b84a3d0-2114-42a0-a0f0-7848e86e9fbf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routines for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b84a3d0-2114-42a0-a0f0-7848e86e9fbf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routines for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b84a3d0-2114-42a0-a0f0-7848e86e9fbf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'd16d839c-eb7c-4b9d-ba03-f33ed00f984d',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd16d839c-eb7c-4b9d-ba03-f33ed00f984d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Recipients for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d16d839c-eb7c-4b9d-ba03-f33ed00f984d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Recipients for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d16d839c-eb7c-4b9d-ba03-f33ed00f984d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Recipients for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d16d839c-eb7c-4b9d-ba03-f33ed00f984d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '79deeb22-4476-4081-a66d-65ea58d1df6e',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '79deeb22-4476-4081-a66d-65ea58d1df6e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('79deeb22-4476-4081-a66d-65ea58d1df6e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('79deeb22-4476-4081-a66d-65ea58d1df6e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: User Routine Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('79deeb22-4476-4081-a66d-65ea58d1df6e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bacd9b12-3479-45af-a1f4-1772d3032758' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bacd9b12-3479-45af-a1f4-1772d3032758',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0650ec9f-d461-4c43-b8e9-f8aa781e4653' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'RoutineID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0650ec9f-d461-4c43-b8e9-f8aa781e4653',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5382cd1-8e8e-4ffa-9c34-51441701faaf' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'StartedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f5382cd1-8e8e-4ffa-9c34-51441701faaf',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24bf1a72-e38e-485d-b7ae-ae860a52de8e' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'CompletedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24bf1a72-e38e-485d-b7ae-ae860a52de8e',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90bf74b0-bd70-406c-bf65-672f18325a15' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90bf74b0-bd70-406c-bf65-672f18325a15',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '542a538c-ef81-43f3-9357-8828da1a7d17' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'AgentRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '542a538c-ef81-43f3-9357-8828da1a7d17',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '871ca82b-1308-4576-8d78-9891b2e692e8' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'TokensUsed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '871ca82b-1308-4576-8d78-9891b2e692e8',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
            100007,
            'TokensUsed',
            'Tokens Used',
            'Total tokens used by this run (if applicable).',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8975c433-ed4c-45da-9a0c-960b2ff28498' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'Cost')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8975c433-ed4c-45da-9a0c-960b2ff28498',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
            100008,
            'Cost',
            'Cost',
            'Total cost of this run (if applicable).',
            'decimal',
            9,
            18,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00eb6327-247e-4806-be34-b636c3c100dd' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'ResultSummary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '00eb6327-247e-4806-be34-b636c3c100dd',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '861be2d7-9ae9-4a48-8be0-1ecc40109cb4' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'ResultHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '861be2d7-9ae9-4a48-8be0-1ecc40109cb4',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5273d85c-22bc-46d8-92d9-7df90bf515a8' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'NotificationSent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5273d85c-22bc-46d8-92d9-7df90bf515a8',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d622035-a538-46a4-bdd4-3d92bd9ae8ac' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d622035-a538-46a4-bdd4-3d92bd9ae8ac',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76e17476-33ec-4188-9282-ecae73b1f6d2' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '76e17476-33ec-4188-9282-ecae73b1f6d2',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '443c7e10-3865-4ded-a64f-36a5a800bb8f' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '443c7e10-3865-4ded-a64f-36a5a800bb8f',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6cdd3c1-f544-4c36-8acb-3e301658593c' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e6cdd3c1-f544-4c36-8acb-3e301658593c',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '886e4edb-2f48-49c1-bc8a-2362348a28f7' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '886e4edb-2f48-49c1-bc8a-2362348a28f7',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e569abd-eee9-463c-94fe-4f0771b896a5' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'EnvironmentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e569abd-eee9-463c-94fe-4f0771b896a5',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5eda642f-47fd-4904-9b24-06f8713a1f44' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5eda642f-47fd-4904-9b24-06f8713a1f44',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '638ee40b-88ad-4e89-9c13-7f28e9565a73' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '638ee40b-88ad-4e89-9c13-7f28e9565a73',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a806c9af-6745-4056-b775-f93ff395cd5f' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a806c9af-6745-4056-b775-f93ff395cd5f',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ec61ffc-11a9-4336-94ef-ab00e5633f5d' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'RoutineType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ec61ffc-11a9-4336-94ef-ab00e5633f5d',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edb8dc83-1f84-49c3-913e-d7f97793218a' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'TargetType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'edb8dc83-1f84-49c3-913e-d7f97793218a',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82ce2ddc-5ddf-4891-9669-7b0f8ecf12c5' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'TargetID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '82ce2ddc-5ddf-4891-9669-7b0f8ecf12c5',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df35475f-e7ad-45ea-8e45-14b6a0fec8fa' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'InitialMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df35475f-e7ad-45ea-8e45-14b6a0fec8fa',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb4cf985-cf03-4c1e-bb46-3922a11ff8d4' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'StartingPayload')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fb4cf985-cf03-4c1e-bb46-3922a11ff8d4',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3c39fe4-33b8-412b-a754-4b77492e7692' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'RequestedSkillIDs')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f3c39fe4-33b8-412b-a754-4b77492e7692',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb211013-131c-4dda-b867-d78609aacc30' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'CronExpression')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fb211013-131c-4dda-b867-d78609aacc30',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f652618-639b-4fc5-8714-19b8dc9aa055' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'Timezone')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f652618-639b-4fc5-8714-19b8dc9aa055',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4eaf86c3-efdd-4062-a32d-3a1a865c6f6c' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'NextRunAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4eaf86c3-efdd-4062-a32d-3a1a865c6f6c',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f87b46a-0fb6-41b6-9b18-1992cb0e6eac' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'LastRunAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f87b46a-0fb6-41b6-9b18-1992cb0e6eac',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100016,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30486eab-f8d4-41c2-bbf3-1b1bcce51595' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'LastRunStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '30486eab-f8d4-41c2-bbf3-1b1bcce51595',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100017,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '154f5ef8-2601-4f39-b802-e40e32a0e344' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'LastResultHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '154f5ef8-2601-4f39-b802-e40e32a0e344',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e40ab87d-4739-4b99-b4ff-c893924e0e11' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'NotifyCondition')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e40ab87d-4739-4b99-b4ff-c893924e0e11',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100019,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b34ffa2c-5eb2-4ea5-b418-8497b778c523' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'NotifyViaInApp')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b34ffa2c-5eb2-4ea5-b418-8497b778c523',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100020,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25b8b87b-99f6-4c6f-ab9f-8bb52b0d10fe' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'NotifyViaEmail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25b8b87b-99f6-4c6f-ab9f-8bb52b0d10fe',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100021,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09901538-4e73-48d3-a2a9-0d58cfd573b6' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09901538-4e73-48d3-a2a9-0d58cfd573b6',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100022,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b6e5ad9-a3c6-4555-82cc-25f5fb2c8fa6' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b6e5ad9-a3c6-4555-82cc-25f5fb2c8fa6',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100023,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8845d00-3412-4ba5-9503-b11105660ed2' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f8845d00-3412-4ba5-9503-b11105660ed2',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '962cfbf5-6990-4cc4-a6cc-ebfc4f2ea53b' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'RoutineID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '962cfbf5-6990-4cc4-a6cc-ebfc4f2ea53b',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
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
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80cc4c7a-1050-4a3f-8d0c-31a5b3af51b2' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '80cc4c7a-1050-4a3f-8d0c-31a5b3af51b2',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '432d0046-a581-4eb6-a96c-7fd3ead95c46' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'Email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '432d0046-a581-4eb6-a96c-7fd3ead95c46',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5ac3ca5-f63f-430d-aec3-ca3def51e502' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'Channel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c5ac3ca5-f63f-430d-aec3-ca3def51e502',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee45d6b4-9020-4880-8d3a-a0e6a84445c4' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ee45d6b4-9020-4880-8d3a-a0e6a84445c4',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
            100006,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '950e0fe2-5fe3-4d54-8893-4a259ae945e9' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '950e0fe2-5fe3-4d54-8893-4a259ae945e9',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
            100007,
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

/* SQL text to insert entity field value with ID 364bb46d-f718-4020-ab4f-5a352830be32 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('364bb46d-f718-4020-ab4f-5a352830be32', 'A806C9AF-6745-4056-B775-F93FF395CD5F', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 62dd3a0f-d5b0-48ac-a40a-783e88718be4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('62dd3a0f-d5b0-48ac-a40a-783e88718be4', 'A806C9AF-6745-4056-B775-F93FF395CD5F', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 009e9447-0e40-497d-82fc-cea15dd75aca */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('009e9447-0e40-497d-82fc-cea15dd75aca', 'A806C9AF-6745-4056-B775-F93FF395CD5F', 3, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A806C9AF-6745-4056-B775-F93FF395CD5F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A806C9AF-6745-4056-B775-F93FF395CD5F';

/* SQL text to insert entity field value with ID dfceb883-f91c-49a1-b46e-937bcfc443e5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dfceb883-f91c-49a1-b46e-937bcfc443e5', '3EC61FFC-11A9-4336-94EF-AB00E5633F5D', 1, 'Monitoring', 'Monitoring', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5f95ef0d-ace8-4538-a12a-c89f8fe1d2ae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f95ef0d-ace8-4538-a12a-c89f8fe1d2ae', '3EC61FFC-11A9-4336-94EF-AB00E5633F5D', 2, 'Scheduled', 'Scheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3EC61FFC-11A9-4336-94EF-AB00E5633F5D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3EC61FFC-11A9-4336-94EF-AB00E5633F5D';

/* SQL text to insert entity field value with ID 59040c7a-35a5-4603-8c71-2c70ff41f80e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('59040c7a-35a5-4603-8c71-2c70ff41f80e', 'EDB8DC83-1F84-49C3-913E-D7F97793218A', 1, 'Action', 'Action', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9bfe5bb7-564b-44f2-9b16-0b69091448b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bfe5bb7-564b-44f2-9b16-0b69091448b9', 'EDB8DC83-1F84-49C3-913E-D7F97793218A', 2, 'Agent', 'Agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 567562e8-198b-46d8-bca7-ed926f120831 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('567562e8-198b-46d8-bca7-ed926f120831', 'EDB8DC83-1F84-49C3-913E-D7F97793218A', 3, 'Prompt', 'Prompt', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID EDB8DC83-1F84-49C3-913E-D7F97793218A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='EDB8DC83-1F84-49C3-913E-D7F97793218A';

/* SQL text to insert entity field value with ID 32ea6918-d7e3-48f6-afcd-d76f76a1c487 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32ea6918-d7e3-48f6-afcd-d76f76a1c487', '30486EAB-F8D4-41C2-BBF3-1B1BCCE51595', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8f9db7b9-58a3-4b43-b7f4-242fc14cae7d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8f9db7b9-58a3-4b43-b7f4-242fc14cae7d', '30486EAB-F8D4-41C2-BBF3-1B1BCCE51595', 2, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4a90381f-d84b-4884-aa0e-a2ceaac477d7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4a90381f-d84b-4884-aa0e-a2ceaac477d7', '30486EAB-F8D4-41C2-BBF3-1B1BCCE51595', 3, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1a4fe222-f1bd-4ba1-bc43-7b3fec6505d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1a4fe222-f1bd-4ba1-bc43-7b3fec6505d8', '30486EAB-F8D4-41C2-BBF3-1B1BCCE51595', 4, 'Success', 'Success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 30486EAB-F8D4-41C2-BBF3-1B1BCCE51595 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='30486EAB-F8D4-41C2-BBF3-1B1BCCE51595';

/* SQL text to insert entity field value with ID f2907cb3-9779-4dd8-af47-d2bc354aecaa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2907cb3-9779-4dd8-af47-d2bc354aecaa', 'E40AB87D-4739-4B99-B4FF-C893924E0E11', 1, 'Always', 'Always', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c7688a3d-32de-474e-9362-072c3c89479a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c7688a3d-32de-474e-9362-072c3c89479a', 'E40AB87D-4739-4B99-B4FF-C893924E0E11', 2, 'OnChange', 'OnChange', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7108bbd0-4613-40a3-99e4-8eac08ea7d52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7108bbd0-4613-40a3-99e4-8eac08ea7d52', 'E40AB87D-4739-4B99-B4FF-C893924E0E11', 3, 'OnFailure', 'OnFailure', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8e3ce5b4-43c4-49e3-b304-3f07b0596537 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8e3ce5b4-43c4-49e3-b304-3f07b0596537', 'E40AB87D-4739-4B99-B4FF-C893924E0E11', 4, 'OnSuccess', 'OnSuccess', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E40AB87D-4739-4B99-B4FF-C893924E0E11 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E40AB87D-4739-4B99-B4FF-C893924E0E11';

/* SQL text to insert entity field value with ID 79491ad2-9caf-488a-97aa-56061bcb1375 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('79491ad2-9caf-488a-97aa-56061bcb1375', 'C5AC3CA5-F63F-430D-AEC3-CA3DEF51E502', 1, 'Email', 'Email', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d05edf6d-1135-4419-8b99-900aee5b861e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d05edf6d-1135-4419-8b99-900aee5b861e', 'C5AC3CA5-F63F-430D-AEC3-CA3DEF51E502', 2, 'InApp', 'InApp', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C5AC3CA5-F63F-430D-AEC3-CA3DEF51E502 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C5AC3CA5-F63F-430D-AEC3-CA3DEF51E502';

/* SQL text to insert entity field value with ID 2465c09c-1fd8-4443-b3db-9bcab0c3e527 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2465c09c-1fd8-4443-b3db-9bcab0c3e527', '90BF74B0-BD70-406C-BF65-672F18325A15', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e63890fd-3e32-4fbc-9dd0-28152d57190e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e63890fd-3e32-4fbc-9dd0-28152d57190e', '90BF74B0-BD70-406C-BF65-672F18325A15', 2, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fd168414-9407-481c-a0cc-f544fa1d1ae5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fd168414-9407-481c-a0cc-f544fa1d1ae5', '90BF74B0-BD70-406C-BF65-672F18325A15', 3, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d0d5b53d-63d6-499c-a2e4-72bfc3ae5eb4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d0d5b53d-63d6-499c-a2e4-72bfc3ae5eb4', '90BF74B0-BD70-406C-BF65-672F18325A15', 4, 'Success', 'Success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 90BF74B0-BD70-406C-BF65-672F18325A15 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='90BF74B0-BD70-406C-BF65-672F18325A15';


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: User Routine Runs (One To Many via AgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '289e83ef-74a1-4846-99ad-0ad25350591d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('289e83ef-74a1-4846-99ad-0ad25350591d', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '79DEEB22-4476-4081-A66D-65EA58D1DF6E', 'AgentRunID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Environments -> MJ: User Routines (One To Many via EnvironmentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5dc8b8c5-193b-487e-a1b1-a07662d82b12'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5dc8b8c5-193b-487e-a1b1-a07662d82b12', '72975471-6AAB-45C6-B58A-3F1115C921C3', '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', 'EnvironmentID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: User Routine Recipients (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f25ce848-7a63-4999-b7c4-61a0e7266fe4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f25ce848-7a63-4999-b7c4-61a0e7266fe4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', 'UserID', 'One To Many', 1, 1, 108, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: User Routines (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cf4b3e67-266e-45bf-bac9-4bb2c54572ba'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cf4b3e67-266e-45bf-bac9-4bb2c54572ba', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', 'UserID', 'One To Many', 1, 1, 109, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: User Routines -> MJ: User Routine Recipients (One To Many via RoutineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ffb0b090-18c4-498c-ba8b-58a455baf367'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ffb0b090-18c4-498c-ba8b-58a455baf367', '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', 'RoutineID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: User Routines -> MJ: User Routine Runs (One To Many via RoutineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '038a02bb-1a64-4bda-b39a-724a0fda9de5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('038a02bb-1a64-4bda-b39a-724a0fda9de5', '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', '79DEEB22-4476-4081-A66D-65EA58D1DF6E', 'RoutineID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 962CFBF5-6990-4CC4-A6CC-EBFC4F2EA53B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='962CFBF5-6990-4CC4-A6CC-EBFC4F2EA53B', @RelatedEntityNameFieldMap='Routine';

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

/* SQL text to update entity field related entity name field map for entity field ID 0650EC9F-D461-4C43-B8E9-F8AA781E4653 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0650EC9F-D461-4C43-B8E9-F8AA781E4653', @RelatedEntityNameFieldMap='Routine';

/* SQL text to update entity field related entity name field map for entity field ID 80CC4C7A-1050-4A3F-8D0C-31A5B3AF51B2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='80CC4C7A-1050-4A3F-8D0C-31A5B3AF51B2', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 542A538C-EF81-43F3-9357-8828DA1A7D17 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='542A538C-EF81-43F3-9357-8828DA1A7D17', @RelatedEntityNameFieldMap='AgentRun';

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
    @Channel nvarchar(20) = NULL
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
                [Channel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RoutineID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@Channel, 'InApp')
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
                [Channel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RoutineID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@Channel, 'InApp')
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
    @Channel nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRoutineRecipient]
    SET
        [RoutineID] = ISNULL(@RoutineID, [RoutineID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [Channel] = ISNULL(@Channel, [Channel])
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
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun]
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
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(18, 6) = NULL,
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
                [TokensUsed],
                [Cost],
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
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
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
                [TokensUsed],
                [Cost],
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
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
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
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(18, 6) = NULL,
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
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [Cost] = CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, [Cost]) END,
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

/* SQL text to update entity field related entity name field map for entity field ID 886E4EDB-2F48-49C1-BC8A-2362348A28F7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='886E4EDB-2F48-49C1-BC8A-2362348A28F7', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 6E569ABD-EEE9-463C-94FE-4F0771B896A5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6E569ABD-EEE9-463C-94FE-4F0771B896A5', @RelatedEntityNameFieldMap='Environment';

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
    MJEnvironment_EnvironmentID.[Name] AS [Environment]
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
    DECLARE @MJUserRoutineRuns_AgentRunID_TokensUsed int
    DECLARE @MJUserRoutineRuns_AgentRunID_Cost decimal(18, 6)
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultSummary nvarchar(MAX)
    DECLARE @MJUserRoutineRuns_AgentRunID_ResultHash nvarchar(100)
    DECLARE @MJUserRoutineRuns_AgentRunID_NotificationSent bit
    DECLARE @MJUserRoutineRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE cascade_update_MJUserRoutineRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [RoutineID], [StartedAt], [CompletedAt], [Status], [AgentRunID], [TokensUsed], [Cost], [ResultSummary], [ResultHash], [NotificationSent], [ErrorMessage]
        FROM [${flyway:defaultSchema}].[UserRoutineRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJUserRoutineRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_TokensUsed, @MJUserRoutineRuns_AgentRunID_Cost, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutineRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutineRun] @ID = @MJUserRoutineRuns_AgentRunIDID, @RoutineID = @MJUserRoutineRuns_AgentRunID_RoutineID, @StartedAt = @MJUserRoutineRuns_AgentRunID_StartedAt, @CompletedAt = @MJUserRoutineRuns_AgentRunID_CompletedAt, @Status = @MJUserRoutineRuns_AgentRunID_Status, @AgentRunID_Clear = 1, @AgentRunID = @MJUserRoutineRuns_AgentRunID_AgentRunID, @TokensUsed = @MJUserRoutineRuns_AgentRunID_TokensUsed, @Cost = @MJUserRoutineRuns_AgentRunID_Cost, @ResultSummary = @MJUserRoutineRuns_AgentRunID_ResultSummary, @ResultHash = @MJUserRoutineRuns_AgentRunID_ResultHash, @NotificationSent = @MJUserRoutineRuns_AgentRunID_NotificationSent, @ErrorMessage = @MJUserRoutineRuns_AgentRunID_ErrorMessage

        FETCH NEXT FROM cascade_update_MJUserRoutineRuns_AgentRunID_cursor INTO @MJUserRoutineRuns_AgentRunIDID, @MJUserRoutineRuns_AgentRunID_RoutineID, @MJUserRoutineRuns_AgentRunID_StartedAt, @MJUserRoutineRuns_AgentRunID_CompletedAt, @MJUserRoutineRuns_AgentRunID_Status, @MJUserRoutineRuns_AgentRunID_AgentRunID, @MJUserRoutineRuns_AgentRunID_TokensUsed, @MJUserRoutineRuns_AgentRunID_Cost, @MJUserRoutineRuns_AgentRunID_ResultSummary, @MJUserRoutineRuns_AgentRunID_ResultHash, @MJUserRoutineRuns_AgentRunID_NotificationSent, @MJUserRoutineRuns_AgentRunID_ErrorMessage
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd41d22cf-f119-4b9e-b5e2-527fd1e59aea' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'Routine')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd41d22cf-f119-4b9e-b5e2-527fd1e59aea',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ec40307-758c-44ef-991b-59e8fbd18205' OR (EntityID = '79DEEB22-4476-4081-A66D-65EA58D1DF6E' AND Name = 'AgentRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ec40307-758c-44ef-991b-59e8fbd18205',
            '79DEEB22-4476-4081-A66D-65EA58D1DF6E', -- Entity: MJ: User Routine Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0febeb0-4a65-4993-a436-dcbe392200c9' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd0febeb0-4a65-4993-a436-dcbe392200c9',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100047,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68f556cd-ddf5-4d1b-9a94-f1d37e32f184' OR (EntityID = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF' AND Name = 'Environment')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68f556cd-ddf5-4d1b-9a94-f1d37e32f184',
            '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', -- Entity: MJ: User Routines
            100048,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85a026f9-9207-4e41-bd74-598fd81dee37' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'Routine')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '85a026f9-9207-4e41-bd74-598fd81dee37',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b5fb11e-06d7-49e4-9b46-90f22b2fee99' OR (EntityID = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b5fb11e-06d7-49e4-9b46-90f22b2fee99',
            'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', -- Entity: MJ: User Routine Recipients
            100016,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '432D0046-A581-4EB6-A96C-7FD3EAD95C46'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '432D0046-A581-4EB6-A96C-7FD3EAD95C46'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C5AC3CA5-F63F-430D-AEC3-CA3DEF51E502'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '85A026F9-9207-4E41-BD74-598FD81DEE37'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5B5FB11E-06D7-49E4-9B46-90F22B2FEE99'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '432D0046-A581-4EB6-A96C-7FD3EAD95C46'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B5FB11E-06D7-49E4-9B46-90F22B2FEE99'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '5B5FB11E-06D7-49E4-9B46-90F22B2FEE99'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '432D0046-A581-4EB6-A96C-7FD3EAD95C46'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F5382CD1-8E8E-4FFA-9C34-51441701FAAF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '24BF1A72-E38E-485D-B7AE-AE860A52DE8E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '90BF74B0-BD70-406C-BF65-672F18325A15'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '871CA82B-1308-4576-8D78-9891B2E692E8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8975C433-ED4C-45DA-9A0C-960B2FF28498'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D41D22CF-F119-4B9E-B5E2-527FD1E59AEA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '90BF74B0-BD70-406C-BF65-672F18325A15'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D41D22CF-F119-4B9E-B5E2-527FD1E59AEA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '90BF74B0-BD70-406C-BF65-672F18325A15'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A806C9AF-6745-4056-B775-F93FF395CD5F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3EC61FFC-11A9-4336-94EF-AB00E5633F5D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EDB8DC83-1F84-49C3-913E-D7F97793218A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4EAF86C3-EFDD-4062-A32D-3A1A865C6F6C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '30486EAB-F8D4-41C2-BBF3-1B1BCCE51595'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '5EDA642F-47FD-4904-9B24-06F8713A1F44'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BACD9B12-3479-45AF-A1F4-1772D3032758' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.RoutineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0650EC9F-D461-4C43-B8E9-F8AA781E4653' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.Routine 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D41D22CF-F119-4B9E-B5E2-527FD1E59AEA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5382CD1-8E8E-4FFA-9C34-51441701FAAF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.CompletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24BF1A72-E38E-485D-B7AE-AE860A52DE8E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '90BF74B0-BD70-406C-BF65-672F18325A15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D622035-A538-46A4-BDD4-3D92BD9AE8AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.NotificationSent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5273D85C-22BC-46D8-92D9-7DF90BF515A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.AgentRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Integration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '542A538C-EF81-43F3-9357-8828DA1A7D17' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.AgentRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Integration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EC40307-758C-44EF-991B-59E8FBD18205' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.TokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '871CA82B-1308-4576-8D78-9891B2E692E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.Cost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8975C433-ED4C-45DA-9A0C-960B2FF28498' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ResultSummary 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Result Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00EB6327-247E-4806-BE34-B636C3C100DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.ResultHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Result Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '861BE2D7-9AE9-4A48-8BE0-1ECC40109CB4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76E17476-33EC-4188-9282-ECAE73B1F6D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '443C7E10-3865-4DED-A64F-36A5A800BB8F' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-play-circle */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-play-circle', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '79DEEB22-4476-4081-A66D-65EA58D1DF6E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('acfd4867-410c-4575-9420-4ff52f2544e8', '79DEEB22-4476-4081-A66D-65EA58D1DF6E', 'FieldCategoryInfo', '{"Routine Information":{"icon":"fa fa-tasks","description":"Reference information linking this run to a specific routine"},"Execution Timeline":{"icon":"fa fa-clock","description":"Start and completion timestamps for the execution"},"Execution Status":{"icon":"fa fa-check-circle","description":"Current status, error details, and notification status"},"Agent Integration":{"icon":"fa fa-robot","description":"Information related to linked AI agent executions"},"Performance Metrics":{"icon":"fa fa-chart-line","description":"Resource usage and financial cost metrics"},"Result Data":{"icon":"fa fa-file-alt","description":"Summary and identification hash of the routine result"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('28937449-f279-44c1-9669-45be56355c0b', '79DEEB22-4476-4081-A66D-65EA58D1DF6E', 'FieldCategoryIcons', '{"Routine Information":"fa fa-tasks","Execution Timeline":"fa fa-clock","Execution Status":"fa fa-check-circle","Agent Integration":"fa fa-robot","Performance Metrics":"fa fa-chart-line","Result Data":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '79DEEB22-4476-4081-A66D-65EA58D1DF6E';

/* Set categories for 25 fields */

-- UPDATE Entity Field Category Info MJ: User Routines.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E6CDD3C1-F544-4C36-8ACB-3E301658593C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Ownership',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '886E4EDB-2F48-49C1-BC8A-2362348A28F7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.EnvironmentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Ownership',
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E569ABD-EEE9-463C-94FE-4F0771B896A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Ownership',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0FEBEB0-4A65-4993-A436-DCBE392200C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Environment 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Ownership',
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68F556CD-DDF5-4D1B-9A94-F1D37E32F184' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EDA642F-47FD-4904-9B24-06F8713A1F44' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '638EE40B-88AD-4E89-9C13-7F28E9565A73' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A806C9AF-6745-4056-B775-F93FF395CD5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.RoutineType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3EC61FFC-11A9-4336-94EF-AB00E5633F5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.TargetType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EDB8DC83-1F84-49C3-913E-D7F97793218A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.TargetID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82CE2DDC-5DDF-4891-9669-7B0F8ECF12C5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.InitialMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF35475F-E7AD-45EA-8E45-14B6A0FEC8FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.StartingPayload 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB4CF985-CF03-4C1E-BB46-3922A11FF8D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.RequestedSkillIDs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Requested Skills',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3C39FE4-33B8-412B-A754-4B77492E7692' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.CronExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB211013-131C-4DDA-B867-D78609AACC30' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.Timezone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F652618-639B-4FC5-8714-19B8DC9AA055' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NextRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EAF86C3-EFDD-4062-A32D-3A1A865C6F6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.LastRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F87B46A-0FB6-41B6-9B18-1992CB0E6EAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.LastRunStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30486EAB-F8D4-41C2-BBF3-1B1BCCE51595' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.LastResultHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '154F5EF8-2601-4F39-B802-E40E32A0E344' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotifyCondition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E40AB87D-4739-4B99-B4FF-C893924E0E11' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotifyViaInApp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Notify Via In-App',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B34FFA2C-5EB2-4EA5-B418-8497B778C523' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.NotifyViaEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '25B8B87B-99F6-4C6F-AB9F-8BB52B0D10FE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09901538-4E73-48D3-A2A9-0D58CFD573B6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routines.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B6E5AD9-A3C6-4555-82CC-25F5FB2C8FA6' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-sync-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-sync-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bc7d0f63-8746-4357-ab0c-e7f1e6bda8e9', '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', 'FieldCategoryInfo', '{"Routine Ownership":{"icon":"fa fa-user-shield","description":"Information regarding who owns the routine and its environment scope"},"Routine Configuration":{"icon":"fa fa-cogs","description":"General settings defining the routine''s name, purpose, and lifecycle status"},"Execution Details":{"icon":"fa fa-play-circle","description":"Technical parameters for the routine''s target execution and payloads"},"Scheduling and Notifications":{"icon":"fa fa-calendar-alt","description":"Timing, recurrence, notification preferences, and run history"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('33546f59-10d6-4ca1-a91e-f6aa7af2a2b7', '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF', 'FieldCategoryIcons', '{"Routine Ownership":"fa fa-user-shield","Routine Configuration":"fa fa-cogs","Execution Details":"fa fa-play-circle","Scheduling and Notifications":"fa fa-calendar-alt","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0B84A3D0-2114-42A0-A0F0-7848E86E9FBF';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8845D00-3412-4BA5-9503-B11105660ED2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.RoutineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '962CFBF5-6990-4CC4-A6CC-EBFC4F2EA53B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80CC4C7A-1050-4A3F-8D0C-31A5B3AF51B2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Email Address',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '432D0046-A581-4EB6-A96C-7FD3EAD95C46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Channel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Delivery Channel',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5AC3CA5-F63F-430D-AEC3-CA3DEF51E502' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE45D6B4-9020-4880-8D3A-A0E6A84445C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '950E0FE2-5FE3-4D54-8893-4A259AE945E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.Routine 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Routine Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85A026F9-9207-4E41-BD74-598FD81DEE37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: User Routine Recipients.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Recipient Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B5FB11E-06D7-49E4-9B46-90F22B2FEE99' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-paper-plane */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-paper-plane', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9c3a5691-fef8-4b12-9e9d-9de4177af80d', 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', 'FieldCategoryInfo', '{"Recipient Configuration":{"icon":"fa fa-address-card","description":"Details of the recipient, including user links, email addresses, and notification channels"},"Routine Context":{"icon":"fa fa-sync","description":"Information about the routine associated with this recipient configuration"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2abeaa3e-3b31-41dd-8dba-c4604aa3f6bb', 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D', 'FieldCategoryIcons', '{"Recipient Configuration":"fa fa-address-card","Routine Context":"fa fa-sync","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D16D839C-EB7C-4B9D-BA03-F33ED00F984D';

