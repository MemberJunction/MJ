/**************************************************************************************************
 * Migration: Predictive Studio — honest training (Prediction Units, Evaluation Protocols, Training Snapshots)
 *
 *   1. MLPredictionUnit      (MJ: ML Prediction Units)       — what one training row is, its decision date,
 *                                                              outcome rule, window, censoring, task type.
 *                                                              Immutable versions; Temporal Spec inside.
 *   2. MLEvaluationProtocol  (MJ: ML Evaluation Protocols)   — the grading rules, saved before any search.
 *                                                              Immutable versions.
 *   3. MLTrainingSnapshot    (MJ: ML Training Snapshots)     — the frozen, fingerprinted training data of a run.
 *   4. MLTrainingPipeline    + PredictionUnitID, EvaluationProtocolID
 *   5. MLTrainingRun         + TrainingSnapshotID, EvaluationProtocolID, CodeVersion, ComputeSeconds
 *   6. FeatureValue          + EffectiveAsOf, InputAsOf (the as-of column shared by pipeline rows and
 *                              Source = 'Model' rows)
 *
 * A version row is never updated: "editing" inserts the next version (Version + 1, same LineageRootID).
 * Version 1's LineageRootID is its own ID (the client supplies the ID on insert).
 **************************************************************************************************/

-- ============================================================================
-- 1. MLPredictionUnit
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[MLPredictionUnit] (
    [ID]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLPredictionUnit_ID] DEFAULT (newsequentialid()),
    [LineageRootID]       UNIQUEIDENTIFIER NOT NULL,
    [Version]             INT              NOT NULL,
    [Name]                NVARCHAR(255)    NOT NULL,
    [Description]         NVARCHAR(MAX)    NULL,
    [UnitRows]            NVARCHAR(MAX)    NOT NULL,
    [LabelRule]           NVARCHAR(MAX)    NOT NULL,
    [LabelWindowDays]     INT              NOT NULL,
    [LabelGapDays]        INT              NOT NULL CONSTRAINT [DF_MLPredictionUnit_LabelGapDays] DEFAULT (0),
    [TaskType]            NVARCHAR(MAX)    NOT NULL,
    [LabelVersion]        INT              NOT NULL,
    [Censoring]           NVARCHAR(MAX)    NOT NULL,
    [ChangeHistoryPolicy] NVARCHAR(MAX)    NOT NULL,
    [GroupKey]            NVARCHAR(255)    NULL,
    [TemporalSpec]        NVARCHAR(MAX)    NULL,
    [DecisionSpec]        NVARCHAR(MAX)    NOT NULL,
    [IncumbentHeuristic]  NVARCHAR(MAX)    NOT NULL,
    [AuthoredBy]          NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT [PK_MLPredictionUnit] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_MLPredictionUnit_Lineage_Version] UNIQUE ([LineageRootID], [Version]),
    CONSTRAINT [FK_MLPredictionUnit_LineageRoot] FOREIGN KEY ([LineageRootID])
        REFERENCES [${flyway:defaultSchema}].[MLPredictionUnit] ([ID]),
    CONSTRAINT [CK_MLPredictionUnit_Version] CHECK ([Version] >= 1),
    CONSTRAINT [CK_MLPredictionUnit_LineageRoot] CHECK (([Version] = 1 AND [LineageRootID] = [ID]) OR ([Version] > 1 AND [LineageRootID] <> [ID])),
    CONSTRAINT [CK_MLPredictionUnit_LabelVersion] CHECK ([LabelVersion] >= 1 AND [LabelVersion] <= [Version]),
    CONSTRAINT [CK_MLPredictionUnit_LabelWindowDays] CHECK ([LabelWindowDays] > 0),
    CONSTRAINT [CK_MLPredictionUnit_LabelGapDays] CHECK ([LabelGapDays] >= 0)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A Prediction Unit: what one training row is (one grain record, or one grain record per period of a dated child entity), its decision date, the outcome rule and the window over which the outcome is observed, how unresolved rows are censored, and the declared task type. Every ML Training Pipeline references exactly one version. Versions are immutable rows: editing a unit inserts the next version with the same LineageRootID, so a trained model keeps pointing at the version it used.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'ID of version 1 of this unit. Version 1 points at itself; every later version points at version 1.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'LineageRootID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version number within the lineage, starting at 1. A saved version is never updated.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'Version';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the unit, e.g. "Member renewal (person x membership period)".', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the unit predicts and for whom, in plain words.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON UnitRows: {kind:"grain", grainEntity, decisionDate, filter} or {kind:"grain-x-periods", grainEntity, childEntity, foreignKey, periodDate, filter}. Defines what one row is and its decision date.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'UnitRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON LabelRule: how the outcome of a row is read — a column on the row, the next period of the same grain record, or an event in a dated child entity — always within the window that starts LabelGapDays after the decision date and lasts LabelWindowDays.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Length in days of the outcome window. A row whose window ends after the data cutoff is censored (excluded and counted).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelWindowDays';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Days between the decision date and the start of the outcome window.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelGapDays';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON TaskType: binary {classOrder, adverseIndex}, multiclass {classOrder, adverseIndices}, continuous, count, non-negative {tweediePower}, or forecast {valueKind}. Which class a score refers to and the adverse direction are derived from it, never stored separately.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'TaskType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Outcome-definition version: equals the previous version''s LabelVersion when LabelRule, LabelWindowDays, LabelGapDays and TaskType are unchanged, and that plus one otherwise.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'LabelVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CensoringRule: {rule:"exclude-unresolved", cutoff} where cutoff is {kind:"corpus-end", entity, field}, {kind:"now"} or {kind:"fixed", at}. Rows whose outcome window has not closed at the cutoff are excluded and counted.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'Censoring';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ChangeHistoryPolicy: {onUncoveredRow:"refuse"|"exclude-and-count", externalSourceRows:"as-of-detection-time"|"ineligible"} — what as-of assembly does when a decision date precedes the change history of a field updated in place.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'ChangeHistoryPolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Field on the row whose value keeps one entity''s rows together in grouped folds and the new-entity report; NULL means the grain record key.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'GroupKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON TemporalSpec for series and panels: timeColumn, horizonPeriods, lags, rollingWindows, period, seasonality. Every lag and rolling-window endLag is at least horizonPeriods. Required when TaskType is forecast. Versioned with the unit.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'TemporalSpec';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON DecisionSpec: the action the prediction serves, the actor role, the capacity per period (for precision at capacity) and the period.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'DecisionSpec';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON IncumbentHeuristic: {kind:"none"} or {kind:"rule", name, scoreExpression} — today''s rule of thumb, scored as a named comparator on the same holdout.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'IncumbentHeuristic';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Actor who authored this version: {kind:"human", userId} (a user), or an automated author {kind:"agent", agentRunId}, {kind:"scheduled-job", scheduledJobRunId} or {kind:"system", component}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLPredictionUnit', @level2type = N'COLUMN', @level2name = N'AuthoredBy';
GO

