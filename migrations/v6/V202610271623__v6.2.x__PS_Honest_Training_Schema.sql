/**************************************************************************************************
 * Migration: Predictive Studio — honest training (Prediction Units, Evaluation Protocols, Training Snapshots)
 *
 *   1. PredictionUnit      (MJ: Prediction Units)       — what one training row is, its decision date,
 *                                                         outcome rule, window, censoring, task type.
 *                                                         Immutable versions; Temporal Spec inside.
 *   2. EvaluationProtocol  (MJ: Evaluation Protocols)   — the grading rules, saved before any search.
 *                                                         Immutable versions.
 *   3. TrainingSnapshot    (MJ: Training Snapshots)     — the frozen, fingerprinted training data of a run.
 *   4. MLTrainingPipeline  + PredictionUnitID, EvaluationProtocolID
 *   5. MLTrainingRun       + TrainingSnapshotID, EvaluationProtocolID, CodeVersion, ComputeSeconds
 *   6. FeatureValue        + EffectiveAsOf, InputAsOf (the as-of column shared by pipeline rows and
 *                             PR 4's Source = 'Model' rows, D-058)
 *
 * A version row is never updated: "editing" inserts the next version (Version + 1, same LineageRootID).
 * Version 1's LineageRootID is its own ID (the client supplies the ID on insert).
 **************************************************************************************************/

-- ============================================================================
-- 1. PredictionUnit
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[PredictionUnit] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PredictionUnit_ID] DEFAULT (newsequentialid()),
    [LineageRootID]       UNIQUEIDENTIFIER NOT NULL,
    [Version]             INT              NOT NULL,
    [Name]                NVARCHAR(255)    NOT NULL,
    [Description]         NVARCHAR(MAX)    NULL,
    [UnitRows]            NVARCHAR(MAX)    NOT NULL,
    [LabelRule]           NVARCHAR(MAX)    NOT NULL,
    [LabelWindowDays]     INT              NOT NULL,
    [LabelGapDays]        INT              NOT NULL CONSTRAINT [DF_PredictionUnit_LabelGapDays] DEFAULT (0),
    [TaskType]            NVARCHAR(MAX)    NOT NULL,
    [LabelVersion]        INT              NOT NULL,
    [Censoring]           NVARCHAR(MAX)    NOT NULL,
    [ChangeHistoryPolicy] NVARCHAR(MAX)    NOT NULL,
    [GroupKey]            NVARCHAR(255)    NULL,
    [TemporalSpec]        NVARCHAR(MAX)    NULL,
    [DecisionSpec]        NVARCHAR(MAX)    NOT NULL,
    [IncumbentHeuristic]  NVARCHAR(MAX)    NOT NULL,
    [AuthoredBy]          NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT [PK_PredictionUnit] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_PredictionUnit_Lineage_Version] UNIQUE ([LineageRootID], [Version]),
    CONSTRAINT [FK_PredictionUnit_LineageRoot] FOREIGN KEY ([LineageRootID])
        REFERENCES [${flyway:defaultSchema}].[PredictionUnit] ([ID]),
    CONSTRAINT [CK_PredictionUnit_Version] CHECK ([Version] >= 1),
    CONSTRAINT [CK_PredictionUnit_LineageRoot] CHECK (([Version] = 1 AND [LineageRootID] = [ID]) OR ([Version] > 1 AND [LineageRootID] <> [ID])),
    CONSTRAINT [CK_PredictionUnit_LabelVersion] CHECK ([LabelVersion] >= 1 AND [LabelVersion] <= [Version]),
    CONSTRAINT [CK_PredictionUnit_LabelWindowDays] CHECK ([LabelWindowDays] > 0),
    CONSTRAINT [CK_PredictionUnit_LabelGapDays] CHECK ([LabelGapDays] >= 0)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A Prediction Unit: what one training row is (one grain record, or one grain record per period of a dated child entity), its decision date, the outcome rule and the window over which the outcome is observed, how unresolved rows are censored, and the declared task type. Every ML Training Pipeline references exactly one version. Versions are immutable rows: editing a unit inserts the next version with the same LineageRootID, so a trained model keeps pointing at the version it used.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'ID of version 1 of this unit. Version 1 points at itself; every later version points at version 1.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'LineageRootID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version number within the lineage, starting at 1. A saved version is never updated.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'Version';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the unit, e.g. "Member renewal (person x membership period)".', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the unit predicts and for whom, in plain words.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON UnitRows: {kind:"grain", grainEntity, decisionDate, filter} or {kind:"grain-x-periods", grainEntity, childEntity, foreignKey, periodDate, filter}. Defines what one row is and its decision date.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'UnitRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON LabelRule: how the outcome of a row is read — a column on the row, the next period of the same grain record, or an event in a dated child entity — always within the window that starts LabelGapDays after the decision date and lasts LabelWindowDays.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Length in days of the outcome window. A row whose window ends after the data cutoff is censored (excluded and counted).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelWindowDays';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Days between the decision date and the start of the outcome window.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelGapDays';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON TaskType: binary {classOrder, adverseIndex}, multiclass {classOrder, adverseIndices}, continuous, count, non-negative {tweediePower}, or forecast {valueKind}. Which class a score refers to and the adverse direction are derived from it, never stored separately.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'TaskType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Outcome-definition version: equals the previous version''s LabelVersion when LabelRule, LabelWindowDays, LabelGapDays and TaskType are unchanged, and that plus one otherwise.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CensoringRule: {rule:"exclude-unresolved", cutoff} where cutoff is {kind:"corpus-end", entity, field}, {kind:"now"} or {kind:"fixed", at}. Rows whose outcome window has not closed at the cutoff are excluded and counted.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'Censoring';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ChangeHistoryPolicy: {onUncoveredRow:"refuse"|"exclude-and-count", externalSourceRows:"as-of-detection-time"|"ineligible"} — what as-of assembly does when a decision date precedes the change history of a field updated in place.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'ChangeHistoryPolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Field on the row whose value keeps one entity''s rows together in grouped folds and the new-entity report; NULL means the grain record key.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'GroupKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON TemporalSpec for series and panels: timeColumn, horizonPeriods, lags, rollingWindows, period, seasonality. Every lag and rolling-window endLag is at least horizonPeriods. Required when TaskType is forecast. Versioned with the unit.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'TemporalSpec';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON DecisionSpec: the action the prediction serves, the actor role, the capacity per period (for precision at capacity) and the period.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'DecisionSpec';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON IncumbentHeuristic: {kind:"none"} or {kind:"rule", name, scoreExpression} — today''s rule of thumb, scored as a named comparator on the same holdout.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'IncumbentHeuristic';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Actor who authored this version: {kind:"human", userId} (a user), or an automated author {kind:"agent", agentRunId}, {kind:"scheduled-job", scheduledJobRunId} or {kind:"system", component}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PredictionUnit', @level2type = N'COLUMN', @level2name = N'AuthoredBy';
GO

-- ============================================================================
-- 2. EvaluationProtocol
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[EvaluationProtocol] (
    [ID]                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EvaluationProtocol_ID] DEFAULT (newsequentialid()),
    [LineageRootID]         UNIQUEIDENTIFIER NOT NULL,
    [Version]               INT              NOT NULL,
    [Name]                  NVARCHAR(255)    NOT NULL,
    [Description]           NVARCHAR(MAX)    NULL,
    [Holdout]               NVARCHAR(MAX)    NOT NULL,
    [InnerValidation]       NVARCHAR(MAX)    NOT NULL,
    [Seed]                  INT              NOT NULL,
    [HoldoutAccessBudget]   INT              NOT NULL CONSTRAINT [DF_EvaluationProtocol_HoldoutAccessBudget] DEFAULT (1),
    [PrimaryScore]          NVARCHAR(MAX)    NOT NULL,
    [SecondaryMetrics]      NVARCHAR(MAX)    NOT NULL,
    [Baselines]             NVARCHAR(MAX)    NOT NULL,
    [Calibration]           NVARCHAR(MAX)    NOT NULL,
    [Resampling]            NVARCHAR(MAX)    NOT NULL,
    [Intervals]             NVARCHAR(MAX)    NOT NULL,
    [Promotion]             NVARCHAR(MAX)    NOT NULL,
    [AllowedOutcomes]       NVARCHAR(MAX)    NOT NULL,
    [LeakageAudit]          NVARCHAR(MAX)    NOT NULL,
    [Exclusions]            NVARCHAR(MAX)    NOT NULL,
    [Slices]                NVARCHAR(MAX)    NOT NULL,
    [PredictionIntervals]   NVARCHAR(MAX)    NULL,
    [ResidualDiagnostics]   NVARCHAR(MAX)    NULL,
    [RetrainTriggers]       NVARCHAR(MAX)    NOT NULL,
    [SearchStrategy]        NVARCHAR(MAX)    NOT NULL,
    [Budgets]               NVARCHAR(MAX)    NOT NULL,
    [MinMinorityClassRows]  INT              NOT NULL CONSTRAINT [DF_EvaluationProtocol_MinMinorityClassRows] DEFAULT (20),
    [GuardFieldsEditableBy] NVARCHAR(20)     NOT NULL CONSTRAINT [DF_EvaluationProtocol_GuardFieldsEditableBy] DEFAULT (N'non-agent'),
    [AuthoredBy]            NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT [PK_EvaluationProtocol] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_EvaluationProtocol_Lineage_Version] UNIQUE ([LineageRootID], [Version]),
    CONSTRAINT [FK_EvaluationProtocol_LineageRoot] FOREIGN KEY ([LineageRootID])
        REFERENCES [${flyway:defaultSchema}].[EvaluationProtocol] ([ID]),
    CONSTRAINT [CK_EvaluationProtocol_Version] CHECK ([Version] >= 1),
    CONSTRAINT [CK_EvaluationProtocol_LineageRoot] CHECK (([Version] = 1 AND [LineageRootID] = [ID]) OR ([Version] > 1 AND [LineageRootID] <> [ID])),
    CONSTRAINT [CK_EvaluationProtocol_HoldoutAccessBudget] CHECK ([HoldoutAccessBudget] = 1),
    CONSTRAINT [CK_EvaluationProtocol_MinMinorityClassRows] CHECK ([MinMinorityClassRows] >= 1),
    CONSTRAINT [CK_EvaluationProtocol_GuardFieldsEditableBy] CHECK ([GuardFieldsEditableBy] IN (N'non-agent', N'human-only'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An Evaluation Protocol: the grading rules of a pipeline, saved before any candidate trains — the locked holdout, inner validation, primary proper score, fixed baselines, calibration, intervals, promotion rule and the three allowed outcomes (model, keep-simple-baseline, no-signal), the leakage audit, slices and budgets. Every training run references the exact version it was graded under. Versions are immutable rows; editing inserts the next version. Replaces the ValidationStrategy and LeakageGuard JSON of ML Training Pipelines.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'ID of version 1 of this protocol. Version 1 points at itself.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'LineageRootID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version number within the lineage, starting at 1. A saved version is never updated.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Version';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the protocol.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the protocol is for, in plain words.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON HoldoutSplit (guard field): {kind:"date-carved", dateColumn, cutoff, holdoutEnd, newEntityReport} or {kind:"rolling-origin", origins (>= 5), horizonPeriods, gapPeriods, minTrainPeriods, window}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Holdout';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON InnerValidation over development rows only: repeated-stratified-kfold, grouped-kfold or blocked-time.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'InnerValidation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Random seed for every split, fold, bootstrap and estimator of a run under this protocol.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Seed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How many times the locked holdout may be scored per run: always 1, for one declared finalist.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'HoldoutAccessBudget';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ProperScore {family, metric}: the only metric that ranks candidates and gates outcomes. Its family must equal the pipeline unit''s task kind.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'PrimaryScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of secondary metric keys (auc, accuracy, f1, precision, recall, r2, calibration-slope); reported with intervals, never used to rank.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'SecondaryMetrics';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of BaselineSpec fitted on every run: dummy, one-feature, glm, naive, seasonal-naive, incumbent-heuristic.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Baselines';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CalibrationMethod: platt, isotonic or auto, always fit on a disjoint calibration fold; not-applicable for regression.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Calibration';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ResamplingSpec: {kind:"none"} or {kind:"in-fold", method}; resampling never touches holdout rows.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Resampling';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON IntervalSpec: level 0.95, method, resamples and the paired test for model-versus-comparator differences.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Intervals';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON PromotionRule (guard field): comparators, incumbent, margin (>= 0), lowerBoundLevel 0.95, pairedOn same-holdout-rows, decisionTable Q13+Q14+Q15.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Promotion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array, exactly ["model","keep-simple-baseline","no-signal"]: a protocol cannot omit no-signal.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'AllowedOutcomes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON LeakageAuditSpec (guard field): held-out single-feature AUC ceiling, time-shifted-label test, drop-column test, per-source-column importance aggregation, high-cardinality ID check.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'LeakageAudit';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ProtocolExclusions (guard field): {denyFields, denySources} — columns and sources that never enter the feature matrix (the former LeakageGuard deny lists).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Exclusions';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON SliceSpec: {outOfTime, subgroups} — each slice is reported with the primary score and its interval.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Slices';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON PredictionIntervalSpec {method, nominalCoverage} for continuous, count and non-negative tasks; NULL when not requested.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'PredictionIntervals';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ResidualDiagnosticsSpec {acfLags, ljungBoxAlpha} for series and panels; NULL otherwise.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'ResidualDiagnostics';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of RetrainTrigger declared for monitoring (outcome-degradation, calibration-drift).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'RetrainTriggers';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON SearchStrategy: {kind:"random", candidates} or {kind:"guided", method, equalCostComparisonId}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'SearchStrategy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Budgets (guard field): maxComputeSeconds, maxTokens, maxCandidates, hardStop true.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Budgets';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Smallest minority-class row count in the locked holdout for which a classification gate may return model; below it the gate cannot ship a model.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'MinMinorityClassRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Who may change the guard fields (Holdout, Promotion, LeakageAudit, Exclusions, Budgets and this setting) in the next version: non-agent (default: any author except an agent tool call — a user, a non-agent API caller, a scheduled job or the system) or human-only (optional: only a version authored by a user). Every author''s version passes the same guard-field validation.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'GuardFieldsEditableBy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Actor who authored this version.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EvaluationProtocol', @level2type = N'COLUMN', @level2name = N'AuthoredBy';
GO

-- ============================================================================
-- 3. MLTrainingPipeline + unit and protocol references (before TrainingSnapshot, which references pipelines)
-- ============================================================================
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline]
    ADD [PredictionUnitID]     UNIQUEIDENTIFIER NULL,
        [EvaluationProtocolID] UNIQUEIDENTIFIER NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline]
    ADD CONSTRAINT [FK_MLTrainingPipeline_PredictionUnit] FOREIGN KEY ([PredictionUnitID])
            REFERENCES [${flyway:defaultSchema}].[PredictionUnit] ([ID]),
        CONSTRAINT [FK_MLTrainingPipeline_EvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
            REFERENCES [${flyway:defaultSchema}].[EvaluationProtocol] ([ID]);
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact Prediction Unit version this pipeline trains on. NULL only on a pipeline created before Predictive Studio 6.3 that has not been migrated; such a pipeline cannot be trained.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingPipeline', @level2type = N'COLUMN', @level2name = N'PredictionUnitID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact Evaluation Protocol version every training run of this pipeline is graded under. Its primary score family must equal the unit''s task kind.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingPipeline', @level2type = N'COLUMN', @level2name = N'EvaluationProtocolID';
GO

-- ============================================================================
-- 4. TrainingSnapshot
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[TrainingSnapshot] (
    [ID]                           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_TrainingSnapshot_ID] DEFAULT (newsequentialid()),
    [ContentHash]                  NVARCHAR(64)     NOT NULL,
    [PipelineID]                   UNIQUEIDENTIFIER NOT NULL,
    [PredictionUnitID]             UNIQUEIDENTIFIER NOT NULL,
    [LabelVersion]                 INT              NOT NULL,
    [FeatureSpecVersion]           INT              NOT NULL,
    [EvaluationProtocolID]         UNIQUEIDENTIFIER NULL,
    [StorageProviderID]            UNIQUEIDENTIFIER NOT NULL,
    [MatrixFileID]                 UNIQUEIDENTIFIER NOT NULL,
    [MatrixSha256]                 NVARCHAR(64)     NOT NULL,
    [MatrixSizeBytes]              BIGINT           NOT NULL,
    [RowManifestFileID]            UNIQUEIDENTIFIER NOT NULL,
    [RowManifestSha256]            NVARCHAR(64)     NOT NULL,
    [RowManifestSizeBytes]         BIGINT           NOT NULL,
    [ProvenanceFileID]             UNIQUEIDENTIFIER NOT NULL,
    [ProvenanceSha256]             NVARCHAR(64)     NOT NULL,
    [ProvenanceSizeBytes]          BIGINT           NOT NULL,
    [ManifestRowCount]             INT              NOT NULL,
    [HoldoutRowCount]              INT              NOT NULL,
    [FeatureSpec]                  NVARCHAR(MAX)    NOT NULL,
    [FeatureSchema]                NVARCHAR(MAX)    NOT NULL,
    [FeatureSchemaHash]            NVARCHAR(64)     NOT NULL,
    [ColumnProvenance]             NVARCHAR(MAX)    NOT NULL,
    [PinnedFeatureVersions]        NVARCHAR(MAX)    NOT NULL CONSTRAINT [DF_TrainingSnapshot_PinnedFeatureVersions] DEFAULT (N'[]'),
    [RowsRead]                     INT              NOT NULL,
    [ReadComplete]                 BIT              NOT NULL CONSTRAINT [DF_TrainingSnapshot_ReadComplete] DEFAULT (1),
    [CensoredRowsExcluded]         INT              NOT NULL,
    [LabelKnownRowsExcluded]       INT              NOT NULL,
    [EmptyLabelRowsExcluded]       INT              NOT NULL,
    [UncoveredHistoryRowsExcluded] NVARCHAR(MAX)    NOT NULL CONSTRAINT [DF_TrainingSnapshot_UncoveredHistoryRowsExcluded] DEFAULT (N'[]'),
    [DuplicateRowsRemoved]         INT              NOT NULL CONSTRAINT [DF_TrainingSnapshot_DuplicateRowsRemoved] DEFAULT (0),
    [ClassBalance]                 NVARCHAR(MAX)    NULL,
    [DataCutoff]                   DATETIMEOFFSET   NOT NULL,
    [AssemblyCodeVersion]          NVARCHAR(200)    NOT NULL,
    CONSTRAINT [PK_TrainingSnapshot] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_TrainingSnapshot_ContentHash] UNIQUE ([ContentHash]),
    CONSTRAINT [FK_TrainingSnapshot_Pipeline] FOREIGN KEY ([PipelineID])
        REFERENCES [${flyway:defaultSchema}].[MLTrainingPipeline] ([ID]),
    CONSTRAINT [FK_TrainingSnapshot_PredictionUnit] FOREIGN KEY ([PredictionUnitID])
        REFERENCES [${flyway:defaultSchema}].[PredictionUnit] ([ID]),
    CONSTRAINT [FK_TrainingSnapshot_EvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
        REFERENCES [${flyway:defaultSchema}].[EvaluationProtocol] ([ID]),
    CONSTRAINT [FK_TrainingSnapshot_StorageProvider] FOREIGN KEY ([StorageProviderID])
        REFERENCES [${flyway:defaultSchema}].[FileStorageProvider] ([ID]),
    CONSTRAINT [FK_TrainingSnapshot_MatrixFile] FOREIGN KEY ([MatrixFileID])
        REFERENCES [${flyway:defaultSchema}].[File] ([ID]),
    CONSTRAINT [FK_TrainingSnapshot_RowManifestFile] FOREIGN KEY ([RowManifestFileID])
        REFERENCES [${flyway:defaultSchema}].[File] ([ID]),
    CONSTRAINT [FK_TrainingSnapshot_ProvenanceFile] FOREIGN KEY ([ProvenanceFileID])
        REFERENCES [${flyway:defaultSchema}].[File] ([ID]),
    CONSTRAINT [CK_TrainingSnapshot_ReadComplete] CHECK ([ReadComplete] = 1),
    CONSTRAINT [CK_TrainingSnapshot_HashLengths] CHECK (LEN([ContentHash]) = 64 AND LEN([MatrixSha256]) = 64 AND LEN([RowManifestSha256]) = 64 AND LEN([ProvenanceSha256]) = 64 AND LEN([FeatureSchemaHash]) = 64),
    CONSTRAINT [CK_TrainingSnapshot_Counts] CHECK ([ManifestRowCount] >= 0 AND [HoldoutRowCount] >= 0 AND [HoldoutRowCount] <= [ManifestRowCount] AND [RowsRead] >= [ManifestRowCount] AND [CensoredRowsExcluded] >= 0 AND [LabelKnownRowsExcluded] >= 0 AND [EmptyLabelRowsExcluded] >= 0 AND [DuplicateRowsRemoved] >= 0),
    CONSTRAINT [CK_TrainingSnapshot_Versions] CHECK ([LabelVersion] >= 1 AND [FeatureSpecVersion] >= 1)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A Training Snapshot: the frozen data one training run learned from — the feature matrix, the row manifest (row id, entity key, decision date, group key, period, role) and per-value provenance as three write-once files, plus the content hash that fingerprints them together with the unit, label, feature-spec and protocol versions. Immutable; identical assemblies share one snapshot (unique ContentHash). Retraining from a snapshot reproduces the run.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 (lower-case hex) of the canonical JSON of the three file hashes, the feature schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID and DataCutoff.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ContentHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The ML Training Pipeline whose feature spec was assembled.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'PipelineID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact Prediction Unit version whose rows were read.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'PredictionUnitID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The unit''s LabelVersion at assembly.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'LabelVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The pipeline Version whose FeatureSteps produced the feature spec.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSpecVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Evaluation Protocol version whose holdout rule assigned the manifest roles; NULL only for a legacy pipeline trained before its protocol was migrated.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'EvaluationProtocolID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The File Storage Provider holding the three files.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'StorageProviderID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Files row of matrix.jsonl (header line with column names, then one JSON array per manifest row).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'MatrixFileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the matrix file bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'MatrixSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of the matrix file in bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'MatrixSizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Files row of manifest.jsonl (one SnapshotRowKey per row; the locked-holdout rows are the stored holdout keys).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowManifestFileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the manifest file bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowManifestSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of the manifest file in bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowManifestSizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Files row of provenance.jsonl (for every row and column: source kind, source reference, source version, computed-at).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ProvenanceFileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the provenance file bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ProvenanceSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of the provenance file in bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ProvenanceSizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows in the manifest (development plus locked holdout).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ManifestRowCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Manifest rows with role locked-holdout.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'HoldoutRowCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of the resolved FeatureColumnSpec (name, dated source, encoding, missing-value policy) assembled.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSpec';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of matrix columns {name, encoding, sourceColumn} in matrix order.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSchema';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the canonical JSON of FeatureSchema; compared before scoring.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSchemaHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of ColumnProvenance: per matrix column, the source kind, source reference and source version.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ColumnProvenance';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of FeatureVersionPin for every Feature Value source read.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'PinnedFeatureVersions';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unit rows read from the source before exclusions; equals the source count (a truncated read is refused).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowsRead';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Always 1: a snapshot exists only for a complete read.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ReadComplete';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows excluded because their outcome window had not closed at DataCutoff.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'CensoredRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows excluded because their outcome was already recorded on or before the decision date (next-period rule).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'LabelKnownRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows excluded because their label was empty (NULL or an empty string) — unlabelled, never a class.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'EmptyLabelRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array {entity, field, rows}: rows excluded because a field''s change history did not cover their decision date (policy exclude-and-count).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'UncoveredHistoryRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows removed as exact duplicates of (entity key, decision date, period).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'DuplicateRowsRemoved';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array {label, rows} over manifest rows for classification tasks; NULL otherwise.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ClassBalance';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The censoring cutoff the unit resolved to for this assembly.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'DataCutoff';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Package version and git commit of the assembly code that built the snapshot.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'TrainingSnapshot', @level2type = N'COLUMN', @level2name = N'AssemblyCodeVersion';
GO

-- ============================================================================
-- 5. MLTrainingRun + snapshot, protocol, code version, compute seconds
-- ============================================================================
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun]
    ADD [TrainingSnapshotID]   UNIQUEIDENTIFIER NULL,
        [EvaluationProtocolID] UNIQUEIDENTIFIER NULL,
        [CodeVersion]          NVARCHAR(MAX)    NULL,
        [ComputeSeconds]       DECIMAL(18,3)    NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingRun]
    ADD CONSTRAINT [FK_MLTrainingRun_TrainingSnapshot] FOREIGN KEY ([TrainingSnapshotID])
            REFERENCES [${flyway:defaultSchema}].[TrainingSnapshot] ([ID]),
        CONSTRAINT [FK_MLTrainingRun_EvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
            REFERENCES [${flyway:defaultSchema}].[EvaluationProtocol] ([ID]),
        CONSTRAINT [CK_MLTrainingRun_ComputeSeconds] CHECK ([ComputeSeconds] >= 0);   -- NULL passes a CHECK on its own (UNKNOWN), so no IS NULL branch (migrations/CLAUDE.md)
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Training Snapshot this run trained on; NULL for a run refused before assembly and for runs before Predictive Studio 6.3.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingRun', @level2type = N'COLUMN', @level2name = N'TrainingSnapshotID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Evaluation Protocol version the run was graded under, pinned when the run started.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingRun', @level2type = N'COLUMN', @level2name = N'EvaluationProtocolID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CodeVersion: PS git commit, sidecar version, library versions, thread count and seed the run used.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingRun', @level2type = N'COLUMN', @level2name = N'CodeVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Measured trainer compute time in seconds, as returned by the sidecar.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingRun', @level2type = N'COLUMN', @level2name = N'ComputeSeconds';
GO

-- ============================================================================
-- 6. FeatureValue + effective dating and input as-of
-- ============================================================================
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD [EffectiveAsOf] DATETIMEOFFSET NULL,
        [InputAsOf]     DATETIMEOFFSET NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[FeatureValue]
    ADD CONSTRAINT [CK_FeatureValue_InputAsOf] CHECK ([InputAsOf] <= [EffectiveAsOf]);   -- either side NULL evaluates UNKNOWN and passes
GO
CREATE NONCLUSTERED INDEX [IX_FeatureValue_Entity_Feature_EffectiveAsOf]
    ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID], [FeatureName], [EffectiveAsOf])
    INCLUDE ([RecordID], [RecordProcessID]);
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Instant from which this value is the record''s value of the feature; as-of assembly reads the latest value with EffectiveAsOf at or before a row''s decision date. On a Source = Model row it is the scoring as-of date. NULL = not effective-dated (ineligible for as-of assembly).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'EffectiveAsOf';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Instant of the input data the value was computed from (its provenance); never after EffectiveAsOf.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FeatureValue', @level2type = N'COLUMN', @level2name = N'InputAsOf';
GO




























































