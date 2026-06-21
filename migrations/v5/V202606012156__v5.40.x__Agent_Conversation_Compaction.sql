-- =====================================================================================
-- Agent Conversation Compaction & Recursive Context Access
-- =====================================================================================
-- Adds the durable, cross-turn conversation compaction layer + sequence-addressable
-- history for RLM-style retrieval tooling. See plans/agent-conversation-compaction.md.
--
-- This migration:
--   1. ConversationDetail
--        - Sequence            : stable, monotonic-per-conversation ordinal (the symbolic
--                                handle for retrieval tools + summary markers). Backfilled
--                                from __mj_CreatedAt order, assigned on insert by a trigger.
--        - SummaryPromptRunID  : FK -> AIPromptRun; links a populated
--                                SummaryOfEarlierConversation to the prompt run that made it.
--   2. AIAgentType  : gains the context-compression config it was missing (promoted from
--                     AIAgent as TYPE-LEVEL DEFAULTS) + new token-budget knobs. Percent
--                     knobs are NOT NULL DEFAULT so the type always provides a floor.
--   3. AIAgent      : gains ONLY the new token-budget knobs (it already owns the
--                     compression trio). All nullable => NULL means "inherit from type".
--   4. AIAgentRunStep.StepType : widened to include 'Compaction' so the cross-turn summary
--                                prompt run is recorded as a step in the agent run lifecycle.
--
-- Resolution at runtime: Agent value ?? AgentType value ?? (for ContextWindowMaxTokens)
-- model MaxInputTokens. Effective budget is clamped to the model and a warning is logged.
--
-- NOTE: Views / EntityField metadata / stored procedures are handled by CodeGen. This file
--       contains DDL + extended properties only.
-- =====================================================================================

-- =====================================================================================
-- 1. ConversationDetail : new columns
-- =====================================================================================
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail] ADD
    [Sequence]           INT NULL,
    [SummaryPromptRunID] UNIQUEIDENTIFIER NULL;
GO

-- Backfill Sequence for all existing rows, ordered by creation time within each conversation.
;WITH numbered AS (
    SELECT [ID],
           ROW_NUMBER() OVER (PARTITION BY [ConversationID]
                              ORDER BY [__mj_CreatedAt] ASC, [ID] ASC) AS rn
    FROM [${flyway:defaultSchema}].[ConversationDetail]
)
UPDATE cd
    SET cd.[Sequence] = numbered.rn
FROM [${flyway:defaultSchema}].[ConversationDetail] cd
JOIN numbered ON numbered.[ID] = cd.[ID];
GO

-- Now that every row has a value, enforce NOT NULL and provide a DEFAULT (0) so inserts
-- satisfy the constraint before the AFTER-INSERT trigger overwrites it with the real value.
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
    ALTER COLUMN [Sequence] INT NOT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
    ADD CONSTRAINT [DF_ConversationDetail_Sequence] DEFAULT (0) FOR [Sequence];
GO

-- FK: SummaryPromptRunID -> AIPromptRun
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetail]
    ADD CONSTRAINT [FK_ConversationDetail_SummaryPromptRun]
        FOREIGN KEY ([SummaryPromptRunID])
        REFERENCES [${flyway:defaultSchema}].[AIPromptRun]([ID]);
GO

-- =====================================================================================
-- 1b. ConversationDetail : Sequence-assignment trigger
-- =====================================================================================
-- Assigns the next per-conversation Sequence on insert. Handles multi-row inserts and
-- guards the rare concurrent same-conversation insert with UPDLOCK/HOLDLOCK on the read
-- of the current max. Runs AFTER INSERT and overwrites the DEFAULT(0) value.
GO
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trgConversationDetail_AssignSequence]
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH batch AS (
        SELECT i.[ID], i.[ConversationID],
               ROW_NUMBER() OVER (PARTITION BY i.[ConversationID]
                                  ORDER BY i.[__mj_CreatedAt] ASC, i.[ID] ASC) AS rn
        FROM inserted i
    ),
    existing AS (
        SELECT cd.[ConversationID], MAX(cd.[Sequence]) AS MaxSeq
        FROM [${flyway:defaultSchema}].[ConversationDetail] cd WITH (UPDLOCK, HOLDLOCK)
        WHERE cd.[ConversationID] IN (SELECT DISTINCT [ConversationID] FROM inserted)
          AND cd.[ID] NOT IN (SELECT [ID] FROM inserted)
        GROUP BY cd.[ConversationID]
    )
    UPDATE cd
        SET cd.[Sequence] = ISNULL(e.MaxSeq, 0) + b.rn
    FROM [${flyway:defaultSchema}].[ConversationDetail] cd
    JOIN batch b      ON b.[ID] = cd.[ID]
    LEFT JOIN existing e ON e.[ConversationID] = b.[ConversationID];
END
GO

-- =====================================================================================
-- 2. AIAgentType : context-compression defaults (promoted from AIAgent) + token knobs
-- =====================================================================================
ALTER TABLE [${flyway:defaultSchema}].[AIAgentType] ADD
    [ContextCompressionMessageThreshold]      INT NULL,
    [ContextCompressionPromptID]              UNIQUEIDENTIFIER NULL,
    [ContextCompressionMessageRetentionCount] INT NULL,
    [ContextWindowMaxTokens]                  INT NULL,
    [CompactionTriggerPercent]                INT NOT NULL CONSTRAINT [DF_AIAgentType_CompactionTriggerPercent] DEFAULT (75),
    [CompactionTargetPercent]                 INT NOT NULL CONSTRAINT [DF_AIAgentType_CompactionTargetPercent]  DEFAULT (30),
    [ConversationSummaryPromptID]             UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentType]
    ADD CONSTRAINT [FK_AIAgentType_ContextCompressionPrompt]
        FOREIGN KEY ([ContextCompressionPromptID])
        REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentType]
    ADD CONSTRAINT [FK_AIAgentType_ConversationSummaryPrompt]
        FOREIGN KEY ([ConversationSummaryPromptID])
        REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