-- ============================================================================
-- 2. MLEvaluationProtocol
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] (
    [ID]                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLEvaluationProtocol_ID] DEFAULT (newsequentialid()),
    [LineageRootID]         UNIQUEIDENTIFIER NOT NULL,
    [Version]               INT              NOT NULL,
    [Name]                  NVARCHAR(255)    NOT NULL,
    [Description]           NVARCHAR(MAX)    NULL,
    [Holdout]               NVARCHAR(MAX)    NOT NULL,
    [InnerValidation]       NVARCHAR(MAX)    NOT NULL,
    [Seed]                  INT              NOT NULL,
    [HoldoutAccessBudget]   INT              NOT NULL CONSTRAINT [DF_MLEvaluationProtocol_HoldoutAccessBudget] DEFAULT (1),
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
    [MinMinorityClassRows]  INT              NOT NULL CONSTRAINT [DF_MLEvaluationProtocol_MinMinorityClassRows] DEFAULT (20),
    [GuardFieldsEditableBy] NVARCHAR(20)     NOT NULL CONSTRAINT [DF_MLEvaluationProtocol_GuardFieldsEditableBy] DEFAULT (N'non-agent'),
    [AuthoredBy]            NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT [PK_MLEvaluationProtocol] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_MLEvaluationProtocol_Lineage_Version] UNIQUE ([LineageRootID], [Version]),
    CONSTRAINT [FK_MLEvaluationProtocol_LineageRoot] FOREIGN KEY ([LineageRootID])
        REFERENCES [${flyway:defaultSchema}].[MLEvaluationProtocol] ([ID]),
    CONSTRAINT [CK_MLEvaluationProtocol_Version] CHECK ([Version] >= 1),
    CONSTRAINT [CK_MLEvaluationProtocol_LineageRoot] CHECK (([Version] = 1 AND [LineageRootID] = [ID]) OR ([Version] > 1 AND [LineageRootID] <> [ID])),
    CONSTRAINT [CK_MLEvaluationProtocol_HoldoutAccessBudget] CHECK ([HoldoutAccessBudget] = 1),
    CONSTRAINT [CK_MLEvaluationProtocol_MinMinorityClassRows] CHECK ([MinMinorityClassRows] >= 1),
    CONSTRAINT [CK_MLEvaluationProtocol_GuardFieldsEditableBy] CHECK ([GuardFieldsEditableBy] IN (N'non-agent', N'human-only'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An Evaluation Protocol: the grading rules of a pipeline, saved before any candidate trains — the locked holdout, inner validation, primary proper score, fixed baselines, calibration, intervals, promotion rule and the three allowed outcomes (model, keep-simple-baseline, no-signal), the leakage audit, slices and budgets. Every training run references the exact version it was graded under. Versions are immutable rows; editing inserts the next version. Replaces the ValidationStrategy and LeakageGuard JSON of ML Training Pipelines.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'ID of version 1 of this protocol. Version 1 points at itself.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'LineageRootID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version number within the lineage, starting at 1. A saved version is never updated.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Version';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the protocol.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the protocol is for, in plain words.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON HoldoutSplit (guard field): {kind:"date-carved", dateColumn, cutoff, holdoutEnd, newEntityReport} or {kind:"rolling-origin", origins (>= 5), horizonPeriods, gapPeriods, minTrainPeriods, window}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Holdout';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON InnerValidation over development rows only: repeated-stratified-kfold, grouped-kfold or blocked-time.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'InnerValidation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Random seed for every split, fold, bootstrap and estimator of a run under this protocol.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Seed';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How many times the locked holdout may be scored per run: always 1, for one declared finalist.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'HoldoutAccessBudget';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ProperScore {family, metric}: the only metric that ranks candidates and gates outcomes. Its family must equal the pipeline unit''s task kind.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'PrimaryScore';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of secondary metric keys (auc, accuracy, f1, precision, recall, r2, calibration-slope); reported with intervals, never used to rank.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'SecondaryMetrics';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of BaselineSpec fitted on every run: dummy, one-feature, glm, naive, seasonal-naive, incumbent-heuristic.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Baselines';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON CalibrationMethod: platt, isotonic or auto, always fit on a disjoint calibration fold; not-applicable for regression.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Calibration';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ResamplingSpec: {kind:"none"} or {kind:"in-fold", method}; resampling never touches holdout rows.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Resampling';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON IntervalSpec: level 0.95, method, resamples and the paired test for model-versus-comparator differences.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Intervals';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON PromotionRule (guard field): comparators, incumbent, margin (>= 0), lowerBoundLevel 0.95, pairedOn same-holdout-rows, decisionTable Q13+Q14+Q15.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Promotion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array, exactly ["model","keep-simple-baseline","no-signal"]: a protocol cannot omit no-signal.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'AllowedOutcomes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON LeakageAuditSpec (guard field): held-out single-feature AUC ceiling, time-shifted-label test, drop-column test, per-source-column importance aggregation, high-cardinality ID check.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'LeakageAudit';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ProtocolExclusions (guard field): {denyFields, denySources} — columns and sources that never enter the feature matrix (the former LeakageGuard deny lists).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Exclusions';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON SliceSpec: {outOfTime, subgroups} — each slice is reported with the primary score and its interval.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Slices';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON PredictionIntervalSpec {method, nominalCoverage} for continuous, count and non-negative tasks; NULL when not requested.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'PredictionIntervals';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON ResidualDiagnosticsSpec {acfLags, ljungBoxAlpha} for series and panels; NULL otherwise.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'ResidualDiagnostics';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of RetrainTrigger declared for monitoring (outcome-degradation, calibration-drift).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'RetrainTriggers';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON SearchStrategy: {kind:"random", candidates} or {kind:"guided", method, equalCostComparisonId}.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'SearchStrategy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Budgets (guard field): maxComputeSeconds, maxTokens, maxCandidates, hardStop true.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'Budgets';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Smallest minority-class row count in the locked holdout for which a classification gate may return model; below it the gate cannot ship a model.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'MinMinorityClassRows';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Who may change the guard fields (Holdout, Promotion, LeakageAudit, Exclusions, Budgets and this setting) in the next version: non-agent (default: any author except an agent tool call — a user, a non-agent API caller, a scheduled job or the system) or human-only (optional: only a version authored by a user). Every author''s version passes the same guard-field validation.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'GuardFieldsEditableBy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON Actor who authored this version.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLEvaluationProtocol', @level2type = N'COLUMN', @level2name = N'AuthoredBy';
GO

-- ============================================================================
-- 3. MLTrainingPipeline + unit and protocol references (before MLTrainingSnapshot, which references pipelines)
-- ============================================================================
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline]
    ADD [PredictionUnitID]     UNIQUEIDENTIFIER NULL,
        [EvaluationProtocolID] UNIQUEIDENTIFIER NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingPipeline]
    ADD CONSTRAINT [FK_MLTrainingPipeline_MLPredictionUnit] FOREIGN KEY ([PredictionUnitID])
            REFERENCES [${flyway:defaultSchema}].[MLPredictionUnit] ([ID]),
        CONSTRAINT [FK_MLTrainingPipeline_MLEvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
            REFERENCES [${flyway:defaultSchema}].[MLEvaluationProtocol] ([ID]);
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact Prediction Unit version this pipeline trains on. NULL only on a pipeline created before Predictive Studio 6.3 that has not been migrated; such a pipeline cannot be trained.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingPipeline', @level2type = N'COLUMN', @level2name = N'PredictionUnitID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact Evaluation Protocol version every training run of this pipeline is graded under. Its primary score family must equal the unit''s task kind.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingPipeline', @level2type = N'COLUMN', @level2name = N'EvaluationProtocolID';
GO

-- ============================================================================
-- 4. MLTrainingSnapshot
-- ============================================================================
CREATE TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] (
    [ID]                           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MLTrainingSnapshot_ID] DEFAULT (newsequentialid()),
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
    [PinnedFeatureVersions]        NVARCHAR(MAX)    NOT NULL CONSTRAINT [DF_MLTrainingSnapshot_PinnedFeatureVersions] DEFAULT (N'[]'),
    [RowsRead]                     INT              NOT NULL,
    [ReadComplete]                 BIT              NOT NULL CONSTRAINT [DF_MLTrainingSnapshot_ReadComplete] DEFAULT (1),
    [CensoredRowsExcluded]         INT              NOT NULL,
    [LabelKnownRowsExcluded]       INT              NOT NULL,
    [EmptyLabelRowsExcluded]       INT              NOT NULL,
    [UncoveredHistoryRowsExcluded] NVARCHAR(MAX)    NOT NULL CONSTRAINT [DF_MLTrainingSnapshot_UncoveredHistoryRowsExcluded] DEFAULT (N'[]'),
    [DuplicateRowsRemoved]         INT              NOT NULL CONSTRAINT [DF_MLTrainingSnapshot_DuplicateRowsRemoved] DEFAULT (0),
    [ClassBalance]                 NVARCHAR(MAX)    NULL,
    [DataCutoff]                   DATETIMEOFFSET   NOT NULL,
    [AssemblyCodeVersion]          NVARCHAR(200)    NOT NULL,
    CONSTRAINT [PK_MLTrainingSnapshot] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_MLTrainingSnapshot_ContentHash] UNIQUE ([ContentHash]),
    CONSTRAINT [FK_MLTrainingSnapshot_Pipeline] FOREIGN KEY ([PipelineID])
        REFERENCES [${flyway:defaultSchema}].[MLTrainingPipeline] ([ID]),
    CONSTRAINT [FK_MLTrainingSnapshot_MLPredictionUnit] FOREIGN KEY ([PredictionUnitID])
        REFERENCES [${flyway:defaultSchema}].[MLPredictionUnit] ([ID]),
    CONSTRAINT [FK_MLTrainingSnapshot_MLEvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
        REFERENCES [${flyway:defaultSchema}].[MLEvaluationProtocol] ([ID]),
    CONSTRAINT [FK_MLTrainingSnapshot_StorageProvider] FOREIGN KEY ([StorageProviderID])
        REFERENCES [${flyway:defaultSchema}].[FileStorageProvider] ([ID]),
    CONSTRAINT [FK_MLTrainingSnapshot_MatrixFile] FOREIGN KEY ([MatrixFileID])
        REFERENCES [${flyway:defaultSchema}].[File] ([ID]),
    CONSTRAINT [FK_MLTrainingSnapshot_RowManifestFile] FOREIGN KEY ([RowManifestFileID])
        REFERENCES [${flyway:defaultSchema}].[File] ([ID]),
    CONSTRAINT [FK_MLTrainingSnapshot_ProvenanceFile] FOREIGN KEY ([ProvenanceFileID])
        REFERENCES [${flyway:defaultSchema}].[File] ([ID]),
    CONSTRAINT [CK_MLTrainingSnapshot_ReadComplete] CHECK ([ReadComplete] = 1),
    CONSTRAINT [CK_MLTrainingSnapshot_HashLengths] CHECK (LEN([ContentHash]) = 64 AND LEN([MatrixSha256]) = 64 AND LEN([RowManifestSha256]) = 64 AND LEN([ProvenanceSha256]) = 64 AND LEN([FeatureSchemaHash]) = 64),
    CONSTRAINT [CK_MLTrainingSnapshot_Counts] CHECK ([ManifestRowCount] >= 0 AND [HoldoutRowCount] >= 0 AND [HoldoutRowCount] <= [ManifestRowCount] AND [RowsRead] >= [ManifestRowCount] AND [CensoredRowsExcluded] >= 0 AND [LabelKnownRowsExcluded] >= 0 AND [EmptyLabelRowsExcluded] >= 0 AND [DuplicateRowsRemoved] >= 0),
    CONSTRAINT [CK_MLTrainingSnapshot_Versions] CHECK ([LabelVersion] >= 1 AND [FeatureSpecVersion] >= 1)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A Training Snapshot: the frozen data one training run learned from — the feature matrix, the row manifest (row id, entity key, decision date, group key, period, role) and per-value provenance as three write-once files, plus the content hash that fingerprints them together with the unit, label, feature-spec and protocol versions. Immutable; identical assemblies share one snapshot (unique ContentHash). Retraining from a snapshot reproduces the run.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 (lower-case hex) of the canonical JSON of the three file hashes, the feature schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID and DataCutoff.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ContentHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The ML Training Pipeline whose feature spec was assembled.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'PipelineID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The exact Prediction Unit version whose rows were read.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'PredictionUnitID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The unit''s LabelVersion at assembly.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'LabelVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The pipeline Version whose FeatureSteps produced the feature spec.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSpecVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The Evaluation Protocol version whose holdout rule assigned the manifest roles; NULL only for a legacy pipeline trained before its protocol was migrated.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'EvaluationProtocolID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The File Storage Provider holding the three files.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'StorageProviderID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Files row of matrix.jsonl (header line with column names, then one JSON array per manifest row).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'MatrixFileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the matrix file bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'MatrixSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of the matrix file in bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'MatrixSizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Files row of manifest.jsonl (one SnapshotRowKey per row; the locked-holdout rows are the stored holdout keys).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowManifestFileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the manifest file bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowManifestSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of the manifest file in bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowManifestSizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Files row of provenance.jsonl (for every row and column: source kind, source reference, source version, computed-at).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ProvenanceFileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the provenance file bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ProvenanceSha256';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of the provenance file in bytes.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ProvenanceSizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows in the manifest (development plus locked holdout).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ManifestRowCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Manifest rows with role locked-holdout.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'HoldoutRowCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of the resolved FeatureColumnSpec (name, dated source, encoding, missing-value policy) assembled.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSpec';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of matrix columns {name, encoding, sourceColumn} in matrix order.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSchema';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SHA-256 of the canonical JSON of FeatureSchema; compared before scoring.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'FeatureSchemaHash';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of ColumnProvenance: per matrix column, the source kind, source reference and source version.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ColumnProvenance';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of FeatureVersionPin for every Feature Value source read.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'PinnedFeatureVersions';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unit rows read from the source before exclusions; equals the source count (a truncated read is refused).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'RowsRead';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Always 1: a snapshot exists only for a complete read.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ReadComplete';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows excluded because their outcome window had not closed at DataCutoff.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'CensoredRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows excluded because their outcome was already recorded on or before the decision date (next-period rule).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'LabelKnownRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows excluded because their label was empty (NULL or an empty string) — unlabelled, never a class.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'EmptyLabelRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array {entity, field, rows}: rows excluded because a field''s change history did not cover their decision date (policy exclude-and-count).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'UncoveredHistoryRowsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rows removed as exact duplicates of (entity key, decision date, period).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'DuplicateRowsRemoved';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array {label, rows} over manifest rows for classification tasks; NULL otherwise.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'ClassBalance';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The censoring cutoff the unit resolved to for this assembly.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'DataCutoff';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Package version and git commit of the assembly code that built the snapshot.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MLTrainingSnapshot', @level2type = N'COLUMN', @level2name = N'AssemblyCodeVersion';
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
    ADD CONSTRAINT [FK_MLTrainingRun_MLTrainingSnapshot] FOREIGN KEY ([TrainingSnapshotID])
            REFERENCES [${flyway:defaultSchema}].[MLTrainingSnapshot] ([ID]),
        CONSTRAINT [FK_MLTrainingRun_MLEvaluationProtocol] FOREIGN KEY ([EvaluationProtocolID])
            REFERENCES [${flyway:defaultSchema}].[MLEvaluationProtocol] ([ID]),
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

-- ============================================================================
-- 7. spDeleteEntityWithCoreDependencies: training snapshots
-- ============================================================================
-- MLTrainingSnapshot (section 4) has a NOT NULL PipelineID into MLTrainingPipeline, a table this
-- proc deletes from when an entity is removed, so removing an entity whose pipeline has a
-- snapshot would fail on that FK. The proc deletes those snapshots after the pipelines' runs
-- and models and before the pipelines:
--    - MLTrainingSnapshot.PipelineID -> MLTrainingPipeline (delete)
--    - MLTrainingRun.TrainingSnapshotID -> MLTrainingSnapshot (null; the pipelines' own runs are
--      already deleted, so only a run of another pipeline that names the snapshot is cleared)
-- The policy in packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json records
-- both. The rest of the proc is V202611030816's definition, unchanged.
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]
  @EntityID uniqueidentifier
AS
BEGIN
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Own the transaction only when the caller has none (CodeGen calls in autocommit; a migration
-- runner may already hold one, and its rollback then covers this proc too).
DECLARE @OwnsTransaction bit = 0;
IF @@TRANCOUNT = 0
BEGIN
    BEGIN TRANSACTION;
    SET @OwnsTransaction = 1;
END