/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and EntityField metadata for MJ: Prediction Units, MJ: Evaluation Protocols and
 * MJ: Training Snapshots; new fields of MJ: ML Training Pipelines, MJ: ML Training Runs and
 * MJ: Feature Values; base views, spCreate/spUpdate/spDelete, permissions, extended properties.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * ===================================================================================== */

/* SQL generated to create new entity MJ: Prediction Units */

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
         '8f160ccc-8743-40fe-b2b1-0799829cdbda',
         'MJ: Prediction Units',
         'Prediction Units',
         'A Prediction Unit: what one training row is (one grain record, or one grain record per period of a dated child entity), its decision date, the outcome rule and the window over which the outcome is observed, how unresolved rows are censored, and the declared task type. Every ML Training Pipeline references exactly one version. Versions are immutable rows: editing a unit inserts the next version with the same LineageRootID, so a trained model keeps pointing at the version it used.',
         NULL,
         'PredictionUnit',
         'vwPredictionUnits',
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

/* SQL generated to add new entity MJ: Prediction Units to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8f160ccc-8743-40fe-b2b1-0799829cdbda', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Prediction Units for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8f160ccc-8743-40fe-b2b1-0799829cdbda' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8f160ccc-8743-40fe-b2b1-0799829cdbda' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Prediction Units for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8f160ccc-8743-40fe-b2b1-0799829cdbda' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8f160ccc-8743-40fe-b2b1-0799829cdbda' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Prediction Units for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8f160ccc-8743-40fe-b2b1-0799829cdbda' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8f160ccc-8743-40fe-b2b1-0799829cdbda' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Evaluation Protocols */

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
         '0b0c469c-146c-4731-b064-ccb391d67889',
         'MJ: Evaluation Protocols',
         'Evaluation Protocols',
         'An Evaluation Protocol: the grading rules of a pipeline, saved before any candidate trains — the locked holdout, inner validation, primary proper score, fixed baselines, calibration, intervals, promotion rule and the three allowed outcomes (model, keep-simple-baseline, no-signal), the leakage audit, slices and budgets. Every training run references the exact version it was graded under. Versions are immutable rows; editing inserts the next version. Replaces the ValidationStrategy and LeakageGuard JSON of ML Training Pipelines.',
         NULL,
         'EvaluationProtocol',
         'vwEvaluationProtocols',
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

/* SQL generated to add new entity MJ: Evaluation Protocols to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0b0c469c-146c-4731-b064-ccb391d67889', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Evaluation Protocols for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0b0c469c-146c-4731-b064-ccb391d67889' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0b0c469c-146c-4731-b064-ccb391d67889' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Evaluation Protocols for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0b0c469c-146c-4731-b064-ccb391d67889' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0b0c469c-146c-4731-b064-ccb391d67889' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Evaluation Protocols for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('0b0c469c-146c-4731-b064-ccb391d67889' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0b0c469c-146c-4731-b064-ccb391d67889' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Training Snapshots */

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
         '947ff197-faaf-4557-ae52-6fdcf4313762',
         'MJ: Training Snapshots',
         'Training Snapshots',
         'A Training Snapshot: the frozen data one training run learned from — the feature matrix, the row manifest (row id, entity key, decision date, group key, period, role) and per-value provenance as three write-once files, plus the content hash that fingerprints them together with the unit, label, feature-spec and protocol versions. Immutable; identical assemblies share one snapshot (unique ContentHash). Retraining from a snapshot reproduces the run.',
         NULL,
         'TrainingSnapshot',
         'vwTrainingSnapshots',
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

