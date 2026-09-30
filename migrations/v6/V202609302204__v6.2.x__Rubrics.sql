/*
    Rubrics — a first-class MemberJunction primitive for evaluating any record against weighted,
    nested, versioned criteria.

    Design + build plan: plans/rubrics/RUBRICS_PLAN.md (read it before changing anything here).

    WHAT THIS MIGRATION ADDS (all in the core schema)

      Definition side
        RubricCategory        folders for rubrics (self-referencing tree)
        RubricScale           reusable response scales: ordered levels (1-5 Likert, Pass/Fail,
                              Compliant/Partial/Non-compliant) or a numeric range
        RubricScaleLevel      the levels of a 'Levels' scale, each with a normalized 0..1 value
        Rubric                the stable identity of a rubric
        RubricVersion         an immutable-once-published, semantically versioned snapshot
                              (Major.Minor.Patch computed by the server at publish time)
        RubricCriterion       a weighted TREE of groups and criteria, owned by one version
        RubricCriterionLevel  per-criterion anchor text for a scale level (or a numeric anchor)
        RubricBand            display/reporting interpretation of the normalized score
                              (e.g. Exemplary / Proficient). Bands NEVER decide pass/fail.

      Result side
        RubricEvaluation      one evaluator's judgment of one record against one pinned version.
                              Computed results are written ONCE at submit and never recomputed.
        RubricEvaluationScore one row per criterion (and per group, as computed rollup rows)

      Consumers
        AIAgentRubric         rubrics an agent publishes: for evaluation, self-check, or sampling
                              of production runs
        Test.RubricID         the rubric a test is judged by (NULL = inherit from its suite)
        TestSuite.RubricID    default rubric for tests in the suite (walks up ParentID)
        TestSuiteRun.Score    the suite-level score the engine already computes and discarded

    SCORE SCALE. Every stored score, threshold and band boundary is NORMALIZED to 0..1. The
    version's ScoreDisplayMin/Max exist only so a UI can render 0..1 as 0..100, 1..5, etc.
    A single canonical scale is deliberate: consumers that let each rubric's raw units leak into
    thresholds end up with a UI and a router that disagree about what a number means.

    IMMUTABILITY. A published version (and everything it owns) and a submitted evaluation (and
    its score rows) are frozen. The primary guard is the server-side entity subclasses, which
    return clear validation errors; the triggers at the bottom of the hand-written section are the
    BACKSTOP against raw SQL and any path that bypasses BaseEntity. Corrections are never edits:
    a changed rubric is a new version, and a changed judgment is a new evaluation that supersedes
    the old one.

    LAYERED BASE VIEWS. RubricEvaluation and RubricEvaluationScore expose cheap, on-demand
    consensus (cohort mean / spread / human-vs-AI) through application-owned wrapper views over
    CodeGen's generated views. That takes two FURTHER migrations, forced by ordering:
      V202609302205  sets the layering flags on the Entity rows THIS migration's CodeGen capture
                     creates, and carries the capture that generates the inner vw*Generated views
      V202609302206  creates the wrapper views, then the capture that registers their columns
    See the plan, section "Layered base views: the migration sequence".

    TestRubric is DEPRECATED alongside this migration, through metadata rather than DDL:
    metadata/entities/.test-rubrics-deprecation.json sets the entity's Status to Deprecated and
    replaces its description. It has never been read by the test engine, links to nothing, and
    has no seed rows; the table is dropped at the next major version.
*/

-- ════════════════════════════════════════════════════════════════════════════════════
-- 1. Definition side
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE [${flyway:defaultSchema}].[RubricCategory] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricCategory_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(255)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [ParentID]    UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_RubricCategory] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricCategory_Parent] FOREIGN KEY ([ParentID])
        REFERENCES [${flyway:defaultSchema}].[RubricCategory]([ID])
);
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricScale] (
    [ID]             UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricScale_ID] DEFAULT (newsequentialid()),
    [Name]           NVARCHAR(255)    NOT NULL,
    [Description]    NVARCHAR(MAX)    NULL,
    [ScaleType]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RubricScale_ScaleType] DEFAULT ('Levels'),
    [MinValue]       DECIMAL(18,6)    NULL,
    [MaxValue]       DECIMAL(18,6)    NULL,
    [Step]           DECIMAL(18,6)    NULL,
    [HigherIsBetter] BIT              NOT NULL CONSTRAINT [DF_RubricScale_HigherIsBetter] DEFAULT (1),
    [Status]         NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RubricScale_Status] DEFAULT ('Active'),
    CONSTRAINT [PK_RubricScale] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_RubricScale_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_RubricScale_ScaleType] CHECK ([ScaleType] IN ('Levels', 'Numeric')),
    CONSTRAINT [CK_RubricScale_Status] CHECK ([Status] IN ('Active', 'Disabled')),
    CONSTRAINT [CK_RubricScale_NumericRange] CHECK ([ScaleType] = 'Levels' OR ([MinValue] IS NOT NULL AND [MaxValue] IS NOT NULL AND [MaxValue] > [MinValue])),
    CONSTRAINT [CK_RubricScale_Step] CHECK ([Step] IS NULL OR [Step] > 0)
);
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricScaleLevel] (
    [ID]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricScaleLevel_ID] DEFAULT (newsequentialid()),
    [ScaleID]         UNIQUEIDENTIFIER NOT NULL,
    [Label]           NVARCHAR(100)    NOT NULL,
    [Value]           DECIMAL(18,6)    NOT NULL,
    [NormalizedValue] DECIMAL(9,6)     NOT NULL,
    [Description]     NVARCHAR(MAX)    NULL,
    [Sequence]        INT              NOT NULL CONSTRAINT [DF_RubricScaleLevel_Sequence] DEFAULT (0),
    CONSTRAINT [PK_RubricScaleLevel] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricScaleLevel_Scale] FOREIGN KEY ([ScaleID])
        REFERENCES [${flyway:defaultSchema}].[RubricScale]([ID]),
    CONSTRAINT [UQ_RubricScaleLevel_Label] UNIQUE ([ScaleID], [Label]),
    CONSTRAINT [UQ_RubricScaleLevel_Sequence] UNIQUE ([ScaleID], [Sequence]),
    CONSTRAINT [CK_RubricScaleLevel_NormalizedValue] CHECK ([NormalizedValue] >= 0 AND [NormalizedValue] <= 1)
);
GO

