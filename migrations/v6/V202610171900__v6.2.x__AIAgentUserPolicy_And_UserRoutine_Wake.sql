-- =====================================================================================
-- AI Agent User Policies, Communication Provider Governance & User Routine Wake (v6.2.x)
-- =====================================================================================
-- 1. Creates [AIAgentUserPolicy] ("MJ: AI Agent User Policies") to store per-(Agent, User)
--    personalization, permission-narrowing rules (CRUD, RLS, FLS, and time windows that
--    narrow below the invoking user's ceiling), channel modes (Email, Phone, Messaging,
--    Calendar), and approval policy gates.
-- 2. Extends [UserRoutine] ("MJ: User Routines") to serve as the unified scheduling and
--    autonomous wake primitive for agents:
--    - Widens RoutineType CHECK constraint to ('Scheduled', 'Monitoring', 'AgentWake')
--    - Adds ScheduleMode ('Recurring', 'OneShot', 'Adaptive') and makes CronExpression
--      nullable when ScheduleMode = 'OneShot'
--    - Adds WakeConfiguration (JSON configuration for watched entities and the 3-tier
--      wake gate: Tier 0 hash/watermark, Tier 1 SafeExpressionEvaluator, Tier 2
--      AIDecisionRunner, Tier 3 AIPromptRunner) and LastCheckedAt watermark
-- 3. Extends [AIBridgeAgentIdentity] ("MJ: AI Bridge Agent Identities") with nullable
--    UserID so an email address or phone DID can be bound to a specific user's personal
--    agent instance (such as their Chief of Staff).
-- 4. Extends [CommunicationProvider] ("MJ: Communication Providers") with calendar &
--    free/busy capability flags (SupportsCalendar, SupportsFreeBusy) and enterprise
--    mailbox governance settings (EnterpriseScopeMode, AllowedEmailDomains,
--    DefaultCredentialID).
-- =====================================================================================

-- =====================================================================================
-- 1. DDL Operations
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] (
    [ID]                                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_ID] DEFAULT (newsequentialid()),
    [AgentID]                               UNIQUEIDENTIFIER NOT NULL,
    [UserID]                                UNIQUEIDENTIFIER NOT NULL,

    -- Personalization & Lifecycle
    [DisplayNameOverride]                   NVARCHAR(100)    NULL,
    [PreferredPersonaID]                    UNIQUEIDENTIFIER NULL,
    [Status]                                NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_Status] DEFAULT ('Active'),
    [OnboardingStatus]                      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_OnboardingStatus] DEFAULT ('NotStarted'),
    [OnboardedAt]                           DATETIMEOFFSET   NULL,
    [CoordinationMode]                      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_CoordinationMode] DEFAULT ('Observer'),

    -- Permission Narrowing (Subset of User's MJ Permissions Ceiling)
    [DefaultDataAccessMode]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_DefaultDataAccessMode] DEFAULT ('UserCeiling'),
    [EmailChannelMode]                      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_EmailChannelMode] DEFAULT ('DraftOnly'),
    [PhoneChannelMode]                      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_PhoneChannelMode] DEFAULT ('InboundOnly'),
    [MessagingChannelMode]                  NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_MessagingChannelMode] DEFAULT ('Enabled'),
    [CalendarChannelMode]                   NVARCHAR(30)     NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_CalendarChannelMode] DEFAULT ('ReadOnly'),
    [AllowInterAgentCoordination]           BIT              NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_AllowInterAgent] DEFAULT (1),

    -- Approval Policy Gates (Enforced by BaseAgent before Action / Tool Execution)
    [RequireApprovalForExternalComms]       BIT              NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_ReqAppExtComms] DEFAULT (1),
    [RequireApprovalForFinancials]          BIT              NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_ReqAppFinancials] DEFAULT (1),
    [RequireApprovalForDestructiveActions]  BIT              NOT NULL CONSTRAINT [DF_AIAgentUserPolicy_ReqAppDestructive] DEFAULT (1),
    [AutoApproveAmountThreshold]            DECIMAL(18, 2)   NULL,

    -- Granular Entity (CRUD/RLS/FLS/Time) & Action (Param/Time) Rules (JSONType interfaces)
    [EntityAccessRules]                     NVARCHAR(MAX)    NULL,
    [ActionPolicyRules]                     NVARCHAR(MAX)    NULL,
    [InstructionsOverride]                  NVARCHAR(MAX)    NULL,

    CONSTRAINT [PK_AIAgentUserPolicy] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_AIAgentUserPolicy_Agent_User] UNIQUE ([AgentID], [UserID]),
    CONSTRAINT [FK_AIAgentUserPolicy_Agent] FOREIGN KEY ([AgentID])
        REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentUserPolicy_User] FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_AIAgentUserPolicy_Persona] FOREIGN KEY ([PreferredPersonaID])
        REFERENCES [${flyway:defaultSchema}].[AIPersona]([ID]),
    CONSTRAINT [CK_AIAgentUserPolicy_Status]
        CHECK ([Status] IN ('Active', 'Paused', 'Disabled')),
    CONSTRAINT [CK_AIAgentUserPolicy_OnboardingStatus]
        CHECK ([OnboardingStatus] IN ('NotStarted', 'InProgress', 'Completed')),
    CONSTRAINT [CK_AIAgentUserPolicy_CoordinationMode]
        CHECK ([CoordinationMode] IN ('Observer', 'Coordinator', 'Autonomous')),
    CONSTRAINT [CK_AIAgentUserPolicy_DefaultDataAccessMode]
        CHECK ([DefaultDataAccessMode] IN ('UserCeiling', 'ReadOnly', 'AllowListOnly')),
    CONSTRAINT [CK_AIAgentUserPolicy_EmailChannelMode]
        CHECK ([EmailChannelMode] IN ('Disabled', 'ReadOnly', 'DraftOnly', 'SendAsAgent', 'SendAsUser')),
    CONSTRAINT [CK_AIAgentUserPolicy_PhoneChannelMode]
        CHECK ([PhoneChannelMode] IN ('Disabled', 'InboundOnly', 'OutboundWithApproval', 'OutboundAutonomous')),
    CONSTRAINT [CK_AIAgentUserPolicy_MessagingChannelMode]
        CHECK ([MessagingChannelMode] IN ('Disabled', 'Enabled')),
    CONSTRAINT [CK_AIAgentUserPolicy_CalendarChannelMode]
        CHECK ([CalendarChannelMode] IN ('Disabled', 'ReadOnly', 'ProposeWithApproval', 'Autonomous')),
    CONSTRAINT [CK_AIAgentUserPolicy_AutoApproveThreshold]
        CHECK ([AutoApproveAmountThreshold] IS NULL OR [AutoApproveAmountThreshold] >= 0)
);
GO

ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] DROP CONSTRAINT [CK_UserRoutine_RoutineType];
GO

ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD CONSTRAINT [CK_UserRoutine_RoutineType]
    CHECK ([RoutineType] IN ('Scheduled', 'Monitoring', 'AgentWake'));
GO

ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ALTER COLUMN [CronExpression] NVARCHAR(100) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD
    [ScheduleMode]      NVARCHAR(20)   NOT NULL CONSTRAINT [DF_UserRoutine_ScheduleMode] DEFAULT ('Recurring'),
    [WakeConfiguration] NVARCHAR(MAX)  NULL,
    [LastCheckedAt]     DATETIMEOFFSET NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD CONSTRAINT [CK_UserRoutine_ScheduleMode]
    CHECK ([ScheduleMode] IN ('Recurring', 'OneShot', 'Adaptive'));
GO

ALTER TABLE [${flyway:defaultSchema}].[UserRoutine] ADD CONSTRAINT [CK_UserRoutine_CronOrOneShot]
    CHECK ([ScheduleMode] = 'OneShot' OR [CronExpression] IS NOT NULL);
GO

