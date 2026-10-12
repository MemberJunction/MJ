-- =====================================================================================
-- Conversation Forks
-- =====================================================================================
-- A ConversationBranch is a fork: another path of a conversation that starts at a message.
-- Main (the trunk) is the messages with BranchID NULL. A fork's path is its own messages plus
-- each ancestor's messages up to that ancestor's ForkFromSequence. Messages keep their global
-- per-conversation Sequence (trgConversationDetail_AssignSequence).
--
-- Deliberately NO FK from ConversationBranch to ConversationDetail (ForkFromSequence names
-- a Sequence, SourceDetailID a detail): it would form an FK cycle that CodeGen's cascade
-- ordering cannot resolve (see V202607241645__v5.50.x__Break_CodeGen_Cycle_Remove_PromptRun_AgentRunID).
--
-- ConversationDetail.ReplacedAt marks an answer that a rerun of its turn replaced (Edit or
-- Regenerate in place, for a person whose forking is off). The row is kept for audit; it is
-- never shown and never sent to an agent.
-- Design: docs/superpowers/specs/2026-10-07-conversation-forks-design.md
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[ConversationBranch] (
    [ID]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ConversationBranch_ID] DEFAULT (newsequentialid()),
    [ConversationID]   UNIQUEIDENTIFIER NOT NULL,
    [ParentBranchID]   UNIQUEIDENTIFIER NULL,
    [ForkFromSequence] INT              NULL,
    [Name]             NVARCHAR(255)    NULL,
    [Kind]             NVARCHAR(20)     NOT NULL CONSTRAINT [DF_ConversationBranch_Kind] DEFAULT ('Fork'),
    [SourceDetailID]   UNIQUEIDENTIFIER NULL,
    [UserID]           UNIQUEIDENTIFIER NOT NULL,

    CONSTRAINT [PK_ConversationBranch] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_ConversationBranch_Conversation] FOREIGN KEY ([ConversationID])
        REFERENCES [${flyway:defaultSchema}].[Conversation]([ID]),
    CONSTRAINT [FK_ConversationBranch_ParentBranch] FOREIGN KEY ([ParentBranchID])
        REFERENCES [${flyway:defaultSchema}].[ConversationBranch]([ID]),
    CONSTRAINT [FK_ConversationBranch_User] FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [CK_ConversationBranch_Kind] CHECK ([Kind] IN ('Fork', 'Edit', 'Regenerate'))
);
GO

ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
    ADD [BranchID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
    ADD CONSTRAINT [FK_ConversationDetail_Branch]
        FOREIGN KEY ([BranchID]) REFERENCES [${flyway:defaultSchema}].[ConversationBranch]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
    ADD [ReplacedAt] DATETIMEOFFSET NULL;
GO

-- -------------------------------------------------------------------------------------
-- Descriptions
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A fork of a conversation: another path that starts at a message. Main (the trunk) is the messages with no branch. A fork''s path is its own messages plus each ancestor''s messages up to that ancestor''s ForkFromSequence.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The conversation this fork belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'ConversationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The fork this one started from. NULL means it started from Main, or before the first message when ForkFromSequence is also NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'ParentBranchID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sequence of the last message shared with the parent path. NULL means the fork starts before the first message, in which case ParentBranchID is also NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'ForkFromSequence';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional name of the fork. With no name, the UI shows a default label from Kind: a Fork is named from its first message.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the fork started: Fork (Fork from here), Edit (a sent message was edited) or Regenerate (an answer was regenerated).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'Kind';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The edited message (Kind Edit) or the replaced answer (Kind Regenerate); NULL otherwise. Not a foreign key, to avoid a CodeGen cascade cycle with ConversationDetail.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'SourceDetailID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The person who started the fork.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationBranch',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The fork this message belongs to. NULL means Main (the trunk). Every writer sets it explicitly.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'BranchID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When a rerun of this message''s turn replaced it (Regenerate or Save and resend while forking is off). A replaced row is kept for audit, is hidden from the user and is never sent to an agent. NULL means the row is live.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'ReplacedAt';
GO


















































-- =====================================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- Everything below was produced by `mj codegen` from the hand-written DDL above:
-- Entity/EntityField/EntityPermission/ApplicationEntity rows, regenerated views,
-- spCreate/spUpdate/spDelete procedures, FK indexes, grants and extended properties.
-- If the DDL above changes, re-run CodeGen and replace this whole section.
-- The PostgreSQL counterpart is deferred to the release build.
-- =====================================================================================

/* SQL generated to create new entity MJ: Conversation Branches */

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
         'c43a32a6-3400-4a03-a0e3-8817d24c341d',
         'MJ: Conversation Branches',
         'Conversation Branches',
         'A fork of a conversation: another path that starts at a message. Main (the trunk) is the messages with no branch. A fork''s path is its own messages plus each ancestor''s messages up to that ancestor''s ForkFromSequence.',
         NULL,
         'ConversationBranch',
         'vwConversationBranches',
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

/* SQL generated to add new entity MJ: Conversation Branches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c43a32a6-3400-4a03-a0e3-8817d24c341d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Branches for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Conversation Branches for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Conversation Branches for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c43a32a6-3400-4a03-a0e3-8817d24c341d' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
ALTER TABLE [${flyway:defaultSchema}].[ConversationBranch] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
UPDATE [${flyway:defaultSchema}].[ConversationBranch] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
ALTER TABLE [${flyway:defaultSchema}].[ConversationBranch] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
ALTER TABLE [${flyway:defaultSchema}].[ConversationBranch] ADD CONSTRAINT [DF___mj_ConversationBranch___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
ALTER TABLE [${flyway:defaultSchema}].[ConversationBranch] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
UPDATE [${flyway:defaultSchema}].[ConversationBranch] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
ALTER TABLE [${flyway:defaultSchema}].[ConversationBranch] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationBranch */
ALTER TABLE [${flyway:defaultSchema}].[ConversationBranch] ADD CONSTRAINT [DF___mj_ConversationBranch___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eea65c41-e1ff-4976-ba32-aa4e0ba70463' OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'BranchID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eea65c41-e1ff-4976-ba32-aa4e0ba70463',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversation Details
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12248F34-2837-EF11-86D4-6045BDEE16E6'),
            'BranchID',
            'Branch ID',
            'The fork this message belongs to. NULL means Main (the trunk). Every writer sets it explicitly.',
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
            'C43A32A6-3400-4A03-A0E3-8817D24C341D',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '240c11f0-66f7-4242-a207-0b65e1d51067' OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplacedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '240c11f0-66f7-4242-a207-0b65e1d51067',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversation Details
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12248F34-2837-EF11-86D4-6045BDEE16E6'),
            'ReplacedAt',
            'Replaced At',
            'When a rerun of this message''s turn replaced it (Regenerate or Save and resend while forking is off). A replaced row is kept for audit, is hidden from the user and is never sent to an agent. NULL means the row is live.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cefe126b-0df6-4f94-b0b1-b5ea48c0c443' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cefe126b-0df6-4f94-b0b1-b5ea48c0c443',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5caaea2f-4fab-444c-8997-7d18220e5e29' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'ConversationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5caaea2f-4fab-444c-8997-7d18220e5e29',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'ConversationID',
            'Conversation ID',
            'The conversation this fork belongs to.',
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
            '13248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ece1c405-0c2e-42ae-8840-9de6faa5c029' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'ParentBranchID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ece1c405-0c2e-42ae-8840-9de6faa5c029',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'ParentBranchID',
            'Parent Branch ID',
            'The fork this one started from. NULL means it started from Main, or before the first message when ForkFromSequence is also NULL.',
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
            'C43A32A6-3400-4A03-A0E3-8817D24C341D',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9abb056-d80b-419a-b818-60f62ba07638' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'ForkFromSequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b9abb056-d80b-419a-b818-60f62ba07638',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'ForkFromSequence',
            'Fork From Sequence',
            'Sequence of the last message shared with the parent path. NULL means the fork starts before the first message, in which case ParentBranchID is also NULL.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d996e7b-e635-49de-a677-a9c2dd6530ba' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d996e7b-e635-49de-a677-a9c2dd6530ba',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'Name',
            'Name',
            'Optional name of the fork. With no name, the UI shows a default label from Kind: a Fork is named from its first message.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '649a9cdc-326b-4916-b469-a045204de013' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'Kind')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '649a9cdc-326b-4916-b469-a045204de013',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'Kind',
            'Kind',
            'How the fork started: Fork (Fork from here), Edit (a sent message was edited) or Regenerate (an answer was regenerated).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Fork',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec7d4c23-7652-468f-be0a-4873967125a7' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'SourceDetailID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ec7d4c23-7652-468f-be0a-4873967125a7',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'SourceDetailID',
            'Source Detail ID',
            'The edited message (Kind Edit) or the replaced answer (Kind Regenerate); NULL otherwise. Not a foreign key, to avoid a CodeGen cascade cycle with ConversationDetail.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec1290ea-a783-4dd5-b374-f22ff6805f02' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ec1290ea-a783-4dd5-b374-f22ff6805f02',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'UserID',
            'User ID',
            'The person who started the fork.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ea4cb32-3ac6-498e-a032-5a9a415dc14f' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ea4cb32-3ac6-498e-a032-5a9a415dc14f',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04101288-1659-433b-9f81-0a8a49e43547' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '04101288-1659-433b-9f81-0a8a49e43547',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
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

/* SQL text to insert entity field value with ID aada0665-57c6-4fa9-9abe-5bcfa8147319 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aada0665-57c6-4fa9-9abe-5bcfa8147319', '649A9CDC-326B-4916-B469-A045204DE013', 1, 'Edit', 'Edit', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 737335d8-20c4-4b1b-b509-d984be6c3b8e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('737335d8-20c4-4b1b-b509-d984be6c3b8e', '649A9CDC-326B-4916-B469-A045204DE013', 2, 'Fork', 'Fork', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3c375eb7-3913-4de9-8113-854bd545c31d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c375eb7-3913-4de9-8113-854bd545c31d', '649A9CDC-326B-4916-B469-A045204DE013', 3, 'Regenerate', 'Regenerate', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 649A9CDC-326B-4916-B469-A045204DE013 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='649A9CDC-326B-4916-B469-A045204DE013';


/* Create Entity Relationship: MJ: Users -> MJ: Conversation Branches (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bea04ea5-cb08-497b-9e29-6730cbd5536c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bea04ea5-cb08-497b-9e29-6730cbd5536c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'UserID', 'One To Many', 1, 1, 118, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversations -> MJ: Conversation Branches (One To Many via ConversationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0b5144a8-c7ad-49c2-b8b7-142c224f86ea'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0b5144a8-c7ad-49c2-b8b7-142c224f86ea', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'ConversationID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversation Branches -> MJ: Conversation Details (One To Many via BranchID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd36a4884-e5a4-43e1-8f0a-a3e09440eb60'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d36a4884-e5a4-43e1-8f0a-a3e09440eb60', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'BranchID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Conversation Branches -> MJ: Conversation Branches (One To Many via ParentBranchID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0e18636b-23bc-4a6d-b8c2-019daeb233a9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0e18636b-23bc-4a6d-b8c2-019daeb233a9', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'ParentBranchID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ConversationBranch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationBranch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationBranch_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationBranch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationBranch_ConversationID ON [${flyway:defaultSchema}].[ConversationBranch] ([ConversationID]);

-- Index for foreign key ParentBranchID in table ConversationBranch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationBranch_ParentBranchID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationBranch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationBranch_ParentBranchID ON [${flyway:defaultSchema}].[ConversationBranch] ([ParentBranchID]);

-- Index for foreign key UserID in table ConversationBranch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationBranch_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationBranch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationBranch_UserID ON [${flyway:defaultSchema}].[ConversationBranch] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID 5CAAEA2F-4FAB-444C-8997-7D18220E5E29 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5CAAEA2F-4FAB-444C-8997-7D18220E5E29', @RelatedEntityNameFieldMap='Conversation';

/* SQL text to update entity field related entity name field map for entity field ID ECE1C405-0C2E-42AE-8840-9DE6FAA5C029 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ECE1C405-0C2E-42AE-8840-9DE6FAA5C029', @RelatedEntityNameFieldMap='ParentBranch';

/* SQL text to update entity field related entity name field map for entity field ID EC1290EA-A783-4DD5-B374-F22FF6805F02 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EC1290EA-A783-4DD5-B374-F22FF6805F02', @RelatedEntityNameFieldMap='User';

/* Base View SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: vwConversationBranches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Branches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationBranch
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationBranches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationBranches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationBranches]
AS
SELECT
    c.*,
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJConversationBranch_ParentBranchID.[Name] AS [ParentBranch],
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ConversationBranch] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [c].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationBranch] AS MJConversationBranch_ParentBranchID
  ON
    [c].[ParentBranchID] = MJConversationBranch_ParentBranchID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationBranches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: Permissions for vwConversationBranches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationBranches] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: spCreateConversationBranch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationBranch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationBranch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationBranch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationBranch]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ParentBranchID_Clear bit = 0,
    @ParentBranchID uniqueidentifier = NULL,
    @ForkFromSequence_Clear bit = 0,
    @ForkFromSequence int = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Kind nvarchar(20) = NULL,
    @SourceDetailID_Clear bit = 0,
    @SourceDetailID uniqueidentifier = NULL,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationBranch]
            (
                [ID],
                [ConversationID],
                [ParentBranchID],
                [ForkFromSequence],
                [Name],
                [Kind],
                [SourceDetailID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                CASE WHEN @ParentBranchID_Clear = 1 THEN NULL ELSE ISNULL(@ParentBranchID, NULL) END,
                CASE WHEN @ForkFromSequence_Clear = 1 THEN NULL ELSE ISNULL(@ForkFromSequence, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                ISNULL(@Kind, 'Fork'),
                CASE WHEN @SourceDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceDetailID, NULL) END,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationBranch]
            (
                [ConversationID],
                [ParentBranchID],
                [ForkFromSequence],
                [Name],
                [Kind],
                [SourceDetailID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                CASE WHEN @ParentBranchID_Clear = 1 THEN NULL ELSE ISNULL(@ParentBranchID, NULL) END,
                CASE WHEN @ForkFromSequence_Clear = 1 THEN NULL ELSE ISNULL(@ForkFromSequence, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                ISNULL(@Kind, 'Fork'),
                CASE WHEN @SourceDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceDetailID, NULL) END,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationBranches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationBranch] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Branches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationBranch] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: spUpdateConversationBranch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationBranch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationBranch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationBranch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationBranch]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier = NULL,
    @ParentBranchID_Clear bit = 0,
    @ParentBranchID uniqueidentifier = NULL,
    @ForkFromSequence_Clear bit = 0,
    @ForkFromSequence int = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Kind nvarchar(20) = NULL,
    @SourceDetailID_Clear bit = 0,
    @SourceDetailID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationBranch]
    SET
        [ConversationID] = ISNULL(@ConversationID, [ConversationID]),
        [ParentBranchID] = CASE WHEN @ParentBranchID_Clear = 1 THEN NULL ELSE ISNULL(@ParentBranchID, [ParentBranchID]) END,
        [ForkFromSequence] = CASE WHEN @ForkFromSequence_Clear = 1 THEN NULL ELSE ISNULL(@ForkFromSequence, [ForkFromSequence]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Kind] = ISNULL(@Kind, [Kind]),
        [SourceDetailID] = CASE WHEN @SourceDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceDetailID, [SourceDetailID]) END,
        [UserID] = ISNULL(@UserID, [UserID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationBranches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationBranches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationBranch] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationBranch table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationBranch]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationBranch];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationBranch
ON [${flyway:defaultSchema}].[ConversationBranch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationBranch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationBranch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Branches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationBranch] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: spDeleteConversationBranch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationBranch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationBranch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationBranch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationBranch]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationBranch]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationBranch] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Branches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationBranch] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID]);

-- Index for foreign key UserID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_UserID ON [${flyway:defaultSchema}].[ConversationDetail] ([UserID]);

-- Index for foreign key ArtifactID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactID]);

-- Index for foreign key ArtifactVersionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID ON [${flyway:defaultSchema}].[ConversationDetail] ([ArtifactVersionID]);

-- Index for foreign key ParentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID ON [${flyway:defaultSchema}].[ConversationDetail] ([ParentID]);

-- Index for foreign key AgentID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID ON [${flyway:defaultSchema}].[ConversationDetail] ([AgentID]);

-- Index for foreign key TestRunID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID ON [${flyway:defaultSchema}].[ConversationDetail] ([TestRunID]);

-- Index for foreign key AgentSessionID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_AgentSessionID ON [${flyway:defaultSchema}].[ConversationDetail] ([AgentSessionID]);

-- Index for foreign key BranchID in table ConversationDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetail_BranchID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetail_BranchID ON [${flyway:defaultSchema}].[ConversationDetail] ([BranchID]);

/* SQL text to update entity field related entity name field map for entity field ID EEA65C41-E1FF-4976-BA32-AA4E0BA70463 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EEA65C41-E1FF-4976-BA32-AA4E0BA70463', @RelatedEntityNameFieldMap='Branch';

/* Hierarchy Metadata Function SQL for MJ: Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ConversationDetail] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ConversationDetail] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ConversationDetail] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ConversationDetail] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: Conversation Details.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: fnConversationDetailParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ConversationDetail].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ConversationDetail] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationArtifact_ArtifactID.[Name] AS [Artifact],
    MJConversationArtifactVersion_ArtifactVersionID.[ConversationArtifact] AS [ArtifactVersion],
    MJConversationDetail_ParentID.[ExternalID] AS [Parent],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJConversationBranch_BranchID.[Name] AS [Branch],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [c].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS MJConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = MJConversationArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwConversationArtifactVersions] AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJConversationArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ParentID
  ON
    [c].[ParentID] = MJConversationDetail_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [c].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [c].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationBranch] AS MJConversationBranch_BranchID
  ON
    [c].[BranchID] = MJConversationBranch_BranchID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationDetailParentID_GetHierarchyMeta]([c].[ID], [c].[ParentID]) AS hier_ParentID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @TurnEndedAt_Clear bit = 0,
    @TurnEndedAt datetimeoffset = NULL,
    @UtteranceStartMs_Clear bit = 0,
    @UtteranceStartMs int = NULL,
    @UtteranceEndMs_Clear bit = 0,
    @UtteranceEndMs int = NULL,
    @MediaType_Clear bit = 0,
    @MediaType nvarchar(20) = NULL,
    @BranchID_Clear bit = 0,
    @BranchID uniqueidentifier = NULL,
    @ReplacedAt_Clear bit = 0,
    @ReplacedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID],
                [TurnEndedAt],
                [UtteranceStartMs],
                [UtteranceEndMs],
                [MediaType],
                [BranchID],
                [ReplacedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, user_name()),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, NULL) END,
                CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, NULL) END,
                CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, NULL) END,
                CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, NULL) END,
                CASE WHEN @BranchID_Clear = 1 THEN NULL ELSE ISNULL(@BranchID, NULL) END,
                CASE WHEN @ReplacedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplacedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged],
                [AgentSessionID],
                [TurnEndedAt],
                [UtteranceStartMs],
                [UtteranceEndMs],
                [MediaType],
                [BranchID],
                [ReplacedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                ISNULL(@Role, user_name()),
                @Message,
                CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, NULL) END,
                ISNULL(@HiddenToUser, 0),
                CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, NULL) END,
                CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, NULL) END,
                CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, NULL) END,
                CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, NULL) END,
                CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, NULL) END,
                CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, NULL) END,
                ISNULL(@OriginalMessageChanged, 0),
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, NULL) END,
                CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, NULL) END,
                CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, NULL) END,
                CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, NULL) END,
                CASE WHEN @BranchID_Clear = 1 THEN NULL ELSE ISNULL(@BranchID, NULL) END,
                CASE WHEN @ReplacedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplacedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Details */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(100) = NULL,
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX) = NULL,
    @Error_Clear bit = 0,
    @Error nvarchar(MAX) = NULL,
    @HiddenToUser bit = NULL,
    @UserRating_Clear bit = 0,
    @UserRating int = NULL,
    @UserFeedback_Clear bit = 0,
    @UserFeedback nvarchar(MAX) = NULL,
    @ReflectionInsights_Clear bit = 0,
    @ReflectionInsights nvarchar(MAX) = NULL,
    @SummaryOfEarlierConversation_Clear bit = 0,
    @SummaryOfEarlierConversation nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @ArtifactVersionID_Clear bit = 0,
    @ArtifactVersionID uniqueidentifier = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime bigint = NULL,
    @IsPinned bit = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses_Clear bit = 0,
    @SuggestedResponses nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ResponseForm_Clear bit = 0,
    @ResponseForm nvarchar(MAX) = NULL,
    @ActionableCommands_Clear bit = 0,
    @ActionableCommands nvarchar(MAX) = NULL,
    @AutomaticCommands_Clear bit = 0,
    @AutomaticCommands nvarchar(MAX) = NULL,
    @OriginalMessageChanged bit = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @TurnEndedAt_Clear bit = 0,
    @TurnEndedAt datetimeoffset = NULL,
    @UtteranceStartMs_Clear bit = 0,
    @UtteranceStartMs int = NULL,
    @UtteranceEndMs_Clear bit = 0,
    @UtteranceEndMs int = NULL,
    @MediaType_Clear bit = 0,
    @MediaType nvarchar(20) = NULL,
    @BranchID_Clear bit = 0,
    @BranchID uniqueidentifier = NULL,
    @ReplacedAt_Clear bit = 0,
    @ReplacedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = ISNULL(@ConversationID, [ConversationID]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [Role] = ISNULL(@Role, [Role]),
        [Message] = ISNULL(@Message, [Message]),
        [Error] = CASE WHEN @Error_Clear = 1 THEN NULL ELSE ISNULL(@Error, [Error]) END,
        [HiddenToUser] = ISNULL(@HiddenToUser, [HiddenToUser]),
        [UserRating] = CASE WHEN @UserRating_Clear = 1 THEN NULL ELSE ISNULL(@UserRating, [UserRating]) END,
        [UserFeedback] = CASE WHEN @UserFeedback_Clear = 1 THEN NULL ELSE ISNULL(@UserFeedback, [UserFeedback]) END,
        [ReflectionInsights] = CASE WHEN @ReflectionInsights_Clear = 1 THEN NULL ELSE ISNULL(@ReflectionInsights, [ReflectionInsights]) END,
        [SummaryOfEarlierConversation] = CASE WHEN @SummaryOfEarlierConversation_Clear = 1 THEN NULL ELSE ISNULL(@SummaryOfEarlierConversation, [SummaryOfEarlierConversation]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [ArtifactID] = CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, [ArtifactID]) END,
        [ArtifactVersionID] = CASE WHEN @ArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactVersionID, [ArtifactVersionID]) END,
        [CompletionTime] = CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, [CompletionTime]) END,
        [IsPinned] = ISNULL(@IsPinned, [IsPinned]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SuggestedResponses] = CASE WHEN @SuggestedResponses_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedResponses, [SuggestedResponses]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [ResponseForm] = CASE WHEN @ResponseForm_Clear = 1 THEN NULL ELSE ISNULL(@ResponseForm, [ResponseForm]) END,
        [ActionableCommands] = CASE WHEN @ActionableCommands_Clear = 1 THEN NULL ELSE ISNULL(@ActionableCommands, [ActionableCommands]) END,
        [AutomaticCommands] = CASE WHEN @AutomaticCommands_Clear = 1 THEN NULL ELSE ISNULL(@AutomaticCommands, [AutomaticCommands]) END,
        [OriginalMessageChanged] = ISNULL(@OriginalMessageChanged, [OriginalMessageChanged]),
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END,
        [TurnEndedAt] = CASE WHEN @TurnEndedAt_Clear = 1 THEN NULL ELSE ISNULL(@TurnEndedAt, [TurnEndedAt]) END,
        [UtteranceStartMs] = CASE WHEN @UtteranceStartMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceStartMs, [UtteranceStartMs]) END,
        [UtteranceEndMs] = CASE WHEN @UtteranceEndMs_Clear = 1 THEN NULL ELSE ISNULL(@UtteranceEndMs, [UtteranceEndMs]) END,
        [MediaType] = CASE WHEN @MediaType_Clear = 1 THEN NULL ELSE ISNULL(@MediaType, [MediaType]) END,
        [BranchID] = CASE WHEN @BranchID_Clear = 1 THEN NULL ELSE ISNULL(@BranchID, [BranchID]) END,
        [ReplacedAt] = CASE WHEN @ReplacedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReplacedAt, [ReplacedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Details */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationDetailIDID, @AgentID = @MJAIAgentExamples_SourceConversationDetailID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationDetailID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationDetailID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationDetailID_Comments, @Status = @MJAIAgentExamples_SourceConversationDetailID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt, @EmbeddingVectorBinary = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @MJAIAgentNotes_SourceConversationDetailID_AuthorType, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationDetailIDID, @AgentID = @MJAIAgentNotes_SourceConversationDetailID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationDetailID_Note, @UserID = @MJAIAgentNotes_SourceConversationDetailID_UserID, @Type = @MJAIAgentNotes_SourceConversationDetailID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationDetailID_Comments, @Status = @MJAIAgentNotes_SourceConversationDetailID_Status, @SourceConversationID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID_Clear = 1, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceConversationDetailID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, @MJAIAgentNotes_SourceConversationDetailID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, @MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, @MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, @MJAIAgentNotes_SourceConversationDetailID_AuthorType, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_Success bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationDetailID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationDetailID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PlanMode bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @MJAIAgentRuns_ConversationDetailID_PlanMode, @MJAIAgentRuns_ConversationDetailID_ExternalSessionID, @MJAIAgentRuns_ConversationDetailID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationDetailIDID, @AgentID = @MJAIAgentRuns_ConversationDetailID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationDetailID_ParentRunID, @Status = @MJAIAgentRuns_ConversationDetailID_Status, @StartedAt = @MJAIAgentRuns_ConversationDetailID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationDetailID_CompletedAt, @Success = @MJAIAgentRuns_ConversationDetailID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConversationDetailID_ConversationID, @UserID = @MJAIAgentRuns_ConversationDetailID_UserID, @Result = @MJAIAgentRuns_ConversationDetailID_Result, @AgentState = @MJAIAgentRuns_ConversationDetailID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationDetailID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationDetailID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationDetailID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationDetailID_FinalPayload, @Message = @MJAIAgentRuns_ConversationDetailID_Message, @LastRunID = @MJAIAgentRuns_ConversationDetailID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationDetailID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationDetailID_Data, @Verbose = @MJAIAgentRuns_ConversationDetailID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationDetailID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationDetailID_RunName, @Comments = @MJAIAgentRuns_ConversationDetailID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationDetailID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationDetailID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationDetailID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ConversationDetailID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ConversationDetailID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes, @MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, @MJAIAgentRuns_ConversationDetailID_CompanyID, @MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, @MJAIAgentRuns_ConversationDetailID_AgentSessionID, @MJAIAgentRuns_ConversationDetailID_PlanMode, @MJAIAgentRuns_ConversationDetailID_ExternalSessionID, @MJAIAgentRuns_ConversationDetailID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun
    DECLARE @MJConversationCompactionRuns_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationCompactionRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor INTO @MJConversationCompactionRuns_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] @ID = @MJConversationCompactionRuns_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor INTO @MJConversationCompactionRuns_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationCompactionRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJConversationDetailArtifacts_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJConversationDetailArtifacts_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJConversationDetailAttachments_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJConversationDetailAttachments_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJConversationDetailRatings_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJConversationDetailRatings_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ParentIDID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ParentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_HiddenToUser bit
    DECLARE @MJConversationDetails_ParentID_UserRating int
    DECLARE @MJConversationDetails_ParentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_CompletionTime bigint
    DECLARE @MJConversationDetails_ParentID_IsPinned bit
    DECLARE @MJConversationDetails_ParentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ParentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_ParentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_ParentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_ParentID_MediaType nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_BranchID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ReplacedAt datetimeoffset
    DECLARE cascade_update_MJConversationDetails_ParentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType], [BranchID], [ReplacedAt]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJConversationDetails_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID, @MJConversationDetails_ParentID_TurnEndedAt, @MJConversationDetails_ParentID_UtteranceStartMs, @MJConversationDetails_ParentID_UtteranceEndMs, @MJConversationDetails_ParentID_MediaType, @MJConversationDetails_ParentID_BranchID, @MJConversationDetails_ParentID_ReplacedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ParentIDID, @ConversationID = @MJConversationDetails_ParentID_ConversationID, @ExternalID = @MJConversationDetails_ParentID_ExternalID, @Role = @MJConversationDetails_ParentID_Role, @Message = @MJConversationDetails_ParentID_Message, @Error = @MJConversationDetails_ParentID_Error, @HiddenToUser = @MJConversationDetails_ParentID_HiddenToUser, @UserRating = @MJConversationDetails_ParentID_UserRating, @UserFeedback = @MJConversationDetails_ParentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ParentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ParentID_UserID, @ArtifactID = @MJConversationDetails_ParentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ParentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ParentID_CompletionTime, @IsPinned = @MJConversationDetails_ParentID_IsPinned, @ParentID_Clear = 1, @ParentID = @MJConversationDetails_ParentID_ParentID, @AgentID = @MJConversationDetails_ParentID_AgentID, @Status = @MJConversationDetails_ParentID_Status, @SuggestedResponses = @MJConversationDetails_ParentID_SuggestedResponses, @TestRunID = @MJConversationDetails_ParentID_TestRunID, @ResponseForm = @MJConversationDetails_ParentID_ResponseForm, @ActionableCommands = @MJConversationDetails_ParentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ParentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ParentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ParentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_ParentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_ParentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_ParentID_UtteranceEndMs, @MediaType = @MJConversationDetails_ParentID_MediaType, @BranchID = @MJConversationDetails_ParentID_BranchID, @ReplacedAt = @MJConversationDetails_ParentID_ReplacedAt

        FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged, @MJConversationDetails_ParentID_AgentSessionID, @MJConversationDetails_ParentID_TurnEndedAt, @MJConversationDetails_ParentID_UtteranceStartMs, @MJConversationDetails_ParentID_UtteranceEndMs, @MJConversationDetails_ParentID_MediaType, @MJConversationDetails_ParentID_BranchID, @MJConversationDetails_ParentID_ReplacedAt
    END

    CLOSE cascade_update_MJConversationDetails_ParentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ParentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ConversationDetailIDID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ParentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJTasks_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_TypeID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJTasks_ConversationDetailID_PercentComplete int
    DECLARE @MJTasks_ConversationDetailID_DueAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_ConversationDetailID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_ActionID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_StepType nvarchar(20)
    DECLARE @MJTasks_ConversationDetailID_PromptID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJTasks_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt, @MJTasks_ConversationDetailID_InputPayload, @MJTasks_ConversationDetailID_OutputPayload, @MJTasks_ConversationDetailID_ErrorMessage, @MJTasks_ConversationDetailID_AgentRunID, @MJTasks_ConversationDetailID_ClaimedBy, @MJTasks_ConversationDetailID_ClaimExpiresAt, @MJTasks_ConversationDetailID_ActionID, @MJTasks_ConversationDetailID_StepType, @MJTasks_ConversationDetailID_PromptID, @MJTasks_ConversationDetailID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ConversationDetailIDID, @ParentID = @MJTasks_ConversationDetailID_ParentID, @Name = @MJTasks_ConversationDetailID_Name, @Description = @MJTasks_ConversationDetailID_Description, @TypeID = @MJTasks_ConversationDetailID_TypeID, @EnvironmentID = @MJTasks_ConversationDetailID_EnvironmentID, @ProjectID = @MJTasks_ConversationDetailID_ProjectID, @ConversationDetailID_Clear = 1, @ConversationDetailID = @MJTasks_ConversationDetailID_ConversationDetailID, @UserID = @MJTasks_ConversationDetailID_UserID, @AgentID = @MJTasks_ConversationDetailID_AgentID, @Status = @MJTasks_ConversationDetailID_Status, @PercentComplete = @MJTasks_ConversationDetailID_PercentComplete, @DueAt = @MJTasks_ConversationDetailID_DueAt, @StartedAt = @MJTasks_ConversationDetailID_StartedAt, @CompletedAt = @MJTasks_ConversationDetailID_CompletedAt, @InputPayload = @MJTasks_ConversationDetailID_InputPayload, @OutputPayload = @MJTasks_ConversationDetailID_OutputPayload, @ErrorMessage = @MJTasks_ConversationDetailID_ErrorMessage, @AgentRunID = @MJTasks_ConversationDetailID_AgentRunID, @ClaimedBy = @MJTasks_ConversationDetailID_ClaimedBy, @ClaimExpiresAt = @MJTasks_ConversationDetailID_ClaimExpiresAt, @ActionID = @MJTasks_ConversationDetailID_ActionID, @StepType = @MJTasks_ConversationDetailID_StepType, @PromptID = @MJTasks_ConversationDetailID_PromptID, @Configuration = @MJTasks_ConversationDetailID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt, @MJTasks_ConversationDetailID_InputPayload, @MJTasks_ConversationDetailID_OutputPayload, @MJTasks_ConversationDetailID_ErrorMessage, @MJTasks_ConversationDetailID_AgentRunID, @MJTasks_ConversationDetailID_ClaimedBy, @MJTasks_ConversationDetailID_ClaimExpiresAt, @MJTasks_ConversationDetailID_ActionID, @MJTasks_ConversationDetailID_StepType, @MJTasks_ConversationDetailID_PromptID, @MJTasks_ConversationDetailID_Configuration
    END

    CLOSE cascade_update_MJTasks_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJTasks_ConversationDetailID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Details */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ArtifactVersionIDID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ArtifactVersionID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactVersionID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_HiddenToUser bit
    DECLARE @MJConversationDetails_ArtifactVersionID_UserRating int
    DECLARE @MJConversationDetails_ArtifactVersionID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_CompletionTime bigint
    DECLARE @MJConversationDetails_ArtifactVersionID_IsPinned bit
    DECLARE @MJConversationDetails_ArtifactVersionID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactVersionID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ArtifactVersionID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_ArtifactVersionID_UtteranceStartMs int
    DECLARE @MJConversationDetails_ArtifactVersionID_UtteranceEndMs int
    DECLARE @MJConversationDetails_ArtifactVersionID_MediaType nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactVersionID_BranchID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactVersionID_ReplacedAt datetimeoffset
    DECLARE cascade_update_MJConversationDetails_ArtifactVersionID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType], [BranchID], [ReplacedAt]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactVersionID] = @ID

    OPEN cascade_update_MJConversationDetails_ArtifactVersionID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactVersionID_cursor INTO @MJConversationDetails_ArtifactVersionIDID, @MJConversationDetails_ArtifactVersionID_ConversationID, @MJConversationDetails_ArtifactVersionID_ExternalID, @MJConversationDetails_ArtifactVersionID_Role, @MJConversationDetails_ArtifactVersionID_Message, @MJConversationDetails_ArtifactVersionID_Error, @MJConversationDetails_ArtifactVersionID_HiddenToUser, @MJConversationDetails_ArtifactVersionID_UserRating, @MJConversationDetails_ArtifactVersionID_UserFeedback, @MJConversationDetails_ArtifactVersionID_ReflectionInsights, @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactVersionID_UserID, @MJConversationDetails_ArtifactVersionID_ArtifactID, @MJConversationDetails_ArtifactVersionID_ArtifactVersionID, @MJConversationDetails_ArtifactVersionID_CompletionTime, @MJConversationDetails_ArtifactVersionID_IsPinned, @MJConversationDetails_ArtifactVersionID_ParentID, @MJConversationDetails_ArtifactVersionID_AgentID, @MJConversationDetails_ArtifactVersionID_Status, @MJConversationDetails_ArtifactVersionID_SuggestedResponses, @MJConversationDetails_ArtifactVersionID_TestRunID, @MJConversationDetails_ArtifactVersionID_ResponseForm, @MJConversationDetails_ArtifactVersionID_ActionableCommands, @MJConversationDetails_ArtifactVersionID_AutomaticCommands, @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged, @MJConversationDetails_ArtifactVersionID_AgentSessionID, @MJConversationDetails_ArtifactVersionID_TurnEndedAt, @MJConversationDetails_ArtifactVersionID_UtteranceStartMs, @MJConversationDetails_ArtifactVersionID_UtteranceEndMs, @MJConversationDetails_ArtifactVersionID_MediaType, @MJConversationDetails_ArtifactVersionID_BranchID, @MJConversationDetails_ArtifactVersionID_ReplacedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ArtifactVersionID_ArtifactVersionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ArtifactVersionIDID, @ConversationID = @MJConversationDetails_ArtifactVersionID_ConversationID, @ExternalID = @MJConversationDetails_ArtifactVersionID_ExternalID, @Role = @MJConversationDetails_ArtifactVersionID_Role, @Message = @MJConversationDetails_ArtifactVersionID_Message, @Error = @MJConversationDetails_ArtifactVersionID_Error, @HiddenToUser = @MJConversationDetails_ArtifactVersionID_HiddenToUser, @UserRating = @MJConversationDetails_ArtifactVersionID_UserRating, @UserFeedback = @MJConversationDetails_ArtifactVersionID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ArtifactVersionID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ArtifactVersionID_UserID, @ArtifactID = @MJConversationDetails_ArtifactVersionID_ArtifactID, @ArtifactVersionID_Clear = 1, @ArtifactVersionID = @MJConversationDetails_ArtifactVersionID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ArtifactVersionID_CompletionTime, @IsPinned = @MJConversationDetails_ArtifactVersionID_IsPinned, @ParentID = @MJConversationDetails_ArtifactVersionID_ParentID, @AgentID = @MJConversationDetails_ArtifactVersionID_AgentID, @Status = @MJConversationDetails_ArtifactVersionID_Status, @SuggestedResponses = @MJConversationDetails_ArtifactVersionID_SuggestedResponses, @TestRunID = @MJConversationDetails_ArtifactVersionID_TestRunID, @ResponseForm = @MJConversationDetails_ArtifactVersionID_ResponseForm, @ActionableCommands = @MJConversationDetails_ArtifactVersionID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ArtifactVersionID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ArtifactVersionID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_ArtifactVersionID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_ArtifactVersionID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_ArtifactVersionID_UtteranceEndMs, @MediaType = @MJConversationDetails_ArtifactVersionID_MediaType, @BranchID = @MJConversationDetails_ArtifactVersionID_BranchID, @ReplacedAt = @MJConversationDetails_ArtifactVersionID_ReplacedAt

        FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactVersionID_cursor INTO @MJConversationDetails_ArtifactVersionIDID, @MJConversationDetails_ArtifactVersionID_ConversationID, @MJConversationDetails_ArtifactVersionID_ExternalID, @MJConversationDetails_ArtifactVersionID_Role, @MJConversationDetails_ArtifactVersionID_Message, @MJConversationDetails_ArtifactVersionID_Error, @MJConversationDetails_ArtifactVersionID_HiddenToUser, @MJConversationDetails_ArtifactVersionID_UserRating, @MJConversationDetails_ArtifactVersionID_UserFeedback, @MJConversationDetails_ArtifactVersionID_ReflectionInsights, @MJConversationDetails_ArtifactVersionID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactVersionID_UserID, @MJConversationDetails_ArtifactVersionID_ArtifactID, @MJConversationDetails_ArtifactVersionID_ArtifactVersionID, @MJConversationDetails_ArtifactVersionID_CompletionTime, @MJConversationDetails_ArtifactVersionID_IsPinned, @MJConversationDetails_ArtifactVersionID_ParentID, @MJConversationDetails_ArtifactVersionID_AgentID, @MJConversationDetails_ArtifactVersionID_Status, @MJConversationDetails_ArtifactVersionID_SuggestedResponses, @MJConversationDetails_ArtifactVersionID_TestRunID, @MJConversationDetails_ArtifactVersionID_ResponseForm, @MJConversationDetails_ArtifactVersionID_ActionableCommands, @MJConversationDetails_ArtifactVersionID_AutomaticCommands, @MJConversationDetails_ArtifactVersionID_OriginalMessageChanged, @MJConversationDetails_ArtifactVersionID_AgentSessionID, @MJConversationDetails_ArtifactVersionID_TurnEndedAt, @MJConversationDetails_ArtifactVersionID_UtteranceStartMs, @MJConversationDetails_ArtifactVersionID_UtteranceEndMs, @MJConversationDetails_ArtifactVersionID_MediaType, @MJConversationDetails_ArtifactVersionID_BranchID, @MJConversationDetails_ArtifactVersionID_ReplacedAt
    END

    CLOSE cascade_update_MJConversationDetails_ArtifactVersionID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ArtifactVersionID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifactVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Artifact Versions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission
    DECLARE @MJConversationArtifactPermissions_ConversationArtifactIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactPermission]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor INTO @MJConversationArtifactPermissions_ConversationArtifactIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactPermission] @ID = @MJConversationArtifactPermissions_ConversationArtifactIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor INTO @MJConversationArtifactPermissions_ConversationArtifactIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifactPermissions_ConversationArtifactID_cursor
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion
    DECLARE @MJConversationArtifactVersions_ConversationArtifactIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifactVersion]
        WHERE [ConversationArtifactID] = @ID
    
    OPEN cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor INTO @MJConversationArtifactVersions_ConversationArtifactIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifactVersion] @ID = @MJConversationArtifactVersions_ConversationArtifactIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor INTO @MJConversationArtifactVersions_ConversationArtifactIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifactVersions_ConversationArtifactID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ArtifactIDID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ArtifactID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_HiddenToUser bit
    DECLARE @MJConversationDetails_ArtifactID_UserRating int
    DECLARE @MJConversationDetails_ArtifactID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_CompletionTime bigint
    DECLARE @MJConversationDetails_ArtifactID_IsPinned bit
    DECLARE @MJConversationDetails_ArtifactID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ArtifactID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_ArtifactID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_ArtifactID_UtteranceStartMs int
    DECLARE @MJConversationDetails_ArtifactID_UtteranceEndMs int
    DECLARE @MJConversationDetails_ArtifactID_MediaType nvarchar(20)
    DECLARE @MJConversationDetails_ArtifactID_BranchID uniqueidentifier
    DECLARE @MJConversationDetails_ArtifactID_ReplacedAt datetimeoffset
    DECLARE cascade_update_MJConversationDetails_ArtifactID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType], [BranchID], [ReplacedAt]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ArtifactID] = @ID

    OPEN cascade_update_MJConversationDetails_ArtifactID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactID_cursor INTO @MJConversationDetails_ArtifactIDID, @MJConversationDetails_ArtifactID_ConversationID, @MJConversationDetails_ArtifactID_ExternalID, @MJConversationDetails_ArtifactID_Role, @MJConversationDetails_ArtifactID_Message, @MJConversationDetails_ArtifactID_Error, @MJConversationDetails_ArtifactID_HiddenToUser, @MJConversationDetails_ArtifactID_UserRating, @MJConversationDetails_ArtifactID_UserFeedback, @MJConversationDetails_ArtifactID_ReflectionInsights, @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactID_UserID, @MJConversationDetails_ArtifactID_ArtifactID, @MJConversationDetails_ArtifactID_ArtifactVersionID, @MJConversationDetails_ArtifactID_CompletionTime, @MJConversationDetails_ArtifactID_IsPinned, @MJConversationDetails_ArtifactID_ParentID, @MJConversationDetails_ArtifactID_AgentID, @MJConversationDetails_ArtifactID_Status, @MJConversationDetails_ArtifactID_SuggestedResponses, @MJConversationDetails_ArtifactID_TestRunID, @MJConversationDetails_ArtifactID_ResponseForm, @MJConversationDetails_ArtifactID_ActionableCommands, @MJConversationDetails_ArtifactID_AutomaticCommands, @MJConversationDetails_ArtifactID_OriginalMessageChanged, @MJConversationDetails_ArtifactID_AgentSessionID, @MJConversationDetails_ArtifactID_TurnEndedAt, @MJConversationDetails_ArtifactID_UtteranceStartMs, @MJConversationDetails_ArtifactID_UtteranceEndMs, @MJConversationDetails_ArtifactID_MediaType, @MJConversationDetails_ArtifactID_BranchID, @MJConversationDetails_ArtifactID_ReplacedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ArtifactID_ArtifactID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ArtifactIDID, @ConversationID = @MJConversationDetails_ArtifactID_ConversationID, @ExternalID = @MJConversationDetails_ArtifactID_ExternalID, @Role = @MJConversationDetails_ArtifactID_Role, @Message = @MJConversationDetails_ArtifactID_Message, @Error = @MJConversationDetails_ArtifactID_Error, @HiddenToUser = @MJConversationDetails_ArtifactID_HiddenToUser, @UserRating = @MJConversationDetails_ArtifactID_UserRating, @UserFeedback = @MJConversationDetails_ArtifactID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ArtifactID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ArtifactID_UserID, @ArtifactID_Clear = 1, @ArtifactID = @MJConversationDetails_ArtifactID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ArtifactID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ArtifactID_CompletionTime, @IsPinned = @MJConversationDetails_ArtifactID_IsPinned, @ParentID = @MJConversationDetails_ArtifactID_ParentID, @AgentID = @MJConversationDetails_ArtifactID_AgentID, @Status = @MJConversationDetails_ArtifactID_Status, @SuggestedResponses = @MJConversationDetails_ArtifactID_SuggestedResponses, @TestRunID = @MJConversationDetails_ArtifactID_TestRunID, @ResponseForm = @MJConversationDetails_ArtifactID_ResponseForm, @ActionableCommands = @MJConversationDetails_ArtifactID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ArtifactID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ArtifactID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_ArtifactID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_ArtifactID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_ArtifactID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_ArtifactID_UtteranceEndMs, @MediaType = @MJConversationDetails_ArtifactID_MediaType, @BranchID = @MJConversationDetails_ArtifactID_BranchID, @ReplacedAt = @MJConversationDetails_ArtifactID_ReplacedAt

        FETCH NEXT FROM cascade_update_MJConversationDetails_ArtifactID_cursor INTO @MJConversationDetails_ArtifactIDID, @MJConversationDetails_ArtifactID_ConversationID, @MJConversationDetails_ArtifactID_ExternalID, @MJConversationDetails_ArtifactID_Role, @MJConversationDetails_ArtifactID_Message, @MJConversationDetails_ArtifactID_Error, @MJConversationDetails_ArtifactID_HiddenToUser, @MJConversationDetails_ArtifactID_UserRating, @MJConversationDetails_ArtifactID_UserFeedback, @MJConversationDetails_ArtifactID_ReflectionInsights, @MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, @MJConversationDetails_ArtifactID_UserID, @MJConversationDetails_ArtifactID_ArtifactID, @MJConversationDetails_ArtifactID_ArtifactVersionID, @MJConversationDetails_ArtifactID_CompletionTime, @MJConversationDetails_ArtifactID_IsPinned, @MJConversationDetails_ArtifactID_ParentID, @MJConversationDetails_ArtifactID_AgentID, @MJConversationDetails_ArtifactID_Status, @MJConversationDetails_ArtifactID_SuggestedResponses, @MJConversationDetails_ArtifactID_TestRunID, @MJConversationDetails_ArtifactID_ResponseForm, @MJConversationDetails_ArtifactID_ActionableCommands, @MJConversationDetails_ArtifactID_AutomaticCommands, @MJConversationDetails_ArtifactID_OriginalMessageChanged, @MJConversationDetails_ArtifactID_AgentSessionID, @MJConversationDetails_ArtifactID_TurnEndedAt, @MJConversationDetails_ArtifactID_UtteranceStartMs, @MJConversationDetails_ArtifactID_UtteranceEndMs, @MJConversationDetails_ArtifactID_MediaType, @MJConversationDetails_ArtifactID_BranchID, @MJConversationDetails_ArtifactID_ReplacedAt
    END

    CLOSE cascade_update_MJConversationDetails_ArtifactID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ArtifactID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Artifacts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationArtifact] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason], [RecordingMedia], [RecordingStartedAt], [RecordingFileID], [LinkedEntityID], [LinkedRecordID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason, @RecordingMedia = @MJAIAgentSessions_ConversationID_RecordingMedia, @RecordingStartedAt = @MJAIAgentSessions_ConversationID_RecordingStartedAt, @RecordingFileID = @MJAIAgentSessions_ConversationID_RecordingFileID, @LinkedEntityID = @MJAIAgentSessions_ConversationID_LinkedEntityID, @LinkedRecordID = @MJAIAgentSessions_ConversationID_LinkedRecordID

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID
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
    DECLARE cascade_update_MJUserRoutines_ConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [EnvironmentID], [Name], [Description], [Status], [RoutineType], [TargetType], [TargetID], [InitialMessage], [StartingPayload], [RequestedSkillIDs], [CronExpression], [StartAt], [EndAt], [NotificationTemplateID], [Timezone], [NextRunAt], [LastRunAt], [LastRunStatus], [LastResultHash], [NotifyCondition], [NotifyViaInApp], [NotifyViaEmail], [ConversationID]
        FROM [${flyway:defaultSchema}].[UserRoutine]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJUserRoutines_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutines_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutine] @ID = @MJUserRoutines_ConversationIDID, @UserID = @MJUserRoutines_ConversationID_UserID, @EnvironmentID = @MJUserRoutines_ConversationID_EnvironmentID, @Name = @MJUserRoutines_ConversationID_Name, @Description = @MJUserRoutines_ConversationID_Description, @Status = @MJUserRoutines_ConversationID_Status, @RoutineType = @MJUserRoutines_ConversationID_RoutineType, @TargetType = @MJUserRoutines_ConversationID_TargetType, @TargetID = @MJUserRoutines_ConversationID_TargetID, @InitialMessage = @MJUserRoutines_ConversationID_InitialMessage, @StartingPayload = @MJUserRoutines_ConversationID_StartingPayload, @RequestedSkillIDs = @MJUserRoutines_ConversationID_RequestedSkillIDs, @CronExpression = @MJUserRoutines_ConversationID_CronExpression, @StartAt = @MJUserRoutines_ConversationID_StartAt, @EndAt = @MJUserRoutines_ConversationID_EndAt, @NotificationTemplateID = @MJUserRoutines_ConversationID_NotificationTemplateID, @Timezone = @MJUserRoutines_ConversationID_Timezone, @NextRunAt = @MJUserRoutines_ConversationID_NextRunAt, @LastRunAt = @MJUserRoutines_ConversationID_LastRunAt, @LastRunStatus = @MJUserRoutines_ConversationID_LastRunStatus, @LastResultHash = @MJUserRoutines_ConversationID_LastResultHash, @NotifyCondition = @MJUserRoutines_ConversationID_NotifyCondition, @NotifyViaInApp = @MJUserRoutines_ConversationID_NotifyViaInApp, @NotifyViaEmail = @MJUserRoutines_ConversationID_NotifyViaEmail, @ConversationID_Clear = 1, @ConversationID = @MJUserRoutines_ConversationID_ConversationID

        FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d60af4e-b4e8-40f4-a1b7-23db23f604c8' OR (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Branch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d60af4e-b4e8-40f4-a1b7-23db23f604c8',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversation Details
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '12248F34-2837-EF11-86D4-6045BDEE16E6'),
            'Branch',
            'Branch',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbd0ddc3-67be-4190-b3d8-48832d1cd971' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'Conversation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cbd0ddc3-67be-4190-b3d8-48832d1cd971',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'Conversation',
            'Conversation',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4c8575b-1c0d-452e-931d-8fbf03febe71' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'ParentBranch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b4c8575b-1c0d-452e-931d-8fbf03febe71',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
            'ParentBranch',
            'Parent Branch',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44243d08-adf6-4b2d-9305-b7b0fa512e01' OR (EntityID = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44243d08-adf6-4b2d-9305-b7b0fa512e01',
            'C43A32A6-3400-4A03-A0E3-8817D24C341D', -- Entity: MJ: Conversation Branches
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D'),
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '649A9CDC-326B-4916-B469-A045204DE013'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1EA4CB32-3AC6-498E-A032-5A9A415DC14F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CBD0DDC3-67BE-4190-B3D8-48832D1CD971'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '44243D08-ADF6-4B2D-9305-B7B0FA512E01'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '9D996E7B-E635-49DE-A677-A9C2DD6530BA'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Conversation Details.BranchID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Message Core',
   GeneratedFormSection = 'Category',
   DisplayName = 'Branch'