/* SQL generated to add new entity MJ: Training Snapshots to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '947ff197-faaf-4557-ae52-6fdcf4313762', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Training Snapshots for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('947ff197-faaf-4557-ae52-6fdcf4313762' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('947ff197-faaf-4557-ae52-6fdcf4313762' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Training Snapshots for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('947ff197-faaf-4557-ae52-6fdcf4313762' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('947ff197-faaf-4557-ae52-6fdcf4313762' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Training Snapshots for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('947ff197-faaf-4557-ae52-6fdcf4313762' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('947ff197-faaf-4557-ae52-6fdcf4313762' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[PredictionUnit] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
UPDATE [${flyway:defaultSchema}].[PredictionUnit] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[PredictionUnit] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[PredictionUnit] ADD CONSTRAINT [DF___mj_PredictionUnit___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[PredictionUnit] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
UPDATE [${flyway:defaultSchema}].[PredictionUnit] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[PredictionUnit] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[PredictionUnit] ADD CONSTRAINT [DF___mj_PredictionUnit___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[TrainingSnapshot] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
UPDATE [${flyway:defaultSchema}].[TrainingSnapshot] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[TrainingSnapshot] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[TrainingSnapshot] ADD CONSTRAINT [DF___mj_TrainingSnapshot___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[TrainingSnapshot] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
UPDATE [${flyway:defaultSchema}].[TrainingSnapshot] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[TrainingSnapshot] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[TrainingSnapshot] ADD CONSTRAINT [DF___mj_TrainingSnapshot___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[EvaluationProtocol] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
UPDATE [${flyway:defaultSchema}].[EvaluationProtocol] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[EvaluationProtocol] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[EvaluationProtocol] ADD CONSTRAINT [DF___mj_EvaluationProtocol___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[EvaluationProtocol] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
UPDATE [${flyway:defaultSchema}].[EvaluationProtocol] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[EvaluationProtocol] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.EvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[EvaluationProtocol] ADD CONSTRAINT [DF___mj_EvaluationProtocol___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 94 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac8d46d3-b0a5-41cf-9a56-b9db7e2db126' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'ID')) BEGIN
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
            'ac8d46d3-b0a5-41cf-9a56-b9db7e2db126',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16564f1c-1781-4768-ac1b-a72c51d66b8b' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'LineageRootID')) BEGIN
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
            '16564f1c-1781-4768-ac1b-a72c51d66b8b',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'LineageRootID',
            'Lineage Root ID',
            'ID of version 1 of this unit. Version 1 points at itself; every later version points at version 1.',
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
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cae6fdce-1f4b-40d0-91b7-e781f0a9b500' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'Version')) BEGIN
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
            'cae6fdce-1f4b-40d0-91b7-e781f0a9b500',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'Version',
            'Version',
            'Version number within the lineage, starting at 1. A saved version is never updated.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b636042b-bc4b-4526-b70f-b7e40b43827c' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'Name')) BEGIN
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
            'b636042b-bc4b-4526-b70f-b7e40b43827c',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'Name',
            'Name',
            'Display name of the unit, e.g. "Member renewal (person x membership period)".',
            'nvarchar',
            510,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '054392d0-ecfa-4740-828a-02f6d873cbdf' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'Description')) BEGIN
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
            '054392d0-ecfa-4740-828a-02f6d873cbdf',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'Description',
            'Description',
            'What the unit predicts and for whom, in plain words.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f9d59e5-ddb8-4735-9aa5-7a342c82297a' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'UnitRows')) BEGIN
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
            '0f9d59e5-ddb8-4735-9aa5-7a342c82297a',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'UnitRows',
            'Unit Rows',
            'JSON UnitRows: {kind:"grain", grainEntity, decisionDate, filter} or {kind:"grain-x-periods", grainEntity, childEntity, foreignKey, periodDate, filter}. Defines what one row is and its decision date.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8eb9c42b-50e4-4144-a886-4d0b1c98f937' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'LabelRule')) BEGIN
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
            '8eb9c42b-50e4-4144-a886-4d0b1c98f937',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'LabelRule',
            'Label Rule',
            'JSON LabelRule: how the outcome of a row is read — a column on the row, the next period of the same grain record, or an event in a dated child entity — always within the window that starts LabelGapDays after the decision date and lasts LabelWindowDays.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a58ce37-8d6c-4161-871f-cb6397078a18' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'LabelWindowDays')) BEGIN
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
            '3a58ce37-8d6c-4161-871f-cb6397078a18',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'LabelWindowDays',
            'Label Window Days',
            'Length in days of the outcome window. A row whose window ends after the data cutoff is censored (excluded and counted).',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b029681-7b2a-4323-9b99-acc02501d4c4' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'LabelGapDays')) BEGIN
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
            '6b029681-7b2a-4323-9b99-acc02501d4c4',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'LabelGapDays',
            'Label Gap Days',
            'Days between the decision date and the start of the outcome window.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4456c4b2-ece1-4feb-9663-196541455543' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'TaskType')) BEGIN
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
            '4456c4b2-ece1-4feb-9663-196541455543',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'TaskType',
            'Task Type',
            'JSON TaskType: binary {classOrder, adverseIndex}, multiclass {classOrder, adverseIndices}, continuous, count, non-negative {tweediePower}, or forecast {valueKind}. Which class a score refers to and the adverse direction are derived from it, never stored separately.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df2df49b-2441-47b7-9cbf-c8173b62c7e7' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'LabelVersion')) BEGIN
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
            'df2df49b-2441-47b7-9cbf-c8173b62c7e7',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'LabelVersion',
            'Label Version',
            'Outcome-definition version: equals the previous version''s LabelVersion when LabelRule, LabelWindowDays, LabelGapDays and TaskType are unchanged, and that plus one otherwise.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd03dc2f6-bc4a-46f3-8c6f-7fc6ab0b1959' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'Censoring')) BEGIN
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
            'd03dc2f6-bc4a-46f3-8c6f-7fc6ab0b1959',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'Censoring',
            'Censoring',
            'JSON CensoringRule: {rule:"exclude-unresolved", cutoff} where cutoff is {kind:"corpus-end", entity, field}, {kind:"now"} or {kind:"fixed", at}. Rows whose outcome window has not closed at the cutoff are excluded and counted.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56dfcd6b-21df-4001-89af-077904c55961' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'ChangeHistoryPolicy')) BEGIN
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
            '56dfcd6b-21df-4001-89af-077904c55961',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'ChangeHistoryPolicy',
            'Change History Policy',
            'JSON ChangeHistoryPolicy: {onUncoveredRow:"refuse"|"exclude-and-count", externalSourceRows:"as-of-detection-time"|"ineligible"} — what as-of assembly does when a decision date precedes the change history of a field updated in place.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b65ec6c7-30e1-4e85-a131-94ac3eb7656b' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'GroupKey')) BEGIN
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
            'b65ec6c7-30e1-4e85-a131-94ac3eb7656b',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'GroupKey',
            'Group Key',
            'Field on the row whose value keeps one entity''s rows together in grouped folds and the new-entity report; NULL means the grain record key.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ab16416-1e1b-407d-b668-8337ca302dcb' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'TemporalSpec')) BEGIN
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
            '8ab16416-1e1b-407d-b668-8337ca302dcb',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'TemporalSpec',
            'Temporal Spec',
            'JSON TemporalSpec for series and panels: timeColumn, horizonPeriods, lags, rollingWindows, period, seasonality. Every lag and rolling-window endLag is at least horizonPeriods. Required when TaskType is forecast. Versioned with the unit.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06c64fc5-c28b-44ea-b302-e476e217e825' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'DecisionSpec')) BEGIN
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
            '06c64fc5-c28b-44ea-b302-e476e217e825',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'DecisionSpec',
            'Decision Spec',
            'JSON DecisionSpec: the action the prediction serves, the actor role, the capacity per period (for precision at capacity) and the period.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09145c46-36e1-454f-a3f6-58e1569c5704' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'IncumbentHeuristic')) BEGIN
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
            '09145c46-36e1-454f-a3f6-58e1569c5704',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'IncumbentHeuristic',
            'Incumbent Heuristic',
            'JSON IncumbentHeuristic: {kind:"none"} or {kind:"rule", name, scoreExpression} — today''s rule of thumb, scored as a named comparator on the same holdout.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c530988d-862c-4803-b13c-38d78d871542' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'AuthoredBy')) BEGIN
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
            'c530988d-862c-4803-b13c-38d78d871542',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'AuthoredBy',
            'Authored By',
            'JSON Actor who authored this version: {kind:"human", userId} (a user), or an automated author {kind:"agent", agentRunId}, {kind:"scheduled-job", scheduledJobRunId} or {kind:"system", component}.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f35fe58d-4a7f-4748-a485-7abe68e2901f' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f35fe58d-4a7f-4748-a485-7abe68e2901f',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e38afcd3-e459-4408-b8fe-993b0491a920' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e38afcd3-e459-4408-b8fe-993b0491a920',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1807678f-c46b-4845-ac96-8b34d2eede60' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ID')) BEGIN
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
            '1807678f-c46b-4845-ac96-8b34d2eede60',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0f6b242-8c4c-415f-904b-fc0ff1d82f27' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ContentHash')) BEGIN
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
            'a0f6b242-8c4c-415f-904b-fc0ff1d82f27',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ContentHash',
            'Content Hash',
            'SHA-256 (lower-case hex) of the canonical JSON of the three file hashes, the feature schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID and DataCutoff.',
            'nvarchar',
            128,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b378836d-e724-4f0b-8041-81facdec8644' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'PipelineID')) BEGIN
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
            'b378836d-e724-4f0b-8041-81facdec8644',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'PipelineID',
            'Pipeline ID',
            'The ML Training Pipeline whose feature spec was assembled.',
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
            '703FD109-331B-438D-902B-8E4A93C3F6AA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7caf679b-4a83-45e4-be1f-5fea308ed03a' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'PredictionUnitID')) BEGIN
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
            '7caf679b-4a83-45e4-be1f-5fea308ed03a',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'PredictionUnitID',
            'Prediction Unit ID',
            'The exact Prediction Unit version whose rows were read.',
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
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2fe84cf-e581-4ba2-b5ab-61d43cfd7fd2' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'LabelVersion')) BEGIN
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
            'd2fe84cf-e581-4ba2-b5ab-61d43cfd7fd2',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'LabelVersion',
            'Label Version',
            'The unit''s LabelVersion at assembly.',
            'int',
            4,
            10,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fb556d7-dc88-4e58-a113-9c394805138c' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'FeatureSpecVersion')) BEGIN
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
            '9fb556d7-dc88-4e58-a113-9c394805138c',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'FeatureSpecVersion',
            'Feature Spec Version',
            'The pipeline Version whose FeatureSteps produced the feature spec.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9587f907-23ee-4f46-a8bf-18da1cd112fb' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '9587f907-23ee-4f46-a8bf-18da1cd112fb',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'EvaluationProtocolID',
            'Evaluation Protocol ID',
            'The Evaluation Protocol version whose holdout rule assigned the manifest roles; NULL only for a legacy pipeline trained before its protocol was migrated.',
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
            '0B0C469C-146C-4731-B064-CCB391D67889',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78e9f5e7-af2a-46d5-9305-6ae12b29b283' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'StorageProviderID')) BEGIN
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
            '78e9f5e7-af2a-46d5-9305-6ae12b29b283',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'StorageProviderID',
            'Storage Provider ID',
            'The File Storage Provider holding the three files.',
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
            '28248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '081c2c3d-f102-4fbf-af31-bd8c435427f8' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'MatrixFileID')) BEGIN
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
            '081c2c3d-f102-4fbf-af31-bd8c435427f8',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'MatrixFileID',
            'Matrix File ID',
            'MJ: Files row of matrix.jsonl (header line with column names, then one JSON array per manifest row).',
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
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52f24c48-931c-4212-8bf3-dde543971714' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'MatrixSha256')) BEGIN
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
            '52f24c48-931c-4212-8bf3-dde543971714',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'MatrixSha256',
            'Matrix Sha 256',
            'SHA-256 of the matrix file bytes.',
            'nvarchar',
            128,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ba05957-d3fb-4043-b0bf-d4c76c5fa993' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'MatrixSizeBytes')) BEGIN
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
            '1ba05957-d3fb-4043-b0bf-d4c76c5fa993',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'MatrixSizeBytes',
            'Matrix Size Bytes',
            'Size of the matrix file in bytes.',
            'bigint',
            8,
            19,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '996b9364-8c11-4046-902d-aee414f3c7bd' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'RowManifestFileID')) BEGIN
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
            '996b9364-8c11-4046-902d-aee414f3c7bd',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'RowManifestFileID',
            'Row Manifest File ID',
            'MJ: Files row of manifest.jsonl (one SnapshotRowKey per row; the locked-holdout rows are the stored holdout keys).',
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
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6616e878-29b1-4f7a-a84c-df4c9d3f7710' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'RowManifestSha256')) BEGIN
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
            '6616e878-29b1-4f7a-a84c-df4c9d3f7710',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'RowManifestSha256',
            'Row Manifest Sha 256',
            'SHA-256 of the manifest file bytes.',
            'nvarchar',
            128,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9690459-17d5-46a3-87da-33624beafdf1' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'RowManifestSizeBytes')) BEGIN
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
            'f9690459-17d5-46a3-87da-33624beafdf1',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'RowManifestSizeBytes',
            'Row Manifest Size Bytes',
            'Size of the manifest file in bytes.',
            'bigint',
            8,
            19,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f468fee-462c-4a24-8db2-afdb40718b8d' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ProvenanceFileID')) BEGIN
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
            '6f468fee-462c-4a24-8db2-afdb40718b8d',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ProvenanceFileID',
            'Provenance File ID',
            'MJ: Files row of provenance.jsonl (for every row and column: source kind, source reference, source version, computed-at).',
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
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9bf5e7d-113a-45d5-bf30-3b0d5166bb5f' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ProvenanceSha256')) BEGIN
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
            'f9bf5e7d-113a-45d5-bf30-3b0d5166bb5f',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ProvenanceSha256',
            'Provenance Sha 256',
            'SHA-256 of the provenance file bytes.',
            'nvarchar',
            128,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2ef30714-7e7b-47df-a10f-cd6966c7f945' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ProvenanceSizeBytes')) BEGIN
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
            '2ef30714-7e7b-47df-a10f-cd6966c7f945',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ProvenanceSizeBytes',
            'Provenance Size Bytes',
            'Size of the provenance file in bytes.',
            'bigint',
            8,
            19,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b7b804d-3522-4a64-9c45-ed33e2578277' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ManifestRowCount')) BEGIN
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
            '1b7b804d-3522-4a64-9c45-ed33e2578277',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ManifestRowCount',
            'Manifest Row Count',
            'Rows in the manifest (development plus locked holdout).',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb2935ae-7b24-4b97-beab-74e031ea5a7d' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'HoldoutRowCount')) BEGIN
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
            'eb2935ae-7b24-4b97-beab-74e031ea5a7d',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'HoldoutRowCount',
            'Holdout Row Count',
            'Manifest rows with role locked-holdout.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47ee8ba7-1287-4e84-94c1-28e31aafeec7' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'FeatureSpec')) BEGIN
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
            '47ee8ba7-1287-4e84-94c1-28e31aafeec7',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'FeatureSpec',
            'Feature Spec',
            'JSON array of the resolved FeatureColumnSpec (name, dated source, encoding, missing-value policy) assembled.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ff74780-54eb-4a27-ae70-88f968372b1f' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'FeatureSchema')) BEGIN
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
            '3ff74780-54eb-4a27-ae70-88f968372b1f',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'FeatureSchema',
            'Feature Schema',
            'JSON array of matrix columns {name, encoding, sourceColumn} in matrix order.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '825f178d-8871-49f5-a757-51b81e8dc0b2' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'FeatureSchemaHash')) BEGIN
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
            '825f178d-8871-49f5-a757-51b81e8dc0b2',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'FeatureSchemaHash',
            'Feature Schema Hash',
            'SHA-256 of the canonical JSON of FeatureSchema; compared before scoring.',
            'nvarchar',
            128,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd182b640-205c-400d-bac8-aa5b0a418af7' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ColumnProvenance')) BEGIN
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
            'd182b640-205c-400d-bac8-aa5b0a418af7',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ColumnProvenance',
            'Column Provenance',
            'JSON array of ColumnProvenance: per matrix column, the source kind, source reference and source version.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2facffdf-87d1-40a6-9444-bfd3ada2cfae' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'PinnedFeatureVersions')) BEGIN
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
            '2facffdf-87d1-40a6-9444-bfd3ada2cfae',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'PinnedFeatureVersions',
            'Pinned Feature Versions',
            'JSON array of FeatureVersionPin for every Feature Value source read.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '[]',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0fb3bfc-91a9-4258-93c8-d22c5ea96978' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'RowsRead')) BEGIN
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
            'a0fb3bfc-91a9-4258-93c8-d22c5ea96978',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'RowsRead',
            'Rows Read',
            'Unit rows read from the source before exclusions; equals the source count (a truncated read is refused).',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e85ae20a-f1f0-40ca-9398-8b9d274c4894' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ReadComplete')) BEGIN
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
            'e85ae20a-f1f0-40ca-9398-8b9d274c4894',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ReadComplete',
            'Read Complete',
            'Always 1: a snapshot exists only for a complete read.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54ffb93e-2bad-43b5-be78-7c1344724c67' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'CensoredRowsExcluded')) BEGIN
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
            '54ffb93e-2bad-43b5-be78-7c1344724c67',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'CensoredRowsExcluded',
            'Censored Rows Excluded',
            'Rows excluded because their outcome window had not closed at DataCutoff.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd45567a0-364f-4cbf-8cfc-f4b2366bd49d' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'LabelKnownRowsExcluded')) BEGIN
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
            'd45567a0-364f-4cbf-8cfc-f4b2366bd49d',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'LabelKnownRowsExcluded',
            'Label Known Rows Excluded',
            'Rows excluded because their outcome was already recorded on or before the decision date (next-period rule).',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8efd75ec-e558-46de-b701-73b6676792ce' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'EmptyLabelRowsExcluded')) BEGIN
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
            '8efd75ec-e558-46de-b701-73b6676792ce',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'EmptyLabelRowsExcluded',
            'Empty Label Rows Excluded',
            'Rows excluded because their label was empty (NULL or an empty string) — unlabelled, never a class.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15764390-a402-46f5-9937-4b532d72c0d1' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'UncoveredHistoryRowsExcluded')) BEGIN
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
            '15764390-a402-46f5-9937-4b532d72c0d1',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'UncoveredHistoryRowsExcluded',
            'Uncovered History Rows Excluded',
            'JSON array {entity, field, rows}: rows excluded because a field''s change history did not cover their decision date (policy exclude-and-count).',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '[]',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd4bcbdc-40f8-48da-9805-743bb3d67fcb' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'DuplicateRowsRemoved')) BEGIN
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
            'dd4bcbdc-40f8-48da-9805-743bb3d67fcb',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'DuplicateRowsRemoved',
            'Duplicate Rows Removed',
            'Rows removed as exact duplicates of (entity key, decision date, period).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '747d5d3c-9f5e-4d04-acb2-2ec279ec9a50' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ClassBalance')) BEGIN
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
            '747d5d3c-9f5e-4d04-acb2-2ec279ec9a50',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ClassBalance',
            'Class Balance',
            'JSON array {label, rows} over manifest rows for classification tasks; NULL otherwise.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b6f7084-15b3-456e-bca2-91ecd6442599' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'DataCutoff')) BEGIN
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
            '3b6f7084-15b3-456e-bca2-91ecd6442599',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'DataCutoff',
            'Data Cutoff',
            'The censoring cutoff the unit resolved to for this assembly.',
            'datetimeoffset',
            10,
            34,
            7,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1aed42f4-e861-4158-8ee7-11f8d3ccc7bc' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'AssemblyCodeVersion')) BEGIN
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
            '1aed42f4-e861-4158-8ee7-11f8d3ccc7bc',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'AssemblyCodeVersion',
            'Assembly Code Version',
            'Package version and git commit of the assembly code that built the snapshot.',
            'nvarchar',
            400,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0cb2ebe-9e53-40db-9007-cb287d8ac3b3' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd0cb2ebe-9e53-40db-9007-cb287d8ac3b3',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '878b22ab-4f36-4fab-8ec8-cc3c359610a2' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '878b22ab-4f36-4fab-8ec8-cc3c359610a2',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce8b8910-7580-452f-8dba-b0b99d24379c' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'TrainingSnapshotID')) BEGIN
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
            'ce8b8910-7580-452f-8dba-b0b99d24379c',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'TrainingSnapshotID',
            'Training Snapshot ID',
            'The Training Snapshot this run trained on; NULL for a run refused before assembly and for runs before Predictive Studio 6.3.',
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
            '947FF197-FAAF-4557-AE52-6FDCF4313762',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4639bf78-3a72-4a69-9299-c5c6f5a24f68' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '4639bf78-3a72-4a69-9299-c5c6f5a24f68',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'EvaluationProtocolID',
            'Evaluation Protocol ID',
            'The Evaluation Protocol version the run was graded under, pinned when the run started.',
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
            '0B0C469C-146C-4731-B064-CCB391D67889',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '980d96a7-29a4-4e06-986c-823eccbbedec' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'CodeVersion')) BEGIN
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
            '980d96a7-29a4-4e06-986c-823eccbbedec',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'CodeVersion',
            'Code Version',
            'JSON CodeVersion: PS git commit, sidecar version, library versions, thread count and seed the run used.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa666c1a-8280-4dbb-b5e2-1959185725d9' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ComputeSeconds')) BEGIN
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
            'aa666c1a-8280-4dbb-b5e2-1959185725d9',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'ComputeSeconds',
            'Compute Seconds',
            'Measured trainer compute time in seconds, as returned by the sidecar.',
            'decimal',
            9,
            18,
            3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ceec4f5-82f2-465d-a196-263a555a9274' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'EffectiveAsOf')) BEGIN
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
            '7ceec4f5-82f2-465d-a196-263a555a9274',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'EffectiveAsOf',
            'Effective As Of',
            'Instant from which this value is the record''s value of the feature; as-of assembly reads the latest value with EffectiveAsOf at or before a row''s decision date. On a Source = Model row it is the scoring as-of date. NULL = not effective-dated (ineligible for as-of assembly).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6312095-3040-470c-8e28-7096e2ae6766' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'InputAsOf')) BEGIN
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
            'f6312095-3040-470c-8e28-7096e2ae6766',
            '3BED585D-B150-4899-AB06-8A19624EA9BE', -- Entity: MJ: Feature Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3BED585D-B150-4899-AB06-8A19624EA9BE'),
            'InputAsOf',
            'Input As Of',
            'Instant of the input data the value was computed from (its provenance); never after EffectiveAsOf.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a27b360-4935-48b6-a46a-62f39fff939c' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'PredictionUnitID')) BEGIN
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
            '3a27b360-4935-48b6-a46a-62f39fff939c',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA'),
            'PredictionUnitID',
            'Prediction Unit ID',
            'The exact Prediction Unit version this pipeline trains on. NULL only on a pipeline created before Predictive Studio 6.3 that has not been migrated; such a pipeline cannot be trained.',
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
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b14e812-7b20-493a-ad29-53afe948e662' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '6b14e812-7b20-493a-ad29-53afe948e662',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA'),
            'EvaluationProtocolID',
            'Evaluation Protocol ID',
            'The exact Evaluation Protocol version every training run of this pipeline is graded under. Its primary score family must equal the unit''s task kind.',
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
            '0B0C469C-146C-4731-B064-CCB391D67889',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '820307ad-a880-43f9-bf4f-b372952280a2' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'ID')) BEGIN
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
            '820307ad-a880-43f9-bf4f-b372952280a2',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '681c028a-cc37-40cf-93a2-184dd7848fdc' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'LineageRootID')) BEGIN
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
            '681c028a-cc37-40cf-93a2-184dd7848fdc',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'LineageRootID',
            'Lineage Root ID',
            'ID of version 1 of this protocol. Version 1 points at itself.',
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
            '0B0C469C-146C-4731-B064-CCB391D67889',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb775e4a-b311-47d4-ae71-e5373574fe88' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Version')) BEGIN
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
            'bb775e4a-b311-47d4-ae71-e5373574fe88',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Version',
            'Version',
            'Version number within the lineage, starting at 1. A saved version is never updated.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbe9c397-250a-4f9f-be6f-3ae4a08068a7' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Name')) BEGIN
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
            'bbe9c397-250a-4f9f-be6f-3ae4a08068a7',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Name',
            'Name',
            'Display name of the protocol.',
            'nvarchar',
            510,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56bade9a-c2d3-4864-aa87-83f5939f0636' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Description')) BEGIN
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
            '56bade9a-c2d3-4864-aa87-83f5939f0636',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Description',
            'Description',
            'What the protocol is for, in plain words.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '836279d3-a61f-4743-8ead-48dfe3a7abf6' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Holdout')) BEGIN
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
            '836279d3-a61f-4743-8ead-48dfe3a7abf6',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Holdout',
            'Holdout',
            'JSON HoldoutSplit (guard field): {kind:"date-carved", dateColumn, cutoff, holdoutEnd, newEntityReport} or {kind:"rolling-origin", origins (>= 5), horizonPeriods, gapPeriods, minTrainPeriods, window}.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e6c119f-6339-4b5d-bdae-fe1182e077ae' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'InnerValidation')) BEGIN
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
            '5e6c119f-6339-4b5d-bdae-fe1182e077ae',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'InnerValidation',
            'Inner Validation',
            'JSON InnerValidation over development rows only: repeated-stratified-kfold, grouped-kfold or blocked-time.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6e2d51e-7143-45ba-8f9d-cc4b141cf0db' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Seed')) BEGIN
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
            'f6e2d51e-7143-45ba-8f9d-cc4b141cf0db',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Seed',
            'Seed',
            'Random seed for every split, fold, bootstrap and estimator of a run under this protocol.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5478ce75-7a40-437e-aac8-c15dbd5152bc' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'HoldoutAccessBudget')) BEGIN
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
            '5478ce75-7a40-437e-aac8-c15dbd5152bc',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'HoldoutAccessBudget',
            'Holdout Access Budget',
            'How many times the locked holdout may be scored per run: always 1, for one declared finalist.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df7406bd-4dea-4fcb-a946-b66575ed6ecf' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'PrimaryScore')) BEGIN
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
            'df7406bd-4dea-4fcb-a946-b66575ed6ecf',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'PrimaryScore',
            'Primary Score',
            'JSON ProperScore {family, metric}: the only metric that ranks candidates and gates outcomes. Its family must equal the pipeline unit''s task kind.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e70a771f-996d-4ead-96ff-fcc8a007fc65' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'SecondaryMetrics')) BEGIN
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
            'e70a771f-996d-4ead-96ff-fcc8a007fc65',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'SecondaryMetrics',
            'Secondary Metrics',
            'JSON array of secondary metric keys (auc, accuracy, f1, precision, recall, r2, calibration-slope); reported with intervals, never used to rank.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a09da5da-31b6-44bf-a4e8-49929b094a3c' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Baselines')) BEGIN
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
            'a09da5da-31b6-44bf-a4e8-49929b094a3c',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Baselines',
            'Baselines',
            'JSON array of BaselineSpec fitted on every run: dummy, one-feature, glm, naive, seasonal-naive, incumbent-heuristic.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f99d3e0-6b55-4ef4-9f35-c9c2ceb55117' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Calibration')) BEGIN
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
            '4f99d3e0-6b55-4ef4-9f35-c9c2ceb55117',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Calibration',
            'Calibration',
            'JSON CalibrationMethod: platt, isotonic or auto, always fit on a disjoint calibration fold; not-applicable for regression.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3f04860-eb0e-4a3a-9714-88485b0e814c' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Resampling')) BEGIN
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
            'f3f04860-eb0e-4a3a-9714-88485b0e814c',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Resampling',
            'Resampling',
            'JSON ResamplingSpec: {kind:"none"} or {kind:"in-fold", method}; resampling never touches holdout rows.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ec9e06b-1b67-445b-bd73-fda680082832' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Intervals')) BEGIN
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
            '6ec9e06b-1b67-445b-bd73-fda680082832',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Intervals',
            'Intervals',
            'JSON IntervalSpec: level 0.95, method, resamples and the paired test for model-versus-comparator differences.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b44f0713-9f1e-4966-9863-7e72f5d0ec61' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Promotion')) BEGIN
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
            'b44f0713-9f1e-4966-9863-7e72f5d0ec61',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Promotion',
            'Promotion',
            'JSON PromotionRule (guard field): comparators, incumbent, margin (>= 0), lowerBoundLevel 0.95, pairedOn same-holdout-rows, decisionTable Q13+Q14+Q15.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c44eb743-e9d9-4b5a-a2f9-7027d7838435' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'AllowedOutcomes')) BEGIN
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
            'c44eb743-e9d9-4b5a-a2f9-7027d7838435',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'AllowedOutcomes',
            'Allowed Outcomes',
            'JSON array, exactly ["model","keep-simple-baseline","no-signal"]: a protocol cannot omit no-signal.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e327b941-d09f-44f7-8b92-6c04af6e4624' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'LeakageAudit')) BEGIN
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
            'e327b941-d09f-44f7-8b92-6c04af6e4624',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'LeakageAudit',
            'Leakage Audit',
            'JSON LeakageAuditSpec (guard field): held-out single-feature AUC ceiling, time-shifted-label test, drop-column test, per-source-column importance aggregation, high-cardinality ID check.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d4787c0-84e4-4841-9b5b-839c4c52ab9f' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Exclusions')) BEGIN
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
            '8d4787c0-84e4-4841-9b5b-839c4c52ab9f',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Exclusions',
            'Exclusions',
            'JSON ProtocolExclusions (guard field): {denyFields, denySources} — columns and sources that never enter the feature matrix (the former LeakageGuard deny lists).',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '079ee702-e829-472e-8ec6-39db7e068a09' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Slices')) BEGIN
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
            '079ee702-e829-472e-8ec6-39db7e068a09',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Slices',
            'Slices',
            'JSON SliceSpec: {outOfTime, subgroups} — each slice is reported with the primary score and its interval.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a7819fd-80e0-454e-9df1-a7cec246417b' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'PredictionIntervals')) BEGIN
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
            '1a7819fd-80e0-454e-9df1-a7cec246417b',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'PredictionIntervals',
            'Prediction Intervals',
            'JSON PredictionIntervalSpec {method, nominalCoverage} for continuous, count and non-negative tasks; NULL when not requested.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d2a5640-5a7e-4d60-9ad0-b36266d2c683' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'ResidualDiagnostics')) BEGIN
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
            '4d2a5640-5a7e-4d60-9ad0-b36266d2c683',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'ResidualDiagnostics',
            'Residual Diagnostics',
            'JSON ResidualDiagnosticsSpec {acfLags, ljungBoxAlpha} for series and panels; NULL otherwise.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e499134d-e42c-49e5-81cf-e071ba2167a7' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'RetrainTriggers')) BEGIN
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
            'e499134d-e42c-49e5-81cf-e071ba2167a7',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'RetrainTriggers',
            'Retrain Triggers',
            'JSON array of RetrainTrigger declared for monitoring (outcome-degradation, calibration-drift).',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55f5fc86-9ab7-49ee-86ca-c39fbf3fad01' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'SearchStrategy')) BEGIN
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
            '55f5fc86-9ab7-49ee-86ca-c39fbf3fad01',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'SearchStrategy',
            'Search Strategy',
            'JSON SearchStrategy: {kind:"random", candidates} or {kind:"guided", method, equalCostComparisonId}.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a73475e3-3866-43c0-badc-2e64f59e1332' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'Budgets')) BEGIN
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
            'a73475e3-3866-43c0-badc-2e64f59e1332',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'Budgets',
            'Budgets',
            'JSON Budgets (guard field): maxComputeSeconds, maxTokens, maxCandidates, hardStop true.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d43d765-a3e4-4a3a-a14f-1a2c69dbb03d' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'MinMinorityClassRows')) BEGIN
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
            '2d43d765-a3e4-4a3a-a14f-1a2c69dbb03d',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'MinMinorityClassRows',
            'Min Minority Class Rows',
            'Smallest minority-class row count in the locked holdout for which a classification gate may return model; below it the gate cannot ship a model.',
            'int',
            4,
            10,
            0,
            0,
            '(20)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edf32039-d2df-4f3b-b762-4a557587d08a' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'GuardFieldsEditableBy')) BEGIN
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
            'edf32039-d2df-4f3b-b762-4a557587d08a',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'GuardFieldsEditableBy',
            'Guard Fields Editable By',
            'Who may change the guard fields (Holdout, Promotion, LeakageAudit, Exclusions, Budgets and this setting) in the next version: non-agent (default: any author except an agent tool call — a user, a non-agent API caller, a scheduled job or the system) or human-only (optional: only a version authored by a user). Every author''s version passes the same guard-field validation.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'non-agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e34f94c-3832-48e8-ae65-a3a923015091' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'AuthoredBy')) BEGIN
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
            '0e34f94c-3832-48e8-ae65-a3a923015091',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'AuthoredBy',
            'Authored By',
            'JSON Actor who authored this version.',
            'nvarchar',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eaa27903-181e-4cae-b5f1-dc9e09a95b99' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = '__mj_CreatedAt')) BEGIN
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
            'eaa27903-181e-4cae-b5f1-dc9e09a95b99',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b2e5762-cbcc-4297-b56a-e260eb9bc88d' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0b2e5762-cbcc-4297-b56a-e260eb9bc88d',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
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

/* SQL text to insert entity field value with ID f19d6270-4660-4cd1-9fca-8271db091ec2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f19d6270-4660-4cd1-9fca-8271db091ec2', '5478CE75-7A40-437E-AAC8-C15DBD5152BC', 1, '1', '1', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5478CE75-7A40-437E-AAC8-C15DBD5152BC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5478CE75-7A40-437E-AAC8-C15DBD5152BC';

/* SQL text to insert entity field value with ID 26613025-f286-4759-aab5-75fa53d7b30a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('26613025-f286-4759-aab5-75fa53d7b30a', 'EDF32039-D2DF-4F3B-B762-4A557587D08A', 1, 'human-only', 'human-only', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0b29fb9a-2aba-46d3-ba77-926f69c35f9a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0b29fb9a-2aba-46d3-ba77-926f69c35f9a', 'EDF32039-D2DF-4F3B-B762-4A557587D08A', 2, 'non-agent', 'non-agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID EDF32039-D2DF-4F3B-B762-4A557587D08A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='EDF32039-D2DF-4F3B-B762-4A557587D08A';

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


/* Create Entity Relationship: MJ: Prediction Units -> MJ: Prediction Units (One To Many via LineageRootID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '84866504-0049-49b2-86c4-065090712992'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('84866504-0049-49b2-86c4-065090712992', '8F160CCC-8743-40FE-B2B1-0799829CDBDA', '8F160CCC-8743-40FE-B2B1-0799829CDBDA', 'LineageRootID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Prediction Units -> MJ: Training Snapshots (One To Many via PredictionUnitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '570e4488-f5f9-48ec-9932-7d7f8909c6f5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('570e4488-f5f9-48ec-9932-7d7f8909c6f5', '8F160CCC-8743-40FE-B2B1-0799829CDBDA', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'PredictionUnitID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Prediction Units -> MJ: ML Training Pipelines (One To Many via PredictionUnitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f319794c-50f4-489e-8d78-631578fb6bad'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f319794c-50f4-489e-8d78-631578fb6bad', '8F160CCC-8743-40FE-B2B1-0799829CDBDA', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'PredictionUnitID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: File Storage Providers -> MJ: Training Snapshots (One To Many via StorageProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'aceceb45-6055-499b-b06c-798ab23a1405'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('aceceb45-6055-499b-b06c-798ab23a1405', '28248F34-2837-EF11-86D4-6045BDEE16E6', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'StorageProviderID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: Training Snapshots (One To Many via MatrixFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c30ee404-9f54-40f1-8391-06a719bf742c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c30ee404-9f54-40f1-8391-06a719bf742c', '29248F34-2837-EF11-86D4-6045BDEE16E6', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'MatrixFileID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Files -> MJ: Training Snapshots (One To Many via RowManifestFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '07990eee-9c18-4fd8-914a-542bd53756e0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('07990eee-9c18-4fd8-914a-542bd53756e0', '29248F34-2837-EF11-86D4-6045BDEE16E6', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'RowManifestFileID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Files -> MJ: Training Snapshots (One To Many via ProvenanceFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8fc17b55-b69b-4968-ab73-469a47ea179e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8fc17b55-b69b-4968-ab73-469a47ea179e', '29248F34-2837-EF11-86D4-6045BDEE16E6', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'ProvenanceFileID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Training Snapshots -> MJ: ML Training Runs (One To Many via TrainingSnapshotID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '17c429f6-4b47-4961-99d3-de2362b2eba6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('17c429f6-4b47-4961-99d3-de2362b2eba6', '947FF197-FAAF-4557-AE52-6FDCF4313762', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'TrainingSnapshotID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: Training Snapshots (One To Many via PipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '662a5ed6-8dfd-4cf0-ab6b-d89c7f0bbe42'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('662a5ed6-8dfd-4cf0-ab6b-d89c7f0bbe42', '703FD109-331B-438D-902B-8E4A93C3F6AA', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'PipelineID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Evaluation Protocols -> MJ: Training Snapshots (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'df5595e1-63ee-4daf-a35d-417583c88869'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('df5595e1-63ee-4daf-a35d-417583c88869', '0B0C469C-146C-4731-B064-CCB391D67889', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'EvaluationProtocolID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Evaluation Protocols -> MJ: ML Training Runs (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '33ee0639-0900-4e03-b9ea-d8f5c2415ce2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('33ee0639-0900-4e03-b9ea-d8f5c2415ce2', '0B0C469C-146C-4731-B064-CCB391D67889', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'EvaluationProtocolID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Evaluation Protocols -> MJ: ML Training Pipelines (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8d8e97dc-dd35-4eb5-a367-f9104ab05eea'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8d8e97dc-dd35-4eb5-a367-f9104ab05eea', '0B0C469C-146C-4731-B064-CCB391D67889', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'EvaluationProtocolID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Evaluation Protocols -> MJ: Evaluation Protocols (One To Many via LineageRootID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '88b324c3-1b56-4641-b38f-54de6d8e3d94'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('88b324c3-1b56-4641-b38f-54de6d8e3d94', '0B0C469C-146C-4731-B064-CCB391D67889', '0B0C469C-146C-4731-B064-CCB391D67889', 'LineageRootID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EvaluationProtocol */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Evaluation Protocols
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key LineageRootID in table EvaluationProtocol
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EvaluationProtocol_LineageRootID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EvaluationProtocol]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EvaluationProtocol_LineageRootID ON [${flyway:defaultSchema}].[EvaluationProtocol] ([LineageRootID]);

