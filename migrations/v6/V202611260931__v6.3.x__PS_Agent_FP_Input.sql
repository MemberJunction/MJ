-- ============================================================================================================
-- PR 5 — The agent as a drafter, and Feature Pipelines as a Predictive Studio input
-- ============================================================================================================
-- One migration for the PR (D-094); each milestone that adds DDL writes its own headed section (A2, B1, B4 in
-- wave 1), and the CodeGen tail below the hand-written DDL is regenerated once per wave on the integration database.

-- section: A2
-- ============================================================================
-- MLBuildApprovalClaim — one claim per approved build request (D5-23)
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[MLBuildApprovalClaim] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLBuildApprovalClaim_ID] DEFAULT (newsequentialid()),
    [AgentRequestID]       UNIQUEIDENTIFIER NOT NULL,
    [ClaimingAgentRunID]   UNIQUEIDENTIFIER NOT NULL,
    [PlanHash]             CHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ClaimedAt]            DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLBuildApprovalClaim_ClaimedAt] DEFAULT (SYSDATETIMEOFFSET()),
    [Outcome]              NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_MLBuildApprovalClaim_Outcome] DEFAULT (N'claimed'),
    -- Provenance only, no foreign key (D5-54): the claim outlives its build, and core's
    -- spDeleteEntityWithCoreDependencies deletes training pipelines, so a key here would make that core
    -- procedure need a PS-specific statement. The ID records which pipeline the build created.
    [MLTrainingPipelineID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_MLBuildApprovalClaim] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MLBuildApprovalClaim_AgentRequest] FOREIGN KEY ([AgentRequestID]) REFERENCES [${flyway:defaultSchema}].[AIAgentRequest] ([ID]),
    CONSTRAINT [FK_MLBuildApprovalClaim_ClaimingAgentRun] FOREIGN KEY ([ClaimingAgentRunID]) REFERENCES [${flyway:defaultSchema}].[AIAgentRun] ([ID]),
    CONSTRAINT [CK_MLBuildApprovalClaim_Outcome] CHECK ([Outcome] IN ('claimed', 'built', 'failed'))
);
GO

-- The arbiter of two concurrent claims of one approval: of two inserts one commits, the other fails and its claimant
-- re-reads the row by AgentRequestID (consumed).
CREATE UNIQUE INDEX [UQ_MLBuildApprovalClaim_AgentRequestID]
    ON [${flyway:defaultSchema}].[MLBuildApprovalClaim] ([AgentRequestID]);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The atomic claim a Model Development Agent run takes on an approved build request (MJ: AI Agent Requests) before it dispatches the Pipeline Builder: one row per request (unique), created only by BuildApprovalClaims.Claim and changed only by BuildApprovalClaims.Settle. The row is kept whatever the build does, a failure or a crash included, so one approval starts at most one build and another build needs a new approval.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The approved build request this claim consumes; unique, so a request is claimed once.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim', @level2type = N'COLUMN', @level2name = N'AgentRequestID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Model Development Agent run that took the claim and alone dispatches the build.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim', @level2type = N'COLUMN', @level2name = N'ClaimingAgentRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 (hex) of the canonical plan payload the approval was for (AgentControlPath.PlanHash).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim', @level2type = N'COLUMN', @level2name = N'PlanHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the claim was taken (database clock).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim', @level2type = N'COLUMN', @level2name = N'ClaimedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'claimed (the build was dispatched or is about to be; still claimed after a crash), built (the build ran) or failed (the build failed).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim', @level2type = N'COLUMN', @level2name = N'Outcome';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The ID of the training pipeline the build created, when it created one: a provenance record with no foreign key, kept when that pipeline is later deleted (the claim and its consumed approval outlive the build).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLBuildApprovalClaim', @level2type = N'COLUMN', @level2name = N'MLTrainingPipelineID';
GO
-- end section: A2

