-- =====================================================================
-- Scoped Notification Configs (v6.2.x)
-- =====================================================================
--
-- The notification sibling of ScopedPromptConfig. A notification type has
-- defaults (DefaultInApp / DefaultEmail / DefaultSMS) and a recipient has a
-- preference (UserNotificationPreference), and nothing between them: no way
-- for an application, a role, or the thing that caused a notice to say
-- "not this one". So every Resource Permission an application writes as
-- plumbing — the system user bridging a roster to a resource's permissions —
-- sends "System shared X with you" to every grantee (MJ#4946).
--
-- This table is that level. One row is one config for one notification type
-- in one scope, narrowed by the SAME polymorphic scope the AI layer carries
-- on ScopedPromptConfig, ScopedPromptPart, AIAgentNote, AIAgentExample and
-- AIAgentRun: a primary record of any entity (an Application, a Role, a User,
-- a Company) plus JSON secondary dimensions. The first dimension named is
-- `origin`: Person, System (MJ's Owner-type user) or Automation.
--
-- Each channel is Allow, Deny or NULL — the Entity Field Permissions posture.
-- NULL leaves the channel to the next row. Resolution in NotificationEngine:
-- most specific in-scope row wins per channel (secondary match +4, primary
-- record +2, global +1, ties by Priority); at equal specificity one Deny
-- beats any Allow; a Deny on a row with IsLocked caps every less specific
-- row and the recipient's own preference. The recipient's preference stays
-- the last word on any channel no locked row denies.
--
-- The one row MJ ships is metadata, not schema (metadata/scoped-notification-
-- configs/): Resource Shared, origin System, all channels Deny, locked.
--
-- Tables created
-- --------------
--   1. ScopedNotificationConfig
--
-- Note: DDL + extended properties only. Views, sprocs, FK indexes, the
-- __mj_CreatedAt/__mj_UpdatedAt columns + triggers, and the EntityField /
-- entity-class metadata are all produced by CodeGen from this schema and
-- appended below the CODEGEN OUTPUT banner.
-- =====================================================================

CREATE TABLE ${flyway:defaultSchema}.ScopedNotificationConfig (
    ID                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ScopedNotificationConfig_ID DEFAULT (NEWSEQUENTIALID()),
    NotificationTypeID   UNIQUEIDENTIFIER NOT NULL,
    Description          NVARCHAR(MAX)    NULL,
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL,
    PrimaryScopeRecordID NVARCHAR(100)    NULL,
    SecondaryScopes      NVARCHAR(MAX)    NULL,
    InApp                NVARCHAR(20)     NULL,
    Email                NVARCHAR(20)     NULL,
    SMS                  NVARCHAR(20)     NULL,
    IsLocked             BIT              NOT NULL CONSTRAINT DF_ScopedNotificationConfig_IsLocked DEFAULT (0),
    Priority             INT              NOT NULL CONSTRAINT DF_ScopedNotificationConfig_Priority DEFAULT (0),
    Status               NVARCHAR(20)     NOT NULL CONSTRAINT DF_ScopedNotificationConfig_Status DEFAULT (N'Active'),
    CONSTRAINT PK_ScopedNotificationConfig PRIMARY KEY (ID),
    CONSTRAINT FK_ScopedNotificationConfig_NotificationType
        FOREIGN KEY (NotificationTypeID) REFERENCES ${flyway:defaultSchema}.UserNotificationType(ID),
    CONSTRAINT FK_ScopedNotificationConfig_PrimaryScopeEntity
        FOREIGN KEY (PrimaryScopeEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    -- A primary record needs its entity: the resolver has to know whether the record is an
    -- Application, a Role or a User to match it against the notice's scope and the recipient.
    CONSTRAINT CK_ScopedNotificationConfig_PrimaryScope
        CHECK (PrimaryScopeRecordID IS NULL OR PrimaryScopeEntityID IS NOT NULL),
    CONSTRAINT CK_ScopedNotificationConfig_InApp  CHECK (InApp IS NULL OR InApp IN (N'Allow', N'Deny')),
    CONSTRAINT CK_ScopedNotificationConfig_Email  CHECK (Email IS NULL OR Email IN (N'Allow', N'Deny')),
    CONSTRAINT CK_ScopedNotificationConfig_SMS    CHECK (SMS   IS NULL OR SMS   IN (N'Allow', N'Deny')),
    -- A row that speaks to no channel does nothing; refuse it rather than let it sit as a puzzle.
    CONSTRAINT CK_ScopedNotificationConfig_AnyChannel
        CHECK (InApp IS NOT NULL OR Email IS NOT NULL OR SMS IS NOT NULL),
    CONSTRAINT CK_ScopedNotificationConfig_Status
        CHECK (Status IN (N'Active', N'Provisional', N'Archived'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A notification config at one scope: the level between a notification type''s defaults and a recipient''s preference where an application, a role, a user or the notice''s origin can allow or deny a channel. Scoped by the same primary record + secondary dimensions as Scoped Prompt Configs. Resolution: most specific in-scope row wins per channel; at equal specificity Deny beats Allow; a locked Deny caps every level below it, the recipient''s preference included.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The notification type this config is for.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'NotificationTypeID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why the row exists, for the administrator who finds it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The entity of the primary scope record (Applications, Roles, Users, Companies, ...). NULL with PrimaryScopeRecordID NULL = a global row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'PrimaryScopeEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The record ID within the primary scope entity this config is scoped to. NULL = global. In scope when it is the caller''s primary scope record, the recipient, or a role the recipient holds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'PrimaryScopeRecordID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON object of additional scope dimensions, e.g. {"origin":"System"}. Every dimension named must match the notice''s scope for the row to apply. origin is Person, System (the Owner-type user) or Automation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'SecondaryScopes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The in-app channel: Allow, Deny, or NULL to leave it to the next row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'InApp';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The email channel: Allow, Deny, or NULL to leave it to the next row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'Email';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The SMS channel: Allow, Deny, or NULL to leave it to the next row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'SMS';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When set, a Deny on this row is absorbing: no less specific row and no recipient preference may turn the channel on. The way a notification type''s AllowUserPreference caps the recipient today.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'IsLocked';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Tie-break for resolution. Higher wins when two rows tie on scope specificity and neither denies. Default 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'Priority';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Lifecycle: Active (live), Provisional (staged; eligible), Archived (excluded from resolution).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ScopedNotificationConfig', @level2type = N'COLUMN', @level2name = N'Status';
GO
