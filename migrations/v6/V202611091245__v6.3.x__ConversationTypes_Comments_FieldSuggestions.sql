-- =====================================================================================
-- Conversation Types, Comments, Comment Types & Field Suggestions (MJ 6.3)
--
-- 1. ConversationType (`MJ: Conversation Types`):
--    Type lookup table for conversations (`Name`, `Code` UQ, `Description`,
--    `ExtensionEntity`, `DriverClass`). Seeded with `Chat`, `Skip`, `Routine`,
--    `Meeting Room`, and `Comment` (`ExtensionEntity = 'MJ: Comments'`), plus any
--    distinct legacy `Conversation.Type` values present in existing data.
-- 2. Conversation (`MJ: Conversations`):
--    Adds `TypeID` FK -> `ConversationType(ID)` (default `Chat`), backfills existing
--    rows (anchored conversations -> `Comment`; others by matching `Type` -> `Name`,
--    falling back to `Chat`), drops physical `Type` so CodeGen emits `Type` as the
--    virtual display field from `TypeID`, and adds composite index
--    `IDX_Conversation_LinkedRecord_Anchor_Type` on `(LinkedEntityID, LinkedRecordID,
--    AnchorType, TypeID)`.
-- 3. CommentType (`MJ: Comment Types`):
--    Type lookup table for comments (`Name`, `Code` UQ, `Description`,
--    `ExtensionEntity`, `DriverClass`, `UIDriverClass`, `AllowedAnchorTypes`).
--    Seeded with `Comment` (plain) and `Field Suggestion` (`ExtensionEntity =
--    'MJ: Field Suggestions'`, `DriverClass = 'FieldSuggestionCommentDriver'`,
--    `UIDriverClass = 'FieldSuggestionCardComponent'`, `AllowedAnchorTypes = '["Field"]'`).
-- 4. Comment (`MJ: Comments`, IS-A `MJ: Conversations`):
--    Shared-PK extension table (`ID` PK + FK -> `Conversation(ID)`, `CommentTypeID`
--    FK -> `CommentType(ID)` defaulting to plain `Comment`), backfilled for any
--    existing anchored conversations.
-- 5. FieldSuggestion (`MJ: Field Suggestions`, IS-A `MJ: Comments`):
--    Shared-PK extension table (`ID` PK + FK -> `Comment(ID)`, `SuggestedValue`,
--    `Confidence`, `Source`, `Outcome`, `AIPromptRunID`).
--
-- Conventions (migrations/CLAUDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Explicit COLLATE SQL_Latin1_General_CP1_CI_AS on every new string column.
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and single-column FK indexes
--     are omitted; CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- -------------------------------------------------------------------------------------
-- 1. ConversationType
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ConversationType] (
    [ID]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ConversationType_ID] DEFAULT (newsequentialid()),
    [Name]            NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [Code]            NVARCHAR(50)  COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [Description]     NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ExtensionEntity] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DriverClass]     NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CONSTRAINT [PK_ConversationType] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_ConversationType_Name] UNIQUE ([Name]),
    CONSTRAINT [UQ_ConversationType_Code] UNIQUE ([Code])
);
GO

INSERT INTO [${flyway:defaultSchema}].[ConversationType]
    ([ID], [Name], [Code], [Description], [ExtensionEntity], [DriverClass])
VALUES
    ('7F81FF57-C5A8-464D-B3B4-35A4FCF10717', N'Chat',         N'CHAT',         N'Standard interactive chat conversation between a user and one or more AI agents.', NULL, NULL),
    ('FDAE66B9-CF87-48EA-8A12-8E521740A66A', N'Skip',         N'SKIP',         N'Ask Skip analytical or Component Studio conversation.', NULL, NULL),
    ('18D12ABA-BE8C-4087-B440-835B6D077DD7', N'Routine',      N'ROUTINE',      N'Background conversation owned by a scheduled or event-driven User Routine execution.', NULL, NULL),
    ('2E9EF85D-D18A-4B8E-B6AB-F65C7F91A926', N'Meeting Room', N'MEETING_ROOM', N'Realtime multi-participant voice or video meeting room transcript conversation.', NULL, NULL),
    ('17E6A105-AE51-43A2-9D56-290BC8D1D6BB', N'Comment',      N'COMMENT',      N'Anchored comment or suggestion thread attached to an entity record, field, section, or artifact.', N'MJ: Comments', NULL);
GO

-- Preserve any distinct custom Conversation.Type strings present in existing customer data
INSERT INTO [${flyway:defaultSchema}].[ConversationType] ([Name], [Code], [Description])
SELECT
    src.[CleanName],
    src.[CleanCode],
    N'Migrated from legacy Conversation.Type value.'
FROM (
    SELECT DISTINCT
        LTRIM(RTRIM(c.[Type])) AS [CleanName],
        LEFT(UPPER(REPLACE(REPLACE(LTRIM(RTRIM(c.[Type])), N' ', N'_'), N'-', N'_')), 50) AS [CleanCode]
    FROM [${flyway:defaultSchema}].[Conversation] AS c
    WHERE c.[Type] IS NOT NULL
      AND LTRIM(RTRIM(c.[Type])) <> N''
) AS src
LEFT OUTER JOIN [${flyway:defaultSchema}].[ConversationType] AS existingByName
    ON existingByName.[Name] = src.[CleanName]
LEFT OUTER JOIN [${flyway:defaultSchema}].[ConversationType] AS existingByCode
    ON existingByCode.[Code] = src.[CleanCode]
WHERE existingByName.[ID] IS NULL
  AND existingByCode.[ID] IS NULL;
GO

-- -------------------------------------------------------------------------------------
-- 2. Alter Conversation: add TypeID, backfill, drop physical Type, add composite index
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[Conversation]
ADD [TypeID] UNIQUEIDENTIFIER NULL;
GO

UPDATE c
SET c.[TypeID] = CASE
    WHEN c.[AnchorType] IS NOT NULL THEN '17E6A105-AE51-43A2-9D56-290BC8D1D6BB'
    ELSE COALESCE(ct.[ID], '7F81FF57-C5A8-464D-B3B4-35A4FCF10717')
END
FROM [${flyway:defaultSchema}].[Conversation] AS c
LEFT OUTER JOIN [${flyway:defaultSchema}].[ConversationType] AS ct
    ON ct.[Name] = LTRIM(RTRIM(c.[Type]));
GO

ALTER TABLE [${flyway:defaultSchema}].[Conversation]
ALTER COLUMN [TypeID] UNIQUEIDENTIFIER NOT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[Conversation]
ADD CONSTRAINT [DF_Conversation_TypeID] DEFAULT ('7F81FF57-C5A8-464D-B3B4-35A4FCF10717') FOR [TypeID],
    CONSTRAINT [FK_Conversation_ConversationType] FOREIGN KEY ([TypeID])
        REFERENCES [${flyway:defaultSchema}].[ConversationType]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[Conversation]
DROP CONSTRAINT [DF_Conversation_Type];
GO

ALTER TABLE [${flyway:defaultSchema}].[Conversation]
DROP COLUMN [Type];
GO

CREATE NONCLUSTERED INDEX [IDX_Conversation_LinkedRecord_Anchor_Type]
ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID], [LinkedRecordID], [AnchorType], [TypeID]);
GO

-- -------------------------------------------------------------------------------------
-- 3. CommentType
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[CommentType] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CommentType_ID] DEFAULT (newsequentialid()),
    [Name]               NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [Code]               NVARCHAR(50)  COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [Description]        NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ExtensionEntity]    NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DriverClass]        NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [UIDriverClass]      NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [AllowedAnchorTypes] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CONSTRAINT [PK_CommentType] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_CommentType_Name] UNIQUE ([Name]),
    CONSTRAINT [UQ_CommentType_Code] UNIQUE ([Code])
);
GO

INSERT INTO [${flyway:defaultSchema}].[CommentType]
    ([ID], [Name], [Code], [Description], [ExtensionEntity], [DriverClass], [UIDriverClass], [AllowedAnchorTypes])
VALUES
    ('4B3A3797-EFA5-419F-80FF-F9515E5F4AA8', N'Comment',          N'COMMENT',          N'Plain discussion note or comment thread anchored to a record, field, section, group, contribution, or artifact.', NULL, NULL, NULL, NULL),
    ('8918DBA5-EDDD-4AF4-A518-FEB387ED02F9', N'Field Suggestion', N'FIELD_SUGGESTION', N'Proposed value for a specific field on a record, with source provenance, confidence, and Accept / Reject / Discuss workflow.', N'MJ: Field Suggestions', N'FieldSuggestionCommentDriver', N'FieldSuggestionCardComponent', N'["Field"]');
GO

-- -------------------------------------------------------------------------------------
-- 4. Comment (IS-A Conversation)
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[Comment] (
    [ID]            UNIQUEIDENTIFIER NOT NULL,
    [CommentTypeID] UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT [DF_Comment_CommentTypeID] DEFAULT ('4B3A3797-EFA5-419F-80FF-F9515E5F4AA8'),
    CONSTRAINT [PK_Comment] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_Comment_Conversation] FOREIGN KEY ([ID])
        REFERENCES [${flyway:defaultSchema}].[Conversation]([ID]),
    CONSTRAINT [FK_Comment_CommentType] FOREIGN KEY ([CommentTypeID])
        REFERENCES [${flyway:defaultSchema}].[CommentType]([ID])
);
GO

-- Backfill Comment extension rows for any existing anchored conversations
INSERT INTO [${flyway:defaultSchema}].[Comment] ([ID], [CommentTypeID])
SELECT c.[ID], '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8'
FROM [${flyway:defaultSchema}].[Conversation] AS c
WHERE c.[AnchorType] IS NOT NULL;
GO

-- -------------------------------------------------------------------------------------
-- 5. FieldSuggestion (IS-A Comment)
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[FieldSuggestion] (
    [ID]             UNIQUEIDENTIFIER NOT NULL,
    [SuggestedValue] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Confidence]     DECIMAL(5, 4) NULL,
    [Source]         NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
        CONSTRAINT [DF_FieldSuggestion_Source] DEFAULT (N'Agent'),
    [Outcome]        NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [AIPromptRunID]  UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_FieldSuggestion] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_FieldSuggestion_Comment] FOREIGN KEY ([ID])
        REFERENCES [${flyway:defaultSchema}].[Comment]([ID]),
    CONSTRAINT [FK_FieldSuggestion_AIPromptRun] FOREIGN KEY ([AIPromptRunID])
        REFERENCES [${flyway:defaultSchema}].[AIPromptRun]([ID]),
    CONSTRAINT [CK_FieldSuggestion_Source]
        CHECK ([Source] IN (N'LLM', N'Integration', N'Agent', N'Person')),
    CONSTRAINT [CK_FieldSuggestion_Outcome]
        CHECK ([Outcome] IN (N'Accepted', N'Rejected', N'Superseded')),
    CONSTRAINT [CK_FieldSuggestion_Confidence]
        CHECK ([Confidence] >= 0 AND [Confidence] <= 1)
);
GO

-- -------------------------------------------------------------------------------------
-- 6. Extended properties (Table & Column descriptions)
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lookup table of conversation classifications (Chat, Skip, Routine, Meeting Room, Comment, etc.). Drives IS-A extension entities via ExtensionEntity and server behavior hooks via DriverClass.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationType';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-readable display name of the conversation type (exposed on vwConversations as the virtual Type field).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationType',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Stable uppercase programmatic identifier for looking up this conversation type in code (for example CHAT, SKIP, ROUTINE, MEETING_ROOM, COMMENT) without coupling to display names.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationType',
    @level2type = N'COLUMN', @level2name = N'Code';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Explanation of when this conversation type is used and how surfaces treat conversations of this type.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationType',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional MJ entity name of the declared IS-A child of MJ: Conversations automatically created and loaded for conversations of this type (for example MJ: Comments).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationType',
    @level2type = N'COLUMN', @level2name = N'ExtensionEntity';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional ClassFactory registration key of a ConversationTypeDriver subclass providing custom validation and save lifecycle behavior for conversations of this type.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Foreign key to ConversationType identifying the kind of conversation (defaults to Chat). CodeGen exposes the joined ConversationType.Name as the virtual Type field.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Conversation',
    @level2type = N'COLUMN', @level2name = N'TypeID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Lookup table of anchored comment classifications (plain Comment, Field Suggestion, and extensible domain comment types) with optional IS-A extension entity, server driver class, and UI card component.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-readable display name of the comment type (for example Comment or Field Suggestion).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Stable uppercase programmatic code for this comment type (for example COMMENT or FIELD_SUGGESTION), referenced in Entity Configuration.Comments.AllowedCommentTypes and driver lookups.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'Code';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Explanation of this comment type and its collaboration or review workflow.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional MJ entity name of the declared IS-A child of MJ: Comments holding structured fields for this comment type (for example MJ: Field Suggestions).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'ExtensionEntity';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional ClassFactory registration key of a CommentTypeDriver subclass implementing server behavior such as OnAccept, OnReject, and OnRecordChanged.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional ClassFactory registration key of an EntitySubtypeUIDriverBase component used by the Notes & suggestions panel to render cards of this comment type (for example FieldSuggestionCardComponent).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'UIDriverClass';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional JSON array of Conversation.AnchorType values permitted for this comment type (for example ["Field"] for Field Suggestion). NULL allows all anchor types.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommentType',
    @level2type = N'COLUMN', @level2name = N'AllowedAnchorTypes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'IS-A child extension of Conversation for anchored record, field, section, and artifact comments. Shares Conversation.ID as its primary key and classifies each comment via CommentTypeID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Comment';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Foreign key to CommentType classifying this comment (defaults to plain Comment) and driving its optional IS-A extension entity, server driver, and UI card component.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Comment',
    @level2type = N'COLUMN', @level2name = N'CommentTypeID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'IS-A child extension of Comment representing a proposed value for a specific field on a linked record (AnchorType = Field, AnchorKey = EntityField.Name), with provenance, confidence, outcome, and discussion thread.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FieldSuggestion';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Proposed value for the target field serialized as text (or JSON for structured fields). NULL proposes clearing the field.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FieldSuggestion',
    @level2type = N'COLUMN', @level2name = N'SuggestedValue';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional confidence score between 0.0000 and 1.0000 reported by the model, agent, or integration that proposed the value.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FieldSuggestion',
    @level2type = N'COLUMN', @level2name = N'Confidence';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Origin category of the suggestion: LLM (prompt inference), Integration (external system sync), Agent (autonomous AI agent), or Person (human collaborator).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FieldSuggestion',
    @level2type = N'COLUMN', @level2name = N'Source';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Terminal disposition of the suggestion: NULL while pending review, Accepted when applied to the record, Rejected when declined by a user, or Superseded when replaced by a newer suggestion or direct field edit. Who closed it and when live on Conversation.ResolvedByUserID and Conversation.ResolvedAt.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FieldSuggestion',
    @level2type = N'COLUMN', @level2name = N'Outcome';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional foreign key to AIPromptRun linking an LLM- or agent-generated suggestion to the exact prompt execution that produced it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FieldSuggestion',
    @level2type = N'COLUMN', @level2name = N'AIPromptRunID';
GO




























































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
--
-- Everything below this banner was emitted by `mj codegen` (`CodeGen_Run_*.sql`)
-- and contains Entity / EntityField metadata inserts, IS-A ParentID &
-- SubtypeSelector declarations, regenerated base views, spCreate / spUpdate /
-- spDelete stored procedures, update triggers, permission grants, and extended
-- properties. If the hand-written DDL above changes, re-run `mj codegen` and
-- replace this entire generated section.
-- =============================================================================

/* SQL generated to create new entity MJ: Conversation Types */

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
         'c2483d63-b4b3-4297-9282-4f5ec7d085af',
         'MJ: Conversation Types',
         'Conversation Types',
         'Lookup table of conversation classifications (Chat, Skip, Routine, Meeting Room, Comment, etc.). Drives IS-A extension entities via ExtensionEntity and server behavior hooks via DriverClass.',
         NULL,
         'ConversationType',
         'vwConversationTypes',
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