ALTER TABLE [${flyway:defaultSchema}].[AIBridgeAgentIdentity] ADD
    [UserID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [FK_AIBridgeAgentIdentity_User] FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[CommunicationProvider] ADD
    [SupportsCalendar]    BIT              NOT NULL CONSTRAINT [DF_CommunicationProvider_SupportsCalendar] DEFAULT (0),
    [SupportsFreeBusy]    BIT              NOT NULL CONSTRAINT [DF_CommunicationProvider_SupportsFreeBusy] DEFAULT (0),
    [EnterpriseScopeMode] NVARCHAR(40)     NOT NULL CONSTRAINT [DF_CommunicationProvider_EnterpriseScopeMode] DEFAULT ('UtilityMailboxesOnly'),
    [AllowedEmailDomains] NVARCHAR(500)    NULL,
    [DefaultCredentialID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[CommunicationProvider] ADD CONSTRAINT [CK_CommunicationProvider_EnterpriseScopeMode]
    CHECK ([EnterpriseScopeMode] IN ('UtilityMailboxesOnly', 'SecurityGroupScoped', 'TenantWide'));
GO

ALTER TABLE [${flyway:defaultSchema}].[CommunicationProvider] ADD CONSTRAINT [FK_CommunicationProvider_DefaultCredential]
    FOREIGN KEY ([DefaultCredentialID]) REFERENCES [${flyway:defaultSchema}].[Credential]([ID]);
GO

UPDATE [${flyway:defaultSchema}].[CommunicationProvider]
SET [SupportsCalendar] = 1, [SupportsFreeBusy] = 1
WHERE [Name] IN ('Microsoft Graph', 'Gmail');
GO

-- =====================================================================================
-- 2. Extended Properties (Descriptions)
-- =====================================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-(Agent, User) policy and personalization record. The owning user''s MJ permissions (Entity CRUD, Role RLS, Role FLS) form the hard ceiling; this table defines strict narrowing rules, channel modes, time windows, and approval gates.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The AI Agent governed by this user policy.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'AgentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The MJ User who owns this policy and under whose security principal the agent executes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional user-personalized display name for this agent (e.g., "Maya" for a user''s Chief of Staff).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'DisplayNameOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional AI Persona selected by the user for this agent''s voice and communication style.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'PreferredPersonaID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Policy lifecycle status: Active, Paused (autonomous wakes suspended), or Disabled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Onboarding progression for this user-agent pair: NotStarted, InProgress, or Completed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'OnboardingStatus';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the user completed onboarding for this agent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'OnboardedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Operating posture: Observer (tracks and reports only; never nudges others), Coordinator (nudges internal task/priority owners and peer CoS agents), or Autonomous (proactively coordinates within approval boundaries).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'CoordinationMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default entity access ceiling when no explicit rule in EntityAccessRules matches: UserCeiling (inherit user''s MJ permissions), ReadOnly (read permitted entities, block all writes unless explicitly allowed), or AllowListOnly (deny all entities not listed in EntityAccessRules).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'DefaultDataAccessMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email channel permission level: Disabled, ReadOnly, DraftOnly, SendAsAgent, or SendAsUser.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'EmailChannelMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Telephony channel permission level: Disabled, InboundOnly, OutboundWithApproval, or OutboundAutonomous.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'PhoneChannelMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Messaging channel permission level (Slack/Teams/In-App): Disabled or Enabled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'MessagingChannelMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calendar channel permission level: Disabled, ReadOnly (check events & free/busy only), ProposeWithApproval (create/modify events or send invites only with explicit user approval), or Autonomous.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'CalendarChannelMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this user''s agent may send or respond to structured coordination requests from other users'' Chief of Staff agents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'AllowInterAgentCoordination';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, any external email, message, or outbound call to non-internal recipients requires explicit user approval via AIAgentRequest.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'RequireApprovalForExternalComms';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, financial commitments, purchases, or accounting/order approvals require explicit user approval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'RequireApprovalForFinancials';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, deleting records or cancelling active workflows requires explicit user approval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'RequireApprovalForDestructiveActions';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional monetary threshold below which low-risk financial actions may proceed when RequireApprovalForFinancials is 0. NULL means no automatic monetary threshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'AutoApproveAmountThreshold';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of IAgentUserEntityAccessRule objects defining per-entity or wildcard CRUD narrowing, additional Row-Level Security (RLS) filters, additional Field-Level Security (FLS) field masks, and allowed time windows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'EntityAccessRules';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of IAgentUserActionPolicyRule objects defining per-action Allow/RequireApproval/Deny policies, SafeExpressionEvaluator parameter conditions, and allowed time windows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'ActionPolicyRules';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional user-specific standing instructions injected into the agent''s system context on every run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentUserPolicy',
    @level2type = N'COLUMN', @level2name = N'InstructionsOverride';

IF EXISTS (SELECT * FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.UserRoutine')
           AND minor_id = (SELECT column_id FROM sys.columns
                          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.UserRoutine')
                          AND name = 'RoutineType')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'UserRoutine',
        @level2type = N'COLUMN', @level2name = N'RoutineType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scheduled (user cron routine), Monitoring (OnChange detection via result hashing), or AgentWake (autonomous agent self-scheduled wake/monitor entry, hidden from the default user cron list).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine',
    @level2type = N'COLUMN', @level2name = N'RoutineType';

IF EXISTS (SELECT * FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.UserRoutine')
           AND minor_id = (SELECT column_id FROM sys.columns
                          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.UserRoutine')
                          AND name = 'CronExpression')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'UserRoutine',
        @level2type = N'COLUMN', @level2name = N'CronExpression';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standard cron expression evaluated by the dispatcher for Recurring and Adaptive routines. NULL when ScheduleMode is OneShot.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine',
    @level2type = N'COLUMN', @level2name = N'CronExpression';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scheduling mode: Recurring (fixed cron schedule), OneShot (single future wake at NextRunAt, auto-disables after firing unless rescheduled by the agent), or Adaptive (fallback CronExpression combined with agent-set NextRunAt and event/condition wake gates).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine',
    @level2type = N'COLUMN', @level2name = N'ScheduleMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON configuration (IRoutineWakeConfiguration) specifying watchedEntities for durable watermark/RecordChange polling and the 3-tier wake gate (Tier 1 SafeExpressionEvaluator, Tier 2 AIDecisionRunner fast decision model, Tier 3 AIPromptRunner metadata prompt).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine',
    @level2type = N'COLUMN', @level2name = N'WakeConfiguration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the dispatcher last evaluated this routine''s watched entities and wake gate conditions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserRoutine',
    @level2type = N'COLUMN', @level2name = N'LastCheckedAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional owning MJ User when this email address, phone DID, or platform account identity is dedicated to a specific user''s personal agent instance (such as their Chief of Staff). NULL for shared/org-wide agent identities.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIBridgeAgentIdentity',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the provider supports calendar event reading, creation, updating, and invitation responses.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommunicationProvider',
    @level2type = N'COLUMN', @level2name = N'SupportsCalendar';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the provider supports checking free/busy schedules and finding optimal meeting times.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommunicationProvider',
    @level2type = N'COLUMN', @level2name = N'SupportsFreeBusy';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Enterprise mailbox scope posture for this provider: UtilityMailboxesOnly (restricted to shared/agent utility mailboxes), SecurityGroupScoped (Exchange RBAC / Workspace group-scoped user mailboxes), or TenantWide.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommunicationProvider',
    @level2type = N'COLUMN', @level2name = N'EnterpriseScopeMode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional comma-separated list of corporate email domains permitted for user-scoped mailbox and calendar operations (e.g., "company.com,subsidiary.com").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommunicationProvider',
    @level2type = N'COLUMN', @level2name = N'AllowedEmailDomains';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional default MJ Credential used by this communication provider when no per-request credential override is supplied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommunicationProvider',
    @level2type = N'COLUMN', @level2name = N'DefaultCredentialID';
GO






















































-- =====================================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- Everything below was produced by `mj codegen` from the hand-written DDL above:
-- Entity/EntityField/EntityPermission/ApplicationEntity rows, regenerated views,
-- spCreate/spUpdate/spDelete procedures, FK indexes, grants and extended properties.
-- If the DDL above changes, re-run CodeGen and replace this whole section.
-- The PostgreSQL counterpart is deferred to the release build.
-- =====================================================================================

/* SQL generated to create new entity MJ: AI Agent User Policies */

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
         '62925804-d598-45a7-a338-b2604ae96f11',
         'MJ: AI Agent User Policies',
         'AI Agent User Policies',
         'Per-(Agent, User) policy and personalization record. The owning user''s MJ permissions (Entity CRUD, Role RLS, Role FLS) form the hard ceiling; this table defines strict narrowing rules, channel modes, time windows, and approval gates.',
         NULL,
         'AIAgentUserPolicy',
         'vwAIAgentUserPolicies',
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

/* SQL generated to add new entity MJ: AI Agent User Policies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '62925804-d598-45a7-a338-b2604ae96f11', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent User Policies for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('62925804-d598-45a7-a338-b2604ae96f11' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('62925804-d598-45a7-a338-b2604ae96f11' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: AI Agent User Policies for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('62925804-d598-45a7-a338-b2604ae96f11' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('62925804-d598-45a7-a338-b2604ae96f11' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: AI Agent User Policies for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('62925804-d598-45a7-a338-b2604ae96f11' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('62925804-d598-45a7-a338-b2604ae96f11' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
UPDATE [${flyway:defaultSchema}].[AIAgentUserPolicy] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] ADD CONSTRAINT [DF___mj_AIAgentUserPolicy___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
UPDATE [${flyway:defaultSchema}].[AIAgentUserPolicy] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentUserPolicy */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentUserPolicy] ADD CONSTRAINT [DF___mj_AIAgentUserPolicy___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 27 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a5a68e7-0e64-4fd3-bc77-202790e665c9' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'ScheduleMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a5a68e7-0e64-4fd3-bc77-202790e665c9',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'),
            'ScheduleMode',
            'Schedule Mode',
            'Scheduling mode: Recurring (fixed cron schedule), OneShot (single future wake at NextRunAt, auto-disables after firing unless rescheduled by the agent), or Adaptive (fallback CronExpression combined with agent-set NextRunAt and event/condition wake gates).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Recurring',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '992d99e1-1981-48f5-9775-b463da7d5a01' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'WakeConfiguration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '992d99e1-1981-48f5-9775-b463da7d5a01',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'),
            'WakeConfiguration',
            'Wake Configuration',
            'Optional JSON configuration (IRoutineWakeConfiguration) specifying watchedEntities for durable watermark/RecordChange polling and the 3-tier wake gate (Tier 1 SafeExpressionEvaluator, Tier 2 AIDecisionRunner fast decision model, Tier 3 AIPromptRunner metadata prompt).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2adae80-f66a-4680-91d4-490929a755a5' OR (EntityID = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND Name = 'LastCheckedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2adae80-f66a-4680-91d4-490929a755a5',
            'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- Entity: MJ: User Routines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'),
            'LastCheckedAt',
            'Last Checked At',
            'Timestamp when the dispatcher last evaluated this routine''s watched entities and wake gate conditions.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef8683e5-db2c-4770-893a-5c34319018b8' OR (EntityID = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef8683e5-db2c-4770-893a-5c34319018b8',
            '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', -- Entity: MJ: AI Bridge Agent Identities
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77'),
            'UserID',
            'User ID',
            'Optional owning MJ User when this email address, phone DID, or platform account identity is dedicated to a specific user''s personal agent instance (such as their Chief of Staff). NULL for shared/org-wide agent identities.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc0d7661-b44e-4b26-979e-c01c0378895d' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc0d7661-b44e-4b26-979e-c01c0378895d',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1fdc4b8-66d0-4fda-b90b-c22634b19645' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'AgentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f1fdc4b8-66d0-4fda-b90b-c22634b19645',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'AgentID',
            'Agent ID',
            'The AI Agent governed by this user policy.',
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
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfa96b9c-36ef-40eb-9d35-fd70d0e31cc3' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cfa96b9c-36ef-40eb-9d35-fd70d0e31cc3',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'UserID',
            'User ID',
            'The MJ User who owns this policy and under whose security principal the agent executes.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6f489e4-a280-406b-8386-200acfb10313' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'DisplayNameOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6f489e4-a280-406b-8386-200acfb10313',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'DisplayNameOverride',
            'Display Name Override',
            'Optional user-personalized display name for this agent (e.g., "Maya" for a user''s Chief of Staff).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95d689f2-dbee-4840-b5df-d6d24a6351a3' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'PreferredPersonaID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '95d689f2-dbee-4840-b5df-d6d24a6351a3',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'PreferredPersonaID',
            'Preferred Persona ID',
            'Optional AI Persona selected by the user for this agent''s voice and communication style.',
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
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47d94cda-2fa2-4c40-a5eb-b32d1371543e' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '47d94cda-2fa2-4c40-a5eb-b32d1371543e',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'Status',
            'Status',
            'Policy lifecycle status: Active, Paused (autonomous wakes suspended), or Disabled.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3de526d0-d6b1-4949-ad40-b21527eb3fae' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'OnboardingStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3de526d0-d6b1-4949-ad40-b21527eb3fae',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'OnboardingStatus',
            'Onboarding Status',
            'Onboarding progression for this user-agent pair: NotStarted, InProgress, or Completed.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'NotStarted',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e849cd39-2905-4cb7-99f5-5be8d71152f5' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'OnboardedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e849cd39-2905-4cb7-99f5-5be8d71152f5',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'OnboardedAt',
            'Onboarded At',
            'Timestamp when the user completed onboarding for this agent.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2588bd34-b6ec-4daa-a21a-c06207a09e2b' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'CoordinationMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2588bd34-b6ec-4daa-a21a-c06207a09e2b',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'CoordinationMode',
            'Coordination Mode',
            'Operating posture: Observer (tracks and reports only; never nudges others), Coordinator (nudges internal task/priority owners and peer CoS agents), or Autonomous (proactively coordinates within approval boundaries).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Observer',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7769baad-00ee-4ae0-84b9-27dbe533f516' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'DefaultDataAccessMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7769baad-00ee-4ae0-84b9-27dbe533f516',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'DefaultDataAccessMode',
            'Default Data Access Mode',
            'Default entity access ceiling when no explicit rule in EntityAccessRules matches: UserCeiling (inherit user''s MJ permissions), ReadOnly (read permitted entities, block all writes unless explicitly allowed), or AllowListOnly (deny all entities not listed in EntityAccessRules).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'UserCeiling',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eed4bc94-5c87-4cf3-a16c-84330f9f1f5e' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'EmailChannelMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eed4bc94-5c87-4cf3-a16c-84330f9f1f5e',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'EmailChannelMode',
            'Email Channel Mode',
            'Email channel permission level: Disabled, ReadOnly, DraftOnly, SendAsAgent, or SendAsUser.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'DraftOnly',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '150bacbb-fe44-4e80-a70b-61c1f426f584' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'PhoneChannelMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '150bacbb-fe44-4e80-a70b-61c1f426f584',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'PhoneChannelMode',
            'Phone Channel Mode',
            'Telephony channel permission level: Disabled, InboundOnly, OutboundWithApproval, or OutboundAutonomous.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'InboundOnly',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7078dbbf-57c3-4da8-81aa-4c3b85f3e173' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'MessagingChannelMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7078dbbf-57c3-4da8-81aa-4c3b85f3e173',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'MessagingChannelMode',
            'Messaging Channel Mode',
            'Messaging channel permission level (Slack/Teams/In-App): Disabled or Enabled.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Enabled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ce2251d-8771-4d1e-9a5c-f38ddca52a15' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'AllowInterAgentCoordination')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7ce2251d-8771-4d1e-9a5c-f38ddca52a15',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'AllowInterAgentCoordination',
            'Allow Inter Agent Coordination',
            'Whether this user''s agent may send or respond to structured coordination requests from other users'' Chief of Staff agents.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffff6f77-0d32-461e-8ddc-6a411ee133f9' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'RequireApprovalForExternalComms')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ffff6f77-0d32-461e-8ddc-6a411ee133f9',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'RequireApprovalForExternalComms',
            'Require Approval For External Comms',
            'When 1, any external email, message, or outbound call to non-internal recipients requires explicit user approval via AIAgentRequest.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86e7e9f3-c1eb-4cc5-bbd2-cb6b4a01f3e9' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'RequireApprovalForFinancials')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86e7e9f3-c1eb-4cc5-bbd2-cb6b4a01f3e9',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'RequireApprovalForFinancials',
            'Require Approval For Financials',
            'When 1, financial commitments, purchases, or accounting/order approvals require explicit user approval.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd382c36a-24c8-43c9-bd74-aa67ead537f2' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'RequireApprovalForDestructiveActions')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd382c36a-24c8-43c9-bd74-aa67ead537f2',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'RequireApprovalForDestructiveActions',
            'Require Approval For Destructive Actions',
            'When 1, deleting records or cancelling active workflows requires explicit user approval.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74497616-64dc-4de8-9d62-ca0ae2c46177' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'AutoApproveAmountThreshold')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74497616-64dc-4de8-9d62-ca0ae2c46177',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'AutoApproveAmountThreshold',
            'Auto Approve Amount Threshold',
            'Optional monetary threshold below which low-risk financial actions may proceed when RequireApprovalForFinancials is 0. NULL means no automatic monetary threshold.',
            'decimal',
            9,
            18,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b99e673-8c44-48f8-b041-39c4699bc194' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'EntityAccessRules')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b99e673-8c44-48f8-b041-39c4699bc194',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'EntityAccessRules',
            'Entity Access Rules',
            'JSON array of IAgentUserEntityAccessRule objects defining per-entity or wildcard CRUD narrowing, additional Row-Level Security (RLS) filters, additional Field-Level Security (FLS) field masks, and allowed time windows.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77acde28-89c4-42f9-b34e-cea7695c88b1' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'ActionPolicyRules')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77acde28-89c4-42f9-b34e-cea7695c88b1',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'ActionPolicyRules',
            'Action Policy Rules',
            'JSON array of IAgentUserActionPolicyRule objects defining per-action Allow/RequireApproval/Deny policies, SafeExpressionEvaluator parameter conditions, and allowed time windows.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '915ccbaf-6129-4da5-a78e-6aa332ef0dcd' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'InstructionsOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '915ccbaf-6129-4da5-a78e-6aa332ef0dcd',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'InstructionsOverride',
            'Instructions Override',
            'Optional user-specific standing instructions injected into the agent''s system context on every run.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '019114d7-9be8-415c-990b-9bf0ba067e59' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '019114d7-9be8-415c-990b-9bf0ba067e59',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4e21cc5-c318-469b-a486-5fe0fb11ac41' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd4e21cc5-c318-469b-a486-5fe0fb11ac41',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
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

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging', @EntityIDs='62925804-D598-45A7-A338-B2604AE96F11,D6CA6018-D288-4F79-B6A9-168C75C3363B,7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', @IncludedSchemaNames='${flyway:defaultSchema}';

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';