BEGIN TRY

    -- ── Precondition: refuse to start if something not covered by the policy points at this entity ──
    -- @Handled is the policy's delete and null references. A reference marked block
    -- (Entity.ParentID), a core table added after this migration, or an FK from an app schema is
    -- reported here, before anything is deleted.
    DECLARE @blockers nvarchar(max) = N'', @probe nvarchar(max) = N'';

    DECLARE @Handled TABLE (Pair nvarchar(400) PRIMARY KEY);
    INSERT INTO @Handled (Pair) VALUES
      (N'AccessControlRule.EntityID'), (N'ActionExecutionLog.TargetEntityID'),
      (N'AIAgentExample.PrimaryScopeEntityID'), (N'AIAgentNote.PrimaryScopeEntityID'),
      (N'AIAgentRun.PrimaryScopeEntityID'), (N'AIAgentSession.LinkedEntityID'),
      (N'ApplicationEntity.EntityID'), (N'ArchiveConfigurationEntity.EntityID'),
      (N'ArchiveRunDetail.EntityID'), (N'AuditLog.EntityID'), (N'CalendarEventLink.EntityID'),
      (N'ClusterAnalysis.EntityID'), (N'CompanyIntegrationEntityMap.EntityID'),
      (N'CompanyIntegrationRecordMap.EntityID'), (N'CompanyIntegrationRunDetail.EntityID'),
      (N'ContentSource.EntityID'), (N'Conversation.LinkedEntityID'), (N'DataContextItem.EntityID'),
      (N'DatasetItem.EntityID'), (N'DuplicateRun.EntityID'), (N'EntityAction.EntityID'),
      (N'EntityAction.ScopeEntityID'), (N'EntityAIAction.EntityID'), (N'EntityAIAction.OutputEntityID'),
      (N'EntityAlternateBaseView.EntityID'), (N'EntityCommunicationMessageType.EntityID'),
      (N'EntityDocument.EntityID'), (N'EntityField.EntityID'), (N'EntityField.RelatedEntityID'),
      (N'EntityFormContribution.EntityID'), (N'EntityFormContribution.RelatedEntityID'),
      (N'EntityFormOverride.EntityID'), (N'EntityOrganicKey.EntityID'),
      (N'EntityOrganicKeyRelatedEntity.RelatedEntityID'), (N'EntityPermission.EntityID'),
      (N'EntityRecordDocument.EntityID'), (N'EntityRelationship.EntityID'),
      (N'EntityRelationship.RelatedEntityID'), (N'EntitySetting.EntityID'), (N'FeatureValue.EntityID'),
      (N'FileEntityRecordLink.EntityID'), (N'FormChromeRule.EntityID'),
      (N'FormChromeRule.RelatedEntityID'), (N'GeneratedCode.LinkedEntityID'),
      (N'GraphEdge.SourceEntityID'), (N'GraphEdge.TargetEntityID'), (N'GraphEdgeTypeEndpoint.EntityID'),
      (N'IdentityClaim.EntityID'), (N'IntegrationURLFormat.EntityID'), (N'InteractionLink.EntityID'),
      (N'List.EntityID'), (N'MaterializedResult.GeneratedEntityID'),
      (N'MaterializedResult.SourceEntityID'), (N'MLModelScoringBinding.TargetEntityID'),
      (N'MLTrainingPipeline.TargetEntityID'), (N'ProcessRunDetail.EntityID'), (N'ProcessRun.EntityID'),
      (N'QueryEntity.EntityID'), (N'QueryField.SourceEntityID'),
      (N'RecommendationItem.DestinationEntityID'), (N'Recommendation.SourceEntityID'),
      (N'RecordChange.EntityID'), (N'RecordCloneLogItem.EntityID'), (N'RecordCloneLog.RootEntityID'),
      (N'RecordGeoCode.EntityID'), (N'RecordLink.SourceEntityID'), (N'RecordLink.TargetEntityID'),
      (N'RecordMergeLog.EntityID'), (N'RecordProcess.EntityID'), (N'RecordProcessWatermark.EntityID'),
      (N'ResourceType.CategoryEntityID'), (N'ResourceType.EntityID'),
      (N'RubricEvaluation.ContextEntityID'), (N'RubricEvaluation.SubjectEntityID'),
      (N'ScopedNotificationConfig.PrimaryScopeEntityID'), (N'ScopedPromptConfig.PrimaryScopeEntityID'),
      (N'ScopedPromptPart.PrimaryScopeEntityID'), (N'SearchScopeEntity.EntityID'),
      (N'SignatureRequest.EntityID'), (N'SystemEvent.EntityID'), (N'TaggedItem.EntityID'),
      (N'TagScope.ScopeEntityID'), (N'TemplateParam.EntityID'), (N'TestRun.TargetLogEntityID'),
      (N'UserApplicationEntity.EntityID'), (N'UserFavorite.EntityID'), (N'User.LinkedEntityID'),
      (N'UserRecordLog.EntityID'), (N'UserViewCategory.EntityID'), (N'UserView.EntityID'),
      (N'VersionLabel.EntityID'), (N'VersionLabelItem.EntityID');

    -- FOR XML PATH concatenation is deterministic (the += accumulator idiom is not). Only enabled
    -- NO_ACTION FKs can block the final DELETE; CASCADE / SET NULL / SET DEFAULT and disabled FKs
    -- are cleared or ignored by SQL Server itself.
    SELECT @probe = (
        SELECT DISTINCT
             N' UNION ALL SELECT ''' + REPLACE(SCHEMA_NAME(pt.schema_id) + '.' + pt.name + '.' + pc.name, '''', '''''')
           + N''' WHERE EXISTS (SELECT 1 FROM ' + QUOTENAME(SCHEMA_NAME(pt.schema_id)) + N'.' + QUOTENAME(pt.name)
           + N' WHERE ' + QUOTENAME(pc.name) + N' = @EntityID)'
        FROM sys.foreign_keys fk
        JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
             AND rt.name = 'Entity' AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
        JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
        WHERE fk.delete_referential_action = 0
          AND fk.is_disabled = 0
          AND NOT (SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}'
                   AND pt.name + '.' + pc.name IN (SELECT Pair FROM @Handled))
        FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)');

    IF LEN(ISNULL(@probe, N'')) > 0
    BEGIN
        DECLARE @found TABLE (Ref nvarchar(400));
        SET @probe = N'SELECT Ref FROM (SELECT CAST(NULL AS nvarchar(400)) Ref WHERE 1=0' + @probe + N') q;';
        INSERT INTO @found (Ref) EXEC sp_executesql @probe, N'@EntityID uniqueidentifier', @EntityID = @EntityID;

        SELECT @blockers = STUFF((SELECT N', ' + Ref FROM @found ORDER BY Ref FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N'');

        IF @blockers IS NOT NULL AND @blockers <> N''
        BEGIN
            DECLARE @msg nvarchar(2048) = N'Cannot delete entity ' + CAST(@EntityID AS nvarchar(50))
                + N': rows still reference it through foreign keys this procedure does not clear ('
                + LEFT(@blockers, 1600) + N'). Clear them first. Nothing has been deleted.';
            THROW 50000, @msg, 1;
        END
    END

    -- ── Rows this proc deletes that other rows can reference: capture their IDs up front ──
    -- (Taken before any delete, so every child statement below sees the full parent set.)
    DECLARE @EntityFieldIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityFieldIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewCategoryIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewCategoryIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    DECLARE @ListIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ListIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    DECLARE @EntityDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    DECLARE @EntityRecordDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityRecordDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityRecordDocument]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRun]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRunDetail]
        WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);

    DECLARE @EntityActionIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityActionIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    DECLARE @AlternateBaseViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AlternateBaseViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;

    DECLARE @MessageTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MessageTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    DECLARE @OrganicKeyIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @OrganicKeyIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationEntityMapIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationEntityMapIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @PipelineIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @PipelineIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

    DECLARE @MLModelIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MLModelIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);

    DECLARE @ProcessRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ProcessRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @RecommendationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecommendationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    DECLARE @RecordCloneLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordCloneLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;

    DECLARE @RecordMergeLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordMergeLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    DECLARE @RecordProcessIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordProcessIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;

    DECLARE @RubricEvaluationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RubricEvaluationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    DECLARE @ResourceTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ResourceTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    DECLARE @AgentNoteIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AgentNoteIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- RecordChange can be large, so its doomed set stays a subquery instead of a table variable.

    -- ── Nullable references to this entity: cleared, the rows survive ──
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun] SET [PrimaryScopeEntityID] = NULL WHERE [PrimaryScopeEntityID] = @EntityID;
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding: both columns or neither
    UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AuditLog] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ClusterAnalysis] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- CK_Conversation_LinkBinding / CK_Conversation_AnchorLinkBinding: clear LinkedRecordID and anchor columns with LinkedEntityID
    UPDATE [${flyway:defaultSchema}].[Conversation] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL, [AnchorType] = NULL, [AnchorKey] = NULL, [AnchorMetadata] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- Other entities' fields that point AT this entity (#3561)
    UPDATE [${flyway:defaultSchema}].[EntityField] SET [RelatedEntityID] = NULL WHERE [RelatedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[GeneratedCode] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[IdentityClaim] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [GeneratedEntityID] = NULL WHERE [GeneratedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    -- ResourceType references Entity twice; EntityID is a delete (below), CategoryEntityID is cleared (#4483)
    UPDATE [${flyway:defaultSchema}].[ResourceType] SET [CategoryEntityID] = NULL WHERE [CategoryEntityID] = @EntityID;
    -- CK_RubricEvaluation_ContextPair: both columns or neither
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [ContextEntityID] = NULL, [ContextRecordID] = NULL WHERE [ContextEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[SignatureRequest] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- SystemEvent has a physical FK but no entity, so generated metadata does not list it
    UPDATE [${flyway:defaultSchema}].[SystemEvent] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TemplateParam] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TestRun] SET [TargetLogEntityID] = NULL WHERE [TargetLogEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[User] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[VersionLabel] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;

    -- ── Nullable references to rows deleted below: cleared first ──
    UPDATE [${flyway:defaultSchema}].[AIAgentNote] SET [ConsolidatedIntoNoteID] = NULL WHERE [ConsolidatedIntoNoteID] IN (SELECT ID FROM @AgentNoteIDs);
    UPDATE [${flyway:defaultSchema}].[ErrorLog] SET [CompanyIntegrationRunDetailID] = NULL WHERE [CompanyIntegrationRunDetailID] IN (SELECT ID FROM @IntegrationRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [EntityActionID] = NULL WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseView] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[QueryEntity] SET [AlternateBaseViewID] = NULL WHERE [AlternateBaseViewID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityDocumentID] = NULL WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[ContentItem] SET [EntityRecordDocumentID] = NULL WHERE [EntityRecordDocumentID] IN (SELECT ID FROM @EntityRecordDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[DuplicateRun] SET [SourceListID] = NULL WHERE [SourceListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeListID] = NULL WHERE [ScopeListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [ResultingModelID] = NULL WHERE [ResultingModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [ProcessRunDetailID] = NULL WHERE [ProcessRunDetailID] IN (SELECT ID FROM @ProcessRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[RecordChange] SET [RestoredFromID] = NULL
        WHERE [RestoredFromID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    UPDATE [${flyway:defaultSchema}].[DuplicateRunDetailMatch] SET [RecordMergeLogID] = NULL WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValueCache] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[UserNotification] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [SupersedesEvaluationID] = NULL WHERE [SupersedesEvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    UPDATE [${flyway:defaultSchema}].[UserView] SET [CategoryID] = NULL WHERE [CategoryID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[UserViewCategory] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [ViewID] = NULL WHERE [ViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[EntityRelationship] SET [DisplayUserViewID] = NULL WHERE [DisplayUserViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[List] SET [SourceViewID] = NULL WHERE [SourceViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeViewID] = NULL WHERE [ScopeViewID] IN (SELECT ID FROM @UserViewIDs);

    -- ── Deletes, children before parents ──

    -- Entity fields: values and permissions first; the EntityField rows go last, just before Entity
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldPermission] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityFieldID] = NULL WHERE [SourceEntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);

    -- Saved-view run history
    DELETE FROM [${flyway:defaultSchema}].[UserViewRunDetail] WHERE [UserViewRunID] IN (SELECT ID FROM @UserViewRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    -- Lists
    DELETE FROM [${flyway:defaultSchema}].[ListDetail] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListInvitation] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListShare] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    -- Duplicate detection (a run is tied to the entity directly or through its entity document)
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch] WHERE [DuplicateRunDetailID] IN (SELECT ID FROM @DuplicateRunDetailIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetail] WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRun] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    -- Entity documents
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentRun] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentSetting] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityRecordDocument] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    -- Entity actions (on this entity, or scoped to one of its records)
    DELETE FROM [${flyway:defaultSchema}].[EntityActionFilter] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionInvocation] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionParam] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityAction] WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    -- Communication message types
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationField] WHERE [EntityCommunicationMessageTypeID] IN (SELECT ID FROM @MessageTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    -- Organic keys
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] WHERE [RelatedEntityID] = @EntityID OR [EntityOrganicKeyID] IN (SELECT ID FROM @OrganicKeyIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    -- Company integrations
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    -- ML pipelines targeting this entity, their models, runs and scoring bindings
    DELETE FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

    -- Record processes and feature values
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[FeaturePipelineVersion] WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcessWatermark] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    -- Recommendations
    DELETE FROM [${flyway:defaultSchema}].[RecommendationItem] WHERE [DestinationEntityID] = @EntityID OR [RecommendationID] IN (SELECT ID FROM @RecommendationIDs);
    DELETE FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    -- Record history: version labels, changes, clone and merge logs
    DELETE FROM [${flyway:defaultSchema}].[VersionLabelItem] WHERE [EntityID] = @EntityID
        OR [RecordChangeID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE [EntityID] = @EntityID OR [RecordCloneLogID] IN (SELECT ID FROM @RecordCloneLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeDeletionLog] WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    -- Rubric evaluations of this entity's records
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluationScore] WHERE [EvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    -- Resource types for this entity, with their links, permissions and workspace items
    DELETE FROM [${flyway:defaultSchema}].[ResourceLink] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourcePermission] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[WorkspaceItem] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    -- Scope columns whose NULL means "global": delete rather than widen the scope
    DELETE FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[AIAgentExample] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedNotificationConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptPart] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- Datasets: bump the parent so cached datasets refresh, then drop the item
    UPDATE [${flyway:defaultSchema}].[Dataset] SET [__mj_UpdatedAt] = GETUTCDATE()
        WHERE [ID] IN (SELECT [DatasetID] FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID;

    -- Saved views, then their categories (UserView.CategoryID was cleared above)
    DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    -- Rows with no dependents of their own
    DELETE FROM [${flyway:defaultSchema}].[AccessControlRule] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveConfigurationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveRunDetail] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CalendarEventLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID OR [OutputEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormContribution] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormOverride] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FileEntityRecordLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FormChromeRule] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdge] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[IntegrationURLFormat] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[InteractionLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[QueryEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordGeoCode] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordLink] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[SearchScopeEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TaggedItem] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TagScope] WHERE [ScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserFavorite] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE [EntityID] = @EntityID;

    -- The entity's own fields, then the entity
    DELETE FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = @EntityID;

    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @OwnsTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
END
GO




























































/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and EntityField metadata for MJ: ML Prediction Units, MJ: ML Evaluation Protocols and
 * MJ: ML Training Snapshots; new fields of MJ: ML Training Pipelines, MJ: ML Training Runs and
 * MJ: Feature Values; base views, spCreate/spUpdate/spDelete, permissions, extended properties.
 * Two CodeGen passes, in order: the first creates the entities and views; the second adds the
 * MJ: ML Training Runs.TrainingSnapshot name column, which exists only once the first pass has
 * chosen ContentHash as the ML Training Snapshots name field. A third pass produces nothing.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * ===================================================================================== */

/* SQL generated to create new entity MJ: ML Evaluation Protocols */

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
         '7db88c96-c922-4724-ae93-7b91798ceafe',
         'MJ: ML Evaluation Protocols',
         'ML Evaluation Protocols',
         'An Evaluation Protocol: the grading rules of a pipeline, saved before any candidate trains — the locked holdout, inner validation, primary proper score, fixed baselines, calibration, intervals, promotion rule and the three allowed outcomes (model, keep-simple-baseline, no-signal), the leakage audit, slices and budgets. Every training run references the exact version it was graded under. Versions are immutable rows; editing inserts the next version. Replaces the ValidationStrategy and LeakageGuard JSON of ML Training Pipelines.',
         NULL,
         'MLEvaluationProtocol',
         'vwMLEvaluationProtocols',
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

/* SQL generated to add entity MJ: ML Evaluation Protocols to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7db88c96-c922-4724-ae93-7b91798ceafe', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Evaluation Protocols for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Evaluation Protocols for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Evaluation Protocols for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: ML Training Snapshots */

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
         'f36cde0e-dbcd-4527-9af6-66d8c710c8e6',
         'MJ: ML Training Snapshots',
         'ML Training Snapshots',
         'A Training Snapshot: the frozen data one training run learned from — the feature matrix, the row manifest (row id, entity key, decision date, group key, period, role) and per-value provenance as three write-once files, plus the content hash that fingerprints them together with the unit, label, feature-spec and protocol versions. Immutable; identical assemblies share one snapshot (unique ContentHash). Retraining from a snapshot reproduces the run.',
         NULL,
         'MLTrainingSnapshot',
         'vwMLTrainingSnapshots',
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