/* SQL generated to add entity MJ: Conversation Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c2483d63-b4b3-4297-9282-4f5ec7d085af', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Conversation Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Conversation Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Conversation Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c2483d63-b4b3-4297-9282-4f5ec7d085af' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Comment Types */

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
         '2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe',
         'MJ: Comment Types',
         'Comment Types',
         'Lookup table of anchored comment classifications (plain Comment, Field Suggestion, and extensible domain comment types) with optional IS-A extension entity, server driver class, and UI card component.',
         NULL,
         'CommentType',
         'vwCommentTypes',
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

/* SQL generated to add entity MJ: Comment Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Comment Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Comment Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Comment Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2d604c9d-a6dd-4d61-ae2a-058f4e3d7cfe' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Comments */

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
         'b46e1990-487d-45d6-b91e-a77d58ed0229',
         'MJ: Comments',
         'Comments',
         'IS-A child extension of Conversation for anchored record, field, section, and artifact comments. Shares Conversation.ID as its primary key and classifies each comment via CommentTypeID.',
         NULL,
         'Comment',
         'vwComments',
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

/* SQL generated to add entity MJ: Comments to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b46e1990-487d-45d6-b91e-a77d58ed0229', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Comments for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Comments for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Comments for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('b46e1990-487d-45d6-b91e-a77d58ed0229' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Field Suggestions */

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
         '02e26617-130c-4a5a-b4d2-76f06f01c6a1',
         'MJ: Field Suggestions',
         'Field Suggestions',
         'IS-A child extension of Comment representing a proposed value for a specific field on a linked record (AnchorType = Field, AnchorKey = EntityField.Name), with provenance, confidence, outcome, and discussion thread.',
         NULL,
         'FieldSuggestion',
         'vwFieldSuggestions',
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