/* SQL text to insert entity field value with ID e11e8a9a-e31c-4ba6-adb0-eeedd7faee0a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e11e8a9a-e31c-4ba6-adb0-eeedd7faee0a', '47D94CDA-2FA2-4C40-A5EB-B32D1371543E', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7aa26036-bf9f-485b-b0ae-255e6c2fd481 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7aa26036-bf9f-485b-b0ae-255e6c2fd481', '47D94CDA-2FA2-4C40-A5EB-B32D1371543E', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5ab55fca-f91e-4556-99e5-44b47f289ac6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ab55fca-f91e-4556-99e5-44b47f289ac6', '47D94CDA-2FA2-4C40-A5EB-B32D1371543E', 3, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 47D94CDA-2FA2-4C40-A5EB-B32D1371543E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='47D94CDA-2FA2-4C40-A5EB-B32D1371543E';

/* SQL text to insert entity field value with ID 8ff96dc7-bbf9-4c39-85bb-bdefe1cc2c51 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8ff96dc7-bbf9-4c39-85bb-bdefe1cc2c51', '3DE526D0-D6B1-4949-AD40-B21527EB3FAE', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b694b2d9-e91b-4719-ab81-c12ac13000d1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b694b2d9-e91b-4719-ab81-c12ac13000d1', '3DE526D0-D6B1-4949-AD40-B21527EB3FAE', 2, 'InProgress', 'InProgress', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 998afe34-c3b8-489e-a956-850b760a40ca */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('998afe34-c3b8-489e-a956-850b760a40ca', '3DE526D0-D6B1-4949-AD40-B21527EB3FAE', 3, 'NotStarted', 'NotStarted', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3DE526D0-D6B1-4949-AD40-B21527EB3FAE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3DE526D0-D6B1-4949-AD40-B21527EB3FAE';

/* SQL text to insert entity field value with ID 4f51f9a6-ede6-49a1-b920-a2482974ef5d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f51f9a6-ede6-49a1-b920-a2482974ef5d', '2588BD34-B6EC-4DAA-A21A-C06207A09E2B', 1, 'Autonomous', 'Autonomous', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 79739d82-e160-4a7e-a0b8-2d182349e1e8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('79739d82-e160-4a7e-a0b8-2d182349e1e8', '2588BD34-B6EC-4DAA-A21A-C06207A09E2B', 2, 'Coordinator', 'Coordinator', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c00d6eb3-10a9-4100-94de-b73086bb3086 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c00d6eb3-10a9-4100-94de-b73086bb3086', '2588BD34-B6EC-4DAA-A21A-C06207A09E2B', 3, 'Observer', 'Observer', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2588BD34-B6EC-4DAA-A21A-C06207A09E2B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2588BD34-B6EC-4DAA-A21A-C06207A09E2B';

/* SQL text to insert entity field value with ID 9f2d421a-3712-4b29-840c-dc1027f9ed96 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f2d421a-3712-4b29-840c-dc1027f9ed96', '7769BAAD-00EE-4AE0-84B9-27DBE533F516', 1, 'AllowListOnly', 'AllowListOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 299ffe1d-f5ab-43ab-8a5e-b2c0f644ea14 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('299ffe1d-f5ab-43ab-8a5e-b2c0f644ea14', '7769BAAD-00EE-4AE0-84B9-27DBE533F516', 2, 'ReadOnly', 'ReadOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 05cc9a32-15c1-4c9c-97ed-c6ae65ecd191 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('05cc9a32-15c1-4c9c-97ed-c6ae65ecd191', '7769BAAD-00EE-4AE0-84B9-27DBE533F516', 3, 'UserCeiling', 'UserCeiling', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7769BAAD-00EE-4AE0-84B9-27DBE533F516 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7769BAAD-00EE-4AE0-84B9-27DBE533F516';

/* SQL text to insert entity field value with ID 37dcba8b-4c68-426f-82cb-1aabfd40d62e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37dcba8b-4c68-426f-82cb-1aabfd40d62e', 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E', 1, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d359447d-715c-4ae9-a3f2-2e70ec8aea49 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d359447d-715c-4ae9-a3f2-2e70ec8aea49', 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E', 2, 'DraftOnly', 'DraftOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fe873840-18fc-4636-850f-ed387990446e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe873840-18fc-4636-850f-ed387990446e', 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E', 3, 'ReadOnly', 'ReadOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ae5967a2-3e33-4121-8a35-1e0a4318472d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ae5967a2-3e33-4121-8a35-1e0a4318472d', 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E', 4, 'SendAsAgent', 'SendAsAgent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 96d25015-999a-4ef9-9a5a-5f1dc049f6b6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('96d25015-999a-4ef9-9a5a-5f1dc049f6b6', 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E', 5, 'SendAsUser', 'SendAsUser', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID EED4BC94-5C87-4CF3-A16C-84330F9F1F5E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='EED4BC94-5C87-4CF3-A16C-84330F9F1F5E';

/* SQL text to insert entity field value with ID 5ced1016-35b9-4ed0-ad87-ef07452cfed2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ced1016-35b9-4ed0-ad87-ef07452cfed2', '150BACBB-FE44-4E80-A70B-61C1F426F584', 1, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 294b4a1a-e1cc-4fc7-8f14-65b826647e1f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('294b4a1a-e1cc-4fc7-8f14-65b826647e1f', '150BACBB-FE44-4E80-A70B-61C1F426F584', 2, 'InboundOnly', 'InboundOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b9c3c630-f15b-48cd-85ab-00ac9f24a1ee */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b9c3c630-f15b-48cd-85ab-00ac9f24a1ee', '150BACBB-FE44-4E80-A70B-61C1F426F584', 3, 'OutboundAutonomous', 'OutboundAutonomous', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5ddd0f13-f998-479a-ae96-8516e939a5bd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ddd0f13-f998-479a-ae96-8516e939a5bd', '150BACBB-FE44-4E80-A70B-61C1F426F584', 4, 'OutboundWithApproval', 'OutboundWithApproval', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 150BACBB-FE44-4E80-A70B-61C1F426F584 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='150BACBB-FE44-4E80-A70B-61C1F426F584';

/* SQL text to insert entity field value with ID 0508b291-9bda-4228-a7f6-07cfa4506b7b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0508b291-9bda-4228-a7f6-07cfa4506b7b', '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173', 1, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a3632ec7-7eec-461b-b4c3-3b82a155f70f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a3632ec7-7eec-461b-b4c3-3b82a155f70f', '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173', 2, 'Enabled', 'Enabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7078DBBF-57C3-4DA8-81AA-4C3B85F3E173 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7078DBBF-57C3-4DA8-81AA-4C3B85F3E173';

/* SQL text to insert entity field value with ID 85ca9ab5-374c-4fb0-a80d-3cda85835a8f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('85ca9ab5-374c-4fb0-a80d-3cda85835a8f', '2644D5FA-E13F-4CCD-8C0F-582A223D6790', 1, 'AgentWake', 'AgentWake', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='8077C277-68BA-45C6-B9C2-BCBB70710EEB';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='6E618ABD-DD66-4C80-BA30-889CC2095EA9';

/* SQL text to insert entity field value with ID 46f16318-d89e-4722-9d68-f8dc0c03380b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('46f16318-d89e-4722-9d68-f8dc0c03380b', '3A5A68E7-0E64-4FD3-BC77-202790E665C9', 1, 'Adaptive', 'Adaptive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 22033c3d-a3b1-4266-9925-70783375e46b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22033c3d-a3b1-4266-9925-70783375e46b', '3A5A68E7-0E64-4FD3-BC77-202790E665C9', 2, 'OneShot', 'OneShot', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7c520a85-5c49-4cbf-bad2-9823889b8de4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7c520a85-5c49-4cbf-bad2-9823889b8de4', '3A5A68E7-0E64-4FD3-BC77-202790E665C9', 3, 'Recurring', 'Recurring', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3A5A68E7-0E64-4FD3-BC77-202790E665C9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3A5A68E7-0E64-4FD3-BC77-202790E665C9';

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


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent User Policies (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ca645949-6a87-43d8-a2cc-7bd275a2e759'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ca645949-6a87-43d8-a2cc-7bd275a2e759', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '62925804-D598-45A7-A338-B2604AE96F11', 'AgentID', 'One To Many', 1, 1, 46, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: AI Bridge Agent Identities (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd2febb8a-12a8-4e4d-8f8a-b7ac90a36c0c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d2febb8a-12a8-4e4d-8f8a-b7ac90a36c0c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', 'UserID', 'One To Many', 1, 1, 126, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: AI Agent User Policies (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c9605090-f8ef-4917-9d7d-f9c98f41b6be'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c9605090-f8ef-4917-9d7d-f9c98f41b6be', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '62925804-D598-45A7-A338-B2604AE96F11', 'UserID', 'One To Many', 1, 1, 127, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Personas -> MJ: AI Agent User Policies (One To Many via PreferredPersonaID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '58faf5a5-9351-4535-8539-aea6e710f1ba'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('58faf5a5-9351-4535-8539-aea6e710f1ba', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', '62925804-D598-45A7-A338-B2604AE96F11', 'PreferredPersonaID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';

/* Index for Foreign Keys for AIAgentUserPolicy */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentUserPolicy
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentUserPolicy_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentUserPolicy]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentUserPolicy_AgentID ON [${flyway:defaultSchema}].[AIAgentUserPolicy] ([AgentID]);

-- Index for foreign key UserID in table AIAgentUserPolicy
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentUserPolicy_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentUserPolicy]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentUserPolicy_UserID ON [${flyway:defaultSchema}].[AIAgentUserPolicy] ([UserID]);

-- Index for foreign key PreferredPersonaID in table AIAgentUserPolicy
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentUserPolicy_PreferredPersonaID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentUserPolicy]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentUserPolicy_PreferredPersonaID ON [${flyway:defaultSchema}].[AIAgentUserPolicy] ([PreferredPersonaID]);

/* SQL text to update entity field related entity name field map for entity field ID F1FDC4B8-66D0-4FDA-B90B-C22634B19645 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F1FDC4B8-66D0-4FDA-B90B-C22634B19645', @RelatedEntityNameFieldMap='Agent';

/* Index for Foreign Keys for AIBridgeAgentIdentity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Bridge Agent Identities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIBridgeAgentIdentity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIBridgeAgentIdentity_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIBridgeAgentIdentity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIBridgeAgentIdentity_AgentID ON [${flyway:defaultSchema}].[AIBridgeAgentIdentity] ([AgentID]);

-- Index for foreign key ProviderID in table AIBridgeAgentIdentity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIBridgeAgentIdentity_ProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIBridgeAgentIdentity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIBridgeAgentIdentity_ProviderID ON [${flyway:defaultSchema}].[AIBridgeAgentIdentity] ([ProviderID]);

-- Index for foreign key UserID in table AIBridgeAgentIdentity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIBridgeAgentIdentity_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIBridgeAgentIdentity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIBridgeAgentIdentity_UserID ON [${flyway:defaultSchema}].[AIBridgeAgentIdentity] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID EF8683E5-DB2C-4770-893A-5C34319018B8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EF8683E5-DB2C-4770-893A-5C34319018B8', @RelatedEntityNameFieldMap='User';

/* Base View SQL for MJ: AI Bridge Agent Identities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Bridge Agent Identities
-- Item: vwAIBridgeAgentIdentities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Bridge Agent Identities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIBridgeAgentIdentity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIBridgeAgentIdentities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIBridgeProvider_ProviderID.[Name] AS [Provider],
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[AIBridgeAgentIdentity] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIBridgeProvider] AS MJAIBridgeProvider_ProviderID
  ON
    [a].[ProviderID] = MJAIBridgeProvider_ProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Bridge Agent Identities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Bridge Agent Identities
-- Item: Permissions for vwAIBridgeAgentIdentities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Bridge Agent Identities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Bridge Agent Identities
-- Item: spCreateAIBridgeAgentIdentity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIBridgeAgentIdentity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ProviderID uniqueidentifier,
    @IdentityType nvarchar(20),
    @IdentityValue nvarchar(500),
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
            (
                [ID],
                [AgentID],
                [ProviderID],
                [IdentityType],
                [IdentityValue],
                [DisplayName],
                [IsActive],
                [Configuration],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ProviderID,
                @IdentityType,
                @IdentityValue,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
            (
                [AgentID],
                [ProviderID],
                [IdentityType],
                [IdentityValue],
                [DisplayName],
                [IsActive],
                [Configuration],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ProviderID,
                @IdentityType,
                @IdentityValue,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Bridge Agent Identities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIBridgeAgentIdentity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Bridge Agent Identities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Bridge Agent Identities
-- Item: spUpdateAIBridgeAgentIdentity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIBridgeAgentIdentity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @ProviderID uniqueidentifier = NULL,
    @IdentityType nvarchar(20) = NULL,
    @IdentityValue nvarchar(500) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [ProviderID] = ISNULL(@ProviderID, [ProviderID]),
        [IdentityType] = ISNULL(@IdentityType, [IdentityType]),
        [IdentityValue] = ISNULL(@IdentityValue, [IdentityValue]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIBridgeAgentIdentities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIBridgeAgentIdentity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIBridgeAgentIdentity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIBridgeAgentIdentity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIBridgeAgentIdentity
ON [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIBridgeAgentIdentity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Bridge Agent Identities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIBridgeAgentIdentity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Bridge Agent Identities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Bridge Agent Identities
-- Item: spDeleteAIBridgeAgentIdentity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIBridgeAgentIdentity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Bridge Agent Identities */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID CFA96B9C-36EF-40EB-9D35-FD70D0E31CC3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CFA96B9C-36EF-40EB-9D35-FD70D0E31CC3', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 95D689F2-DBEE-4840-B5DF-D6D24A6351A3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='95D689F2-DBEE-4840-B5DF-D6D24A6351A3', @RelatedEntityNameFieldMap='PreferredPersona';