-- section: B1
-- ------------------------------------------------------------------------------------------------------------
-- Effective-dated Feature Values (PR 5 §5.2.1, D5-27).
--
-- A Feature Pipeline value (Source = 'Pipeline') and a person's value (Source = 'Human') become dated history: a
-- changed value closes the open row (EffectiveTo = the new row's EffectiveAsOf) and a new row is opened, instead of
-- the row being updated in place. One open row per identity:
--   Pipeline: (RecordProcessID, EntityID, RecordID, FeatureName, PipelineVersion)
--   Human:    (RecordProcessID, MLModelScoringBindingID, EntityID, RecordID, FeatureName)
-- Model rows (Source = 'Model', PR 4) are keyed by their scoring as-of instant and are never closed here.
--
-- A database with PR 1 data holds several Pipeline rows per identity (a changed input inserted a new key and kept
-- the old row), all with EffectiveTo NULL once the column exists, so the open-row indexes could not be built over
-- it. The section therefore runs in order, in separate batches: (1) the two columns; (2) one set-based UPDATE that
-- closes every superseded Pipeline/Human Champion row; (3) UQ_FeatureValue_ValueKey narrowed to open rows; (4) the
-- open-row indexes and the as-of read index. This is DDL-adjacent set-based SQL (§5.5); it writes no metadata.
-- ------------------------------------------------------------------------------------------------------------

-- (1) The end of a value's effective range, and the person who entered a Human value.
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD [EffectiveTo]  DATETIMEOFFSET   NULL,
        [SourceUserID] UNIQUEIDENTIFIER NULL,
        CONSTRAINT [FK_FeatureValue_SourceUser] FOREIGN KEY ([SourceUserID])
            REFERENCES [${flyway:defaultSchema}].[User] ([ID]);
GO

-- (2) Close every superseded Pipeline/Human Champion row of each identity. The open row of an identity is, in order:
-- a row with any non-null value before an all-null (historyOnly) row, then the newest ComputedAt, then the greatest
-- ID. Every other row ends where the next row in that order starts: its COALESCE(EffectiveAsOf, ComputedAt). The
-- partition is each source's own identity (the CASE terms drop the column the other source's identity omits).
WITH [Ordered] AS (
    SELECT fv.[EffectiveTo],
           LEAD(COALESCE(fv.[EffectiveAsOf], fv.[ComputedAt])) OVER (
               PARTITION BY fv.[Source], fv.[RecordProcessID],
                            CASE WHEN fv.[Source] = N'Human' THEN fv.[MLModelScoringBindingID] END,
                            fv.[EntityID], fv.[RecordID], fv.[FeatureName],
                            CASE WHEN fv.[Source] = N'Pipeline' THEN fv.[PipelineVersion] END
               ORDER BY CASE WHEN fv.[ValueText] IS NULL AND fv.[ValueNumeric] IS NULL AND fv.[ValueBoolean] IS NULL
                                  AND fv.[ValueDate] IS NULL AND fv.[ValueJSON] IS NULL THEN 0 ELSE 1 END,
                        fv.[ComputedAt], fv.[ID]) AS [NextStart]
    FROM [${flyway:defaultSchema}].[FeatureValue] fv
    WHERE fv.[Source] IN (N'Pipeline', N'Human') AND fv.[Role] = N'Champion'
)
UPDATE [Ordered]
SET [EffectiveTo] = [NextStart]
WHERE [NextStart] IS NOT NULL;
GO

-- (3) A Feature Value key is unique among OPEN rows only: closed history repeats keys (A -> B -> A, a re-derived value
-- for the same input, a second Human edit).
DROP INDEX [UQ_FeatureValue_ValueKey] ON [${flyway:defaultSchema}].[FeatureValue];
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValue_ValueKey]
    ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID], [ValueKeyHash])
    WHERE [ValueKeyHash] IS NOT NULL AND [EffectiveTo] IS NULL;
GO

-- (4) One open row per identity. The lock Queries 'Predictive Studio: Lock Open Pipeline Feature Values' and
-- '… Lock Open Human Feature Values' repeat these WHERE predicates literally, so they seek these indexes and their
-- key-range locks cover an identity with no open row yet.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValue_OpenPipeline]
    ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID], [EntityID], [RecordID], [FeatureName], [PipelineVersion])
    WHERE [EffectiveTo] IS NULL AND [Source] = N'Pipeline' AND [Role] = N'Champion';