/* SQL generated to add entity MJ: ML Training Snapshots to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f36cde0e-dbcd-4527-9af6-66d8c710c8e6', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Training Snapshots for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Training Snapshots for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Training Snapshots for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: ML Prediction Units */

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
         'd5052eb0-354c-4c4d-80d8-2832fcc720e6',
         'MJ: ML Prediction Units',
         'ML Prediction Units',
         'A Prediction Unit: what one training row is (one grain record, or one grain record per period of a dated child entity), its decision date, the outcome rule and the window over which the outcome is observed, how unresolved rows are censored, and the declared task type. Every ML Training Pipeline references exactly one version. Versions are immutable rows: editing a unit inserts the next version with the same LineageRootID, so a trained model keeps pointing at the version it used.',
         NULL,
         'MLPredictionUnit',
         'vwMLPredictionUnits',
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

/* SQL generated to add entity MJ: ML Prediction Units to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd5052eb0-354c-4c4d-80d8-2832fcc720e6', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Prediction Units for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Prediction Units for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: ML Prediction Units for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[MLPredictionUnit] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
UPDATE [${flyway:defaultSchema}].[MLPredictionUnit] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[MLPredictionUnit] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[MLPredictionUnit] ADD CONSTRAINT [DF___mj_MLPredictionUnit___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[MLPredictionUnit] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
UPDATE [${flyway:defaultSchema}].[MLPredictionUnit] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[MLPredictionUnit] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPredictionUnit */
ALTER TABLE [${flyway:defaultSchema}].[MLPredictionUnit] ADD CONSTRAINT [DF___mj_MLPredictionUnit___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
UPDATE [${flyway:defaultSchema}].[MLTrainingSnapshot] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] ADD CONSTRAINT [DF___mj_MLTrainingSnapshot___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
UPDATE [${flyway:defaultSchema}].[MLTrainingSnapshot] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLTrainingSnapshot */
ALTER TABLE [${flyway:defaultSchema}].[MLTrainingSnapshot] ADD CONSTRAINT [DF___mj_MLTrainingSnapshot___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
UPDATE [${flyway:defaultSchema}].[MLEvaluationProtocol] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] ADD CONSTRAINT [DF___mj_MLEvaluationProtocol___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
UPDATE [${flyway:defaultSchema}].[MLEvaluationProtocol] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLEvaluationProtocol */
ALTER TABLE [${flyway:defaultSchema}].[MLEvaluationProtocol] ADD CONSTRAINT [DF___mj_MLEvaluationProtocol___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 94 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4caaed2-29ad-4ae4-9d27-662406e3876f' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'ID')) BEGIN
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
            'f4caaed2-29ad-4ae4-9d27-662406e3876f',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4c1ca8f-92f6-4d1f-91b8-7989c68a2ff3' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'LineageRootID')) BEGIN
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
            'd4c1ca8f-92f6-4d1f-91b8-7989c68a2ff3',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75bd5e78-48bb-44d8-8b1f-cfb4edfef309' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'Version')) BEGIN
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
            '75bd5e78-48bb-44d8-8b1f-cfb4edfef309',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '367ef229-e773-4eff-9050-d5d864329c7b' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'Name')) BEGIN
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
            '367ef229-e773-4eff-9050-d5d864329c7b',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40751f77-3489-4bb1-a007-c3bf4f909221' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'Description')) BEGIN
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
            '40751f77-3489-4bb1-a007-c3bf4f909221',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3aaffd7-39e7-4318-9c7e-78d1b274cf2e' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'UnitRows')) BEGIN
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
            'd3aaffd7-39e7-4318-9c7e-78d1b274cf2e',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1701db5-91dc-477c-8e8a-8191f18f3945' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'LabelRule')) BEGIN
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
            'b1701db5-91dc-477c-8e8a-8191f18f3945',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '497d0450-7569-4ae2-ac34-2110c4cce6fc' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'LabelWindowDays')) BEGIN
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
            '497d0450-7569-4ae2-ac34-2110c4cce6fc',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6d5425d-6e89-42db-a089-e6020b969496' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'LabelGapDays')) BEGIN
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
            'e6d5425d-6e89-42db-a089-e6020b969496',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6da08af0-f2f5-4294-abe1-f2de92a4278c' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'TaskType')) BEGIN
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
            '6da08af0-f2f5-4294-abe1-f2de92a4278c',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a414a7a-b576-49c5-917c-5586fd9e645f' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'LabelVersion')) BEGIN
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
            '1a414a7a-b576-49c5-917c-5586fd9e645f',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e84bdae-c220-42f7-9716-ae7da85bb277' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'Censoring')) BEGIN
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
            '6e84bdae-c220-42f7-9716-ae7da85bb277',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '02f695d3-28bb-414a-876d-37b0ad1dcaeb' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'ChangeHistoryPolicy')) BEGIN
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
            '02f695d3-28bb-414a-876d-37b0ad1dcaeb',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6e6f6ee-8e03-44cd-91d3-f0a699d94a23' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'GroupKey')) BEGIN
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
            'e6e6f6ee-8e03-44cd-91d3-f0a699d94a23',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '599b6550-9744-441d-8d28-25dc8505914f' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'TemporalSpec')) BEGIN
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
            '599b6550-9744-441d-8d28-25dc8505914f',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b01e7da7-5aa2-43e0-8414-47f2158f208d' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'DecisionSpec')) BEGIN
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
            'b01e7da7-5aa2-43e0-8414-47f2158f208d',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '743899b5-546d-47b9-aa4b-28623bc2885e' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'IncumbentHeuristic')) BEGIN
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
            '743899b5-546d-47b9-aa4b-28623bc2885e',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c44c7b71-e487-4c32-a7fc-12a714715bbd' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'AuthoredBy')) BEGIN
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
            'c44c7b71-e487-4c32-a7fc-12a714715bbd',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '247807bd-b812-4de5-9d17-49788c5e7b29' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = '__mj_CreatedAt')) BEGIN
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
            '247807bd-b812-4de5-9d17-49788c5e7b29',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a565f607-69d9-4d1e-b326-5067cd19dd8b' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'a565f607-69d9-4d1e-b326-5067cd19dd8b',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28d4be83-b39f-4e10-b368-0fe0c171a22b' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ID')) BEGIN
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
            '28d4be83-b39f-4e10-b368-0fe0c171a22b',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa8d93a6-c4f0-4b15-9516-7815bbc9bbc0' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ContentHash')) BEGIN
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
            'fa8d93a6-c4f0-4b15-9516-7815bbc9bbc0',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f8d2651-b8bd-4406-a051-567b13bdca78' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'PipelineID')) BEGIN
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
            '8f8d2651-b8bd-4406-a051-567b13bdca78',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '517ace76-ec37-449f-8ab2-737099d8c1d2' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'PredictionUnitID')) BEGIN
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
            '517ace76-ec37-449f-8ab2-737099d8c1d2',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2ec3773-fce0-461a-bddb-88489f0ab03d' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'LabelVersion')) BEGIN
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
            'f2ec3773-fce0-461a-bddb-88489f0ab03d',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4fa37ef-982b-456f-bbfc-4497138b31eb' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'FeatureSpecVersion')) BEGIN
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
            'c4fa37ef-982b-456f-bbfc-4497138b31eb',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f49f9e6-7306-4f1a-8179-0a04ee34415a' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '5f49f9e6-7306-4f1a-8179-0a04ee34415a',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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
            '7DB88C96-C922-4724-AE93-7B91798CEAFE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '366bd221-dead-41dc-ad75-3642fc088fa9' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'StorageProviderID')) BEGIN
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
            '366bd221-dead-41dc-ad75-3642fc088fa9',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e286da2-8662-49fb-b490-94148bc6f2c9' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'MatrixFileID')) BEGIN
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
            '8e286da2-8662-49fb-b490-94148bc6f2c9',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c1d1e86-be68-4bb1-b4ec-6d0483a55c3a' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'MatrixSha256')) BEGIN
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
            '2c1d1e86-be68-4bb1-b4ec-6d0483a55c3a',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc5fa05b-7fe5-46f1-9a98-6423fae0de42' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'MatrixSizeBytes')) BEGIN
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
            'dc5fa05b-7fe5-46f1-9a98-6423fae0de42',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '19a80161-8c30-4528-b62f-f528dacf4f0b' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'RowManifestFileID')) BEGIN
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
            '19a80161-8c30-4528-b62f-f528dacf4f0b',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b37e93be-197f-4b74-b48e-62234b9517c8' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'RowManifestSha256')) BEGIN
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
            'b37e93be-197f-4b74-b48e-62234b9517c8',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '516f7d0d-f38e-4395-ab5c-32c77e664c1d' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'RowManifestSizeBytes')) BEGIN
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
            '516f7d0d-f38e-4395-ab5c-32c77e664c1d',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e6da552-0e71-4fb7-8e9c-f435f11d1fc7' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ProvenanceFileID')) BEGIN
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
            '2e6da552-0e71-4fb7-8e9c-f435f11d1fc7',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a05375b-b318-46b5-a58e-6028b17b7e17' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ProvenanceSha256')) BEGIN
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
            '2a05375b-b318-46b5-a58e-6028b17b7e17',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a79c79e3-9ba0-4c54-a5c3-96a5d874fb7f' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ProvenanceSizeBytes')) BEGIN
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
            'a79c79e3-9ba0-4c54-a5c3-96a5d874fb7f',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab85c20f-ff13-41c9-a11e-2cf9e8294260' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ManifestRowCount')) BEGIN
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
            'ab85c20f-ff13-41c9-a11e-2cf9e8294260',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a69b3c8c-bde6-4674-b41d-a56c677de157' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'HoldoutRowCount')) BEGIN
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
            'a69b3c8c-bde6-4674-b41d-a56c677de157',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '62861dc3-7a4f-4111-b64e-a3b8afaa664d' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'FeatureSpec')) BEGIN
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
            '62861dc3-7a4f-4111-b64e-a3b8afaa664d',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40def3c6-04b1-4246-99d7-6965d37961d5' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'FeatureSchema')) BEGIN
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
            '40def3c6-04b1-4246-99d7-6965d37961d5',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84377039-15bd-41ff-ac27-b86d47e655df' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'FeatureSchemaHash')) BEGIN
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
            '84377039-15bd-41ff-ac27-b86d47e655df',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7eb7a214-d268-4ba4-97ba-e6d2330efe95' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ColumnProvenance')) BEGIN
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
            '7eb7a214-d268-4ba4-97ba-e6d2330efe95',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a1c77e5-a702-4ed3-89b5-d9495f9b85a2' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'PinnedFeatureVersions')) BEGIN
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
            '6a1c77e5-a702-4ed3-89b5-d9495f9b85a2',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fcd672b4-13c6-4b49-a7a3-3ce86a1c135c' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'RowsRead')) BEGIN
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
            'fcd672b4-13c6-4b49-a7a3-3ce86a1c135c',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8dbca900-1a90-4d1b-b7cb-a95353041a58' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ReadComplete')) BEGIN
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
            '8dbca900-1a90-4d1b-b7cb-a95353041a58',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5447115-f0d9-4e3e-a5f7-99b604cae9d7' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'CensoredRowsExcluded')) BEGIN
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
            'c5447115-f0d9-4e3e-a5f7-99b604cae9d7',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8a7611f-6332-465b-b2bf-7ff6bbd329a9' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'LabelKnownRowsExcluded')) BEGIN
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
            'f8a7611f-6332-465b-b2bf-7ff6bbd329a9',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2c36e97-d80c-47a6-b1be-52e9d9253a13' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'EmptyLabelRowsExcluded')) BEGIN
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
            'c2c36e97-d80c-47a6-b1be-52e9d9253a13',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '19f7a467-c851-4c98-843b-1235819da36f' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'UncoveredHistoryRowsExcluded')) BEGIN
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
            '19f7a467-c851-4c98-843b-1235819da36f',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f0b40ef-42cf-4a22-b77b-320e5aab0542' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'DuplicateRowsRemoved')) BEGIN
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
            '8f0b40ef-42cf-4a22-b77b-320e5aab0542',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a9fecd0-fb18-4f21-a6f8-f5f48ed17203' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ClassBalance')) BEGIN
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
            '6a9fecd0-fb18-4f21-a6f8-f5f48ed17203',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8faa92f0-8f7c-4739-a762-9489835d71b9' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'DataCutoff')) BEGIN
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
            '8faa92f0-8f7c-4739-a762-9489835d71b9',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbc13174-3a1d-4f40-a5d3-95d40fbb2819' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'AssemblyCodeVersion')) BEGIN
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
            'dbc13174-3a1d-4f40-a5d3-95d40fbb2819',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68f17137-6405-460d-9796-60785602a4d3' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = '__mj_CreatedAt')) BEGIN
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
            '68f17137-6405-460d-9796-60785602a4d3',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abfcfa3f-1315-4df2-ac8a-e710f99823c2' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'abfcfa3f-1315-4df2-ac8a-e710f99823c2',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b8c4ad9-59e6-421e-b28d-c2c60d8c9aef' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'ID')) BEGIN
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
            '1b8c4ad9-59e6-421e-b28d-c2c60d8c9aef',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc21f4d2-0d46-44b0-8fe4-c16dfdf4c522' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'LineageRootID')) BEGIN
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
            'cc21f4d2-0d46-44b0-8fe4-c16dfdf4c522',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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
            '7DB88C96-C922-4724-AE93-7B91798CEAFE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e16b9172-338c-4d7a-8dfe-f9fa06cf4db8' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Version')) BEGIN
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
            'e16b9172-338c-4d7a-8dfe-f9fa06cf4db8',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd44848c6-9cab-4c17-a4e8-27eda46692d6' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Name')) BEGIN
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
            'd44848c6-9cab-4c17-a4e8-27eda46692d6',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1985f44-5f4f-4831-bb96-3470ce296583' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Description')) BEGIN
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
            'b1985f44-5f4f-4831-bb96-3470ce296583',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd3c7baef-df62-4355-a7ed-cde904b888d5' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Holdout')) BEGIN
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
            'd3c7baef-df62-4355-a7ed-cde904b888d5',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '968afd18-c8a9-41c6-a03c-4d284033bd6b' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'InnerValidation')) BEGIN
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
            '968afd18-c8a9-41c6-a03c-4d284033bd6b',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0e507e5-acc9-4d6b-ab4a-49fe2be84b96' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Seed')) BEGIN
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
            'a0e507e5-acc9-4d6b-ab4a-49fe2be84b96',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2153c8c2-8dff-422c-9759-8ee80f53f0ae' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'HoldoutAccessBudget')) BEGIN
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
            '2153c8c2-8dff-422c-9759-8ee80f53f0ae',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18636bb2-a8be-4a84-9c8f-211a35ff4d00' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'PrimaryScore')) BEGIN
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
            '18636bb2-a8be-4a84-9c8f-211a35ff4d00',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '252225d0-f65a-453d-9390-2c2c7da687a2' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'SecondaryMetrics')) BEGIN
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
            '252225d0-f65a-453d-9390-2c2c7da687a2',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89230037-5a26-4441-911f-2b9fae0369b9' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Baselines')) BEGIN
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
            '89230037-5a26-4441-911f-2b9fae0369b9',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e170cd66-f89b-4403-8538-e80e3757df23' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Calibration')) BEGIN
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
            'e170cd66-f89b-4403-8538-e80e3757df23',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b16e14f-39a2-4405-b612-aedb8fb5a4e5' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Resampling')) BEGIN
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
            '7b16e14f-39a2-4405-b612-aedb8fb5a4e5',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e12ef381-23cb-44f0-9234-27ad4854a41e' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Intervals')) BEGIN
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
            'e12ef381-23cb-44f0-9234-27ad4854a41e',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53a6b363-0c31-4a02-8098-7997ffa6773b' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Promotion')) BEGIN
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
            '53a6b363-0c31-4a02-8098-7997ffa6773b',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f849c1e5-2a72-459c-9c5b-65bf039e73bc' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'AllowedOutcomes')) BEGIN
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
            'f849c1e5-2a72-459c-9c5b-65bf039e73bc',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30b68cf1-3409-453a-98c2-e6c2255ac836' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'LeakageAudit')) BEGIN
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
            '30b68cf1-3409-453a-98c2-e6c2255ac836',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3f5a513-4467-46a9-865e-1bec926439f1' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Exclusions')) BEGIN
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
            'f3f5a513-4467-46a9-865e-1bec926439f1',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb620df0-fc76-4d02-b7c8-1bfa3c19770c' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Slices')) BEGIN
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
            'fb620df0-fc76-4d02-b7c8-1bfa3c19770c',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32743338-0281-4a24-ba0a-4ef8d5281866' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'PredictionIntervals')) BEGIN
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
            '32743338-0281-4a24-ba0a-4ef8d5281866',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ae6c0a7-5b72-4c3a-a080-154be17da485' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'ResidualDiagnostics')) BEGIN
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
            '0ae6c0a7-5b72-4c3a-a080-154be17da485',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'acbd66b0-1219-4441-a7c0-0f82808e40f7' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'RetrainTriggers')) BEGIN
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
            'acbd66b0-1219-4441-a7c0-0f82808e40f7',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b05f9bd-d5a9-4852-b5b1-48c58796ae02' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'SearchStrategy')) BEGIN
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
            '2b05f9bd-d5a9-4852-b5b1-48c58796ae02',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2af1a4ee-1133-458c-ad90-ad95dd2f1043' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'Budgets')) BEGIN
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
            '2af1a4ee-1133-458c-ad90-ad95dd2f1043',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a26ca06-0e44-4ce3-ab6d-c7541002eed3' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'MinMinorityClassRows')) BEGIN
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
            '5a26ca06-0e44-4ce3-ab6d-c7541002eed3',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ecf141b1-f1f5-4db6-bf75-ccc11817c2d8' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'GuardFieldsEditableBy')) BEGIN
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
            'ecf141b1-f1f5-4db6-bf75-ccc11817c2d8',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7937b713-ff95-424f-a2e6-553e2b545b21' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'AuthoredBy')) BEGIN
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
            '7937b713-ff95-424f-a2e6-553e2b545b21',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1b8fc2b-3bd5-420a-a8d6-6af5becb306e' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e1b8fc2b-3bd5-420a-a8d6-6af5becb306e',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59f85ac9-0097-463c-b91b-6d74777c5a55' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '59f85ac9-0097-463c-b91b-6d74777c5a55',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b08d0b2-50b0-492e-8639-98538371560e' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'TrainingSnapshotID')) BEGIN
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
            '4b08d0b2-50b0-492e-8639-98538371560e',
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
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40a9ac69-85a2-4f16-8910-7e96274deb16' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '40a9ac69-85a2-4f16-8910-7e96274deb16',
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
            '7DB88C96-C922-4724-AE93-7B91798CEAFE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82fa5ea5-51c7-46ed-8447-58fa5e3d023f' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'CodeVersion')) BEGIN
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
            '82fa5ea5-51c7-46ed-8447-58fa5e3d023f',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b27c085b-e8b8-4e9b-93ae-f9b018cb6ba6' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'ComputeSeconds')) BEGIN
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
            'b27c085b-e8b8-4e9b-93ae-f9b018cb6ba6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9142009-7413-48c2-afc9-23528c97083a' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'EffectiveAsOf')) BEGIN
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
            'a9142009-7413-48c2-afc9-23528c97083a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c731f43-07c1-4972-a06a-92209286f478' OR (EntityID = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND Name = 'InputAsOf')) BEGIN
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
            '7c731f43-07c1-4972-a06a-92209286f478',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f6d36e6-64eb-4972-8590-dff51bfeed77' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'PredictionUnitID')) BEGIN
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
            '5f6d36e6-64eb-4972-8590-dff51bfeed77',
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
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50d68b63-68b4-4a71-82c0-02fd0d7ccfc0' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'EvaluationProtocolID')) BEGIN
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
            '50d68b63-68b4-4a71-82c0-02fd0d7ccfc0',
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
            '7DB88C96-C922-4724-AE93-7B91798CEAFE',
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