/* Base View SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: vwAIAgentUserPolicies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent User Policies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentUserPolicy
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentUserPolicies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentUserPolicies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentUserPolicies]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJUser_UserID.[Name] AS [User],
    MJAIPersona_PreferredPersonaID.[Name] AS [PreferredPersona]
FROM
    [${flyway:defaultSchema}].[AIAgentUserPolicy] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPersona] AS MJAIPersona_PreferredPersonaID
  ON
    [a].[PreferredPersonaID] = MJAIPersona_PreferredPersonaID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentUserPolicies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: Permissions for vwAIAgentUserPolicies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentUserPolicies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: spCreateAIAgentUserPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentUserPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentUserPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID uniqueidentifier,
    @DisplayNameOverride_Clear bit = 0,
    @DisplayNameOverride nvarchar(100) = NULL,
    @PreferredPersonaID_Clear bit = 0,
    @PreferredPersonaID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OnboardingStatus nvarchar(20) = NULL,
    @OnboardedAt_Clear bit = 0,
    @OnboardedAt datetimeoffset = NULL,
    @CoordinationMode nvarchar(20) = NULL,
    @DefaultDataAccessMode nvarchar(20) = NULL,
    @EmailChannelMode nvarchar(20) = NULL,
    @PhoneChannelMode nvarchar(20) = NULL,
    @MessagingChannelMode nvarchar(20) = NULL,
    @AllowInterAgentCoordination bit = NULL,
    @RequireApprovalForExternalComms bit = NULL,
    @RequireApprovalForFinancials bit = NULL,
    @RequireApprovalForDestructiveActions bit = NULL,
    @AutoApproveAmountThreshold_Clear bit = 0,
    @AutoApproveAmountThreshold decimal(18, 2) = NULL,
    @EntityAccessRules_Clear bit = 0,
    @EntityAccessRules nvarchar(MAX) = NULL,
    @ActionPolicyRules_Clear bit = 0,
    @ActionPolicyRules nvarchar(MAX) = NULL,
    @InstructionsOverride_Clear bit = 0,
    @InstructionsOverride nvarchar(MAX) = NULL,
    @CalendarChannelMode nvarchar(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentUserPolicy]
            (
                [ID],
                [AgentID],
                [UserID],
                [DisplayNameOverride],
                [PreferredPersonaID],
                [Status],
                [OnboardingStatus],
                [OnboardedAt],
                [CoordinationMode],
                [DefaultDataAccessMode],
                [EmailChannelMode],
                [PhoneChannelMode],
                [MessagingChannelMode],
                [AllowInterAgentCoordination],
                [RequireApprovalForExternalComms],
                [RequireApprovalForFinancials],
                [RequireApprovalForDestructiveActions],
                [AutoApproveAmountThreshold],
                [EntityAccessRules],
                [ActionPolicyRules],
                [InstructionsOverride],
                [CalendarChannelMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @UserID,
                CASE WHEN @DisplayNameOverride_Clear = 1 THEN NULL ELSE ISNULL(@DisplayNameOverride, NULL) END,
                CASE WHEN @PreferredPersonaID_Clear = 1 THEN NULL ELSE ISNULL(@PreferredPersonaID, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@OnboardingStatus, 'NotStarted'),
                CASE WHEN @OnboardedAt_Clear = 1 THEN NULL ELSE ISNULL(@OnboardedAt, NULL) END,
                ISNULL(@CoordinationMode, 'Observer'),
                ISNULL(@DefaultDataAccessMode, 'UserCeiling'),
                ISNULL(@EmailChannelMode, 'DraftOnly'),
                ISNULL(@PhoneChannelMode, 'InboundOnly'),
                ISNULL(@MessagingChannelMode, 'Enabled'),
                ISNULL(@AllowInterAgentCoordination, 1),
                ISNULL(@RequireApprovalForExternalComms, 1),
                ISNULL(@RequireApprovalForFinancials, 1),
                ISNULL(@RequireApprovalForDestructiveActions, 1),
                CASE WHEN @AutoApproveAmountThreshold_Clear = 1 THEN NULL ELSE ISNULL(@AutoApproveAmountThreshold, NULL) END,
                CASE WHEN @EntityAccessRules_Clear = 1 THEN NULL ELSE ISNULL(@EntityAccessRules, NULL) END,
                CASE WHEN @ActionPolicyRules_Clear = 1 THEN NULL ELSE ISNULL(@ActionPolicyRules, NULL) END,
                CASE WHEN @InstructionsOverride_Clear = 1 THEN NULL ELSE ISNULL(@InstructionsOverride, NULL) END,
                ISNULL(@CalendarChannelMode, 'ReadOnly')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentUserPolicy]
            (
                [AgentID],
                [UserID],
                [DisplayNameOverride],
                [PreferredPersonaID],
                [Status],
                [OnboardingStatus],
                [OnboardedAt],
                [CoordinationMode],
                [DefaultDataAccessMode],
                [EmailChannelMode],
                [PhoneChannelMode],
                [MessagingChannelMode],
                [AllowInterAgentCoordination],
                [RequireApprovalForExternalComms],
                [RequireApprovalForFinancials],
                [RequireApprovalForDestructiveActions],
                [AutoApproveAmountThreshold],
                [EntityAccessRules],
                [ActionPolicyRules],
                [InstructionsOverride],
                [CalendarChannelMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @UserID,
                CASE WHEN @DisplayNameOverride_Clear = 1 THEN NULL ELSE ISNULL(@DisplayNameOverride, NULL) END,
                CASE WHEN @PreferredPersonaID_Clear = 1 THEN NULL ELSE ISNULL(@PreferredPersonaID, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@OnboardingStatus, 'NotStarted'),
                CASE WHEN @OnboardedAt_Clear = 1 THEN NULL ELSE ISNULL(@OnboardedAt, NULL) END,
                ISNULL(@CoordinationMode, 'Observer'),
                ISNULL(@DefaultDataAccessMode, 'UserCeiling'),
                ISNULL(@EmailChannelMode, 'DraftOnly'),
                ISNULL(@PhoneChannelMode, 'InboundOnly'),
                ISNULL(@MessagingChannelMode, 'Enabled'),
                ISNULL(@AllowInterAgentCoordination, 1),
                ISNULL(@RequireApprovalForExternalComms, 1),
                ISNULL(@RequireApprovalForFinancials, 1),
                ISNULL(@RequireApprovalForDestructiveActions, 1),
                CASE WHEN @AutoApproveAmountThreshold_Clear = 1 THEN NULL ELSE ISNULL(@AutoApproveAmountThreshold, NULL) END,
                CASE WHEN @EntityAccessRules_Clear = 1 THEN NULL ELSE ISNULL(@EntityAccessRules, NULL) END,
                CASE WHEN @ActionPolicyRules_Clear = 1 THEN NULL ELSE ISNULL(@ActionPolicyRules, NULL) END,
                CASE WHEN @InstructionsOverride_Clear = 1 THEN NULL ELSE ISNULL(@InstructionsOverride, NULL) END,
                ISNULL(@CalendarChannelMode, 'ReadOnly')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentUserPolicies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent User Policies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: spUpdateAIAgentUserPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentUserPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @DisplayNameOverride_Clear bit = 0,
    @DisplayNameOverride nvarchar(100) = NULL,
    @PreferredPersonaID_Clear bit = 0,
    @PreferredPersonaID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OnboardingStatus nvarchar(20) = NULL,
    @OnboardedAt_Clear bit = 0,
    @OnboardedAt datetimeoffset = NULL,
    @CoordinationMode nvarchar(20) = NULL,
    @DefaultDataAccessMode nvarchar(20) = NULL,
    @EmailChannelMode nvarchar(20) = NULL,
    @PhoneChannelMode nvarchar(20) = NULL,
    @MessagingChannelMode nvarchar(20) = NULL,
    @AllowInterAgentCoordination bit = NULL,
    @RequireApprovalForExternalComms bit = NULL,
    @RequireApprovalForFinancials bit = NULL,
    @RequireApprovalForDestructiveActions bit = NULL,
    @AutoApproveAmountThreshold_Clear bit = 0,
    @AutoApproveAmountThreshold decimal(18, 2) = NULL,
    @EntityAccessRules_Clear bit = 0,
    @EntityAccessRules nvarchar(MAX) = NULL,
    @ActionPolicyRules_Clear bit = 0,
    @ActionPolicyRules nvarchar(MAX) = NULL,
    @InstructionsOverride_Clear bit = 0,
    @InstructionsOverride nvarchar(MAX) = NULL,
    @CalendarChannelMode nvarchar(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentUserPolicy]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [DisplayNameOverride] = CASE WHEN @DisplayNameOverride_Clear = 1 THEN NULL ELSE ISNULL(@DisplayNameOverride, [DisplayNameOverride]) END,
        [PreferredPersonaID] = CASE WHEN @PreferredPersonaID_Clear = 1 THEN NULL ELSE ISNULL(@PreferredPersonaID, [PreferredPersonaID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [OnboardingStatus] = ISNULL(@OnboardingStatus, [OnboardingStatus]),
        [OnboardedAt] = CASE WHEN @OnboardedAt_Clear = 1 THEN NULL ELSE ISNULL(@OnboardedAt, [OnboardedAt]) END,
        [CoordinationMode] = ISNULL(@CoordinationMode, [CoordinationMode]),
        [DefaultDataAccessMode] = ISNULL(@DefaultDataAccessMode, [DefaultDataAccessMode]),
        [EmailChannelMode] = ISNULL(@EmailChannelMode, [EmailChannelMode]),
        [PhoneChannelMode] = ISNULL(@PhoneChannelMode, [PhoneChannelMode]),
        [MessagingChannelMode] = ISNULL(@MessagingChannelMode, [MessagingChannelMode]),
        [AllowInterAgentCoordination] = ISNULL(@AllowInterAgentCoordination, [AllowInterAgentCoordination]),
        [RequireApprovalForExternalComms] = ISNULL(@RequireApprovalForExternalComms, [RequireApprovalForExternalComms]),
        [RequireApprovalForFinancials] = ISNULL(@RequireApprovalForFinancials, [RequireApprovalForFinancials]),
        [RequireApprovalForDestructiveActions] = ISNULL(@RequireApprovalForDestructiveActions, [RequireApprovalForDestructiveActions]),
        [AutoApproveAmountThreshold] = CASE WHEN @AutoApproveAmountThreshold_Clear = 1 THEN NULL ELSE ISNULL(@AutoApproveAmountThreshold, [AutoApproveAmountThreshold]) END,
        [EntityAccessRules] = CASE WHEN @EntityAccessRules_Clear = 1 THEN NULL ELSE ISNULL(@EntityAccessRules, [EntityAccessRules]) END,
        [ActionPolicyRules] = CASE WHEN @ActionPolicyRules_Clear = 1 THEN NULL ELSE ISNULL(@ActionPolicyRules, [ActionPolicyRules]) END,
        [InstructionsOverride] = CASE WHEN @InstructionsOverride_Clear = 1 THEN NULL ELSE ISNULL(@InstructionsOverride, [InstructionsOverride]) END,
        [CalendarChannelMode] = ISNULL(@CalendarChannelMode, [CalendarChannelMode])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentUserPolicies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentUserPolicies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentUserPolicy table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentUserPolicy]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentUserPolicy];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentUserPolicy
ON [${flyway:defaultSchema}].[AIAgentUserPolicy]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentUserPolicy]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentUserPolicy] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent User Policies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent User Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent User Policies
-- Item: spDeleteAIAgentUserPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentUserPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentUserPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentUserPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentUserPolicy]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentUserPolicy]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent User Policies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentUserPolicy] TO [cdp_Developer], [cdp_Integration];

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

-- Index for foreign key ConversationID in table UserRoutine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRoutine_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRoutine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRoutine_ConversationID ON [${flyway:defaultSchema}].[UserRoutine] ([ConversationID]);

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
    MJTemplate_NotificationTemplateID.[Name] AS [NotificationTemplate],
    MJConversation_ConversationID.[Name] AS [Conversation]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [u].[ConversationID] = MJConversation_ConversationID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwUserRoutines] FROM [cdp_UI]
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
    @CronExpression_Clear bit = 0,
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
    @NotifyViaEmail bit = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @ScheduleMode nvarchar(20) = NULL,
    @WakeConfiguration_Clear bit = 0,
    @WakeConfiguration nvarchar(MAX) = NULL,
    @LastCheckedAt_Clear bit = 0,
    @LastCheckedAt datetimeoffset = NULL
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
                [NotifyViaEmail],
                [ConversationID],
                [ScheduleMode],
                [WakeConfiguration],
                [LastCheckedAt]
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
                CASE WHEN @CronExpression_Clear = 1 THEN NULL ELSE ISNULL(@CronExpression, NULL) END,
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
                ISNULL(@NotifyViaEmail, 0),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                ISNULL(@ScheduleMode, 'Recurring'),
                CASE WHEN @WakeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@WakeConfiguration, NULL) END,
                CASE WHEN @LastCheckedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastCheckedAt, NULL) END
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
                [NotifyViaEmail],
                [ConversationID],
                [ScheduleMode],
                [WakeConfiguration],
                [LastCheckedAt]
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
                CASE WHEN @CronExpression_Clear = 1 THEN NULL ELSE ISNULL(@CronExpression, NULL) END,
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
                ISNULL(@NotifyViaEmail, 0),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                ISNULL(@ScheduleMode, 'Recurring'),
                CASE WHEN @WakeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@WakeConfiguration, NULL) END,
                CASE WHEN @LastCheckedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastCheckedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRoutines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: User Routines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRoutine] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
    @CronExpression_Clear bit = 0,
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
    @NotifyViaEmail bit = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @ScheduleMode nvarchar(20) = NULL,
    @WakeConfiguration_Clear bit = 0,
    @WakeConfiguration nvarchar(MAX) = NULL,
    @LastCheckedAt_Clear bit = 0,
    @LastCheckedAt datetimeoffset = NULL
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
        [CronExpression] = CASE WHEN @CronExpression_Clear = 1 THEN NULL ELSE ISNULL(@CronExpression, [CronExpression]) END,
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
        [NotifyViaEmail] = ISNULL(@NotifyViaEmail, [NotifyViaEmail]),
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END,
        [ScheduleMode] = ISNULL(@ScheduleMode, [ScheduleMode]),
        [WakeConfiguration] = CASE WHEN @WakeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@WakeConfiguration, [WakeConfiguration]) END,
        [LastCheckedAt] = CASE WHEN @LastCheckedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastCheckedAt, [LastCheckedAt]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRoutine] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: User Routines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRoutine] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt, @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationIDID, @AgentID = @MJAIAgentExamples_SourceConversationID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentExamples_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationID_Comments, @Status = @MJAIAgentExamples_SourceConversationID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationID_ExpiresAt, @EmbeddingVectorBinary = @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt, @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceConversationID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore, @MJAIAgentNotes_SourceConversationID_AuthorType, @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationIDID, @AgentID = @MJAIAgentNotes_SourceConversationID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationID_Note, @UserID = @MJAIAgentNotes_SourceConversationID_UserID, @Type = @MJAIAgentNotes_SourceConversationID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationID_Comments, @Status = @MJAIAgentNotes_SourceConversationID_Status, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentNotes_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceConversationID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore, @MJAIAgentNotes_SourceConversationID_AuthorType, @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_Success bit
    DECLARE @MJAIAgentRuns_ConversationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PlanMode bit
    DECLARE @MJAIAgentRuns_ConversationID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationIDID, @AgentID = @MJAIAgentRuns_ConversationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationID_ParentRunID, @Status = @MJAIAgentRuns_ConversationID_Status, @StartedAt = @MJAIAgentRuns_ConversationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationID_CompletedAt, @Success = @MJAIAgentRuns_ConversationID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationID_ErrorMessage, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentRuns_ConversationID_ConversationID, @UserID = @MJAIAgentRuns_ConversationID_UserID, @Result = @MJAIAgentRuns_ConversationID_Result, @AgentState = @MJAIAgentRuns_ConversationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationID_FinalPayload, @Message = @MJAIAgentRuns_ConversationID_Message, @LastRunID = @MJAIAgentRuns_ConversationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationID_Data, @Verbose = @MJAIAgentRuns_ConversationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationID_RunName, @Comments = @MJAIAgentRuns_ConversationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ConversationID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ConversationID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationID_cursor
    
    -- Cascade update on AIAgentSession using cursor to call spUpdateAIAgentSession
    DECLARE @MJAIAgentSessions_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LastSessionID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_HostInstanceID nvarchar(200)
    DECLARE @MJAIAgentSessions_ConversationID_Config nvarchar(MAX)
    DECLARE @MJAIAgentSessions_ConversationID_LastActiveAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_ClosedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_CloseReason nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingMedia nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingStartedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedRecordID nvarchar(500)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingStatus nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingExpectedShards int
    DECLARE @MJAIAgentSessions_ConversationID_RecordingCapturedSamples bigint
    DECLARE @MJAIAgentSessions_ConversationID_RecordingGaps nvarchar(MAX)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion int
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason], [RecordingMedia], [RecordingStartedAt], [RecordingFileID], [LinkedEntityID], [LinkedRecordID], [RecordingStatus], [RecordingExpectedShards], [RecordingCapturedSamples], [RecordingGaps], [RecordingAssemblyVersion]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID, @MJAIAgentSessions_ConversationID_RecordingStatus, @MJAIAgentSessions_ConversationID_RecordingExpectedShards, @MJAIAgentSessions_ConversationID_RecordingCapturedSamples, @MJAIAgentSessions_ConversationID_RecordingGaps, @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason, @RecordingMedia = @MJAIAgentSessions_ConversationID_RecordingMedia, @RecordingStartedAt = @MJAIAgentSessions_ConversationID_RecordingStartedAt, @RecordingFileID = @MJAIAgentSessions_ConversationID_RecordingFileID, @LinkedEntityID = @MJAIAgentSessions_ConversationID_LinkedEntityID, @LinkedRecordID = @MJAIAgentSessions_ConversationID_LinkedRecordID, @RecordingStatus = @MJAIAgentSessions_ConversationID_RecordingStatus, @RecordingExpectedShards = @MJAIAgentSessions_ConversationID_RecordingExpectedShards, @RecordingCapturedSamples = @MJAIAgentSessions_ConversationID_RecordingCapturedSamples, @RecordingGaps = @MJAIAgentSessions_ConversationID_RecordingGaps, @RecordingAssemblyVersion = @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID, @MJAIAgentSessions_ConversationID_RecordingStatus, @MJAIAgentSessions_ConversationID_RecordingExpectedShards, @MJAIAgentSessions_ConversationID_RecordingCapturedSamples, @MJAIAgentSessions_ConversationID_RecordingGaps, @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion
    END

    CLOSE cascade_update_MJAIAgentSessions_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentSessions_ConversationID_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJConversationArtifacts_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifacts_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationArtifacts_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJConversationArtifacts_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    
    -- Cascade delete from ConversationBranch using cursor to call spDeleteConversationBranch
    DECLARE @MJConversationBranches_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationBranches_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationBranch]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationBranches_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationBranches_ConversationID_cursor INTO @MJConversationBranches_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationBranch] @ID = @MJConversationBranches_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationBranches_ConversationID_cursor INTO @MJConversationBranches_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationBranches_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationBranches_ConversationID_cursor
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @MJConversationDetails_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetails_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationDetails_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @MJConversationDetails_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationDetails_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationDetails_ConversationID_cursor
    
    -- Cascade delete from ConversationSkill using cursor to call spDeleteConversationSkill
    DECLARE @MJConversationSkills_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationSkills_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationSkill]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationSkills_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationSkills_ConversationID_cursor INTO @MJConversationSkills_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationSkill] @ID = @MJConversationSkills_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationSkills_ConversationID_cursor INTO @MJConversationSkills_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationSkills_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationSkills_ConversationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_LastConversationIDID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_UserID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_LastConversationID_Name nvarchar(255)
    DECLARE @MJConversations_LastConversationID_Description nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_Type nvarchar(50)
    DECLARE @MJConversations_LastConversationID_IsArchived bit
    DECLARE @MJConversations_LastConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_LastConversationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_Status nvarchar(20)
    DECLARE @MJConversations_LastConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_IsPinned bit
    DECLARE @MJConversations_LastConversationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_LastConversationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_EgressID nvarchar(255)
    DECLARE @MJConversations_LastConversationID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_LastConversationID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_LastConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [LastConversationID] = @ID

    OPEN cascade_update_MJConversations_LastConversationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_Type, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_LastConversationID_LastConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_LastConversationIDID, @UserID = @MJConversations_LastConversationID_UserID, @ExternalID = @MJConversations_LastConversationID_ExternalID, @Name = @MJConversations_LastConversationID_Name, @Description = @MJConversations_LastConversationID_Description, @Type = @MJConversations_LastConversationID_Type, @IsArchived = @MJConversations_LastConversationID_IsArchived, @LinkedEntityID = @MJConversations_LastConversationID_LinkedEntityID, @LinkedRecordID = @MJConversations_LastConversationID_LinkedRecordID, @DataContextID = @MJConversations_LastConversationID_DataContextID, @Status = @MJConversations_LastConversationID_Status, @EnvironmentID = @MJConversations_LastConversationID_EnvironmentID, @ProjectID = @MJConversations_LastConversationID_ProjectID, @IsPinned = @MJConversations_LastConversationID_IsPinned, @TestRunID = @MJConversations_LastConversationID_TestRunID, @ApplicationScope = @MJConversations_LastConversationID_ApplicationScope, @ApplicationID = @MJConversations_LastConversationID_ApplicationID, @DefaultAgentID = @MJConversations_LastConversationID_DefaultAgentID, @AdditionalData = @MJConversations_LastConversationID_AdditionalData, @RecordingFileID = @MJConversations_LastConversationID_RecordingFileID, @EgressID = @MJConversations_LastConversationID_EgressID, @VisitorKey = @MJConversations_LastConversationID_VisitorKey, @LastConversationID_Clear = 1, @LastConversationID = @MJConversations_LastConversationID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_Type, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_LastConversationID_cursor
    DEALLOCATE cascade_update_MJConversations_LastConversationID_cursor
    
    -- Cascade update on Meeting using cursor to call spUpdateMeeting
    DECLARE @MJMeetings_ConversationIDID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_Title nvarchar(255)
    DECLARE @MJMeetings_ConversationID_Description nvarchar(MAX)
    DECLARE @MJMeetings_ConversationID_HostUserID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_RoomName nvarchar(255)
    DECLARE @MJMeetings_ConversationID_Status nvarchar(20)
    DECLARE @MJMeetings_ConversationID_ScheduledStartAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_ScheduledEndAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_StartedAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_EndedAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_AllowPhoneDialIn bit
    DECLARE @MJMeetings_ConversationID_DialInPhoneNumberID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_DialInCode nvarchar(20)
    DECLARE @MJMeetings_ConversationID_RecordingPolicy nvarchar(20)
    DECLARE @MJMeetings_ConversationID_ConversationID uniqueidentifier
    DECLARE cascade_update_MJMeetings_ConversationID_cursor CURSOR FOR
        SELECT [ID], [Title], [Description], [HostUserID], [RoomName], [Status], [ScheduledStartAt], [ScheduledEndAt], [StartedAt], [EndedAt], [AllowPhoneDialIn], [DialInPhoneNumberID], [DialInCode], [RecordingPolicy], [ConversationID]
        FROM [${flyway:defaultSchema}].[Meeting]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJMeetings_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJMeetings_ConversationID_cursor INTO @MJMeetings_ConversationIDID, @MJMeetings_ConversationID_Title, @MJMeetings_ConversationID_Description, @MJMeetings_ConversationID_HostUserID, @MJMeetings_ConversationID_RoomName, @MJMeetings_ConversationID_Status, @MJMeetings_ConversationID_ScheduledStartAt, @MJMeetings_ConversationID_ScheduledEndAt, @MJMeetings_ConversationID_StartedAt, @MJMeetings_ConversationID_EndedAt, @MJMeetings_ConversationID_AllowPhoneDialIn, @MJMeetings_ConversationID_DialInPhoneNumberID, @MJMeetings_ConversationID_DialInCode, @MJMeetings_ConversationID_RecordingPolicy, @MJMeetings_ConversationID_ConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMeetings_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMeeting] @ID = @MJMeetings_ConversationIDID, @Title = @MJMeetings_ConversationID_Title, @Description = @MJMeetings_ConversationID_Description, @HostUserID = @MJMeetings_ConversationID_HostUserID, @RoomName = @MJMeetings_ConversationID_RoomName, @Status = @MJMeetings_ConversationID_Status, @ScheduledStartAt = @MJMeetings_ConversationID_ScheduledStartAt, @ScheduledEndAt = @MJMeetings_ConversationID_ScheduledEndAt, @StartedAt = @MJMeetings_ConversationID_StartedAt, @EndedAt = @MJMeetings_ConversationID_EndedAt, @AllowPhoneDialIn = @MJMeetings_ConversationID_AllowPhoneDialIn, @DialInPhoneNumberID = @MJMeetings_ConversationID_DialInPhoneNumberID, @DialInCode = @MJMeetings_ConversationID_DialInCode, @RecordingPolicy = @MJMeetings_ConversationID_RecordingPolicy, @ConversationID_Clear = 1, @ConversationID = @MJMeetings_ConversationID_ConversationID

        FETCH NEXT FROM cascade_update_MJMeetings_ConversationID_cursor INTO @MJMeetings_ConversationIDID, @MJMeetings_ConversationID_Title, @MJMeetings_ConversationID_Description, @MJMeetings_ConversationID_HostUserID, @MJMeetings_ConversationID_RoomName, @MJMeetings_ConversationID_Status, @MJMeetings_ConversationID_ScheduledStartAt, @MJMeetings_ConversationID_ScheduledEndAt, @MJMeetings_ConversationID_StartedAt, @MJMeetings_ConversationID_EndedAt, @MJMeetings_ConversationID_AllowPhoneDialIn, @MJMeetings_ConversationID_DialInPhoneNumberID, @MJMeetings_ConversationID_DialInCode, @MJMeetings_ConversationID_RecordingPolicy, @MJMeetings_ConversationID_ConversationID
    END

    CLOSE cascade_update_MJMeetings_ConversationID_cursor
    DEALLOCATE cascade_update_MJMeetings_ConversationID_cursor
    
    -- Cascade update on UserRoutine using cursor to call spUpdateUserRoutine
    DECLARE @MJUserRoutines_ConversationIDID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_UserID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_Name nvarchar(255)
    DECLARE @MJUserRoutines_ConversationID_Description nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_Status nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_RoutineType nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_TargetType nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_TargetID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_InitialMessage nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_RequestedSkillIDs nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_CronExpression nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_StartAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_EndAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_NotificationTemplateID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_Timezone nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_NextRunAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_LastRunAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_LastRunStatus nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_LastResultHash nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_NotifyCondition nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_NotifyViaInApp bit
    DECLARE @MJUserRoutines_ConversationID_NotifyViaEmail bit
    DECLARE @MJUserRoutines_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_ScheduleMode nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_WakeConfiguration nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_LastCheckedAt datetimeoffset
    DECLARE cascade_update_MJUserRoutines_ConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [EnvironmentID], [Name], [Description], [Status], [RoutineType], [TargetType], [TargetID], [InitialMessage], [StartingPayload], [RequestedSkillIDs], [CronExpression], [StartAt], [EndAt], [NotificationTemplateID], [Timezone], [NextRunAt], [LastRunAt], [LastRunStatus], [LastResultHash], [NotifyCondition], [NotifyViaInApp], [NotifyViaEmail], [ConversationID], [ScheduleMode], [WakeConfiguration], [LastCheckedAt]
        FROM [${flyway:defaultSchema}].[UserRoutine]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJUserRoutines_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID, @MJUserRoutines_ConversationID_ScheduleMode, @MJUserRoutines_ConversationID_WakeConfiguration, @MJUserRoutines_ConversationID_LastCheckedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutines_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutine] @ID = @MJUserRoutines_ConversationIDID, @UserID = @MJUserRoutines_ConversationID_UserID, @EnvironmentID = @MJUserRoutines_ConversationID_EnvironmentID, @Name = @MJUserRoutines_ConversationID_Name, @Description = @MJUserRoutines_ConversationID_Description, @Status = @MJUserRoutines_ConversationID_Status, @RoutineType = @MJUserRoutines_ConversationID_RoutineType, @TargetType = @MJUserRoutines_ConversationID_TargetType, @TargetID = @MJUserRoutines_ConversationID_TargetID, @InitialMessage = @MJUserRoutines_ConversationID_InitialMessage, @StartingPayload = @MJUserRoutines_ConversationID_StartingPayload, @RequestedSkillIDs = @MJUserRoutines_ConversationID_RequestedSkillIDs, @CronExpression = @MJUserRoutines_ConversationID_CronExpression, @StartAt = @MJUserRoutines_ConversationID_StartAt, @EndAt = @MJUserRoutines_ConversationID_EndAt, @NotificationTemplateID = @MJUserRoutines_ConversationID_NotificationTemplateID, @Timezone = @MJUserRoutines_ConversationID_Timezone, @NextRunAt = @MJUserRoutines_ConversationID_NextRunAt, @LastRunAt = @MJUserRoutines_ConversationID_LastRunAt, @LastRunStatus = @MJUserRoutines_ConversationID_LastRunStatus, @LastResultHash = @MJUserRoutines_ConversationID_LastResultHash, @NotifyCondition = @MJUserRoutines_ConversationID_NotifyCondition, @NotifyViaInApp = @MJUserRoutines_ConversationID_NotifyViaInApp, @NotifyViaEmail = @MJUserRoutines_ConversationID_NotifyViaEmail, @ConversationID_Clear = 1, @ConversationID = @MJUserRoutines_ConversationID_ConversationID, @ScheduleMode = @MJUserRoutines_ConversationID_ScheduleMode, @WakeConfiguration = @MJUserRoutines_ConversationID_WakeConfiguration, @LastCheckedAt = @MJUserRoutines_ConversationID_LastCheckedAt

        FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID, @MJUserRoutines_ConversationID_ScheduleMode, @MJUserRoutines_ConversationID_WakeConfiguration, @MJUserRoutines_ConversationID_LastCheckedAt
    END

    CLOSE cascade_update_MJUserRoutines_ConversationID_cursor
    DEALLOCATE cascade_update_MJUserRoutines_ConversationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_DeclareAsNativeTool bit
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID], [DeclareAsNativeTool]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID, @MJAIAgentActions_AgentID_DeclareAsNativeTool

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID, @DeclareAsNativeTool = @MJAIAgentActions_AgentID_DeclareAsNativeTool

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID, @MJAIAgentActions_AgentID_DeclareAsNativeTool
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_CoAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [CoAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCoAgent] @ID = @MJAIAgentCoAgents_CoAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_TargetAgentIDID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_CoAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Type nvarchar(30)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_IsDefault bit
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Sequence int
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor CURSOR FOR
        SELECT [ID], [CoAgentID], [TargetAgentID], [TargetAgentTypeID], [Type], [IsDefault], [Sequence], [Status], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [TargetAgentID] = @ID

    OPEN cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentCoAgents_TargetAgentID_TargetAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentCoAgent] @ID = @MJAIAgentCoAgents_TargetAgentIDID, @CoAgentID = @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @TargetAgentID_Clear = 1, @TargetAgentID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @TargetAgentTypeID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @Type = @MJAIAgentCoAgents_TargetAgentID_Type, @IsDefault = @MJAIAgentCoAgents_TargetAgentID_IsDefault, @Sequence = @MJAIAgentCoAgents_TargetAgentID_Sequence, @Status = @MJAIAgentCoAgents_TargetAgentID_Status, @Configuration = @MJAIAgentCoAgents_TargetAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentCredential using cursor to call spDeleteAIAgentCredential
    DECLARE @MJAIAgentCredentials_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCredentials_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCredential]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCredentials_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCredential] @ID = @MJAIAgentCredentials_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_AgentID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType, @MJAIAgentNotes_AgentID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore, @AuthorType = @MJAIAgentNotes_AgentID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_AgentID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType, @MJAIAgentNotes_AgentID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPersona using cursor to call spDeleteAIAgentPersona
    DECLARE @MJAIAgentPersonas_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPersonas_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPersona]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPersonas_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPersona] @ID = @MJAIAgentPersonas_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRubric using cursor to call spDeleteAIAgentRubric
    DECLARE @MJAIAgentRubrics_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRubrics_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRubric]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRubrics_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRubrics_AgentID_cursor INTO @MJAIAgentRubrics_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRubric] @ID = @MJAIAgentRubrics_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRubrics_AgentID_cursor INTO @MJAIAgentRubrics_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRubrics_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRubrics_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession
    DECLARE @MJAIAgentSessions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSessions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSessions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSession] @ID = @MJAIAgentSessions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSessions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSessions_AgentID_cursor
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill
    DECLARE @MJAIAgentSkills_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSkills_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSkill]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSkills_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSkill] @ID = @MJAIAgentSkills_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSkills_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSkills_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade delete from AIAgentUserPolicy using cursor to call spDeleteAIAgentUserPolicy
    DECLARE @MJAIAgentUserPolicies_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentUserPolicies_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentUserPolicy]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentUserPolicies_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentUserPolicies_AgentID_cursor INTO @MJAIAgentUserPolicies_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentUserPolicy] @ID = @MJAIAgentUserPolicies_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentUserPolicies_AgentID_cursor INTO @MJAIAgentUserPolicies_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentUserPolicies_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentUserPolicies_AgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ParentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ParentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ParentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ParentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ParentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RequirePlanMode bit
    DECLARE @MJAIAgents_ParentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ParentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ParentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ParentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ParentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ParentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ParentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ParentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ParentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ParentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ParentID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_DefaultCoAgentIDID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Name nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ExposeAsAction bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionOrder int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_EnableContextCompression bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Status nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_DefaultCoAgentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTimePerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_DefaultCoAgentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectNotes bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxNotesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectExamples bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_IsRestricted bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxMessages int
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RequirePlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity
    DECLARE @MJAIBridgeAgentIdentities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] @ID = @MJAIBridgeAgentIdentities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_AgentID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_AgentID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID, @MJAIPromptRuns_AgentID_ToolCallingMode, @MJAIPromptRuns_AgentID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_AgentID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_AgentID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_AgentID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_AgentID_ToolCallingMode, @UserID = @MJAIPromptRuns_AgentID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID, @MJAIPromptRuns_AgentID_ToolCallingMode, @MJAIPromptRuns_AgentID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary(MAX)
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent
    DECLARE @MJAISkillSubAgents_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillSubAgent]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] @ID = @MJAISkillSubAgents_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_AgentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_AgentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_AgentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_AgentID_MediaType nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_BranchID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ReplacedAt datetimeoffset
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType], [BranchID], [ReplacedAt]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType, @MJConversationDetails_AgentID_BranchID, @MJConversationDetails_AgentID_ReplacedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_AgentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_AgentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_AgentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_AgentID_UtteranceEndMs, @MediaType = @MJConversationDetails_AgentID_MediaType, @BranchID = @MJConversationDetails_AgentID_BranchID, @ReplacedAt = @MJConversationDetails_AgentID_ReplacedAt

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType, @MJConversationDetails_AgentID_BranchID, @MJConversationDetails_AgentID_ReplacedAt
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_PinnedAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [PinnedAgentID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_PinnedAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_DefaultAgentIDID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_UserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ExternalID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_Name nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_Description nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_Type nvarchar(50)
    DECLARE @MJConversations_DefaultAgentID_IsArchived bit
    DECLARE @MJConversations_DefaultAgentID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_DataContextID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_Status nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ProjectID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_IsPinned bit
    DECLARE @MJConversations_DefaultAgentID_TestRunID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_EgressID nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @LastConversationID = @MJConversations_DefaultAgentID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningAgentIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningAgentID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningAgentIDID, @Name = @MJEntityDocuments_ReasoningAgentID_Name, @TypeID = @MJEntityDocuments_ReasoningAgentID_TypeID, @EntityID = @MJEntityDocuments_ReasoningAgentID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningAgentID_Status, @TemplateID = @MJEntityDocuments_ReasoningAgentID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningAgentID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningAgentID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @ReasoningPromptID = @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @ReasoningAgentID_Clear = 1, @ReasoningAgentID = @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningAgentID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    
    -- Cascade update on InteractionEvent using cursor to call spUpdateInteractionEvent
    DECLARE @MJInteractionEvents_ActorAgentIDID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_InteractionID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_EventType nvarchar(20)
    DECLARE @MJInteractionEvents_ActorAgentID_OccurredAt datetimeoffset
    DECLARE @MJInteractionEvents_ActorAgentID_ActorUserID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_ActorAgentID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_Details nvarchar(MAX)
    DECLARE cascade_update_MJInteractionEvents_ActorAgentID_cursor CURSOR FOR
        SELECT [ID], [InteractionID], [EventType], [OccurredAt], [ActorUserID], [ActorAgentID], [Details]
        FROM [${flyway:defaultSchema}].[InteractionEvent]
        WHERE [ActorAgentID] = @ID

    OPEN cascade_update_MJInteractionEvents_ActorAgentID_cursor
    FETCH NEXT FROM cascade_update_MJInteractionEvents_ActorAgentID_cursor INTO @MJInteractionEvents_ActorAgentIDID, @MJInteractionEvents_ActorAgentID_InteractionID, @MJInteractionEvents_ActorAgentID_EventType, @MJInteractionEvents_ActorAgentID_OccurredAt, @MJInteractionEvents_ActorAgentID_ActorUserID, @MJInteractionEvents_ActorAgentID_ActorAgentID, @MJInteractionEvents_ActorAgentID_Details

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJInteractionEvents_ActorAgentID_ActorAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateInteractionEvent] @ID = @MJInteractionEvents_ActorAgentIDID, @InteractionID = @MJInteractionEvents_ActorAgentID_InteractionID, @EventType = @MJInteractionEvents_ActorAgentID_EventType, @OccurredAt = @MJInteractionEvents_ActorAgentID_OccurredAt, @ActorUserID = @MJInteractionEvents_ActorAgentID_ActorUserID, @ActorAgentID_Clear = 1, @ActorAgentID = @MJInteractionEvents_ActorAgentID_ActorAgentID, @Details = @MJInteractionEvents_ActorAgentID_Details

        FETCH NEXT FROM cascade_update_MJInteractionEvents_ActorAgentID_cursor INTO @MJInteractionEvents_ActorAgentIDID, @MJInteractionEvents_ActorAgentID_InteractionID, @MJInteractionEvents_ActorAgentID_EventType, @MJInteractionEvents_ActorAgentID_OccurredAt, @MJInteractionEvents_ActorAgentID_ActorUserID, @MJInteractionEvents_ActorAgentID_ActorAgentID, @MJInteractionEvents_ActorAgentID_Details
    END

    CLOSE cascade_update_MJInteractionEvents_ActorAgentID_cursor
    DEALLOCATE cascade_update_MJInteractionEvents_ActorAgentID_cursor
    
    -- Cascade update on InteractionOffer using cursor to call spUpdateInteractionOffer
    DECLARE @MJInteractionOffers_OfferedByAgentIDID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_InteractionID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_TargetUserID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_Mode nvarchar(20)
    DECLARE @MJInteractionOffers_OfferedByAgentID_Status nvarchar(20)
    DECLARE @MJInteractionOffers_OfferedByAgentID_RoomName nvarchar(255)
    DECLARE @MJInteractionOffers_OfferedByAgentID_CallerLabel nvarchar(255)
    DECLARE @MJInteractionOffers_OfferedByAgentID_Summary nvarchar(MAX)
    DECLARE @MJInteractionOffers_OfferedByAgentID_OfferedAt datetimeoffset
    DECLARE @MJInteractionOffers_OfferedByAgentID_ExpiresAt datetimeoffset
    DECLARE @MJInteractionOffers_OfferedByAgentID_RespondedAt datetimeoffset
    DECLARE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor CURSOR FOR
        SELECT [ID], [InteractionID], [TargetUserID], [OfferedByAgentID], [Mode], [Status], [RoomName], [CallerLabel], [Summary], [OfferedAt], [ExpiresAt], [RespondedAt]
        FROM [${flyway:defaultSchema}].[InteractionOffer]
        WHERE [OfferedByAgentID] = @ID

    OPEN cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJInteractionOffers_OfferedByAgentID_cursor INTO @MJInteractionOffers_OfferedByAgentIDID, @MJInteractionOffers_OfferedByAgentID_InteractionID, @MJInteractionOffers_OfferedByAgentID_TargetUserID, @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @MJInteractionOffers_OfferedByAgentID_Mode, @MJInteractionOffers_OfferedByAgentID_Status, @MJInteractionOffers_OfferedByAgentID_RoomName, @MJInteractionOffers_OfferedByAgentID_CallerLabel, @MJInteractionOffers_OfferedByAgentID_Summary, @MJInteractionOffers_OfferedByAgentID_OfferedAt, @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @MJInteractionOffers_OfferedByAgentID_RespondedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateInteractionOffer] @ID = @MJInteractionOffers_OfferedByAgentIDID, @InteractionID = @MJInteractionOffers_OfferedByAgentID_InteractionID, @TargetUserID = @MJInteractionOffers_OfferedByAgentID_TargetUserID, @OfferedByAgentID_Clear = 1, @OfferedByAgentID = @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @Mode = @MJInteractionOffers_OfferedByAgentID_Mode, @Status = @MJInteractionOffers_OfferedByAgentID_Status, @RoomName = @MJInteractionOffers_OfferedByAgentID_RoomName, @CallerLabel = @MJInteractionOffers_OfferedByAgentID_CallerLabel, @Summary = @MJInteractionOffers_OfferedByAgentID_Summary, @OfferedAt = @MJInteractionOffers_OfferedByAgentID_OfferedAt, @ExpiresAt = @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @RespondedAt = @MJInteractionOffers_OfferedByAgentID_RespondedAt

        FETCH NEXT FROM cascade_update_MJInteractionOffers_OfferedByAgentID_cursor INTO @MJInteractionOffers_OfferedByAgentIDID, @MJInteractionOffers_OfferedByAgentID_InteractionID, @MJInteractionOffers_OfferedByAgentID_TargetUserID, @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @MJInteractionOffers_OfferedByAgentID_Mode, @MJInteractionOffers_OfferedByAgentID_Status, @MJInteractionOffers_OfferedByAgentID_RoomName, @MJInteractionOffers_OfferedByAgentID_CallerLabel, @MJInteractionOffers_OfferedByAgentID_Summary, @MJInteractionOffers_OfferedByAgentID_OfferedAt, @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @MJInteractionOffers_OfferedByAgentID_RespondedAt
    END

    CLOSE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    DEALLOCATE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    
    -- Cascade update on MeetingParticipant using cursor to call spUpdateMeetingParticipant
    DECLARE @MJMeetingParticipants_AgentIDID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_MeetingID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_UserID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_AgentID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_ExternalName nvarchar(255)
    DECLARE @MJMeetingParticipants_AgentID_ExternalEmail nvarchar(255)
    DECLARE @MJMeetingParticipants_AgentID_ExternalPhone nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_Role nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_InviteStatus nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_JoinedAt datetimeoffset
    DECLARE @MJMeetingParticipants_AgentID_LeftAt datetimeoffset
    DECLARE cascade_update_MJMeetingParticipants_AgentID_cursor CURSOR FOR
        SELECT [ID], [MeetingID], [UserID], [AgentID], [ExternalName], [ExternalEmail], [ExternalPhone], [Role], [InviteStatus], [JoinedAt], [LeftAt]
        FROM [${flyway:defaultSchema}].[MeetingParticipant]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJMeetingParticipants_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJMeetingParticipants_AgentID_cursor INTO @MJMeetingParticipants_AgentIDID, @MJMeetingParticipants_AgentID_MeetingID, @MJMeetingParticipants_AgentID_UserID, @MJMeetingParticipants_AgentID_AgentID, @MJMeetingParticipants_AgentID_ExternalName, @MJMeetingParticipants_AgentID_ExternalEmail, @MJMeetingParticipants_AgentID_ExternalPhone, @MJMeetingParticipants_AgentID_Role, @MJMeetingParticipants_AgentID_InviteStatus, @MJMeetingParticipants_AgentID_JoinedAt, @MJMeetingParticipants_AgentID_LeftAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMeetingParticipants_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMeetingParticipant] @ID = @MJMeetingParticipants_AgentIDID, @MeetingID = @MJMeetingParticipants_AgentID_MeetingID, @UserID = @MJMeetingParticipants_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJMeetingParticipants_AgentID_AgentID, @ExternalName = @MJMeetingParticipants_AgentID_ExternalName, @ExternalEmail = @MJMeetingParticipants_AgentID_ExternalEmail, @ExternalPhone = @MJMeetingParticipants_AgentID_ExternalPhone, @Role = @MJMeetingParticipants_AgentID_Role, @InviteStatus = @MJMeetingParticipants_AgentID_InviteStatus, @JoinedAt = @MJMeetingParticipants_AgentID_JoinedAt, @LeftAt = @MJMeetingParticipants_AgentID_LeftAt

        FETCH NEXT FROM cascade_update_MJMeetingParticipants_AgentID_cursor INTO @MJMeetingParticipants_AgentIDID, @MJMeetingParticipants_AgentID_MeetingID, @MJMeetingParticipants_AgentID_UserID, @MJMeetingParticipants_AgentID_AgentID, @MJMeetingParticipants_AgentID_ExternalName, @MJMeetingParticipants_AgentID_ExternalEmail, @MJMeetingParticipants_AgentID_ExternalPhone, @MJMeetingParticipants_AgentID_Role, @MJMeetingParticipants_AgentID_InviteStatus, @MJMeetingParticipants_AgentID_JoinedAt, @MJMeetingParticipants_AgentID_LeftAt
    END

    CLOSE cascade_update_MJMeetingParticipants_AgentID_cursor
    DEALLOCATE cascade_update_MJMeetingParticipants_AgentID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_AgentIDID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_AgentID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_AgentID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_AgentID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_AgentID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_AgentID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_AgentID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_AgentID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_AgentID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_BatchSize int
    DECLARE @MJRecordProcesses_AgentID_MaxConcurrency int
    DECLARE @MJRecordProcesses_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_AgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJRecordProcesses_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_AgentIDID, @Name = @MJRecordProcesses_AgentID_Name, @Description = @MJRecordProcesses_AgentID_Description, @CategoryID = @MJRecordProcesses_AgentID_CategoryID, @EntityID = @MJRecordProcesses_AgentID_EntityID, @Status = @MJRecordProcesses_AgentID_Status, @WorkType = @MJRecordProcesses_AgentID_WorkType, @ActionID = @MJRecordProcesses_AgentID_ActionID, @AgentID_Clear = 1, @AgentID = @MJRecordProcesses_AgentID_AgentID, @PromptID = @MJRecordProcesses_AgentID_PromptID, @ScopeType = @MJRecordProcesses_AgentID_ScopeType, @ScopeViewID = @MJRecordProcesses_AgentID_ScopeViewID, @ScopeListID = @MJRecordProcesses_AgentID_ScopeListID, @ScopeFilter = @MJRecordProcesses_AgentID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_AgentID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_AgentID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_AgentID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_AgentID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_AgentID_CronExpression, @Timezone = @MJRecordProcesses_AgentID_Timezone, @OnDemandEnabled = @MJRecordProcesses_AgentID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_AgentID_InputMapping, @OutputMapping = @MJRecordProcesses_AgentID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_AgentID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_AgentID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_AgentID_BatchSize, @MaxConcurrency = @MJRecordProcesses_AgentID_MaxConcurrency, @Configuration = @MJRecordProcesses_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_AgentID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_AgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_AISkillID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON], [AISkillID], [PrimaryScopeRecordID], [ScopeDecisionJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @AISkillID = @MJSearchExecutionLogs_AIAgentID_AISkillID, @PrimaryScopeRecordID = @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @ScopeDecisionJSON = @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt, @InputPayload = @MJTasks_AgentID_InputPayload, @OutputPayload = @MJTasks_AgentID_OutputPayload, @ErrorMessage = @MJTasks_AgentID_ErrorMessage, @AgentRunID = @MJTasks_AgentID_AgentRunID, @ClaimedBy = @MJTasks_AgentID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentID_ClaimExpiresAt, @ActionID = @MJTasks_AgentID_ActionID, @StepType = @MJTasks_AgentID_StepType, @PromptID = @MJTasks_AgentID_PromptID, @Configuration = @MJTasks_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9048575e-0594-4e71-b338-c4fbd1163a99' OR (EntityID = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9048575e-0594-4e71-b338-c4fbd1163a99',
            '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', -- Entity: MJ: AI Bridge Agent Identities
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2d186ed-aeda-4eef-a720-86427c3bd81d' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'Agent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c2d186ed-aeda-4eef-a720-86427c3bd81d',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'Agent',
            'Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '723b48e3-6b94-451c-a0b9-7570a411eafb' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '723b48e3-6b94-451c-a0b9-7570a411eafb',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '928d9742-9205-451f-95b1-4272c37a01bf' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'PreferredPersona')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '928d9742-9205-451f-95b1-4272c37a01bf',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'PreferredPersona',
            'Preferred Persona',
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

/* SQL text to update existing entity fields from schema (3 scoped entities) */
EXEC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging', @EntityIDs='62925804-D598-45A7-A338-B2604AE96F11,D6CA6018-D288-4F79-B6A9-168C75C3363B,7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', @IncludedSchemaNames='${flyway:defaultSchema}';

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3A5A68E7-0E64-4FD3-BC77-202790E665C9'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identity Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = 'EF8683E5-DB2C-4770-893A-5C34319018B8';

-- UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identity Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = '9048575E-0594-4E71-B338-C4FBD1163A99';

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ: User Routines.ScheduleMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scheduling and Timing',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3A5A68E7-0E64-4FD3-BC77-202790E665C9';

-- UPDATE Entity Field Category Info MJ: User Routines.WakeConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '992D99E1-1981-48F5-9775-B463DA7D5A01';

-- UPDATE Entity Field Category Info MJ: User Routines.LastCheckedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution History',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F2ADAE80-F66A-4680-91D4-490929A755A5';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '47D94CDA-2FA2-4C40-A5EB-B32D1371543E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3DE526D0-D6B1-4949-AD40-B21527EB3FAE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2588BD34-B6EC-4DAA-A21A-C06207A09E2B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C2D186ED-AEDA-4EEF-A720-86427C3BD81D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '723B48E3-6B94-451C-A0B9-7570A411EAFB'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CC0D7661-B44E-4B26-979E-C01C0378895D';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Policy Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent'
WHERE 
   ID = 'F1FDC4B8-66D0-4FDA-B90B-C22634B19645';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Policy Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = 'CFA96B9C-36EF-40EB-9D35-FD70D0E31CC3';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.DisplayNameOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personalization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A6F489E4-A280-406B-8386-200ACFB10313';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.PreferredPersonaID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personalization',
   GeneratedFormSection = 'Category',
   DisplayName = 'Preferred Persona'