CREATE TABLE [${flyway:defaultSchema}].[Rubric] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Rubric_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(255)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [CategoryID]  UNIQUEIDENTIFIER NULL,
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_Rubric_Status] DEFAULT ('Active'),
    CONSTRAINT [PK_Rubric] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Rubric_Name] UNIQUE ([Name]),
    CONSTRAINT [FK_Rubric_Category] FOREIGN KEY ([CategoryID])
        REFERENCES [${flyway:defaultSchema}].[RubricCategory]([ID]),
    CONSTRAINT [CK_Rubric_Status] CHECK ([Status] IN ('Active', 'Disabled'))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricVersion] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricVersion_ID] DEFAULT (newsequentialid()),
    [RubricID]            UNIQUEIDENTIFIER NOT NULL,
    [MajorVersion]        INT              NULL,
    [MinorVersion]        INT              NULL,
    [PatchVersion]        INT              NULL,
    [Status]              NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RubricVersion_Status] DEFAULT ('Draft'),
    [BasedOnVersionID]    UNIQUEIDENTIFIER NULL,
    [Instructions]        NVARCHAR(MAX)    NULL,
    [PassThreshold]       DECIMAL(9,6)     NULL,
    [MinimumCompleteness] DECIMAL(9,6)     NULL,
    [NotApplicablePolicy] NVARCHAR(30)     NOT NULL CONSTRAINT [DF_RubricVersion_NotApplicablePolicy] DEFAULT ('ExcludeAndRedistribute'),
    [ScoreDisplayMin]     DECIMAL(18,6)    NOT NULL CONSTRAINT [DF_RubricVersion_ScoreDisplayMin] DEFAULT (0),
    [ScoreDisplayMax]     DECIMAL(18,6)    NOT NULL CONSTRAINT [DF_RubricVersion_ScoreDisplayMax] DEFAULT (100),
    [RequestedBump]       NVARCHAR(10)     NULL,
    [ComputedBump]        NVARCHAR(10)     NULL,
    [AppliedBump]         NVARCHAR(10)     NULL,
    [ChangeSummary]       NVARCHAR(MAX)    NULL,
    [ChangeDetails]       NVARCHAR(MAX)    NULL,
    [ContentHash]         NVARCHAR(64)     NULL,
    [ScoringHash]         NVARCHAR(64)     NULL,
    [PublishedAt]         DATETIMEOFFSET   NULL,
    [PublishedByUserID]   UNIQUEIDENTIFIER NULL,
    [RetiredAt]           DATETIMEOFFSET   NULL,
    CONSTRAINT [PK_RubricVersion] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricVersion_Rubric] FOREIGN KEY ([RubricID])
        REFERENCES [${flyway:defaultSchema}].[Rubric]([ID]),
    CONSTRAINT [FK_RubricVersion_BasedOnVersion] FOREIGN KEY ([BasedOnVersionID])
        REFERENCES [${flyway:defaultSchema}].[RubricVersion]([ID]),
    CONSTRAINT [FK_RubricVersion_PublishedByUser] FOREIGN KEY ([PublishedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [CK_RubricVersion_Status] CHECK ([Status] IN ('Draft', 'Published', 'Retired')),
    CONSTRAINT [CK_RubricVersion_NotApplicablePolicy] CHECK ([NotApplicablePolicy] IN ('ExcludeAndRedistribute', 'CountAsZero', 'FailEvaluation', 'NotAllowed')),
    CONSTRAINT [CK_RubricVersion_RequestedBump] CHECK ([RequestedBump] IN ('Major', 'Minor', 'Patch')),
    CONSTRAINT [CK_RubricVersion_ComputedBump] CHECK ([ComputedBump] IN ('Initial', 'Major', 'Minor', 'Patch')),
    CONSTRAINT [CK_RubricVersion_AppliedBump] CHECK ([AppliedBump] IN ('Initial', 'Major', 'Minor', 'Patch')),
    CONSTRAINT [CK_RubricVersion_PassThreshold] CHECK ([PassThreshold] IS NULL OR ([PassThreshold] >= 0 AND [PassThreshold] <= 1)),
    CONSTRAINT [CK_RubricVersion_MinimumCompleteness] CHECK ([MinimumCompleteness] IS NULL OR ([MinimumCompleteness] >= 0 AND [MinimumCompleteness] <= 1)),
    CONSTRAINT [CK_RubricVersion_DisplayRange] CHECK ([ScoreDisplayMax] > [ScoreDisplayMin]),
    CONSTRAINT [CK_RubricVersion_VersionNumbers] CHECK (
        ([MajorVersion] IS NULL OR [MajorVersion] >= 0) AND
        ([MinorVersion] IS NULL OR [MinorVersion] >= 0) AND
        ([PatchVersion] IS NULL OR [PatchVersion] >= 0)),
    -- A non-draft version is a published fact: it must carry its number, hashes and publish stamp.
    CONSTRAINT [CK_RubricVersion_PublishedIsComplete] CHECK (
        [Status] = 'Draft' OR (
            [MajorVersion] IS NOT NULL AND [MinorVersion] IS NOT NULL AND [PatchVersion] IS NOT NULL AND
            [ContentHash] IS NOT NULL AND [ScoringHash] IS NOT NULL AND [PublishedAt] IS NOT NULL AND
            [AppliedBump] IS NOT NULL))
);
GO

-- A draft carries no number until it is published; published numbers are unique per rubric.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_RubricVersion_Number]
    ON [${flyway:defaultSchema}].[RubricVersion] ([RubricID], [MajorVersion], [MinorVersion], [PatchVersion])
    WHERE [MajorVersion] IS NOT NULL;
GO

