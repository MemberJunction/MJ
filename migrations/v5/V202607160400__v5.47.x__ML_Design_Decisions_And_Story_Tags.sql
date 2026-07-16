/**************************************************************************************************
 * Migration: Predictive Studio — Design-Decision Capture + Story Layer (Doc 5)
 *
 * The two substrates the Model Development Agent's reasoning loop writes to (see the Model
 * Component Framework plan, Document 5 §2 + §3):
 *
 *   1. MLDesignDecision (MJ: ML Design Decisions) — the EVAL substrate. Every triage / reuse /
 *      position-selection / hyperparameter / hybridization / synthesis / promotion-gate decision
 *      the agent makes is persisted as a typed row (LLM emits the typed slice; the orchestrator
 *      writes the row — writing is deterministic). StatisticsCited/AlternativesConsidered are JSON.
 *      Outcome is backfilled at session finalize ("did the choice win?"). This is what the
 *      agent-reasoning eval harness scores against planted-truth (Doc 5 §4).
 *
 *   2. MLStoryTag (MJ: ML Story Tags) — the STORY layer. When a session finalizes, the Story
 *      Tagger proposes a nominal, plain-language identity per built component/model ("Sees cooling
 *      -> dormant drift") alongside its technical identity. Tags vectorize into MJ vector infra so
 *      the Data Scout's reuse-before-rebuild search and the Studio UI query the SAME index. The
 *      tagger PROPOSES (Status='Proposed'); only the Librarian curates (Status='Curated').
 *
 * FK anchors use tables that already exist: AIAgentRun (the run that made the decision),
 * MLTrainingRun (the experiment iteration), MLModel + MLComponent (what a decision/tag concerns),
 * User (the curating Librarian). No experiment-session table is referenced (none exists yet).
 *
 * Schema/DDL only. CodeGen generates Entity/EntityField metadata, __mj timestamp columns, FK
 * indexes, views, and CRUD procs after this migration runs. Reference rows are NOT seeded here.
 *
 * Version: 5.47.x
 **************************************************************************************************/