/* SQL text to insert entity field value with ID 9cc0abeb-8746-4d07-8802-fac33b262693 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9cc0abeb-8746-4d07-8802-fac33b262693', '2153C8C2-8DFF-422C-9759-8EE80F53F0AE', 1, '1', '1', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2153C8C2-8DFF-422C-9759-8EE80F53F0AE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2153C8C2-8DFF-422C-9759-8EE80F53F0AE';

/* SQL text to insert entity field value with ID 87a6fd51-4138-4c6c-9999-e19b6b867ad6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87a6fd51-4138-4c6c-9999-e19b6b867ad6', 'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8', 1, 'human-only', 'human-only', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6b87db2b-b65c-4523-b4e2-f574eb9fafdf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6b87db2b-b65c-4523-b4e2-f574eb9fafdf', 'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8', 2, 'non-agent', 'non-agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8';

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


/* Create Entity Relationship: MJ: ML Prediction Units -> MJ: ML Prediction Units (One To Many via LineageRootID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6216a501-fcbb-4ac1-8a55-628b7182f952' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityJoinField] = 'LineageRootID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6216a501-fcbb-4ac1-8a55-628b7182f952', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'LineageRootID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Prediction Units -> MJ: ML Training Snapshots (One To Many via PredictionUnitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8463ebe3-2d8e-4f8d-9d6b-21ef5ce17f20' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'PredictionUnitID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8463ebe3-2d8e-4f8d-9d6b-21ef5ce17f20', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'PredictionUnitID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Prediction Units -> MJ: ML Training Pipelines (One To Many via PredictionUnitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a647bcd2-b388-4a5a-9565-75963787ab4e' OR ([EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [RelatedEntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND [RelatedEntityJoinField] = 'PredictionUnitID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a647bcd2-b388-4a5a-9565-75963787ab4e', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'PredictionUnitID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: File Storage Providers -> MJ: ML Training Snapshots (One To Many via StorageProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bbb7a603-1307-4929-bb90-44c9a3113e06' OR ([EntityID] = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'StorageProviderID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bbb7a603-1307-4929-bb90-44c9a3113e06', '28248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'StorageProviderID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: ML Training Snapshots (One To Many via MatrixFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '20d7c085-dce4-4a7c-9ec7-79a15c62896a' OR ([EntityID] = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'MatrixFileID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('20d7c085-dce4-4a7c-9ec7-79a15c62896a', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'MatrixFileID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Files -> MJ: ML Training Snapshots (One To Many via RowManifestFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5a28a7fb-c4f2-4aaa-9ba8-5fa271556841' OR ([EntityID] = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'RowManifestFileID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5a28a7fb-c4f2-4aaa-9ba8-5fa271556841', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'RowManifestFileID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Files -> MJ: ML Training Snapshots (One To Many via ProvenanceFileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b9a1f060-e95e-43ad-83e1-8f1b2d1569e0' OR ([EntityID] = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'ProvenanceFileID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b9a1f060-e95e-43ad-83e1-8f1b2d1569e0', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'ProvenanceFileID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Snapshots -> MJ: ML Training Runs (One To Many via TrainingSnapshotID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '24a3a8a7-1dbb-44ac-b1b2-ec9fd437c8af' OR ([EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityJoinField] = 'TrainingSnapshotID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('24a3a8a7-1dbb-44ac-b1b2-ec9fd437c8af', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'TrainingSnapshotID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Training Snapshots (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6930ccde-4cee-458b-bec5-aa803c76e18a' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6930ccde-4cee-458b-bec5-aa803c76e18a', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'EvaluationProtocolID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Evaluation Protocols (One To Many via LineageRootID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5f43125b-bead-42b7-b2db-448378807db3' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityJoinField] = 'LineageRootID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5f43125b-bead-42b7-b2db-448378807db3', '7DB88C96-C922-4724-AE93-7B91798CEAFE', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'LineageRootID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Training Runs (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '34415204-8d17-40ce-a99f-e6bf63041940' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('34415204-8d17-40ce-a99f-e6bf63041940', '7DB88C96-C922-4724-AE93-7B91798CEAFE', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'EvaluationProtocolID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Evaluation Protocols -> MJ: ML Training Pipelines (One To Many via EvaluationProtocolID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9a30061a-304a-40ef-a11e-c391148679c0' OR ([EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [RelatedEntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND [RelatedEntityJoinField] = 'EvaluationProtocolID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9a30061a-304a-40ef-a11e-c391148679c0', '7DB88C96-C922-4724-AE93-7B91798CEAFE', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'EvaluationProtocolID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Training Pipelines -> MJ: ML Training Snapshots (One To Many via PipelineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e39332d1-4a97-4201-ac02-14e2b654a90f' OR ([EntityID] = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND [RelatedEntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [RelatedEntityJoinField] = 'PipelineID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e39332d1-4a97-4201-ac02-14e2b654a90f', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'PipelineID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

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

/* Index for Foreign Keys for MLEvaluationProtocol */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key LineageRootID in table MLEvaluationProtocol
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLEvaluationProtocol_LineageRootID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLEvaluationProtocol]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLEvaluationProtocol_LineageRootID ON [${flyway:defaultSchema}].[MLEvaluationProtocol] ([LineageRootID]);

/* SQL text to update entity field related entity name field map for entity field ID CC21F4D2-0D46-44B0-8FE4-C16DFDF4C522 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CC21F4D2-0D46-44B0-8FE4-C16DFDF4C522', @RelatedEntityNameFieldMap='LineageRoot';

/* Base View SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: vwMLEvaluationProtocols
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Evaluation Protocols
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLEvaluationProtocol
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLEvaluationProtocols]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLEvaluationProtocols];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLEvaluationProtocols]
AS
SELECT
    m.*,
    MJMLEvaluationProtocol_LineageRootID.[Name] AS [LineageRoot]
FROM
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_LineageRootID
  ON
    [m].[LineageRootID] = MJMLEvaluationProtocol_LineageRootID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: Permissions for vwMLEvaluationProtocols
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: spCreateMLEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLEvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol]
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
        INSERT INTO [${flyway:defaultSchema}].[MLEvaluationProtocol]
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
        INSERT INTO [${flyway:defaultSchema}].[MLEvaluationProtocol]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwMLEvaluationProtocols] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Evaluation Protocols */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: spUpdateMLEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLEvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol]
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
        [${flyway:defaultSchema}].[MLEvaluationProtocol]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLEvaluationProtocols] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLEvaluationProtocols]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLEvaluationProtocol table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLEvaluationProtocol]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLEvaluationProtocol];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLEvaluationProtocol
ON [${flyway:defaultSchema}].[MLEvaluationProtocol]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLEvaluationProtocol]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLEvaluationProtocol] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Evaluation Protocols */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: spDeleteMLEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLEvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLEvaluationProtocol]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Evaluation Protocols */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLPredictionUnit */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key LineageRootID in table MLPredictionUnit
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLPredictionUnit_LineageRootID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLPredictionUnit]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLPredictionUnit_LineageRootID ON [${flyway:defaultSchema}].[MLPredictionUnit] ([LineageRootID]);