-- At most one open draft per rubric: every edit starts from it, so two would fork the lineage.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_RubricVersion_OneDraft]
    ON [${flyway:defaultSchema}].[RubricVersion] ([RubricID])
    WHERE [Status] = 'Draft';
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricCriterion] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricCriterion_ID] DEFAULT (newsequentialid()),
    [RubricVersionID]     UNIQUEIDENTIFIER NOT NULL,
    [ParentID]            UNIQUEIDENTIFIER NULL,
    [Key]                 NVARCHAR(100)    NOT NULL,
    [Name]                NVARCHAR(255)    NOT NULL,
    [Description]         NVARCHAR(MAX)    NULL,
    [Guidance]            NVARCHAR(MAX)    NULL,
    [NodeType]            NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RubricCriterion_NodeType] DEFAULT ('Criterion'),
    [ScaleID]             UNIQUEIDENTIFIER NULL,
    [Weight]              DECIMAL(18,6)    NOT NULL CONSTRAINT [DF_RubricCriterion_Weight] DEFAULT (1),
    [IsAdvisory]          BIT              NOT NULL CONSTRAINT [DF_RubricCriterion_IsAdvisory] DEFAULT (0),
    [IsGate]              BIT              NOT NULL CONSTRAINT [DF_RubricCriterion_IsGate] DEFAULT (0),
    [GateMinimumScore]    DECIMAL(9,6)     NULL,
    [NotApplicablePolicy] NVARCHAR(30)     NULL,
    [RollupMethod]        NVARCHAR(20)     NULL,
    [EvidenceRequired]    BIT              NOT NULL CONSTRAINT [DF_RubricCriterion_EvidenceRequired] DEFAULT (0),
    [RationaleRequired]   BIT              NOT NULL CONSTRAINT [DF_RubricCriterion_RationaleRequired] DEFAULT (0),
    [Sequence]            INT              NOT NULL CONSTRAINT [DF_RubricCriterion_Sequence] DEFAULT (0),
    [EvaluatorConfig]     NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_RubricCriterion] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricCriterion_RubricVersion] FOREIGN KEY ([RubricVersionID])
        REFERENCES [${flyway:defaultSchema}].[RubricVersion]([ID]),
    CONSTRAINT [FK_RubricCriterion_Parent] FOREIGN KEY ([ParentID])
        REFERENCES [${flyway:defaultSchema}].[RubricCriterion]([ID]),
    CONSTRAINT [FK_RubricCriterion_Scale] FOREIGN KEY ([ScaleID])
        REFERENCES [${flyway:defaultSchema}].[RubricScale]([ID]),
    -- Key is the criterion's identity ACROSS versions: results are compared and aggregated by it.
    CONSTRAINT [UQ_RubricCriterion_Key] UNIQUE ([RubricVersionID], [Key]),
    CONSTRAINT [CK_RubricCriterion_NodeType] CHECK ([NodeType] IN ('Group', 'Criterion')),
    CONSTRAINT [CK_RubricCriterion_NotApplicablePolicy] CHECK ([NotApplicablePolicy] IN ('ExcludeAndRedistribute', 'CountAsZero', 'FailEvaluation', 'NotAllowed')),
    CONSTRAINT [CK_RubricCriterion_RollupMethod] CHECK ([RollupMethod] IN ('WeightedMean', 'Minimum', 'Maximum')),
    CONSTRAINT [CK_RubricCriterion_Weight] CHECK ([Weight] >= 0),
    CONSTRAINT [CK_RubricCriterion_GateMinimumScore] CHECK ([GateMinimumScore] IS NULL OR ([GateMinimumScore] >= 0 AND [GateMinimumScore] <= 1)),
    -- A leaf is answered on a scale; a group is rolled up from its children and has no scale.
    CONSTRAINT [CK_RubricCriterion_ScaleByNodeType] CHECK (
        ([NodeType] = 'Criterion' AND [ScaleID] IS NOT NULL) OR
        ([NodeType] = 'Group' AND [ScaleID] IS NULL)),
    CONSTRAINT [CK_RubricCriterion_RollupOnGroupsOnly] CHECK ([NodeType] = 'Group' OR [RollupMethod] IS NULL),
    CONSTRAINT [CK_RubricCriterion_GateNeedsMinimum] CHECK ([IsGate] = 0 OR [GateMinimumScore] IS NOT NULL),
    -- An advisory criterion never affects the result, so it cannot also be a gate.
    CONSTRAINT [CK_RubricCriterion_AdvisoryIsNotGate] CHECK (NOT ([IsAdvisory] = 1 AND [IsGate] = 1))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricCriterionLevel] (
    [ID]           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricCriterionLevel_ID] DEFAULT (newsequentialid()),
    [CriterionID]  UNIQUEIDENTIFIER NOT NULL,
    [ScaleLevelID] UNIQUEIDENTIFIER NULL,
    [AnchorValue]  DECIMAL(18,6)    NULL,
    [Descriptor]   NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT [PK_RubricCriterionLevel] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricCriterionLevel_Criterion] FOREIGN KEY ([CriterionID])
        REFERENCES [${flyway:defaultSchema}].[RubricCriterion]([ID]),
    CONSTRAINT [FK_RubricCriterionLevel_ScaleLevel] FOREIGN KEY ([ScaleLevelID])
        REFERENCES [${flyway:defaultSchema}].[RubricScaleLevel]([ID]),
    -- Anchors a level of a 'Levels' scale, or a point on a 'Numeric' scale — exactly one.
    CONSTRAINT [CK_RubricCriterionLevel_OneAnchor] CHECK (
        ([ScaleLevelID] IS NOT NULL AND [AnchorValue] IS NULL) OR
        ([ScaleLevelID] IS NULL AND [AnchorValue] IS NOT NULL))
);
GO