GO

-- =====================================================================================
-- 3. AIAgent : new token knobs only (trio already exists). All nullable => inherit.
-- =====================================================================================
ALTER TABLE [${flyway:defaultSchema}].[AIAgent] ADD
    [ContextWindowMaxTokens]      INT NULL,
    [CompactionTriggerPercent]    INT NULL,
    [CompactionTargetPercent]     INT NULL,
    [ConversationSummaryPromptID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgent]
    ADD CONSTRAINT [FK_AIAgent_ConversationSummaryPrompt]
        FOREIGN KEY ([ConversationSummaryPromptID])
        REFERENCES [${flyway:defaultSchema}].[AIPrompt]([ID]);
GO

-- =====================================================================================
-- 4. AIAgentRunStep.StepType : add 'Compaction'
-- =====================================================================================
-- Drop existing CHECK constraint (name varies by environment), then re-add widened.
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
  AND COL_NAME(parent_object_id, parent_column_id) = 'StepType';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep] DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Dropped existing StepType check constraint: ' + @ConstraintName;
END
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentRunStep]
    ADD CONSTRAINT CK_AIAgentRunStep_StepType
        CHECK ([StepType] IN ('Prompt', 'Actions', 'Sub-Agent', 'Chat', 'Decision', 'Validation', 'ForEach', 'While', 'Tool', 'Compaction'));
GO

-- =====================================================================================
-- 5. Extended properties (CodeGen reads these for descriptions)
-- =====================================================================================

-- ConversationDetail.Sequence
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monotonic, per-conversation ordinal assigned on insert (1-based). Provides a stable symbolic handle used by conversation-history retrieval tools and by the sequence markers embedded in compaction summaries. A summary stored in SummaryOfEarlierConversation on a given row covers all rows with a lower Sequence in the same conversation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'Sequence';

-- ConversationDetail.SummaryPromptRunID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When SummaryOfEarlierConversation is populated by a cross-turn compaction, this links to the AIPromptRun that produced it (model, tokens, cost, prompt version). Null for ordinary (non-summary) rows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetail',
    @level2type = N'COLUMN', @level2name = N'SummaryPromptRunID';

-- AIAgentType.ContextCompressionMessageThreshold
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default for the in-turn context-compression message-count threshold. Overridable per agent via AIAgent.ContextCompressionMessageThreshold.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'ContextCompressionMessageThreshold';

-- AIAgentType.ContextCompressionPromptID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default prompt used for in-turn context compression. Overridable per agent via AIAgent.ContextCompressionPromptID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'ContextCompressionPromptID';

-- AIAgentType.ContextCompressionMessageRetentionCount
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default for the number of most-recent messages kept uncompressed (the "hot tail") when context compression is applied. Overridable per agent via AIAgent.ContextCompressionMessageRetentionCount.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'ContextCompressionMessageRetentionCount';

-- AIAgentType.ContextWindowMaxTokens
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default effective working-context budget, in tokens. Null means use the selected model''s MaxInputTokens. The resolved value is clamped to the model''s limit at runtime (a warning is logged if it would exceed it). Overridable per agent via AIAgent.ContextWindowMaxTokens.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'ContextWindowMaxTokens';

-- AIAgentType.CompactionTriggerPercent
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default: the percentage of the effective context budget at which cross-turn conversation compaction is triggered. Defaults to 75. Overridable per agent via AIAgent.CompactionTriggerPercent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'CompactionTriggerPercent';

-- AIAgentType.CompactionTargetPercent
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default: the target percentage of the effective context budget to reduce to after a cross-turn compaction. Defaults to 30. Overridable per agent via AIAgent.CompactionTargetPercent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'CompactionTargetPercent';

-- AIAgentType.ConversationSummaryPromptID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-level default prompt used for cross-turn conversation compaction (the durable summary baseline). Distinct from ContextCompressionPromptID, which governs in-turn compression. Overridable per agent via AIAgent.ConversationSummaryPromptID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentType',
    @level2type = N'COLUMN', @level2name = N'ConversationSummaryPromptID';

-- AIAgent.ContextWindowMaxTokens
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-agent override for the effective working-context budget, in tokens. Null inherits the agent type''s value (which, if also null, falls back to the selected model''s MaxInputTokens). The resolved value is clamped to the model''s limit at runtime.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'ContextWindowMaxTokens';

-- AIAgent.CompactionTriggerPercent
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-agent override for the cross-turn compaction trigger percentage. Null inherits the agent type''s value.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'CompactionTriggerPercent';

-- AIAgent.CompactionTargetPercent
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-agent override for the cross-turn compaction target percentage. Null inherits the agent type''s value.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'CompactionTargetPercent';

-- AIAgent.ConversationSummaryPromptID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-agent override for the cross-turn conversation compaction prompt. Null inherits the agent type''s value.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'ConversationSummaryPromptID';
GO
