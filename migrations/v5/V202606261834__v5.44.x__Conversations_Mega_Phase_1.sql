/* ============================================================================
   Conversations Mega Phase 1 — consolidated schema
   v5.44.x

   Companion plan: /plans/conversations-phase1/conversations-mega-phase-1-wbs.md

   ONE consolidated migration for the whole phase. Every table is touched
   exactly once (new tables created complete; existing tables get a single
   ALTER each). Feature code is written AFTER CodeGen regenerates typed
   entities from this schema (no weak typing / no .Get()/.Set()).

   New tables:
     UserRoutine            — user-authored scheduled prompt/agent/action
                              ("routine"); run by the single dispatcher job.
     UserRoutineRecipient   — extra notification recipients for a routine.
     UserRoutineRun         — execution history for a routine.
     AISkill                — reusable capability bundle (instructions appended
                              to an agent's system prompt + optional Actions /
                              sub-agents). Governance via unified permissions.
     AISkillAction          — Actions bundled into a skill.
     AISkillSubAgent        — sub-agents bundled into a skill.
     AIAgentSkill           — agent <-> skill assignment (for AcceptsSkills=Limited).
     ConversationParticipant— group-chat participants (Phase 1 metadata only;
                              runtime wiring is Phase 2).

   Existing tables — ONE additive ALTER each:
     AIAgent.SupportsPlanMode  — capability flag (default ON / opt-out).
     AIAgent.AcceptsSkills     — None | All | Limited (default None).
     AIAgentNote.ProjectID     — project (folder) scope for memory.
     AIAgentExample.ProjectID  — project (folder) scope for memory.
     Conversation.IsTemporary  — incognito conversation (memory-inert).
     Conversation.IsGroup      — group conversation marker (Phase 2 runtime).
     AIAgentRunStep.StepType   — extended with 'Plan' and 'Skill'.

   CodeGen convention (per migrations/CLAUDE.md):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates IDX_AUTO_MJ_FKEY_* automatically.
     * sp_addextendedproperty on every new business column (and new FK columns)
       so CodeGen surfaces descriptions on regen.
     * Status-style columns use CHECK constraints so CodeGen emits string-union
       types.
     * Reference data (the 'User Routine Dispatcher' scheduled job, the
       'Can Share Skills' / 'Can Publish Artifacts Publicly' privileges, the
       'AI Skills' resource type, and the SupportsPlanMode=0 seed for existing
       Realtime/Proxy agents) is seeded via metadata/mj-sync, NOT here.

   Entity metadata, views, and spCreate/Update/Delete are produced by CodeGen
   after this migration runs.
   ============================================================================ */


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