-- Filtered, because a plain UNIQUE treats NULLs as equal and would reject a second numeric anchor.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_RubricCriterionLevel_ScaleLevel]
    ON [${flyway:defaultSchema}].[RubricCriterionLevel] ([CriterionID], [ScaleLevelID])
    WHERE [ScaleLevelID] IS NOT NULL;
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_RubricCriterionLevel_AnchorValue]
    ON [${flyway:defaultSchema}].[RubricCriterionLevel] ([CriterionID], [AnchorValue])
    WHERE [AnchorValue] IS NOT NULL;
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricBand] (
    [ID]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricBand_ID] DEFAULT (newsequentialid()),
    [RubricVersionID] UNIQUEIDENTIFIER NOT NULL,
    [Label]           NVARCHAR(100)    NOT NULL,
    [Description]     NVARCHAR(MAX)    NULL,
    [MinScore]        DECIMAL(9,6)     NOT NULL,
    [MaxScore]        DECIMAL(9,6)     NOT NULL,
    [DisplayTone]     NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RubricBand_DisplayTone] DEFAULT ('Neutral'),
    [Sequence]        INT              NOT NULL CONSTRAINT [DF_RubricBand_Sequence] DEFAULT (0),
    CONSTRAINT [PK_RubricBand] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricBand_RubricVersion] FOREIGN KEY ([RubricVersionID])
        REFERENCES [${flyway:defaultSchema}].[RubricVersion]([ID]),
    CONSTRAINT [UQ_RubricBand_Label] UNIQUE ([RubricVersionID], [Label]),
    CONSTRAINT [CK_RubricBand_DisplayTone] CHECK ([DisplayTone] IN ('Success', 'Info', 'Neutral', 'Warning', 'Error')),
    CONSTRAINT [CK_RubricBand_Range] CHECK ([MinScore] >= 0 AND [MaxScore] <= 1 AND [MinScore] < [MaxScore])
);
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 2. Result side
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE [${flyway:defaultSchema}].[RubricEvaluation] (
    [ID]                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricEvaluation_ID] DEFAULT (newsequentialid()),
    [RubricVersionID]         UNIQUEIDENTIFIER NOT NULL,
    [SubjectEntityID]         UNIQUEIDENTIFIER NOT NULL,
    [SubjectRecordID]         NVARCHAR(450)    NOT NULL,
    [ContextEntityID]         UNIQUEIDENTIFIER NULL,
    [ContextRecordID]         NVARCHAR(450)    NULL,
    [EvaluatorType]           NVARCHAR(20)     NOT NULL,
    [EvaluatorUserID]         UNIQUEIDENTIFIER NULL,
    [AIPromptRunID]           UNIQUEIDENTIFIER NULL,
    [AIAgentRunID]            UNIQUEIDENTIFIER NULL,
    [EvaluatorName]           NVARCHAR(255)    NULL,
    [Status]                  NVARCHAR(20)     NOT NULL CONSTRAINT [DF_RubricEvaluation_Status] DEFAULT ('Draft'),
    [SupersedesEvaluationID]  UNIQUEIDENTIFIER NULL,
    [SubmittedAt]             DATETIMEOFFSET   NULL,
    [PassThresholdApplied]    DECIMAL(9,6)     NULL,
    [NormalizedScore]         DECIMAL(9,6)     NULL,
    [Passed]                  BIT              NULL,
    [Outcome]                 NVARCHAR(30)     NULL,
    [BandID]                  UNIQUEIDENTIFIER NULL,
    [GateFailed]              BIT              NOT NULL CONSTRAINT [DF_RubricEvaluation_GateFailed] DEFAULT (0),
    [Completeness]            DECIMAL(9,6)     NULL,
    [ScoredCriteriaCount]     INT              NULL,
    [ApplicableCriteriaCount] INT              NULL,
    [TotalCriteriaCount]      INT              NULL,
    [Confidence]              DECIMAL(9,6)     NULL,
    [Narrative]               NVARCHAR(MAX)    NULL,
    [ErrorMessage]            NVARCHAR(MAX)    NULL,
    [ScoringEngineVersion]    NVARCHAR(20)     NULL,
    [Metadata]                NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_RubricEvaluation] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricEvaluation_RubricVersion] FOREIGN KEY ([RubricVersionID])
        REFERENCES [${flyway:defaultSchema}].[RubricVersion]([ID]),
    CONSTRAINT [FK_RubricEvaluation_SubjectEntity] FOREIGN KEY ([SubjectEntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_RubricEvaluation_ContextEntity] FOREIGN KEY ([ContextEntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_RubricEvaluation_EvaluatorUser] FOREIGN KEY ([EvaluatorUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_RubricEvaluation_AIPromptRun] FOREIGN KEY ([AIPromptRunID])
        REFERENCES [${flyway:defaultSchema}].[AIPromptRun]([ID]),
    CONSTRAINT [FK_RubricEvaluation_AIAgentRun] FOREIGN KEY ([AIAgentRunID])
        REFERENCES [${flyway:defaultSchema}].[AIAgentRun]([ID]),
    CONSTRAINT [FK_RubricEvaluation_SupersedesEvaluation] FOREIGN KEY ([SupersedesEvaluationID])
        REFERENCES [${flyway:defaultSchema}].[RubricEvaluation]([ID]),
    CONSTRAINT [FK_RubricEvaluation_Band] FOREIGN KEY ([BandID])
        REFERENCES [${flyway:defaultSchema}].[RubricBand]([ID]),
    CONSTRAINT [CK_RubricEvaluation_EvaluatorType] CHECK ([EvaluatorType] IN ('Human', 'AIPrompt', 'Agent', 'Deterministic', 'Self', 'External')),
    CONSTRAINT [CK_RubricEvaluation_Status] CHECK ([Status] IN ('Draft', 'Submitted', 'Superseded', 'Withdrawn', 'Failed')),
    CONSTRAINT [CK_RubricEvaluation_Outcome] CHECK ([Outcome] IN ('Passed', 'BelowThreshold', 'GateFailed', 'NotApplicableFailure', 'Incomplete', 'Scored')),
    CONSTRAINT [CK_RubricEvaluation_ContextPair] CHECK (
        ([ContextEntityID] IS NULL AND [ContextRecordID] IS NULL) OR
        ([ContextEntityID] IS NOT NULL AND [ContextRecordID] IS NOT NULL)),
    CONSTRAINT [CK_RubricEvaluation_HumanHasUser] CHECK ([EvaluatorType] <> 'Human' OR [EvaluatorUserID] IS NOT NULL),
    CONSTRAINT [CK_RubricEvaluation_Scores] CHECK (
        ([NormalizedScore] IS NULL OR ([NormalizedScore] >= 0 AND [NormalizedScore] <= 1)) AND
        ([PassThresholdApplied] IS NULL OR ([PassThresholdApplied] >= 0 AND [PassThresholdApplied] <= 1)) AND
        ([Completeness] IS NULL OR ([Completeness] >= 0 AND [Completeness] <= 1)) AND
        ([Confidence] IS NULL OR ([Confidence] >= 0 AND [Confidence] <= 1))),
    -- A submitted evaluation carries its computed result; NormalizedScore may still be NULL
    -- (Outcome = 'Incomplete' when nothing applicable was scored).
    CONSTRAINT [CK_RubricEvaluation_SubmittedIsComputed] CHECK (
        [Status] NOT IN ('Submitted', 'Superseded', 'Withdrawn') OR
        ([SubmittedAt] IS NOT NULL AND [Outcome] IS NOT NULL))
);
GO

-- Consensus lookups are driven by the subject: "every evaluation of this record". The wrapper
-- view's cohort aggregate seeks on this index rather than scanning the table.
CREATE NONCLUSTERED INDEX [IX_RubricEvaluation_Cohort]
    ON [${flyway:defaultSchema}].[RubricEvaluation] ([SubjectEntityID], [SubjectRecordID], [Status])
    INCLUDE ([ContextEntityID], [ContextRecordID], [RubricVersionID], [EvaluatorType], [NormalizedScore], [Passed]);
GO

CREATE TABLE [${flyway:defaultSchema}].[RubricEvaluationScore] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RubricEvaluationScore_ID] DEFAULT (newsequentialid()),
    [EvaluationID]        UNIQUEIDENTIFIER NOT NULL,
    [CriterionID]         UNIQUEIDENTIFIER NOT NULL,
    [ScaleLevelID]        UNIQUEIDENTIFIER NULL,
    [RawValue]            DECIMAL(18,6)    NULL,
    [IsNotApplicable]     BIT              NOT NULL CONSTRAINT [DF_RubricEvaluationScore_IsNotApplicable] DEFAULT (0),
    [IsComputed]          BIT              NOT NULL CONSTRAINT [DF_RubricEvaluationScore_IsComputed] DEFAULT (0),
    [NormalizedScore]     DECIMAL(9,6)     NULL,
    [EffectiveWeight]     DECIMAL(9,6)     NULL,
    [OverallContribution] DECIMAL(9,6)     NULL,
    [GateFailed]          BIT              NOT NULL CONSTRAINT [DF_RubricEvaluationScore_GateFailed] DEFAULT (0),
    [Completeness]        DECIMAL(9,6)     NULL,
    [Confidence]          DECIMAL(9,6)     NULL,
    [Rationale]           NVARCHAR(MAX)    NULL,
    [Evidence]            NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_RubricEvaluationScore] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RubricEvaluationScore_Evaluation] FOREIGN KEY ([EvaluationID])
        REFERENCES [${flyway:defaultSchema}].[RubricEvaluation]([ID]),
    CONSTRAINT [FK_RubricEvaluationScore_Criterion] FOREIGN KEY ([CriterionID])
        REFERENCES [${flyway:defaultSchema}].[RubricCriterion]([ID]),
    CONSTRAINT [FK_RubricEvaluationScore_ScaleLevel] FOREIGN KEY ([ScaleLevelID])
        REFERENCES [${flyway:defaultSchema}].[RubricScaleLevel]([ID]),
    CONSTRAINT [UQ_RubricEvaluationScore_Criterion] UNIQUE ([EvaluationID], [CriterionID]),
    -- "Not applicable" is an answer in its own right, not a missing value alongside one.
    CONSTRAINT [CK_RubricEvaluationScore_NotApplicableHasNoValue] CHECK (
        [IsNotApplicable] = 0 OR ([ScaleLevelID] IS NULL AND [RawValue] IS NULL AND [NormalizedScore] IS NULL)),
    CONSTRAINT [CK_RubricEvaluationScore_Ranges] CHECK (
        ([NormalizedScore] IS NULL OR ([NormalizedScore] >= 0 AND [NormalizedScore] <= 1)) AND
        ([EffectiveWeight] IS NULL OR ([EffectiveWeight] >= 0 AND [EffectiveWeight] <= 1)) AND
        ([OverallContribution] IS NULL OR ([OverallContribution] >= 0 AND [OverallContribution] <= 1)) AND
        ([Completeness] IS NULL OR ([Completeness] >= 0 AND [Completeness] <= 1)) AND
        ([Confidence] IS NULL OR ([Confidence] >= 0 AND [Confidence] <= 1)))
);
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 3. Consumers: agents and the testing framework
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE [${flyway:defaultSchema}].[AIAgentRubric] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIAgentRubric_ID] DEFAULT (newsequentialid()),
    [AgentID]              UNIQUEIDENTIFIER NOT NULL,
    [RubricID]             UNIQUEIDENTIFIER NOT NULL,
    [Purpose]              NVARCHAR(30)     NOT NULL,
    [IsDefault]            BIT              NOT NULL CONSTRAINT [DF_AIAgentRubric_IsDefault] DEFAULT (0),
    [Status]               NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIAgentRubric_Status] DEFAULT ('Active'),
    [PassThreshold]        DECIMAL(9,6)     NULL,
    [SampleRate]           DECIMAL(9,6)     NULL,
    [MaxSelfCheckAttempts] INT              NULL,
    [EvaluatorConfig]      NVARCHAR(MAX)    NULL,
    [Sequence]             INT              NOT NULL CONSTRAINT [DF_AIAgentRubric_Sequence] DEFAULT (0),
    CONSTRAINT [PK_AIAgentRubric] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AIAgentRubric_Agent] FOREIGN KEY ([AgentID])
        REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentRubric_Rubric] FOREIGN KEY ([RubricID])
        REFERENCES [${flyway:defaultSchema}].[Rubric]([ID]),
    CONSTRAINT [UQ_AIAgentRubric_AgentRubricPurpose] UNIQUE ([AgentID], [RubricID], [Purpose]),
    CONSTRAINT [CK_AIAgentRubric_Purpose] CHECK ([Purpose] IN ('Evaluation', 'SelfCheck', 'ProductionSampling')),
    CONSTRAINT [CK_AIAgentRubric_Status] CHECK ([Status] IN ('Active', 'Disabled')),
    CONSTRAINT [CK_AIAgentRubric_PassThreshold] CHECK ([PassThreshold] IS NULL OR ([PassThreshold] >= 0 AND [PassThreshold] <= 1)),
    CONSTRAINT [CK_AIAgentRubric_SampleRate] CHECK ([SampleRate] IS NULL OR ([SampleRate] >= 0 AND [SampleRate] <= 1)),
    CONSTRAINT [CK_AIAgentRubric_SamplingNeedsRate] CHECK ([Purpose] <> 'ProductionSampling' OR [SampleRate] IS NOT NULL),
    CONSTRAINT [CK_AIAgentRubric_MaxSelfCheckAttempts] CHECK ([MaxSelfCheckAttempts] IS NULL OR [MaxSelfCheckAttempts] >= 1)
);
GO