WHERE 
   ID = 'EEA65C41-E1FF-4976-BA32-AA4E0BA70463';

-- UPDATE Entity Field Category Info MJ: Conversation Details.ReplacedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Media and Timing',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '240C11F0-66F7-4242-A207-0B65E1D51067';

-- UPDATE Entity Field Category Info MJ: Conversation Details.Branch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D60AF4E-B4E8-40F4-A1B7-23DB23F604C8';

-- UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDDepth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A9CCE4B0-A049-47B9-9C53-7258679276BB';

-- UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '88573442-79DE-4932-B3BC-7EB928848FE6';

-- UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDIsLeaf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '411C4BD1-F4AC-49B3-A29B-82ECB312B1DA';

-- UPDATE Entity Field Category Info MJ: Conversation Details.ParentIDChildCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '98714A89-8808-4141-B105-42497BB3067B';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Conversation Branches.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CEFE126B-0DF6-4F94-B0B1-B5EA48C0C443';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.ConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation'
WHERE 
   ID = '5CAAEA2F-4FAB-444C-8997-7D18220E5E29';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.ParentBranchID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Branch'
WHERE 
   ID = 'ECE1C405-0C2E-42AE-8840-9DE6FAA5C029';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.ForkFromSequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B9ABB056-D80B-419A-B818-60F62BA07638';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9D996E7B-E635-49DE-A677-A9C2DD6530BA';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.Kind 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '649A9CDC-326B-4916-B469-A045204DE013';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.SourceDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Detail'
