-- =============================================================================
-- v5.43.x — Intelligent Duplicate Detection: LLM reasoning layer (Phase 1)
--
-- Adds the schema needed to layer LLM/agentic reasoning on top of the existing
-- embedding/vector duplicate-detection pipeline. Two tables are extended; all
-- additions are additive and back-compat safe:
--
--   1. DuplicateRunDetailMatch — per-match reasoning output + audit trail.
--      Vectors still originate candidates (MatchSource unchanged); these columns
--      record what the LLM concluded about each candidate match.
--   2. EntityDocument — per-entity reasoning configuration. EnableLLMReasoning
--      defaults OFF, so every existing Entity Document keeps the current
--      vector-only behavior untouched. AutomationLevel is only consulted by the
--      engine when EnableLLMReasoning = 1.
--
-- Reasoning runs behind a pluggable DuplicateReasoningProvider seam with two
-- shipped implementations selected per-entity via ReasoningMode:
--   'Prompt' (default) -> solo AIPromptRunner.ExecutePrompt  -> AIPromptRunID
--   'Agent'            -> AgentRunner.RunAgent (memory+tools) -> AIAgentRunID
-- Both share one core instruction set. See plans/intelligent-duplicate-detection.md.
--
-- NOTE: views / sprocs / EntityField metadata / FK indexes are intentionally
-- NOT included here — CodeGen generates all of that from this schema + the
-- extended properties below. The seeded "Duplicate Resolution" prompt + agent
-- are delivered via metadata files (mj-sync), not SQL INSERTs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DuplicateRunDetailMatch — reasoning output + audit
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.DuplicateRunDetailMatch ADD
    AIAgentRunID UNIQUEIDENTIFIER NULL,
    AIPromptRunID UNIQUEIDENTIFIER NULL,
    LLMRecommendation NVARCHAR(20) NULL,
    LLMConfidence NUMERIC(12, 11) NULL,
    LLMReasoning NVARCHAR(MAX) NULL,
    LLMProposedSurvivorRecordID NVARCHAR(500) NULL,
    LLMProposedFieldMap NVARCHAR(MAX) NULL,
    CONSTRAINT CK_DuplicateRunDetailMatch_LLMRecommendation
        CHECK (LLMRecommendation IN ('Merge', 'NotDuplicate', 'Uncertain')),
    CONSTRAINT FK_DuplicateRunDetailMatch_AIAgentRun
        FOREIGN KEY (AIAgentRunID) REFERENCES ${flyway:defaultSchema}.AIAgentRun (ID),
    CONSTRAINT FK_DuplicateRunDetailMatch_AIPromptRun
        FOREIGN KEY (AIPromptRunID) REFERENCES ${flyway:defaultSchema}.AIPromptRun (ID);
GO

-- ---------------------------------------------------------------------------
-- 2. EntityDocument — per-entity reasoning configuration
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.EntityDocument ADD
    EnableLLMReasoning BIT NOT NULL
        CONSTRAINT DF_EntityDocument_EnableLLMReasoning DEFAULT (0),
    ReasoningMode NVARCHAR(20) NOT NULL
        CONSTRAINT DF_EntityDocument_ReasoningMode DEFAULT ('Prompt'),
    ReasoningThreshold NUMERIC(12, 11) NULL,
    ReasoningPromptID UNIQUEIDENTIFIER NULL,
    ReasoningAgentID UNIQUEIDENTIFIER NULL,
    AutomationLevel NVARCHAR(30) NOT NULL
        CONSTRAINT DF_EntityDocument_AutomationLevel DEFAULT ('ReviewAll'),
    CONSTRAINT CK_EntityDocument_ReasoningMode
        CHECK (ReasoningMode IN ('Prompt', 'Agent')),
    CONSTRAINT CK_EntityDocument_AutomationLevel
        CHECK (AutomationLevel IN ('ReviewAll', 'LLMGated', 'AutoMergeAboveAbsolute')),
    CONSTRAINT FK_EntityDocument_ReasoningPrompt
        FOREIGN KEY (ReasoningPromptID) REFERENCES ${flyway:defaultSchema}.AIPrompt (ID),
    CONSTRAINT FK_EntityDocument_ReasoningAgent
        FOREIGN KEY (ReasoningAgentID) REFERENCES ${flyway:defaultSchema}.AIAgent (ID);