ALTER TABLE [${flyway:defaultSchema}].[Test] ADD
    [RubricID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Test_Rubric] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[Rubric]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[TestSuite] ADD
    [RubricID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_TestSuite_Rubric] FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[Rubric]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[TestSuiteRun] ADD
    [Score] DECIMAL(5,4) NULL
        CONSTRAINT [CK_TestSuiteRun_Score] CHECK ([Score] IS NULL OR ([Score] >= 0 AND [Score] <= 1));
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 4. Immutability backstop triggers
--
--    The entity-server subclasses are the primary guard and give the user-facing errors.
--    These triggers exist so raw SQL and any path around BaseEntity cannot rewrite history.
--    They deliberately reference only columns declared above (never __mj_UpdatedAt), so the
--    CodeGen timestamp trigger's own UPDATE of __mj_UpdatedAt on a frozen row is not blocked.
--    Column comparisons use EXCEPT, which treats NULL = NULL, so a NULL->value change is caught.
-- ════════════════════════════════════════════════════════════════════════════════════

-- 4a. A published or retired version is frozen, except for moving between Published and Retired.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricVersion_Immutable]
ON [${flyway:defaultSchema}].[RubricVersion]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM deleted WHERE [Status] <> 'Draft')
        RETURN;

    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        THROW 51101, 'A published or retired rubric version cannot be deleted.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN inserted i ON i.[ID] = d.[ID]
        WHERE d.[Status] <> 'Draft'
          AND (
                i.[Status] = 'Draft'
             OR EXISTS (
                    SELECT d.[RubricID], d.[MajorVersion], d.[MinorVersion], d.[PatchVersion], d.[BasedOnVersionID],
                           d.[Instructions], d.[PassThreshold], d.[MinimumCompleteness], d.[NotApplicablePolicy],
                           d.[ScoreDisplayMin], d.[ScoreDisplayMax], d.[RequestedBump], d.[ComputedBump], d.[AppliedBump],
                           d.[ChangeSummary], d.[ChangeDetails], d.[ContentHash], d.[ScoringHash],
                           d.[PublishedAt], d.[PublishedByUserID]
                    EXCEPT
                    SELECT i.[RubricID], i.[MajorVersion], i.[MinorVersion], i.[PatchVersion], i.[BasedOnVersionID],
                           i.[Instructions], i.[PassThreshold], i.[MinimumCompleteness], i.[NotApplicablePolicy],
                           i.[ScoreDisplayMin], i.[ScoreDisplayMax], i.[RequestedBump], i.[ComputedBump], i.[AppliedBump],
                           i.[ChangeSummary], i.[ChangeDetails], i.[ContentHash], i.[ScoringHash],
                           i.[PublishedAt], i.[PublishedByUserID]
                )
          )
    )
    BEGIN
        THROW 51102, 'A published rubric version is immutable. Create a new draft version to change it; only its Status may move between Published and Retired.', 1;
    END;
END;
GO

-- 4b. Criteria of a non-draft version are frozen.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricCriterion_Immutable]
ON [${flyway:defaultSchema}].[RubricCriterion]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (SELECT [RubricVersionID] FROM inserted UNION SELECT [RubricVersionID] FROM deleted) x
        INNER JOIN [${flyway:defaultSchema}].[RubricVersion] v ON v.[ID] = x.[RubricVersionID]
        WHERE v.[Status] <> 'Draft'
    )
    BEGIN
        THROW 51103, 'Criteria of a published rubric version cannot be added, changed or removed. Create a new draft version.', 1;
    END;
END;
GO

-- 4c. Level descriptors of a non-draft version are frozen.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricCriterionLevel_Immutable]
ON [${flyway:defaultSchema}].[RubricCriterionLevel]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (SELECT [CriterionID] FROM inserted UNION SELECT [CriterionID] FROM deleted) x
        INNER JOIN [${flyway:defaultSchema}].[RubricCriterion] c ON c.[ID] = x.[CriterionID]
        INNER JOIN [${flyway:defaultSchema}].[RubricVersion] v ON v.[ID] = c.[RubricVersionID]
        WHERE v.[Status] <> 'Draft'
    )
    BEGIN
        THROW 51104, 'Level descriptors of a published rubric version cannot be added, changed or removed. Create a new draft version.', 1;
    END;
END;
GO

-- 4d. Bands of a non-draft version are frozen.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricBand_Immutable]
ON [${flyway:defaultSchema}].[RubricBand]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (SELECT [RubricVersionID] FROM inserted UNION SELECT [RubricVersionID] FROM deleted) x
        INNER JOIN [${flyway:defaultSchema}].[RubricVersion] v ON v.[ID] = x.[RubricVersionID]
        WHERE v.[Status] <> 'Draft'
    )
    BEGIN
        THROW 51105, 'Bands of a published rubric version cannot be added, changed or removed. Create a new draft version.', 1;
    END;
END;
GO

