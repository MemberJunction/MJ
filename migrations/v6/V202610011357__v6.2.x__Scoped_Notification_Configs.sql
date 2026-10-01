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


















































/**************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                    GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                 **
 **                                                                                              **
 **  Everything below this block was produced by `mj codegen` against the schema above, on a    **
 **  database built from scratch for this branch (MJ_6_2_0_NOTIF_4946). It contains:            **
 **    • Entity / EntityField / EntityFieldValue / EntityPermission metadata rows                **
 **    • __mj_CreatedAt / __mj_UpdatedAt columns + their triggers                                 **
 **    • foreign-key indexes (IDX_AUTO_MJ_FKEY_*)                                                 **
 **    • base view (vwScopedNotificationConfigs)                                                  **
 **    • CRUD stored procedures (spCreate/spUpdate/spDelete)                                      **
 **                                                                                              **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the whole **
 **  ScopedNotificationConfig schema (hand-authored DDL + generated objects) applies as ONE       **
 **  migration, per MJ convention. DO NOT hand-edit below this line; it is regenerated by         **
 **  re-running CodeGen.                                                                          **
 **                                                                                              **
 **************************************************************************************************
 **************************************************************************************************/

/* SQL generated to create new entity MJ: Scoped Notification Configs */

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
         '05323df8-34b1-43b0-9d2f-f8bd8e366883',
         'MJ: Scoped Notification Configs',
         'Scoped Notification Configs',
         'A notification config at one scope: the level between a notification type''s defaults and a recipient''s preference where an application, a role, a user or the notice''s origin can allow or deny a channel. Scoped by the same primary record + secondary dimensions as Scoped Prompt Configs. Resolution: most specific in-scope row wins per channel; at equal specificity Deny beats Allow; a locked Deny caps every level below it, the recipient''s preference included.',
         NULL,
         'ScopedNotificationConfig',
         'vwScopedNotificationConfigs',
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

/* SQL generated to add new entity MJ: Scoped Notification Configs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '05323df8-34b1-43b0-9d2f-f8bd8e366883', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Scoped Notification Configs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Scoped Notification Configs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Scoped Notification Configs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('05323df8-34b1-43b0-9d2f-f8bd8e366883' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
ALTER TABLE [${flyway:defaultSchema}].[ScopedNotificationConfig] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
UPDATE [${flyway:defaultSchema}].[ScopedNotificationConfig] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
ALTER TABLE [${flyway:defaultSchema}].[ScopedNotificationConfig] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
ALTER TABLE [${flyway:defaultSchema}].[ScopedNotificationConfig] ADD CONSTRAINT [DF___mj_ScopedNotificationConfig___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
ALTER TABLE [${flyway:defaultSchema}].[ScopedNotificationConfig] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
UPDATE [${flyway:defaultSchema}].[ScopedNotificationConfig] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
ALTER TABLE [${flyway:defaultSchema}].[ScopedNotificationConfig] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScopedNotificationConfig */
ALTER TABLE [${flyway:defaultSchema}].[ScopedNotificationConfig] ADD CONSTRAINT [DF___mj_ScopedNotificationConfig___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 14 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7d218ec-98d8-4b67-a73c-b5cad81ea7c5' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd7d218ec-98d8-4b67-a73c-b5cad81ea7c5',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd692a9f-45c1-45c1-8a24-1a0786a2341e' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'NotificationTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bd692a9f-45c1-45c1-8a24-1a0786a2341e',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'NotificationTypeID',
            'Notification Type ID',
            'The notification type this config is for.',
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
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d52283e-d284-4c0e-938c-31a9c11332b8' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4d52283e-d284-4c0e-938c-31a9c11332b8',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'Description',
            'Description',
            'Why the row exists, for the administrator who finds it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08d78f6e-ce9c-4b72-8944-849c8d7ec97b' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'PrimaryScopeEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '08d78f6e-ce9c-4b72-8944-849c8d7ec97b',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'PrimaryScopeEntityID',
            'Primary Scope Entity ID',
            'The entity of the primary scope record (Applications, Roles, Users, Companies, ...). NULL with PrimaryScopeRecordID NULL = a global row.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e5713ec-cc37-4260-b6a7-59675b81a89a' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'PrimaryScopeRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e5713ec-cc37-4260-b6a7-59675b81a89a',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'PrimaryScopeRecordID',
            'Primary Scope Record ID',
            'The record ID within the primary scope entity this config is scoped to. NULL = global. In scope when it is the caller''s primary scope record, the recipient, or a role the recipient holds.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14a0c64f-88e3-4f22-993e-1af4cd87f087' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'SecondaryScopes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '14a0c64f-88e3-4f22-993e-1af4cd87f087',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'SecondaryScopes',
            'Secondary Scopes',
            'JSON object of additional scope dimensions, e.g. {"origin":"System"}. Every dimension named must match the notice''s scope for the row to apply. origin is Person, System (the Owner-type user) or Automation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2010c79e-283f-4859-9a05-ca6ee1fbba99' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'InApp')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2010c79e-283f-4859-9a05-ca6ee1fbba99',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'InApp',
            'In App',
            'The in-app channel: Allow, Deny, or NULL to leave it to the next row.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a550e7d-0333-489d-b0a4-26af7a3c34fd' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'Email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a550e7d-0333-489d-b0a4-26af7a3c34fd',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'Email',
            'Email',
            'The email channel: Allow, Deny, or NULL to leave it to the next row.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c101c3a9-a90e-44b4-be0c-19bab4455dfe' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'SMS')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c101c3a9-a90e-44b4-be0c-19bab4455dfe',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'SMS',
            'Sms',
            'The SMS channel: Allow, Deny, or NULL to leave it to the next row.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '977545aa-1e83-48ae-8fcf-fc2568d1dcac' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'IsLocked')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '977545aa-1e83-48ae-8fcf-fc2568d1dcac',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'IsLocked',
            'Is Locked',
            'When set, a Deny on this row is absorbing: no less specific row and no recipient preference may turn the channel on. The way a notification type''s AllowUserPreference caps the recipient today.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fe0e033-8474-478a-882a-592fe5ad0510' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9fe0e033-8474-478a-882a-592fe5ad0510',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'Priority',
            'Priority',
            'Tie-break for resolution. Higher wins when two rows tie on scope specificity and neither denies. Default 0.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '836ef9f0-9678-41e3-a340-40d3796badca' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '836ef9f0-9678-41e3-a340-40d3796badca',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'Status',
            'Status',
            'Lifecycle: Active (live), Provisional (staged; eligible), Archived (excluded from resolution).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cf416dd-0aee-4701-b187-193223f671f5' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0cf416dd-0aee-4701-b187-193223f671f5',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1f8f192-c3ba-4d11-8c4b-b8bb470178f4' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e1f8f192-c3ba-4d11-8c4b-b8bb470178f4',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
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