/* SQL text to update entity field related entity name field map for entity field ID D4C1CA8F-92F6-4D1F-91B8-7989C68A2FF3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D4C1CA8F-92F6-4D1F-91B8-7989C68A2FF3', @RelatedEntityNameFieldMap='LineageRoot';

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

/* SQL text to update entity field related entity name field map for entity field ID 5F6D36E6-64EB-4972-8590-DFF51BFEED77 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5F6D36E6-64EB-4972-8590-DFF51BFEED77', @RelatedEntityNameFieldMap='PredictionUnit';

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

/* SQL text to update entity field related entity name field map for entity field ID 40A9AC69-85A2-4F16-8910-7E96274DEB16 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='40A9AC69-85A2-4F16-8910-7E96274DEB16', @RelatedEntityNameFieldMap='EvaluationProtocol';

/* Index for Foreign Keys for MLTrainingSnapshot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PipelineID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_PipelineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_PipelineID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([PipelineID]);

-- Index for foreign key PredictionUnitID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_PredictionUnitID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_PredictionUnitID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([PredictionUnitID]);

-- Index for foreign key EvaluationProtocolID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_EvaluationProtocolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_EvaluationProtocolID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([EvaluationProtocolID]);

-- Index for foreign key StorageProviderID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_StorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_StorageProviderID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([StorageProviderID]);

-- Index for foreign key MatrixFileID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_MatrixFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_MatrixFileID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([MatrixFileID]);

-- Index for foreign key RowManifestFileID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_RowManifestFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_RowManifestFileID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([RowManifestFileID]);

-- Index for foreign key ProvenanceFileID in table MLTrainingSnapshot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_ProvenanceFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingSnapshot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingSnapshot_ProvenanceFileID ON [${flyway:defaultSchema}].[MLTrainingSnapshot] ([ProvenanceFileID]);

/* SQL text to update entity field related entity name field map for entity field ID 8F8D2651-B8BD-4406-A051-567B13BDCA78 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F8D2651-B8BD-4406-A051-567B13BDCA78', @RelatedEntityNameFieldMap='Pipeline';

/* Base View SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: vwMLPredictionUnits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Prediction Units
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLPredictionUnit
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLPredictionUnits]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLPredictionUnits];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLPredictionUnits]
AS
SELECT
    m.*,
    MJMLPredictionUnit_LineageRootID.[Name] AS [LineageRoot]
FROM
    [${flyway:defaultSchema}].[MLPredictionUnit] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_LineageRootID
  ON
    [m].[LineageRootID] = MJMLPredictionUnit_LineageRootID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: Permissions for vwMLPredictionUnits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: spCreateMLPredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLPredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLPredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLPredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLPredictionUnit]
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
        INSERT INTO [${flyway:defaultSchema}].[MLPredictionUnit]
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
        INSERT INTO [${flyway:defaultSchema}].[MLPredictionUnit]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwMLPredictionUnits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Prediction Units */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: spUpdateMLPredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLPredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLPredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPredictionUnit]
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
        [${flyway:defaultSchema}].[MLPredictionUnit]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLPredictionUnits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLPredictionUnits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLPredictionUnit table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLPredictionUnit]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLPredictionUnit];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLPredictionUnit
ON [${flyway:defaultSchema}].[MLPredictionUnit]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLPredictionUnit]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLPredictionUnit] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Prediction Units */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: spDeleteMLPredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLPredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLPredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPredictionUnit]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLPredictionUnit]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Prediction Units */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 517ACE76-EC37-449F-8AB2-737099D8C1D2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='517ACE76-EC37-449F-8AB2-737099D8C1D2', @RelatedEntityNameFieldMap='PredictionUnit';

/* SQL text to update entity field related entity name field map for entity field ID 50D68B63-68B4-4A71-82C0-02FD0D7CCFC0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='50D68B63-68B4-4A71-82C0-02FD0D7CCFC0', @RelatedEntityNameFieldMap='EvaluationProtocol';

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
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
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
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
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

/* SQL text to update entity field related entity name field map for entity field ID 5F49F9E6-7306-4F1A-8179-0A04EE34415A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5F49F9E6-7306-4F1A-8179-0A04EE34415A', @RelatedEntityNameFieldMap='EvaluationProtocol';

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
    MJMLPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
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
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_PredictionUnitID
  ON
    [m].[PredictionUnitID] = MJMLPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
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

/* SQL text to update entity field related entity name field map for entity field ID 366BD221-DEAD-41DC-AD75-3642FC088FA9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='366BD221-DEAD-41DC-AD75-3642FC088FA9', @RelatedEntityNameFieldMap='StorageProvider';

/* SQL text to update entity field related entity name field map for entity field ID 8E286DA2-8662-49FB-B490-94148BC6F2C9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8E286DA2-8662-49FB-B490-94148BC6F2C9', @RelatedEntityNameFieldMap='MatrixFile';

/* SQL text to update entity field related entity name field map for entity field ID 19A80161-8C30-4528-B62F-F528DACF4F0B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='19A80161-8C30-4528-B62F-F528DACF4F0B', @RelatedEntityNameFieldMap='RowManifestFile';

/* SQL text to update entity field related entity name field map for entity field ID 2E6DA552-0E71-4FB7-8E9C-F435F11D1FC7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2E6DA552-0E71-4FB7-8E9C-F435F11D1FC7', @RelatedEntityNameFieldMap='ProvenanceFile';

/* Base View SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: vwMLTrainingSnapshots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Snapshots
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingSnapshot
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingSnapshots]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingSnapshots];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingSnapshots]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJMLPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol],
    MJFileStorageProvider_StorageProviderID.[Name] AS [StorageProvider],
    MJFile_MatrixFileID.[Name] AS [MatrixFile],
    MJFile_RowManifestFileID.[Name] AS [RowManifestFile],
    MJFile_ProvenanceFileID.[Name] AS [ProvenanceFile]
FROM
    [${flyway:defaultSchema}].[MLTrainingSnapshot] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_PredictionUnitID
  ON
    [m].[PredictionUnitID] = MJMLPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_StorageProviderID
  ON
    [m].[StorageProviderID] = MJFileStorageProvider_StorageProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_MatrixFileID
  ON
    [m].[MatrixFileID] = MJFile_MatrixFileID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RowManifestFileID
  ON
    [m].[RowManifestFileID] = MJFile_RowManifestFileID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_ProvenanceFileID
  ON
    [m].[ProvenanceFileID] = MJFile_ProvenanceFileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: Permissions for vwMLTrainingSnapshots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: spCreateMLTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot]
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
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingSnapshot]
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
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingSnapshot]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingSnapshots] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Snapshots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: spUpdateMLTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot]
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
        [${flyway:defaultSchema}].[MLTrainingSnapshot]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingSnapshots] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingSnapshots]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingSnapshot table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingSnapshot]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingSnapshot];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingSnapshot
ON [${flyway:defaultSchema}].[MLTrainingSnapshot]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingSnapshot]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingSnapshot] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Training Snapshots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: spDeleteMLTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingSnapshot]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Snapshots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds int
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools], [MaxSubAgentConsultRounds]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools, @MaxSubAgentConsultRounds = @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, @MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, @MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, @MJAIAgents_ContextCompressionPromptID_TypeConfiguration, @MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, @MJAIAgents_ContextCompressionPromptID_RecordingDefault, @MJAIAgents_ContextCompressionPromptID_RecordingStorageProviderID, @MJAIAgents_ContextCompressionPromptID_DefaultMediaCollectionID, @MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, @MJAIAgents_ContextCompressionPromptID_AcceptsSkills, @MJAIAgents_ContextCompressionPromptID_SkillActivationMode, @MJAIAgents_ContextCompressionPromptID_RequirePlanMode, @MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, @MJAIAgents_ContextCompressionPromptID_CompactionTriggerPercent, @MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, @MJAIAgents_ContextCompressionPromptID_ConversationSummaryPromptID, @MJAIAgents_ContextCompressionPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ContextCompressionPromptID_MaxSubAgentConsultRounds
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
    DECLARE @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds int
    DECLARE cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools], [MaxSubAgentConsultRounds]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ConversationSummaryPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ConversationSummaryPromptIDID, @Name = @MJAIAgents_ConversationSummaryPromptID_Name, @Description = @MJAIAgents_ConversationSummaryPromptID_Description, @LogoURL = @MJAIAgents_ConversationSummaryPromptID_LogoURL, @ParentID = @MJAIAgents_ConversationSummaryPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ConversationSummaryPromptID_TypeID, @Status = @MJAIAgents_ConversationSummaryPromptID_Status, @DriverClass = @MJAIAgents_ConversationSummaryPromptID_DriverClass, @IconClass = @MJAIAgents_ConversationSummaryPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MessageMode = @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MaxMessages = @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ConversationSummaryPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @ConversationSummaryPromptID_Clear = 1, @ConversationSummaryPromptID = @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools, @MaxSubAgentConsultRounds = @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds

        FETCH NEXT FROM cascade_update_MJAIAgents_ConversationSummaryPromptID_cursor INTO @MJAIAgents_ConversationSummaryPromptIDID, @MJAIAgents_ConversationSummaryPromptID_Name, @MJAIAgents_ConversationSummaryPromptID_Description, @MJAIAgents_ConversationSummaryPromptID_LogoURL, @MJAIAgents_ConversationSummaryPromptID_ParentID, @MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, @MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, @MJAIAgents_ConversationSummaryPromptID_ExecutionMode, @MJAIAgents_ConversationSummaryPromptID_EnableContextCompression, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionPromptID, @MJAIAgents_ConversationSummaryPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ConversationSummaryPromptID_TypeID, @MJAIAgents_ConversationSummaryPromptID_Status, @MJAIAgents_ConversationSummaryPromptID_DriverClass, @MJAIAgents_ConversationSummaryPromptID_IconClass, @MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, @MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, @MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, @MJAIAgents_ConversationSummaryPromptID_PayloadScope, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, @MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidation, @MJAIAgents_ConversationSummaryPromptID_StartingPayloadValidationMode, @MJAIAgents_ConversationSummaryPromptID_DefaultPromptEffortLevel, @MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, @MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, @MJAIAgents_ConversationSummaryPromptID_OwnerUserID, @MJAIAgents_ConversationSummaryPromptID_InvocationMode, @MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, @MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, @MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, @MJAIAgents_ConversationSummaryPromptID_InjectNotes, @MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, @MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_InjectExamples, @MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, @MJAIAgents_ConversationSummaryPromptID_ExampleInjectionStrategy, @MJAIAgents_ConversationSummaryPromptID_IsRestricted, @MJAIAgents_ConversationSummaryPromptID_MessageMode, @MJAIAgents_ConversationSummaryPromptID_MaxMessages, @MJAIAgents_ConversationSummaryPromptID_AttachmentStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, @MJAIAgents_ConversationSummaryPromptID_InlineStorageThresholdBytes, @MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, @MJAIAgents_ConversationSummaryPromptID_ScopeConfig, @MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, @MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, @MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, @MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, @MJAIAgents_ConversationSummaryPromptID_CategoryID, @MJAIAgents_ConversationSummaryPromptID_AllowEphemeralClientTools, @MJAIAgents_ConversationSummaryPromptID_DefaultStorageAccountID, @MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, @MJAIAgents_ConversationSummaryPromptID_AcceptUnregisteredFiles, @MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, @MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, @MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, @MJAIAgents_ConversationSummaryPromptID_RecordingDefault, @MJAIAgents_ConversationSummaryPromptID_RecordingStorageProviderID, @MJAIAgents_ConversationSummaryPromptID_DefaultMediaCollectionID, @MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, @MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, @MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, @MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, @MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, @MJAIAgents_ConversationSummaryPromptID_CompactionTriggerPercent, @MJAIAgents_ConversationSummaryPromptID_CompactionTargetPercent, @MJAIAgents_ConversationSummaryPromptID_ConversationSummaryPromptID, @MJAIAgents_ConversationSummaryPromptID_DeclareActionsAsNativeTools, @MJAIAgents_ConversationSummaryPromptID_MaxSubAgentConsultRounds
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2659c3fc-5c4a-45a1-8503-ea35e535dc86' OR (EntityID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND Name = 'LineageRoot')) BEGIN
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
            '2659c3fc-5c4a-45a1-8503-ea35e535dc86',
            'D5052EB0-354C-4C4D-80D8-2832FCC720E6', -- Entity: MJ: ML Prediction Units
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3cb7ff9-ef00-4328-91b5-1636e0fe28a2' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'Pipeline')) BEGIN
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
            'e3cb7ff9-ef00-4328-91b5-1636e0fe28a2',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3209c303-58d1-4664-92e5-25346fe4c7c8' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'PredictionUnit')) BEGIN
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
            '3209c303-58d1-4664-92e5-25346fe4c7c8',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8da58777-5274-49b8-b769-6b0414de7778' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'EvaluationProtocol')) BEGIN
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
            '8da58777-5274-49b8-b769-6b0414de7778',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29b6e621-51f1-440c-8ef9-591e60ad2c8b' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'StorageProvider')) BEGIN
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
            '29b6e621-51f1-440c-8ef9-591e60ad2c8b',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e9b5c93d-9be8-4dc8-a6ca-1fc07af0c9c1' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'MatrixFile')) BEGIN
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
            'e9b5c93d-9be8-4dc8-a6ca-1fc07af0c9c1',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad7d26ec-0d16-4859-a709-e65dedb0336e' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'RowManifestFile')) BEGIN
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
            'ad7d26ec-0d16-4859-a709-e65dedb0336e',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '932935b3-e8ab-43b8-a9f8-1bee61f1f8c9' OR (EntityID = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND Name = 'ProvenanceFile')) BEGIN
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
            '932935b3-e8ab-43b8-a9f8-1bee61f1f8c9',
            'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', -- Entity: MJ: ML Training Snapshots
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4d9a19f-c0f1-4a25-b2c3-a8328b332c0d' OR (EntityID = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND Name = 'LineageRoot')) BEGIN
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
            'f4d9a19f-c0f1-4a25-b2c3-a8328b332c0d',
            '7DB88C96-C922-4724-AE93-7B91798CEAFE', -- Entity: MJ: ML Evaluation Protocols
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3bf248e-6359-45b4-8054-c5ce314ab738' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'EvaluationProtocol')) BEGIN
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
            'f3bf248e-6359-45b4-8054-c5ce314ab738',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10e2d48e-5d23-4ccf-b10a-8ac9bc84726f' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'PredictionUnit')) BEGIN
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
            '10e2d48e-5d23-4ccf-b10a-8ac9bc84726f',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4d5c9f6-af81-425a-b535-5fe9ffe84047' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'EvaluationProtocol')) BEGIN
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
            'b4d5c9f6-af81-425a-b535-5fe9ffe84047',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A0E507E5-ACC9-4D6B-AB4A-49FE2BE84B96'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2153C8C2-8DFF-422C-9759-8EE80F53F0AE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D44848C6-9CAB-4C17-A4E8-27EDA46692D6'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'FA8D93A6-C4F0-4B15-9516-7815BBC9BBC0'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AB85C20F-FF13-41C9-A11E-2CF9E8294260'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A69B3C8C-BDE6-4674-B41D-A56C677DE157'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8FAA92F0-8F7C-4739-A762-9489835D71B9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E3CB7FF9-EF00-4328-91B5-1636E0FE28A2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3209C303-58D1-4664-92E5-25346FE4C7C8'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B27C085B-E8B8-4E9B-93AE-F9B018CB6BA6'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 4 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit'
WHERE 
   ID = '5F6D36E6-64EB-4972-8590-DFF51BFEED77';

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Safety',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '50D68B63-68B4-4A71-82C0-02FD0D7CCFC0';

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit Name'
WHERE 
   ID = '10E2D48E-5D23-4CCF-B10A-8AC9BC84726F';

-- UPDATE Entity Field Category Info MJ: ML Training Pipelines.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Safety',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Name'
WHERE 
   ID = 'B4D5C9F6-AF81-425A-B535-5FE9FFE84047';

/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Runs.TrainingSnapshotID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Training Snapshot'
WHERE 
   ID = '4B08D0B2-50B0-492E-8639-98538371560E';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '40A9AC69-85A2-4F16-8910-7E96274DEB16';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.CodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '82FA5EA5-51C7-46ED-8447-58FA5E3D023F';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.ComputeSeconds 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resource Usage',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B27C085B-E8B8-4E9B-93AE-F9B018CB6BA6';

-- UPDATE Entity Field Category Info MJ: ML Training Runs.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Performance Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol Details'
WHERE 
   ID = 'F3BF248E-6359-45B4-8054-C5CE314AB738';

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Feature Values.EffectiveAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A9142009-7413-48C2-AFC9-23528C97083A';

-- UPDATE Entity Field Category Info MJ: Feature Values.InputAsOf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Record Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7C731F43-07C1-4972-A06A-92209286F478';

/* Set categories for 43 fields */

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '28D4BE83-B39F-4E10-B368-0FE0C171A22B';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ContentHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FA8D93A6-C4F0-4B15-9516-7815BBC9BBC0';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.PipelineID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Pipeline'
WHERE 
   ID = '8F8D2651-B8BD-4406-A051-567B13BDCA78';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.PredictionUnitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prediction Unit'