WHERE 
   ID = 'EC7D4C23-7652-468F-BE0A-4873967125A7';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Branch Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = 'EC1290EA-A783-4DD5-B374-F22FF6805F02';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.Conversation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Conversation Detail'
WHERE 
   ID = 'CBD0DDC3-67BE-4190-B3D8-48832D1CD971';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.ParentBranch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Branch Detail'
WHERE 
   ID = 'B4C8575B-1C0D-452E-931D-8FBF03FEBE71';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Related Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name'
WHERE 
   ID = '44243D08-ADF6-4B2D-9305-B7B0FA512E01';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1EA4CB32-3AC6-498E-A032-5A9A415DC14F';

-- UPDATE Entity Field Category Info MJ: Conversation Branches.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '04101288-1659-433B-9F81-0A8A49E43547';

/* Set entity icon to fa fa-code-branch */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-code-branch', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8649007a-3765-5463-a293-cdba0fa709b7', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'FieldCategoryInfo', '{
  "Branch Details": {
    "description": "Core configuration and lineage details for conversation forks",
    "icon": "fa fa-code-branch"
  },
  "Related Information": {
    "description": "Additional descriptive fields and denormalized context",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e634a5a7-0e2d-5c4f-b8bc-e13823df2115', 'C43A32A6-3400-4A03-A0E3-8817D24C341D', 'FieldCategoryIcons', '{
  "Branch Details": "fa fa-code-branch",
  "Related Information": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C43A32A6-3400-4A03-A0E3-8817D24C341D';

/* spCreate SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: spCreateConversationBranch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationBranch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationBranch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationBranch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationBranch]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ParentBranchID_Clear bit = 0,
    @ParentBranchID uniqueidentifier = NULL,
    @ForkFromSequence_Clear bit = 0,
    @ForkFromSequence int = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Kind nvarchar(20) = NULL,
    @SourceDetailID_Clear bit = 0,
    @SourceDetailID uniqueidentifier = NULL,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationBranch]
            (
                [ID],
                [ConversationID],
                [ParentBranchID],
                [ForkFromSequence],
                [Name],
                [Kind],
                [SourceDetailID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                CASE WHEN @ParentBranchID_Clear = 1 THEN NULL ELSE ISNULL(@ParentBranchID, NULL) END,
                CASE WHEN @ForkFromSequence_Clear = 1 THEN NULL ELSE ISNULL(@ForkFromSequence, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                ISNULL(@Kind, 'Fork'),
                CASE WHEN @SourceDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceDetailID, NULL) END,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationBranch]
            (
                [ConversationID],
                [ParentBranchID],
                [ForkFromSequence],
                [Name],
                [Kind],
                [SourceDetailID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                CASE WHEN @ParentBranchID_Clear = 1 THEN NULL ELSE ISNULL(@ParentBranchID, NULL) END,
                CASE WHEN @ForkFromSequence_Clear = 1 THEN NULL ELSE ISNULL(@ForkFromSequence, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                ISNULL(@Kind, 'Fork'),
                CASE WHEN @SourceDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceDetailID, NULL) END,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationBranches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationBranch] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Branches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationBranch] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: spUpdateConversationBranch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationBranch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationBranch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationBranch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationBranch]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier = NULL,
    @ParentBranchID_Clear bit = 0,
    @ParentBranchID uniqueidentifier = NULL,
    @ForkFromSequence_Clear bit = 0,
    @ForkFromSequence int = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Kind nvarchar(20) = NULL,
    @SourceDetailID_Clear bit = 0,
    @SourceDetailID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationBranch]
    SET
        [ConversationID] = ISNULL(@ConversationID, [ConversationID]),
        [ParentBranchID] = CASE WHEN @ParentBranchID_Clear = 1 THEN NULL ELSE ISNULL(@ParentBranchID, [ParentBranchID]) END,
        [ForkFromSequence] = CASE WHEN @ForkFromSequence_Clear = 1 THEN NULL ELSE ISNULL(@ForkFromSequence, [ForkFromSequence]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Kind] = ISNULL(@Kind, [Kind]),
        [SourceDetailID] = CASE WHEN @SourceDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceDetailID, [SourceDetailID]) END,
        [UserID] = ISNULL(@UserID, [UserID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationBranches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationBranches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationBranch] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationBranch table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationBranch]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationBranch];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationBranch
ON [${flyway:defaultSchema}].[ConversationBranch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationBranch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationBranch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Branches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationBranch] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Branches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Branches
-- Item: spDeleteConversationBranch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationBranch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationBranch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationBranch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationBranch]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationBranch using cursor to call spUpdateConversationBranch
    DECLARE @MJConversationBranches_ParentBranchIDID uniqueidentifier
    DECLARE @MJConversationBranches_ParentBranchID_ConversationID uniqueidentifier
    DECLARE @MJConversationBranches_ParentBranchID_ParentBranchID uniqueidentifier
    DECLARE @MJConversationBranches_ParentBranchID_ForkFromSequence int
    DECLARE @MJConversationBranches_ParentBranchID_Name nvarchar(255)
    DECLARE @MJConversationBranches_ParentBranchID_Kind nvarchar(20)
    DECLARE @MJConversationBranches_ParentBranchID_SourceDetailID uniqueidentifier
    DECLARE @MJConversationBranches_ParentBranchID_UserID uniqueidentifier
    DECLARE cascade_update_MJConversationBranches_ParentBranchID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ParentBranchID], [ForkFromSequence], [Name], [Kind], [SourceDetailID], [UserID]
        FROM [${flyway:defaultSchema}].[ConversationBranch]
        WHERE [ParentBranchID] = @ID

    OPEN cascade_update_MJConversationBranches_ParentBranchID_cursor
    FETCH NEXT FROM cascade_update_MJConversationBranches_ParentBranchID_cursor INTO @MJConversationBranches_ParentBranchIDID, @MJConversationBranches_ParentBranchID_ConversationID, @MJConversationBranches_ParentBranchID_ParentBranchID, @MJConversationBranches_ParentBranchID_ForkFromSequence, @MJConversationBranches_ParentBranchID_Name, @MJConversationBranches_ParentBranchID_Kind, @MJConversationBranches_ParentBranchID_SourceDetailID, @MJConversationBranches_ParentBranchID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationBranches_ParentBranchID_ParentBranchID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationBranch] @ID = @MJConversationBranches_ParentBranchIDID, @ConversationID = @MJConversationBranches_ParentBranchID_ConversationID, @ParentBranchID_Clear = 1, @ParentBranchID = @MJConversationBranches_ParentBranchID_ParentBranchID, @ForkFromSequence = @MJConversationBranches_ParentBranchID_ForkFromSequence, @Name = @MJConversationBranches_ParentBranchID_Name, @Kind = @MJConversationBranches_ParentBranchID_Kind, @SourceDetailID = @MJConversationBranches_ParentBranchID_SourceDetailID, @UserID = @MJConversationBranches_ParentBranchID_UserID

        FETCH NEXT FROM cascade_update_MJConversationBranches_ParentBranchID_cursor INTO @MJConversationBranches_ParentBranchIDID, @MJConversationBranches_ParentBranchID_ConversationID, @MJConversationBranches_ParentBranchID_ParentBranchID, @MJConversationBranches_ParentBranchID_ForkFromSequence, @MJConversationBranches_ParentBranchID_Name, @MJConversationBranches_ParentBranchID_Kind, @MJConversationBranches_ParentBranchID_SourceDetailID, @MJConversationBranches_ParentBranchID_UserID
    END

    CLOSE cascade_update_MJConversationBranches_ParentBranchID_cursor
    DEALLOCATE cascade_update_MJConversationBranches_ParentBranchID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_BranchIDID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_BranchID_Role nvarchar(20)
    DECLARE @MJConversationDetails_BranchID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_HiddenToUser bit
    DECLARE @MJConversationDetails_BranchID_UserRating int
    DECLARE @MJConversationDetails_BranchID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_CompletionTime bigint
    DECLARE @MJConversationDetails_BranchID_IsPinned bit
    DECLARE @MJConversationDetails_BranchID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_Status nvarchar(20)
    DECLARE @MJConversationDetails_BranchID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_BranchID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_BranchID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_BranchID_UtteranceStartMs int
    DECLARE @MJConversationDetails_BranchID_UtteranceEndMs int
    DECLARE @MJConversationDetails_BranchID_MediaType nvarchar(20)
    DECLARE @MJConversationDetails_BranchID_BranchID uniqueidentifier
    DECLARE @MJConversationDetails_BranchID_ReplacedAt datetimeoffset
    DECLARE cascade_update_MJConversationDetails_BranchID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType], [BranchID], [ReplacedAt]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [BranchID] = @ID

    OPEN cascade_update_MJConversationDetails_BranchID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_BranchID_cursor INTO @MJConversationDetails_BranchIDID, @MJConversationDetails_BranchID_ConversationID, @MJConversationDetails_BranchID_ExternalID, @MJConversationDetails_BranchID_Role, @MJConversationDetails_BranchID_Message, @MJConversationDetails_BranchID_Error, @MJConversationDetails_BranchID_HiddenToUser, @MJConversationDetails_BranchID_UserRating, @MJConversationDetails_BranchID_UserFeedback, @MJConversationDetails_BranchID_ReflectionInsights, @MJConversationDetails_BranchID_SummaryOfEarlierConversation, @MJConversationDetails_BranchID_UserID, @MJConversationDetails_BranchID_ArtifactID, @MJConversationDetails_BranchID_ArtifactVersionID, @MJConversationDetails_BranchID_CompletionTime, @MJConversationDetails_BranchID_IsPinned, @MJConversationDetails_BranchID_ParentID, @MJConversationDetails_BranchID_AgentID, @MJConversationDetails_BranchID_Status, @MJConversationDetails_BranchID_SuggestedResponses, @MJConversationDetails_BranchID_TestRunID, @MJConversationDetails_BranchID_ResponseForm, @MJConversationDetails_BranchID_ActionableCommands, @MJConversationDetails_BranchID_AutomaticCommands, @MJConversationDetails_BranchID_OriginalMessageChanged, @MJConversationDetails_BranchID_AgentSessionID, @MJConversationDetails_BranchID_TurnEndedAt, @MJConversationDetails_BranchID_UtteranceStartMs, @MJConversationDetails_BranchID_UtteranceEndMs, @MJConversationDetails_BranchID_MediaType, @MJConversationDetails_BranchID_BranchID, @MJConversationDetails_BranchID_ReplacedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_BranchID_BranchID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_BranchIDID, @ConversationID = @MJConversationDetails_BranchID_ConversationID, @ExternalID = @MJConversationDetails_BranchID_ExternalID, @Role = @MJConversationDetails_BranchID_Role, @Message = @MJConversationDetails_BranchID_Message, @Error = @MJConversationDetails_BranchID_Error, @HiddenToUser = @MJConversationDetails_BranchID_HiddenToUser, @UserRating = @MJConversationDetails_BranchID_UserRating, @UserFeedback = @MJConversationDetails_BranchID_UserFeedback, @ReflectionInsights = @MJConversationDetails_BranchID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_BranchID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_BranchID_UserID, @ArtifactID = @MJConversationDetails_BranchID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_BranchID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_BranchID_CompletionTime, @IsPinned = @MJConversationDetails_BranchID_IsPinned, @ParentID = @MJConversationDetails_BranchID_ParentID, @AgentID = @MJConversationDetails_BranchID_AgentID, @Status = @MJConversationDetails_BranchID_Status, @SuggestedResponses = @MJConversationDetails_BranchID_SuggestedResponses, @TestRunID = @MJConversationDetails_BranchID_TestRunID, @ResponseForm = @MJConversationDetails_BranchID_ResponseForm, @ActionableCommands = @MJConversationDetails_BranchID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_BranchID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_BranchID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_BranchID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_BranchID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_BranchID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_BranchID_UtteranceEndMs, @MediaType = @MJConversationDetails_BranchID_MediaType, @BranchID_Clear = 1, @BranchID = @MJConversationDetails_BranchID_BranchID, @ReplacedAt = @MJConversationDetails_BranchID_ReplacedAt

        FETCH NEXT FROM cascade_update_MJConversationDetails_BranchID_cursor INTO @MJConversationDetails_BranchIDID, @MJConversationDetails_BranchID_ConversationID, @MJConversationDetails_BranchID_ExternalID, @MJConversationDetails_BranchID_Role, @MJConversationDetails_BranchID_Message, @MJConversationDetails_BranchID_Error, @MJConversationDetails_BranchID_HiddenToUser, @MJConversationDetails_BranchID_UserRating, @MJConversationDetails_BranchID_UserFeedback, @MJConversationDetails_BranchID_ReflectionInsights, @MJConversationDetails_BranchID_SummaryOfEarlierConversation, @MJConversationDetails_BranchID_UserID, @MJConversationDetails_BranchID_ArtifactID, @MJConversationDetails_BranchID_ArtifactVersionID, @MJConversationDetails_BranchID_CompletionTime, @MJConversationDetails_BranchID_IsPinned, @MJConversationDetails_BranchID_ParentID, @MJConversationDetails_BranchID_AgentID, @MJConversationDetails_BranchID_Status, @MJConversationDetails_BranchID_SuggestedResponses, @MJConversationDetails_BranchID_TestRunID, @MJConversationDetails_BranchID_ResponseForm, @MJConversationDetails_BranchID_ActionableCommands, @MJConversationDetails_BranchID_AutomaticCommands, @MJConversationDetails_BranchID_OriginalMessageChanged, @MJConversationDetails_BranchID_AgentSessionID, @MJConversationDetails_BranchID_TurnEndedAt, @MJConversationDetails_BranchID_UtteranceStartMs, @MJConversationDetails_BranchID_UtteranceEndMs, @MJConversationDetails_BranchID_MediaType, @MJConversationDetails_BranchID_BranchID, @MJConversationDetails_BranchID_ReplacedAt
    END

    CLOSE cascade_update_MJConversationDetails_BranchID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_BranchID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationBranch]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationBranch] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Branches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationBranch] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