/* SQL text to update entity field related entity name field map for entity field ID 681C028A-CC37-40CF-93A2-184DD7848FDC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='681C028A-CC37-40CF-93A2-184DD7848FDC', @RelatedEntityNameFieldMap='LineageRoot';

/* Base View SQL for MJ: Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Evaluation Protocols
-- Item: vwEvaluationProtocols
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Evaluation Protocols
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EvaluationProtocol
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEvaluationProtocols]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEvaluationProtocols];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEvaluationProtocols]
AS
SELECT
    e.*,
    MJEvaluationProtocol_LineageRootID.[Name] AS [LineageRoot]
FROM
    [${flyway:defaultSchema}].[EvaluationProtocol] AS e
INNER JOIN
    [${flyway:defaultSchema}].[EvaluationProtocol] AS MJEvaluationProtocol_LineageRootID
  ON
    [e].[LineageRootID] = MJEvaluationProtocol_LineageRootID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEvaluationProtocols] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Evaluation Protocols
-- Item: Permissions for vwEvaluationProtocols
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEvaluationProtocols] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Evaluation Protocols
-- Item: spCreateEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEvaluationProtocol]
    @ID uniqueidentifier = NULL,
    @LineageRootID uniqueidentifier,
    @Version int,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Holdout nvarchar(MAX),
    @InnerValidation nvarchar(MAX),
    @Seed int,
    @HoldoutAccessBudget int = NULL,
    @PrimaryScore nvarchar(MAX),
    @SecondaryMetrics nvarchar(MAX),
    @Baselines nvarchar(MAX),
    @Calibration nvarchar(MAX),
    @Resampling nvarchar(MAX),
    @Intervals nvarchar(MAX),
    @Promotion nvarchar(MAX),
    @AllowedOutcomes nvarchar(MAX),
    @LeakageAudit nvarchar(MAX),
    @Exclusions nvarchar(MAX),
    @Slices nvarchar(MAX),
    @PredictionIntervals_Clear bit = 0,
    @PredictionIntervals nvarchar(MAX) = NULL,
    @ResidualDiagnostics_Clear bit = 0,
    @ResidualDiagnostics nvarchar(MAX) = NULL,
    @RetrainTriggers nvarchar(MAX),
    @SearchStrategy nvarchar(MAX),
    @Budgets nvarchar(MAX),
    @MinMinorityClassRows int = NULL,
    @GuardFieldsEditableBy nvarchar(20) = NULL,
    @AuthoredBy nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EvaluationProtocol]
            (
                [ID],
                [LineageRootID],
                [Version],
                [Name],
                [Description],
                [Holdout],
                [InnerValidation],
                [Seed],
                [HoldoutAccessBudget],
                [PrimaryScore],
                [SecondaryMetrics],
                [Baselines],
                [Calibration],
                [Resampling],
                [Intervals],
                [Promotion],
                [AllowedOutcomes],
                [LeakageAudit],
                [Exclusions],
                [Slices],
                [PredictionIntervals],
                [ResidualDiagnostics],
                [RetrainTriggers],
                [SearchStrategy],
                [Budgets],
                [MinMinorityClassRows],
                [GuardFieldsEditableBy],
                [AuthoredBy]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @LineageRootID,
                @Version,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Holdout,
                @InnerValidation,
                @Seed,
                ISNULL(@HoldoutAccessBudget, 1),
                @PrimaryScore,
                @SecondaryMetrics,
                @Baselines,
                @Calibration,
                @Resampling,
                @Intervals,
                @Promotion,
                @AllowedOutcomes,
                @LeakageAudit,
                @Exclusions,
                @Slices,
                CASE WHEN @PredictionIntervals_Clear = 1 THEN NULL ELSE ISNULL(@PredictionIntervals, NULL) END,
                CASE WHEN @ResidualDiagnostics_Clear = 1 THEN NULL ELSE ISNULL(@ResidualDiagnostics, NULL) END,
                @RetrainTriggers,
                @SearchStrategy,
                @Budgets,
                ISNULL(@MinMinorityClassRows, 20),
                ISNULL(@GuardFieldsEditableBy, 'non-agent'),
                @AuthoredBy
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EvaluationProtocol]
            (
                [LineageRootID],
                [Version],
                [Name],
                [Description],
                [Holdout],
                [InnerValidation],
                [Seed],
                [HoldoutAccessBudget],
                [PrimaryScore],
                [SecondaryMetrics],
                [Baselines],
                [Calibration],
                [Resampling],
                [Intervals],
                [Promotion],
                [AllowedOutcomes],
                [LeakageAudit],
                [Exclusions],
                [Slices],
                [PredictionIntervals],
                [ResidualDiagnostics],
                [RetrainTriggers],
                [SearchStrategy],
                [Budgets],
                [MinMinorityClassRows],
                [GuardFieldsEditableBy],
                [AuthoredBy]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @LineageRootID,
                @Version,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Holdout,
                @InnerValidation,
                @Seed,
                ISNULL(@HoldoutAccessBudget, 1),
                @PrimaryScore,
                @SecondaryMetrics,
                @Baselines,
                @Calibration,
                @Resampling,
                @Intervals,
                @Promotion,
                @AllowedOutcomes,
                @LeakageAudit,
                @Exclusions,
                @Slices,
                CASE WHEN @PredictionIntervals_Clear = 1 THEN NULL ELSE ISNULL(@PredictionIntervals, NULL) END,
                CASE WHEN @ResidualDiagnostics_Clear = 1 THEN NULL ELSE ISNULL(@ResidualDiagnostics, NULL) END,
                @RetrainTriggers,
                @SearchStrategy,
                @Budgets,
                ISNULL(@MinMinorityClassRows, 20),
                ISNULL(@GuardFieldsEditableBy, 'non-agent'),
                @AuthoredBy
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEvaluationProtocols] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Evaluation Protocols */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Evaluation Protocols
-- Item: spUpdateEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEvaluationProtocol]
    @ID uniqueidentifier,
    @LineageRootID uniqueidentifier = NULL,
    @Version int = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Holdout nvarchar(MAX) = NULL,
    @InnerValidation nvarchar(MAX) = NULL,
    @Seed int = NULL,
    @HoldoutAccessBudget int = NULL,
    @PrimaryScore nvarchar(MAX) = NULL,
    @SecondaryMetrics nvarchar(MAX) = NULL,
    @Baselines nvarchar(MAX) = NULL,
    @Calibration nvarchar(MAX) = NULL,
    @Resampling nvarchar(MAX) = NULL,
    @Intervals nvarchar(MAX) = NULL,
    @Promotion nvarchar(MAX) = NULL,
    @AllowedOutcomes nvarchar(MAX) = NULL,
    @LeakageAudit nvarchar(MAX) = NULL,
    @Exclusions nvarchar(MAX) = NULL,
    @Slices nvarchar(MAX) = NULL,
    @PredictionIntervals_Clear bit = 0,
    @PredictionIntervals nvarchar(MAX) = NULL,
    @ResidualDiagnostics_Clear bit = 0,
    @ResidualDiagnostics nvarchar(MAX) = NULL,
    @RetrainTriggers nvarchar(MAX) = NULL,
    @SearchStrategy nvarchar(MAX) = NULL,
    @Budgets nvarchar(MAX) = NULL,
    @MinMinorityClassRows int = NULL,
    @GuardFieldsEditableBy nvarchar(20) = NULL,
    @AuthoredBy nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EvaluationProtocol]
    SET
        [LineageRootID] = ISNULL(@LineageRootID, [LineageRootID]),
        [Version] = ISNULL(@Version, [Version]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Holdout] = ISNULL(@Holdout, [Holdout]),
        [InnerValidation] = ISNULL(@InnerValidation, [InnerValidation]),
        [Seed] = ISNULL(@Seed, [Seed]),
        [HoldoutAccessBudget] = ISNULL(@HoldoutAccessBudget, [HoldoutAccessBudget]),
        [PrimaryScore] = ISNULL(@PrimaryScore, [PrimaryScore]),
        [SecondaryMetrics] = ISNULL(@SecondaryMetrics, [SecondaryMetrics]),
        [Baselines] = ISNULL(@Baselines, [Baselines]),
        [Calibration] = ISNULL(@Calibration, [Calibration]),
        [Resampling] = ISNULL(@Resampling, [Resampling]),
        [Intervals] = ISNULL(@Intervals, [Intervals]),
        [Promotion] = ISNULL(@Promotion, [Promotion]),
        [AllowedOutcomes] = ISNULL(@AllowedOutcomes, [AllowedOutcomes]),
        [LeakageAudit] = ISNULL(@LeakageAudit, [LeakageAudit]),
        [Exclusions] = ISNULL(@Exclusions, [Exclusions]),
        [Slices] = ISNULL(@Slices, [Slices]),
        [PredictionIntervals] = CASE WHEN @PredictionIntervals_Clear = 1 THEN NULL ELSE ISNULL(@PredictionIntervals, [PredictionIntervals]) END,
        [ResidualDiagnostics] = CASE WHEN @ResidualDiagnostics_Clear = 1 THEN NULL ELSE ISNULL(@ResidualDiagnostics, [ResidualDiagnostics]) END,
        [RetrainTriggers] = ISNULL(@RetrainTriggers, [RetrainTriggers]),
        [SearchStrategy] = ISNULL(@SearchStrategy, [SearchStrategy]),
        [Budgets] = ISNULL(@Budgets, [Budgets]),
        [MinMinorityClassRows] = ISNULL(@MinMinorityClassRows, [MinMinorityClassRows]),
        [GuardFieldsEditableBy] = ISNULL(@GuardFieldsEditableBy, [GuardFieldsEditableBy]),
        [AuthoredBy] = ISNULL(@AuthoredBy, [AuthoredBy])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEvaluationProtocols] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEvaluationProtocols]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEvaluationProtocol] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EvaluationProtocol table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEvaluationProtocol]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEvaluationProtocol];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEvaluationProtocol
ON [${flyway:defaultSchema}].[EvaluationProtocol]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EvaluationProtocol]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EvaluationProtocol] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Evaluation Protocols */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Evaluation Protocols
-- Item: spDeleteEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEvaluationProtocol]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EvaluationProtocol]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Evaluation Protocols */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for FeatureValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecordProcessID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_RecordProcessID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_RecordProcessID ON [${flyway:defaultSchema}].[FeatureValue] ([RecordProcessID]);

-- Index for foreign key EntityID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_EntityID ON [${flyway:defaultSchema}].[FeatureValue] ([EntityID]);

-- Index for foreign key PromptID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_PromptID ON [${flyway:defaultSchema}].[FeatureValue] ([PromptID]);

-- Index for foreign key ProcessRunID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunID ON [${flyway:defaultSchema}].[FeatureValue] ([ProcessRunID]);

-- Index for foreign key ProcessRunDetailID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_ProcessRunDetailID ON [${flyway:defaultSchema}].[FeatureValue] ([ProcessRunDetailID]);

-- Index for foreign key FeatureValueCacheID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_FeatureValueCacheID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_FeatureValueCacheID ON [${flyway:defaultSchema}].[FeatureValue] ([FeatureValueCacheID]);

-- Index for foreign key AIModelID in table FeatureValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FeatureValue_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FeatureValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FeatureValue_AIModelID ON [${flyway:defaultSchema}].[FeatureValue] ([AIModelID]);