GO
CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValue_OpenHuman]
    ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID], [MLModelScoringBindingID], [EntityID], [RecordID], [FeatureName])
    WHERE [EffectiveTo] IS NULL AND [Source] = N'Human' AND [Role] = N'Champion';
GO
-- The value in effect at an instant: per entity, feature and version, a record's rows by effective date.
CREATE NONCLUSTERED INDEX [IX_FeatureValue_Entity_Feature_Version_Record_AsOf]
    ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID], [FeatureName], [PipelineVersion], [RecordID], [EffectiveAsOf])
    INCLUDE ([RecordProcessID], [Source], [Role], [EffectiveTo]);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'End of the instant range in which this value is the record''s value of the feature (exclusive); NULL while it is the open (current) value. Set by the Feature Pipelines write path when a later value of the same identity is recorded, or when a Human value is retired. Maintained for Pipeline and Human rows only; Model rows are keyed by their scoring as-of instant and never closed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'EffectiveTo';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Human rows: the user who entered the value (the user of the record''s newest Record Change when the entity tracks record changes); NULL when unknown and on every other row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'SourceUserID';
GO
-- end section: B1

-- section: B4
-- Search-strategy policy comparison ledger (PR 5 §5.2.5): equal-cost evidence against random
-- search on W1-signal and C1 before a guided Wave Strategist (bayesian or successive-halving)
-- can be enabled. LowerBoundMin holds the minimum paired lower bound across datasets; Passed is
-- computed server-side by code (LowerBoundMin > 0).
CREATE TABLE [${flyway:defaultSchema}].[MLSearchStrategyComparison] (
    [ID]                         UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_ID] DEFAULT (newsequentialid()),
    [Method]                     NVARCHAR(40)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ComputeBudgetSecondsPerArm] DECIMAL(18, 4)   NOT NULL,
    [Datasets]                   NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [PairedDifference]           NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [LowerBoundMin]              DECIMAL(18, 6)   NOT NULL,
    [Passed]                     BIT              NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_Passed] DEFAULT ((0)),
    [ComparedAt]                 DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_ComparedAt] DEFAULT (SYSDATETIMEOFFSET()),
    [ComparedByUserID]           UNIQUEIDENTIFIER NOT NULL,
    [__mj_CreatedAt]             DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_CreatedAt] DEFAULT (GETUTCDATE()),
    [__mj_UpdatedAt]             DATETIMEOFFSET   NOT NULL CONSTRAINT [DF_MLSearchStrategyComparison_UpdatedAt] DEFAULT (GETUTCDATE()),
    CONSTRAINT [PK_MLSearchStrategyComparison] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [CK_MLSearchStrategyComparison_Method] CHECK ([Method] IN (N'bayesian', N'successive-halving')),
    CONSTRAINT [CK_MLSearchStrategyComparison_ComputeBudget] CHECK ([ComputeBudgetSecondsPerArm] > 0),
    CONSTRAINT [FK_MLSearchStrategyComparison_User] FOREIGN KEY ([ComparedByUserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID])
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Equal-cost paired comparison ledger between a guided search strategy (bayesian or successive-halving) and seeded random search across W1-signal and scenario C1. A guided protocol is accepted only when referencing a row with Passed = 1.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key of the search-strategy comparison record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Guided search method compared against seeded random search: bayesian or successive-halving.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'Method';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Equal-cost compute budget (seconds per arm) allocated to both the guided method and the seeded random baseline.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ComputeBudgetSecondsPerArm';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of {Dataset, Seeds} entries documenting the datasets and random seeds evaluated (must include W1-signal and C1).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'Datasets';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON map from dataset name to PairedComparison ({value, ci, beats}) comparing the guided method against seeded random search.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'PairedDifference';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Minimum of the paired lower bounds (ci[0]) across W1-signal and C1; never an average.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'LowerBoundMin';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Computed server-side as LowerBoundMin > 0; client writes supplying a different value are refused.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'Passed';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the paired comparison was recorded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ComparedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who recorded or initiated the search-strategy comparison.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'MLSearchStrategyComparison',
    @level2type = N'COLUMN', @level2name = N'ComparedByUserID';
GO
-- end section: B4