-- 4e. A scale used by a published version is frozen in everything that affects scoring. Its
--     name, description and status may still change; its type, range and levels may not.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricScale_Immutable]
ON [${flyway:defaultSchema}].[RubricScale]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted d
        LEFT JOIN inserted i ON i.[ID] = d.[ID]
        WHERE EXISTS (
                SELECT 1
                FROM [${flyway:defaultSchema}].[RubricCriterion] c
                INNER JOIN [${flyway:defaultSchema}].[RubricVersion] v ON v.[ID] = c.[RubricVersionID]
                WHERE c.[ScaleID] = d.[ID] AND v.[Status] <> 'Draft'
            )
          AND (
                i.[ID] IS NULL
             OR EXISTS (
                    SELECT d.[ScaleType], d.[MinValue], d.[MaxValue], d.[Step], d.[HigherIsBetter]
                    EXCEPT
                    SELECT i.[ScaleType], i.[MinValue], i.[MaxValue], i.[Step], i.[HigherIsBetter]
                )
          )
    )
    BEGIN
        THROW 51106, 'This scale is used by a published rubric version; its type, range and direction cannot change and it cannot be deleted. Create a new scale instead.', 1;
    END;
END;
GO

CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricScaleLevel_Immutable]
ON [${flyway:defaultSchema}].[RubricScaleLevel]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Description is display text; everything else about a level is part of the scoring math.
    IF EXISTS (
        SELECT 1
        FROM (SELECT [ScaleID] FROM inserted UNION SELECT [ScaleID] FROM deleted) x
        WHERE EXISTS (
                SELECT 1
                FROM [${flyway:defaultSchema}].[RubricCriterion] c
                INNER JOIN [${flyway:defaultSchema}].[RubricVersion] v ON v.[ID] = c.[RubricVersionID]
                WHERE c.[ScaleID] = x.[ScaleID] AND v.[Status] <> 'Draft'
            )
    )
    AND (
        NOT EXISTS (SELECT 1 FROM inserted)                  -- delete
     OR NOT EXISTS (SELECT 1 FROM deleted)                   -- insert
     OR EXISTS (
            SELECT d.[ID], d.[ScaleID], d.[Label], d.[Value], d.[NormalizedValue], d.[Sequence] FROM deleted d
            EXCEPT
            SELECT i.[ID], i.[ScaleID], i.[Label], i.[Value], i.[NormalizedValue], i.[Sequence] FROM inserted i
        )
    )
    BEGIN
        THROW 51107, 'This scale is used by a published rubric version; its levels cannot be added, changed or removed (descriptions may be edited). Create a new scale instead.', 1;
    END;
END;
GO

-- 4f. A submitted evaluation is frozen. Its only permitted change is Status moving
--     Submitted -> Superseded (a newer evaluation replaces it) or Submitted -> Withdrawn.
--     Superseded, Withdrawn and Failed are terminal.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricEvaluation_Immutable]
ON [${flyway:defaultSchema}].[RubricEvaluation]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM deleted WHERE [Status] <> 'Draft')
        RETURN;

    IF NOT EXISTS (SELECT 1 FROM inserted)
    BEGIN
        THROW 51108, 'A submitted rubric evaluation cannot be deleted. Supersede or withdraw it instead.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN inserted i ON i.[ID] = d.[ID]
        WHERE d.[Status] <> 'Draft'
          AND (
                -- the only legal status moves out of a frozen state
                NOT (
                        i.[Status] = d.[Status]
                     OR (d.[Status] = 'Submitted' AND i.[Status] IN ('Superseded', 'Withdrawn'))
                    )
             OR EXISTS (
                    SELECT d.[RubricVersionID], d.[SubjectEntityID], d.[SubjectRecordID], d.[ContextEntityID], d.[ContextRecordID],
                           d.[EvaluatorType], d.[EvaluatorUserID], d.[AIPromptRunID], d.[AIAgentRunID], d.[EvaluatorName],
                           d.[SupersedesEvaluationID], d.[SubmittedAt], d.[PassThresholdApplied], d.[NormalizedScore], d.[Passed],
                           d.[Outcome], d.[BandID], d.[GateFailed], d.[Completeness], d.[ScoredCriteriaCount],
                           d.[ApplicableCriteriaCount], d.[TotalCriteriaCount], d.[Confidence], d.[Narrative], d.[ErrorMessage],
                           d.[ScoringEngineVersion], d.[Metadata]
                    EXCEPT
                    SELECT i.[RubricVersionID], i.[SubjectEntityID], i.[SubjectRecordID], i.[ContextEntityID], i.[ContextRecordID],
                           i.[EvaluatorType], i.[EvaluatorUserID], i.[AIPromptRunID], i.[AIAgentRunID], i.[EvaluatorName],
                           i.[SupersedesEvaluationID], i.[SubmittedAt], i.[PassThresholdApplied], i.[NormalizedScore], i.[Passed],
                           i.[Outcome], i.[BandID], i.[GateFailed], i.[Completeness], i.[ScoredCriteriaCount],
                           i.[ApplicableCriteriaCount], i.[TotalCriteriaCount], i.[Confidence], i.[Narrative], i.[ErrorMessage],
                           i.[ScoringEngineVersion], i.[Metadata]
                )
          )
    )
    BEGIN
        THROW 51109, 'A submitted rubric evaluation is immutable. To correct it, create a new evaluation that supersedes it.', 1;
    END;
END;
GO

-- 4g. Score rows belong to their evaluation's lifecycle: writable only while it is a Draft.
CREATE TRIGGER [${flyway:defaultSchema}].[trgRubricEvaluationScore_Immutable]
ON [${flyway:defaultSchema}].[RubricEvaluationScore]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM (SELECT [EvaluationID] FROM inserted UNION SELECT [EvaluationID] FROM deleted) x
        INNER JOIN [${flyway:defaultSchema}].[RubricEvaluation] e ON e.[ID] = x.[EvaluationID]
        WHERE e.[Status] <> 'Draft'
    )
    BEGIN
        THROW 51110, 'Scores of a submitted rubric evaluation cannot be added, changed or removed.', 1;
    END;
END;
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 5. Descriptions
-- ════════════════════════════════════════════════════════════════════════════════════

-- RubricCategory
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Hierarchical folders for organizing rubrics.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCategory';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the category.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCategory', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What rubrics in this category are for.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCategory', @level2type = N'COLUMN', @level2name = 'Description';
GO

-- RubricScale
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A reusable response scale that criteria are answered on: either ordered Levels (e.g. 1-5, Pass/Fail, Compliant/Partial/Non-compliant) or a Numeric range. Every answer is converted to a normalized 0..1 score. A scale used by a published rubric version is frozen in everything that affects scoring.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique display name of the scale, e.g. "Likert 1-5" or "Compliance".',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the scale measures and how evaluators should read it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Levels: answers pick one of the scale''s RubricScaleLevel rows, each carrying its own normalized value. Numeric: answers are a number between MinValue and MaxValue, normalized linearly (inverted when HigherIsBetter = 0).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'ScaleType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Lowest allowed answer for a Numeric scale. Required when ScaleType = Numeric.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'MinValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Highest allowed answer for a Numeric scale. Required when ScaleType = Numeric and must exceed MinValue.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'MaxValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional input increment for a Numeric scale (e.g. 0.5). NULL = any value in range.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'Step';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For Numeric scales: 1 = a higher answer is better (normalizes to a higher score); 0 = lower is better (e.g. error counts), so normalization is inverted.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'HigherIsBetter';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active scales can be chosen for new criteria; Disabled scales stay valid for versions that already use them.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScale', @level2type = N'COLUMN', @level2name = 'Status';
GO