WHERE 
   ID = '95D689F2-DBEE-4840-B5DF-D6D24A6351A3';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Policy Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '47D94CDA-2FA2-4C40-A5EB-B32D1371543E';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.OnboardingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Onboarding',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3DE526D0-D6B1-4949-AD40-B21527EB3FAE';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.OnboardedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Onboarding',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E849CD39-2905-4CB7-99F5-5BE8D71152F5';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.CoordinationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Policy Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2588BD34-B6EC-4DAA-A21A-C06207A09E2B';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.DefaultDataAccessMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Access Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7769BAAD-00EE-4AE0-84B9-27DBE533F516';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.EmailChannelMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Permissions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.PhoneChannelMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Permissions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '150BACBB-FE44-4E80-A70B-61C1F426F584';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.MessagingChannelMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Permissions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.AllowInterAgentCoordination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Allow Inter-Agent Coordination'
WHERE 
   ID = '7CE2251D-8771-4D1E-9A5C-F38DDCA52A15';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.RequireApprovalForExternalComms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval Gates',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FFFF6F77-0D32-461E-8DDC-6A411EE133F9';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.RequireApprovalForFinancials 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval Gates',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '86E7E9F3-C1EB-4CC5-BBD2-CB6B4A01F3E9';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.RequireApprovalForDestructiveActions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval Gates',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D382C36A-24C8-43C9-BD74-AA67EAD537F2';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.AutoApproveAmountThreshold 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Approval Gates',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '74497616-64DC-4DE8-9D62-CA0AE2C46177';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.EntityAccessRules 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Access Control',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6B99E673-8C44-48F8-B041-39C4699BC194';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.ActionPolicyRules 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Security and Access Control',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '77ACDE28-89C4-42F9-B34E-CEA7695C88B1';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.InstructionsOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personalization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '915CCBAF-6129-4DA5-A78E-6AA332EF0DCD';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '019114D7-9BE8-415C-990B-9BF0BA067E59';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D4E21CC5-C318-469B-A486-5FE0FB11AC41';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Policy Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name'