/* Base View SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: vwFeatureValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Values
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FeatureValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFeatureValues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFeatureValues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFeatureValues]
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID.[Name] AS [RecordProcess],
    MJEntity_EntityID.[Name] AS [Entity],
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJProcessRunDetail_ProcessRunDetailID.[RecordID] AS [ProcessRunDetail],
    MJFeatureValueCache_FeatureValueCacheID.[KeyDisplay] AS [FeatureValueCache],
    MJAIModel_AIModelID.[Name] AS [AIModel]
FROM
    [${flyway:defaultSchema}].[FeatureValue] AS f
INNER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [f].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [f].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [f].[PromptID] = MJAIPrompt_PromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProcessRunDetail] AS MJProcessRunDetail_ProcessRunDetailID
  ON
    [f].[ProcessRunDetailID] = MJProcessRunDetail_ProcessRunDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FeatureValueCache] AS MJFeatureValueCache_FeatureValueCacheID
  ON
    [f].[FeatureValueCacheID] = MJFeatureValueCache_FeatureValueCacheID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [f].[AIModelID] = MJAIModel_AIModelID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: Permissions for vwFeatureValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFeatureValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: spCreateFeatureValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FeatureValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFeatureValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFeatureValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFeatureValue]
    @ID uniqueidentifier = NULL,
    @RecordProcessID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(900),
    @FeatureName nvarchar(255),
    @ValueText_Clear bit = 0,
    @ValueText nvarchar(MAX) = NULL,
    @ValueNumeric_Clear bit = 0,
    @ValueNumeric float(53) = NULL,
    @ValueDate_Clear bit = 0,
    @ValueDate datetimeoffset = NULL,
    @ValueBoolean_Clear bit = 0,
    @ValueBoolean bit = NULL,
    @ValueJSON_Clear bit = 0,
    @ValueJSON nvarchar(MAX) = NULL,
    @Reasoning_Clear bit = 0,
    @Reasoning nvarchar(MAX) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence float(53) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash_Clear bit = 0,
    @PromptVersionHash nvarchar(64) = NULL,
    @ConstraintHash_Clear bit = 0,
    @ConstraintHash nvarchar(64) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @ProcessRunDetailID_Clear bit = 0,
    @ProcessRunDetailID uniqueidentifier = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL,
    @FeatureValueCacheID_Clear bit = 0,
    @FeatureValueCacheID uniqueidentifier = NULL,
    @ComputedAt datetimeoffset = NULL,
    @PipelineVersion_Clear bit = 0,
    @PipelineVersion int = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL,
    @InputHash_Clear bit = 0,
    @InputHash nvarchar(64) = NULL,
    @ValueKeyHash_Clear bit = 0,
    @ValueKeyHash nvarchar(64) = NULL,
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FeatureValue]
            (
                [ID],
                [RecordProcessID],
                [EntityID],
                [RecordID],
                [FeatureName],
                [ValueText],
                [ValueNumeric],
                [ValueDate],
                [ValueBoolean],
                [ValueJSON],
                [Reasoning],
                [Confidence],
                [PromptID],
                [PromptVersionHash],
                [ConstraintHash],
                [ProcessRunID],
                [ProcessRunDetailID],
                [AIPromptRunID],
                [FeatureValueCacheID],
                [ComputedAt],
                [PipelineVersion],
                [AIModelID],
                [ParametersHash],
                [InputHash],
                [ValueKeyHash],
                [Source],
                [EffectiveAsOf],
                [InputAsOf]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecordProcessID,
                @EntityID,
                @RecordID,
                @FeatureName,
                CASE WHEN @ValueText_Clear = 1 THEN NULL ELSE ISNULL(@ValueText, NULL) END,
                CASE WHEN @ValueNumeric_Clear = 1 THEN NULL ELSE ISNULL(@ValueNumeric, NULL) END,
                CASE WHEN @ValueDate_Clear = 1 THEN NULL ELSE ISNULL(@ValueDate, NULL) END,
                CASE WHEN @ValueBoolean_Clear = 1 THEN NULL ELSE ISNULL(@ValueBoolean, NULL) END,
                CASE WHEN @ValueJSON_Clear = 1 THEN NULL ELSE ISNULL(@ValueJSON, NULL) END,
                CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, NULL) END,
                CASE WHEN @ConstraintHash_Clear = 1 THEN NULL ELSE ISNULL(@ConstraintHash, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                CASE WHEN @ProcessRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunDetailID, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                CASE WHEN @FeatureValueCacheID_Clear = 1 THEN NULL ELSE ISNULL(@FeatureValueCacheID, NULL) END,
                ISNULL(@ComputedAt, sysdatetimeoffset()),
                CASE WHEN @PipelineVersion_Clear = 1 THEN NULL ELSE ISNULL(@PipelineVersion, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END,
                CASE WHEN @InputHash_Clear = 1 THEN NULL ELSE ISNULL(@InputHash, NULL) END,
                CASE WHEN @ValueKeyHash_Clear = 1 THEN NULL ELSE ISNULL(@ValueKeyHash, NULL) END,
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FeatureValue]
            (
                [RecordProcessID],
                [EntityID],
                [RecordID],
                [FeatureName],
                [ValueText],
                [ValueNumeric],
                [ValueDate],
                [ValueBoolean],
                [ValueJSON],
                [Reasoning],
                [Confidence],
                [PromptID],
                [PromptVersionHash],
                [ConstraintHash],
                [ProcessRunID],
                [ProcessRunDetailID],
                [AIPromptRunID],
                [FeatureValueCacheID],
                [ComputedAt],
                [PipelineVersion],
                [AIModelID],
                [ParametersHash],
                [InputHash],
                [ValueKeyHash],
                [Source],
                [EffectiveAsOf],
                [InputAsOf]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecordProcessID,
                @EntityID,
                @RecordID,
                @FeatureName,
                CASE WHEN @ValueText_Clear = 1 THEN NULL ELSE ISNULL(@ValueText, NULL) END,
                CASE WHEN @ValueNumeric_Clear = 1 THEN NULL ELSE ISNULL(@ValueNumeric, NULL) END,
                CASE WHEN @ValueDate_Clear = 1 THEN NULL ELSE ISNULL(@ValueDate, NULL) END,
                CASE WHEN @ValueBoolean_Clear = 1 THEN NULL ELSE ISNULL(@ValueBoolean, NULL) END,
                CASE WHEN @ValueJSON_Clear = 1 THEN NULL ELSE ISNULL(@ValueJSON, NULL) END,
                CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, NULL) END,
                CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, NULL) END,
                CASE WHEN @ConstraintHash_Clear = 1 THEN NULL ELSE ISNULL(@ConstraintHash, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                CASE WHEN @ProcessRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunDetailID, NULL) END,
                CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, NULL) END,
                CASE WHEN @FeatureValueCacheID_Clear = 1 THEN NULL ELSE ISNULL(@FeatureValueCacheID, NULL) END,
                ISNULL(@ComputedAt, sysdatetimeoffset()),
                CASE WHEN @PipelineVersion_Clear = 1 THEN NULL ELSE ISNULL(@PipelineVersion, NULL) END,
                CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, NULL) END,
                CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, NULL) END,
                CASE WHEN @InputHash_Clear = 1 THEN NULL ELSE ISNULL(@InputHash, NULL) END,
                CASE WHEN @ValueKeyHash_Clear = 1 THEN NULL ELSE ISNULL(@ValueKeyHash, NULL) END,
                ISNULL(@Source, 'Pipeline'),
                CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, NULL) END,
                CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFeatureValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Feature Values */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: spUpdateFeatureValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FeatureValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFeatureValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFeatureValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFeatureValue]
    @ID uniqueidentifier,
    @RecordProcessID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(900) = NULL,
    @FeatureName nvarchar(255) = NULL,
    @ValueText_Clear bit = 0,
    @ValueText nvarchar(MAX) = NULL,
    @ValueNumeric_Clear bit = 0,
    @ValueNumeric float(53) = NULL,
    @ValueDate_Clear bit = 0,
    @ValueDate datetimeoffset = NULL,
    @ValueBoolean_Clear bit = 0,
    @ValueBoolean bit = NULL,
    @ValueJSON_Clear bit = 0,
    @ValueJSON nvarchar(MAX) = NULL,
    @Reasoning_Clear bit = 0,
    @Reasoning nvarchar(MAX) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence float(53) = NULL,
    @PromptID_Clear bit = 0,
    @PromptID uniqueidentifier = NULL,
    @PromptVersionHash_Clear bit = 0,
    @PromptVersionHash nvarchar(64) = NULL,
    @ConstraintHash_Clear bit = 0,
    @ConstraintHash nvarchar(64) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @ProcessRunDetailID_Clear bit = 0,
    @ProcessRunDetailID uniqueidentifier = NULL,
    @AIPromptRunID_Clear bit = 0,
    @AIPromptRunID uniqueidentifier = NULL,
    @FeatureValueCacheID_Clear bit = 0,
    @FeatureValueCacheID uniqueidentifier = NULL,
    @ComputedAt datetimeoffset = NULL,
    @PipelineVersion_Clear bit = 0,
    @PipelineVersion int = NULL,
    @AIModelID_Clear bit = 0,
    @AIModelID uniqueidentifier = NULL,
    @ParametersHash_Clear bit = 0,
    @ParametersHash nvarchar(64) = NULL,
    @InputHash_Clear bit = 0,
    @InputHash nvarchar(64) = NULL,
    @ValueKeyHash_Clear bit = 0,
    @ValueKeyHash nvarchar(64) = NULL,
    @Source nvarchar(20) = NULL,
    @EffectiveAsOf_Clear bit = 0,
    @EffectiveAsOf datetimeoffset = NULL,
    @InputAsOf_Clear bit = 0,
    @InputAsOf datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValue]
    SET
        [RecordProcessID] = ISNULL(@RecordProcessID, [RecordProcessID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [FeatureName] = ISNULL(@FeatureName, [FeatureName]),
        [ValueText] = CASE WHEN @ValueText_Clear = 1 THEN NULL ELSE ISNULL(@ValueText, [ValueText]) END,
        [ValueNumeric] = CASE WHEN @ValueNumeric_Clear = 1 THEN NULL ELSE ISNULL(@ValueNumeric, [ValueNumeric]) END,
        [ValueDate] = CASE WHEN @ValueDate_Clear = 1 THEN NULL ELSE ISNULL(@ValueDate, [ValueDate]) END,
        [ValueBoolean] = CASE WHEN @ValueBoolean_Clear = 1 THEN NULL ELSE ISNULL(@ValueBoolean, [ValueBoolean]) END,
        [ValueJSON] = CASE WHEN @ValueJSON_Clear = 1 THEN NULL ELSE ISNULL(@ValueJSON, [ValueJSON]) END,
        [Reasoning] = CASE WHEN @Reasoning_Clear = 1 THEN NULL ELSE ISNULL(@Reasoning, [Reasoning]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [PromptID] = CASE WHEN @PromptID_Clear = 1 THEN NULL ELSE ISNULL(@PromptID, [PromptID]) END,
        [PromptVersionHash] = CASE WHEN @PromptVersionHash_Clear = 1 THEN NULL ELSE ISNULL(@PromptVersionHash, [PromptVersionHash]) END,
        [ConstraintHash] = CASE WHEN @ConstraintHash_Clear = 1 THEN NULL ELSE ISNULL(@ConstraintHash, [ConstraintHash]) END,
        [ProcessRunID] = CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, [ProcessRunID]) END,
        [ProcessRunDetailID] = CASE WHEN @ProcessRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunDetailID, [ProcessRunDetailID]) END,
        [AIPromptRunID] = CASE WHEN @AIPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIPromptRunID, [AIPromptRunID]) END,
        [FeatureValueCacheID] = CASE WHEN @FeatureValueCacheID_Clear = 1 THEN NULL ELSE ISNULL(@FeatureValueCacheID, [FeatureValueCacheID]) END,
        [ComputedAt] = ISNULL(@ComputedAt, [ComputedAt]),
        [PipelineVersion] = CASE WHEN @PipelineVersion_Clear = 1 THEN NULL ELSE ISNULL(@PipelineVersion, [PipelineVersion]) END,
        [AIModelID] = CASE WHEN @AIModelID_Clear = 1 THEN NULL ELSE ISNULL(@AIModelID, [AIModelID]) END,
        [ParametersHash] = CASE WHEN @ParametersHash_Clear = 1 THEN NULL ELSE ISNULL(@ParametersHash, [ParametersHash]) END,
        [InputHash] = CASE WHEN @InputHash_Clear = 1 THEN NULL ELSE ISNULL(@InputHash, [InputHash]) END,
        [ValueKeyHash] = CASE WHEN @ValueKeyHash_Clear = 1 THEN NULL ELSE ISNULL(@ValueKeyHash, [ValueKeyHash]) END,
        [Source] = ISNULL(@Source, [Source]),
        [EffectiveAsOf] = CASE WHEN @EffectiveAsOf_Clear = 1 THEN NULL ELSE ISNULL(@EffectiveAsOf, [EffectiveAsOf]) END,
        [InputAsOf] = CASE WHEN @InputAsOf_Clear = 1 THEN NULL ELSE ISNULL(@InputAsOf, [InputAsOf]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFeatureValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFeatureValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeatureValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFeatureValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFeatureValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFeatureValue
ON [${flyway:defaultSchema}].[FeatureValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FeatureValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FeatureValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Feature Values */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Feature Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Feature Values
-- Item: spDeleteFeatureValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FeatureValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFeatureValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFeatureValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFeatureValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FeatureValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Feature Values */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFeatureValue] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLTrainingPipeline */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TargetEntityID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_TargetEntityID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([TargetEntityID]);

-- Index for foreign key AlgorithmID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_AlgorithmID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([AlgorithmID]);

-- Index for foreign key PredictionUnitID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_PredictionUnitID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_PredictionUnitID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([PredictionUnitID]);

-- Index for foreign key EvaluationProtocolID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_EvaluationProtocolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_EvaluationProtocolID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([EvaluationProtocolID]);

/* SQL text to update entity field related entity name field map for entity field ID 3A27B360-4935-48B6-A46A-62F39FFF939C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3A27B360-4935-48B6-A46A-62F39FFF939C', @RelatedEntityNameFieldMap='PredictionUnit';

/* Index for Foreign Keys for MLTrainingRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PipelineID in table MLTrainingRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingRun_PipelineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingRun_PipelineID ON [${flyway:defaultSchema}].[MLTrainingRun] ([PipelineID]);

-- Index for foreign key ResultingModelID in table MLTrainingRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingRun_ResultingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingRun_ResultingModelID ON [${flyway:defaultSchema}].[MLTrainingRun] ([ResultingModelID]);

-- Index for foreign key ExperimentSessionIterationID in table MLTrainingRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingRun_ExperimentSessionIterationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingRun_ExperimentSessionIterationID ON [${flyway:defaultSchema}].[MLTrainingRun] ([ExperimentSessionIterationID]);

-- Index for foreign key AlgorithmID in table MLTrainingRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingRun_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingRun_AlgorithmID ON [${flyway:defaultSchema}].[MLTrainingRun] ([AlgorithmID]);

-- Index for foreign key TrainingSnapshotID in table MLTrainingRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingRun_TrainingSnapshotID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingRun_TrainingSnapshotID ON [${flyway:defaultSchema}].[MLTrainingRun] ([TrainingSnapshotID]);

-- Index for foreign key EvaluationProtocolID in table MLTrainingRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingRun_EvaluationProtocolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingRun_EvaluationProtocolID ON [${flyway:defaultSchema}].[MLTrainingRun] ([EvaluationProtocolID]);

/* SQL text to update entity field related entity name field map for entity field ID 4639BF78-3A72-4A69-9299-C5C6F5A24F68 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4639BF78-3A72-4A69-9299-C5C6F5A24F68', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* SQL text to update entity field related entity name field map for entity field ID 6B14E812-7B20-493A-AD29-53AFE948E662 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6B14E812-7B20-493A-AD29-53AFE948E662', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* Base View SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: vwMLTrainingRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingRuns]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJExperimentSessionIteration_ExperimentSessionIterationID.[Label] AS [ExperimentSessionIteration],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
FROM
    [${flyway:defaultSchema}].[MLTrainingRun] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExperimentSessionIteration] AS MJExperimentSessionIteration_ExperimentSessionIterationID
  ON
    [m].[ExperimentSessionIterationID] = MJExperimentSessionIteration_ExperimentSessionIterationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EvaluationProtocol] AS MJEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJEvaluationProtocol_EvaluationProtocolID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: Permissions for vwMLTrainingRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spCreateMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingRun]
    @ID uniqueidentifier = NULL,
    @PipelineID uniqueidentifier,
    @ResultingModelID_Clear bit = 0,
    @ResultingModelID uniqueidentifier = NULL,
    @ExperimentSessionIterationID_Clear bit = 0,
    @ExperimentSessionIterationID uniqueidentifier = NULL,
    @FeaturesUsed_Clear bit = 0,
    @FeaturesUsed nvarchar(MAX) = NULL,
    @AlgorithmID uniqueidentifier,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @ValidationResults_Clear bit = 0,
    @ValidationResults nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @ComputeSeconds_Clear bit = 0,
    @ComputeSeconds decimal(18, 3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingRun]
            (
                [ID],
                [PipelineID],
                [ResultingModelID],
                [ExperimentSessionIterationID],
                [FeaturesUsed],
                [AlgorithmID],
                [Hyperparameters],
                [ValidationResults],
                [Status],
                [StartedAt],
                [CompletedAt],
                [ComputeCost],
                [TokensUsed],
                [Notes],
                [TrainingSnapshotID],
                [EvaluationProtocolID],
                [CodeVersion],
                [ComputeSeconds]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PipelineID,
                CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, NULL) END,
                CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, NULL) END,
                CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, NULL) END,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingRun]
            (
                [PipelineID],
                [ResultingModelID],
                [ExperimentSessionIterationID],
                [FeaturesUsed],
                [AlgorithmID],
                [Hyperparameters],
                [ValidationResults],
                [Status],
                [StartedAt],
                [CompletedAt],
                [ComputeCost],
                [TokensUsed],
                [Notes],
                [TrainingSnapshotID],
                [EvaluationProtocolID],
                [CodeVersion],
                [ComputeSeconds]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PipelineID,
                CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, NULL) END,
                CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, NULL) END,
                CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, NULL) END,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spUpdateMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingRun]
    @ID uniqueidentifier,
    @PipelineID uniqueidentifier = NULL,
    @ResultingModelID_Clear bit = 0,
    @ResultingModelID uniqueidentifier = NULL,
    @ExperimentSessionIterationID_Clear bit = 0,
    @ExperimentSessionIterationID uniqueidentifier = NULL,
    @FeaturesUsed_Clear bit = 0,
    @FeaturesUsed nvarchar(MAX) = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @ValidationResults_Clear bit = 0,
    @ValidationResults nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @ComputeSeconds_Clear bit = 0,
    @ComputeSeconds decimal(18, 3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingRun]
    SET
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [ResultingModelID] = CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, [ResultingModelID]) END,
        [ExperimentSessionIterationID] = CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, [ExperimentSessionIterationID]) END,
        [FeaturesUsed] = CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, [FeaturesUsed]) END,
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [Hyperparameters] = CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, [Hyperparameters]) END,
        [ValidationResults] = CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, [ValidationResults]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ComputeCost] = CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, [ComputeCost]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [TrainingSnapshotID] = CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, [TrainingSnapshotID]) END,
        [EvaluationProtocolID] = CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, [EvaluationProtocolID]) END,
        [CodeVersion] = CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, [CodeVersion]) END,
        [ComputeSeconds] = CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, [ComputeSeconds]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingRun
ON [${flyway:defaultSchema}].[MLTrainingRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spDeleteMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: vwMLTrainingPipelines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Pipelines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingPipeline
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingPipelines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingPipelines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingPipelines]
AS
SELECT
    m.*,
    MJEntity_TargetEntityID.[Name] AS [TargetEntity],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
FROM
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [m].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PredictionUnit] AS MJPredictionUnit_PredictionUnitID
  ON
    [m].[PredictionUnitID] = MJPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EvaluationProtocol] AS MJEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJEvaluationProtocol_EvaluationProtocolID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: Permissions for vwMLTrainingPipelines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: spCreateMLTrainingPipeline
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingPipeline
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingPipeline]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingPipeline];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingPipeline]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version int = NULL,
    @Status nvarchar(20) = NULL,
    @TargetEntityID uniqueidentifier,
    @TargetVariable nvarchar(500),
    @ProblemType nvarchar(20),
    @AlgorithmID uniqueidentifier,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @SourceBindings_Clear bit = 0,
    @SourceBindings nvarchar(MAX) = NULL,
    @FeatureSteps_Clear bit = 0,
    @FeatureSteps nvarchar(MAX) = NULL,
    @AsOfStrategy_Clear bit = 0,
    @AsOfStrategy nvarchar(MAX) = NULL,
    @LeakageGuard_Clear bit = 0,
    @LeakageGuard nvarchar(MAX) = NULL,
    @ValidationStrategy_Clear bit = 0,
    @ValidationStrategy nvarchar(MAX) = NULL,
    @PredictionUnitID_Clear bit = 0,
    @PredictionUnitID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingPipeline]
            (
                [ID],
                [Name],
                [Description],
                [Version],
                [Status],
                [TargetEntityID],
                [TargetVariable],
                [ProblemType],
                [AlgorithmID],
                [Hyperparameters],
                [SourceBindings],
                [FeatureSteps],
                [AsOfStrategy],
                [LeakageGuard],
                [ValidationStrategy],
                [PredictionUnitID],
                [EvaluationProtocolID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Version, 1),
                ISNULL(@Status, 'Draft'),
                @TargetEntityID,
                @TargetVariable,
                @ProblemType,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @SourceBindings_Clear = 1 THEN NULL ELSE ISNULL(@SourceBindings, NULL) END,
                CASE WHEN @FeatureSteps_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSteps, NULL) END,
                CASE WHEN @AsOfStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AsOfStrategy, NULL) END,
                CASE WHEN @LeakageGuard_Clear = 1 THEN NULL ELSE ISNULL(@LeakageGuard, NULL) END,
                CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, NULL) END,
                CASE WHEN @PredictionUnitID_Clear = 1 THEN NULL ELSE ISNULL(@PredictionUnitID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingPipeline]
            (
                [Name],
                [Description],
                [Version],
                [Status],
                [TargetEntityID],
                [TargetVariable],
                [ProblemType],
                [AlgorithmID],
                [Hyperparameters],
                [SourceBindings],
                [FeatureSteps],
                [AsOfStrategy],
                [LeakageGuard],
                [ValidationStrategy],
                [PredictionUnitID],
                [EvaluationProtocolID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Version, 1),
                ISNULL(@Status, 'Draft'),
                @TargetEntityID,
                @TargetVariable,
                @ProblemType,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @SourceBindings_Clear = 1 THEN NULL ELSE ISNULL(@SourceBindings, NULL) END,
                CASE WHEN @FeatureSteps_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSteps, NULL) END,
                CASE WHEN @AsOfStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AsOfStrategy, NULL) END,
                CASE WHEN @LeakageGuard_Clear = 1 THEN NULL ELSE ISNULL(@LeakageGuard, NULL) END,
                CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, NULL) END,
                CASE WHEN @PredictionUnitID_Clear = 1 THEN NULL ELSE ISNULL(@PredictionUnitID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingPipelines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Pipelines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: spUpdateMLTrainingPipeline
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingPipeline
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingPipeline]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version int = NULL,
    @Status nvarchar(20) = NULL,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetVariable nvarchar(500) = NULL,
    @ProblemType nvarchar(20) = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @SourceBindings_Clear bit = 0,
    @SourceBindings nvarchar(MAX) = NULL,
    @FeatureSteps_Clear bit = 0,
    @FeatureSteps nvarchar(MAX) = NULL,
    @AsOfStrategy_Clear bit = 0,
    @AsOfStrategy nvarchar(MAX) = NULL,
    @LeakageGuard_Clear bit = 0,
    @LeakageGuard nvarchar(MAX) = NULL,
    @ValidationStrategy_Clear bit = 0,
    @ValidationStrategy nvarchar(MAX) = NULL,
    @PredictionUnitID_Clear bit = 0,
    @PredictionUnitID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingPipeline]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Version] = ISNULL(@Version, [Version]),
        [Status] = ISNULL(@Status, [Status]),
        [TargetEntityID] = ISNULL(@TargetEntityID, [TargetEntityID]),
        [TargetVariable] = ISNULL(@TargetVariable, [TargetVariable]),
        [ProblemType] = ISNULL(@ProblemType, [ProblemType]),
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [Hyperparameters] = CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, [Hyperparameters]) END,
        [SourceBindings] = CASE WHEN @SourceBindings_Clear = 1 THEN NULL ELSE ISNULL(@SourceBindings, [SourceBindings]) END,
        [FeatureSteps] = CASE WHEN @FeatureSteps_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSteps, [FeatureSteps]) END,
        [AsOfStrategy] = CASE WHEN @AsOfStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AsOfStrategy, [AsOfStrategy]) END,
        [LeakageGuard] = CASE WHEN @LeakageGuard_Clear = 1 THEN NULL ELSE ISNULL(@LeakageGuard, [LeakageGuard]) END,
        [ValidationStrategy] = CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, [ValidationStrategy]) END,
        [PredictionUnitID] = CASE WHEN @PredictionUnitID_Clear = 1 THEN NULL ELSE ISNULL(@PredictionUnitID, [PredictionUnitID]) END,
        [EvaluationProtocolID] = CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, [EvaluationProtocolID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingPipelines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingPipelines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingPipeline table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingPipeline]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingPipeline];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingPipeline
ON [${flyway:defaultSchema}].[MLTrainingPipeline]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingPipeline]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingPipeline] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Training Pipelines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: spDeleteMLTrainingPipeline
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingPipeline
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingPipeline]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingPipeline]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Pipelines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PredictionUnit */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Prediction Units
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key LineageRootID in table PredictionUnit
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PredictionUnit_LineageRootID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PredictionUnit]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PredictionUnit_LineageRootID ON [${flyway:defaultSchema}].[PredictionUnit] ([LineageRootID]);

/* SQL text to update entity field related entity name field map for entity field ID 16564F1C-1781-4768-AC1B-A72C51D66B8B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='16564F1C-1781-4768-AC1B-A72C51D66B8B', @RelatedEntityNameFieldMap='LineageRoot';

/* Base View SQL for MJ: Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Prediction Units
-- Item: vwPredictionUnits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Prediction Units
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PredictionUnit
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPredictionUnits]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPredictionUnits];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPredictionUnits]
AS
SELECT
    p.*,
    MJPredictionUnit_LineageRootID.[Name] AS [LineageRoot]
FROM
    [${flyway:defaultSchema}].[PredictionUnit] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PredictionUnit] AS MJPredictionUnit_LineageRootID
  ON
    [p].[LineageRootID] = MJPredictionUnit_LineageRootID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPredictionUnits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Prediction Units
-- Item: Permissions for vwPredictionUnits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPredictionUnits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Prediction Units
-- Item: spCreatePredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePredictionUnit]
    @ID uniqueidentifier = NULL,
    @LineageRootID uniqueidentifier,
    @Version int,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @UnitRows nvarchar(MAX),
    @LabelRule nvarchar(MAX),
    @LabelWindowDays int,
    @LabelGapDays int = NULL,
    @TaskType nvarchar(MAX),
    @LabelVersion int,
    @Censoring nvarchar(MAX),
    @ChangeHistoryPolicy nvarchar(MAX),
    @GroupKey_Clear bit = 0,
    @GroupKey nvarchar(255) = NULL,
    @TemporalSpec_Clear bit = 0,
    @TemporalSpec nvarchar(MAX) = NULL,
    @DecisionSpec nvarchar(MAX),
    @IncumbentHeuristic nvarchar(MAX),
    @AuthoredBy nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PredictionUnit]
            (
                [ID],
                [LineageRootID],
                [Version],
                [Name],
                [Description],
                [UnitRows],
                [LabelRule],
                [LabelWindowDays],
                [LabelGapDays],
                [TaskType],
                [LabelVersion],
                [Censoring],
                [ChangeHistoryPolicy],
                [GroupKey],
                [TemporalSpec],
                [DecisionSpec],
                [IncumbentHeuristic],
                [AuthoredBy]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @LineageRootID,
                @Version,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @UnitRows,
                @LabelRule,
                @LabelWindowDays,
                ISNULL(@LabelGapDays, 0),
                @TaskType,
                @LabelVersion,
                @Censoring,
                @ChangeHistoryPolicy,
                CASE WHEN @GroupKey_Clear = 1 THEN NULL ELSE ISNULL(@GroupKey, NULL) END,
                CASE WHEN @TemporalSpec_Clear = 1 THEN NULL ELSE ISNULL(@TemporalSpec, NULL) END,
                @DecisionSpec,
                @IncumbentHeuristic,
                @AuthoredBy
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PredictionUnit]
            (
                [LineageRootID],
                [Version],
                [Name],
                [Description],
                [UnitRows],
                [LabelRule],
                [LabelWindowDays],
                [LabelGapDays],
                [TaskType],
                [LabelVersion],
                [Censoring],
                [ChangeHistoryPolicy],
                [GroupKey],
                [TemporalSpec],
                [DecisionSpec],
                [IncumbentHeuristic],
                [AuthoredBy]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @LineageRootID,
                @Version,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @UnitRows,
                @LabelRule,
                @LabelWindowDays,
                ISNULL(@LabelGapDays, 0),
                @TaskType,
                @LabelVersion,
                @Censoring,
                @ChangeHistoryPolicy,
                CASE WHEN @GroupKey_Clear = 1 THEN NULL ELSE ISNULL(@GroupKey, NULL) END,
                CASE WHEN @TemporalSpec_Clear = 1 THEN NULL ELSE ISNULL(@TemporalSpec, NULL) END,
                @DecisionSpec,
                @IncumbentHeuristic,
                @AuthoredBy
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPredictionUnits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Prediction Units */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Prediction Units
-- Item: spUpdatePredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePredictionUnit]
    @ID uniqueidentifier,
    @LineageRootID uniqueidentifier = NULL,
    @Version int = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @UnitRows nvarchar(MAX) = NULL,
    @LabelRule nvarchar(MAX) = NULL,
    @LabelWindowDays int = NULL,
    @LabelGapDays int = NULL,
    @TaskType nvarchar(MAX) = NULL,
    @LabelVersion int = NULL,
    @Censoring nvarchar(MAX) = NULL,
    @ChangeHistoryPolicy nvarchar(MAX) = NULL,
    @GroupKey_Clear bit = 0,
    @GroupKey nvarchar(255) = NULL,
    @TemporalSpec_Clear bit = 0,
    @TemporalSpec nvarchar(MAX) = NULL,
    @DecisionSpec nvarchar(MAX) = NULL,
    @IncumbentHeuristic nvarchar(MAX) = NULL,
    @AuthoredBy nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PredictionUnit]
    SET
        [LineageRootID] = ISNULL(@LineageRootID, [LineageRootID]),
        [Version] = ISNULL(@Version, [Version]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [UnitRows] = ISNULL(@UnitRows, [UnitRows]),
        [LabelRule] = ISNULL(@LabelRule, [LabelRule]),
        [LabelWindowDays] = ISNULL(@LabelWindowDays, [LabelWindowDays]),
        [LabelGapDays] = ISNULL(@LabelGapDays, [LabelGapDays]),
        [TaskType] = ISNULL(@TaskType, [TaskType]),
        [LabelVersion] = ISNULL(@LabelVersion, [LabelVersion]),
        [Censoring] = ISNULL(@Censoring, [Censoring]),
        [ChangeHistoryPolicy] = ISNULL(@ChangeHistoryPolicy, [ChangeHistoryPolicy]),
        [GroupKey] = CASE WHEN @GroupKey_Clear = 1 THEN NULL ELSE ISNULL(@GroupKey, [GroupKey]) END,
        [TemporalSpec] = CASE WHEN @TemporalSpec_Clear = 1 THEN NULL ELSE ISNULL(@TemporalSpec, [TemporalSpec]) END,
        [DecisionSpec] = ISNULL(@DecisionSpec, [DecisionSpec]),
        [IncumbentHeuristic] = ISNULL(@IncumbentHeuristic, [IncumbentHeuristic]),
        [AuthoredBy] = ISNULL(@AuthoredBy, [AuthoredBy])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPredictionUnits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPredictionUnits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePredictionUnit] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PredictionUnit table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePredictionUnit]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePredictionUnit];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePredictionUnit
ON [${flyway:defaultSchema}].[PredictionUnit]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PredictionUnit]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PredictionUnit] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Prediction Units */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Prediction Units
-- Item: spDeletePredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePredictionUnit]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PredictionUnit]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Prediction Units */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for TrainingSnapshot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Training Snapshots
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PipelineID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_PipelineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_PipelineID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([PipelineID]);

-- Index for foreign key PredictionUnitID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_PredictionUnitID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_PredictionUnitID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([PredictionUnitID]);

-- Index for foreign key EvaluationProtocolID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_EvaluationProtocolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_EvaluationProtocolID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([EvaluationProtocolID]);

-- Index for foreign key StorageProviderID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_StorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_StorageProviderID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([StorageProviderID]);

-- Index for foreign key MatrixFileID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_MatrixFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_MatrixFileID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([MatrixFileID]);

-- Index for foreign key RowManifestFileID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_RowManifestFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_RowManifestFileID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([RowManifestFileID]);

-- Index for foreign key ProvenanceFileID in table TrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TrainingSnapshot_ProvenanceFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TrainingSnapshot_ProvenanceFileID ON [${flyway:defaultSchema}].[TrainingSnapshot] ([ProvenanceFileID]);