-- RubricScaleLevel
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One level of a Levels-type rubric scale.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScaleLevel';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What evaluators see and pick, e.g. "Exceeds", "Partially compliant", "4".',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScaleLevel', @level2type = N'COLUMN', @level2name = 'Label';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The level''s raw value in the scale''s own units, e.g. 4 on a 1-5 scale. Display and export only; scoring uses NormalizedValue.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScaleLevel', @level2type = N'COLUMN', @level2name = 'Value';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The score this level contributes, from 0 (worst) to 1 (best). Explicit rather than derived so non-linear scales (e.g. Partial = 0.4) are expressible.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScaleLevel', @level2type = N'COLUMN', @level2name = 'NormalizedValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Generic meaning of the level. Criteria can override it with their own anchor text (RubricCriterionLevel).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScaleLevel', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display order of the level within its scale, worst to best by convention.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricScaleLevel', @level2type = N'COLUMN', @level2name = 'Sequence';
GO

-- Rubric
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The stable identity of a rubric: weighted, nested criteria that records are evaluated against. The content lives in immutable, semantically versioned RubricVersion rows.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'Rubric';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique display name of the rubric.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'Rubric', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the rubric evaluates and when to use it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'Rubric', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active rubrics can be assigned and evaluated against; Disabled rubrics keep their history but are not offered for new use.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'Rubric', @level2type = N'COLUMN', @level2name = 'Status';
GO

-- RubricVersion
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An immutable-once-published snapshot of a rubric''s content. Edits happen on the single Draft; publishing freezes it and assigns a semantic version whose bump is computed by the server from a diff against the previous published version: Major = scores are not comparable (weights, scales, gates, tree shape, N/A policy, rollup, evaluator rules), Minor = scores comparable but verdicts or interpretation may differ (threshold, bands, advisory criteria, required evidence), Patch = wording only.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Semantic major version, assigned at publish. Evaluations sharing a rubric and major version are directly comparable. NULL while Draft.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'MajorVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Semantic minor version, assigned at publish. NULL while Draft.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'MinorVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Semantic patch version, assigned at publish. NULL while Draft.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'PatchVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Draft (editable, at most one per rubric), Published (frozen, available for new evaluations), or Retired (frozen, kept for history and for evaluations already pinned to it).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The version this draft was cloned from; the publish-time diff and bump are computed against it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'BasedOnVersionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Overall guidance for evaluators (human and AI) applying this version. Wording only: changing it is a patch.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'Instructions';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default minimum normalized score (0..1) for an evaluation to pass. Consumers (a test, a review round) may override it; the threshold actually used is stored on each evaluation. NULL = no threshold (evaluations report a score and gate results only).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'PassThreshold';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Minimum share (0..1) of applicable scored criteria required for a valid result. Below it the evaluation''s Outcome is Incomplete and it does not pass. NULL = no minimum.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'MinimumCompleteness';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default handling of a criterion answered Not Applicable (criteria may override): ExcludeAndRedistribute (drop it and share its weight among its siblings), CountAsZero (score it 0), FailEvaluation (allowed, but the evaluation fails), NotAllowed (the evaluation cannot be submitted).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'NotApplicablePolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display-only lower bound: the value a normalized score of 0 is shown as (e.g. 0 or 1). Never used in scoring.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ScoreDisplayMin';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display-only upper bound: the value a normalized score of 1 is shown as (e.g. 100 or 5). Never used in scoring.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ScoreDisplayMax';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional bump the author asks for on publish. The server applies the larger of this and the bump it computes; an author can never publish a smaller bump than the change requires.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'RequestedBump';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The bump the server computed from the diff at publish (Initial for a rubric''s first version).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ComputedBump';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The bump actually applied at publish: the larger of ComputedBump and RequestedBump.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'AppliedBump';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Author''s human-readable summary of what changed in this version.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ChangeSummary';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON diff produced at publish: every added, removed and changed node and property, each with the bump it required. Explains ComputedBump.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ChangeDetails';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the version''s full canonical content (scoring math plus all wording), computed at publish.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ContentHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of only the scoring-relevant content (tree shape, keys, weights, scales, gates, policies, rollups, evaluator rules). Two versions with equal ScoringHash compute identical scores from identical answers.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'ScoringHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the version was published.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'PublishedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the version was retired. NULL while Draft or Published.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricVersion', @level2type = N'COLUMN', @level2name = 'RetiredAt';
GO

-- RubricCriterion
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A node in a rubric version''s weighted tree. Groups roll up their children; criteria (leaves) are answered on a scale. Weights are relative among siblings, so a node''s share of the total is the product of its and its ancestors'' normalized weights.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Parent group node. NULL = a top-level node of the rubric.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'ParentID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Stable machine key, unique within the version and carried unchanged across versions. It is the criterion''s identity for comparing and aggregating results over time; renaming it is a removal plus an addition (a major bump).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'Key';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the group or criterion.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the node covers.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Instructions to evaluators (human and AI) on how to judge this criterion and what evidence counts.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'Guidance';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Group: has children, no scale, and a computed score. Criterion: a leaf answered on ScaleID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'NodeType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Relative weight among siblings (normalized within the parent at scoring time). Must be >= 0.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'Weight';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = recorded and displayed but excluded from every score, gate and pass decision.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'IsAdvisory';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = knockout: if this node''s normalized score is below GateMinimumScore the whole evaluation fails, whatever its overall score. Also applies to groups.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'IsGate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Normalized score (0..1) a gate node must reach. Required when IsGate = 1.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'GateMinimumScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Overrides the version''s NotApplicablePolicy for this node. NULL = inherit.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'NotApplicablePolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How a group combines its children''s scores: WeightedMean (default when NULL), Minimum (weakest child), or Maximum (strongest child). Groups only.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'RollupMethod';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = an evaluation cannot be submitted without evidence for this criterion.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'EvidenceRequired';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = an evaluation cannot be submitted without a written rationale for this criterion.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'RationaleRequired';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display order among siblings.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'Sequence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (IRubricCriterionEvaluatorConfig) of evaluator-specific settings, keyed by evaluator: e.g. a deterministic rule, or hints for AI judges. Changes are treated as scoring changes (major bump) because a deterministic rule decides the score.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterion', @level2type = N'COLUMN', @level2name = 'EvaluatorConfig';
GO

-- RubricCriterionLevel
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Criterion-specific anchor text: what a given level (or numeric value) looks like for THIS criterion, e.g. what "4 - Strong" means for Methodology.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterionLevel';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Levels-scale level this anchor describes. Exactly one of ScaleLevelID and AnchorValue is set.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterionLevel', @level2type = N'COLUMN', @level2name = 'ScaleLevelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For a Numeric scale: the value this anchor describes (e.g. 0, 50, 100).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterionLevel', @level2type = N'COLUMN', @level2name = 'AnchorValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The anchor text shown to evaluators and given to AI judges.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricCriterionLevel', @level2type = N'COLUMN', @level2name = 'Descriptor';
GO