-- ============================================================================
-- 1. MLDesignDecision  (MJ: ML Design Decisions)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLDesignDecision] (
    [ID]                     UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    [AgentRunID]             UNIQUEIDENTIFIER NULL,
    [TrainingRunID]          UNIQUEIDENTIFIER NULL,
    [DecisionType]           NVARCHAR(30)     NOT NULL,
    [Verdict]                NVARCHAR(50)     NOT NULL,
    [Justification]          NVARCHAR(MAX)    NULL,
    [StatisticsCited]        NVARCHAR(MAX)    NULL,
    [AlternativesConsidered] NVARCHAR(MAX)    NULL,
    [CitedParentComponentID] UNIQUEIDENTIFIER NULL,
    [ResultModelID]          UNIQUEIDENTIFIER NULL,
    [BranchGroup]            NVARCHAR(100)    NULL,
    [Sequence]               INT              NULL,
    [Outcome]                NVARCHAR(50)     NULL,
    CONSTRAINT [PK_MLDesignDecision] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLDesignDecision_DecisionType] CHECK ([DecisionType] IN ('Triage', 'LibraryReuse', 'PositionSelection', 'HyperparameterPrior', 'Hybridization', 'Synthesis', 'StoryTag', 'PromotionGate')),
    CONSTRAINT [FK_MLDesignDecision_AgentRun] FOREIGN KEY ([AgentRunID])
        REFERENCES ${flyway:defaultSchema}.[AIAgentRun]([ID]),
    CONSTRAINT [FK_MLDesignDecision_TrainingRun] FOREIGN KEY ([TrainingRunID])
        REFERENCES ${flyway:defaultSchema}.[MLTrainingRun]([ID]),
    CONSTRAINT [FK_MLDesignDecision_ParentComponent] FOREIGN KEY ([CitedParentComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLDesignDecision_ResultModel] FOREIGN KEY ([ResultModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The decision-capture + eval substrate (plan Doc 5 §2). Every reasoning fork the Model Development Agent takes — triage (commit/defer/combine/reuse), library reuse, preprocessing-position selection, hyperparameter-prior choice, hybridization (including rejected-illegal attempts), between-wave synthesis, and the promotion gate — is persisted here as a typed row. The LLM emits the typed slice; the orchestrator writes the row (deterministic). The agent-reasoning eval harness scores these rows against planted-truth: was the verdict correct, were the cited statistics real, was the budget respected, was the holdout scored once, was no unsigned promotion attempted.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The AI Agent Run this decision was captured during (nullable — a decision may be replayed or authored outside a live run)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'AgentRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The experiment iteration (ML Training Run) this decision produced or evaluated, when applicable', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'TrainingRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The kind of decision: Triage (commit/defer/combine/reuse), LibraryReuse, PositionSelection (a preprocessing bank choice), HyperparameterPrior, Hybridization (a composition attempt, including rejected-illegal ones), Synthesis (a between-wave recombine/stop), StoryTag, or PromotionGate (the trust/leakage sign-off)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'DecisionType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The verdict reached (e.g., "commit", "defer", "combine", "reuse", "promote", "hold", "reject") — the discrete outcome of this decision', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'Verdict';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The agent''s plain-language reasoning for the verdict (the "why" a human reviewer reads)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'Justification';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of the statistics cited to justify the verdict: [{ name, value, threshold, direction }]. The eval''s DesignDecisionOracle checks each cited stat actually supports the verdict (anti-post-hoc-rationalization).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'StatisticsCited';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of the alternatives the agent weighed and set aside (the road not taken, for audit + eval)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'AlternativesConsidered';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For a combine/hybridization decision: the shared "can-be" parent component (a Template) the chosen components legally fill — proves the composition is legal by construction, not just plausible', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'CitedParentComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The trained model this decision produced (when the decision materialized into a fitted MLModel)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'ResultModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For a defer that spawns parallel branches: the branch-group id the parallel experiments share, so the winner can be traced back at finalize', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'BranchGroup';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Monotonic ordering of this decision within its agent run (the sequence in which the reasoning unfolded)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Backfilled at session finalize: what actually happened to this choice (e.g., "won", "pruned", "superseded") — the ground truth the eval''s outcome oracle scores against', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLDesignDecision', @level2type=N'COLUMN', @level2name=N'Outcome';
GO

-- ============================================================================
-- 2. MLStoryTag  (MJ: ML Story Tags)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[MLStoryTag] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    [ComponentID]         UNIQUEIDENTIFIER NULL,
    [ModelID]             UNIQUEIDENTIFIER NULL,
    [NominalName]         NVARCHAR(200)    NOT NULL,
    [RoleInStory]         NVARCHAR(100)    NULL,
    [ContributesToStory]  NVARCHAR(MAX)    NULL,
    [Narrative]           NVARCHAR(MAX)    NULL,
    [Status]              NVARCHAR(20)     NOT NULL DEFAULT ('Proposed'),
    [CuratedByUserID]     UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_MLStoryTag] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_MLStoryTag_Status] CHECK ([Status] IN ('Proposed', 'Curated')),
    CONSTRAINT [FK_MLStoryTag_Component] FOREIGN KEY ([ComponentID])
        REFERENCES ${flyway:defaultSchema}.[MLComponent]([ID]),
    CONSTRAINT [FK_MLStoryTag_Model] FOREIGN KEY ([ModelID])
        REFERENCES ${flyway:defaultSchema}.[MLModel]([ID]),
    CONSTRAINT [FK_MLStoryTag_CuratedByUser] FOREIGN KEY ([CuratedByUserID])
        REFERENCES ${flyway:defaultSchema}.[User]([ID])
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The story layer (plan Doc 5 §3): a plain-language, meaning-grounded identity for a built component or trained model, so capabilities are known by what they FIND rather than what they are made of. Written by the Story Tagger when a session finalizes (Status=''Proposed''); only the Librarian role blesses a tag (Status=''Curated''). Tags vectorize into MJ vector infra so the Data Scout''s reuse-before-rebuild search and the Studio Story Library query the SAME index — agents and people share one search path. Exactly one of ComponentID / ModelID is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The component this story tag describes (a reusable/template/transformation component). Mutually exclusive with ModelID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'ComponentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The trained model this story tag describes (a frozen, published instance). Mutually exclusive with ComponentID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'ModelID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The nominal, plain-language name for what this capability FINDS (e.g., "Sees cooling engagement -> dormant drift") — shown large in the Story Library, above the small technical identity', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'NominalName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The role this component/model plays in the larger story (e.g., "risk ranker", "cadence-state extractor", "segment source")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'RoleInStory';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How this capability contributes to the business story / decision it informs (the "so what")', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'ContributesToStory';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The 1-2 sentence narrative. The eval''s story-faithfulness check asserts the narrative names the features the model actually relies on (its top FeatureImportance) — a narrative citing features the model does not use fails.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'Narrative';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle: Proposed (the tagger''s suggestion) or Curated (a Librarian has blessed it — curated names win search ranking)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The Librarian who curated (blessed) this tag, when Status=''Curated''', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MLStoryTag', @level2type=N'COLUMN', @level2name=N'CuratedByUserID';
GO