/* SQL text to update entity field related entity name field map for entity field ID B378836D-E724-4F0B-8041-81FACDEC8644 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B378836D-E724-4F0B-8041-81FACDEC8644', @RelatedEntityNameFieldMap='Pipeline';

/* SQL text to update entity field related entity name field map for entity field ID 7CAF679B-4A83-45E4-BE1F-5FEA308ED03A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7CAF679B-4A83-45E4-BE1F-5FEA308ED03A', @RelatedEntityNameFieldMap='PredictionUnit';

/* SQL text to update entity field related entity name field map for entity field ID 9587F907-23EE-4F46-A8BF-18DA1CD112FB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9587F907-23EE-4F46-A8BF-18DA1CD112FB', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* SQL text to update entity field related entity name field map for entity field ID 78E9F5E7-AF2A-46D5-9305-6AE12B29B283 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='78E9F5E7-AF2A-46D5-9305-6AE12B29B283', @RelatedEntityNameFieldMap='StorageProvider';

/* SQL text to update entity field related entity name field map for entity field ID 081C2C3D-F102-4FBF-AF31-BD8C435427F8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='081C2C3D-F102-4FBF-AF31-BD8C435427F8', @RelatedEntityNameFieldMap='MatrixFile';

/* SQL text to update entity field related entity name field map for entity field ID 996B9364-8C11-4046-902D-AEE414F3C7BD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='996B9364-8C11-4046-902D-AEE414F3C7BD', @RelatedEntityNameFieldMap='RowManifestFile';

/* SQL text to update entity field related entity name field map for entity field ID 6F468FEE-462C-4A24-8DB2-AFDB40718B8D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6F468FEE-462C-4A24-8DB2-AFDB40718B8D', @RelatedEntityNameFieldMap='ProvenanceFile';

/* Base View SQL for MJ: Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Training Snapshots
-- Item: vwTrainingSnapshots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Training Snapshots
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TrainingSnapshot
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTrainingSnapshots]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTrainingSnapshots];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTrainingSnapshots]
AS
SELECT
    t.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol],
    MJFileStorageProvider_StorageProviderID.[Name] AS [StorageProvider],
    MJFile_MatrixFileID.[Name] AS [MatrixFile],
    MJFile_RowManifestFileID.[Name] AS [RowManifestFile],
    MJFile_ProvenanceFileID.[Name] AS [ProvenanceFile]
FROM
    [${flyway:defaultSchema}].[TrainingSnapshot] AS t
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [t].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[PredictionUnit] AS MJPredictionUnit_PredictionUnitID
  ON
    [t].[PredictionUnitID] = MJPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EvaluationProtocol] AS MJEvaluationProtocol_EvaluationProtocolID
  ON
    [t].[EvaluationProtocolID] = MJEvaluationProtocol_EvaluationProtocolID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_StorageProviderID
  ON
    [t].[StorageProviderID] = MJFileStorageProvider_StorageProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_MatrixFileID
  ON
    [t].[MatrixFileID] = MJFile_MatrixFileID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RowManifestFileID
  ON
    [t].[RowManifestFileID] = MJFile_RowManifestFileID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_ProvenanceFileID
  ON
    [t].[ProvenanceFileID] = MJFile_ProvenanceFileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTrainingSnapshots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Training Snapshots
-- Item: Permissions for vwTrainingSnapshots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTrainingSnapshots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Training Snapshots
-- Item: spCreateTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTrainingSnapshot]
    @ID uniqueidentifier = NULL,
    @ContentHash nvarchar(64),
    @PipelineID uniqueidentifier,
    @PredictionUnitID uniqueidentifier,
    @LabelVersion int,
    @FeatureSpecVersion int,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @StorageProviderID uniqueidentifier,
    @MatrixFileID uniqueidentifier,
    @MatrixSha256 nvarchar(64),
    @MatrixSizeBytes bigint,
    @RowManifestFileID uniqueidentifier,
    @RowManifestSha256 nvarchar(64),
    @RowManifestSizeBytes bigint,
    @ProvenanceFileID uniqueidentifier,
    @ProvenanceSha256 nvarchar(64),
    @ProvenanceSizeBytes bigint,
    @ManifestRowCount int,
    @HoldoutRowCount int,
    @FeatureSpec nvarchar(MAX),
    @FeatureSchema nvarchar(MAX),
    @FeatureSchemaHash nvarchar(64),
    @ColumnProvenance nvarchar(MAX),
    @PinnedFeatureVersions nvarchar(MAX) = NULL,
    @RowsRead int,
    @ReadComplete bit = NULL,
    @CensoredRowsExcluded int,
    @LabelKnownRowsExcluded int,
    @EmptyLabelRowsExcluded int,
    @UncoveredHistoryRowsExcluded nvarchar(MAX) = NULL,
    @DuplicateRowsRemoved int = NULL,
    @ClassBalance_Clear bit = 0,
    @ClassBalance nvarchar(MAX) = NULL,
    @DataCutoff datetimeoffset,
    @AssemblyCodeVersion nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TrainingSnapshot]
            (
                [ID],
                [ContentHash],
                [PipelineID],
                [PredictionUnitID],
                [LabelVersion],
                [FeatureSpecVersion],
                [EvaluationProtocolID],
                [StorageProviderID],
                [MatrixFileID],
                [MatrixSha256],
                [MatrixSizeBytes],
                [RowManifestFileID],
                [RowManifestSha256],
                [RowManifestSizeBytes],
                [ProvenanceFileID],
                [ProvenanceSha256],
                [ProvenanceSizeBytes],
                [ManifestRowCount],
                [HoldoutRowCount],
                [FeatureSpec],
                [FeatureSchema],
                [FeatureSchemaHash],
                [ColumnProvenance],
                [PinnedFeatureVersions],
                [RowsRead],
                [ReadComplete],
                [CensoredRowsExcluded],
                [LabelKnownRowsExcluded],
                [EmptyLabelRowsExcluded],
                [UncoveredHistoryRowsExcluded],
                [DuplicateRowsRemoved],
                [ClassBalance],
                [DataCutoff],
                [AssemblyCodeVersion]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentHash,
                @PipelineID,
                @PredictionUnitID,
                @LabelVersion,
                @FeatureSpecVersion,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                @StorageProviderID,
                @MatrixFileID,
                @MatrixSha256,
                @MatrixSizeBytes,
                @RowManifestFileID,
                @RowManifestSha256,
                @RowManifestSizeBytes,
                @ProvenanceFileID,
                @ProvenanceSha256,
                @ProvenanceSizeBytes,
                @ManifestRowCount,
                @HoldoutRowCount,
                @FeatureSpec,
                @FeatureSchema,
                @FeatureSchemaHash,
                @ColumnProvenance,
                ISNULL(@PinnedFeatureVersions, '[]'),
                @RowsRead,
                ISNULL(@ReadComplete, 1),
                @CensoredRowsExcluded,
                @LabelKnownRowsExcluded,
                @EmptyLabelRowsExcluded,
                ISNULL(@UncoveredHistoryRowsExcluded, '[]'),
                ISNULL(@DuplicateRowsRemoved, 0),
                CASE WHEN @ClassBalance_Clear = 1 THEN NULL ELSE ISNULL(@ClassBalance, NULL) END,
                @DataCutoff,
                @AssemblyCodeVersion
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TrainingSnapshot]
            (
                [ContentHash],
                [PipelineID],
                [PredictionUnitID],
                [LabelVersion],
                [FeatureSpecVersion],
                [EvaluationProtocolID],
                [StorageProviderID],
                [MatrixFileID],
                [MatrixSha256],
                [MatrixSizeBytes],
                [RowManifestFileID],
                [RowManifestSha256],
                [RowManifestSizeBytes],
                [ProvenanceFileID],
                [ProvenanceSha256],
                [ProvenanceSizeBytes],
                [ManifestRowCount],
                [HoldoutRowCount],
                [FeatureSpec],
                [FeatureSchema],
                [FeatureSchemaHash],
                [ColumnProvenance],
                [PinnedFeatureVersions],
                [RowsRead],
                [ReadComplete],
                [CensoredRowsExcluded],
                [LabelKnownRowsExcluded],
                [EmptyLabelRowsExcluded],
                [UncoveredHistoryRowsExcluded],
                [DuplicateRowsRemoved],
                [ClassBalance],
                [DataCutoff],
                [AssemblyCodeVersion]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentHash,
                @PipelineID,
                @PredictionUnitID,
                @LabelVersion,
                @FeatureSpecVersion,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                @StorageProviderID,
                @MatrixFileID,
                @MatrixSha256,
                @MatrixSizeBytes,
                @RowManifestFileID,
                @RowManifestSha256,
                @RowManifestSizeBytes,
                @ProvenanceFileID,
                @ProvenanceSha256,
                @ProvenanceSizeBytes,
                @ManifestRowCount,
                @HoldoutRowCount,
                @FeatureSpec,
                @FeatureSchema,
                @FeatureSchemaHash,
                @ColumnProvenance,
                ISNULL(@PinnedFeatureVersions, '[]'),
                @RowsRead,
                ISNULL(@ReadComplete, 1),
                @CensoredRowsExcluded,
                @LabelKnownRowsExcluded,
                @EmptyLabelRowsExcluded,
                ISNULL(@UncoveredHistoryRowsExcluded, '[]'),
                ISNULL(@DuplicateRowsRemoved, 0),
                CASE WHEN @ClassBalance_Clear = 1 THEN NULL ELSE ISNULL(@ClassBalance, NULL) END,
                @DataCutoff,
                @AssemblyCodeVersion
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTrainingSnapshots] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Training Snapshots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Training Snapshots
-- Item: spUpdateTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTrainingSnapshot]
    @ID uniqueidentifier,
    @ContentHash nvarchar(64) = NULL,
    @PipelineID uniqueidentifier = NULL,
    @PredictionUnitID uniqueidentifier = NULL,
    @LabelVersion int = NULL,
    @FeatureSpecVersion int = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @StorageProviderID uniqueidentifier = NULL,
    @MatrixFileID uniqueidentifier = NULL,
    @MatrixSha256 nvarchar(64) = NULL,
    @MatrixSizeBytes bigint = NULL,
    @RowManifestFileID uniqueidentifier = NULL,
    @RowManifestSha256 nvarchar(64) = NULL,
    @RowManifestSizeBytes bigint = NULL,
    @ProvenanceFileID uniqueidentifier = NULL,
    @ProvenanceSha256 nvarchar(64) = NULL,
    @ProvenanceSizeBytes bigint = NULL,
    @ManifestRowCount int = NULL,
    @HoldoutRowCount int = NULL,
    @FeatureSpec nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX) = NULL,
    @FeatureSchemaHash nvarchar(64) = NULL,
    @ColumnProvenance nvarchar(MAX) = NULL,
    @PinnedFeatureVersions nvarchar(MAX) = NULL,
    @RowsRead int = NULL,
    @ReadComplete bit = NULL,
    @CensoredRowsExcluded int = NULL,
    @LabelKnownRowsExcluded int = NULL,
    @EmptyLabelRowsExcluded int = NULL,
    @UncoveredHistoryRowsExcluded nvarchar(MAX) = NULL,
    @DuplicateRowsRemoved int = NULL,
    @ClassBalance_Clear bit = 0,
    @ClassBalance nvarchar(MAX) = NULL,
    @DataCutoff datetimeoffset = NULL,
    @AssemblyCodeVersion nvarchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TrainingSnapshot]
    SET
        [ContentHash] = ISNULL(@ContentHash, [ContentHash]),
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [PredictionUnitID] = ISNULL(@PredictionUnitID, [PredictionUnitID]),
        [LabelVersion] = ISNULL(@LabelVersion, [LabelVersion]),
        [FeatureSpecVersion] = ISNULL(@FeatureSpecVersion, [FeatureSpecVersion]),
        [EvaluationProtocolID] = CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, [EvaluationProtocolID]) END,
        [StorageProviderID] = ISNULL(@StorageProviderID, [StorageProviderID]),
        [MatrixFileID] = ISNULL(@MatrixFileID, [MatrixFileID]),
        [MatrixSha256] = ISNULL(@MatrixSha256, [MatrixSha256]),
        [MatrixSizeBytes] = ISNULL(@MatrixSizeBytes, [MatrixSizeBytes]),
        [RowManifestFileID] = ISNULL(@RowManifestFileID, [RowManifestFileID]),
        [RowManifestSha256] = ISNULL(@RowManifestSha256, [RowManifestSha256]),
        [RowManifestSizeBytes] = ISNULL(@RowManifestSizeBytes, [RowManifestSizeBytes]),
        [ProvenanceFileID] = ISNULL(@ProvenanceFileID, [ProvenanceFileID]),
        [ProvenanceSha256] = ISNULL(@ProvenanceSha256, [ProvenanceSha256]),
        [ProvenanceSizeBytes] = ISNULL(@ProvenanceSizeBytes, [ProvenanceSizeBytes]),
        [ManifestRowCount] = ISNULL(@ManifestRowCount, [ManifestRowCount]),
        [HoldoutRowCount] = ISNULL(@HoldoutRowCount, [HoldoutRowCount]),
        [FeatureSpec] = ISNULL(@FeatureSpec, [FeatureSpec]),
        [FeatureSchema] = ISNULL(@FeatureSchema, [FeatureSchema]),
        [FeatureSchemaHash] = ISNULL(@FeatureSchemaHash, [FeatureSchemaHash]),
        [ColumnProvenance] = ISNULL(@ColumnProvenance, [ColumnProvenance]),
        [PinnedFeatureVersions] = ISNULL(@PinnedFeatureVersions, [PinnedFeatureVersions]),
        [RowsRead] = ISNULL(@RowsRead, [RowsRead]),
        [ReadComplete] = ISNULL(@ReadComplete, [ReadComplete]),
        [CensoredRowsExcluded] = ISNULL(@CensoredRowsExcluded, [CensoredRowsExcluded]),
        [LabelKnownRowsExcluded] = ISNULL(@LabelKnownRowsExcluded, [LabelKnownRowsExcluded]),
        [EmptyLabelRowsExcluded] = ISNULL(@EmptyLabelRowsExcluded, [EmptyLabelRowsExcluded]),
        [UncoveredHistoryRowsExcluded] = ISNULL(@UncoveredHistoryRowsExcluded, [UncoveredHistoryRowsExcluded]),
        [DuplicateRowsRemoved] = ISNULL(@DuplicateRowsRemoved, [DuplicateRowsRemoved]),
        [ClassBalance] = CASE WHEN @ClassBalance_Clear = 1 THEN NULL ELSE ISNULL(@ClassBalance, [ClassBalance]) END,
        [DataCutoff] = ISNULL(@DataCutoff, [DataCutoff]),
        [AssemblyCodeVersion] = ISNULL(@AssemblyCodeVersion, [AssemblyCodeVersion])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTrainingSnapshots] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTrainingSnapshots]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTrainingSnapshot] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TrainingSnapshot table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTrainingSnapshot]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTrainingSnapshot];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTrainingSnapshot
ON [${flyway:defaultSchema}].[TrainingSnapshot]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TrainingSnapshot]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TrainingSnapshot] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Training Snapshots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Training Snapshots
-- Item: spDeleteTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTrainingSnapshot]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TrainingSnapshot]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Training Snapshots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool bit
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID], [DeclareAsNativeTool]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID, @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID, @DeclareAsNativeTool = @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID, @MJAIAgentActions_CompactPromptID_DeclareAsNativeTool
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_SystemPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, @MJAIAgentTypes_SystemPromptID_ConfigSchema, @MJAIAgentTypes_SystemPromptID_DefaultConfiguration, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, @MJAIAgentTypes_SystemPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, @MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, @MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ContextCompressionPromptIDID, @Name = @MJAIAgentTypes_ContextCompressionPromptID_Name, @Description = @MJAIAgentTypes_ContextCompressionPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor INTO @MJAIAgentTypes_ContextCompressionPromptIDID, @MJAIAgentTypes_ContextCompressionPromptID_Name, @MJAIAgentTypes_ContextCompressionPromptID_Description, @MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, @MJAIAgentTypes_ContextCompressionPromptID_IsActive, @MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ContextCompressionPromptID_DriverClass, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, @MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, @MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, @MJAIAgentTypes_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, @MJAIAgentTypes_ContextCompressionPromptID_DefaultConfiguration, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgentTypes_ContextCompressionPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration nvarchar(MAX)
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID], [ConfigSchema], [DefaultConfiguration], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_ConversationSummaryPromptIDID, @Name = @MJAIAgentTypes_ConversationSummaryPromptID_Name, @Description = @MJAIAgentTypes_ConversationSummaryPromptID_Description, @SystemPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @ConfigSchema = @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @DefaultConfiguration = @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @ContextCompressionMessageThreshold = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @ContextWindowMaxTokens = @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor INTO @MJAIAgentTypes_ConversationSummaryPromptIDID, @MJAIAgentTypes_ConversationSummaryPromptID_Name, @MJAIAgentTypes_ConversationSummaryPromptID_Description, @MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_IsActive, @MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, @MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, @MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, @MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfiguration, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgentTypes_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgentTypes_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgentTypes_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgentTypes_ConversationSummaryPromptID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ConversationSummaryPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxMessages int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode bit
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ConversationSummaryPromptIDID, @Name = @MJAIAgents_ConversationSummaryPromptID_Name, @Description = @MJAIAgents_ConversationSummaryPromptID_Description, @LogoURL = @MJAIAgents_ConversationSummaryPromptID_LogoURL, @ParentID = @MJAIAgents_ConversationSummaryPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ConversationSummaryPromptID_TypeID, @Status = @MJAIAgents_ConversationSummaryPromptID_Status, @DriverClass = @MJAIAgents_ConversationSummaryPromptID_DriverClass, @IconClass = @MJAIAgents_ConversationSummaryPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MessageMode = @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MaxMessages = @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ConversationSummaryPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_JudgeID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_JudgeID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @MJAIPromptRuns_JudgeID_InputUnitsUsed, @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @MJAIPromptRuns_JudgeID_UsageTypeID, @MJAIPromptRuns_JudgeID_ToolCallingMode, @MJAIPromptRuns_JudgeID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_JudgeID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_JudgeID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_JudgeID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_JudgeID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_JudgeID_ToolCallingMode, @UserID = @MJAIPromptRuns_JudgeID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill, @MJAIPromptRuns_JudgeID_TokensCacheRead, @MJAIPromptRuns_JudgeID_TokensCacheWrite, @MJAIPromptRuns_JudgeID_TokensCacheReadRollup, @MJAIPromptRuns_JudgeID_TokensCacheWriteRollup, @MJAIPromptRuns_JudgeID_InputUnitsUsed, @MJAIPromptRuns_JudgeID_OutputUnitsUsed, @MJAIPromptRuns_JudgeID_UsageTypeID, @MJAIPromptRuns_JudgeID_ToolCallingMode, @MJAIPromptRuns_JudgeID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_ChildPromptID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @MJAIPromptRuns_ChildPromptID_UsageTypeID, @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @MJAIPromptRuns_ChildPromptID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_ChildPromptID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @UserID = @MJAIPromptRuns_ChildPromptID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill, @MJAIPromptRuns_ChildPromptID_TokensCacheRead, @MJAIPromptRuns_ChildPromptID_TokensCacheWrite, @MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, @MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup, @MJAIPromptRuns_ChildPromptID_InputUnitsUsed, @MJAIPromptRuns_ChildPromptID_OutputUnitsUsed, @MJAIPromptRuns_ChildPromptID_UsageTypeID, @MJAIPromptRuns_ChildPromptID_ToolCallingMode, @MJAIPromptRuns_ChildPromptID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture nvarchar(20)
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels], [PromptConfiguration], [TemplateDataCapture]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @PromptConfiguration = @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @TemplateDataCapture = @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels, @MJAIPrompts_ResultSelectorPromptID_PromptConfiguration, @MJAIPrompts_ResultSelectorPromptID_TemplateDataCapture
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningPromptIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningPromptID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningPromptID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningPromptID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningPromptIDID, @Name = @MJEntityDocuments_ReasoningPromptID_Name, @TypeID = @MJEntityDocuments_ReasoningPromptID_TypeID, @EntityID = @MJEntityDocuments_ReasoningPromptID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningPromptID_Status, @TemplateID = @MJEntityDocuments_ReasoningPromptID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningPromptID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningPromptID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @ReasoningPromptID_Clear = 1, @ReasoningPromptID = @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @ReasoningAgentID = @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningPromptID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningPromptID_cursor INTO @MJEntityDocuments_ReasoningPromptIDID, @MJEntityDocuments_ReasoningPromptID_Name, @MJEntityDocuments_ReasoningPromptID_TypeID, @MJEntityDocuments_ReasoningPromptID_EntityID, @MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, @MJEntityDocuments_ReasoningPromptID_Status, @MJEntityDocuments_ReasoningPromptID_TemplateID, @MJEntityDocuments_ReasoningPromptID_AIModelID, @MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningPromptID_VectorIndexID, @MJEntityDocuments_ReasoningPromptID_Configuration, @MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, @MJEntityDocuments_ReasoningPromptID_ReasoningMode, @MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, @MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, @MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, @MJEntityDocuments_ReasoningPromptID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningPromptID_cursor
    
    -- Cascade update on FeaturePipelineVersion using cursor to call spUpdateFeaturePipelineVersion
    DECLARE @MJFeaturePipelineVersions_PromptIDID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_RecordProcessID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_Version int
    DECLARE @MJFeaturePipelineVersions_PromptID_PinHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_SpecHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_PromptID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_PromptVersionHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_AIModelID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_ParametersHash nvarchar(64)
    DECLARE @MJFeaturePipelineVersions_PromptID_Status nvarchar(20)
    DECLARE @MJFeaturePipelineVersions_PromptID_Gated bit
    DECLARE @MJFeaturePipelineVersions_PromptID_GoldenSetTestID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_Metric nvarchar(20)
    DECLARE @MJFeaturePipelineVersions_PromptID_Threshold float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultValue float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultLower float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultUpper float(53)
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultN int
    DECLARE @MJFeaturePipelineVersions_PromptID_ResultDetails nvarchar(MAX)
    DECLARE @MJFeaturePipelineVersions_PromptID_ActivatedAt datetimeoffset
    DECLARE @MJFeaturePipelineVersions_PromptID_ApprovedByUserID uniqueidentifier
    DECLARE @MJFeaturePipelineVersions_PromptID_RetiredAt datetimeoffset
    DECLARE @MJFeaturePipelineVersions_PromptID_BackfilledAt datetimeoffset
    DECLARE cascade_update_MJFeaturePipelineVersions_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [Version], [PinHash], [SpecHash], [PromptID], [PromptVersionHash], [AIModelID], [ParametersHash], [Status], [Gated], [GoldenSetTestID], [GoldenSetTestRunID], [Metric], [Threshold], [ResultValue], [ResultLower], [ResultUpper], [ResultN], [ResultDetails], [ActivatedAt], [ApprovedByUserID], [RetiredAt], [BackfilledAt]
        FROM [${flyway:defaultSchema}].[FeaturePipelineVersion]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeaturePipelineVersions_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeaturePipelineVersions_PromptID_cursor INTO @MJFeaturePipelineVersions_PromptIDID, @MJFeaturePipelineVersions_PromptID_RecordProcessID, @MJFeaturePipelineVersions_PromptID_Version, @MJFeaturePipelineVersions_PromptID_PinHash, @MJFeaturePipelineVersions_PromptID_SpecHash, @MJFeaturePipelineVersions_PromptID_PromptID, @MJFeaturePipelineVersions_PromptID_PromptVersionHash, @MJFeaturePipelineVersions_PromptID_AIModelID, @MJFeaturePipelineVersions_PromptID_ParametersHash, @MJFeaturePipelineVersions_PromptID_Status, @MJFeaturePipelineVersions_PromptID_Gated, @MJFeaturePipelineVersions_PromptID_GoldenSetTestID, @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID, @MJFeaturePipelineVersions_PromptID_Metric, @MJFeaturePipelineVersions_PromptID_Threshold, @MJFeaturePipelineVersions_PromptID_ResultValue, @MJFeaturePipelineVersions_PromptID_ResultLower, @MJFeaturePipelineVersions_PromptID_ResultUpper, @MJFeaturePipelineVersions_PromptID_ResultN, @MJFeaturePipelineVersions_PromptID_ResultDetails, @MJFeaturePipelineVersions_PromptID_ActivatedAt, @MJFeaturePipelineVersions_PromptID_ApprovedByUserID, @MJFeaturePipelineVersions_PromptID_RetiredAt, @MJFeaturePipelineVersions_PromptID_BackfilledAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeaturePipelineVersions_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeaturePipelineVersion] @ID = @MJFeaturePipelineVersions_PromptIDID, @RecordProcessID = @MJFeaturePipelineVersions_PromptID_RecordProcessID, @Version = @MJFeaturePipelineVersions_PromptID_Version, @PinHash = @MJFeaturePipelineVersions_PromptID_PinHash, @SpecHash = @MJFeaturePipelineVersions_PromptID_SpecHash, @PromptID_Clear = 1, @PromptID = @MJFeaturePipelineVersions_PromptID_PromptID, @PromptVersionHash = @MJFeaturePipelineVersions_PromptID_PromptVersionHash, @AIModelID = @MJFeaturePipelineVersions_PromptID_AIModelID, @ParametersHash = @MJFeaturePipelineVersions_PromptID_ParametersHash, @Status = @MJFeaturePipelineVersions_PromptID_Status, @Gated = @MJFeaturePipelineVersions_PromptID_Gated, @GoldenSetTestID = @MJFeaturePipelineVersions_PromptID_GoldenSetTestID, @GoldenSetTestRunID = @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID, @Metric = @MJFeaturePipelineVersions_PromptID_Metric, @Threshold = @MJFeaturePipelineVersions_PromptID_Threshold, @ResultValue = @MJFeaturePipelineVersions_PromptID_ResultValue, @ResultLower = @MJFeaturePipelineVersions_PromptID_ResultLower, @ResultUpper = @MJFeaturePipelineVersions_PromptID_ResultUpper, @ResultN = @MJFeaturePipelineVersions_PromptID_ResultN, @ResultDetails = @MJFeaturePipelineVersions_PromptID_ResultDetails, @ActivatedAt = @MJFeaturePipelineVersions_PromptID_ActivatedAt, @ApprovedByUserID = @MJFeaturePipelineVersions_PromptID_ApprovedByUserID, @RetiredAt = @MJFeaturePipelineVersions_PromptID_RetiredAt, @BackfilledAt = @MJFeaturePipelineVersions_PromptID_BackfilledAt

        FETCH NEXT FROM cascade_update_MJFeaturePipelineVersions_PromptID_cursor INTO @MJFeaturePipelineVersions_PromptIDID, @MJFeaturePipelineVersions_PromptID_RecordProcessID, @MJFeaturePipelineVersions_PromptID_Version, @MJFeaturePipelineVersions_PromptID_PinHash, @MJFeaturePipelineVersions_PromptID_SpecHash, @MJFeaturePipelineVersions_PromptID_PromptID, @MJFeaturePipelineVersions_PromptID_PromptVersionHash, @MJFeaturePipelineVersions_PromptID_AIModelID, @MJFeaturePipelineVersions_PromptID_ParametersHash, @MJFeaturePipelineVersions_PromptID_Status, @MJFeaturePipelineVersions_PromptID_Gated, @MJFeaturePipelineVersions_PromptID_GoldenSetTestID, @MJFeaturePipelineVersions_PromptID_GoldenSetTestRunID, @MJFeaturePipelineVersions_PromptID_Metric, @MJFeaturePipelineVersions_PromptID_Threshold, @MJFeaturePipelineVersions_PromptID_ResultValue, @MJFeaturePipelineVersions_PromptID_ResultLower, @MJFeaturePipelineVersions_PromptID_ResultUpper, @MJFeaturePipelineVersions_PromptID_ResultN, @MJFeaturePipelineVersions_PromptID_ResultDetails, @MJFeaturePipelineVersions_PromptID_ActivatedAt, @MJFeaturePipelineVersions_PromptID_ApprovedByUserID, @MJFeaturePipelineVersions_PromptID_RetiredAt, @MJFeaturePipelineVersions_PromptID_BackfilledAt
    END

    CLOSE cascade_update_MJFeaturePipelineVersions_PromptID_cursor
    DEALLOCATE cascade_update_MJFeaturePipelineVersions_PromptID_cursor
    
    -- Cascade delete from FeatureValueCache using cursor to call spDeleteFeatureValueCache
    DECLARE @MJFeatureValueCaches_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJFeatureValueCaches_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[FeatureValueCache]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJFeatureValueCaches_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJFeatureValueCaches_PromptID_cursor INTO @MJFeatureValueCaches_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteFeatureValueCache] @ID = @MJFeatureValueCaches_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJFeatureValueCaches_PromptID_cursor INTO @MJFeatureValueCaches_PromptIDID
    END
    
    CLOSE cascade_delete_MJFeatureValueCaches_PromptID_cursor
    DEALLOCATE cascade_delete_MJFeatureValueCaches_PromptID_cursor
    
    -- Cascade update on FeatureValue using cursor to call spUpdateFeatureValue
    DECLARE @MJFeatureValues_PromptIDID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_RecordProcessID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_EntityID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_RecordID nvarchar(900)
    DECLARE @MJFeatureValues_PromptID_FeatureName nvarchar(255)
    DECLARE @MJFeatureValues_PromptID_ValueText nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_ValueNumeric float(53)
    DECLARE @MJFeatureValues_PromptID_ValueDate datetimeoffset
    DECLARE @MJFeatureValues_PromptID_ValueBoolean bit
    DECLARE @MJFeatureValues_PromptID_ValueJSON nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_Reasoning nvarchar(MAX)
    DECLARE @MJFeatureValues_PromptID_Confidence float(53)
    DECLARE @MJFeatureValues_PromptID_PromptID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_PromptVersionHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ConstraintHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ProcessRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ProcessRunDetailID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_AIPromptRunID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_FeatureValueCacheID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ComputedAt datetimeoffset
    DECLARE @MJFeatureValues_PromptID_PipelineVersion int
    DECLARE @MJFeatureValues_PromptID_AIModelID uniqueidentifier
    DECLARE @MJFeatureValues_PromptID_ParametersHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_InputHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_ValueKeyHash nvarchar(64)
    DECLARE @MJFeatureValues_PromptID_Source nvarchar(20)
    DECLARE @MJFeatureValues_PromptID_EffectiveAsOf datetimeoffset
    DECLARE @MJFeatureValues_PromptID_InputAsOf datetimeoffset
    DECLARE cascade_update_MJFeatureValues_PromptID_cursor CURSOR FOR
        SELECT [ID], [RecordProcessID], [EntityID], [RecordID], [FeatureName], [ValueText], [ValueNumeric], [ValueDate], [ValueBoolean], [ValueJSON], [Reasoning], [Confidence], [PromptID], [PromptVersionHash], [ConstraintHash], [ProcessRunID], [ProcessRunDetailID], [AIPromptRunID], [FeatureValueCacheID], [ComputedAt], [PipelineVersion], [AIModelID], [ParametersHash], [InputHash], [ValueKeyHash], [Source], [EffectiveAsOf], [InputAsOf]
        FROM [${flyway:defaultSchema}].[FeatureValue]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJFeatureValues_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source, @MJFeatureValues_PromptID_EffectiveAsOf, @MJFeatureValues_PromptID_InputAsOf

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJFeatureValues_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateFeatureValue] @ID = @MJFeatureValues_PromptIDID, @RecordProcessID = @MJFeatureValues_PromptID_RecordProcessID, @EntityID = @MJFeatureValues_PromptID_EntityID, @RecordID = @MJFeatureValues_PromptID_RecordID, @FeatureName = @MJFeatureValues_PromptID_FeatureName, @ValueText = @MJFeatureValues_PromptID_ValueText, @ValueNumeric = @MJFeatureValues_PromptID_ValueNumeric, @ValueDate = @MJFeatureValues_PromptID_ValueDate, @ValueBoolean = @MJFeatureValues_PromptID_ValueBoolean, @ValueJSON = @MJFeatureValues_PromptID_ValueJSON, @Reasoning = @MJFeatureValues_PromptID_Reasoning, @Confidence = @MJFeatureValues_PromptID_Confidence, @PromptID_Clear = 1, @PromptID = @MJFeatureValues_PromptID_PromptID, @PromptVersionHash = @MJFeatureValues_PromptID_PromptVersionHash, @ConstraintHash = @MJFeatureValues_PromptID_ConstraintHash, @ProcessRunID = @MJFeatureValues_PromptID_ProcessRunID, @ProcessRunDetailID = @MJFeatureValues_PromptID_ProcessRunDetailID, @AIPromptRunID = @MJFeatureValues_PromptID_AIPromptRunID, @FeatureValueCacheID = @MJFeatureValues_PromptID_FeatureValueCacheID, @ComputedAt = @MJFeatureValues_PromptID_ComputedAt, @PipelineVersion = @MJFeatureValues_PromptID_PipelineVersion, @AIModelID = @MJFeatureValues_PromptID_AIModelID, @ParametersHash = @MJFeatureValues_PromptID_ParametersHash, @InputHash = @MJFeatureValues_PromptID_InputHash, @ValueKeyHash = @MJFeatureValues_PromptID_ValueKeyHash, @Source = @MJFeatureValues_PromptID_Source, @EffectiveAsOf = @MJFeatureValues_PromptID_EffectiveAsOf, @InputAsOf = @MJFeatureValues_PromptID_InputAsOf

        FETCH NEXT FROM cascade_update_MJFeatureValues_PromptID_cursor INTO @MJFeatureValues_PromptIDID, @MJFeatureValues_PromptID_RecordProcessID, @MJFeatureValues_PromptID_EntityID, @MJFeatureValues_PromptID_RecordID, @MJFeatureValues_PromptID_FeatureName, @MJFeatureValues_PromptID_ValueText, @MJFeatureValues_PromptID_ValueNumeric, @MJFeatureValues_PromptID_ValueDate, @MJFeatureValues_PromptID_ValueBoolean, @MJFeatureValues_PromptID_ValueJSON, @MJFeatureValues_PromptID_Reasoning, @MJFeatureValues_PromptID_Confidence, @MJFeatureValues_PromptID_PromptID, @MJFeatureValues_PromptID_PromptVersionHash, @MJFeatureValues_PromptID_ConstraintHash, @MJFeatureValues_PromptID_ProcessRunID, @MJFeatureValues_PromptID_ProcessRunDetailID, @MJFeatureValues_PromptID_AIPromptRunID, @MJFeatureValues_PromptID_FeatureValueCacheID, @MJFeatureValues_PromptID_ComputedAt, @MJFeatureValues_PromptID_PipelineVersion, @MJFeatureValues_PromptID_AIModelID, @MJFeatureValues_PromptID_ParametersHash, @MJFeatureValues_PromptID_InputHash, @MJFeatureValues_PromptID_ValueKeyHash, @MJFeatureValues_PromptID_Source, @MJFeatureValues_PromptID_EffectiveAsOf, @MJFeatureValues_PromptID_InputAsOf
    END

    CLOSE cascade_update_MJFeatureValues_PromptID_cursor
    DEALLOCATE cascade_update_MJFeatureValues_PromptID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_PromptIDID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_PromptID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_PromptID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_PromptID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_PromptID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_PromptID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_PromptID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_PromptID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_PromptID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_PromptID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_PromptID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_PromptID_BatchSize int
    DECLARE @MJRecordProcesses_PromptID_MaxConcurrency int
    DECLARE @MJRecordProcesses_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_PromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJRecordProcesses_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_PromptIDID, @Name = @MJRecordProcesses_PromptID_Name, @Description = @MJRecordProcesses_PromptID_Description, @CategoryID = @MJRecordProcesses_PromptID_CategoryID, @EntityID = @MJRecordProcesses_PromptID_EntityID, @Status = @MJRecordProcesses_PromptID_Status, @WorkType = @MJRecordProcesses_PromptID_WorkType, @ActionID = @MJRecordProcesses_PromptID_ActionID, @AgentID = @MJRecordProcesses_PromptID_AgentID, @PromptID_Clear = 1, @PromptID = @MJRecordProcesses_PromptID_PromptID, @ScopeType = @MJRecordProcesses_PromptID_ScopeType, @ScopeViewID = @MJRecordProcesses_PromptID_ScopeViewID, @ScopeListID = @MJRecordProcesses_PromptID_ScopeListID, @ScopeFilter = @MJRecordProcesses_PromptID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_PromptID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_PromptID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_PromptID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_PromptID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_PromptID_CronExpression, @Timezone = @MJRecordProcesses_PromptID_Timezone, @OnDemandEnabled = @MJRecordProcesses_PromptID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_PromptID_InputMapping, @OutputMapping = @MJRecordProcesses_PromptID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_PromptID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_PromptID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_PromptID_BatchSize, @MaxConcurrency = @MJRecordProcesses_PromptID_MaxConcurrency, @Configuration = @MJRecordProcesses_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_PromptID_cursor INTO @MJRecordProcesses_PromptIDID, @MJRecordProcesses_PromptID_Name, @MJRecordProcesses_PromptID_Description, @MJRecordProcesses_PromptID_CategoryID, @MJRecordProcesses_PromptID_EntityID, @MJRecordProcesses_PromptID_Status, @MJRecordProcesses_PromptID_WorkType, @MJRecordProcesses_PromptID_ActionID, @MJRecordProcesses_PromptID_AgentID, @MJRecordProcesses_PromptID_PromptID, @MJRecordProcesses_PromptID_ScopeType, @MJRecordProcesses_PromptID_ScopeViewID, @MJRecordProcesses_PromptID_ScopeListID, @MJRecordProcesses_PromptID_ScopeFilter, @MJRecordProcesses_PromptID_OnChangeEnabled, @MJRecordProcesses_PromptID_OnChangeInvocationType, @MJRecordProcesses_PromptID_OnChangeFilter, @MJRecordProcesses_PromptID_ScheduleEnabled, @MJRecordProcesses_PromptID_CronExpression, @MJRecordProcesses_PromptID_Timezone, @MJRecordProcesses_PromptID_OnDemandEnabled, @MJRecordProcesses_PromptID_InputMapping, @MJRecordProcesses_PromptID_OutputMapping, @MJRecordProcesses_PromptID_SkipUnchanged, @MJRecordProcesses_PromptID_WatermarkStrategy, @MJRecordProcesses_PromptID_BatchSize, @MJRecordProcesses_PromptID_MaxConcurrency, @MJRecordProcesses_PromptID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_PromptID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_PromptID_cursor
    
    -- Cascade delete from ScopedPromptConfig using cursor to call spDeleteScopedPromptConfig
    DECLARE @MJScopedPromptConfigs_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptConfigs_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptConfig]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptConfig] @ID = @MJScopedPromptConfigs_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptConfigs_PromptID_cursor INTO @MJScopedPromptConfigs_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptConfigs_PromptID_cursor
    
    -- Cascade delete from ScopedPromptPart using cursor to call spDeleteScopedPromptPart
    DECLARE @MJScopedPromptParts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJScopedPromptParts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScopedPromptPart]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJScopedPromptParts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScopedPromptPart] @ID = @MJScopedPromptParts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJScopedPromptParts_PromptID_cursor INTO @MJScopedPromptParts_PromptIDID
    END
    
    CLOSE cascade_delete_MJScopedPromptParts_PromptID_cursor
    DEALLOCATE cascade_delete_MJScopedPromptParts_PromptID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_PromptIDID uniqueidentifier
    DECLARE @MJTasks_PromptID_ParentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Name nvarchar(255)
    DECLARE @MJTasks_PromptID_Description nvarchar(MAX)
    DECLARE @MJTasks_PromptID_TypeID uniqueidentifier
    DECLARE @MJTasks_PromptID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_PromptID_ProjectID uniqueidentifier
    DECLARE @MJTasks_PromptID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_PromptID_UserID uniqueidentifier
    DECLARE @MJTasks_PromptID_AgentID uniqueidentifier
    DECLARE @MJTasks_PromptID_Status nvarchar(50)
    DECLARE @MJTasks_PromptID_PercentComplete int
    DECLARE @MJTasks_PromptID_DueAt datetimeoffset
    DECLARE @MJTasks_PromptID_StartedAt datetimeoffset
    DECLARE @MJTasks_PromptID_CompletedAt datetimeoffset
    DECLARE @MJTasks_PromptID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_PromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_PromptID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_PromptID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_PromptID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_PromptID_ActionID uniqueidentifier
    DECLARE @MJTasks_PromptID_StepType nvarchar(20)
    DECLARE @MJTasks_PromptID_PromptID uniqueidentifier
    DECLARE @MJTasks_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_PromptID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJTasks_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_PromptIDID, @ParentID = @MJTasks_PromptID_ParentID, @Name = @MJTasks_PromptID_Name, @Description = @MJTasks_PromptID_Description, @TypeID = @MJTasks_PromptID_TypeID, @EnvironmentID = @MJTasks_PromptID_EnvironmentID, @ProjectID = @MJTasks_PromptID_ProjectID, @ConversationDetailID = @MJTasks_PromptID_ConversationDetailID, @UserID = @MJTasks_PromptID_UserID, @AgentID = @MJTasks_PromptID_AgentID, @Status = @MJTasks_PromptID_Status, @PercentComplete = @MJTasks_PromptID_PercentComplete, @DueAt = @MJTasks_PromptID_DueAt, @StartedAt = @MJTasks_PromptID_StartedAt, @CompletedAt = @MJTasks_PromptID_CompletedAt, @InputPayload = @MJTasks_PromptID_InputPayload, @OutputPayload = @MJTasks_PromptID_OutputPayload, @ErrorMessage = @MJTasks_PromptID_ErrorMessage, @AgentRunID = @MJTasks_PromptID_AgentRunID, @ClaimedBy = @MJTasks_PromptID_ClaimedBy, @ClaimExpiresAt = @MJTasks_PromptID_ClaimExpiresAt, @ActionID = @MJTasks_PromptID_ActionID, @StepType = @MJTasks_PromptID_StepType, @PromptID_Clear = 1, @PromptID = @MJTasks_PromptID_PromptID, @Configuration = @MJTasks_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_PromptID_cursor INTO @MJTasks_PromptIDID, @MJTasks_PromptID_ParentID, @MJTasks_PromptID_Name, @MJTasks_PromptID_Description, @MJTasks_PromptID_TypeID, @MJTasks_PromptID_EnvironmentID, @MJTasks_PromptID_ProjectID, @MJTasks_PromptID_ConversationDetailID, @MJTasks_PromptID_UserID, @MJTasks_PromptID_AgentID, @MJTasks_PromptID_Status, @MJTasks_PromptID_PercentComplete, @MJTasks_PromptID_DueAt, @MJTasks_PromptID_StartedAt, @MJTasks_PromptID_CompletedAt, @MJTasks_PromptID_InputPayload, @MJTasks_PromptID_OutputPayload, @MJTasks_PromptID_ErrorMessage, @MJTasks_PromptID_AgentRunID, @MJTasks_PromptID_ClaimedBy, @MJTasks_PromptID_ClaimExpiresAt, @MJTasks_PromptID_ActionID, @MJTasks_PromptID_StepType, @MJTasks_PromptID_PromptID, @MJTasks_PromptID_Configuration
    END

    CLOSE cascade_update_MJTasks_PromptID_cursor
    DEALLOCATE cascade_update_MJTasks_PromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e9577966-e25e-422b-975b-08ede8bcd093' OR (EntityID = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND Name = 'LineageRoot')) BEGIN
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
            'e9577966-e25e-422b-975b-08ede8bcd093',
            '8F160CCC-8743-40FE-B2B1-0799829CDBDA', -- Entity: MJ: Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA'),
            'LineageRoot',
            'Lineage Root',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92a67137-2316-4104-a89a-eb24cc809b71' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'Pipeline')) BEGIN
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
            '92a67137-2316-4104-a89a-eb24cc809b71',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'Pipeline',
            'Pipeline',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7d8769c-ddab-43cf-936c-ea720df757a9' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'PredictionUnit')) BEGIN
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
            'a7d8769c-ddab-43cf-936c-ea720df757a9',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'PredictionUnit',
            'Prediction Unit',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f3a1925-8c21-4cec-993a-0f7ea11ff15e' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'EvaluationProtocol')) BEGIN
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
            '4f3a1925-8c21-4cec-993a-0f7ea11ff15e',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'EvaluationProtocol',
            'Evaluation Protocol',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57d7b31b-ccd8-4175-8eb4-11defb91dab4' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'StorageProvider')) BEGIN
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
            '57d7b31b-ccd8-4175-8eb4-11defb91dab4',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'StorageProvider',
            'Storage Provider',
            NULL,
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc088b2c-80a5-479e-93ab-660e93836fd5' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'MatrixFile')) BEGIN
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
            'bc088b2c-80a5-479e-93ab-660e93836fd5',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'MatrixFile',
            'Matrix File',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18ad627c-925b-401c-b3da-55f82a850675' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'RowManifestFile')) BEGIN
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
            '18ad627c-925b-401c-b3da-55f82a850675',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'RowManifestFile',
            'Row Manifest File',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f974d613-4210-43b7-99ba-235e38c74072' OR (EntityID = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND Name = 'ProvenanceFile')) BEGIN
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
            'f974d613-4210-43b7-99ba-235e38c74072',
            '947FF197-FAAF-4557-AE52-6FDCF4313762', -- Entity: MJ: Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762'),
            'ProvenanceFile',
            'Provenance File',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '125928c4-0807-4e8f-b75e-1b83173b7b73' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'EvaluationProtocol')) BEGIN
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
            '125928c4-0807-4e8f-b75e-1b83173b7b73',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'EvaluationProtocol',
            'Evaluation Protocol',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66512d06-519c-4cf9-bfe1-043c13410b28' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'PredictionUnit')) BEGIN
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
            '66512d06-519c-4cf9-bfe1-043c13410b28',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA'),
            'PredictionUnit',
            'Prediction Unit',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5b566c3-0ea4-4548-b08f-db40ee9a4c7f' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'EvaluationProtocol')) BEGIN
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
            'd5b566c3-0ea4-4548-b08f-db40ee9a4c7f',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA'),
            'EvaluationProtocol',
            'Evaluation Protocol',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8177c60c-2607-464d-a5a2-8acc2f5da40b' OR (EntityID = '0B0C469C-146C-4731-B064-CCB391D67889' AND Name = 'LineageRoot')) BEGIN
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
            '8177c60c-2607-464d-a5a2-8acc2f5da40b',
            '0B0C469C-146C-4731-B064-CCB391D67889', -- Entity: MJ: Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889'),
            'LineageRoot',
            'Lineage Root',
            NULL,
            'nvarchar',
            510,
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
               WHERE ID = 'AA666C1A-8280-4DBB-B5E2-1959185725D9'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B65EC6C7-30E1-4E85-A131-94AC3EB7656B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E9577966-E25E-422B-975B-08EDE8BCD093'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B636042B-BC4B-4526-B70F-B7E40B43827C'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Feature Values.EffectiveAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7CEEC4F5-82F2-465D-A196-263A555A9274';

-- UPDATE Entity Field Category Info MJ: Feature Values.InputAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6312095-3040-470C-8E28-7096E2AE6766';

/* Set categories for 4 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit'
WHERE 
   ID = '3A27B360-4935-48B6-A46A-62F39FFF939C';

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Safety',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '6B14E812-7B20-493A-AD29-53AFE948E662';

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit Name'
WHERE 
   ID = '66512D06-519C-4CF9-BFE1-043C13410B28';

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Safety',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Name'
WHERE 
   ID = 'D5B566C3-0EA4-4548-B08F-DB40EE9A4C7F';

/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Runs.TrainingSnapshotID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Snapshot'
WHERE 
   ID = 'CE8B8910-7580-452F-8DBA-B0B99D24379C';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '4639BF78-3A72-4A69-9299-C5C6F5A24F68';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.CodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '980D96A7-29A4-4E06-986C-823ECCBBEDEC';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ComputeSeconds 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Usage',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AA666C1A-8280-4DBB-B5E2-1959185725D9';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Details'
WHERE 
   ID = '125928C4-0807-4E8F-B75E-1B83173B7B73';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'A0F6B242-8C4C-415F-904B-FC0FF1D82F27'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1B7B804D-3522-4A64-9C45-ED33E2578277'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EB2935AE-7B24-4B97-BEAB-74E031EA5A7D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3B6F7084-15B3-456E-BCA2-91ECD6442599'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D0CB2EBE-9E53-40DB-9007-CB287D8AC3B3'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 21 fields */