-- RubricBand
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A labeled range of the normalized score, e.g. Exemplary / Proficient / Developing. Display and reporting ONLY: bands never decide pass or fail, which is always PassThreshold plus gates.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display label of the band.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand', @level2type = N'COLUMN', @level2name = 'Label';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What a result in this band means.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Inclusive lower bound of the band on the 0..1 normalized scale.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand', @level2type = N'COLUMN', @level2name = 'MinScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Exclusive upper bound of the band on the 0..1 normalized scale; the highest band also includes 1.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand', @level2type = N'COLUMN', @level2name = 'MaxScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Semantic tone the UI maps to design tokens (never a raw color).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand', @level2type = N'COLUMN', @level2name = 'DisplayTone';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display order of the band.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricBand', @level2type = N'COLUMN', @level2name = 'Sequence';
GO

-- RubricEvaluation
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One evaluator''s judgment of one record (the subject) against one pinned rubric version. Editable while Draft; on submit the server computes and stores the result once, after which the row is immutable. Several evaluations of the same subject in the same context form a cohort whose consensus is exposed by the base view.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The entity of the record being evaluated (a test run, an agent run, a submission, a vendor response, ...).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'SubjectEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary key of the record being evaluated, in MemberJunction''s composite-key string form.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'SubjectRecordID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional entity of the record that asked for this evaluation (a test, a review round, a workflow step). Evaluations share a consensus cohort only when their context matches.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'ContextEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary key of the context record. Set together with ContextEntityID or not at all.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'ContextRecordID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Who judged: Human (a user), AIPrompt (an LLM judge), Agent (an agent that may use tools), Deterministic (rules), Self (the subject''s own party, e.g. a vendor asserting compliance; excluded from reviewer consensus), External (imported from another system).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'EvaluatorType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The user who evaluated. Required for Human; the responding user for Self.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'EvaluatorUserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The prompt run that produced an AIPrompt evaluation (model, cost, raw output).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'AIPromptRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The agent run that produced an Agent evaluation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'AIAgentRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Name of the evaluator implementation or external source (e.g. the evaluator driver class) for provenance.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'EvaluatorName';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Draft (being filled in), Submitted (final, counted in consensus), Superseded (replaced by a newer evaluation), Withdrawn (retracted, e.g. a conflict of interest), Failed (the evaluator errored; see ErrorMessage).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The earlier evaluation this one corrects. Submitting this one moves that one to Superseded.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'SupersedesEvaluationID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the evaluation was submitted and its result computed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'SubmittedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The pass threshold used to compute Passed (the version default or a consumer override). Stored so a later change to either never rewrites history.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'PassThresholdApplied';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Overall score, 0..1, computed once at submit from the score rows. NULL if nothing applicable was scored.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'NormalizedScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Computed verdict: 1 = passed, 0 = failed, NULL = no threshold applied and no gate or N/A failure (Outcome = Scored).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Passed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why the evaluation ended as it did: Passed, BelowThreshold, GateFailed, NotApplicableFailure, Incomplete (below MinimumCompleteness or nothing scored), or Scored (no threshold to judge against).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Outcome';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The band NormalizedScore falls in, for display. Interpretation only.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'BandID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = at least one gate node scored below its GateMinimumScore.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'GateFailed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Share (0..1) of applicable, non-advisory criteria that were scored.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Completeness';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of non-advisory criteria that received a score.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'ScoredCriteriaCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of non-advisory criteria not answered Not Applicable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'ApplicableCriteriaCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of non-advisory criteria (leaves) in the version.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'TotalCriteriaCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Evaluator''s overall confidence (0..1), typically the weighted mean of per-criterion confidences from an AI judge. NULL for evaluators that do not report one.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Confidence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The evaluator''s overall written assessment.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Narrative';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why the evaluator failed, when Status = Failed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'ErrorMessage';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version of the scoring algorithm that computed the stored result, so a future algorithm change is visible rather than silent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'ScoringEngineVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (IRubricEvaluationMetadata) of evaluator provenance not covered by columns: model settings, timings, the consumer that requested it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluation', @level2type = N'COLUMN', @level2name = 'Metadata';
GO

-- RubricEvaluationScore
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One node of one evaluation: an evaluator''s answer to a criterion, or (IsComputed = 1) a group''s computed rollup. Writable only while the evaluation is a Draft.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The level chosen, for a criterion on a Levels scale.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'ScaleLevelID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The number entered, for a criterion on a Numeric scale.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'RawValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = the evaluator judged this criterion not applicable to the subject; handled per the effective NotApplicablePolicy.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'IsNotApplicable';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = a group rollup written by the server at submit, not an evaluator''s answer.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'IsComputed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The node''s score on the 0..1 scale: the answer normalized through its scale, or the group rollup.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'NormalizedScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The node''s share of its parent (0..1) after Not Applicable redistribution.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'EffectiveWeight';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Points this node contributed to the evaluation''s overall NormalizedScore (its score times the product of effective weights to the root). Leaves'' contributions sum to the overall score under weighted-mean rollups.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'OverallContribution';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = this node is a gate and scored below its GateMinimumScore.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'GateFailed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For group rows: share (0..1) of applicable descendant criteria that were scored.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'Completeness';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Evaluator''s confidence in this answer (0..1), e.g. from an AI judge''s level probabilities. Low confidence can route the criterion to a human.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'Confidence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The evaluator''s reasoning for this answer.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'Rationale';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array (IRubricEvidence[]) of evidence items: quotes with spans, conversation turns, file references, URLs, record references.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'RubricEvaluationScore', @level2type = N'COLUMN', @level2name = 'Evidence';
GO

-- AIAgentRubric
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A rubric an agent publishes for how it should be judged: Evaluation (used by agent eval tests), SelfCheck (the agent checks its own output before returning), or ProductionSampling (a share of real runs is evaluated asynchronously to watch for drift).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How the agent uses the rubric: Evaluation, SelfCheck or ProductionSampling.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'Purpose';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1 = the rubric used for this purpose when a caller does not name one.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'IsDefault';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active links are used; Disabled links are kept but ignored.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Overrides the rubric version''s PassThreshold (0..1) for this agent and purpose. NULL = use the version default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'PassThreshold';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Share (0..1) of completed production runs to evaluate. Required for ProductionSampling. Sampling is deterministic on the run ID so it is reproducible.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'SampleRate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For SelfCheck: how many times the agent may revise its output after a failed self-check before returning anyway (with the failure recorded). NULL = 1.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'MaxSelfCheckAttempts';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (IRubricEvaluatorSelection) naming which evaluator to use and its settings (e.g. judge prompt, model), overriding the defaults.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'EvaluatorConfig';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display and evaluation order when an agent has several rubrics for one purpose.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentRubric', @level2type = N'COLUMN', @level2name = 'Sequence';
GO

-- Testing framework
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The rubric this test''s output is judged by. NULL = inherit from the suite (walking up ParentID). The latest published version is pinned when each run starts.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'Test', @level2type = N'COLUMN', @level2name = 'RubricID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default rubric for tests in this suite and its child suites that do not name their own.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'TestSuite', @level2type = N'COLUMN', @level2name = 'RubricID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Suite-level score (0..1): the mean score of the suite''s executed (non-skipped) test runs.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'TestSuiteRun', @level2type = N'COLUMN', @level2name = 'Score';
GO