GO

-- =============================================================================
-- Extended properties (descriptions CodeGen reads to build EntityField metadata)
-- =============================================================================

-- DuplicateRunDetailMatch ----------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the match was reasoned by an AI Agent (ReasoningMode = Agent), the AIAgentRun that produced the recommendation. Full audit trail; NULL when no agent ran (gated out, or Prompt mode, or reasoning disabled).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'AIAgentRunID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the match was reasoned by a single-shot AI Prompt (ReasoningMode = Prompt, the default), the AIPromptRun that produced the recommendation. Full audit trail; NULL when no prompt ran.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'AIPromptRunID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The LLM''s recommendation for this candidate match: Merge, NotDuplicate, or Uncertain. Annotates the vector-derived candidate; NULL when reasoning did not run for this match.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'LLMRecommendation';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Reasoning-adjusted confidence (0-1) that this is a true duplicate. Distinct from MatchProbability (the vector/RRF score); the LLM strengthens or weakens the vector signal rather than replacing it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'LLMConfidence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-readable rationale for the LLM''s recommendation. Surfaced in the review UI and powers the transparency / disagreement explanation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'LLMReasoning';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The record the LLM proposes as the surviving record for this matched set, as a URL-segment composite key. Preloads the comparison panel; the user can override.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'LLMProposedSurvivorRecordID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON of the LLM''s proposed per-field survivor choices for the matched set. Resolved to literal {FieldName, Value} entries (the existing MergeRecords FieldMap contract) and applied to the surviving record before the transactional merge; the user can override per field.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'DuplicateRunDetailMatch', @level2type = N'COLUMN', @level2name = N'LLMProposedFieldMap';

-- EntityDocument -------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Master switch for the LLM reasoning layer on this entity. When 0 (default), duplicate detection runs the existing vector-only path unchanged and the reasoning columns/AutomationLevel are ignored. When 1, candidates above ReasoningThreshold are reasoned over.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityDocument', @level2type = N'COLUMN', @level2name = N'EnableLLMReasoning';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Which reasoning provider runs for this entity. Prompt (default) = a single-shot AI Prompt (cheap/fast); Agent = an AI Agent with memory + context-exploration tools (for heavy entities needing deeper reasoning). Both consume one shared core instruction set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityDocument', @level2type = N'COLUMN', @level2name = N'ReasoningMode';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Vector-score gate (0-1): reasoning runs once per source record''s matched set only when the set''s top MatchProbability is at or above this value. Controls cost and reasoning-log volume at scale. NULL falls back to engine/Configuration defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityDocument', @level2type = N'COLUMN', @level2name = N'ReasoningThreshold';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The AI Prompt used when ReasoningMode = Prompt. Defaults (resolved in code/metadata) to the seeded "Duplicate Resolution" prompt. The prompt''s own model configuration is the per-entity model knob for the prompt path.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityDocument', @level2type = N'COLUMN', @level2name = N'ReasoningPromptID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The AI Agent used when ReasoningMode = Agent. Defaults (resolved in code/metadata) to the seeded "Duplicate Resolution Agent". Unlocks memory-note injection and context-exploration tools.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityDocument', @level2type = N'COLUMN', @level2name = N'ReasoningAgentID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Graduated human-in-the-loop level, consulted only when EnableLLMReasoning = 1. ReviewAll = every proposed merge goes to human review; LLMGated = only LLM "Merge" recommendations surface (NotDuplicate suppressed but logged); AutoMergeAboveAbsolute = at/above AbsoluteMatchThreshold AND LLM "Merge", auto-execute (still honoring the per-merge AllowRecordMerge guard).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityDocument', @level2type = N'COLUMN', @level2name = N'AutomationLevel';