-- UPDATE Entity Field Category Info MJ: Prediction Units.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AC8D46D3-B0A5-41CF-9A56-B9DB7E2DB126';

-- UPDATE Entity Field Category Info MJ: Prediction Units.LineageRootID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Lineage Root'
WHERE 
   ID = '16564F1C-1781-4768-AC1B-A72C51D66B8B';

-- UPDATE Entity Field Category Info MJ: Prediction Units.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CAE6FDCE-1F4B-40D0-91B7-E781F0A9B500';

-- UPDATE Entity Field Category Info MJ: Prediction Units.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prediction Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B636042B-BC4B-4526-B70F-B7E40B43827C';

-- UPDATE Entity Field Category Info MJ: Prediction Units.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prediction Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '054392D0-ECFA-4740-828A-02F6D873CBDF';

-- UPDATE Entity Field Category Info MJ: Prediction Units.UnitRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Unit and Grain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '0F9D59E5-DDB8-4735-9AA5-7A342C82297A';

-- UPDATE Entity Field Category Info MJ: Prediction Units.LabelRule 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '8EB9C42B-50E4-4144-A886-4D0B1C98F937';

-- UPDATE Entity Field Category Info MJ: Prediction Units.LabelWindowDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3A58CE37-8D6C-4161-871F-CB6397078A18';