WHERE 
   ID = '517ACE76-EC37-449F-8AB2-737099D8C1D2';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.LabelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F2EC3773-FCE0-461A-BDDB-88489F0AB03D';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSpecVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C4FA37EF-982B-456F-BBFC-4497138B31EB';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.EvaluationProtocolID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category',
   DisplayName = 'Evaluation Protocol'
WHERE 
   ID = '5F49F9E6-7306-4F1A-8179-0A04EE34415A';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.StorageProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Provider'
WHERE 
   ID = '366BD221-DEAD-41DC-AD75-3642FC088FA9';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix File'
WHERE 
   ID = '8E286DA2-8662-49FB-B490-94148BC6F2C9';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix SHA-256'
WHERE 
   ID = '2C1D1E86-BE68-4BB1-B4EC-6D0483A55C3A';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Matrix Size (Bytes)'
WHERE 
   ID = 'DC5FA05B-7FE5-46F1-9A98-6423FAE0DE42';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest File'
WHERE 
   ID = '19A80161-8C30-4528-B62F-F528DACF4F0B';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest SHA-256'
WHERE 
   ID = 'B37E93BE-197F-4B74-B48E-62234B9517C8';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Manifest Size (Bytes)'
WHERE 
   ID = '516F7D0D-F38E-4395-AB5C-32C77E664C1D';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceFileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance File'
WHERE 
   ID = '2E6DA552-0E71-4FB7-8E9C-F435F11D1FC7';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceSha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance SHA-256'
WHERE 
   ID = '2A05375B-B318-46B5-A58E-6028B17B7E17';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceSizeBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provenance Size (Bytes)'
WHERE 
   ID = 'A79C79E3-9BA0-4C54-A5C3-96A5D874FB7F';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ManifestRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Metrics and Statistics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AB85C20F-FF13-41C9-A11E-2CF9E8294260';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.HoldoutRowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Metrics and Statistics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A69B3C8C-BDE6-4674-B41D-A56C677DE157';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema and Features',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '62861DC3-7A4F-4111-B64E-A3B8AFAA664D';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema and Features',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '40DEF3C6-04B1-4246-99D7-6965D37961D5';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSchemaHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema and Features',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '84377039-15BD-41FF-AC27-B86D47E655DF';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ColumnProvenance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema and Features',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7EB7A214-D268-4BA4-97BA-E6D2330EFE95';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.PinnedFeatureVersions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Schema and Features',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6A1C77E5-A702-4ED3-89B5-D9495F9B85A2';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowsRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Metrics and Statistics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FCD672B4-13C6-4B49-A7A3-3CE86A1C135C';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ReadComplete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Row Metrics and Statistics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8DBCA900-1A90-4D1B-B7CB-A95353041A58';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.CensoredRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Exclusions and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C5447115-F0D9-4E3E-A5F7-99B604CAE9D7';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.LabelKnownRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Exclusions and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F8A7611F-6332-465B-B2BF-7FF6BBD329A9';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.EmptyLabelRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Exclusions and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C2C36E97-D80C-47A6-B1BE-52E9D9253A13';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.UncoveredHistoryRowsExcluded 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Exclusions and Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '19F7A467-C851-4C98-843B-1235819DA36F';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.DuplicateRowsRemoved 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Exclusions and Metrics',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8F0B40EF-42CF-4A22-B77B-320E5AAB0542';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ClassBalance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Exclusions and Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6A9FECD0-FB18-4F21-A6F8-F5F48ED17203';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.DataCutoff 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8FAA92F0-8F7C-4739-A762-9489835D71B9';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.AssemblyCodeVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Snapshot Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DBC13174-3A1D-4F40-A5D3-95D40FBB2819';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '68F17137-6405-460D-9796-60785602A4D3';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ABFCFA3F-1315-4DF2-AC8A-E710F99823C2';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.Pipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E3CB7FF9-EF00-4328-91B5-1636E0FE28A2';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.PredictionUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3209C303-58D1-4664-92E5-25346FE4C7C8';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.EvaluationProtocol 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration References',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8DA58777-5274-49B8-B769-6B0414DE7778';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.StorageProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '29B6E621-51F1-440C-8EF9-591E60AD2C8B';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E9B5C93D-9BE8-4DC8-A6CA-1FC07AF0C9C1';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AD7D26EC-0D16-4859-A709-E65DEDB0336E';

-- UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceFile 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Storage Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '932935B3-E8AB-43B8-A9F8-1BEE61F1F8C9';