/* SQL text to insert entity field value with ID d3d9cbae-d5ed-42ad-b3e5-f0c5cd2c4521 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3d9cbae-d5ed-42ad-b3e5-f0c5cd2c4521', '2010C79E-283F-4859-9A05-CA6EE1FBBA99', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8b582747-40e9-4fdc-91c2-e8617fc544cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8b582747-40e9-4fdc-91c2-e8617fc544cc', '2010C79E-283F-4859-9A05-CA6EE1FBBA99', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2010C79E-283F-4859-9A05-CA6EE1FBBA99 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2010C79E-283F-4859-9A05-CA6EE1FBBA99';

/* SQL text to insert entity field value with ID b9250867-e6be-4a3f-8ed8-5a332a3573c7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b9250867-e6be-4a3f-8ed8-5a332a3573c7', '3A550E7D-0333-489D-B0A4-26AF7A3C34FD', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f2c0c83a-5d0b-49c9-9e56-980b25f6a3b8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2c0c83a-5d0b-49c9-9e56-980b25f6a3b8', '3A550E7D-0333-489D-B0A4-26AF7A3C34FD', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3A550E7D-0333-489D-B0A4-26AF7A3C34FD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3A550E7D-0333-489D-B0A4-26AF7A3C34FD';

/* SQL text to insert entity field value with ID ced7a9f6-e007-45d9-a5b7-8f6f4a073d24 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ced7a9f6-e007-45d9-a5b7-8f6f4a073d24', 'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE', 1, 'Allow', 'Allow', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0b39abcb-6145-457c-83a6-5180ff89c5e4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0b39abcb-6145-457c-83a6-5180ff89c5e4', 'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE', 2, 'Deny', 'Deny', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C101C3A9-A90E-44B4-BE0C-19BAB4455DFE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C101C3A9-A90E-44B4-BE0C-19BAB4455DFE';

/* SQL text to insert entity field value with ID 26d53003-6c9f-49a8-a1b1-7a6d6d00f12a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26d53003-6c9f-49a8-a1b1-7a6d6d00f12a', '836EF9F0-9678-41E3-A340-40D3796BADCA', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5ff00cad-35c4-4fb8-97e3-932601353f55 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ff00cad-35c4-4fb8-97e3-932601353f55', '836EF9F0-9678-41E3-A340-40D3796BADCA', 2, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 13a3df12-4cf1-4fde-979d-e0c1be3d169c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13a3df12-4cf1-4fde-979d-e0c1be3d169c', '836EF9F0-9678-41E3-A340-40D3796BADCA', 3, 'Provisional', 'Provisional', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 836EF9F0-9678-41E3-A340-40D3796BADCA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='836EF9F0-9678-41E3-A340-40D3796BADCA';

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


/* Create Entity Relationship: MJ: Entities -> MJ: Scoped Notification Configs (One To Many via PrimaryScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '35f9deab-c9e0-4123-b1d1-982471cd670a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('35f9deab-c9e0-4123-b1d1-982471cd670a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'PrimaryScopeEntityID', 'One To Many', 1, 1, 82, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: User Notification Types -> MJ: Scoped Notification Configs (One To Many via NotificationTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b12c2d46-787a-4b85-aa3e-6b272b827601'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b12c2d46-787a-4b85-aa3e-6b272b827601', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'NotificationTypeID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ScopedNotificationConfig */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scoped Notification Configs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key NotificationTypeID in table ScopedNotificationConfig
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScopedNotificationConfig_NotificationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScopedNotificationConfig]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScopedNotificationConfig_NotificationTypeID ON [${flyway:defaultSchema}].[ScopedNotificationConfig] ([NotificationTypeID]);