-- UPDATE Entity Field Category Info MJ: Prediction Units.LabelGapDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6B029681-7B2A-4323-9B99-ACC02501D4C4';

-- UPDATE Entity Field Category Info MJ: Prediction Units.TaskType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task and Decision Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '4456C4B2-ECE1-4FEB-9663-196541455543';

-- UPDATE Entity Field Category Info MJ: Prediction Units.LabelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DF2DF49B-2441-47B7-9CBF-C8173B62C7E7';

-- UPDATE Entity Field Category Info MJ: Prediction Units.Censoring 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Unit and Grain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D03DC2F6-BC4A-46F3-8C6F-7FC6AB0B1959';

-- UPDATE Entity Field Category Info MJ: Prediction Units.ChangeHistoryPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Unit and Grain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '56DFCD6B-21DF-4001-89AF-077904C55961';

-- UPDATE Entity Field Category Info MJ: Prediction Units.GroupKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Unit and Grain Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B65EC6C7-30E1-4E85-A131-94AC3EB7656B';

-- UPDATE Entity Field Category Info MJ: Prediction Units.TemporalSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task and Decision Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '8AB16416-1E1B-407D-B668-8337CA302DCB';

-- UPDATE Entity Field Category Info MJ: Prediction Units.DecisionSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task and Decision Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '06C64FC5-C28B-44EA-B302-E476E217E825';

-- UPDATE Entity Field Category Info MJ: Prediction Units.IncumbentHeuristic 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Task and Decision Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '09145C46-36E1-454F-A3F6-58E1569C5704';

-- UPDATE Entity Field Category Info MJ: Prediction Units.AuthoredBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C530988D-862C-4803-B13C-38D78D871542';

-- UPDATE Entity Field Category Info MJ: Prediction Units.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F35FE58D-4A7F-4748-A485-7ABE68E2901F';

-- UPDATE Entity Field Category Info MJ: Prediction Units.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E38AFCD3-E459-4408-B8FE-993B0491A920';

-- UPDATE Entity Field Category Info MJ: Prediction Units.LineageRoot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E9577966-E25E-422B-975B-08EDE8BCD093';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('28bd7c80-5b73-5f29-a8bb-d0cb15e69dc4', '8F160CCC-8743-40FE-B2B1-0799829CDBDA', 'FieldCategoryInfo', '{
  "Outcome and Labeling": {
    "description": "Rules and windows for observing and labeling outcomes",
    "icon": "fa fa-tag"
  },
  "Prediction Definition": {
    "description": "Core descriptive information and identity of the prediction unit",
    "icon": "fa fa-file-alt"
  },
  "System Metadata": {
    "description": "System-managed audit, versioning, and tracking fields",
    "icon": "fa fa-cog"
  },
  "Task and Decision Settings": {
    "description": "Machine learning task types, temporal specs, and decision parameters",
    "icon": "fa fa-cogs"
  },
  "Unit and Grain Configuration": {
    "description": "Configuration rules defining training rows, grain, censoring, and history",
    "icon": "fa fa-sliders-h"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2b1cf741-3fde-59f4-af5b-f198e1554887', '8F160CCC-8743-40FE-B2B1-0799829CDBDA', 'FieldCategoryIcons', '{
  "Outcome and Labeling": "fa fa-tag",
  "Prediction Definition": "fa fa-file-alt",
  "System Metadata": "fa fa-cog",
  "Task and Decision Settings": "fa fa-cogs",
  "Unit and Grain Configuration": "fa fa-sliders-h"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '8F160CCC-8743-40FE-B2B1-0799829CDBDA';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EAA27903-181E-4CAE-B5F1-DC9E09A95B99'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BBE9C397-250A-4F9F-BE6F-3AE4A08068A7'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 42 fields */

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ContentHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A0F6B242-8C4C-415F-904B-FC0FF1D82F27';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.PipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pipeline'
WHERE 
   ID = 'B378836D-E724-4F0B-8041-81FACDEC8644';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit'
WHERE 
   ID = '7CAF679B-4A83-45E4-BE1F-5FEA308ED03A';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.LabelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D2FE84CF-E581-4BA2-B5AB-61D43CFD7FD2';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.FeatureSpecVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9FB556D7-DC88-4E58-A113-9C394805138C';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '9587F907-23EE-4F46-A8BF-18DA1CD112FB';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.StorageProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Provider'
WHERE 
   ID = '78E9F5E7-AF2A-46D5-9305-6AE12B29B283';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.MatrixFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix File'
WHERE 
   ID = '081C2C3D-F102-4FBF-AF31-BD8C435427F8';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.MatrixSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix SHA-256'
WHERE 
   ID = '52F24C48-931C-4212-8BF3-DDE543971714';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.MatrixSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix Size (Bytes)'
WHERE 
   ID = '1BA05957-D3FB-4043-B0BF-D4C76C5FA993';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.RowManifestFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest File'
WHERE 
   ID = '996B9364-8C11-4046-902D-AEE414F3C7BD';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.RowManifestSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest SHA-256'
WHERE 
   ID = '6616E878-29B1-4F7A-A84C-DF4C9D3F7710';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.RowManifestSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest Size (Bytes)'
WHERE 
   ID = 'F9690459-17D5-46A3-87DA-33624BEAFDF1';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ProvenanceFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance File'
WHERE 
   ID = '6F468FEE-462C-4A24-8DB2-AFDB40718B8D';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ProvenanceSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance SHA-256'
WHERE 
   ID = 'F9BF5E7D-113A-45D5-BF30-3B0D5166BB5F';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ProvenanceSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance Size (Bytes)'
WHERE 
   ID = '2EF30714-7E7B-47DF-A10F-CD6966C7F945';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ManifestRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Statistics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1B7B804D-3522-4A64-9C45-ED33E2578277';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.HoldoutRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Statistics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EB2935AE-7B24-4B97-BEAB-74E031EA5A7D';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.FeatureSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '47EE8BA7-1287-4E84-94C1-28E31AAFEEC7';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.FeatureSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '3FF74780-54EB-4A27-AE70-88F968372B1F';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Specifications',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '825F178D-8871-49F5-A757-51B81E8DC0B2';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ColumnProvenance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D182B640-205C-400D-BAC8-AA5B0A418AF7';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.PinnedFeatureVersions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '2FACFFDF-87D1-40A6-9444-BFD3ADA2CFAE';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.RowsRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A0FB3BFC-91A9-4258-93C8-D22C5EA96978';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ReadComplete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E85AE20A-F1F0-40CA-9398-8B9D274C4894';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.CensoredRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '54FFB93E-2BAD-43B5-BE78-7C1344724C67';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.LabelKnownRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D45567A0-364F-4CBF-8CFC-F4B2366BD49D';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.EmptyLabelRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8EFD75EC-E558-46DE-B701-73B6676792CE';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.UncoveredHistoryRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '15764390-A402-46F5-9937-4B532D72C0D1';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.DuplicateRowsRemoved 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Processing Exclusions',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DD4BCBDC-40F8-48DA-9805-743BB3D67FCB';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ClassBalance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assembly Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '747D5D3C-9F5E-4D04-ACB2-2EC279EC9A50';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.DataCutoff 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assembly Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3B6F7084-15B3-456E-BCA2-91ECD6442599';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.AssemblyCodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assembly Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1AED42F4-E861-4158-8EE7-11F8D3CCC7BC';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D0CB2EBE-9E53-40DB-9007-CB287D8AC3B3';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '878B22AB-4F36-4FAB-8EC8-CC3C359610A2';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.Pipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pipeline Name'
WHERE 
   ID = '92A67137-2316-4104-A89A-EB24CC809B71';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit Name'
WHERE 
   ID = 'A7D8769C-DDAB-43CF-936C-EA720DF757A9';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Name'
WHERE 
   ID = '4F3A1925-8C21-4CEC-993A-0F7EA11FF15E';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.StorageProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Provider Name'
WHERE 
   ID = '57D7B31B-CCD8-4175-8EB4-11DEFB91DAB4';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.MatrixFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix File Details'
WHERE 
   ID = 'BC088B2C-80A5-479E-93AB-660E93836FD5';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.RowManifestFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest File Details'
WHERE 
   ID = '18AD627C-925B-401C-B3DA-55F82A850675';

-- UPDATE Entity Field Category Info MJ: Training Snapshots.ProvenanceFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance File Details'
WHERE 
   ID = 'F974D613-4210-43B7-99BA-235E38C74072';

/* Set entity icon to fa fa-database */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-database', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '947FF197-FAAF-4557-AE52-6FDCF4313762';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dbb7153b-bb91-58ca-8b3d-1279a85bbe1d', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'FieldCategoryInfo', '{
  "Assembly Metadata": {
    "description": "Execution environment, cutoff dates, class balances, and code versions used during assembly",
    "icon": "fa fa-cogs"
  },
  "Feature Specifications": {
    "description": "Feature schemas, specifications, provenance, and version pins",
    "icon": "fa fa-code"
  },
  "File Storage": {
    "description": "Metadata, hashes, and file references for snapshot storage files",
    "icon": "fa fa-file-archive"
  },
  "Row Processing Exclusions": {
    "description": "Metrics and counts regarding rows read and various exclusion rules applied",
    "icon": "fa fa-filter"
  },
  "Row Statistics": {
    "description": "Row counts and holdout metrics for the snapshot",
    "icon": "fa fa-list-ol"
  },
  "Snapshot Identity": {
    "description": "Core identifiers, hashes, and version details defining the training snapshot",
    "icon": "fa fa-fingerprint"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2f1b390c-57ea-52b3-9f04-267e6bcc5670', '947FF197-FAAF-4557-AE52-6FDCF4313762', 'FieldCategoryIcons', '{
  "Assembly Metadata": "fa fa-cogs",
  "Feature Specifications": "fa fa-code",
  "File Storage": "fa fa-file-archive",
  "Row Processing Exclusions": "fa fa-filter",
  "Row Statistics": "fa fa-list-ol",
  "Snapshot Identity": "fa fa-fingerprint",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '947FF197-FAAF-4557-AE52-6FDCF4313762';

/* Set categories for 31 fields */

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '820307AD-A880-43F9-BF4F-B372952280A2';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.LineageRootID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '681C028A-CC37-40CF-93A2-184DD7848FDC';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BB775E4A-B311-47D4-AE71-E5373574FE88';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Protocol Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BBE9C397-250A-4F9F-BE6F-3AE4A08068A7';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Protocol Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '56BADE9A-C2D3-4864-AA87-83F5939F0636';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Holdout 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Holdout',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '836279D3-A61F-4743-8EAD-48DFE3A7ABF6';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.InnerValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Holdout',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '5E6C119F-6339-4B5D-BDAE-FE1182E077AE';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Seed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Holdout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F6E2D51E-7143-45BA-8F9D-CC4B141CF0DB';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.HoldoutAccessBudget 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Holdout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5478CE75-7A40-437E-AAC8-C15DBD5152BC';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.PrimaryScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Scoring',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'DF7406BD-4DEA-4FCB-A946-B66575ED6ECF';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.SecondaryMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Scoring',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E70A771F-996D-4EAD-96FF-FCC8A007FC65';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Baselines 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'A09DA5DA-31B6-44BF-A4E8-49929B094A3C';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Calibration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '4F99D3E0-6B55-4EF4-9F35-C9C2CEB55117';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Resampling 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'F3F04860-EB0E-4A3A-9714-88485B0E814C';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Intervals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Scoring',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6EC9E06B-1B67-445B-BD73-FDA680082832';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Promotion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Promotion and Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B44F0713-9F1E-4966-9863-7E72F5D0EC61';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.AllowedOutcomes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Promotion and Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C44EB743-E9D9-4B5A-A2F9-7027D7838435';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.LeakageAudit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audits and Guards',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E327B941-D09F-44F7-8B92-6C04AF6E4624';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Exclusions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audits and Guards',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '8D4787C0-84E4-4841-9B5B-839C4C52AB9F';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Slices 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audits and Guards',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '079EE702-E829-472E-8EC6-39DB7E068A09';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.PredictionIntervals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Scoring',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '1A7819FD-80E0-454E-9DF1-A7CEC246417B';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.ResidualDiagnostics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audits and Guards',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '4D2A5640-5A7E-4D60-9AD0-B36266D2C683';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.RetrainTriggers 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Promotion and Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E499134D-E42C-49E5-81CF-E071BA2167A7';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.SearchStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '55F5FC86-9AB7-49EE-86CA-C39FBF3FAD01';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.Budgets 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audits and Guards',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'A73475E3-3866-43C0-BADC-2E64F59E1332';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.MinMinorityClassRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Holdout',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2D43D765-A3E4-4A3A-A14F-1A2C69DBB03D';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.GuardFieldsEditableBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Protocol Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EDF32039-D2DF-4F3B-B762-4A557587D08A';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.AuthoredBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Control',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '0E34F94C-3832-48E8-AE65-A3A923015091';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EAA27903-181E-4CAE-B5F1-DC9E09A95B99';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0B2E5762-CBCC-4297-B56A-E260EB9BC88D';

-- UPDATE Entity Field Category Info MJ: Evaluation Protocols.LineageRoot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Version Control',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8177C60C-2607-464D-A5A2-8ACC2F5DA40B';

/* Set entity icon to fa fa-sliders-h */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-sliders-h', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0B0C469C-146C-4731-B064-CCB391D67889';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c79e231b-ead6-523f-9c7b-760927d825be', '0B0C469C-146C-4731-B064-CCB391D67889', 'FieldCategoryInfo', '{
  "Audits and Guards": {
    "description": "Leakage audits, exclusions, slices, residuals, and compute budgets",
    "icon": "fa fa-tasks"
  },
  "Metrics and Scoring": {
    "description": "Primary and secondary scores, intervals, and prediction metrics",
    "icon": "fa fa-chart-line"
  },
  "Model Configuration": {
    "description": "Baselines, calibration, resampling, and search strategy settings",
    "icon": "fa fa-cogs"
  },
  "Promotion and Outcomes": {
    "description": "Promotion rules, allowed outcomes, and retrain triggers",
    "icon": "fa fa-flag-checkered"
  },
  "Protocol Details": {
    "description": "General protocol naming, description, and authorship configurations",
    "icon": "fa fa-file-alt"
  },
  "Validation and Holdout": {
    "description": "Holdout split, inner validation, and data partitioning rules",
    "icon": "fa fa-shield-alt"
  },
  "Version Control": {
    "description": "Versioning lineage, history, and authorship details",
    "icon": "fa fa-code-branch"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('95a0e736-4f16-5bff-a0bd-9092b2e46c20', '0B0C469C-146C-4731-B064-CCB391D67889', 'FieldCategoryIcons', '{
  "Audits and Guards": "fa fa-tasks",
  "Metrics and Scoring": "fa fa-chart-line",
  "Model Configuration": "fa fa-cogs",
  "Promotion and Outcomes": "fa fa-flag-checkered",
  "Protocol Details": "fa fa-file-alt",
  "Validation and Holdout": "fa fa-shield-alt",
  "Version Control": "fa fa-code-branch"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '0B0C469C-146C-4731-B064-CCB391D67889';





























































/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL (SECOND PASS).
 *
 * A second CodeGen run over the schema above: the virtual name field of the new
 * ML Training Runs -> Training Snapshot link, which CodeGen can only add once the
 * Training Snapshot entity exists, and the ML Training Runs view and procedures that carry it.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace both generated sections.
 * ===================================================================================== */

/* SQL text to update entity field related entity name field map for entity field ID CE8B8910-7580-452F-8DBA-B0B99D24379C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CE8B8910-7580-452F-8DBA-B0B99D24379C', @RelatedEntityNameFieldMap='TrainingSnapshot';

/* Base View SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: vwMLTrainingRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingRuns]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJExperimentSessionIteration_ExperimentSessionIterationID.[Label] AS [ExperimentSessionIteration],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJTrainingSnapshot_TrainingSnapshotID.[ContentHash] AS [TrainingSnapshot],
    MJEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
FROM
    [${flyway:defaultSchema}].[MLTrainingRun] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExperimentSessionIteration] AS MJExperimentSessionIteration_ExperimentSessionIterationID
  ON
    [m].[ExperimentSessionIterationID] = MJExperimentSessionIteration_ExperimentSessionIterationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[TrainingSnapshot] AS MJTrainingSnapshot_TrainingSnapshotID
  ON
    [m].[TrainingSnapshotID] = MJTrainingSnapshot_TrainingSnapshotID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EvaluationProtocol] AS MJEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJEvaluationProtocol_EvaluationProtocolID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: Permissions for vwMLTrainingRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spCreateMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingRun]
    @ID uniqueidentifier = NULL,
    @PipelineID uniqueidentifier,
    @ResultingModelID_Clear bit = 0,
    @ResultingModelID uniqueidentifier = NULL,
    @ExperimentSessionIterationID_Clear bit = 0,
    @ExperimentSessionIterationID uniqueidentifier = NULL,
    @FeaturesUsed_Clear bit = 0,
    @FeaturesUsed nvarchar(MAX) = NULL,
    @AlgorithmID uniqueidentifier,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @ValidationResults_Clear bit = 0,
    @ValidationResults nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @ComputeSeconds_Clear bit = 0,
    @ComputeSeconds decimal(18, 3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingRun]
            (
                [ID],
                [PipelineID],
                [ResultingModelID],
                [ExperimentSessionIterationID],
                [FeaturesUsed],
                [AlgorithmID],
                [Hyperparameters],
                [ValidationResults],
                [Status],
                [StartedAt],
                [CompletedAt],
                [ComputeCost],
                [TokensUsed],
                [Notes],
                [TrainingSnapshotID],
                [EvaluationProtocolID],
                [CodeVersion],
                [ComputeSeconds]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PipelineID,
                CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, NULL) END,
                CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, NULL) END,
                CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, NULL) END,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingRun]
            (
                [PipelineID],
                [ResultingModelID],
                [ExperimentSessionIterationID],
                [FeaturesUsed],
                [AlgorithmID],
                [Hyperparameters],
                [ValidationResults],
                [Status],
                [StartedAt],
                [CompletedAt],
                [ComputeCost],
                [TokensUsed],
                [Notes],
                [TrainingSnapshotID],
                [EvaluationProtocolID],
                [CodeVersion],
                [ComputeSeconds]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PipelineID,
                CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, NULL) END,
                CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, NULL) END,
                CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, NULL) END,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, NULL) END,
                CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, NULL) END,
                CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, NULL) END,
                CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spUpdateMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingRun]
    @ID uniqueidentifier,
    @PipelineID uniqueidentifier = NULL,
    @ResultingModelID_Clear bit = 0,
    @ResultingModelID uniqueidentifier = NULL,
    @ExperimentSessionIterationID_Clear bit = 0,
    @ExperimentSessionIterationID uniqueidentifier = NULL,
    @FeaturesUsed_Clear bit = 0,
    @FeaturesUsed nvarchar(MAX) = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @ValidationResults_Clear bit = 0,
    @ValidationResults nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ComputeCost_Clear bit = 0,
    @ComputeCost decimal(18, 6) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @TrainingSnapshotID_Clear bit = 0,
    @TrainingSnapshotID uniqueidentifier = NULL,
    @EvaluationProtocolID_Clear bit = 0,
    @EvaluationProtocolID uniqueidentifier = NULL,
    @CodeVersion_Clear bit = 0,
    @CodeVersion nvarchar(MAX) = NULL,
    @ComputeSeconds_Clear bit = 0,
    @ComputeSeconds decimal(18, 3) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingRun]
    SET
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [ResultingModelID] = CASE WHEN @ResultingModelID_Clear = 1 THEN NULL ELSE ISNULL(@ResultingModelID, [ResultingModelID]) END,
        [ExperimentSessionIterationID] = CASE WHEN @ExperimentSessionIterationID_Clear = 1 THEN NULL ELSE ISNULL(@ExperimentSessionIterationID, [ExperimentSessionIterationID]) END,
        [FeaturesUsed] = CASE WHEN @FeaturesUsed_Clear = 1 THEN NULL ELSE ISNULL(@FeaturesUsed, [FeaturesUsed]) END,
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [Hyperparameters] = CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, [Hyperparameters]) END,
        [ValidationResults] = CASE WHEN @ValidationResults_Clear = 1 THEN NULL ELSE ISNULL(@ValidationResults, [ValidationResults]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ComputeCost] = CASE WHEN @ComputeCost_Clear = 1 THEN NULL ELSE ISNULL(@ComputeCost, [ComputeCost]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [TrainingSnapshotID] = CASE WHEN @TrainingSnapshotID_Clear = 1 THEN NULL ELSE ISNULL(@TrainingSnapshotID, [TrainingSnapshotID]) END,
        [EvaluationProtocolID] = CASE WHEN @EvaluationProtocolID_Clear = 1 THEN NULL ELSE ISNULL(@EvaluationProtocolID, [EvaluationProtocolID]) END,
        [CodeVersion] = CASE WHEN @CodeVersion_Clear = 1 THEN NULL ELSE ISNULL(@CodeVersion, [CodeVersion]) END,
        [ComputeSeconds] = CASE WHEN @ComputeSeconds_Clear = 1 THEN NULL ELSE ISNULL(@ComputeSeconds, [ComputeSeconds]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingRun
ON [${flyway:defaultSchema}].[MLTrainingRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Training Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Runs
-- Item: spDeleteMLTrainingRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac82bf5a-ecdf-4965-83e6-006a598ed146' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'TrainingSnapshot')) BEGIN
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
            'ac82bf5a-ecdf-4965-83e6-006a598ed146',
            '1A4DF72F-68E0-410C-B42C-815687BFE2D2', -- Entity: MJ: ML Training Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'),
            'TrainingSnapshot',
            'Training Snapshot',
            NULL,
            'nvarchar',
            128,
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

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Runs.TrainingSnapshot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AC82BF5A-ECDF-4965-83E6-006A598ED146';