/* SQL generated to add entity MJ: Field Suggestions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '02e26617-130c-4a5a-b4d2-76f06f01c6a1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Field Suggestions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Field Suggestions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Field Suggestions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('02e26617-130c-4a5a-b4d2-76f06f01c6a1' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CommentType */
ALTER TABLE [${flyway:defaultSchema}].[CommentType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CommentType */
UPDATE [${flyway:defaultSchema}].[CommentType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CommentType */
ALTER TABLE [${flyway:defaultSchema}].[CommentType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CommentType */
ALTER TABLE [${flyway:defaultSchema}].[CommentType] ADD CONSTRAINT [DF___mj_CommentType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CommentType */
ALTER TABLE [${flyway:defaultSchema}].[CommentType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CommentType */
UPDATE [${flyway:defaultSchema}].[CommentType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CommentType */
ALTER TABLE [${flyway:defaultSchema}].[CommentType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CommentType */
ALTER TABLE [${flyway:defaultSchema}].[CommentType] ADD CONSTRAINT [DF___mj_CommentType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationType */
ALTER TABLE [${flyway:defaultSchema}].[ConversationType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationType */
UPDATE [${flyway:defaultSchema}].[ConversationType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationType */
ALTER TABLE [${flyway:defaultSchema}].[ConversationType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationType */
ALTER TABLE [${flyway:defaultSchema}].[ConversationType] ADD CONSTRAINT [DF___mj_ConversationType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationType */
ALTER TABLE [${flyway:defaultSchema}].[ConversationType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationType */
UPDATE [${flyway:defaultSchema}].[ConversationType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationType */
ALTER TABLE [${flyway:defaultSchema}].[ConversationType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationType */
ALTER TABLE [${flyway:defaultSchema}].[ConversationType] ADD CONSTRAINT [DF___mj_ConversationType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[FieldSuggestion] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
UPDATE [${flyway:defaultSchema}].[FieldSuggestion] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[FieldSuggestion] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[FieldSuggestion] ADD CONSTRAINT [DF___mj_FieldSuggestion___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[FieldSuggestion] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
UPDATE [${flyway:defaultSchema}].[FieldSuggestion] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[FieldSuggestion] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FieldSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[FieldSuggestion] ADD CONSTRAINT [DF___mj_FieldSuggestion___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Comment */
ALTER TABLE [${flyway:defaultSchema}].[Comment] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Comment */
UPDATE [${flyway:defaultSchema}].[Comment] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Comment */
ALTER TABLE [${flyway:defaultSchema}].[Comment] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Comment */
ALTER TABLE [${flyway:defaultSchema}].[Comment] ADD CONSTRAINT [DF___mj_Comment___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Comment */
ALTER TABLE [${flyway:defaultSchema}].[Comment] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Comment */
UPDATE [${flyway:defaultSchema}].[Comment] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Comment */
ALTER TABLE [${flyway:defaultSchema}].[Comment] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Comment */
ALTER TABLE [${flyway:defaultSchema}].[Comment] ADD CONSTRAINT [DF___mj_Comment___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 31 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9728c10e-c788-43a4-9e67-fabb88e46be1' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9728c10e-c788-43a4-9e67-fabb88e46be1',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '097f7f7c-44d2-4d4d-b95b-3177b8b57243' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '097f7f7c-44d2-4d4d-b95b-3177b8b57243',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'Name',
            'Name',
            'Human-readable display name of the comment type (for example Comment or Field Suggestion).',
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77c74296-5649-4e5c-a23f-6888b08a9075' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'Code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77c74296-5649-4e5c-a23f-6888b08a9075',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'Code',
            'Code',
            'Stable uppercase programmatic code for this comment type (for example COMMENT or FIELD_SUGGESTION), referenced in Entity Configuration.Comments.AllowedCommentTypes and driver lookups.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cde9861f-2798-4e94-9d44-7cd0865e771b' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cde9861f-2798-4e94-9d44-7cd0865e771b',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'Description',
            'Description',
            'Explanation of this comment type and its collaboration or review workflow.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '281fd4ce-8b3e-467d-a4f1-0903af5d4a1c' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'ExtensionEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '281fd4ce-8b3e-467d-a4f1-0903af5d4a1c',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'ExtensionEntity',
            'Extension Entity',
            'Optional MJ entity name of the declared IS-A child of MJ: Comments holding structured fields for this comment type (for example MJ: Field Suggestions).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d9c8d64-40f7-42f0-ae34-1f4a88080c12' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d9c8d64-40f7-42f0-ae34-1f4a88080c12',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'DriverClass',
            'Driver Class',
            'Optional ClassFactory registration key of a CommentTypeDriver subclass implementing server behavior such as OnAccept, OnReject, and OnRecordChanged.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74540df4-3226-48aa-86a9-6cb1c0cda60a' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'UIDriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74540df4-3226-48aa-86a9-6cb1c0cda60a',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'UIDriverClass',
            'UI Driver Class',
            'Optional ClassFactory registration key of an EntitySubtypeUIDriverBase component used by the Notes & suggestions panel to render cards of this comment type (for example FieldSuggestionCardComponent).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96099148-77d6-4982-9175-4775bf8779b7' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = 'AllowedAnchorTypes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '96099148-77d6-4982-9175-4775bf8779b7',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
            'AllowedAnchorTypes',
            'Allowed Anchor Types',
            'Optional JSON array of Conversation.AnchorType values permitted for this comment type (for example ["Field"] for Field Suggestion). NULL allows all anchor types.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f7ec804-b1fc-4876-b96e-8213d22dde6a' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6f7ec804-b1fc-4876-b96e-8213d22dde6a',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73445091-843f-4e0a-b3c1-5593a6022f9e' OR (EntityID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '73445091-843f-4e0a-b3c1-5593a6022f9e',
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', -- Entity: MJ: Comment Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '776bb1c3-c0ee-4feb-b356-b17ef67a5a3c' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '776bb1c3-c0ee-4feb-b356-b17ef67a5a3c',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5bad141-28be-404e-8fd3-71ee08ddcf0b' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b5bad141-28be-404e-8fd3-71ee08ddcf0b',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
            'Name',
            'Name',
            'Human-readable display name of the conversation type (exposed on vwConversations as the virtual Type field).',
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8de1bf29-728c-41f5-8589-8c692ad733c2' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = 'Code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8de1bf29-728c-41f5-8589-8c692ad733c2',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
            'Code',
            'Code',
            'Stable uppercase programmatic identifier for looking up this conversation type in code (for example CHAT, SKIP, ROUTINE, MEETING_ROOM, COMMENT) without coupling to display names.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86dfd3da-6bd3-4454-b30d-fda97842d441' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86dfd3da-6bd3-4454-b30d-fda97842d441',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
            'Description',
            'Description',
            'Explanation of when this conversation type is used and how surfaces treat conversations of this type.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4350ef1-6633-4612-a4ea-bdf834a02ebb' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = 'ExtensionEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4350ef1-6633-4612-a4ea-bdf834a02ebb',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
            'ExtensionEntity',
            'Extension Entity',
            'Optional MJ entity name of the declared IS-A child of MJ: Conversations automatically created and loaded for conversations of this type (for example MJ: Comments).',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26e94e90-1eff-4c64-8443-8f64d7d45917' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26e94e90-1eff-4c64-8443-8f64d7d45917',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
            'DriverClass',
            'Driver Class',
            'Optional ClassFactory registration key of a ConversationTypeDriver subclass providing custom validation and save lifecycle behavior for conversations of this type.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '951f8f04-2a6e-4dc4-bdae-cbffba5a650b' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '951f8f04-2a6e-4dc4-bdae-cbffba5a650b',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4bf0d12e-4ca9-4c49-be24-6adbdc46f1ee' OR (EntityID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4bf0d12e-4ca9-4c49-be24-6adbdc46f1ee',
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF', -- Entity: MJ: Conversation Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34120559-280e-43a9-9bd5-63959c192b31' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34120559-280e-43a9-9bd5-63959c192b31',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '13248F34-2837-EF11-86D4-6045BDEE16E6'),
            'TypeID',
            'Type ID',
            'Foreign key to ConversationType identifying the kind of conversation (defaults to Chat). CodeGen exposes the joined ConversationType.Name as the virtual Type field.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            '7F81FF57-C5A8-464D-B3B4-35A4FCF10717',
            0,
            1,
            0,
            0,
            'C2483D63-B4B3-4297-9282-4F5EC7D085AF',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9cbccd6a-eba9-437f-8413-b14d97e2470c' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9cbccd6a-eba9-437f-8413-b14d97e2470c',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            0,
            0,
            'B46E1990-487D-45D6-B91E-A77D58ED0229',
            'ID',
            0,
            0,
            1,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6c58e49-e196-4148-b4a6-be58026cd249' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'SuggestedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd6c58e49-e196-4148-b4a6-be58026cd249',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'SuggestedValue',
            'Suggested Value',
            'Proposed value for the target field serialized as text (or JSON for structured fields). NULL proposes clearing the field.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6d1f394-8df2-4360-b3bc-f7aa11df3801' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'Confidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f6d1f394-8df2-4360-b3bc-f7aa11df3801',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'Confidence',
            'Confidence',
            'Optional confidence score between 0.0000 and 1.0000 reported by the model, agent, or integration that proposed the value.',
            'decimal',
            5,
            5,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40a7df8e-e415-4b54-a45d-7e1c8c5b9476' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40a7df8e-e415-4b54-a45d-7e1c8c5b9476',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'Source',
            'Source',
            'Origin category of the suggestion: LLM (prompt inference), Integration (external system sync), Agent (autonomous AI agent), or Person (human collaborator).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '191079ee-ef74-4bba-b055-2e03e5ec3d44' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'Outcome')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '191079ee-ef74-4bba-b055-2e03e5ec3d44',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'Outcome',
            'Outcome',
            'Terminal disposition of the suggestion: NULL while pending review, Accepted when applied to the record, Rejected when declined by a user, or Superseded when replaced by a newer suggestion or direct field edit. Who closed it and when live on Conversation.ResolvedByUserID and Conversation.ResolvedAt.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc23540c-e14d-4fa7-9d22-34b050cf5403' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'AIPromptRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc23540c-e14d-4fa7-9d22-34b050cf5403',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'AIPromptRunID',
            'AI Prompt Run ID',
            'Optional foreign key to AIPromptRun linking an LLM- or agent-generated suggestion to the exact prompt execution that produced it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58a4bc6f-66f2-40f3-a9f8-1b2ebd0c1697' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '58a4bc6f-66f2-40f3-a9f8-1b2ebd0c1697',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '040e559d-c0dd-421a-b132-2893cd036635' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '040e559d-c0dd-421a-b132-2893cd036635',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ecf2ca0f-0b79-4ffb-9a40-626ad3d2de77' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ecf2ca0f-0b79-4ffb-9a40-626ad3d2de77',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            0,
            0,
            '13248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59a76206-93d7-4244-a0a9-a400f7f2da98' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'CommentTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '59a76206-93d7-4244-a0a9-a400f7f2da98',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'CommentTypeID',
            'Comment Type ID',
            'Foreign key to CommentType classifying this comment (defaults to plain Comment) and driving its optional IS-A extension entity, server driver, and UI card component.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8',
            0,
            1,
            0,
            0,
            '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a365c90-4881-4471-922d-78fab82f78ca' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a365c90-4881-4471-922d-78fab82f78ca',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5002620f-db50-4762-99f0-e1d4fb05c39d' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5002620f-db50-4762-99f0-e1d4fb05c39d',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID ce6bb8b6-2c7f-4276-9159-ab9d74bf4f18 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ce6bb8b6-2c7f-4276-9159-ab9d74bf4f18', '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476', 1, 'Agent', 'Agent', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2b22fa32-a0c3-4f24-8364-417d9ad46580 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2b22fa32-a0c3-4f24-8364-417d9ad46580', '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476', 2, 'Integration', 'Integration', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1dd7b483-2488-4614-bede-9d05595c69cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1dd7b483-2488-4614-bede-9d05595c69cc', '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476', 3, 'LLM', 'LLM', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9ccc285f-2c73-470c-a192-01ec3c37137e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9ccc285f-2c73-470c-a192-01ec3c37137e', '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476', 4, 'Person', 'Person', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 40A7DF8E-E415-4B54-A45D-7E1C8C5B9476 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='40A7DF8E-E415-4B54-A45D-7E1C8C5B9476';

/* SQL text to insert entity field value with ID a4dac5da-09fe-421d-a879-e0f4ccbcff52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a4dac5da-09fe-421d-a879-e0f4ccbcff52', '191079EE-EF74-4BBA-B055-2E03E5EC3D44', 1, 'Accepted', 'Accepted', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 71d1c742-7f33-4170-8769-092db138b1d6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71d1c742-7f33-4170-8769-092db138b1d6', '191079EE-EF74-4BBA-B055-2E03E5EC3D44', 2, 'Rejected', 'Rejected', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b5ffb136-f213-4968-8cbc-a89729519388 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b5ffb136-f213-4968-8cbc-a89729519388', '191079EE-EF74-4BBA-B055-2E03E5EC3D44', 3, 'Superseded', 'Superseded', 'Check', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 191079EE-EF74-4BBA-B055-2E03E5EC3D44 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='191079EE-EF74-4BBA-B055-2E03E5EC3D44';

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


/* Create Entity Relationship: MJ: Comment Types -> MJ: Comments (One To Many via CommentTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '639fef7e-ed3e-44f6-b6fc-b37ad59356fc' OR ([EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND [RelatedEntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND [RelatedEntityJoinField] = 'CommentTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('639fef7e-ed3e-44f6-b6fc-b37ad59356fc', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'CommentTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversation Types -> MJ: Conversations (One To Many via TypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5881c22d-caec-46e7-9297-d6073503efea' OR ([EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND [RelatedEntityID] = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityJoinField] = 'TypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5881c22d-caec-46e7-9297-d6073503efea', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'TypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Conversations -> MJ: Comments (One To Many via ID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '04a69af7-761a-43bb-926e-783eb7bf0ceb' OR ([EntityID] = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND [RelatedEntityJoinField] = 'ID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('04a69af7-761a-43bb-926e-783eb7bf0ceb', '13248F34-2837-EF11-86D4-6045BDEE16E6', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'ID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Comments -> MJ: Field Suggestions (One To Many via ID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5c67ae47-f533-49bb-a8f3-3f8d61fcbf42' OR ([EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND [RelatedEntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND [RelatedEntityJoinField] = 'ID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5c67ae47-f533-49bb-a8f3-3f8d61fcbf42', 'B46E1990-487D-45D6-B91E-A77D58ED0229', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'ID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Prompt Runs -> MJ: Field Suggestions (One To Many via AIPromptRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '742ad29c-fc5d-4de9-9acc-a7784ea7cc2c' OR ([EntityID] = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND [RelatedEntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND [RelatedEntityJoinField] = 'AIPromptRunID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('742ad29c-fc5d-4de9-9acc-a7784ea7cc2c', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'AIPromptRunID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;

/* Set IS-A ParentID for "MJ: Comments" → "MJ: Conversations" */
UPDATE [${flyway:defaultSchema}].[Entity]
                                  SET [__mj_UpdatedAt]=GETUTCDATE(),
                                      [ParentID] = '13248F34-2837-EF11-86D4-6045BDEE16E6'
                                  WHERE [ID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

/* Set IS-A ParentID for "MJ: Field Suggestions" → "MJ: Comments" */
UPDATE [${flyway:defaultSchema}].[Entity]
                                  SET [__mj_UpdatedAt]=GETUTCDATE(),
                                      [ParentID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'
                                  WHERE [ID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';

/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE [${flyway:defaultSchema}].[Entity]
                              SET [__mj_UpdatedAt] = GETUTCDATE(), [SubtypeSelector] = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
                              WHERE [ID] = '13248F34-2837-EF11-86D4-6045BDEE16E6';

/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE [${flyway:defaultSchema}].[Entity]
                              SET [__mj_UpdatedAt] = GETUTCDATE(), [SubtypeSelector] = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
                              WHERE [ID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

/* Index for Foreign Keys for CommentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comment Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Comment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommentTypeID in table Comment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Comment_CommentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Comment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Comment_CommentTypeID ON [${flyway:defaultSchema}].[Comment] ([CommentTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 59A76206-93D7-4244-A0A9-A400F7F2DA98 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='59A76206-93D7-4244-A0A9-A400F7F2DA98', @RelatedEntityNameFieldMap='CommentType';

/* Base View SQL for MJ: Comment Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comment Types
-- Item: vwCommentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Comment Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CommentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCommentTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCommentTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCommentTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CommentType] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCommentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Comment Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comment Types
-- Item: Permissions for vwCommentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCommentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Comment Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comment Types
-- Item: spCreateCommentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCommentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCommentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCommentType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Code nvarchar(50),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ExtensionEntity_Clear bit = 0,
    @ExtensionEntity nvarchar(255) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @UIDriverClass_Clear bit = 0,
    @UIDriverClass nvarchar(255) = NULL,
    @AllowedAnchorTypes_Clear bit = 0,
    @AllowedAnchorTypes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CommentType]
            (
                [ID],
                [Name],
                [Code],
                [Description],
                [ExtensionEntity],
                [DriverClass],
                [UIDriverClass],
                [AllowedAnchorTypes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Code,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExtensionEntity, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @UIDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@UIDriverClass, NULL) END,
                CASE WHEN @AllowedAnchorTypes_Clear = 1 THEN NULL ELSE ISNULL(@AllowedAnchorTypes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CommentType]
            (
                [Name],
                [Code],
                [Description],
                [ExtensionEntity],
                [DriverClass],
                [UIDriverClass],
                [AllowedAnchorTypes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Code,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExtensionEntity, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @UIDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@UIDriverClass, NULL) END,
                CASE WHEN @AllowedAnchorTypes_Clear = 1 THEN NULL ELSE ISNULL(@AllowedAnchorTypes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCommentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommentType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Comment Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCommentType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Comment Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comment Types
-- Item: spUpdateCommentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCommentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCommentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCommentType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Code nvarchar(50) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ExtensionEntity_Clear bit = 0,
    @ExtensionEntity nvarchar(255) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @UIDriverClass_Clear bit = 0,
    @UIDriverClass nvarchar(255) = NULL,
    @AllowedAnchorTypes_Clear bit = 0,
    @AllowedAnchorTypes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommentType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Code] = ISNULL(@Code, [Code]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ExtensionEntity] = CASE WHEN @ExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExtensionEntity, [ExtensionEntity]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [UIDriverClass] = CASE WHEN @UIDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@UIDriverClass, [UIDriverClass]) END,
        [AllowedAnchorTypes] = CASE WHEN @AllowedAnchorTypes_Clear = 1 THEN NULL ELSE ISNULL(@AllowedAnchorTypes, [AllowedAnchorTypes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCommentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCommentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCommentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCommentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCommentType
ON [${flyway:defaultSchema}].[CommentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CommentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CommentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Comment Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCommentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Comment Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comment Types
-- Item: spDeleteCommentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCommentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCommentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCommentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CommentType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Comment Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCommentType] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Comments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comments
-- Item: vwComments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Comments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Comment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwComments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwComments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComments]
AS
SELECT
    c.*,
    __mj_isa_p1.[UserID],
    __mj_isa_p1.[ExternalID],
    __mj_isa_p1.[Name],
    __mj_isa_p1.[Description],
    __mj_isa_p1.[IsArchived],
    __mj_isa_p1.[LinkedEntityID],
    __mj_isa_p1.[LinkedRecordID],
    __mj_isa_p1.[DataContextID],
    __mj_isa_p1.[Status],
    __mj_isa_p1.[EnvironmentID],
    __mj_isa_p1.[ProjectID],
    __mj_isa_p1.[IsPinned],
    __mj_isa_p1.[TestRunID],
    __mj_isa_p1.[ApplicationScope],
    __mj_isa_p1.[ApplicationID],
    __mj_isa_p1.[DefaultAgentID],
    __mj_isa_p1.[AdditionalData],
    __mj_isa_p1.[RecordingFileID],
    __mj_isa_p1.[EgressID],
    __mj_isa_p1.[VisitorKey],
    __mj_isa_p1.[LastConversationID],
    __mj_isa_p1.[AnchorType],
    __mj_isa_p1.[AnchorKey],
    __mj_isa_p1.[AnchorMetadata],
    __mj_isa_p1.[IsResolved],
    __mj_isa_p1.[ResolvedByUserID],
    __mj_isa_p1.[ResolvedAt],
    __mj_isa_p1.[TypeID],
    MJCommentType_CommentTypeID.[Name] AS [CommentType]
FROM
    [${flyway:defaultSchema}].[Comment] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS __mj_isa_p1
  ON
    [c].[ID] = __mj_isa_p1.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CommentType] AS MJCommentType_CommentTypeID
  ON
    [c].[CommentTypeID] = MJCommentType_CommentTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Comments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comments
-- Item: Permissions for vwComments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Comments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comments
-- Item: spCreateComment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Comment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateComment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateComment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComment]
    @ID uniqueidentifier = NULL,
    @CommentTypeID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[Comment]
        (
            [CommentTypeID],
                [ID]
        )
    VALUES
        (
            CASE WHEN @CommentTypeID = '00000000-0000-0000-0000-000000000000' THEN '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8' ELSE ISNULL(@CommentTypeID, '4B3A3797-EFA5-419F-80FF-F9515E5F4AA8') END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComments] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComment] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Comments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComment] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Comments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comments
-- Item: spUpdateComment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Comment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateComment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateComment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComment]
    @ID uniqueidentifier,
    @CommentTypeID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Comment]
    SET
        [CommentTypeID] = ISNULL(@CommentTypeID, [CommentTypeID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Comment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateComment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateComment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComment
ON [${flyway:defaultSchema}].[Comment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Comment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Comment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Comments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComment] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Comments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Comments
-- Item: spDeleteComment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Comment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteComment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteComment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Comment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Comments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComment] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ConversationType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Conversation Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Types
-- Item: vwConversationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ConversationType] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversation Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Types
-- Item: Permissions for vwConversationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Conversation Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Types
-- Item: spCreateConversationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Code nvarchar(50),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ExtensionEntity_Clear bit = 0,
    @ExtensionEntity nvarchar(255) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationType]
            (
                [ID],
                [Name],
                [Code],
                [Description],
                [ExtensionEntity],
                [DriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Code,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExtensionEntity, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationType]
            (
                [Name],
                [Code],
                [Description],
                [ExtensionEntity],
                [DriverClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Code,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExtensionEntity, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Conversation Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Conversation Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Types
-- Item: spUpdateConversationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Code nvarchar(50) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ExtensionEntity_Clear bit = 0,
    @ExtensionEntity nvarchar(255) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Code] = ISNULL(@Code, [Code]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ExtensionEntity] = CASE WHEN @ExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExtensionEntity, [ExtensionEntity]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationType
ON [${flyway:defaultSchema}].[ConversationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversation Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversation Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Types
-- Item: spDeleteConversationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Conversation Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationType] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spCreateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityOrganicKey]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MatchFieldNames nvarchar(500),
    @NormalizationStrategy nvarchar(50) = NULL,
    @CustomNormalizationExpression_Clear bit = 0,
    @CustomNormalizationExpression nvarchar(MAX) = NULL,
    @AutoCreateRelatedViewOnForm bit = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL,
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKey]
            (
                [ID],
                [EntityID],
                [Name],
                [Description],
                [MatchFieldNames],
                [NormalizationStrategy],
                [CustomNormalizationExpression],
                [AutoCreateRelatedViewOnForm],
                [Sequence],
                [Status],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @MatchFieldNames,
                ISNULL(@NormalizationStrategy, 'LowerCaseTrim'),
                CASE WHEN @CustomNormalizationExpression_Clear = 1 THEN NULL ELSE ISNULL(@CustomNormalizationExpression, NULL) END,
                ISNULL(@AutoCreateRelatedViewOnForm, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                ISNULL(@Source, 'Manual')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityOrganicKey]
            (
                [EntityID],
                [Name],
                [Description],
                [MatchFieldNames],
                [NormalizationStrategy],
                [CustomNormalizationExpression],
                [AutoCreateRelatedViewOnForm],
                [Sequence],
                [Status],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @MatchFieldNames,
                ISNULL(@NormalizationStrategy, 'LowerCaseTrim'),
                CASE WHEN @CustomNormalizationExpression_Clear = 1 THEN NULL ELSE ISNULL(@CustomNormalizationExpression, NULL) END,
                ISNULL(@AutoCreateRelatedViewOnForm, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                ISNULL(@Source, 'Manual')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeys] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Organic Keys */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spUpdateEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityOrganicKey]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKey];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityOrganicKey]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MatchFieldNames nvarchar(500) = NULL,
    @NormalizationStrategy nvarchar(50) = NULL,
    @CustomNormalizationExpression_Clear bit = 0,
    @CustomNormalizationExpression nvarchar(MAX) = NULL,
    @AutoCreateRelatedViewOnForm bit = NULL,
    @Sequence int = NULL,
    @Status nvarchar(20) = NULL,
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKey]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [MatchFieldNames] = ISNULL(@MatchFieldNames, [MatchFieldNames]),
        [NormalizationStrategy] = ISNULL(@NormalizationStrategy, [NormalizationStrategy]),
        [CustomNormalizationExpression] = CASE WHEN @CustomNormalizationExpression_Clear = 1 THEN NULL ELSE ISNULL(@CustomNormalizationExpression, [CustomNormalizationExpression]) END,
        [AutoCreateRelatedViewOnForm] = ISNULL(@AutoCreateRelatedViewOnForm, [AutoCreateRelatedViewOnForm]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Status] = ISNULL(@Status, [Status]),
        [Source] = ISNULL(@Source, [Source])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityOrganicKeys] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityOrganicKeys]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityOrganicKey table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityOrganicKey]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityOrganicKey];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityOrganicKey
ON [${flyway:defaultSchema}].[EntityOrganicKey]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityOrganicKey]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityOrganicKey] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Organic Keys */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityOrganicKey] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for FieldSuggestion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Field Suggestions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIPromptRunID in table FieldSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FieldSuggestion_AIPromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FieldSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FieldSuggestion_AIPromptRunID ON [${flyway:defaultSchema}].[FieldSuggestion] ([AIPromptRunID]);

/* SQL text to update entity field related entity name field map for entity field ID BC23540C-E14D-4FA7-9D22-34B050CF5403 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BC23540C-E14D-4FA7-9D22-34B050CF5403', @RelatedEntityNameFieldMap='AIPromptRun';

/* Base View SQL for MJ: Field Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Field Suggestions
-- Item: vwFieldSuggestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Field Suggestions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FieldSuggestion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFieldSuggestions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFieldSuggestions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFieldSuggestions]
AS
SELECT
    f.*,
    __mj_isa_p1.[CommentTypeID],
    __mj_isa_p2.[UserID],
    __mj_isa_p2.[ExternalID],
    __mj_isa_p2.[Name],
    __mj_isa_p2.[Description],
    __mj_isa_p2.[IsArchived],
    __mj_isa_p2.[LinkedEntityID],
    __mj_isa_p2.[LinkedRecordID],
    __mj_isa_p2.[DataContextID],
    __mj_isa_p2.[Status],
    __mj_isa_p2.[EnvironmentID],
    __mj_isa_p2.[ProjectID],
    __mj_isa_p2.[IsPinned],
    __mj_isa_p2.[TestRunID],
    __mj_isa_p2.[ApplicationScope],
    __mj_isa_p2.[ApplicationID],
    __mj_isa_p2.[DefaultAgentID],
    __mj_isa_p2.[AdditionalData],
    __mj_isa_p2.[RecordingFileID],
    __mj_isa_p2.[EgressID],
    __mj_isa_p2.[VisitorKey],
    __mj_isa_p2.[LastConversationID],
    __mj_isa_p2.[AnchorType],
    __mj_isa_p2.[AnchorKey],
    __mj_isa_p2.[AnchorMetadata],
    __mj_isa_p2.[IsResolved],
    __mj_isa_p2.[ResolvedByUserID],
    __mj_isa_p2.[ResolvedAt],
    __mj_isa_p2.[TypeID],
    MJAIPromptRun_AIPromptRunID.[RunName] AS [AIPromptRun]
FROM
    [${flyway:defaultSchema}].[FieldSuggestion] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Comment] AS __mj_isa_p1
  ON
    [f].[ID] = __mj_isa_p1.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS __mj_isa_p2
  ON
    [__mj_isa_p1].[ID] = __mj_isa_p2.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_AIPromptRunID
  ON
    [f].[AIPromptRunID] = MJAIPromptRun_AIPromptRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFieldSuggestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Field Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Field Suggestions
-- Item: Permissions for vwFieldSuggestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFieldSuggestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Field Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Field Suggestions
-- Item: spCreateFieldSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FieldSuggestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFieldSuggestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFieldSuggestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFieldSuggestion]
    @ID uniqueidentifier = NULL,
    @SuggestedValue_Clear bit = 0,
    @SuggestedValue nvarchar(MAX) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @Source nvarchar(20) = NULL,
    @Outcome_Clear bit = 0,
    @Outcome nvarchar(20) = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[FieldSuggestion]
        (
            [SuggestedValue],
                [Confidence],
                [Source],
                [Outcome],
                [AIPromptRunID],
                [ID]
        )
    VALUES
        (
            CASE WHEN @SuggestedValue_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedValue, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                ISNULL(@Source, 'Agent'),
                CASE WHEN @Outcome_Clear = 1 THEN NULL ELSE ISNULL(@Outcome, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFieldSuggestions] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFieldSuggestion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Field Suggestions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFieldSuggestion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Field Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Field Suggestions
-- Item: spUpdateFieldSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FieldSuggestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFieldSuggestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFieldSuggestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFieldSuggestion]
    @ID uniqueidentifier,
    @SuggestedValue_Clear bit = 0,
    @SuggestedValue nvarchar(MAX) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL,
    @Source nvarchar(20) = NULL,
    @Outcome_Clear bit = 0,
    @Outcome nvarchar(20) = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FieldSuggestion]
    SET
        [SuggestedValue] = CASE WHEN @SuggestedValue_Clear = 1 THEN NULL ELSE ISNULL(@SuggestedValue, [SuggestedValue]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [Source] = ISNULL(@Source, [Source]),
        [Outcome] = CASE WHEN @Outcome_Clear = 1 THEN NULL ELSE ISNULL(@Outcome, [Outcome]) END,
        [AIPromptRunID] = CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, [AIPromptRunID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFieldSuggestions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFieldSuggestions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFieldSuggestion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FieldSuggestion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFieldSuggestion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFieldSuggestion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFieldSuggestion
ON [${flyway:defaultSchema}].[FieldSuggestion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FieldSuggestion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FieldSuggestion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Field Suggestions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFieldSuggestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Field Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Field Suggestions
-- Item: spDeleteFieldSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FieldSuggestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFieldSuggestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFieldSuggestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFieldSuggestion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FieldSuggestion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFieldSuggestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Field Suggestions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFieldSuggestion] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
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
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(19, 8)
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
    DECLARE @MJAIPromptRuns_ParentID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_ParentID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup, @MJAIPromptRuns_ParentID_InputUnitsUsed, @MJAIPromptRuns_ParentID_OutputUnitsUsed, @MJAIPromptRuns_ParentID_UsageTypeID, @MJAIPromptRuns_ParentID_ToolCallingMode, @MJAIPromptRuns_ParentID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID_Clear = 1, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ParentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ParentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ParentID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_ParentID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_ParentID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_ParentID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_ParentID_ToolCallingMode, @UserID = @MJAIPromptRuns_ParentID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup, @MJAIPromptRuns_ParentID_InputUnitsUsed, @MJAIPromptRuns_ParentID_OutputUnitsUsed, @MJAIPromptRuns_ParentID_UsageTypeID, @MJAIPromptRuns_ParentID_ToolCallingMode, @MJAIPromptRuns_ParentID_UserID
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
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
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
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(19, 8)
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
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup, @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID, @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode, @MJAIPromptRuns_RerunFromPromptRunID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID_Clear = 1, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode, @UserID = @MJAIPromptRuns_RerunFromPromptRunID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup, @MJAIPromptRuns_RerunFromPromptRunID_InputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_OutputUnitsUsed, @MJAIPromptRuns_RerunFromPromptRunID_UsageTypeID, @MJAIPromptRuns_RerunFromPromptRunID_ToolCallingMode, @MJAIPromptRuns_RerunFromPromptRunID_UserID
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
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary(MAX)
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
    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun
    DECLARE @MJConversationCompactionRuns_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationCompactionRun]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor INTO @MJConversationCompactionRuns_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationCompactionRun] @ID = @MJConversationCompactionRuns_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor INTO @MJConversationCompactionRuns_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJConversationCompactionRuns_PromptRunID_cursor
    
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
    
    -- Cascade update on FieldSuggestion using cursor to call spUpdateFieldSuggestion
    DECLARE @MJFieldSuggestions_AIPromptRunIDID uniqueidentifier
    DECLARE @MJFieldSuggestions_AIPromptRunID_SuggestedValue nvarchar(MAX)
    DECLARE @MJFieldSuggestions_AIPromptRunID_Confidence decimal(5, 4)
    DECLARE @MJFieldSuggestions_AIPromptRunID_Source nvarchar(20)
    DECLARE @MJFieldSuggestions_AIPromptRunID_Outcome nvarchar(20)
    DECLARE @MJFieldSuggestions_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE cascade_update_MJFieldSuggestions_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [SuggestedValue], [Confidence], [Source], [Outcome], [AIPromptRunID]
        FROM [${flyway:defaultSchema}].[FieldSuggestion]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJFieldSuggestions_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJFieldSuggestions_AIPromptRunID_cursor INTO @MJFieldSuggestions_AIPromptRunIDID, @MJFieldSuggestions_AIPromptRunID_SuggestedValue, @MJFieldSuggestions_AIPromptRunID_Confidence, @MJFieldSuggestions_AIPromptRunID_Source, @MJFieldSuggestions_AIPromptRunID_Outcome, @MJFieldSuggestions_AIPromptRunID_AIPromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFieldSuggestions_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFieldSuggestion] @ID = @MJFieldSuggestions_AIPromptRunIDID, @SuggestedValue = @MJFieldSuggestions_AIPromptRunID_SuggestedValue, @Confidence = @MJFieldSuggestions_AIPromptRunID_Confidence, @Source = @MJFieldSuggestions_AIPromptRunID_Source, @Outcome = @MJFieldSuggestions_AIPromptRunID_Outcome, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJFieldSuggestions_AIPromptRunID_AIPromptRunID

        FETCH NEXT FROM cascade_update_MJFieldSuggestions_AIPromptRunID_cursor INTO @MJFieldSuggestions_AIPromptRunIDID, @MJFieldSuggestions_AIPromptRunID_SuggestedValue, @MJFieldSuggestions_AIPromptRunID_Confidence, @MJFieldSuggestions_AIPromptRunID_Source, @MJFieldSuggestions_AIPromptRunID_Outcome, @MJFieldSuggestions_AIPromptRunID_AIPromptRunID
    END

    CLOSE cascade_update_MJFieldSuggestions_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJFieldSuggestions_AIPromptRunID_cursor
    
    -- Cascade update on RubricEvaluation using cursor to call spUpdateRubricEvaluation
    DECLARE @MJRubricEvaluations_AIPromptRunIDID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_RubricVersionID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_SubjectEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_SubjectRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ContextEntityID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_ContextRecordID nvarchar(450)
    DECLARE @MJRubricEvaluations_AIPromptRunID_EvaluatorType nvarchar(20)
    DECLARE @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_AIPromptRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_AIAgentRunID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_EvaluatorName nvarchar(255)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Status nvarchar(20)
    DECLARE @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_SubmittedAt datetimeoffset
    DECLARE @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_NormalizedScore decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Passed bit
    DECLARE @MJRubricEvaluations_AIPromptRunID_Outcome nvarchar(30)
    DECLARE @MJRubricEvaluations_AIPromptRunID_BandID uniqueidentifier
    DECLARE @MJRubricEvaluations_AIPromptRunID_GateFailed bit
    DECLARE @MJRubricEvaluations_AIPromptRunID_Completeness decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount int
    DECLARE @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount int
    DECLARE @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount int
    DECLARE @MJRubricEvaluations_AIPromptRunID_Confidence decimal(9, 6)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Narrative nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion nvarchar(20)
    DECLARE @MJRubricEvaluations_AIPromptRunID_Metadata nvarchar(MAX)
    DECLARE cascade_update_MJRubricEvaluations_AIPromptRunID_cursor CURSOR FOR
        SELECT [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [ContextEntityID], [ContextRecordID], [EvaluatorType], [EvaluatorUserID], [AIPromptRunID], [AIAgentRunID], [EvaluatorName], [Status], [SupersedesEvaluationID], [SubmittedAt], [PassThresholdApplied], [NormalizedScore], [Passed], [Outcome], [BandID], [GateFailed], [Completeness], [ScoredCriteriaCount], [ApplicableCriteriaCount], [TotalCriteriaCount], [Confidence], [Narrative], [ErrorMessage], [ScoringEngineVersion], [Metadata]
        FROM [${flyway:defaultSchema}].[RubricEvaluation]
        WHERE [AIPromptRunID] = @ID

    OPEN cascade_update_MJRubricEvaluations_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIPromptRunID_cursor INTO @MJRubricEvaluations_AIPromptRunIDID, @MJRubricEvaluations_AIPromptRunID_RubricVersionID, @MJRubricEvaluations_AIPromptRunID_SubjectEntityID, @MJRubricEvaluations_AIPromptRunID_SubjectRecordID, @MJRubricEvaluations_AIPromptRunID_ContextEntityID, @MJRubricEvaluations_AIPromptRunID_ContextRecordID, @MJRubricEvaluations_AIPromptRunID_EvaluatorType, @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID, @MJRubricEvaluations_AIPromptRunID_AIPromptRunID, @MJRubricEvaluations_AIPromptRunID_AIAgentRunID, @MJRubricEvaluations_AIPromptRunID_EvaluatorName, @MJRubricEvaluations_AIPromptRunID_Status, @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIPromptRunID_SubmittedAt, @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied, @MJRubricEvaluations_AIPromptRunID_NormalizedScore, @MJRubricEvaluations_AIPromptRunID_Passed, @MJRubricEvaluations_AIPromptRunID_Outcome, @MJRubricEvaluations_AIPromptRunID_BandID, @MJRubricEvaluations_AIPromptRunID_GateFailed, @MJRubricEvaluations_AIPromptRunID_Completeness, @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount, @MJRubricEvaluations_AIPromptRunID_Confidence, @MJRubricEvaluations_AIPromptRunID_Narrative, @MJRubricEvaluations_AIPromptRunID_ErrorMessage, @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion, @MJRubricEvaluations_AIPromptRunID_Metadata

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRubricEvaluations_AIPromptRunID_AIPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRubricEvaluation] @ID = @MJRubricEvaluations_AIPromptRunIDID, @RubricVersionID = @MJRubricEvaluations_AIPromptRunID_RubricVersionID, @SubjectEntityID = @MJRubricEvaluations_AIPromptRunID_SubjectEntityID, @SubjectRecordID = @MJRubricEvaluations_AIPromptRunID_SubjectRecordID, @ContextEntityID = @MJRubricEvaluations_AIPromptRunID_ContextEntityID, @ContextRecordID = @MJRubricEvaluations_AIPromptRunID_ContextRecordID, @EvaluatorType = @MJRubricEvaluations_AIPromptRunID_EvaluatorType, @EvaluatorUserID = @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID, @AIPromptRunID_Clear = 1, @AIPromptRunID = @MJRubricEvaluations_AIPromptRunID_AIPromptRunID, @AIAgentRunID = @MJRubricEvaluations_AIPromptRunID_AIAgentRunID, @EvaluatorName = @MJRubricEvaluations_AIPromptRunID_EvaluatorName, @Status = @MJRubricEvaluations_AIPromptRunID_Status, @SupersedesEvaluationID = @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID, @SubmittedAt = @MJRubricEvaluations_AIPromptRunID_SubmittedAt, @PassThresholdApplied = @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied, @NormalizedScore = @MJRubricEvaluations_AIPromptRunID_NormalizedScore, @Passed = @MJRubricEvaluations_AIPromptRunID_Passed, @Outcome = @MJRubricEvaluations_AIPromptRunID_Outcome, @BandID = @MJRubricEvaluations_AIPromptRunID_BandID, @GateFailed = @MJRubricEvaluations_AIPromptRunID_GateFailed, @Completeness = @MJRubricEvaluations_AIPromptRunID_Completeness, @ScoredCriteriaCount = @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount, @ApplicableCriteriaCount = @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount, @TotalCriteriaCount = @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount, @Confidence = @MJRubricEvaluations_AIPromptRunID_Confidence, @Narrative = @MJRubricEvaluations_AIPromptRunID_Narrative, @ErrorMessage = @MJRubricEvaluations_AIPromptRunID_ErrorMessage, @ScoringEngineVersion = @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion, @Metadata = @MJRubricEvaluations_AIPromptRunID_Metadata

        FETCH NEXT FROM cascade_update_MJRubricEvaluations_AIPromptRunID_cursor INTO @MJRubricEvaluations_AIPromptRunIDID, @MJRubricEvaluations_AIPromptRunID_RubricVersionID, @MJRubricEvaluations_AIPromptRunID_SubjectEntityID, @MJRubricEvaluations_AIPromptRunID_SubjectRecordID, @MJRubricEvaluations_AIPromptRunID_ContextEntityID, @MJRubricEvaluations_AIPromptRunID_ContextRecordID, @MJRubricEvaluations_AIPromptRunID_EvaluatorType, @MJRubricEvaluations_AIPromptRunID_EvaluatorUserID, @MJRubricEvaluations_AIPromptRunID_AIPromptRunID, @MJRubricEvaluations_AIPromptRunID_AIAgentRunID, @MJRubricEvaluations_AIPromptRunID_EvaluatorName, @MJRubricEvaluations_AIPromptRunID_Status, @MJRubricEvaluations_AIPromptRunID_SupersedesEvaluationID, @MJRubricEvaluations_AIPromptRunID_SubmittedAt, @MJRubricEvaluations_AIPromptRunID_PassThresholdApplied, @MJRubricEvaluations_AIPromptRunID_NormalizedScore, @MJRubricEvaluations_AIPromptRunID_Passed, @MJRubricEvaluations_AIPromptRunID_Outcome, @MJRubricEvaluations_AIPromptRunID_BandID, @MJRubricEvaluations_AIPromptRunID_GateFailed, @MJRubricEvaluations_AIPromptRunID_Completeness, @MJRubricEvaluations_AIPromptRunID_ScoredCriteriaCount, @MJRubricEvaluations_AIPromptRunID_ApplicableCriteriaCount, @MJRubricEvaluations_AIPromptRunID_TotalCriteriaCount, @MJRubricEvaluations_AIPromptRunID_Confidence, @MJRubricEvaluations_AIPromptRunID_Narrative, @MJRubricEvaluations_AIPromptRunID_ErrorMessage, @MJRubricEvaluations_AIPromptRunID_ScoringEngineVersion, @MJRubricEvaluations_AIPromptRunID_Metadata
    END

    CLOSE cascade_update_MJRubricEvaluations_AIPromptRunID_cursor
    DEALLOCATE cascade_update_MJRubricEvaluations_AIPromptRunID_cursor
    
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Prompt Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Conversation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_UserID ON [${flyway:defaultSchema}].[Conversation] ([UserID]);

-- Index for foreign key LinkedEntityID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LinkedEntityID ON [${flyway:defaultSchema}].[Conversation] ([LinkedEntityID]);

-- Index for foreign key DataContextID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DataContextID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DataContextID ON [${flyway:defaultSchema}].[Conversation] ([DataContextID]);

-- Index for foreign key EnvironmentID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_EnvironmentID ON [${flyway:defaultSchema}].[Conversation] ([EnvironmentID]);

-- Index for foreign key ProjectID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ProjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ProjectID ON [${flyway:defaultSchema}].[Conversation] ([ProjectID]);

-- Index for foreign key TestRunID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_TestRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_TestRunID ON [${flyway:defaultSchema}].[Conversation] ([TestRunID]);

-- Index for foreign key ApplicationID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ApplicationID ON [${flyway:defaultSchema}].[Conversation] ([ApplicationID]);

-- Index for foreign key DefaultAgentID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_DefaultAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_DefaultAgentID ON [${flyway:defaultSchema}].[Conversation] ([DefaultAgentID]);

-- Index for foreign key RecordingFileID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_RecordingFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_RecordingFileID ON [${flyway:defaultSchema}].[Conversation] ([RecordingFileID]);

-- Index for foreign key LastConversationID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_LastConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_LastConversationID ON [${flyway:defaultSchema}].[Conversation] ([LastConversationID]);

-- Index for foreign key ResolvedByUserID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_ResolvedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_ResolvedByUserID ON [${flyway:defaultSchema}].[Conversation] ([ResolvedByUserID]);

-- Index for foreign key TypeID in table Conversation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Conversation_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Conversation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Conversation_TypeID ON [${flyway:defaultSchema}].[Conversation] ([TypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 34120559-280E-43A9-9BD5-63959C192B31 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='34120559-280E-43A9-9BD5-63959C192B31', @RelatedEntityNameFieldMap='Type';

/* Base View SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Conversation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversations]
AS
SELECT
    c.*,
    MJUser_UserID.[Name] AS [User],
    MJEntity_LinkedEntityID.[Name] AS [LinkedEntity],
    MJDataContext_DataContextID.[Name] AS [DataContext],
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJProject_ProjectID.[Name] AS [Project],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJApplication_ApplicationID.[Name] AS [Application],
    MJAIAgent_DefaultAgentID.[Name] AS [DefaultAgent],
    MJFile_RecordingFileID.[Name] AS [RecordingFile],
    MJConversation_LastConversationID.[Name] AS [LastConversation],
    MJUser_ResolvedByUserID.[Name] AS [ResolvedByUser],
    MJConversationType_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[Conversation] AS c
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_LinkedEntityID
  ON
    [c].[LinkedEntityID] = MJEntity_LinkedEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS MJDataContext_DataContextID
  ON
    [c].[DataContextID] = MJDataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [c].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS MJProject_ProjectID
  ON
    [c].[ProjectID] = MJProject_ProjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [c].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS MJApplication_ApplicationID
  ON
    [c].[ApplicationID] = MJApplication_ApplicationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_DefaultAgentID
  ON
    [c].[DefaultAgentID] = MJAIAgent_DefaultAgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RecordingFileID
  ON
    [c].[RecordingFileID] = MJFile_RecordingFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_LastConversationID
  ON
    [c].[LastConversationID] = MJConversation_LastConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ResolvedByUserID
  ON
    [c].[ResolvedByUserID] = MJUser_ResolvedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationType] AS MJConversationType_TypeID
  ON
    [c].[TypeID] = MJConversationType_TypeID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversations] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversations] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversations] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: Permissions for vwConversations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversations] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversations] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwConversations] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversations] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spCreateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversation]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(500) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsArchived bit = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL,
    @DataContextID_Clear bit = 0,
    @DataContextID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID_Clear bit = 0,
    @ProjectID uniqueidentifier = NULL,
    @IsPinned bit = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ApplicationScope nvarchar(20) = NULL,
    @ApplicationID_Clear bit = 0,
    @ApplicationID uniqueidentifier = NULL,
    @DefaultAgentID_Clear bit = 0,
    @DefaultAgentID uniqueidentifier = NULL,
    @AdditionalData_Clear bit = 0,
    @AdditionalData nvarchar(MAX) = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @EgressID_Clear bit = 0,
    @EgressID nvarchar(255) = NULL,
    @VisitorKey_Clear bit = 0,
    @VisitorKey nvarchar(255) = NULL,
    @LastConversationID_Clear bit = 0,
    @LastConversationID uniqueidentifier = NULL,
    @AnchorType_Clear bit = 0,
    @AnchorType nvarchar(30) = NULL,
    @AnchorKey_Clear bit = 0,
    @AnchorKey nvarchar(255) = NULL,
    @AnchorMetadata_Clear bit = 0,
    @AnchorMetadata nvarchar(MAX) = NULL,
    @IsResolved bit = NULL,
    @ResolvedByUserID_Clear bit = 0,
    @ResolvedByUserID uniqueidentifier = NULL,
    @ResolvedAt_Clear bit = 0,
    @ResolvedAt datetimeoffset = NULL,
    @TypeID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [ID],
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned],
                [TestRunID],
                [ApplicationScope],
                [ApplicationID],
                [DefaultAgentID],
                [AdditionalData],
                [RecordingFileID],
                [EgressID],
                [VisitorKey],
                [LastConversationID],
                [AnchorType],
                [AnchorKey],
                [AnchorMetadata],
                [IsResolved],
                [ResolvedByUserID],
                [ResolvedAt],
                [TypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsArchived, 0),
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END,
                CASE WHEN @DataContextID_Clear = 1 THEN NULL ELSE ISNULL(@DataContextID, NULL) END,
                ISNULL(@Status, 'Available'),
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                ISNULL(@ApplicationScope, 'Global'),
                CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, NULL) END,
                CASE WHEN @DefaultAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultAgentID, NULL) END,
                CASE WHEN @AdditionalData_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalData, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @EgressID_Clear = 1 THEN NULL ELSE ISNULL(@EgressID, NULL) END,
                CASE WHEN @VisitorKey_Clear = 1 THEN NULL ELSE ISNULL(@VisitorKey, NULL) END,
                CASE WHEN @LastConversationID_Clear = 1 THEN NULL ELSE ISNULL(@LastConversationID, NULL) END,
                CASE WHEN @AnchorType_Clear = 1 THEN NULL ELSE ISNULL(@AnchorType, NULL) END,
                CASE WHEN @AnchorKey_Clear = 1 THEN NULL ELSE ISNULL(@AnchorKey, NULL) END,
                CASE WHEN @AnchorMetadata_Clear = 1 THEN NULL ELSE ISNULL(@AnchorMetadata, NULL) END,
                ISNULL(@IsResolved, 0),
                CASE WHEN @ResolvedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedByUserID, NULL) END,
                CASE WHEN @ResolvedAt_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedAt, NULL) END,
                CASE WHEN @TypeID = '00000000-0000-0000-0000-000000000000' THEN '7F81FF57-C5A8-464D-B3B4-35A4FCF10717' ELSE ISNULL(@TypeID, '7F81FF57-C5A8-464D-B3B4-35A4FCF10717') END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Conversation]
            (
                [UserID],
                [ExternalID],
                [Name],
                [Description],
                [IsArchived],
                [LinkedEntityID],
                [LinkedRecordID],
                [DataContextID],
                [Status],
                [EnvironmentID],
                [ProjectID],
                [IsPinned],
                [TestRunID],
                [ApplicationScope],
                [ApplicationID],
                [DefaultAgentID],
                [AdditionalData],
                [RecordingFileID],
                [EgressID],
                [VisitorKey],
                [LastConversationID],
                [AnchorType],
                [AnchorKey],
                [AnchorMetadata],
                [IsResolved],
                [ResolvedByUserID],
                [ResolvedAt],
                [TypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsArchived, 0),
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END,
                CASE WHEN @DataContextID_Clear = 1 THEN NULL ELSE ISNULL(@DataContextID, NULL) END,
                ISNULL(@Status, 'Available'),
                CASE WHEN @EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, NULL) END,
                ISNULL(@IsPinned, 0),
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                ISNULL(@ApplicationScope, 'Global'),
                CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, NULL) END,
                CASE WHEN @DefaultAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultAgentID, NULL) END,
                CASE WHEN @AdditionalData_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalData, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @EgressID_Clear = 1 THEN NULL ELSE ISNULL(@EgressID, NULL) END,
                CASE WHEN @VisitorKey_Clear = 1 THEN NULL ELSE ISNULL(@VisitorKey, NULL) END,
                CASE WHEN @LastConversationID_Clear = 1 THEN NULL ELSE ISNULL(@LastConversationID, NULL) END,
                CASE WHEN @AnchorType_Clear = 1 THEN NULL ELSE ISNULL(@AnchorType, NULL) END,
                CASE WHEN @AnchorKey_Clear = 1 THEN NULL ELSE ISNULL(@AnchorKey, NULL) END,
                CASE WHEN @AnchorMetadata_Clear = 1 THEN NULL ELSE ISNULL(@AnchorMetadata, NULL) END,
                ISNULL(@IsResolved, 0),
                CASE WHEN @ResolvedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedByUserID, NULL) END,
                CASE WHEN @ResolvedAt_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedAt, NULL) END,
                CASE WHEN @TypeID = '00000000-0000-0000-0000-000000000000' THEN '7F81FF57-C5A8-464D-B3B4-35A4FCF10717' ELSE ISNULL(@TypeID, '7F81FF57-C5A8-464D-B3B4-35A4FCF10717') END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Conversations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spUpdateConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversation]
    @ID uniqueidentifier,
    @UserID uniqueidentifier = NULL,
    @ExternalID_Clear bit = 0,
    @ExternalID nvarchar(500) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsArchived bit = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL,
    @DataContextID_Clear bit = 0,
    @DataContextID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID_Clear bit = 0,
    @ProjectID uniqueidentifier = NULL,
    @IsPinned bit = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @ApplicationScope nvarchar(20) = NULL,
    @ApplicationID_Clear bit = 0,
    @ApplicationID uniqueidentifier = NULL,
    @DefaultAgentID_Clear bit = 0,
    @DefaultAgentID uniqueidentifier = NULL,
    @AdditionalData_Clear bit = 0,
    @AdditionalData nvarchar(MAX) = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @EgressID_Clear bit = 0,
    @EgressID nvarchar(255) = NULL,
    @VisitorKey_Clear bit = 0,
    @VisitorKey nvarchar(255) = NULL,
    @LastConversationID_Clear bit = 0,
    @LastConversationID uniqueidentifier = NULL,
    @AnchorType_Clear bit = 0,
    @AnchorType nvarchar(30) = NULL,
    @AnchorKey_Clear bit = 0,
    @AnchorKey nvarchar(255) = NULL,
    @AnchorMetadata_Clear bit = 0,
    @AnchorMetadata nvarchar(MAX) = NULL,
    @IsResolved bit = NULL,
    @ResolvedByUserID_Clear bit = 0,
    @ResolvedByUserID uniqueidentifier = NULL,
    @ResolvedAt_Clear bit = 0,
    @ResolvedAt datetimeoffset = NULL,
    @TypeID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        [UserID] = ISNULL(@UserID, [UserID]),
        [ExternalID] = CASE WHEN @ExternalID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalID, [ExternalID]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsArchived] = ISNULL(@IsArchived, [IsArchived]),
        [LinkedEntityID] = CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, [LinkedEntityID]) END,
        [LinkedRecordID] = CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, [LinkedRecordID]) END,
        [DataContextID] = CASE WHEN @DataContextID_Clear = 1 THEN NULL ELSE ISNULL(@DataContextID, [DataContextID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [EnvironmentID] = ISNULL(@EnvironmentID, [EnvironmentID]),
        [ProjectID] = CASE WHEN @ProjectID_Clear = 1 THEN NULL ELSE ISNULL(@ProjectID, [ProjectID]) END,
        [IsPinned] = ISNULL(@IsPinned, [IsPinned]),
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [ApplicationScope] = ISNULL(@ApplicationScope, [ApplicationScope]),
        [ApplicationID] = CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, [ApplicationID]) END,
        [DefaultAgentID] = CASE WHEN @DefaultAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultAgentID, [DefaultAgentID]) END,
        [AdditionalData] = CASE WHEN @AdditionalData_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalData, [AdditionalData]) END,
        [RecordingFileID] = CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, [RecordingFileID]) END,
        [EgressID] = CASE WHEN @EgressID_Clear = 1 THEN NULL ELSE ISNULL(@EgressID, [EgressID]) END,
        [VisitorKey] = CASE WHEN @VisitorKey_Clear = 1 THEN NULL ELSE ISNULL(@VisitorKey, [VisitorKey]) END,
        [LastConversationID] = CASE WHEN @LastConversationID_Clear = 1 THEN NULL ELSE ISNULL(@LastConversationID, [LastConversationID]) END,
        [AnchorType] = CASE WHEN @AnchorType_Clear = 1 THEN NULL ELSE ISNULL(@AnchorType, [AnchorType]) END,
        [AnchorKey] = CASE WHEN @AnchorKey_Clear = 1 THEN NULL ELSE ISNULL(@AnchorKey, [AnchorKey]) END,
        [AnchorMetadata] = CASE WHEN @AnchorMetadata_Clear = 1 THEN NULL ELSE ISNULL(@AnchorMetadata, [AnchorMetadata]) END,
        [IsResolved] = ISNULL(@IsResolved, [IsResolved]),
        [ResolvedByUserID] = CASE WHEN @ResolvedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedByUserID, [ResolvedByUserID]) END,
        [ResolvedAt] = CASE WHEN @ResolvedAt_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedAt, [ResolvedAt]) END,
        [TypeID] = ISNULL(@TypeID, [TypeID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Conversation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversation
ON [${flyway:defaultSchema}].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Conversation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Conversation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Conversations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

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
    DECLARE @MJAIAgentRuns_ConversationID_BoundActionParams nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRuns_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth], [BoundActionParams]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth, @MJAIAgentRuns_ConversationID_BoundActionParams

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationIDID, @AgentID = @MJAIAgentRuns_ConversationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationID_ParentRunID, @Status = @MJAIAgentRuns_ConversationID_Status, @StartedAt = @MJAIAgentRuns_ConversationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationID_CompletedAt, @Success = @MJAIAgentRuns_ConversationID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationID_ErrorMessage, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentRuns_ConversationID_ConversationID, @UserID = @MJAIAgentRuns_ConversationID_UserID, @Result = @MJAIAgentRuns_ConversationID_Result, @AgentState = @MJAIAgentRuns_ConversationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationID_FinalPayload, @Message = @MJAIAgentRuns_ConversationID_Message, @LastRunID = @MJAIAgentRuns_ConversationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationID_Data, @Verbose = @MJAIAgentRuns_ConversationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationID_RunName, @Comments = @MJAIAgentRuns_ConversationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ConversationID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ConversationID_ContinuationDepth, @BoundActionParams = @MJAIAgentRuns_ConversationID_BoundActionParams

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth, @MJAIAgentRuns_ConversationID_BoundActionParams
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
    DECLARE @MJAIAgentSessions_ConversationID_RecordingStartedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedRecordID nvarchar(500)
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason], [RecordingStartedAt], [LinkedEntityID], [LinkedRecordID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason, @RecordingStartedAt = @MJAIAgentSessions_ConversationID_RecordingStartedAt, @LinkedEntityID = @MJAIAgentSessions_ConversationID_LinkedEntityID, @LinkedRecordID = @MJAIAgentSessions_ConversationID_LinkedRecordID

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID
    END

    CLOSE cascade_update_MJAIAgentSessions_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentSessions_ConversationID_cursor
    
    -- Cascade delete from Comment using cursor to call spDeleteComment
    DECLARE @MJComments_IDID uniqueidentifier
    DECLARE cascade_delete_MJComments_ID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[Comment]
        WHERE [ID] = @ID
    
    OPEN cascade_delete_MJComments_ID_cursor
    FETCH NEXT FROM cascade_delete_MJComments_ID_cursor INTO @MJComments_IDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteComment] @ID = @MJComments_IDID
        
        FETCH NEXT FROM cascade_delete_MJComments_ID_cursor INTO @MJComments_IDID
    END
    
    CLOSE cascade_delete_MJComments_ID_cursor
    DEALLOCATE cascade_delete_MJComments_ID_cursor
    
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
    DECLARE @MJConversations_LastConversationID_AnchorType nvarchar(30)
    DECLARE @MJConversations_LastConversationID_AnchorKey nvarchar(255)
    DECLARE @MJConversations_LastConversationID_AnchorMetadata nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_IsResolved bit
    DECLARE @MJConversations_LastConversationID_ResolvedByUserID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ResolvedAt datetimeoffset
    DECLARE @MJConversations_LastConversationID_TypeID uniqueidentifier
    DECLARE cascade_update_MJConversations_LastConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID], [AnchorType], [AnchorKey], [AnchorMetadata], [IsResolved], [ResolvedByUserID], [ResolvedAt], [TypeID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [LastConversationID] = @ID

    OPEN cascade_update_MJConversations_LastConversationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID, @MJConversations_LastConversationID_AnchorType, @MJConversations_LastConversationID_AnchorKey, @MJConversations_LastConversationID_AnchorMetadata, @MJConversations_LastConversationID_IsResolved, @MJConversations_LastConversationID_ResolvedByUserID, @MJConversations_LastConversationID_ResolvedAt, @MJConversations_LastConversationID_TypeID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_LastConversationID_LastConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_LastConversationIDID, @UserID = @MJConversations_LastConversationID_UserID, @ExternalID = @MJConversations_LastConversationID_ExternalID, @Name = @MJConversations_LastConversationID_Name, @Description = @MJConversations_LastConversationID_Description, @IsArchived = @MJConversations_LastConversationID_IsArchived, @LinkedEntityID = @MJConversations_LastConversationID_LinkedEntityID, @LinkedRecordID = @MJConversations_LastConversationID_LinkedRecordID, @DataContextID = @MJConversations_LastConversationID_DataContextID, @Status = @MJConversations_LastConversationID_Status, @EnvironmentID = @MJConversations_LastConversationID_EnvironmentID, @ProjectID = @MJConversations_LastConversationID_ProjectID, @IsPinned = @MJConversations_LastConversationID_IsPinned, @TestRunID = @MJConversations_LastConversationID_TestRunID, @ApplicationScope = @MJConversations_LastConversationID_ApplicationScope, @ApplicationID = @MJConversations_LastConversationID_ApplicationID, @DefaultAgentID = @MJConversations_LastConversationID_DefaultAgentID, @AdditionalData = @MJConversations_LastConversationID_AdditionalData, @RecordingFileID = @MJConversations_LastConversationID_RecordingFileID, @EgressID = @MJConversations_LastConversationID_EgressID, @VisitorKey = @MJConversations_LastConversationID_VisitorKey, @LastConversationID_Clear = 1, @LastConversationID = @MJConversations_LastConversationID_LastConversationID, @AnchorType = @MJConversations_LastConversationID_AnchorType, @AnchorKey = @MJConversations_LastConversationID_AnchorKey, @AnchorMetadata = @MJConversations_LastConversationID_AnchorMetadata, @IsResolved = @MJConversations_LastConversationID_IsResolved, @ResolvedByUserID = @MJConversations_LastConversationID_ResolvedByUserID, @ResolvedAt = @MJConversations_LastConversationID_ResolvedAt, @TypeID = @MJConversations_LastConversationID_TypeID

        FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID, @MJConversations_LastConversationID_AnchorType, @MJConversations_LastConversationID_AnchorKey, @MJConversations_LastConversationID_AnchorMetadata, @MJConversations_LastConversationID_IsResolved, @MJConversations_LastConversationID_ResolvedByUserID, @MJConversations_LastConversationID_ResolvedAt, @MJConversations_LastConversationID_TypeID
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
    DECLARE @MJAIAgents_ParentID_MaxSubAgentConsultRounds int
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools], [MaxSubAgentConsultRounds]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools, @MJAIAgents_ParentID_MaxSubAgentConsultRounds

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ParentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ParentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ParentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ParentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ParentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ParentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ParentID_DeclareActionsAsNativeTools, @MaxSubAgentConsultRounds = @MJAIAgents_ParentID_MaxSubAgentConsultRounds

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools, @MJAIAgents_ParentID_MaxSubAgentConsultRounds
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
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxSubAgentConsultRounds int
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools], [MaxSubAgentConsultRounds]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools, @MJAIAgents_DefaultCoAgentID_MaxSubAgentConsultRounds

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools, @MaxSubAgentConsultRounds = @MJAIAgents_DefaultCoAgentID_MaxSubAgentConsultRounds

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools, @MJAIAgents_DefaultCoAgentID_MaxSubAgentConsultRounds
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
    DECLARE @MJConversations_DefaultAgentID_AnchorType nvarchar(30)
    DECLARE @MJConversations_DefaultAgentID_AnchorKey nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_AnchorMetadata nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_IsResolved bit
    DECLARE @MJConversations_DefaultAgentID_ResolvedByUserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ResolvedAt datetimeoffset
    DECLARE @MJConversations_DefaultAgentID_TypeID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID], [AnchorType], [AnchorKey], [AnchorMetadata], [IsResolved], [ResolvedByUserID], [ResolvedAt], [TypeID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID, @MJConversations_DefaultAgentID_AnchorType, @MJConversations_DefaultAgentID_AnchorKey, @MJConversations_DefaultAgentID_AnchorMetadata, @MJConversations_DefaultAgentID_IsResolved, @MJConversations_DefaultAgentID_ResolvedByUserID, @MJConversations_DefaultAgentID_ResolvedAt, @MJConversations_DefaultAgentID_TypeID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @LastConversationID = @MJConversations_DefaultAgentID_LastConversationID, @AnchorType = @MJConversations_DefaultAgentID_AnchorType, @AnchorKey = @MJConversations_DefaultAgentID_AnchorKey, @AnchorMetadata = @MJConversations_DefaultAgentID_AnchorMetadata, @IsResolved = @MJConversations_DefaultAgentID_IsResolved, @ResolvedByUserID = @MJConversations_DefaultAgentID_ResolvedByUserID, @ResolvedAt = @MJConversations_DefaultAgentID_ResolvedAt, @TypeID = @MJConversations_DefaultAgentID_TypeID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID, @MJConversations_DefaultAgentID_AnchorType, @MJConversations_DefaultAgentID_AnchorKey, @MJConversations_DefaultAgentID_AnchorMetadata, @MJConversations_DefaultAgentID_IsResolved, @MJConversations_DefaultAgentID_ResolvedByUserID, @MJConversations_DefaultAgentID_ResolvedAt, @MJConversations_DefaultAgentID_TypeID
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

/* spDelete SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ApplicationEntity using cursor to call spDeleteApplicationEntity
    DECLARE @MJApplicationEntities_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationEntities_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationEntity]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationEntities_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationEntity] @ID = @MJApplicationEntities_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    
    -- Cascade delete from ApplicationRole using cursor to call spDeleteApplicationRole
    DECLARE @MJApplicationRoles_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationRoles_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationRole]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationRoles_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationRole] @ID = @MJApplicationRoles_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    
    -- Cascade delete from ApplicationSetting using cursor to call spDeleteApplicationSetting
    DECLARE @MJApplicationSettings_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationSettings_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationSetting]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationSettings_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationSetting] @ID = @MJApplicationSettings_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor INTO @MJConversationWidgetInstances_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor INTO @MJConversationWidgetInstances_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_ApplicationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_ApplicationIDID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_UserID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_Name nvarchar(255)
    DECLARE @MJConversations_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_IsArchived bit
    DECLARE @MJConversations_ApplicationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_Status nvarchar(20)
    DECLARE @MJConversations_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_IsPinned bit
    DECLARE @MJConversations_ApplicationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_EgressID nvarchar(255)
    DECLARE @MJConversations_ApplicationID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_ApplicationID_LastConversationID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_AnchorType nvarchar(30)
    DECLARE @MJConversations_ApplicationID_AnchorKey nvarchar(255)
    DECLARE @MJConversations_ApplicationID_AnchorMetadata nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_IsResolved bit
    DECLARE @MJConversations_ApplicationID_ResolvedByUserID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ResolvedAt datetimeoffset
    DECLARE @MJConversations_ApplicationID_TypeID uniqueidentifier
    DECLARE cascade_update_MJConversations_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID], [AnchorType], [AnchorKey], [AnchorMetadata], [IsResolved], [ResolvedByUserID], [ResolvedAt], [TypeID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJConversations_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID, @MJConversations_ApplicationID_VisitorKey, @MJConversations_ApplicationID_LastConversationID, @MJConversations_ApplicationID_AnchorType, @MJConversations_ApplicationID_AnchorKey, @MJConversations_ApplicationID_AnchorMetadata, @MJConversations_ApplicationID_IsResolved, @MJConversations_ApplicationID_ResolvedByUserID, @MJConversations_ApplicationID_ResolvedAt, @MJConversations_ApplicationID_TypeID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_ApplicationIDID, @UserID = @MJConversations_ApplicationID_UserID, @ExternalID = @MJConversations_ApplicationID_ExternalID, @Name = @MJConversations_ApplicationID_Name, @Description = @MJConversations_ApplicationID_Description, @IsArchived = @MJConversations_ApplicationID_IsArchived, @LinkedEntityID = @MJConversations_ApplicationID_LinkedEntityID, @LinkedRecordID = @MJConversations_ApplicationID_LinkedRecordID, @DataContextID = @MJConversations_ApplicationID_DataContextID, @Status = @MJConversations_ApplicationID_Status, @EnvironmentID = @MJConversations_ApplicationID_EnvironmentID, @ProjectID = @MJConversations_ApplicationID_ProjectID, @IsPinned = @MJConversations_ApplicationID_IsPinned, @TestRunID = @MJConversations_ApplicationID_TestRunID, @ApplicationScope = @MJConversations_ApplicationID_ApplicationScope, @ApplicationID_Clear = 1, @ApplicationID = @MJConversations_ApplicationID_ApplicationID, @DefaultAgentID = @MJConversations_ApplicationID_DefaultAgentID, @AdditionalData = @MJConversations_ApplicationID_AdditionalData, @RecordingFileID = @MJConversations_ApplicationID_RecordingFileID, @EgressID = @MJConversations_ApplicationID_EgressID, @VisitorKey = @MJConversations_ApplicationID_VisitorKey, @LastConversationID = @MJConversations_ApplicationID_LastConversationID, @AnchorType = @MJConversations_ApplicationID_AnchorType, @AnchorKey = @MJConversations_ApplicationID_AnchorKey, @AnchorMetadata = @MJConversations_ApplicationID_AnchorMetadata, @IsResolved = @MJConversations_ApplicationID_IsResolved, @ResolvedByUserID = @MJConversations_ApplicationID_ResolvedByUserID, @ResolvedAt = @MJConversations_ApplicationID_ResolvedAt, @TypeID = @MJConversations_ApplicationID_TypeID

        FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID, @MJConversations_ApplicationID_VisitorKey, @MJConversations_ApplicationID_LastConversationID, @MJConversations_ApplicationID_AnchorType, @MJConversations_ApplicationID_AnchorKey, @MJConversations_ApplicationID_AnchorMetadata, @MJConversations_ApplicationID_IsResolved, @MJConversations_ApplicationID_ResolvedByUserID, @MJConversations_ApplicationID_ResolvedAt, @MJConversations_ApplicationID_TypeID
    END

    CLOSE cascade_update_MJConversations_ApplicationID_cursor
    DEALLOCATE cascade_update_MJConversations_ApplicationID_cursor
    
    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference
    DECLARE @MJDashboardUserPreferences_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[DashboardUserPreference]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteDashboardUserPreference] @ID = @MJDashboardUserPreferences_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    
    -- Cascade update on Dashboard using cursor to call spUpdateDashboard
    DECLARE @MJDashboards_ApplicationIDID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_Name nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_UserID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_CategoryID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_UIConfigDetails nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Type nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_Thumbnail nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Scope nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_DriverClass nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Code nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_ApprovalStatus nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_ApprovalComments nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_ApprovedByUserID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_ApprovedAt datetimeoffset
    DECLARE @MJDashboards_ApplicationID_ApprovedFingerprint nvarchar(100)
    DECLARE cascade_update_MJDashboards_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [UserID], [CategoryID], [UIConfigDetails], [Type], [Thumbnail], [Scope], [ApplicationID], [DriverClass], [Code], [EnvironmentID], [ApprovalStatus], [ApprovalComments], [ApprovedByUserID], [ApprovedAt], [ApprovedFingerprint]
        FROM [${flyway:defaultSchema}].[Dashboard]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJDashboards_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID, @MJDashboards_ApplicationID_ApprovalStatus, @MJDashboards_ApplicationID_ApprovalComments, @MJDashboards_ApplicationID_ApprovedByUserID, @MJDashboards_ApplicationID_ApprovedAt, @MJDashboards_ApplicationID_ApprovedFingerprint

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDashboards_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDashboard] @ID = @MJDashboards_ApplicationIDID, @Name = @MJDashboards_ApplicationID_Name, @Description = @MJDashboards_ApplicationID_Description, @UserID = @MJDashboards_ApplicationID_UserID, @CategoryID = @MJDashboards_ApplicationID_CategoryID, @UIConfigDetails = @MJDashboards_ApplicationID_UIConfigDetails, @Type = @MJDashboards_ApplicationID_Type, @Thumbnail = @MJDashboards_ApplicationID_Thumbnail, @Scope = @MJDashboards_ApplicationID_Scope, @ApplicationID_Clear = 1, @ApplicationID = @MJDashboards_ApplicationID_ApplicationID, @DriverClass = @MJDashboards_ApplicationID_DriverClass, @Code = @MJDashboards_ApplicationID_Code, @EnvironmentID = @MJDashboards_ApplicationID_EnvironmentID, @ApprovalStatus = @MJDashboards_ApplicationID_ApprovalStatus, @ApprovalComments = @MJDashboards_ApplicationID_ApprovalComments, @ApprovedByUserID = @MJDashboards_ApplicationID_ApprovedByUserID, @ApprovedAt = @MJDashboards_ApplicationID_ApprovedAt, @ApprovedFingerprint = @MJDashboards_ApplicationID_ApprovedFingerprint

        FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID, @MJDashboards_ApplicationID_ApprovalStatus, @MJDashboards_ApplicationID_ApprovalComments, @MJDashboards_ApplicationID_ApprovedByUserID, @MJDashboards_ApplicationID_ApprovedAt, @MJDashboards_ApplicationID_ApprovedFingerprint
    END

    CLOSE cascade_update_MJDashboards_ApplicationID_cursor
    DEALLOCATE cascade_update_MJDashboards_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInviteApplication using cursor to call spDeleteMagicLinkInviteApplication
    DECLARE @MJMagicLinkInviteApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInviteApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication] @ID = @MJMagicLinkInviteApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInvite using cursor to call spDeleteMagicLinkInvite
    DECLARE @MJMagicLinkInvites_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInvite]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] @ID = @MJMagicLinkInvites_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    
    -- Cascade delete from UserApplication using cursor to call spDeleteUserApplication
    DECLARE @MJUserApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJUserApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[UserApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJUserApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteUserApplication] @ID = @MJUserApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJUserApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJUserApplications_ApplicationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Application]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Applications */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 60 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9f8acbb-e916-4fe3-abec-b124be42ff8d' OR (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd9f8acbb-e916-4fe3-abec-b124be42ff8d',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversations
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '13248F34-2837-EF11-86D4-6045BDEE16E6'),
            'Type',
            'Type',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b94d8162-7fbc-441f-9843-60ef3a2e57e1' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'CommentTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b94d8162-7fbc-441f-9843-60ef3a2e57e1',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'CommentTypeID',
            'Comment Type ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31671ef7-03c1-4b33-aca2-4363743b702b' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '31671ef7-03c1-4b33-aca2-4363743b702b',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0eb5aa9e-3f62-476a-9492-8333099ada59' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ExternalID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0eb5aa9e-3f62-476a-9492-8333099ada59',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ExternalID',
            'External ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03bc315a-9ae2-4996-a1d8-f2b7862358c2' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03bc315a-9ae2-4996-a1d8-f2b7862358c2',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'Name',
            'Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '60973300-2ca8-41c7-a453-fed4e6bc54a2' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '60973300-2ca8-41c7-a453-fed4e6bc54a2',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '332dfb73-abd0-46da-b135-bca7d378ee12' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'IsArchived')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '332dfb73-abd0-46da-b135-bca7d378ee12',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'IsArchived',
            'Is Archived',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42cbb605-c57c-48fd-b783-780d5ebc9b20' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'LinkedEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42cbb605-c57c-48fd-b783-780d5ebc9b20',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'LinkedEntityID',
            'Linked Entity ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94c36755-effe-4e9b-8f30-84afe0c6442d' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'LinkedRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '94c36755-effe-4e9b-8f30-84afe0c6442d',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'LinkedRecordID',
            'Linked Record ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c6fc01c-1b24-4170-b88e-0a03734b8174' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'DataContextID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0c6fc01c-1b24-4170-b88e-0a03734b8174',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'DataContextID',
            'Data Context ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b977e33-7325-4684-9acf-881a06a4bba8' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b977e33-7325-4684-9acf-881a06a4bba8',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aeb5e04d-0ab4-4388-b198-a936643bf14b' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'EnvironmentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aeb5e04d-0ab4-4388-b198-a936643bf14b',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '951f2723-a5d0-4f52-b772-59ab83c9c366' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ProjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '951f2723-a5d0-4f52-b772-59ab83c9c366',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ProjectID',
            'Project ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b9aeb23-664c-402a-9a7a-dab0f98349df' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'IsPinned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4b9aeb23-664c-402a-9a7a-dab0f98349df',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'IsPinned',
            'Is Pinned',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43f9cd15-4fe2-4bac-a924-8e81016b221b' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'TestRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '43f9cd15-4fe2-4bac-a924-8e81016b221b',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'TestRunID',
            'Test Run ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e72fb58-563a-494e-bba0-c27336cbd319' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ApplicationScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9e72fb58-563a-494e-bba0-c27336cbd319',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ApplicationScope',
            'Application Scope',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26d2f374-84d6-42eb-8f34-bebeaa8bdc98' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ApplicationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26d2f374-84d6-42eb-8f34-bebeaa8bdc98',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ApplicationID',
            'Application ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd447656-3260-48dd-8fcb-096ef3073689' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'DefaultAgentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fd447656-3260-48dd-8fcb-096ef3073689',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'DefaultAgentID',
            'Default Agent ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3ddc5fd-0238-43d7-b19b-3b03094e947a' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'AdditionalData')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e3ddc5fd-0238-43d7-b19b-3b03094e947a',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'AdditionalData',
            'Additional Data',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '118d4ffa-e163-4443-9b61-b5ff1cffc261' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'RecordingFileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '118d4ffa-e163-4443-9b61-b5ff1cffc261',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'RecordingFileID',
            'Recording File ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97299232-eeb8-4b86-bb3f-8e172789b8e5' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'EgressID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '97299232-eeb8-4b86-bb3f-8e172789b8e5',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'EgressID',
            'Egress ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16c2b77d-7e8c-41f0-8734-b281a232525d' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'VisitorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16c2b77d-7e8c-41f0-8734-b281a232525d',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'VisitorKey',
            'Visitor Key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '822e5493-bcd0-4764-a353-e364f6566e0c' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'LastConversationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '822e5493-bcd0-4764-a353-e364f6566e0c',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'LastConversationID',
            'Last Conversation ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f9b3cf7-f11e-445e-b1c7-11f68bf49008' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'AnchorType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4f9b3cf7-f11e-445e-b1c7-11f68bf49008',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'AnchorType',
            'Anchor Type',
            NULL,
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15f26c79-054a-4521-ac55-b7181a2aa112' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'AnchorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15f26c79-054a-4521-ac55-b7181a2aa112',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'AnchorKey',
            'Anchor Key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f400d164-608a-4941-a5a9-8d6509740d36' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'AnchorMetadata')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f400d164-608a-4941-a5a9-8d6509740d36',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'AnchorMetadata',
            'Anchor Metadata',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bc2540b-e755-4a52-81bf-24cb825be882' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'IsResolved')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8bc2540b-e755-4a52-81bf-24cb825be882',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'IsResolved',
            'Is Resolved',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69a4804f-38cd-4e7e-a864-7e388d8fced6' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ResolvedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '69a4804f-38cd-4e7e-a864-7e388d8fced6',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ResolvedByUserID',
            'Resolved By User ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5eaeec3-b57d-449f-b495-67610111dc5d' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'ResolvedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e5eaeec3-b57d-449f-b495-67610111dc5d',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'ResolvedAt',
            'Resolved At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e9fec3b-50d9-4a18-9107-8e15257ff4a6' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'TypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4e9fec3b-50d9-4a18-9107-8e15257ff4a6',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'TypeID',
            'Type ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84fe8a6f-4588-4b2c-9318-32b09d80fb6b' OR (EntityID = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND Name = 'AIPromptRun')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '84fe8a6f-4588-4b2c-9318-32b09d80fb6b',
            '02E26617-130C-4A5A-B4D2-76F06F01C6A1', -- Entity: MJ: Field Suggestions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1'),
            'AIPromptRun',
            'AI Prompt Run',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26f885aa-94b1-476f-9d06-5df65d1d60b8' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26f885aa-94b1-476f-9d06-5df65d1d60b8',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a9e05f4-c086-4c5a-9bdd-79e54e155fd9' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ExternalID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a9e05f4-c086-4c5a-9bdd-79e54e155fd9',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ExternalID',
            'External ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aee74709-406f-43f0-a502-f6d6880ad595' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aee74709-406f-43f0-a502-f6d6880ad595',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'Name',
            'Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db495b1c-07c5-423c-95f8-945c83ea2890' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'db495b1c-07c5-423c-95f8-945c83ea2890',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86535efb-1bc6-452a-9eff-f3209c3e53b5' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'IsArchived')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86535efb-1bc6-452a-9eff-f3209c3e53b5',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'IsArchived',
            'Is Archived',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb94fd0c-1db9-47dd-a342-525c1770288e' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'LinkedEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eb94fd0c-1db9-47dd-a342-525c1770288e',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'LinkedEntityID',
            'Linked Entity ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44ffdfd8-e8c8-476d-a39b-0fbf2ba843f4' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'LinkedRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44ffdfd8-e8c8-476d-a39b-0fbf2ba843f4',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'LinkedRecordID',
            'Linked Record ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67987b2c-9876-4010-b3a4-245e64508104' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'DataContextID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '67987b2c-9876-4010-b3a4-245e64508104',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'DataContextID',
            'Data Context ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c9c9d9f-52f0-4a9a-8317-218e8cc66ccc' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c9c9d9f-52f0-4a9a-8317-218e8cc66ccc',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e090aa13-add1-4fed-8448-ec6e34ac669b' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'EnvironmentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e090aa13-add1-4fed-8448-ec6e34ac669b',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'EnvironmentID',
            'Environment ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98c84a78-d928-44e4-b14d-1bd0345e0e63' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ProjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '98c84a78-d928-44e4-b14d-1bd0345e0e63',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ProjectID',
            'Project ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'daa1e97b-c326-458a-8770-5f1b608928fb' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'IsPinned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'daa1e97b-c326-458a-8770-5f1b608928fb',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'IsPinned',
            'Is Pinned',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a439b0c4-2cd7-42b8-bd24-3015a4bc97a5' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'TestRunID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a439b0c4-2cd7-42b8-bd24-3015a4bc97a5',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'TestRunID',
            'Test Run ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '151d685d-ac88-4fdf-8a4c-e4b951379d1b' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ApplicationScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '151d685d-ac88-4fdf-8a4c-e4b951379d1b',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ApplicationScope',
            'Application Scope',
            NULL,
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44398d16-4b9e-4684-9e9a-0d2d9635345c' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ApplicationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44398d16-4b9e-4684-9e9a-0d2d9635345c',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ApplicationID',
            'Application ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '824ce7e1-0419-4d81-8303-6fc12e88eb94' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'DefaultAgentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '824ce7e1-0419-4d81-8303-6fc12e88eb94',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'DefaultAgentID',
            'Default Agent ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af9b7334-c31b-4bca-94db-c581e2d8565c' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'AdditionalData')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af9b7334-c31b-4bca-94db-c581e2d8565c',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'AdditionalData',
            'Additional Data',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4708ae2e-8041-4ebd-9418-3948a5eb98a8' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'RecordingFileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4708ae2e-8041-4ebd-9418-3948a5eb98a8',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'RecordingFileID',
            'Recording File ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a4d6e44-7dee-4ae6-b385-3da9325bd45a' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'EgressID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a4d6e44-7dee-4ae6-b385-3da9325bd45a',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'EgressID',
            'Egress ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78c6c069-4108-464e-828c-29140bfbc289' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'VisitorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '78c6c069-4108-464e-828c-29140bfbc289',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'VisitorKey',
            'Visitor Key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d323611-7957-404f-b384-8b8185c9b6cb' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'LastConversationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d323611-7957-404f-b384-8b8185c9b6cb',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'LastConversationID',
            'Last Conversation ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8f3abad-a90f-4071-b02a-791e0b5f57c7' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'AnchorType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8f3abad-a90f-4071-b02a-791e0b5f57c7',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'AnchorType',
            'Anchor Type',
            NULL,
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '641e0699-4437-4b76-b5c3-aaa75ca1894f' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'AnchorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '641e0699-4437-4b76-b5c3-aaa75ca1894f',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'AnchorKey',
            'Anchor Key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5aea0e64-fff7-460e-89d3-a2dc211402be' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'AnchorMetadata')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5aea0e64-fff7-460e-89d3-a2dc211402be',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'AnchorMetadata',
            'Anchor Metadata',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9667cf57-f598-4f76-815a-695927a2f12b' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'IsResolved')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9667cf57-f598-4f76-815a-695927a2f12b',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'IsResolved',
            'Is Resolved',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24daf18b-16a9-44f5-9445-696d4c6da46f' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ResolvedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24daf18b-16a9-44f5-9445-696d4c6da46f',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ResolvedByUserID',
            'Resolved By User ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4635dc3e-99aa-4725-9a9f-c30b3a08e076' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'ResolvedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4635dc3e-99aa-4725-9a9f-c30b3a08e076',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'ResolvedAt',
            'Resolved At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba38aaed-97a9-4cde-8872-1ae1e9fb43a6' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'TypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba38aaed-97a9-4cde-8872-1ae1e9fb43a6',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'TypeID',
            'Type ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '764b7ae0-e92e-4765-989e-ba847c93574d' OR (EntityID = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND Name = 'CommentType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '764b7ae0-e92e-4765-989e-ba847c93574d',
            'B46E1990-487D-45D6-B91E-A77D58ED0229', -- Entity: MJ: Comments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229'),
            'CommentType',
            'Comment Type',
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

/* Update IS-A parent field UserID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E1238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='26F885AA-94B1-476F-9D06-5DF65D1D60B8';

/* Update IS-A parent field ExternalID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=1000,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='6A9E05F4-C086-4C5A-9BDD-79E54E155FD9';

/* Update IS-A parent field Name on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='AEE74709-406F-43F0-A502-F6D6880AD595';

/* Update IS-A parent field Description on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='DB495B1C-07C5-423C-95F8-945C83EA2890';

/* Update IS-A parent field IsArchived on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='86535EFB-1BC6-452A-9EFF-F3209C3E53B5';

/* Update IS-A parent field LinkedEntityID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E0238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='EB94FD0C-1DB9-47DD-A342-525C1770288E';

/* Update IS-A parent field LinkedRecordID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=1000,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='44FFDFD8-E8C8-476D-A39B-0FBF2BA843F4';

/* Update IS-A parent field DataContextID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='24248F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='67987B2C-9876-4010-B3A4-245E64508104';

/* Update IS-A parent field Status on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='6C9C9D9F-52F0-4A9A-8317-218E8CC66CCC';

/* Update IS-A parent field EnvironmentID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='72975471-6AAB-45C6-B58A-3F1115C921C3',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='E090AA13-ADD1-4FED-8448-EC6E34AC669B';

/* Update IS-A parent field ProjectID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='98C84A78-D928-44E4-B14D-1BD0345E0E63';

/* Update IS-A parent field IsPinned on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='DAA1E97B-C326-458A-8770-5F1B608928FB';

/* Update IS-A parent field TestRunID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='5DFD821D-E23E-43D3-8A41-60A7D36AE1BA',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='A439B0C4-2CD7-42B8-BD24-3015A4BC97A5';

/* Update IS-A parent field ApplicationScope on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='151D685D-AC88-4FDF-8A4C-E4B951379D1B';

/* Update IS-A parent field ApplicationID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E8238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='44398D16-4B9E-4684-9E9A-0D2D9635345C';

/* Update IS-A parent field DefaultAgentID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='CDB135CC-6D3C-480B-90AE-25B7805F82C1',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='824CE7E1-0419-4D81-8303-6FC12E88EB94';

/* Update IS-A parent field AdditionalData on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='AF9B7334-C31B-4BCA-94DB-C581E2D8565C';

/* Update IS-A parent field RecordingFileID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='29248F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='4708AE2E-8041-4EBD-9418-3948A5EB98A8';

/* Update IS-A parent field EgressID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='9A4D6E44-7DEE-4AE6-B385-3DA9325BD45A';

/* Update IS-A parent field VisitorKey on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='78C6C069-4108-464E-828C-29140BFBC289';

/* Update IS-A parent field LastConversationID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='13248F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='6D323611-7957-404F-B384-8B8185C9B6CB';

/* Update IS-A parent field AnchorType on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=60,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='D8F3ABAD-A90F-4071-B02A-791E0B5F57C7';

/* Update IS-A parent field AnchorKey on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='641E0699-4437-4B76-B5C3-AAA75CA1894F';

/* Update IS-A parent field AnchorMetadata on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='5AEA0E64-FFF7-460E-89D3-A2DC211402BE';

/* Update IS-A parent field IsResolved on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='9667CF57-F598-4F76-815A-695927A2F12B';

/* Update IS-A parent field ResolvedByUserID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E1238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='24DAF18B-16A9-44F5-9445-696D4C6DA46F';

/* Update IS-A parent field ResolvedAt on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='datetimeoffset',
                      [Length]=10,
                      [Precision]=34,
                      [Scale]=7,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='4635DC3E-99AA-4725-9A9F-C30B3A08E076';

/* Update IS-A parent field TypeID on MJ: Comments */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='C2483D63-B4B3-4297-9282-4F5EC7D085AF',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='BA38AAED-97A9-4CDE-8872-1AE1E9FB43A6';

/* Update entity timestamp for MJ: Comments after IS-A field sync */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B46E1990-487D-45D6-B91E-A77D58ED0229';

/* Update IS-A parent field CommentTypeID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='B94D8162-7FBC-441F-9843-60EF3A2E57E1';

/* Update IS-A parent field UserID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E1238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='31671EF7-03C1-4B33-ACA2-4363743B702B';

/* Update IS-A parent field ExternalID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=1000,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='0EB5AA9E-3F62-476A-9492-8333099ADA59';

/* Update IS-A parent field Name on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='03BC315A-9AE2-4996-A1D8-F2B7862358C2';

/* Update IS-A parent field Description on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='60973300-2CA8-41C7-A453-FED4E6BC54A2';

/* Update IS-A parent field IsArchived on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='332DFB73-ABD0-46DA-B135-BCA7D378EE12';

/* Update IS-A parent field LinkedEntityID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E0238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='42CBB605-C57C-48FD-B783-780D5EBC9B20';

/* Update IS-A parent field LinkedRecordID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=1000,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='94C36755-EFFE-4E9B-8F30-84AFE0C6442D';

/* Update IS-A parent field DataContextID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='24248F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='0C6FC01C-1B24-4170-B88E-0A03734B8174';

/* Update IS-A parent field Status on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='2B977E33-7325-4684-9ACF-881A06A4BBA8';

/* Update IS-A parent field EnvironmentID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='72975471-6AAB-45C6-B58A-3F1115C921C3',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='AEB5E04D-0AB4-4388-B198-A936643BF14B';

/* Update IS-A parent field ProjectID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='951F2723-A5D0-4F52-B772-59AB83C9C366';

/* Update IS-A parent field IsPinned on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='4B9AEB23-664C-402A-9A7A-DAB0F98349DF';

/* Update IS-A parent field TestRunID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='5DFD821D-E23E-43D3-8A41-60A7D36AE1BA',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='43F9CD15-4FE2-4BAC-A924-8E81016B221B';

/* Update IS-A parent field ApplicationScope on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='9E72FB58-563A-494E-BBA0-C27336CBD319';

/* Update IS-A parent field ApplicationID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E8238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='26D2F374-84D6-42EB-8F34-BEBEAA8BDC98';

/* Update IS-A parent field DefaultAgentID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='CDB135CC-6D3C-480B-90AE-25B7805F82C1',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='FD447656-3260-48DD-8FCB-096EF3073689';

/* Update IS-A parent field AdditionalData on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='E3DDC5FD-0238-43D7-B19B-3B03094E947A';

/* Update IS-A parent field RecordingFileID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='29248F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='118D4FFA-E163-4443-9B61-B5FF1CFFC261';

/* Update IS-A parent field EgressID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='97299232-EEB8-4B86-BB3F-8E172789B8E5';

/* Update IS-A parent field VisitorKey on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='16C2B77D-7E8C-41F0-8734-B281A232525D';

/* Update IS-A parent field LastConversationID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='13248F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='822E5493-BCD0-4764-A353-E364F6566E0C';

/* Update IS-A parent field AnchorType on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=60,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='4F9B3CF7-F11E-445E-B1C7-11F68BF49008';

/* Update IS-A parent field AnchorKey on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=510,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='15F26C79-054A-4521-AC55-B7181A2AA112';

/* Update IS-A parent field AnchorMetadata on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='F400D164-608A-4941-A5A9-8D6509740D36';

/* Update IS-A parent field IsResolved on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='8BC2540B-E755-4A52-81BF-24CB825BE882';

/* Update IS-A parent field ResolvedByUserID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='E1238F34-2837-EF11-86D4-6045BDEE16E6',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='69A4804F-38CD-4E7E-A864-7E388D8FCED6';

/* Update IS-A parent field ResolvedAt on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='datetimeoffset',
                      [Length]=10,
                      [Precision]=34,
                      [Scale]=7,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]=NULL,
                      [RelatedEntityFieldName]=NULL,
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='E5EAEEC3-B57D-449F-B495-67610111DC5D';

/* Update IS-A parent field TypeID on MJ: Field Suggestions */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1,
                      [IncludeRelatedEntityNameFieldInBaseView]=0,
                      [RelatedEntityID]='C2483D63-B4B3-4297-9282-4F5EC7D085AF',
                      [RelatedEntityFieldName]='ID',
                      [RelatedEntityDisplayType]='Search'
                  WHERE [ID]='4E9FEC3B-50D9-4A18-9107-8E15257FF4A6';

/* Update entity timestamp for MJ: Field Suggestions after IS-A field sync */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='02E26617-130C-4A5A-B4D2-76F06F01C6A1';

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1D9C8D64-40F7-42F0-AE34-1F4A88080C12'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Conversations.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Core',
   GeneratedFormSection = 'Category',
   DisplayName = 'Type'
WHERE 
   ID = '34120559-280E-43A9-9BD5-63959C192B31';

-- UPDATE Entity Field Category Info MJ: Conversations.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Core',
   GeneratedFormSection = 'Category',
   DisplayName = 'Type Name'
WHERE 
   ID = 'D9F8ACBB-E916-4FE3-ABEC-B124BE42FF8D';

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Conversation Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Classification Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B5BAD141-28BE-404E-8FD3-71EE08DDCF0B';

-- UPDATE Entity Field Category Info MJ: Conversation Types.Code 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Classification Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8DE1BF29-728C-41F5-8589-8C692AD733C2';

-- UPDATE Entity Field Category Info MJ: Conversation Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Classification Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '86DFD3DA-6BD3-4454-B30D-FDA97842D441';

-- UPDATE Entity Field Category Info MJ: Conversation Types.ExtensionEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Extensions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E4350EF1-6633-4612-A4EA-BDF834A02EBB';

-- UPDATE Entity Field Category Info MJ: Conversation Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Extensions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '26E94E90-1EFF-4C64-8443-8F64D7D45917';

-- UPDATE Entity Field Category Info MJ: Conversation Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '951F8F04-2A6E-4DC4-BDAE-CBFFBA5A650B';

-- UPDATE Entity Field Category Info MJ: Conversation Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4BF0D12E-4CA9-4C49-BE24-6ADBDC46F1EE';

/* Set entity icon to fa fa-comments */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-comments', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dfaed207-a8d3-54cd-b545-7e8509471733', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', 'FieldCategoryInfo', '{
  "Behavior and Extensions": {
    "description": "Configuration for extension entities and custom server behavior drivers",
    "icon": "fa fa-cogs"
  },
  "Classification Details": {
    "description": "Core display name, programmatic code, and description of the conversation type",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9b7948f7-96b8-518e-a72b-455b44c90aac', 'C2483D63-B4B3-4297-9282-4F5EC7D085AF', 'FieldCategoryIcons', '{
  "Behavior and Extensions": "fa fa-cogs",
  "Classification Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C2483D63-B4B3-4297-9282-4F5EC7D085AF';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Comment Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9728C10E-C788-43A4-9E67-FABB88E46BE1';

-- UPDATE Entity Field Category Info MJ: Comment Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comment Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '097F7F7C-44D2-4D4D-B95B-3177B8B57243';

-- UPDATE Entity Field Category Info MJ: Comment Types.Code 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comment Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '77C74296-5649-4E5C-A23F-6888B08A9075';

-- UPDATE Entity Field Category Info MJ: Comment Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comment Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CDE9861F-2798-4E94-9D44-7CD0865E771B';

-- UPDATE Entity Field Category Info MJ: Comment Types.ExtensionEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Drivers',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '281FD4CE-8B3E-467D-A4F1-0903AF5D4A1C';

-- UPDATE Entity Field Category Info MJ: Comment Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Drivers',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1D9C8D64-40F7-42F0-AE34-1F4A88080C12';

-- UPDATE Entity Field Category Info MJ: Comment Types.UIDriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Drivers',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '74540DF4-3226-48AA-86A9-6CB1C0CDA60A';

-- UPDATE Entity Field Category Info MJ: Comment Types.AllowedAnchorTypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Drivers',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '96099148-77D6-4982-9175-4775BF8779B7';

-- UPDATE Entity Field Category Info MJ: Comment Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6F7EC804-B1FC-4876-B96E-8213D22DDE6A';

-- UPDATE Entity Field Category Info MJ: Comment Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '73445091-843F-4E0A-B3C1-5593A6022F9E';

/* Set entity icon to fa fa-comments */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-comments', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('53efa2d0-4929-560b-9927-718668c183e4', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'FieldCategoryInfo', '{
  "Comment Type Details": {
    "description": "Core identifying information for the comment type",
    "icon": "fa fa-comment"
  },
  "Configuration and Drivers": {
    "description": "Technical configuration, driver classes, and extension definitions",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a1d3b3e8-b56c-56bf-9253-3dd6c32db9be', '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE', 'FieldCategoryIcons', '{
  "Comment Type Details": "fa fa-comment",
  "Configuration and Drivers": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '2D604C9D-A6DD-4D61-AE2A-058F4E3D7CFE';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6C9C9D9F-52F0-4A9A-8317-218E8CC66CCC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DAA1E97B-C326-458A-8770-5F1B608928FB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9667CF57-F598-4F76-815A-695927A2F12B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'AEE74709-406F-43F0-A502-F6D6880AD595'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'B46E1990-487D-45D6-B91E-A77D58ED0229'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 38 fields */

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9CBCCD6A-EBA9-437F-8413-B14D97E2470C';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.SuggestedValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D6C58E49-E196-4148-B4A6-BE58026CD249';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6D1F394-8DF2-4360-B3BC-F7AA11DF3801';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '40A7DF8E-E415-4B54-A45D-7E1C8C5B9476';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.Outcome 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '191079EE-EF74-4BBA-B055-2E03E5EC3D44';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.AIPromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Prompt Run'
WHERE 
   ID = 'BC23540C-E14D-4FA7-9D22-34B050CF5403';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.AIPromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Prompt Run Details'
WHERE 
   ID = '84FE8A6F-4588-4B2C-9318-32B09D80FB6B';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.CommentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Comment Type'
WHERE 
   ID = 'B94D8162-7FBC-441F-9843-60EF3A2E57E1';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '31671EF7-03C1-4B33-ACA2-4363743B702B';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ExternalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0EB5AA9E-3F62-476A-9492-8333099ADA59';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '03BC315A-9AE2-4996-A1D8-F2B7862358C2';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '60973300-2CA8-41C7-A453-FED4E6BC54A2';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.IsArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '332DFB73-ABD0-46DA-B135-BCA7D378EE12';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.LinkedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Entity'
WHERE 
   ID = '42CBB605-C57C-48FD-B783-780D5EBC9B20';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.LinkedRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Record'
WHERE 
   ID = '94C36755-EFFE-4E9B-8F30-84AFE0C6442D';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.DataContextID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Context'
WHERE 
   ID = '0C6FC01C-1B24-4170-B88E-0A03734B8174';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2B977E33-7325-4684-9ACF-881A06A4BBA8';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.EnvironmentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment'
WHERE 
   ID = 'AEB5E04D-0AB4-4388-B198-A936643BF14B';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ProjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Project'
WHERE 
   ID = '951F2723-A5D0-4F52-B772-59AB83C9C366';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.IsPinned 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4B9AEB23-664C-402A-9A7A-DAB0F98349DF';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Test Run'
WHERE 
   ID = '43F9CD15-4FE2-4BAC-A924-8E81016B221B';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ApplicationScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9E72FB58-563A-494E-BBA0-C27336CBD319';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ApplicationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Application'
WHERE 
   ID = '26D2F374-84D6-42EB-8F34-BEBEAA8BDC98';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.DefaultAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Agent'
WHERE 
   ID = 'FD447656-3260-48DD-8FCB-096EF3073689';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.AdditionalData 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E3DDC5FD-0238-43D7-B19B-3B03094E947A';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.RecordingFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Recording File'
WHERE 
   ID = '118D4FFA-E163-4443-9B61-B5FF1CFFC261';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.EgressID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '97299232-EEB8-4B86-BB3F-8E172789B8E5';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.VisitorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '16C2B77D-7E8C-41F0-8734-B281A232525D';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.LastConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Conversation'
WHERE 
   ID = '822E5493-BCD0-4764-A353-E364F6566E0C';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.AnchorType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4F9B3CF7-F11E-445E-B1C7-11F68BF49008';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.AnchorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '15F26C79-054A-4521-AC55-B7181A2AA112';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.AnchorMetadata 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F400D164-608A-4941-A5A9-8D6509740D36';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.IsResolved 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8BC2540B-E755-4A52-81BF-24CB825BE882';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ResolvedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved By User'
WHERE 
   ID = '69A4804F-38CD-4E7E-A864-7E388D8FCED6';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.ResolvedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E5EAEEC3-B57D-449F-B495-67610111DC5D';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Type'
WHERE 
   ID = '4E9FEC3B-50D9-4A18-9107-8E15257FF4A6';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '58A4BC6F-66F2-40F3-A9F8-1B2EBD0C1697';

-- UPDATE Entity Field Category Info MJ: Field Suggestions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '040E559D-C0DD-421A-B132-2893CD036635';

/* Set entity icon to fa fa-comment-dots */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-comment-dots', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2d83715e-173d-5b6b-ae27-88996f36d0d1', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'FieldCategoryInfo', '{
  "Comment Details": {
    "description": "Fields inherited from the MJ: Comments entity",
    "icon": "fa fa-comment",
    "inheritedFromEntityID": "B46E1990-487D-45D6-B91E-A77D58ED0229",
    "inheritedFromEntityName": "MJ: Comments"
  },
  "Conversation Details": {
    "description": "Fields inherited from the MJ: Conversations entity",
    "icon": "fa fa-comments",
    "inheritedFromEntityID": "13248F34-2837-EF11-86D4-6045BDEE16E6",
    "inheritedFromEntityName": "MJ: Conversations"
  },
  "Suggestion Details": {
    "description": "Specific details, confidence scores, and provenance for the field suggestion",
    "icon": "fa fa-lightbulb"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1c1a2cd7-35be-527f-a1f8-c30dfcdf9892', '02E26617-130C-4A5A-B4D2-76F06F01C6A1', 'FieldCategoryIcons', '{
  "Comment Details": "fa fa-comment",
  "Conversation Details": "fa fa-comments",
  "Suggestion Details": "fa fa-lightbulb",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '02E26617-130C-4A5A-B4D2-76F06F01C6A1';

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: Comments.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ECF2CA0F-0B79-4FFB-9A40-626AD3D2DE77';

-- UPDATE Entity Field Category Info MJ: Comments.CommentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Comment Type'
WHERE 
   ID = '59A76206-93D7-4244-A0A9-A400F7F2DA98';

-- UPDATE Entity Field Category Info MJ: Comments.CommentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Comment Type Name'
WHERE 
   ID = '764B7AE0-E92E-4765-989E-BA847C93574D';

-- UPDATE Entity Field Category Info MJ: Comments.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9A365C90-4881-4471-922D-78FAB82F78CA';

-- UPDATE Entity Field Category Info MJ: Comments.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5002620F-DB50-4762-99F0-E1D4FB05C39D';

-- UPDATE Entity Field Category Info MJ: Comments.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User'
WHERE 
   ID = '26F885AA-94B1-476F-9D06-5DF65D1D60B8';

-- UPDATE Entity Field Category Info MJ: Comments.ExternalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6A9E05F4-C086-4C5A-9BDD-79E54E155FD9';

-- UPDATE Entity Field Category Info MJ: Comments.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AEE74709-406F-43F0-A502-F6D6880AD595';

-- UPDATE Entity Field Category Info MJ: Comments.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DB495B1C-07C5-423C-95F8-945C83EA2890';

-- UPDATE Entity Field Category Info MJ: Comments.IsArchived 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '86535EFB-1BC6-452A-9EFF-F3209C3E53B5';

-- UPDATE Entity Field Category Info MJ: Comments.LinkedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Entity'
WHERE 
   ID = 'EB94FD0C-1DB9-47DD-A342-525C1770288E';

-- UPDATE Entity Field Category Info MJ: Comments.LinkedRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Linked Record'
WHERE 
   ID = '44FFDFD8-E8C8-476D-A39B-0FBF2BA843F4';

-- UPDATE Entity Field Category Info MJ: Comments.DataContextID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Context'
WHERE 
   ID = '67987B2C-9876-4010-B3A4-245E64508104';

-- UPDATE Entity Field Category Info MJ: Comments.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6C9C9D9F-52F0-4A9A-8317-218E8CC66CCC';

-- UPDATE Entity Field Category Info MJ: Comments.EnvironmentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Environment'
WHERE 
   ID = 'E090AA13-ADD1-4FED-8448-EC6E34AC669B';

-- UPDATE Entity Field Category Info MJ: Comments.ProjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Project'
WHERE 
   ID = '98C84A78-D928-44E4-B14D-1BD0345E0E63';

-- UPDATE Entity Field Category Info MJ: Comments.IsPinned 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DAA1E97B-C326-458A-8770-5F1B608928FB';

-- UPDATE Entity Field Category Info MJ: Comments.TestRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Test Run'
WHERE 
   ID = 'A439B0C4-2CD7-42B8-BD24-3015A4BC97A5';

-- UPDATE Entity Field Category Info MJ: Comments.ApplicationScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '151D685D-AC88-4FDF-8A4C-E4B951379D1B';

-- UPDATE Entity Field Category Info MJ: Comments.ApplicationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Application'
WHERE 
   ID = '44398D16-4B9E-4684-9E9A-0D2D9635345C';

-- UPDATE Entity Field Category Info MJ: Comments.DefaultAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Agent'
WHERE 
   ID = '824CE7E1-0419-4D81-8303-6FC12E88EB94';

-- UPDATE Entity Field Category Info MJ: Comments.AdditionalData 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'AF9B7334-C31B-4BCA-94DB-C581E2D8565C';

-- UPDATE Entity Field Category Info MJ: Comments.RecordingFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Recording File'
WHERE 
   ID = '4708AE2E-8041-4EBD-9418-3948A5EB98A8';

-- UPDATE Entity Field Category Info MJ: Comments.EgressID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9A4D6E44-7DEE-4AE6-B385-3DA9325BD45A';

-- UPDATE Entity Field Category Info MJ: Comments.VisitorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '78C6C069-4108-464E-828C-29140BFBC289';

-- UPDATE Entity Field Category Info MJ: Comments.LastConversationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Conversation'
WHERE 
   ID = '6D323611-7957-404F-B384-8B8185C9B6CB';

-- UPDATE Entity Field Category Info MJ: Comments.AnchorType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D8F3ABAD-A90F-4071-B02A-791E0B5F57C7';

-- UPDATE Entity Field Category Info MJ: Comments.AnchorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '641E0699-4437-4B76-B5C3-AAA75CA1894F';

-- UPDATE Entity Field Category Info MJ: Comments.AnchorMetadata 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5AEA0E64-FFF7-460E-89D3-A2DC211402BE';

-- UPDATE Entity Field Category Info MJ: Comments.IsResolved 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9667CF57-F598-4F76-815A-695927A2F12B';

-- UPDATE Entity Field Category Info MJ: Comments.ResolvedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved By User'
WHERE 
   ID = '24DAF18B-16A9-44F5-9445-696D4C6DA46F';

-- UPDATE Entity Field Category Info MJ: Comments.ResolvedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4635DC3E-99AA-4725-9A9F-C30B3A08E076';

-- UPDATE Entity Field Category Info MJ: Comments.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Conversation Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Type'
WHERE 
   ID = 'BA38AAED-97A9-4CDE-8872-1AE1E9FB43A6';

/* Set entity icon to fa fa-comments */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-comments', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('714c0b0d-0af5-53c9-b2be-4017aae28cb4', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'FieldCategoryInfo', '{
  "Comment Details": {
    "description": "Specific classification and properties of the comment record",
    "icon": "fa fa-comment"
  },
  "Conversation Details": {
    "description": "Fields inherited from the MJ: Conversations parent entity",
    "icon": "fa fa-comments",
    "inheritedFromEntityID": "13248F34-2837-EF11-86D4-6045BDEE16E6",
    "inheritedFromEntityName": "MJ: Conversations"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e2ffe388-8cfc-5f17-93f6-dbcda3f68d59', 'B46E1990-487D-45D6-B91E-A77D58ED0229', 'FieldCategoryIcons', '{
  "Comment Details": "fa fa-comment",
  "Conversation Details": "fa fa-comments",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'B46E1990-487D-45D6-B91E-A77D58ED0229';