-- Index for foreign key PrimaryScopeEntityID in table ScopedNotificationConfig
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScopedNotificationConfig_PrimaryScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScopedNotificationConfig]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScopedNotificationConfig_PrimaryScopeEntityID ON [${flyway:defaultSchema}].[ScopedNotificationConfig] ([PrimaryScopeEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID BD692A9F-45C1-45C1-8A24-1A0786A2341E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BD692A9F-45C1-45C1-8A24-1A0786A2341E', @RelatedEntityNameFieldMap='NotificationType';

/* SQL text to update entity field related entity name field map for entity field ID 08D78F6E-CE9C-4B72-8944-849C8D7EC97B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='08D78F6E-CE9C-4B72-8944-849C8D7EC97B', @RelatedEntityNameFieldMap='PrimaryScopeEntity';

/* Base View SQL for MJ: Scoped Notification Configs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scoped Notification Configs
-- Item: vwScopedNotificationConfigs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scoped Notification Configs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScopedNotificationConfig
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScopedNotificationConfigs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScopedNotificationConfigs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScopedNotificationConfigs]
AS
SELECT
    s.*,
    MJUserNotificationType_NotificationTypeID.[Name] AS [NotificationType],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity]
FROM
    [${flyway:defaultSchema}].[ScopedNotificationConfig] AS s
INNER JOIN
    [${flyway:defaultSchema}].[UserNotificationType] AS MJUserNotificationType_NotificationTypeID
  ON
    [s].[NotificationTypeID] = MJUserNotificationType_NotificationTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [s].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScopedNotificationConfigs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Scoped Notification Configs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scoped Notification Configs
-- Item: Permissions for vwScopedNotificationConfigs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScopedNotificationConfigs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Scoped Notification Configs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scoped Notification Configs
-- Item: spCreateScopedNotificationConfig
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScopedNotificationConfig
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScopedNotificationConfig]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScopedNotificationConfig];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScopedNotificationConfig]
    @ID uniqueidentifier = NULL,
    @NotificationTypeID uniqueidentifier,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @InApp_Clear bit = 0,
    @InApp nvarchar(20) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(20) = NULL,
    @SMS_Clear bit = 0,
    @SMS nvarchar(20) = NULL,
    @IsLocked bit = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ScopedNotificationConfig]
            (
                [ID],
                [NotificationTypeID],
                [Description],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [InApp],
                [Email],
                [SMS],
                [IsLocked],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @NotificationTypeID,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @InApp_Clear = 1 THEN NULL ELSE ISNULL(@InApp, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @SMS_Clear = 1 THEN NULL ELSE ISNULL(@SMS, NULL) END,
                ISNULL(@IsLocked, 0),
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ScopedNotificationConfig]
            (
                [NotificationTypeID],
                [Description],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [InApp],
                [Email],
                [SMS],
                [IsLocked],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @NotificationTypeID,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @InApp_Clear = 1 THEN NULL ELSE ISNULL(@InApp, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @SMS_Clear = 1 THEN NULL ELSE ISNULL(@SMS, NULL) END,
                ISNULL(@IsLocked, 0),
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScopedNotificationConfigs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScopedNotificationConfig] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Scoped Notification Configs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScopedNotificationConfig] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Scoped Notification Configs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scoped Notification Configs
-- Item: spUpdateScopedNotificationConfig
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScopedNotificationConfig
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScopedNotificationConfig]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScopedNotificationConfig];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScopedNotificationConfig]
    @ID uniqueidentifier,
    @NotificationTypeID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @InApp_Clear bit = 0,
    @InApp nvarchar(20) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(20) = NULL,
    @SMS_Clear bit = 0,
    @SMS nvarchar(20) = NULL,
    @IsLocked bit = NULL,
    @Priority int = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScopedNotificationConfig]
    SET
        [NotificationTypeID] = ISNULL(@NotificationTypeID, [NotificationTypeID]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [InApp] = CASE WHEN @InApp_Clear = 1 THEN NULL ELSE ISNULL(@InApp, [InApp]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [SMS] = CASE WHEN @SMS_Clear = 1 THEN NULL ELSE ISNULL(@SMS, [SMS]) END,
        [IsLocked] = ISNULL(@IsLocked, [IsLocked]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwScopedNotificationConfigs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScopedNotificationConfigs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScopedNotificationConfig] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScopedNotificationConfig table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateScopedNotificationConfig]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateScopedNotificationConfig];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScopedNotificationConfig
ON [${flyway:defaultSchema}].[ScopedNotificationConfig]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScopedNotificationConfig]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScopedNotificationConfig] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Scoped Notification Configs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScopedNotificationConfig] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Scoped Notification Configs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scoped Notification Configs
-- Item: spDeleteScopedNotificationConfig
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScopedNotificationConfig
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScopedNotificationConfig]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScopedNotificationConfig];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScopedNotificationConfig]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScopedNotificationConfig]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScopedNotificationConfig] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Scoped Notification Configs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScopedNotificationConfig] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b82dd394-590f-4a27-90fe-f25dd585e0d3' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'NotificationType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b82dd394-590f-4a27-90fe-f25dd585e0d3',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'NotificationType',
            'Notification Type',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a670edd-e388-4551-9953-5ee7a6e0f7aa' OR (EntityID = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND Name = 'PrimaryScopeEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0a670edd-e388-4551-9953-5ee7a6e0f7aa',
            '05323DF8-34B1-43B0-9D2F-F8BD8E366883', -- Entity: MJ: Scoped Notification Configs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883'),
            'PrimaryScopeEntity',
            'Primary Scope Entity',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '977545AA-1E83-48AE-8FCF-FC2568D1DCAC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '836EF9F0-9678-41E3-A340-40D3796BADCA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B82DD394-590F-4A27-90FE-F25DD585E0D3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0A670EDD-E388-4551-9953-5EE7A6E0F7AA'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.NotificationTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notification Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Notification Type'
WHERE 
   ID = 'BD692A9F-45C1-45C1-8A24-1A0786A2341E';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notification Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4D52283E-D284-4C0E-938C-31A9C11332B8';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.PrimaryScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0A670EDD-E388-4551-9953-5EE7A6E0F7AA';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.PrimaryScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '08D78F6E-CE9C-4B72-8944-849C8D7EC97B';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.PrimaryScopeRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0E5713EC-CC37-4260-B6A7-59675B81A89A';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.SecondaryScopes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '14A0C64F-88E3-4F22-993E-1AF4CD87F087';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.InApp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'In-App Channel'
WHERE 
   ID = '2010C79E-283F-4859-9A05-CA6EE1FBBA99';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Email Channel'
WHERE 
   ID = '3A550E7D-0333-489D-B0A4-26AF7A3C34FD';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.SMS 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'SMS Channel'
WHERE 
   ID = 'C101C3A9-A90E-44B4-BE0C-19BAB4455DFE';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9FE0E033-8474-478A-882A-592FE5AD0510';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '836EF9F0-9678-41E3-A340-40D3796BADCA';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.NotificationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Notification Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Notification Type Name'
WHERE 
   ID = 'B82DD394-590F-4A27-90FE-F25DD585E0D3';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0CF416DD-0AEE-4701-B187-193223F671F5';

-- UPDATE Entity Field Category Info MJ: Scoped Notification Configs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E1F8F192-C3BA-4D11-8C4B-B8BB470178F4';

/* Set entity icon to fa fa-bell */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-bell', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4c0667b6-35e6-52a0-8e4e-4fc417483a93', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'FieldCategoryInfo', '{
  "Channel Settings": {
    "description": "Determines whether specific communication channels are allowed or denied.",
    "icon": "fa fa-broadcast-tower"
  },
  "Notification Configuration": {
    "description": "General settings defining which notification type this configuration governs.",
    "icon": "fa fa-bell"
  },
  "Resolution Rules": {
    "description": "Logic for resolving conflicts and ordering of rules.",
    "icon": "fa fa-balance-scale"
  },
  "Scope Definition": {
    "description": "Defines the specific entities and records to which this notification rule applies.",
    "icon": "fa fa-crosshairs"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ed68da55-db42-5324-82d1-e2baa3d6b7ab', '05323DF8-34B1-43B0-9D2F-F8BD8E366883', 'FieldCategoryIcons', '{
  "Channel Settings": "fa fa-broadcast-tower",
  "Notification Configuration": "fa fa-bell",
  "Resolution Rules": "fa fa-balance-scale",
  "Scope Definition": "fa fa-crosshairs",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '05323DF8-34B1-43B0-9D2F-F8BD8E366883';