WHERE 
   ID = 'C2D186ED-AEDA-4EEF-A720-86427C3BD81D';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Policy Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = '723B48E3-6B94-451C-A0B9-7570A411EAFB';

-- UPDATE Entity Field Category Info MJ: AI Agent User Policies.PreferredPersona 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personalization',
   GeneratedFormSection = 'Category',
   DisplayName = 'Preferred Persona Name'
WHERE 
   ID = '928D9742-9205-451F-95B1-4272C37A01BF';

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-shield-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '62925804-D598-45A7-A338-B2604AE96F11';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a4175944-977c-5f43-8bfe-85176500fcae', '62925804-D598-45A7-A338-B2604AE96F11', 'FieldCategoryInfo', '{
  "Approval Gates": {
    "description": "Rules requiring user approval for financials, communications, and destructive actions",
    "icon": "fa fa-user-check"
  },
  "Channel Permissions": {
    "description": "Communication channel modes and inter-agent coordination settings",
    "icon": "fa fa-comments"
  },
  "Onboarding": {
    "description": "Onboarding progression and completion timestamps",
    "icon": "fa fa-clipboard-check"
  },
  "Personalization": {
    "description": "User-specific personas, display names, and standing instructions",
    "icon": "fa fa-user-cog"
  },
  "Policy Configuration": {
    "description": "Core configuration settings, lifecycle status, and agent-user mapping",
    "icon": "fa fa-sliders-h"
  },
  "Security and Access Control": {
    "description": "Data access modes, entity access rules, and action policies",
    "icon": "fa fa-lock"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('86ae61e4-8ecb-5205-9036-0a08c2704dd8', '62925804-D598-45A7-A338-B2604AE96F11', 'FieldCategoryIcons', '{
  "Approval Gates": "fa fa-user-check",
  "Channel Permissions": "fa fa-comments",
  "Onboarding": "fa fa-clipboard-check",
  "Personalization": "fa fa-user-cog",
  "Policy Configuration": "fa fa-sliders-h",
  "Security and Access Control": "fa fa-lock",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11';

/* SQL text to insert 6 new entity field(s) for CalendarChannelMode & CommunicationProvider governance */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf2f9acf-fd11-4d00-8520-6679bb62aaa7' OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsCalendar')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf2f9acf-fd11-4d00-8520-6679bb62aaa7',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Communication Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '43248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SupportsCalendar',
            'Supports Calendar',
            'Whether the provider supports calendar event reading, creation, updating, and invitation responses.',
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f74ce9c-d214-4f3b-9506-e0901387dd8b' OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsFreeBusy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7f74ce9c-d214-4f3b-9506-e0901387dd8b',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Communication Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '43248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SupportsFreeBusy',
            'Supports Free Busy',
            'Whether the provider supports checking free/busy schedules and finding optimal meeting times.',
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8eba1516-7bc5-4584-be65-471cbe1a24f2' OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EnterpriseScopeMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8eba1516-7bc5-4584-be65-471cbe1a24f2',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Communication Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '43248F34-2837-EF11-86D4-6045BDEE16E6'),
            'EnterpriseScopeMode',
            'Enterprise Scope Mode',
            'Enterprise mailbox scope posture for this provider: UtilityMailboxesOnly (restricted to shared/agent utility mailboxes), SecurityGroupScoped (Exchange RBAC / Workspace group-scoped user mailboxes), or TenantWide.',
            'nvarchar',
            80,
            0,
            0,
            0,
            'UtilityMailboxesOnly',
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4cf9c95e-5d34-4e87-89cc-4f1ae66cb221' OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AllowedEmailDomains')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4cf9c95e-5d34-4e87-89cc-4f1ae66cb221',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Communication Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '43248F34-2837-EF11-86D4-6045BDEE16E6'),
            'AllowedEmailDomains',
            'Allowed Email Domains',
            'Optional comma-separated list of corporate email domains permitted for user-scoped mailbox and calendar operations (e.g., "company.com,subsidiary.com").',
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df6d1620-4c4d-4818-ba5a-418961df4ef0' OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCredentialID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df6d1620-4c4d-4818-ba5a-418961df4ef0',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Communication Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '43248F34-2837-EF11-86D4-6045BDEE16E6'),
            'DefaultCredentialID',
            'Default Credential ID',
            'Optional default MJ Credential used by this communication provider when no per-request credential override is supplied.',
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
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae8babc0-f436-4374-a0d9-c69b1819cfcb' OR (EntityID = '62925804-D598-45A7-A338-B2604AE96F11' AND Name = 'CalendarChannelMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae8babc0-f436-4374-a0d9-c69b1819cfcb',
            '62925804-D598-45A7-A338-B2604AE96F11', -- Entity: MJ: AI Agent User Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '62925804-D598-45A7-A338-B2604AE96F11'),
            'CalendarChannelMode',
            'Calendar Channel Mode',
            'Calendar channel permission level: Disabled, ReadOnly (check events & free/busy only), ProposeWithApproval (create/modify events or send invites only with explicit user approval), or Autonomous.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'ReadOnly',
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