-- ============================================================================
-- 4. AISkill  ("MJ: AI Skills")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkill (
    ID               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name             NVARCHAR(255)    NOT NULL,
    Description      NVARCHAR(MAX)    NULL,
    Instructions     NVARCHAR(MAX)    NOT NULL,
    Status           NVARCHAR(20)     NOT NULL CONSTRAINT DF_AISkill_Status DEFAULT ('Pending'),
    Category         NVARCHAR(100)    NULL,
    CreatedByUserID  UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_AISkill PRIMARY KEY (ID),
    CONSTRAINT FK_AISkill_CreatedByUser FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT CK_AISkill_Status
        CHECK (Status IN ('Active', 'Pending', 'Deprecated'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Short description shown in the skill catalog (used for progressive-disclosure exposure to agents).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Instruction text appended to an accepting agent''s system prompt when the skill is activated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Instructions';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle status. Only Active skills can be activated by agents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional grouping category.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'Category';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User who authored the skill (owner). Authoring is open to self by default; sharing requires the Can Share Skills privilege.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkill', @level2type = N'COLUMN', @level2name = N'CreatedByUserID';


-- ============================================================================
-- 5. AISkillAction  ("MJ: AI Skill Actions")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkillAction (
    ID                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SkillID              UNIQUEIDENTIFIER NOT NULL,
    ActionID             UNIQUEIDENTIFIER NOT NULL,
    MinExecutionsPerRun  INT              NULL,
    MaxExecutionsPerRun  INT              NULL,
    CONSTRAINT PK_AISkillAction PRIMARY KEY (ID),
    CONSTRAINT FK_AISkillAction_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT FK_AISkillAction_Action FOREIGN KEY (ActionID)
        REFERENCES ${flyway:defaultSchema}.Action (ID),
    CONSTRAINT UQ_AISkillAction_Skill_Action UNIQUE (SkillID, ActionID)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill that bundles this action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillAction', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Action made available to the agent while the skill is active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillAction', @level2type = N'COLUMN', @level2name = N'ActionID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional minimum number of executions of this action per run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillAction', @level2type = N'COLUMN', @level2name = N'MinExecutionsPerRun';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional maximum number of executions of this action per run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillAction', @level2type = N'COLUMN', @level2name = N'MaxExecutionsPerRun';


-- ============================================================================
-- 6. AISkillSubAgent  ("MJ: AI Skill Sub Agents")
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AISkillSubAgent (
    ID          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SkillID     UNIQUEIDENTIFIER NOT NULL,
    SubAgentID  UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_AISkillSubAgent PRIMARY KEY (ID),
    CONSTRAINT FK_AISkillSubAgent_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT FK_AISkillSubAgent_SubAgent FOREIGN KEY (SubAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT UQ_AISkillSubAgent_Skill_SubAgent UNIQUE (SkillID, SubAgentID)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill that bundles this sub-agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillSubAgent', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Sub-agent made available to the agent while the skill is active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AISkillSubAgent', @level2type = N'COLUMN', @level2name = N'SubAgentID';


-- ============================================================================
-- 7. AIAgentSkill  ("MJ: AI Agent Skills") — agent <-> skill assignment
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSkill (
    ID       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID  UNIQUEIDENTIFIER NOT NULL,
    SkillID  UNIQUEIDENTIFIER NOT NULL,
    Status   NVARCHAR(20)     NOT NULL CONSTRAINT DF_AIAgentSkill_Status DEFAULT ('Active'),
    CONSTRAINT PK_AIAgentSkill PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSkill_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent (ID),
    CONSTRAINT FK_AIAgentSkill_Skill FOREIGN KEY (SkillID)
        REFERENCES ${flyway:defaultSchema}.AISkill (ID),
    CONSTRAINT UQ_AIAgentSkill_Agent_Skill UNIQUE (AgentID, SkillID),
    CONSTRAINT CK_AIAgentSkill_Status
        CHECK (Status IN ('Active', 'Pending', 'Revoked'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent the skill is assigned to. Used when the agent''s AcceptsSkills = Limited.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSkill', @level2type = N'COLUMN', @level2name = N'AgentID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Skill assigned to the agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSkill', @level2type = N'COLUMN', @level2name = N'SkillID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Assignment status: Active, Pending, or Revoked.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSkill', @level2type = N'COLUMN', @level2name = N'Status';


-- ============================================================================
-- 8. ConversationParticipant  ("MJ: Conversation Participants")
--    Phase 1 = metadata only. Runtime wiring (broadcast, presence, invites)
--    is Phase 2.
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.ConversationParticipant (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ConversationID          UNIQUEIDENTIFIER NOT NULL,
    UserID                  UNIQUEIDENTIFIER NOT NULL,
    Role                    NVARCHAR(20)     NOT NULL CONSTRAINT DF_ConversationParticipant_Role DEFAULT ('Member'),
    Status                  NVARCHAR(20)     NOT NULL CONSTRAINT DF_ConversationParticipant_Status DEFAULT ('Active'),
    InvitedByUserID         UNIQUEIDENTIFIER NULL,
    InvitedAt               DATETIMEOFFSET   NULL,
    JoinedAt                DATETIMEOFFSET   NULL,
    NotificationPreference  NVARCHAR(20)     NULL,
    CONSTRAINT PK_ConversationParticipant PRIMARY KEY (ID),
    CONSTRAINT FK_ConversationParticipant_Conversation FOREIGN KEY (ConversationID)
        REFERENCES ${flyway:defaultSchema}.Conversation (ID),
    CONSTRAINT FK_ConversationParticipant_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT FK_ConversationParticipant_InvitedByUser FOREIGN KEY (InvitedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User] (ID),
    CONSTRAINT UQ_ConversationParticipant_Conversation_User UNIQUE (ConversationID, UserID),
    CONSTRAINT CK_ConversationParticipant_Role
        CHECK (Role IN ('Owner', 'Member', 'Guest')),
    CONSTRAINT CK_ConversationParticipant_Status
        CHECK (Status IN ('Invited', 'Active', 'Removed')),
    CONSTRAINT CK_ConversationParticipant_NotificationPreference
        CHECK (NotificationPreference IN ('All', 'Mentions', 'None'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Conversation the participant belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'ConversationID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Participating user.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Participant role within the conversation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'Role';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Membership status: Invited (pending acceptance), Active, or Removed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'User who issued the invite (if applicable).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'InvitedByUserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the invite was issued.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'InvitedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the participant joined (accepted).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'JoinedAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Per-participant notification preference for this conversation: All, Mentions, or None.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationParticipant', @level2type = N'COLUMN', @level2name = N'NotificationPreference';


-- ============================================================================
-- 9. ALTER existing tables (one consolidated ALTER each)
-- ============================================================================

-- AIAgent: plan-mode capability (default ON / opt-out) + skills acceptance
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    SupportsPlanMode BIT          NOT NULL CONSTRAINT DF_AIAgent_SupportsPlanMode DEFAULT (1),
    AcceptsSkills    NVARCHAR(20) NOT NULL CONSTRAINT DF_AIAgent_AcceptsSkills DEFAULT ('None'),
    CONSTRAINT CK_AIAgent_AcceptsSkills CHECK (AcceptsSkills IN ('None', 'All', 'Limited'));
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this agent supports Plan Mode. Defaults ON (opt-out). Plan-mode instructions are only injected when this is on AND plan mode is enabled per-request. Realtime and Proxy agents are seeded to 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent', @level2type = N'COLUMN', @level2name = N'SupportsPlanMode';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this agent accepts skills: None (no skills), All (any active skill), or Limited (only skills assigned via AIAgentSkill).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent', @level2type = N'COLUMN', @level2name = N'AcceptsSkills';

-- AIAgentNote: project (folder) scope for memory
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    ProjectID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIAgentNote_Project REFERENCES ${flyway:defaultSchema}.Project (ID);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional project (conversation folder) scope. When set, the note participates in project-scoped memory; broad inheritance means project notes plus global (NULL-project) notes surface for a run in that project.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentNote', @level2type = N'COLUMN', @level2name = N'ProjectID';

-- AIAgentExample: project (folder) scope for memory
ALTER TABLE ${flyway:defaultSchema}.AIAgentExample ADD
    ProjectID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIAgentExample_Project REFERENCES ${flyway:defaultSchema}.Project (ID);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional project (conversation folder) scope, mirroring AIAgentNote.ProjectID for example-based memory.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentExample', @level2type = N'COLUMN', @level2name = N'ProjectID';

-- Conversation: incognito + group markers
ALTER TABLE ${flyway:defaultSchema}.Conversation ADD
    IsTemporary BIT NOT NULL CONSTRAINT DF_Conversation_IsTemporary DEFAULT (0),
    IsGroup     BIT NOT NULL CONSTRAINT DF_Conversation_IsGroup DEFAULT (0);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, this is a temporary/incognito conversation: it neither reads from nor writes to agent memory, and is hidden from the default conversation list.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Conversation', @level2type = N'COLUMN', @level2name = N'IsTemporary';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, this conversation is a group conversation (multiple human participants via ConversationParticipant). Phase 1 metadata only; runtime behavior ships in Phase 2.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Conversation', @level2type = N'COLUMN', @level2name = N'IsGroup';


-- ============================================================================
-- 10. Extend AIAgentRunStep.StepType with 'Plan' and 'Skill'
--     (constraint name varies by environment — discover then drop)
-- ============================================================================
DECLARE @StepTypeConstraint NVARCHAR(200);
SELECT @StepTypeConstraint = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
  AND COL_NAME(parent_object_id, parent_column_id) = 'StepType';

IF @StepTypeConstraint IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep] DROP CONSTRAINT ' + @StepTypeConstraint);
    PRINT 'Dropped existing StepType check constraint: ' + @StepTypeConstraint;
END
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
    ADD CONSTRAINT CK_AIAgentRunStep_StepType
        CHECK ([StepType] IN ('Prompt', 'Actions', 'Sub-Agent', 'Chat', 'Decision', 'Validation', 'ForEach', 'While', 'Tool', 'Plan', 'Skill'));
GO