/* Set entity icon to fa fa-database */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-database', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7a2a7e43-c12c-5b20-9c72-10509bd216b8', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'FieldCategoryInfo', '{
  "Configuration References": {
    "description": "Pipeline, prediction unit, protocol, and cutoff configurations",
    "icon": "fa fa-cogs"
  },
  "Exclusions and Metrics": {
    "description": "Details on censored, excluded, or removed rows and class balancing",
    "icon": "fa fa-filter"
  },
  "File Storage Metadata": {
    "description": "Storage providers, file references, file sizes, and hashes for underlying snapshot files",
    "icon": "fa fa-file-archive"
  },
  "Row Metrics and Statistics": {
    "description": "Counts and statistics regarding rows read, manifest totals, and holdouts",
    "icon": "fa fa-list-ol"
  },
  "Schema and Features": {
    "description": "JSON schemas, feature specifications, column provenance, and pinned versions",
    "icon": "fa fa-table"
  },
  "Snapshot Identity": {
    "description": "Unique identifiers, hashes, and versioning info for the training snapshot",
    "icon": "fa fa-fingerprint"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5aaf856e-03ac-5309-8a7a-9f4576696e17', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'FieldCategoryIcons', '{
  "Configuration References": "fa fa-cogs",
  "Exclusions and Metrics": "fa fa-filter",
  "File Storage Metadata": "fa fa-file-archive",
  "Row Metrics and Statistics": "fa fa-list-ol",
  "Schema and Features": "fa fa-table",
  "Snapshot Identity": "fa fa-fingerprint"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6';

/* Set categories for 21 fields */

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F4CAAED2-29AD-4AE4-9D27-662406E3876F';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.LineageRootID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lineage and Versioning',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D4C1CA8F-92F6-4D1F-91B8-7989C68A2FF3';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lineage and Versioning',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '75BD5E78-48BB-44D8-8B1F-CFB4EDFEF309';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lineage and Versioning',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1A414A7A-B576-49C5-917C-5586FD9E645F';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.LineageRoot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lineage and Versioning',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2659C3FC-5C4A-45A1-8503-EA35E535DC86';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prediction Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '367EF229-E773-4EFF-9050-D5D864329C7B';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prediction Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '40751F77-3489-4BB1-A007-C3BF4F909221';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.TaskType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prediction Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '6DA08AF0-F2F5-4294-ABE1-F2DE92A4278C';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.UnitRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data and Feature Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D3AAFFD7-39E7-4318-9C7E-78D1B274CF2E';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.GroupKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data and Feature Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E6E6F6EE-8E03-44CD-91D3-F0A699D94A23';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.TemporalSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data and Feature Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '599B6550-9744-441D-8D28-25DC8505914F';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelRule 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B1701DB5-91DC-477C-8E8A-8191F18F3945';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelWindowDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '497D0450-7569-4AE2-AC34-2110C4CCE6FC';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelGapDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E6D5425D-6E89-42DB-A089-E6020B969496';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.Censoring 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Outcome and Labeling',
   GeneratedFormSection = 'Category',
   DisplayName = 'Censoring Rule',
   ExtendedType = 'JSON'
WHERE 
   ID = '6E84BDAE-C220-42F7-9716-AE7DA85BB277';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.ChangeHistoryPolicy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Execution and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '02F695D3-28BB-414A-876D-37B0AD1DCAEB';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.DecisionSpec 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Execution and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B01E7DA7-5AA2-43E0-8414-47F2158F208D';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.IncumbentHeuristic 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Execution and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '743899B5-546D-47B9-AA4B-28623BC2885E';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.AuthoredBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Execution and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C44C7B71-E487-4C32-A7FC-12A714715BBD';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '247807BD-B812-4DE5-9D17-49788C5E7B29';

-- UPDATE Entity Field Category Info MJ: ML Prediction Units.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A565F607-69D9-4D1E-B326-5067CD19DD8B';

/* Set entity icon to fa fa-chart-line */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-chart-line', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('65441f16-8ce2-51b7-846d-c0518ad1e20a', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'FieldCategoryInfo', '{
  "Data and Feature Configuration": {
    "description": "Configuration defining training rows, groupings, and temporal specifications",
    "icon": "fa fa-database"
  },
  "Lineage and Versioning": {
    "description": "Tracks immutable versions and lineage root identifiers for models",
    "icon": "fa fa-code-branch"
  },
  "Model Execution and Governance": {
    "description": "Decision specifications, change history policies, heuristics, and authorship",
    "icon": "fa fa-cogs"
  },
  "Outcome and Labeling": {
    "description": "Rules governing outcome observation windows, gaps, and censoring",
    "icon": "fa fa-tags"
  },
  "Prediction Definition": {
    "description": "Core identity, task type, and description of what the unit predicts",
    "icon": "fa fa-bullseye"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c912dfe4-1540-534e-8e0e-2e8d1229e257', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'FieldCategoryIcons', '{
  "Data and Feature Configuration": "fa fa-database",
  "Lineage and Versioning": "fa fa-code-branch",
  "Model Execution and Governance": "fa fa-cogs",
  "Outcome and Labeling": "fa fa-tags",
  "Prediction Definition": "fa fa-bullseye",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6';

/* Set categories for 31 fields */

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Basic Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1B8C4AD9-59E6-421E-B28D-C2C60D8C9AEF';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.LineageRootID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Basic Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CC21F4D2-0D46-44B0-8FE4-C16DFDF4C522';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Version 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Basic Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E16B9172-338C-4D7A-8DFE-F9FA06CF4DB8';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Basic Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D44848C6-9CAB-4C17-A4E8-27EDA46692D6';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Basic Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B1985F44-5F4F-4831-BB96-3470CE296583';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.LineageRoot 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Basic Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F4D9A19F-C0F1-4A25-B2C3-A8328B332C0D';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Holdout 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Splits',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'D3C7BAEF-DF62-4355-A7ED-CDE904B888D5';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.InnerValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Splits',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '968AFD18-C8A9-41C6-A03C-4D284033BD6B';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Seed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Splits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A0E507E5-ACC9-4D6B-AB4A-49FE2BE84B96';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.HoldoutAccessBudget 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation and Splits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2153C8C2-8DFF-422C-9759-8EE80F53F0AE';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.PrimaryScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '18636BB2-A8BE-4A84-9C8F-211A35FF4D00';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.SecondaryMetrics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '252225D0-F65A-453D-9390-2C2C7DA687A2';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Baselines 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '89230037-5A26-4441-911F-2B9FAE0369B9';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Calibration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E170CD66-F89B-4403-8538-E80E3757DF23';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Resampling 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7B16E14F-39A2-4405-B612-AEDB8FB5A4E5';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Intervals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'E12EF381-23CB-44F0-9234-27AD4854A41E';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.PredictionIntervals 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '32743338-0281-4A24-BA0A-4EF8D5281866';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.ResidualDiagnostics 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Metrics and Evaluation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '0AE6C0A7-5B72-4C3A-A080-154BE17DA485';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Promotion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '53A6B363-0C31-4A02-8098-7997FFA6773B';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.AllowedOutcomes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'F849C1E5-2A72-459C-9C5B-65BF039E73BC';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.LeakageAudit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '30B68CF1-3409-453A-98C2-E6C2255AC836';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Exclusions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'F3F5A513-4467-46A9-865E-1BEC926439F1';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Slices 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'FB620DF0-FC76-4D02-B7C8-1BFA3C19770C';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.RetrainTriggers 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'ACBD66B0-1219-4441-A7C0-0F82808E40F7';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.SearchStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '2B05F9BD-D5A9-4852-B5B1-48C58796AE02';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Budgets 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '2AF1A4EE-1133-458C-AD90-AD95DD2F1043';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.MinMinorityClassRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5A26CA06-0E44-4CE3-AB6D-C7541002EED3';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.GuardFieldsEditableBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Guards and Governance',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.AuthoredBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7937B713-FF95-424F-A2E6-553E2B545B21';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E1B8FC2B-3BD5-420A-A8D6-6AF5BECB306E';

-- UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '59F85AC9-0097-463C-B91B-6D74777C5A55';

/* Set entity icon to fa fa-sliders-h */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-sliders-h', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fc0cdb71-ad41-564d-b1c9-7ca29ba55f9b', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'FieldCategoryInfo', '{
  "Basic Information": {
    "description": "Core identification, naming, and version lineage details",
    "icon": "fa fa-info-circle"
  },
  "Guards and Governance": {
    "description": "Promotion rules, leakage audits, exclusions, budgets, and governance settings",
    "icon": "fa fa-shield-alt"
  },
  "Metrics and Evaluation": {
    "description": "Scoring metrics, baselines, calibration, and intervals",
    "icon": "fa fa-chart-line"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Validation and Splits": {
    "description": "Holdout splits, inner validation, and randomness seeds",
    "icon": "fa fa-random"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('550557b9-1140-5c42-a744-9d339bb2f2d4', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'FieldCategoryIcons', '{
  "Basic Information": "fa fa-info-circle",
  "Guards and Governance": "fa fa-shield-alt",
  "Metrics and Evaluation": "fa fa-chart-line",
  "System Metadata": "fa fa-cog",
  "Validation and Splits": "fa fa-random"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7DB88C96-C922-4724-AE93-7B91798CEAFE';



/* ---- CodeGen pass 2 ---- */

/* SQL text to update entity field related entity name field map for entity field ID 4B08D0B2-50B0-492E-8639-98538371560E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4B08D0B2-50B0-492E-8639-98538371560E', @RelatedEntityNameFieldMap='TrainingSnapshot';

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
    MJMLTrainingSnapshot_TrainingSnapshotID.[ContentHash] AS [TrainingSnapshot],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
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
    [${flyway:defaultSchema}].[MLTrainingSnapshot] AS MJMLTrainingSnapshot_TrainingSnapshotID
  ON
    [m].[TrainingSnapshotID] = MJMLTrainingSnapshot_TrainingSnapshotID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c79e2fe7-bd1f-4262-a732-ec3026b6f789' OR (EntityID = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND Name = 'TrainingSnapshot')) BEGIN
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
            'c79e2fe7-bd1f-4262-a732-ec3026b6f789',
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
   Category = 'Execution Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C79E2FE7-BD1F-4262-A732-EC3026B6F789';





























































/* =====================================================================================
 * REGENERATED BY THE MEMBERJUNCTION CODEGEN TOOL AFTER THE MERGE OF next AT d8c550453a.
 *
 * next's CodeGen (#6152) renders base-view label joins as LEFT OUTER and records the label
 * fields as nullable; V202611062330 regenerated every entity that existed on next, but not the
 * entities and columns this migration creates. Produced on a database built from the merged
 * migrations alone (mj migrate, then mj codegen --no-ai twice, until a run emitted nothing),
 * keeping only what differs from the block above: the base views and CRUD procedures of
 * MJ: Feature Values and the five ML entities, Source = Check on the ML Evaluation Protocols
 * value-list rows, and the EntityField.AllowsNull values CodeGen derives for the label fields.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * ===================================================================================== */

/* SQL text to update entity field value sequence and source */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET [Source]='Check' WHERE ID='9CC0ABEB-8746-4D07-8802-FAC33B262693';
/* SQL text to update entity field value sequence and source */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET [Source]='Check' WHERE ID='87A6FD51-4138-4C6C-9999-E19B6B867AD6';
/* SQL text to update entity field value sequence and source */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET [Source]='Check' WHERE ID='6B87DB2B-B65C-4523-B4E2-F574EB9FAFDF';

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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordProcess] AS MJRecordProcess_RecordProcessID
  ON
    [f].[RecordProcessID] = MJRecordProcess_RecordProcessID.[ID]
LEFT OUTER JOIN
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
/* Base View SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: vwMLEvaluationProtocols
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Evaluation Protocols
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLEvaluationProtocol
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLEvaluationProtocols]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLEvaluationProtocols];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLEvaluationProtocols]
AS
SELECT
    m.*,
    MJMLEvaluationProtocol_LineageRootID.[Name] AS [LineageRoot]
FROM
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_LineageRootID
  ON
    [m].[LineageRootID] = MJMLEvaluationProtocol_LineageRootID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* Base View Permissions SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: Permissions for vwMLEvaluationProtocols
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLEvaluationProtocols] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* spCreate SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: spCreateMLEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLEvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol]
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
        INSERT INTO [${flyway:defaultSchema}].[MLEvaluationProtocol]
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
        INSERT INTO [${flyway:defaultSchema}].[MLEvaluationProtocol]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwMLEvaluationProtocols] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];
/* spCreate Permissions for MJ: ML Evaluation Protocols */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];
/* spUpdate SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: spUpdateMLEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLEvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol]
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
        [${flyway:defaultSchema}].[MLEvaluationProtocol]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLEvaluationProtocols] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLEvaluationProtocols]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLEvaluationProtocol table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLEvaluationProtocol]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLEvaluationProtocol];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLEvaluationProtocol
ON [${flyway:defaultSchema}].[MLEvaluationProtocol]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLEvaluationProtocol]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLEvaluationProtocol] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
/* spUpdate Permissions for MJ: ML Evaluation Protocols */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];
/* spDelete SQL for MJ: ML Evaluation Protocols */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Evaluation Protocols
-- Item: spDeleteMLEvaluationProtocol
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLEvaluationProtocol
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLEvaluationProtocol]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];
/* spDelete Permissions for MJ: ML Evaluation Protocols */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLEvaluationProtocol] TO [cdp_Developer], [cdp_Integration];
/* Base View SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: vwMLPredictionUnits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Prediction Units
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLPredictionUnit
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLPredictionUnits]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLPredictionUnits];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLPredictionUnits]
AS
SELECT
    m.*,
    MJMLPredictionUnit_LineageRootID.[Name] AS [LineageRoot]
FROM
    [${flyway:defaultSchema}].[MLPredictionUnit] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_LineageRootID
  ON
    [m].[LineageRootID] = MJMLPredictionUnit_LineageRootID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* Base View Permissions SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: Permissions for vwMLPredictionUnits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPredictionUnits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* spCreate SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: spCreateMLPredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLPredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLPredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLPredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLPredictionUnit]
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
        INSERT INTO [${flyway:defaultSchema}].[MLPredictionUnit]
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
        INSERT INTO [${flyway:defaultSchema}].[MLPredictionUnit]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwMLPredictionUnits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];
/* spCreate Permissions for MJ: ML Prediction Units */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];
/* spUpdate SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: spUpdateMLPredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLPredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLPredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPredictionUnit]
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
        [${flyway:defaultSchema}].[MLPredictionUnit]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLPredictionUnits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLPredictionUnits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLPredictionUnit table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLPredictionUnit]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLPredictionUnit];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLPredictionUnit
ON [${flyway:defaultSchema}].[MLPredictionUnit]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLPredictionUnit]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLPredictionUnit] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
/* spUpdate Permissions for MJ: ML Prediction Units */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];
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
    MJMLPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
FROM
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [m].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_PredictionUnitID
  ON
    [m].[PredictionUnitID] = MJMLPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
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
    MJMLTrainingSnapshot_TrainingSnapshotID.[ContentHash] AS [TrainingSnapshot],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol]
FROM
    [${flyway:defaultSchema}].[MLTrainingRun] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExperimentSessionIteration] AS MJExperimentSessionIteration_ExperimentSessionIterationID
  ON
    [m].[ExperimentSessionIterationID] = MJExperimentSessionIteration_ExperimentSessionIterationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingSnapshot] AS MJMLTrainingSnapshot_TrainingSnapshotID
  ON
    [m].[TrainingSnapshotID] = MJMLTrainingSnapshot_TrainingSnapshotID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* Base View SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: vwMLTrainingSnapshots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Snapshots
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingSnapshot
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingSnapshots]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingSnapshots];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingSnapshots]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJMLPredictionUnit_PredictionUnitID.[Name] AS [PredictionUnit],
    MJMLEvaluationProtocol_EvaluationProtocolID.[Name] AS [EvaluationProtocol],
    MJFileStorageProvider_StorageProviderID.[Name] AS [StorageProvider],
    MJFile_MatrixFileID.[Name] AS [MatrixFile],
    MJFile_RowManifestFileID.[Name] AS [RowManifestFile],
    MJFile_ProvenanceFileID.[Name] AS [ProvenanceFile]
FROM
    [${flyway:defaultSchema}].[MLTrainingSnapshot] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLPredictionUnit] AS MJMLPredictionUnit_PredictionUnitID
  ON
    [m].[PredictionUnitID] = MJMLPredictionUnit_PredictionUnitID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLEvaluationProtocol] AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    [m].[EvaluationProtocolID] = MJMLEvaluationProtocol_EvaluationProtocolID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_StorageProviderID
  ON
    [m].[StorageProviderID] = MJFileStorageProvider_StorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_MatrixFileID
  ON
    [m].[MatrixFileID] = MJFile_MatrixFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RowManifestFileID
  ON
    [m].[RowManifestFileID] = MJFile_RowManifestFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_ProvenanceFileID
  ON
    [m].[ProvenanceFileID] = MJFile_ProvenanceFileID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* Base View Permissions SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: Permissions for vwMLTrainingSnapshots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingSnapshots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
/* spCreate SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: spCreateMLTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot]
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
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingSnapshot]
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
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingSnapshot]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingSnapshots] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];
/* spCreate Permissions for MJ: ML Training Snapshots */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];
/* spUpdate SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: spUpdateMLTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot]
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
        [${flyway:defaultSchema}].[MLTrainingSnapshot]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingSnapshots] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingSnapshots]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingSnapshot table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingSnapshot]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingSnapshot];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingSnapshot
ON [${flyway:defaultSchema}].[MLTrainingSnapshot]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingSnapshot]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingSnapshot] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
/* spUpdate Permissions for MJ: ML Training Snapshots */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];
/* spDelete SQL for MJ: ML Prediction Units */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Prediction Units
-- Item: spDeleteMLPredictionUnit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLPredictionUnit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLPredictionUnit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPredictionUnit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPredictionUnit]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLPredictionUnit]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];
/* spDelete Permissions for MJ: ML Prediction Units */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPredictionUnit] TO [cdp_Developer], [cdp_Integration];
/* spDelete SQL for MJ: ML Training Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Snapshots
-- Item: spDeleteMLTrainingSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingSnapshot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingSnapshot]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];
/* spDelete Permissions for MJ: ML Training Snapshots */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingSnapshot] TO [cdp_Developer], [cdp_Integration];

/* EntityField metadata CodeGen derives for the regenerated views (label fields read as nullable through LEFT OUTER joins) */
-- MJ: ML Training Snapshots.Pipeline: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = 'E3CB7FF9-EF00-4328-91B5-1636E0FE28A2';
-- MJ: ML Training Snapshots.ProvenanceFile: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '932935B3-E8AB-43B8-A9F8-1BEE61F1F8C9';
-- MJ: ML Training Snapshots.MatrixFile: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = 'E9B5C93D-9BE8-4DC8-A6CA-1FC07AF0C9C1';
-- MJ: Feature Values.RecordProcess: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '6FB9CC06-9E1A-4309-A119-20D5A6DFBECC';
-- MJ: ML Training Snapshots.PredictionUnit: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '3209C303-58D1-4664-92E5-25346FE4C7C8';
-- MJ: ML Training Pipelines.TargetEntity: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA';
-- MJ: ML Training Snapshots.StorageProvider: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '29B6E621-51F1-440C-8EF9-591E60AD2C8B';
-- MJ: ML Training Runs.Pipeline: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '3C939B88-8A7F-49C5-9567-9E04C7C656DC';
-- MJ: ML Evaluation Protocols.LineageRoot: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = 'F4D9A19F-C0F1-4A25-B2C3-A8328B332C0D';
-- MJ: Feature Values.Entity: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '0E527A97-32CC-495B-9722-CBAD72F46295';
-- MJ: ML Training Pipelines.Algorithm: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '9A40BAC8-DB50-418F-9422-E24C1935E0DA';
-- MJ: ML Training Snapshots.RowManifestFile: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = 'AD7D26EC-0D16-4859-A709-E65DEDB0336E';
-- MJ: ML Prediction Units.LineageRoot: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = '2659C3FC-5C4A-45A1-8503-EA35E535DC86';
-- MJ: ML Training Runs.Algorithm: AllowsNull 0→1
UPDATE [${flyway:defaultSchema}].[EntityField] SET [AllowsNull] = 1 WHERE [ID] = 'E01BA18E-8697-4ECC-9437-F567DAC85155';