/* SQL text to insert entity field values for CalendarChannelMode & EnterpriseScopeMode */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('8e6e5444-fc74-4453-bf0d-c7d03b9e29a7', 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB', 1, 'Autonomous', 'Autonomous', GETUTCDATE(), GETUTCDATE()),
   ('0e1113ec-36ee-4ea9-9cb6-3de71e0b004f', 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE()),
   ('12942d04-0c78-483f-81df-7b5c4fdfe128', 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB', 3, 'ProposeWithApproval', 'ProposeWithApproval', GETUTCDATE(), GETUTCDATE()),
   ('20a079a3-e6b6-458f-8db7-14ab5e79afa7', 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB', 4, 'ReadOnly', 'ReadOnly', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='AE8BABC0-F436-4374-A0D9-C69B1819CFCB';

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
   ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
   ('5be04022-60fa-4064-b31d-fb56590d2884', '8EBA1516-7BC5-4584-BE65-471CBE1A24F2', 1, 'SecurityGroupScoped', 'SecurityGroupScoped', GETUTCDATE(), GETUTCDATE()),
   ('3b34cce1-ffb1-48fc-bed3-edbfc3f9cabf', '8EBA1516-7BC5-4584-BE65-471CBE1A24F2', 2, 'TenantWide', 'TenantWide', GETUTCDATE(), GETUTCDATE()),
   ('dd19166a-3e2c-4d7b-8938-717ae1631e5a', '8EBA1516-7BC5-4584-BE65-471CBE1A24F2', 3, 'UtilityMailboxesOnly', 'UtilityMailboxesOnly', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8EBA1516-7BC5-4584-BE65-471CBE1A24F2';

/* Create Entity Relationship: MJ: Credentials -> MJ: Communication Providers (One To Many via DefaultCredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bd48be92-95bd-4f49-93d4-5b08c63144ab'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd48be92-95bd-4f49-93d4-5b08c63144ab', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '43248F34-2837-EF11-86D4-6045BDEE16E6', 'DefaultCredentialID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for CommunicationProvider */
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationProvider_DefaultCredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CommunicationProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationProvider_DefaultCredentialID ON [${flyway:defaultSchema}].[CommunicationProvider] ([DefaultCredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID DF6D1620-4C4D-4818-BA5A-418961DF4EF0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DF6D1620-4C4D-4818-BA5A-418961DF4EF0', @RelatedEntityNameFieldMap='DefaultCredential';

/* Base View SQL for MJ: Communication Providers */
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCommunicationProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCommunicationProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommunicationProviders]
AS
SELECT
    c.*,
    MJCredential_DefaultCredentialID.[Name] AS [DefaultCredential]
FROM
    [${flyway:defaultSchema}].[CommunicationProvider] AS c
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_DefaultCredentialID
  ON
    [c].[DefaultCredentialID] = MJCredential_DefaultCredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommunicationProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Communication Providers */
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCommunicationProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommunicationProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SupportsSending bit = NULL,
    @SupportsReceiving bit = NULL,
    @SupportsScheduledSending bit = NULL,
    @SupportsForwarding bit = NULL,
    @SupportsReplying bit = NULL,
    @SupportsDrafts bit = NULL,
    @SupportsCalendar bit = NULL,
    @SupportsFreeBusy bit = NULL,
    @EnterpriseScopeMode nvarchar(40) = NULL,
    @AllowedEmailDomains_Clear bit = 0,
    @AllowedEmailDomains nvarchar(500) = NULL,
    @DefaultCredentialID_Clear bit = 0,
    @DefaultCredentialID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[CommunicationProvider]
            (
                [ID],
                [Name],
                [Description],
                [Status],
                [SupportsSending],
                [SupportsReceiving],
                [SupportsScheduledSending],
                [SupportsForwarding],
                [SupportsReplying],
                [SupportsDrafts],
                [SupportsCalendar],
                [SupportsFreeBusy],
                [EnterpriseScopeMode],
                [AllowedEmailDomains],
                [DefaultCredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Status, 'Disabled'),
                ISNULL(@SupportsSending, 1),
                ISNULL(@SupportsReceiving, 0),
                ISNULL(@SupportsScheduledSending, 0),
                ISNULL(@SupportsForwarding, 0),
                ISNULL(@SupportsReplying, 0),
                ISNULL(@SupportsDrafts, 0),
                ISNULL(@SupportsCalendar, 0),
                ISNULL(@SupportsFreeBusy, 0),
                ISNULL(@EnterpriseScopeMode, 'UtilityMailboxesOnly'),
                CASE WHEN @AllowedEmailDomains_Clear = 1 THEN NULL ELSE ISNULL(@AllowedEmailDomains, NULL) END,
                CASE WHEN @DefaultCredentialID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCredentialID, NULL) END
            )
    END
    ELSE
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[CommunicationProvider]
            (
                [Name],
                [Description],
                [Status],
                [SupportsSending],
                [SupportsReceiving],
                [SupportsScheduledSending],
                [SupportsForwarding],
                [SupportsReplying],
                [SupportsDrafts],
                [SupportsCalendar],
                [SupportsFreeBusy],
                [EnterpriseScopeMode],
                [AllowedEmailDomains],
                [DefaultCredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Status, 'Disabled'),
                ISNULL(@SupportsSending, 1),
                ISNULL(@SupportsReceiving, 0),
                ISNULL(@SupportsScheduledSending, 0),
                ISNULL(@SupportsForwarding, 0),
                ISNULL(@SupportsReplying, 0),
                ISNULL(@SupportsDrafts, 0),
                ISNULL(@SupportsCalendar, 0),
                ISNULL(@SupportsFreeBusy, 0),
                ISNULL(@EnterpriseScopeMode, 'UtilityMailboxesOnly'),
                CASE WHEN @AllowedEmailDomains_Clear = 1 THEN NULL ELSE ISNULL(@AllowedEmailDomains, NULL) END,
                CASE WHEN @DefaultCredentialID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCredentialID, NULL) END
            )
    END
    SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommunicationProvider] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Communication Providers */
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCommunicationProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommunicationProvider]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SupportsSending bit = NULL,
    @SupportsReceiving bit = NULL,
    @SupportsScheduledSending bit = NULL,
    @SupportsForwarding bit = NULL,
    @SupportsReplying bit = NULL,
    @SupportsDrafts bit = NULL,
    @SupportsCalendar bit = NULL,
    @SupportsFreeBusy bit = NULL,
    @EnterpriseScopeMode nvarchar(40) = NULL,
    @AllowedEmailDomains_Clear bit = 0,
    @AllowedEmailDomains nvarchar(500) = NULL,
    @DefaultCredentialID_Clear bit = 0,
    @DefaultCredentialID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationProvider]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SupportsSending] = ISNULL(@SupportsSending, [SupportsSending]),
        [SupportsReceiving] = ISNULL(@SupportsReceiving, [SupportsReceiving]),
        [SupportsScheduledSending] = ISNULL(@SupportsScheduledSending, [SupportsScheduledSending]),
        [SupportsForwarding] = ISNULL(@SupportsForwarding, [SupportsForwarding]),
        [SupportsReplying] = ISNULL(@SupportsReplying, [SupportsReplying]),
        [SupportsDrafts] = ISNULL(@SupportsDrafts, [SupportsDrafts]),
        [SupportsCalendar] = ISNULL(@SupportsCalendar, [SupportsCalendar]),
        [SupportsFreeBusy] = ISNULL(@SupportsFreeBusy, [SupportsFreeBusy]),
        [EnterpriseScopeMode] = ISNULL(@EnterpriseScopeMode, [EnterpriseScopeMode]),
        [AllowedEmailDomains] = CASE WHEN @AllowedEmailDomains_Clear = 1 THEN NULL ELSE ISNULL(@AllowedEmailDomains, [AllowedEmailDomains]) END,
        [DefaultCredentialID] = CASE WHEN @DefaultCredentialID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCredentialID, [DefaultCredentialID]) END
    WHERE
        [ID] = @ID

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCommunicationProviders] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwCommunicationProviders] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommunicationProvider] TO [cdp_Integration], [cdp_Developer];
GO

IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCommunicationProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCommunicationProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommunicationProvider
ON [${flyway:defaultSchema}].[CommunicationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommunicationProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommunicationProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spDelete SQL for MJ: Communication Providers */
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCommunicationProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommunicationProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [${flyway:defaultSchema}].[CommunicationProvider] WHERE [ID] = @ID
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID]
    ELSE
        SELECT @ID AS [ID]
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommunicationProvider] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert virtual field DefaultCredential on MJ: Communication Providers */
      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51226919-5a32-4c83-af58-8233add8699e' OR (EntityID = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultCredential')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51226919-5a32-4c83-af58-8233add8699e',
            '43248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Communication Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '43248F34-2837-EF11-86D4-6045BDEE16E6'),
            'DefaultCredential',
            'Default Credential',
            NULL,
            'nvarchar',
            400,
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

-- UPDATE Entity Field Category Info for CalendarChannelMode and CommunicationProvider fields
UPDATE [${flyway:defaultSchema}].[EntityField]
SET Category = 'Channel Permissions', GeneratedFormSection = 'Category'
WHERE ID = 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB';

UPDATE [${flyway:defaultSchema}].[EntityField]
SET Category = 'Advanced Capabilities', GeneratedFormSection = 'Category'
WHERE ID IN ('CF2F9ACF-FD11-4D00-8520-6679BB62AAA7', '7F74CE9C-D214-4F3B-9506-E0901387DD8B');

UPDATE [${flyway:defaultSchema}].[EntityField]
SET Category = 'Operational Settings', GeneratedFormSection = 'Category'
WHERE ID IN ('8EBA1516-7BC5-4584-BE65-471CBE1A24F2', '4CF9C95E-5D34-4E87-89CC-4F1AE66CB221', 'DF6D1620-4C4D-4818-BA5A-418961DF4EF0', '51226919-5A32-4C83-AF58-8233ADD8699E');

