-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611080314__v6.3.x__PS_Honest_Training_Schema.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* *************************************************************************************************
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
 ************************************************************************************************* */
/* ============================================================================ */
/* 1. MLPredictionUnit */
/* ============================================================================ */
CREATE TABLE __mj."MLPredictionUnit" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "LineageRootID" UUID NOT NULL,
  "Version" INT NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "UnitRows" TEXT NOT NULL,
  "LabelRule" TEXT NOT NULL,
  "LabelWindowDays" INT NOT NULL,
  "LabelGapDays" INT NOT NULL DEFAULT (
    0
  ),
  "TaskType" TEXT NOT NULL,
  "LabelVersion" INT NOT NULL,
  "Censoring" TEXT NOT NULL,
  "ChangeHistoryPolicy" TEXT NOT NULL,
  "GroupKey" VARCHAR(255) NULL,
  "TemporalSpec" TEXT NULL,
  "DecisionSpec" TEXT NOT NULL,
  "IncumbentHeuristic" TEXT NOT NULL,
  "AuthoredBy" TEXT NOT NULL,
  CONSTRAINT "PK_MLPredictionUnit" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_MLPredictionUnit_Lineage_Version" UNIQUE (
    "LineageRootID",
    "Version"
  ),
  CONSTRAINT "FK_MLPredictionUnit_LineageRoot" FOREIGN KEY ("LineageRootID") REFERENCES __mj."MLPredictionUnit" (
    "ID"
  ),
  CONSTRAINT "CK_MLPredictionUnit_Version" CHECK ("Version" >= 1),
  CONSTRAINT "CK_MLPredictionUnit_LineageRoot" CHECK ((
    "Version" = 1 AND "LineageRootID" = "ID"
  )
  OR (
    "Version" > 1 AND "LineageRootID" <> "ID"
  )),
  CONSTRAINT "CK_MLPredictionUnit_LabelVersion" CHECK ("LabelVersion" >= 1 AND "LabelVersion" <= "Version"),
  CONSTRAINT "CK_MLPredictionUnit_LabelWindowDays" CHECK ("LabelWindowDays" > 0),
  CONSTRAINT "CK_MLPredictionUnit_LabelGapDays" CHECK ("LabelGapDays" >= 0)
);

COMMENT ON TABLE __mj."MLPredictionUnit" IS 'A Prediction Unit: what one training row is (one grain record, or one grain record per period of a dated child entity), its decision date, the outcome rule and the window over which the outcome is observed, how unresolved rows are censored, and the declared task type. Every ML Training Pipeline references exactly one version. Versions are immutable rows: editing a unit inserts the next version with the same LineageRootID, so a trained model keeps pointing at the version it used.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."LineageRootID" IS 'ID of version 1 of this unit. Version 1 points at itself; every later version points at version 1.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."Version" IS 'Version number within the lineage, starting at 1. A saved version is never updated.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."Name" IS 'Display name of the unit, e.g. "Member renewal (person x membership period)".';

COMMENT ON COLUMN __mj."MLPredictionUnit"."Description" IS 'What the unit predicts and for whom, in plain words.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."UnitRows" IS 'JSON UnitRows: {kind:"grain", grainEntity, decisionDate, filter} or {kind:"grain-x-periods", grainEntity, childEntity, foreignKey, periodDate, filter}. Defines what one row is and its decision date.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."LabelRule" IS 'JSON LabelRule: how the outcome of a row is read — a column on the row, the next period of the same grain record, or an event in a dated child entity — always within the window that starts LabelGapDays after the decision date and lasts LabelWindowDays.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."LabelWindowDays" IS 'Length in days of the outcome window. A row whose window ends after the data cutoff is censored (excluded and counted).';

COMMENT ON COLUMN __mj."MLPredictionUnit"."LabelGapDays" IS 'Days between the decision date and the start of the outcome window.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."TaskType" IS 'JSON TaskType: binary {classOrder, adverseIndex}, multiclass {classOrder, adverseIndices}, continuous, count, non-negative {tweediePower}, or forecast {valueKind}. Which class a score refers to and the adverse direction are derived from it, never stored separately.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."LabelVersion" IS 'Outcome-definition version: equals the previous version''s LabelVersion when LabelRule, LabelWindowDays, LabelGapDays and TaskType are unchanged, and that plus one otherwise.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."Censoring" IS 'JSON CensoringRule: {rule:"exclude-unresolved", cutoff} where cutoff is {kind:"corpus-end", entity, field}, {kind:"now"} or {kind:"fixed", at}. Rows whose outcome window has not closed at the cutoff are excluded and counted.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."ChangeHistoryPolicy" IS 'JSON ChangeHistoryPolicy: {onUncoveredRow:"refuse"|"exclude-and-count", externalSourceRows:"as-of-detection-time"|"ineligible"} — what as-of assembly does when a decision date precedes the change history of a field updated in place.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."GroupKey" IS 'Field on the row whose value keeps one entity''s rows together in grouped folds and the new-entity report; NULL means the grain record key.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."TemporalSpec" IS 'JSON TemporalSpec for series and panels: timeColumn, horizonPeriods, lags, rollingWindows, period, seasonality. Every lag and rolling-window endLag is at least horizonPeriods. Required when TaskType is forecast. Versioned with the unit.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."DecisionSpec" IS 'JSON DecisionSpec: the action the prediction serves, the actor role, the capacity per period (for precision at capacity) and the period.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."IncumbentHeuristic" IS 'JSON IncumbentHeuristic: {kind:"none"} or {kind:"rule", name, scoreExpression} — today''s rule of thumb, scored as a named comparator on the same holdout.';

COMMENT ON COLUMN __mj."MLPredictionUnit"."AuthoredBy" IS 'JSON Actor who authored this version: {kind:"human", userId} (a user), or an automated author {kind:"agent", agentRunId}, {kind:"scheduled-job", scheduledJobRunId} or {kind:"system", component}.';

/* ============================================================================ */
/* 2. MLEvaluationProtocol */
/* ============================================================================ */
CREATE TABLE __mj."MLEvaluationProtocol" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "LineageRootID" UUID NOT NULL,
  "Version" INT NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Holdout" TEXT NOT NULL,
  "InnerValidation" TEXT NOT NULL,
  "Seed" INT NOT NULL,
  "HoldoutAccessBudget" INT NOT NULL DEFAULT (
    1
  ),
  "PrimaryScore" TEXT NOT NULL,
  "SecondaryMetrics" TEXT NOT NULL,
  "Baselines" TEXT NOT NULL,
  "Calibration" TEXT NOT NULL,
  "Resampling" TEXT NOT NULL,
  "Intervals" TEXT NOT NULL,
  "Promotion" TEXT NOT NULL,
  "AllowedOutcomes" TEXT NOT NULL,
  "LeakageAudit" TEXT NOT NULL,
  "Exclusions" TEXT NOT NULL,
  "Slices" TEXT NOT NULL,
  "PredictionIntervals" TEXT NULL,
  "ResidualDiagnostics" TEXT NULL,
  "RetrainTriggers" TEXT NOT NULL,
  "SearchStrategy" TEXT NOT NULL,
  "Budgets" TEXT NOT NULL,
  "MinMinorityClassRows" INT NOT NULL DEFAULT (
    20
  ),
  "GuardFieldsEditableBy" VARCHAR(20) NOT NULL DEFAULT (
    'non-agent'
  ),
  "AuthoredBy" TEXT NOT NULL,
  CONSTRAINT "PK_MLEvaluationProtocol" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_MLEvaluationProtocol_Lineage_Version" UNIQUE (
    "LineageRootID",
    "Version"
  ),
  CONSTRAINT "FK_MLEvaluationProtocol_LineageRoot" FOREIGN KEY ("LineageRootID") REFERENCES __mj."MLEvaluationProtocol" (
    "ID"
  ),
  CONSTRAINT "CK_MLEvaluationProtocol_Version" CHECK ("Version" >= 1),
  CONSTRAINT "CK_MLEvaluationProtocol_LineageRoot" CHECK ((
    "Version" = 1 AND "LineageRootID" = "ID"
  )
  OR (
    "Version" > 1 AND "LineageRootID" <> "ID"
  )),
  CONSTRAINT "CK_MLEvaluationProtocol_HoldoutAccessBudget" CHECK ("HoldoutAccessBudget" = 1),
  CONSTRAINT "CK_MLEvaluationProtocol_MinMinorityClassRows" CHECK ("MinMinorityClassRows" >= 1),
  CONSTRAINT "CK_MLEvaluationProtocol_GuardFieldsEditableBy" CHECK ("GuardFieldsEditableBy" IN ('non-agent', 'human-only'))
);

COMMENT ON TABLE __mj."MLEvaluationProtocol" IS 'An Evaluation Protocol: the grading rules of a pipeline, saved before any candidate trains — the locked holdout, inner validation, primary proper score, fixed baselines, calibration, intervals, promotion rule and the three allowed outcomes (model, keep-simple-baseline, no-signal), the leakage audit, slices and budgets. Every training run references the exact version it was graded under. Versions are immutable rows; editing inserts the next version. Replaces the ValidationStrategy and LeakageGuard JSON of ML Training Pipelines.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."LineageRootID" IS 'ID of version 1 of this protocol. Version 1 points at itself.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Version" IS 'Version number within the lineage, starting at 1. A saved version is never updated.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Name" IS 'Display name of the protocol.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Description" IS 'What the protocol is for, in plain words.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Holdout" IS 'JSON HoldoutSplit (guard field): {kind:"date-carved", dateColumn, cutoff, holdoutEnd, newEntityReport} or {kind:"rolling-origin", origins (>= 5), horizonPeriods, gapPeriods, minTrainPeriods, window}.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."InnerValidation" IS 'JSON InnerValidation over development rows only: repeated-stratified-kfold, grouped-kfold or blocked-time.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Seed" IS 'Random seed for every split, fold, bootstrap and estimator of a run under this protocol.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."HoldoutAccessBudget" IS 'How many times the locked holdout may be scored per run: always 1, for one declared finalist.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."PrimaryScore" IS 'JSON ProperScore {family, metric}: the only metric that ranks candidates and gates outcomes. Its family must equal the pipeline unit''s task kind.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."SecondaryMetrics" IS 'JSON array of secondary metric keys (auc, accuracy, f1, precision, recall, r2, calibration-slope); reported with intervals, never used to rank.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Baselines" IS 'JSON array of BaselineSpec fitted on every run: dummy, one-feature, glm, naive, seasonal-naive, incumbent-heuristic.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Calibration" IS 'JSON CalibrationMethod: platt, isotonic or auto, always fit on a disjoint calibration fold; not-applicable for regression.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Resampling" IS 'JSON ResamplingSpec: {kind:"none"} or {kind:"in-fold", method}; resampling never touches holdout rows.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Intervals" IS 'JSON IntervalSpec: level 0.95, method, resamples and the paired test for model-versus-comparator differences.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Promotion" IS 'JSON PromotionRule (guard field): comparators, incumbent, margin (>= 0), lowerBoundLevel 0.95, pairedOn same-holdout-rows, decisionTable Q13+Q14+Q15.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."AllowedOutcomes" IS 'JSON array, exactly ["model","keep-simple-baseline","no-signal"]: a protocol cannot omit no-signal.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."LeakageAudit" IS 'JSON LeakageAuditSpec (guard field): held-out single-feature AUC ceiling, time-shifted-label test, drop-column test, per-source-column importance aggregation, high-cardinality ID check.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Exclusions" IS 'JSON ProtocolExclusions (guard field): {denyFields, denySources} — columns and sources that never enter the feature matrix (the former LeakageGuard deny lists).';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Slices" IS 'JSON SliceSpec: {outOfTime, subgroups} — each slice is reported with the primary score and its interval.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."PredictionIntervals" IS 'JSON PredictionIntervalSpec {method, nominalCoverage} for continuous, count and non-negative tasks; NULL when not requested.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."ResidualDiagnostics" IS 'JSON ResidualDiagnosticsSpec {acfLags, ljungBoxAlpha} for series and panels; NULL otherwise.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."RetrainTriggers" IS 'JSON array of RetrainTrigger declared for monitoring (outcome-degradation, calibration-drift).';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."SearchStrategy" IS 'JSON SearchStrategy: {kind:"random", candidates} or {kind:"guided", method, equalCostComparisonId}.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."Budgets" IS 'JSON Budgets (guard field): maxComputeSeconds, maxTokens, maxCandidates, hardStop true.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."MinMinorityClassRows" IS 'Smallest minority-class row count in the locked holdout for which a classification gate may return model; below it the gate cannot ship a model.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."GuardFieldsEditableBy" IS 'Who may change the guard fields (Holdout, Promotion, LeakageAudit, Exclusions, Budgets and this setting) in the next version: non-agent (default: any author except an agent tool call — a user, a non-agent API caller, a scheduled job or the system) or human-only (optional: only a version authored by a user). Every author''s version passes the same guard-field validation.';

COMMENT ON COLUMN __mj."MLEvaluationProtocol"."AuthoredBy" IS 'JSON Actor who authored this version.';

ALTER TABLE __mj."MLTrainingPipeline"
  ADD COLUMN "PredictionUnitID" UUID NULL,
  ADD COLUMN "EvaluationProtocolID" UUID NULL
 /* ============================================================================ */ /* 3. MLTrainingPipeline + unit and protocol references (before MLTrainingSnapshot, which references pipelines) */ /* ============================================================================ */;

ALTER TABLE __mj."MLTrainingPipeline"
  ADD CONSTRAINT "FK_MLTrainingPipeline_MLPredictionUnit" FOREIGN KEY ("PredictionUnitID") REFERENCES __mj."MLPredictionUnit" (
    "ID"
  ),
  ADD CONSTRAINT "FK_MLTrainingPipeline_MLEvaluationProtocol" FOREIGN KEY ("EvaluationProtocolID") REFERENCES __mj."MLEvaluationProtocol" (
    "ID"
  );

COMMENT ON COLUMN __mj."MLTrainingPipeline"."PredictionUnitID" IS 'The exact Prediction Unit version this pipeline trains on. NULL only on a pipeline created before Predictive Studio 6.3 that has not been migrated; such a pipeline cannot be trained.';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."EvaluationProtocolID" IS 'The exact Evaluation Protocol version every training run of this pipeline is graded under. Its primary score family must equal the unit''s task kind.';

/* ============================================================================ */
/* 4. MLTrainingSnapshot */
/* ============================================================================ */
CREATE TABLE __mj."MLTrainingSnapshot" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ContentHash" VARCHAR(64) NOT NULL,
  "PipelineID" UUID NOT NULL,
  "PredictionUnitID" UUID NOT NULL,
  "LabelVersion" INT NOT NULL,
  "FeatureSpecVersion" INT NOT NULL,
  "EvaluationProtocolID" UUID NULL,
  "StorageProviderID" UUID NOT NULL,
  "MatrixFileID" UUID NOT NULL,
  "MatrixSha256" VARCHAR(64) NOT NULL,
  "MatrixSizeBytes" BIGINT NOT NULL,
  "RowManifestFileID" UUID NOT NULL,
  "RowManifestSha256" VARCHAR(64) NOT NULL,
  "RowManifestSizeBytes" BIGINT NOT NULL,
  "ProvenanceFileID" UUID NOT NULL,
  "ProvenanceSha256" VARCHAR(64) NOT NULL,
  "ProvenanceSizeBytes" BIGINT NOT NULL,
  "ManifestRowCount" INT NOT NULL,
  "HoldoutRowCount" INT NOT NULL,
  "FeatureSpec" TEXT NOT NULL,
  "FeatureSchema" TEXT NOT NULL,
  "FeatureSchemaHash" VARCHAR(64) NOT NULL,
  "ColumnProvenance" TEXT NOT NULL,
  "PinnedFeatureVersions" TEXT NOT NULL DEFAULT (
    '[]'
  ),
  "RowsRead" INT NOT NULL,
  "ReadComplete" BOOLEAN NOT NULL DEFAULT TRUE,
  "CensoredRowsExcluded" INT NOT NULL,
  "LabelKnownRowsExcluded" INT NOT NULL,
  "EmptyLabelRowsExcluded" INT NOT NULL,
  "UncoveredHistoryRowsExcluded" TEXT NOT NULL DEFAULT (
    '[]'
  ),
  "DuplicateRowsRemoved" INT NOT NULL DEFAULT (
    0
  ),
  "ClassBalance" TEXT NULL,
  "DataCutoff" TIMESTAMPTZ NOT NULL,
  "AssemblyCodeVersion" VARCHAR(200) NOT NULL,
  CONSTRAINT "PK_MLTrainingSnapshot" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_MLTrainingSnapshot_ContentHash" UNIQUE (
    "ContentHash"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_Pipeline" FOREIGN KEY ("PipelineID") REFERENCES __mj."MLTrainingPipeline" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_MLPredictionUnit" FOREIGN KEY ("PredictionUnitID") REFERENCES __mj."MLPredictionUnit" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_MLEvaluationProtocol" FOREIGN KEY ("EvaluationProtocolID") REFERENCES __mj."MLEvaluationProtocol" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_StorageProvider" FOREIGN KEY ("StorageProviderID") REFERENCES __mj."FileStorageProvider" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_MatrixFile" FOREIGN KEY ("MatrixFileID") REFERENCES __mj."File" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_RowManifestFile" FOREIGN KEY ("RowManifestFileID") REFERENCES __mj."File" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingSnapshot_ProvenanceFile" FOREIGN KEY ("ProvenanceFileID") REFERENCES __mj."File" (
    "ID"
  ),
  CONSTRAINT "CK_MLTrainingSnapshot_ReadComplete" CHECK ("ReadComplete" = TRUE),
  CONSTRAINT "CK_MLTrainingSnapshot_HashLengths" CHECK (LENGTH(CAST("ContentHash" AS TEXT)) = 64
  AND LENGTH(CAST("MatrixSha256" AS TEXT)) = 64
  AND LENGTH(CAST("RowManifestSha256" AS TEXT)) = 64
  AND LENGTH(CAST("ProvenanceSha256" AS TEXT)) = 64
  AND LENGTH(CAST("FeatureSchemaHash" AS TEXT)) = 64),
  CONSTRAINT "CK_MLTrainingSnapshot_Counts" CHECK ("ManifestRowCount" >= 0
  AND "HoldoutRowCount" >= 0
  AND "HoldoutRowCount" <= "ManifestRowCount"
  AND "RowsRead" >= "ManifestRowCount"
  AND "CensoredRowsExcluded" >= 0
  AND "LabelKnownRowsExcluded" >= 0
  AND "EmptyLabelRowsExcluded" >= 0
  AND "DuplicateRowsRemoved" >= 0),
  CONSTRAINT "CK_MLTrainingSnapshot_Versions" CHECK ("LabelVersion" >= 1 AND "FeatureSpecVersion" >= 1)
);

COMMENT ON TABLE __mj."MLTrainingSnapshot" IS 'A Training Snapshot: the frozen data one training run learned from — the feature matrix, the row manifest (row id, entity key, decision date, group key, period, role) and per-value provenance as three write-once files, plus the content hash that fingerprints them together with the unit, label, feature-spec and protocol versions. Immutable; identical assemblies share one snapshot (unique ContentHash). Retraining from a snapshot reproduces the run.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ContentHash" IS 'SHA-256 (lower-case hex) of the canonical JSON of the three file hashes, the feature schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID and DataCutoff.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."PipelineID" IS 'The ML Training Pipeline whose feature spec was assembled.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."PredictionUnitID" IS 'The exact Prediction Unit version whose rows were read.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."LabelVersion" IS 'The unit''s LabelVersion at assembly.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."FeatureSpecVersion" IS 'The pipeline Version whose FeatureSteps produced the feature spec.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."EvaluationProtocolID" IS 'The Evaluation Protocol version whose holdout rule assigned the manifest roles; NULL only for a legacy pipeline trained before its protocol was migrated.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."StorageProviderID" IS 'The File Storage Provider holding the three files.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."MatrixFileID" IS 'MJ: Files row of matrix.jsonl (header line with column names, then one JSON array per manifest row).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."MatrixSha256" IS 'SHA-256 of the matrix file bytes.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."MatrixSizeBytes" IS 'Size of the matrix file in bytes.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."RowManifestFileID" IS 'MJ: Files row of manifest.jsonl (one SnapshotRowKey per row; the locked-holdout rows are the stored holdout keys).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."RowManifestSha256" IS 'SHA-256 of the manifest file bytes.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."RowManifestSizeBytes" IS 'Size of the manifest file in bytes.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ProvenanceFileID" IS 'MJ: Files row of provenance.jsonl (for every row and column: source kind, source reference, source version, computed-at).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ProvenanceSha256" IS 'SHA-256 of the provenance file bytes.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ProvenanceSizeBytes" IS 'Size of the provenance file in bytes.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ManifestRowCount" IS 'Rows in the manifest (development plus locked holdout).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."HoldoutRowCount" IS 'Manifest rows with role locked-holdout.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."FeatureSpec" IS 'JSON array of the resolved FeatureColumnSpec (name, dated source, encoding, missing-value policy) assembled.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."FeatureSchema" IS 'JSON array of matrix columns {name, encoding, sourceColumn} in matrix order.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."FeatureSchemaHash" IS 'SHA-256 of the canonical JSON of FeatureSchema; compared before scoring.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ColumnProvenance" IS 'JSON array of ColumnProvenance: per matrix column, the source kind, source reference and source version.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."PinnedFeatureVersions" IS 'JSON array of FeatureVersionPin for every Feature Value source read.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."RowsRead" IS 'Unit rows read from the source before exclusions; equals the source count (a truncated read is refused).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ReadComplete" IS 'Always 1: a snapshot exists only for a complete read.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."CensoredRowsExcluded" IS 'Rows excluded because their outcome window had not closed at DataCutoff.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."LabelKnownRowsExcluded" IS 'Rows excluded because their outcome was already recorded on or before the decision date (next-period rule).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."EmptyLabelRowsExcluded" IS 'Rows excluded because their label was empty (NULL or an empty string) — unlabelled, never a class.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."UncoveredHistoryRowsExcluded" IS 'JSON array {entity, field, rows}: rows excluded because a field''s change history did not cover their decision date (policy exclude-and-count).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."DuplicateRowsRemoved" IS 'Rows removed as exact duplicates of (entity key, decision date, period).';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."ClassBalance" IS 'JSON array {label, rows} over manifest rows for classification tasks; NULL otherwise.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."DataCutoff" IS 'The censoring cutoff the unit resolved to for this assembly.';

COMMENT ON COLUMN __mj."MLTrainingSnapshot"."AssemblyCodeVersion" IS 'Package version and git commit of the assembly code that built the snapshot.';

ALTER TABLE __mj."MLTrainingRun"
  ADD COLUMN "TrainingSnapshotID" UUID NULL,
  ADD COLUMN "EvaluationProtocolID" UUID NULL,
  ADD COLUMN "CodeVersion" TEXT NULL,
  ADD COLUMN "ComputeSeconds" DECIMAL(18, 3) NULL
 /* ============================================================================ */ /* 5. MLTrainingRun + snapshot, protocol, code version, compute seconds */ /* ============================================================================ */;

ALTER TABLE __mj."MLTrainingRun"
  ADD CONSTRAINT "FK_MLTrainingRun_MLTrainingSnapshot" FOREIGN KEY ("TrainingSnapshotID") REFERENCES __mj."MLTrainingSnapshot" (
    "ID"
  ),
  ADD CONSTRAINT "FK_MLTrainingRun_MLEvaluationProtocol" FOREIGN KEY ("EvaluationProtocolID") REFERENCES __mj."MLEvaluationProtocol" (
    "ID"
  ),
  ADD CONSTRAINT "CK_MLTrainingRun_ComputeSeconds" CHECK ("ComputeSeconds" >= 0);
/* NULL passes a CHECK on its own (UNKNOWN), so no IS NULL branch (migrations/CLAUDE.md) */;

COMMENT ON COLUMN __mj."MLTrainingRun"."TrainingSnapshotID" IS 'The Training Snapshot this run trained on; NULL for a run refused before assembly and for runs before Predictive Studio 6.3.';

COMMENT ON COLUMN __mj."MLTrainingRun"."EvaluationProtocolID" IS 'The Evaluation Protocol version the run was graded under, pinned when the run started.';

COMMENT ON COLUMN __mj."MLTrainingRun"."CodeVersion" IS 'JSON CodeVersion: PS git commit, sidecar version, library versions, thread count and seed the run used.';

COMMENT ON COLUMN __mj."MLTrainingRun"."ComputeSeconds" IS 'Measured trainer compute time in seconds, as returned by the sidecar.';

ALTER TABLE __mj."FeatureValue"
  ADD COLUMN "EffectiveAsOf" TIMESTAMPTZ NULL,
  ADD COLUMN "InputAsOf" TIMESTAMPTZ NULL
 /* ============================================================================ */ /* 6. FeatureValue + effective dating and input as-of */ /* ============================================================================ */;

ALTER TABLE __mj."FeatureValue"
  ADD CONSTRAINT "CK_FeatureValue_InputAsOf" CHECK ("InputAsOf" <= "EffectiveAsOf");
/* either side NULL evaluates UNKNOWN and passes */;

CREATE INDEX "IX_FeatureValue_Entity_Feature_EffectiveAsOf" ON __mj."FeatureValue"("EntityID", "FeatureName", "EffectiveAsOf") INCLUDE ("RecordID", "RecordProcessID");

COMMENT ON COLUMN __mj."FeatureValue"."EffectiveAsOf" IS 'Instant from which this value is the record''s value of the feature; as-of assembly reads the latest value with EffectiveAsOf at or before a row''s decision date. On a Source = Model row it is the scoring as-of date. NULL = not effective-dated (ineligible for as-of assembly).';

COMMENT ON COLUMN __mj."FeatureValue"."InputAsOf" IS 'Instant of the input data the value was computed from (its provenance); never after EffectiveAsOf.';

/* ============================================================================ */
/* 7. spDeleteEntityWithCoreDependencies: training snapshots */
/* ============================================================================ */
/* MLTrainingSnapshot (section 4) has a NOT NULL PipelineID into MLTrainingPipeline, a table this */
/* proc deletes from when an entity is removed, so removing an entity whose pipeline has a */
/* snapshot would fail on that FK. The proc deletes those snapshots after the pipelines' runs */
/* and models and before the pipelines: */
/*    - MLTrainingSnapshot.PipelineID -> MLTrainingPipeline (delete) */
/*    - MLTrainingRun.TrainingSnapshotID -> MLTrainingSnapshot (null; the pipelines' own runs are */
/*      already deleted, so only a run of another pipeline that names the snapshot is cleared) */
/* The policy in packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json records */
/* both. The rest of the proc is V202611030816's definition, unchanged. */

-- ╔══ HAND-FINISHED FOR POSTGRESQL: spDeleteEntityWithCoreDependencies ══╗
-- The SQL Server CREATE OR ALTER PROC is not translated by the AST dialect (needs-hand). This is
-- the committed PostgreSQL port from V202611030816__v6.2.x__spDeleteEntityWithCoreDependencies_Graph_Edges.pg.sql
-- (same signature, handled-reference list and precondition) plus this migration's one change,
-- placed where the SQL Server proc places it (after the pipelines' runs and models, before the
-- pipelines):
--   UPDATE MLTrainingRun SET TrainingSnapshotID = NULL for runs naming the pipelines' snapshots;
--   DELETE FROM MLTrainingSnapshot WHERE PipelineID IN the pipelines.
-- The CodeGen section below was baked natively from a copy of the SQL Server source with only this
-- proc removed; nothing else in the file is hand-written.
-- ╚══════════════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityWithCoreDependencies"(p_EntityID uuid)
RETURNS SETOF record
LANGUAGE plpgsql
AS $spdel$
DECLARE
    -- The policy's delete and null references (packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json).
    v_handled  text[] := ARRAY[
        'AccessControlRule.EntityID',
        'ActionExecutionLog.TargetEntityID',
        'AIAgentExample.PrimaryScopeEntityID',
        'AIAgentNote.PrimaryScopeEntityID',
        'AIAgentRun.PrimaryScopeEntityID',
        'AIAgentSession.LinkedEntityID',
        'ApplicationEntity.EntityID',
        'ArchiveConfigurationEntity.EntityID',
        'ArchiveRunDetail.EntityID',
        'AuditLog.EntityID',
        'CalendarEventLink.EntityID',
        'ClusterAnalysis.EntityID',
        'CompanyIntegrationEntityMap.EntityID',
        'CompanyIntegrationRecordMap.EntityID',
        'CompanyIntegrationRunDetail.EntityID',
        'ContentSource.EntityID',
        'Conversation.LinkedEntityID',
        'DataContextItem.EntityID',
        'DatasetItem.EntityID',
        'DuplicateRun.EntityID',
        'EntityAction.EntityID',
        'EntityAction.ScopeEntityID',
        'EntityAIAction.EntityID',
        'EntityAIAction.OutputEntityID',
        'EntityAlternateBaseView.EntityID',
        'EntityCommunicationMessageType.EntityID',
        'EntityDocument.EntityID',
        'EntityField.EntityID',
        'EntityField.RelatedEntityID',
        'EntityFormContribution.EntityID',
        'EntityFormContribution.RelatedEntityID',
        'EntityFormOverride.EntityID',
        'EntityOrganicKey.EntityID',
        'EntityOrganicKeyRelatedEntity.RelatedEntityID',
        'EntityPermission.EntityID',
        'EntityRecordDocument.EntityID',
        'EntityRelationship.EntityID',
        'EntityRelationship.RelatedEntityID',
        'EntitySetting.EntityID',
        'FeatureValue.EntityID',
        'FileEntityRecordLink.EntityID',
        'FormChromeRule.EntityID',
        'FormChromeRule.RelatedEntityID',
        'GraphEdge.SourceEntityID',
        'GraphEdge.TargetEntityID',
        'GraphEdgeTypeEndpoint.EntityID',
        'GeneratedCode.LinkedEntityID',
        'IdentityClaim.EntityID',
        'IntegrationURLFormat.EntityID',
        'InteractionLink.EntityID',
        'List.EntityID',
        'MaterializedResult.GeneratedEntityID',
        'MaterializedResult.SourceEntityID',
        'MLModelScoringBinding.TargetEntityID',
        'MLTrainingPipeline.TargetEntityID',
        'ProcessRunDetail.EntityID',
        'ProcessRun.EntityID',
        'QueryEntity.EntityID',
        'QueryField.SourceEntityID',
        'RecommendationItem.DestinationEntityID',
        'Recommendation.SourceEntityID',
        'RecordChange.EntityID',
        'RecordCloneLogItem.EntityID',
        'RecordCloneLog.RootEntityID',
        'RecordGeoCode.EntityID',
        'RecordLink.SourceEntityID',
        'RecordLink.TargetEntityID',
        'RecordMergeLog.EntityID',
        'RecordProcess.EntityID',
        'RecordProcessWatermark.EntityID',
        'ResourceType.CategoryEntityID',
        'ResourceType.EntityID',
        'RubricEvaluation.ContextEntityID',
        'RubricEvaluation.SubjectEntityID',
        'ScopedNotificationConfig.PrimaryScopeEntityID',
        'ScopedPromptConfig.PrimaryScopeEntityID',
        'ScopedPromptPart.PrimaryScopeEntityID',
        'SearchScopeEntity.EntityID',
        'SignatureRequest.EntityID',
        'SystemEvent.EntityID',
        'TaggedItem.EntityID',
        'TagScope.ScopeEntityID',
        'TemplateParam.EntityID',
        'TestRun.TargetLogEntityID',
        'UserApplicationEntity.EntityID',
        'UserFavorite.EntityID',
        'User.LinkedEntityID',
        'UserRecordLog.EntityID',
        'UserViewCategory.EntityID',
        'UserView.EntityID',
        'VersionLabel.EntityID',
        'VersionLabelItem.EntityID'
    ];
    v_ref      record;
    v_found    boolean;
    v_blockers text[] := ARRAY[]::text[];
    -- Rows this function deletes that other rows can reference, captured before any delete.
    v_EntityFieldIDs uuid[];
    v_UserViewIDs uuid[];
    v_UserViewCategoryIDs uuid[];
    v_UserViewRunIDs uuid[];
    v_ListIDs uuid[];
    v_EntityDocumentIDs uuid[];
    v_EntityRecordDocumentIDs uuid[];
    v_DuplicateRunIDs uuid[];
    v_DuplicateRunDetailIDs uuid[];
    v_EntityActionIDs uuid[];
    v_AlternateBaseViewIDs uuid[];
    v_MessageTypeIDs uuid[];
    v_OrganicKeyIDs uuid[];
    v_IntegrationEntityMapIDs uuid[];
    v_IntegrationRunDetailIDs uuid[];
    v_PipelineIDs uuid[];
    v_MLModelIDs uuid[];
    v_ProcessRunDetailIDs uuid[];
    v_RecommendationIDs uuid[];
    v_RecordCloneLogIDs uuid[];
    v_RecordMergeLogIDs uuid[];
    v_RecordProcessIDs uuid[];
    v_RubricEvaluationIDs uuid[];
    v_ResourceTypeIDs uuid[];
    v_AgentNoteIDs uuid[];
BEGIN
    -- ── Precondition: refuse to start if something not covered by the policy points at this entity ──
    -- Only NO ACTION / RESTRICT foreign keys can block the final DELETE (confdeltype 'a' / 'r');
    -- CASCADE, SET NULL and SET DEFAULT are cleared by PostgreSQL itself.
    FOR v_ref IN
        SELECT DISTINCT n.nspname AS sch, t.relname AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_class t     ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.confrelid = '__mj."Entity"'::regclass
          AND c.confdeltype IN ('a', 'r')
          AND NOT (n.nspname = '__mj' AND (t.relname || '.' || a.attname) = ANY (v_handled))
        ORDER BY 1, 2, 3
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)', v_ref.sch, v_ref.tbl, v_ref.col)
            INTO v_found USING p_EntityID;
        IF v_found THEN
            v_blockers := v_blockers || (v_ref.sch || '.' || v_ref.tbl || '.' || v_ref.col);
        END IF;
    END LOOP;

    IF cardinality(v_blockers) > 0 THEN
        RAISE EXCEPTION 'Cannot delete entity %: rows still reference it through foreign keys this procedure does not clear (%). Clear them first. Nothing has been deleted.',
            p_EntityID, left(array_to_string(v_blockers, ', '), 1600);
    END IF;

    -- ── Rows this function deletes that other rows can reference: capture their IDs up front ──
    v_EntityFieldIDs := ARRAY(SELECT "ID" FROM __mj."EntityField" WHERE "EntityID" = p_EntityID);

    v_UserViewIDs := ARRAY(SELECT "ID" FROM __mj."UserView" WHERE "EntityID" = p_EntityID);

    v_UserViewCategoryIDs := ARRAY(SELECT "ID" FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID);

    v_UserViewRunIDs := ARRAY(SELECT "ID" FROM __mj."UserViewRun" WHERE "UserViewID" = ANY (v_UserViewIDs));

    v_ListIDs := ARRAY(SELECT "ID" FROM __mj."List" WHERE "EntityID" = p_EntityID);

    v_EntityDocumentIDs := ARRAY(SELECT "ID" FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID);

    v_EntityRecordDocumentIDs := ARRAY(SELECT "ID" FROM __mj."EntityRecordDocument"
        WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs));

    v_DuplicateRunIDs := ARRAY(SELECT "ID" FROM __mj."DuplicateRun"
        WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs));

    v_DuplicateRunDetailIDs := ARRAY(SELECT "ID" FROM __mj."DuplicateRunDetail"
        WHERE "DuplicateRunID" = ANY (v_DuplicateRunIDs));

    v_EntityActionIDs := ARRAY(SELECT "ID" FROM __mj."EntityAction"
        WHERE "EntityID" = p_EntityID OR "ScopeEntityID" = p_EntityID);

    v_AlternateBaseViewIDs := ARRAY(SELECT "ID" FROM __mj."EntityAlternateBaseView" WHERE "EntityID" = p_EntityID);

    v_MessageTypeIDs := ARRAY(SELECT "ID" FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID);

    v_OrganicKeyIDs := ARRAY(SELECT "ID" FROM __mj."EntityOrganicKey" WHERE "EntityID" = p_EntityID);

    v_IntegrationEntityMapIDs := ARRAY(SELECT "ID" FROM __mj."CompanyIntegrationEntityMap" WHERE "EntityID" = p_EntityID);

    v_IntegrationRunDetailIDs := ARRAY(SELECT "ID" FROM __mj."CompanyIntegrationRunDetail" WHERE "EntityID" = p_EntityID);

    v_PipelineIDs := ARRAY(SELECT "ID" FROM __mj."MLTrainingPipeline" WHERE "TargetEntityID" = p_EntityID);

    v_MLModelIDs := ARRAY(SELECT "ID" FROM __mj."MLModel" WHERE "PipelineID" = ANY (v_PipelineIDs));

    v_ProcessRunDetailIDs := ARRAY(SELECT "ID" FROM __mj."ProcessRunDetail" WHERE "EntityID" = p_EntityID);

    v_RecommendationIDs := ARRAY(SELECT "ID" FROM __mj."Recommendation" WHERE "SourceEntityID" = p_EntityID);

    v_RecordCloneLogIDs := ARRAY(SELECT "ID" FROM __mj."RecordCloneLog" WHERE "RootEntityID" = p_EntityID);

    v_RecordMergeLogIDs := ARRAY(SELECT "ID" FROM __mj."RecordMergeLog" WHERE "EntityID" = p_EntityID);

    v_RecordProcessIDs := ARRAY(SELECT "ID" FROM __mj."RecordProcess" WHERE "EntityID" = p_EntityID);

    v_RubricEvaluationIDs := ARRAY(SELECT "ID" FROM __mj."RubricEvaluation" WHERE "SubjectEntityID" = p_EntityID);

    v_ResourceTypeIDs := ARRAY(SELECT "ID" FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID);

    v_AgentNoteIDs := ARRAY(SELECT "ID" FROM __mj."AIAgentNote" WHERE "PrimaryScopeEntityID" = p_EntityID);

    -- RecordChange can be large, so its doomed set stays a subquery instead of a table variable.

    -- ── Nullable references to this entity: cleared, the rows survive ──
    UPDATE __mj."ActionExecutionLog" SET "TargetEntityID" = NULL WHERE "TargetEntityID" = p_EntityID;
    UPDATE __mj."AIAgentRun" SET "PrimaryScopeEntityID" = NULL WHERE "PrimaryScopeEntityID" = p_EntityID;
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding: both columns or neither
    UPDATE __mj."AIAgentSession" SET "LinkedEntityID" = NULL, "LinkedRecordID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."AuditLog" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."ClusterAnalysis" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."ContentSource" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    -- CK_Conversation_LinkBinding / CK_Conversation_AnchorLinkBinding: clear LinkedRecordID and anchor columns with LinkedEntityID
    UPDATE __mj."Conversation" SET "LinkedEntityID" = NULL, "LinkedRecordID" = NULL, "AnchorType" = NULL, "AnchorKey" = NULL, "AnchorMetadata" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."DataContextItem" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    -- Other entities' fields that point AT this entity (#3561)
    UPDATE __mj."EntityField" SET "RelatedEntityID" = NULL WHERE "RelatedEntityID" = p_EntityID;
    UPDATE __mj."GeneratedCode" SET "LinkedEntityID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."IdentityClaim" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."MaterializedResult" SET "GeneratedEntityID" = NULL WHERE "GeneratedEntityID" = p_EntityID;
    UPDATE __mj."MaterializedResult" SET "SourceEntityID" = NULL WHERE "SourceEntityID" = p_EntityID;
    UPDATE __mj."MLModelScoringBinding" SET "TargetEntityID" = NULL WHERE "TargetEntityID" = p_EntityID;
    UPDATE __mj."ProcessRun" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."QueryField" SET "SourceEntityID" = NULL WHERE "SourceEntityID" = p_EntityID;
    -- ResourceType references Entity twice; EntityID is a delete (below), CategoryEntityID is cleared (#4483)
    UPDATE __mj."ResourceType" SET "CategoryEntityID" = NULL WHERE "CategoryEntityID" = p_EntityID;
    -- CK_RubricEvaluation_ContextPair: both columns or neither
    UPDATE __mj."RubricEvaluation" SET "ContextEntityID" = NULL, "ContextRecordID" = NULL WHERE "ContextEntityID" = p_EntityID;
    UPDATE __mj."SignatureRequest" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    -- SystemEvent has a physical FK but no entity, so generated metadata does not list it
    UPDATE __mj."SystemEvent" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."TemplateParam" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;
    UPDATE __mj."TestRun" SET "TargetLogEntityID" = NULL WHERE "TargetLogEntityID" = p_EntityID;
    UPDATE __mj."User" SET "LinkedEntityID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."VersionLabel" SET "EntityID" = NULL WHERE "EntityID" = p_EntityID;

    -- ── Nullable references to rows deleted below: cleared first ──
    UPDATE __mj."AIAgentNote" SET "ConsolidatedIntoNoteID" = NULL WHERE "ConsolidatedIntoNoteID" = ANY (v_AgentNoteIDs);
    UPDATE __mj."ErrorLog" SET "CompanyIntegrationRunDetailID" = NULL WHERE "CompanyIntegrationRunDetailID" = ANY (v_IntegrationRunDetailIDs);
    UPDATE __mj."ActionExecutionLog" SET "EntityActionID" = NULL WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    UPDATE __mj."EntityAlternateBaseView" SET "ParentID" = NULL WHERE "ParentID" = ANY (v_AlternateBaseViewIDs);
    UPDATE __mj."QueryEntity" SET "AlternateBaseViewID" = NULL WHERE "AlternateBaseViewID" = ANY (v_AlternateBaseViewIDs);
    UPDATE __mj."ContentSource" SET "EntityDocumentID" = NULL WHERE "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    UPDATE __mj."ContentItem" SET "EntityRecordDocumentID" = NULL WHERE "EntityRecordDocumentID" = ANY (v_EntityRecordDocumentIDs);
    UPDATE __mj."DuplicateRun" SET "SourceListID" = NULL WHERE "SourceListID" = ANY (v_ListIDs);
    UPDATE __mj."RecordProcess" SET "ScopeListID" = NULL WHERE "ScopeListID" = ANY (v_ListIDs);
    UPDATE __mj."MLTrainingRun" SET "ResultingModelID" = NULL WHERE "ResultingModelID" = ANY (v_MLModelIDs);
    UPDATE __mj."FeatureValue" SET "ProcessRunDetailID" = NULL WHERE "ProcessRunDetailID" = ANY (v_ProcessRunDetailIDs);
    UPDATE __mj."RecordChange" SET "RestoredFromID" = NULL
        WHERE "RestoredFromID" IN (SELECT "ID" FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID);
    UPDATE __mj."DuplicateRunDetailMatch" SET "RecordMergeLogID" = NULL WHERE "RecordMergeLogID" = ANY (v_RecordMergeLogIDs);
    UPDATE __mj."FeatureValueCache" SET "RecordProcessID" = NULL WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    UPDATE __mj."MLModelScoringBinding" SET "RecordProcessID" = NULL WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    UPDATE __mj."ProcessRun" SET "RecordProcessID" = NULL WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    UPDATE __mj."MagicLinkInvite" SET "ResourceTypeID" = NULL WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    UPDATE __mj."UserNotification" SET "ResourceTypeID" = NULL WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    UPDATE __mj."RubricEvaluation" SET "SupersedesEvaluationID" = NULL WHERE "SupersedesEvaluationID" = ANY (v_RubricEvaluationIDs);
    UPDATE __mj."UserView" SET "CategoryID" = NULL WHERE "CategoryID" = ANY (v_UserViewCategoryIDs);
    UPDATE __mj."UserViewCategory" SET "ParentID" = NULL WHERE "ParentID" = ANY (v_UserViewCategoryIDs);
    UPDATE __mj."DataContextItem" SET "ViewID" = NULL WHERE "ViewID" = ANY (v_UserViewIDs);
    UPDATE __mj."EntityRelationship" SET "DisplayUserViewID" = NULL WHERE "DisplayUserViewID" = ANY (v_UserViewIDs);
    UPDATE __mj."List" SET "SourceViewID" = NULL WHERE "SourceViewID" = ANY (v_UserViewIDs);
    UPDATE __mj."RecordProcess" SET "ScopeViewID" = NULL WHERE "ScopeViewID" = ANY (v_UserViewIDs);

    -- ── Deletes, children before parents ──

    -- Entity fields: values and permissions first; the EntityField rows go last, just before Entity
    DELETE FROM __mj."EntityFieldValue" WHERE "EntityFieldID" = ANY (v_EntityFieldIDs);
    DELETE FROM __mj."EntityFieldPermission" WHERE "EntityFieldID" = ANY (v_EntityFieldIDs);
    UPDATE __mj."QueryField" SET "SourceEntityFieldID" = NULL WHERE "SourceEntityFieldID" = ANY (v_EntityFieldIDs);

    -- Saved-view run history
    DELETE FROM __mj."UserViewRunDetail" WHERE "UserViewRunID" = ANY (v_UserViewRunIDs);
    DELETE FROM __mj."UserViewRun" WHERE "UserViewID" = ANY (v_UserViewIDs);

    -- Lists
    DELETE FROM __mj."ListDetail" WHERE "ListID" = ANY (v_ListIDs);
    DELETE FROM __mj."ListInvitation" WHERE "ListID" = ANY (v_ListIDs);
    DELETE FROM __mj."ListShare" WHERE "ListID" = ANY (v_ListIDs);
    DELETE FROM __mj."List" WHERE "EntityID" = p_EntityID;

    -- Duplicate detection (a run is tied to the entity directly or through its entity document)
    DELETE FROM __mj."DuplicateRunDetailMatch" WHERE "DuplicateRunDetailID" = ANY (v_DuplicateRunDetailIDs);
    DELETE FROM __mj."DuplicateRunDetail" WHERE "DuplicateRunID" = ANY (v_DuplicateRunIDs);
    DELETE FROM __mj."DuplicateRun" WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs);

    -- Entity documents
    DELETE FROM __mj."EntityDocumentRun" WHERE "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    DELETE FROM __mj."EntityDocumentSetting" WHERE "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    DELETE FROM __mj."EntityRecordDocument" WHERE "EntityID" = p_EntityID OR "EntityDocumentID" = ANY (v_EntityDocumentIDs);
    DELETE FROM __mj."EntityDocument" WHERE "EntityID" = p_EntityID;

    -- Entity actions (on this entity, or scoped to one of its records)
    DELETE FROM __mj."EntityActionFilter" WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    DELETE FROM __mj."EntityActionInvocation" WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    DELETE FROM __mj."EntityActionParam" WHERE "EntityActionID" = ANY (v_EntityActionIDs);
    DELETE FROM __mj."EntityAction" WHERE "EntityID" = p_EntityID OR "ScopeEntityID" = p_EntityID;

    -- Communication message types
    DELETE FROM __mj."EntityCommunicationField" WHERE "EntityCommunicationMessageTypeID" = ANY (v_MessageTypeIDs);
    DELETE FROM __mj."EntityCommunicationMessageType" WHERE "EntityID" = p_EntityID;

    -- Organic keys
    DELETE FROM __mj."EntityOrganicKeyRelatedEntity" WHERE "RelatedEntityID" = p_EntityID OR "EntityOrganicKeyID" = ANY (v_OrganicKeyIDs);
    DELETE FROM __mj."EntityOrganicKey" WHERE "EntityID" = p_EntityID;

    -- Company integrations
    DELETE FROM __mj."CompanyIntegrationFieldMap" WHERE "EntityMapID" = ANY (v_IntegrationEntityMapIDs);
    DELETE FROM __mj."CompanyIntegrationSyncWatermark" WHERE "EntityMapID" = ANY (v_IntegrationEntityMapIDs);
    DELETE FROM __mj."CompanyIntegrationEntityMap" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CompanyIntegrationRecordMap" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CompanyIntegrationRunDetail" WHERE "EntityID" = p_EntityID;

    -- ML pipelines targeting this entity, their models, runs and scoring bindings
    DELETE FROM __mj."MLModelScoringBinding" WHERE "MLModelID" = ANY (v_MLModelIDs);
    DELETE FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLModel" WHERE "PipelineID" = ANY (v_PipelineIDs);
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE __mj."MLTrainingRun" SET "TrainingSnapshotID" = NULL WHERE "TrainingSnapshotID" IN (SELECT "ID" FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs));
    DELETE FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLTrainingPipeline" WHERE "TargetEntityID" = p_EntityID;

    -- Record processes and feature values
    DELETE FROM __mj."FeatureValue" WHERE "EntityID" = p_EntityID OR "RecordProcessID" = ANY (v_RecordProcessIDs);
    DELETE FROM __mj."FeaturePipelineVersion" WHERE "RecordProcessID" = ANY (v_RecordProcessIDs);
    DELETE FROM __mj."RecordProcessWatermark" WHERE "EntityID" = p_EntityID OR "RecordProcessID" = ANY (v_RecordProcessIDs);
    DELETE FROM __mj."RecordProcess" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ProcessRunDetail" WHERE "EntityID" = p_EntityID;

    -- Recommendations
    DELETE FROM __mj."RecommendationItem" WHERE "DestinationEntityID" = p_EntityID OR "RecommendationID" = ANY (v_RecommendationIDs);
    DELETE FROM __mj."Recommendation" WHERE "SourceEntityID" = p_EntityID;

    -- Record history: version labels, changes, clone and merge logs
    DELETE FROM __mj."VersionLabelItem" WHERE "EntityID" = p_EntityID
        OR "RecordChangeID" IN (SELECT "ID" FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."RecordChange" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordCloneLogItem" WHERE "EntityID" = p_EntityID OR "RecordCloneLogID" = ANY (v_RecordCloneLogIDs);
    DELETE FROM __mj."RecordCloneLog" WHERE "RootEntityID" = p_EntityID;
    DELETE FROM __mj."RecordMergeDeletionLog" WHERE "RecordMergeLogID" = ANY (v_RecordMergeLogIDs);
    DELETE FROM __mj."RecordMergeLog" WHERE "EntityID" = p_EntityID;

    -- Rubric evaluations of this entity's records
    DELETE FROM __mj."RubricEvaluationScore" WHERE "EvaluationID" = ANY (v_RubricEvaluationIDs);
    DELETE FROM __mj."RubricEvaluation" WHERE "SubjectEntityID" = p_EntityID;

    -- Resource types for this entity, with their links, permissions and workspace items
    DELETE FROM __mj."ResourceLink" WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    DELETE FROM __mj."ResourcePermission" WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    DELETE FROM __mj."WorkspaceItem" WHERE "ResourceTypeID" = ANY (v_ResourceTypeIDs);
    DELETE FROM __mj."ResourceType" WHERE "EntityID" = p_EntityID;

    -- Scope columns whose NULL means "global": delete rather than widen the scope
    DELETE FROM __mj."AIAgentNote" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."AIAgentExample" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."ScopedNotificationConfig" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."ScopedPromptConfig" WHERE "PrimaryScopeEntityID" = p_EntityID;
    DELETE FROM __mj."ScopedPromptPart" WHERE "PrimaryScopeEntityID" = p_EntityID;

    -- Datasets: bump the parent so cached datasets refresh, then drop the item
    UPDATE __mj."Dataset" SET "__mj_UpdatedAt" = NOW()
        WHERE "ID" IN (SELECT "DatasetID" FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID);
    DELETE FROM __mj."DatasetItem" WHERE "EntityID" = p_EntityID;

    -- Saved views, then their categories (UserView.CategoryID was cleared above)
    DELETE FROM __mj."UserView" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserViewCategory" WHERE "EntityID" = p_EntityID;

    -- Rows with no dependents of their own
    DELETE FROM __mj."AccessControlRule" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ArchiveConfigurationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."ArchiveRunDetail" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."CalendarEventLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityAIAction" WHERE "EntityID" = p_EntityID OR "OutputEntityID" = p_EntityID;
    DELETE FROM __mj."EntityAlternateBaseView" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityFormContribution" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."EntityFormOverride" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityPermission" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."EntityRelationship" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."EntitySetting" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."FileEntityRecordLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."FormChromeRule" WHERE "EntityID" = p_EntityID OR "RelatedEntityID" = p_EntityID;
    DELETE FROM __mj."IntegrationURLFormat" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."InteractionLink" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."QueryEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordGeoCode" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."RecordLink" WHERE "SourceEntityID" = p_EntityID OR "TargetEntityID" = p_EntityID;
    DELETE FROM __mj."GraphEdge" WHERE "SourceEntityID" = p_EntityID OR "TargetEntityID" = p_EntityID;
    DELETE FROM __mj."GraphEdgeTypeEndpoint" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."SearchScopeEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."TaggedItem" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."TagScope" WHERE "ScopeEntityID" = p_EntityID;
    DELETE FROM __mj."UserApplicationEntity" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserFavorite" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."UserRecordLog" WHERE "EntityID" = p_EntityID;

    -- The entity's own fields, then the entity
    DELETE FROM __mj."EntityField" WHERE "EntityID" = p_EntityID;
    DELETE FROM __mj."Entity" WHERE "ID" = p_EntityID;

END
$spdel$;

GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityWithCoreDependencies"(uuid) TO "cdp_Developer", "cdp_Integration";

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
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7db88c96-c922-4724-ae93-7b91798ceafe',
    'MJ: ML Evaluation Protocols',
    'ML Evaluation Protocols',
    'An Evaluation Protocol: the grading rules of a pipeline, saved before any candidate trains — the locked holdout, inner validation, primary proper score, fixed baselines, calibration, intervals, promotion rule and the three allowed outcomes (model, keep-simple-baseline, no-signal), the leakage audit, slices and budgets. Every training run references the exact version it was graded under. Versions are immutable rows; editing inserts the next version. Replaces the ValidationStrategy and LeakageGuard JSON of ML Training Pipelines.',
    NULL,
    'MLEvaluationProtocol',
    'vwMLEvaluationProtocols',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add entity MJ: ML Evaluation Protocols to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '7db88c96-c922-4724-ae93-7b91798ceafe',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Evaluation Protocols for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Evaluation Protocols for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Evaluation Protocols for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('7db88c96-c922-4724-ae93-7b91798ceafe' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: ML Training Snapshots */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f36cde0e-dbcd-4527-9af6-66d8c710c8e6',
    'MJ: ML Training Snapshots',
    'ML Training Snapshots',
    'A Training Snapshot: the frozen data one training run learned from — the feature matrix, the row manifest (row id, entity key, decision date, group key, period, role) and per-value provenance as three write-once files, plus the content hash that fingerprints them together with the unit, label, feature-spec and protocol versions. Immutable; identical assemblies share one snapshot (unique ContentHash). Retraining from a snapshot reproduces the run.',
    NULL,
    'MLTrainingSnapshot',
    'vwMLTrainingSnapshots',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add entity MJ: ML Training Snapshots to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'f36cde0e-dbcd-4527-9af6-66d8c710c8e6',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Training Snapshots for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Training Snapshots for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Training Snapshots for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('f36cde0e-dbcd-4527-9af6-66d8c710c8e6' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: ML Prediction Units */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd5052eb0-354c-4c4d-80d8-2832fcc720e6',
    'MJ: ML Prediction Units',
    'ML Prediction Units',
    'A Prediction Unit: what one training row is (one grain record, or one grain record per period of a dated child entity), its decision date, the outcome rule and the window over which the outcome is observed, how unresolved rows are censored, and the declared task type. Every ML Training Pipeline references exactly one version. Versions are immutable rows: editing a unit inserts the next version with the same LineageRootID, so a trained model keeps pointing at the version it used.',
    NULL,
    'MLPredictionUnit',
    'vwMLPredictionUnits',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add entity MJ: ML Prediction Units to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'd5052eb0-354c-4c4d-80d8-2832fcc720e6',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Prediction Units for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Prediction Units for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Prediction Units for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('d5052eb0-354c-4c4d-80d8-2832fcc720e6' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."MLPredictionUnit"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLPredictionUnit */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLPredictionUnit */
UPDATE __mj."MLPredictionUnit" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MLPredictionUnit' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLPredictionUnit" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLPredictionUnit" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLPredictionUnit"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLPredictionUnit */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLPredictionUnit */
UPDATE __mj."MLPredictionUnit" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MLPredictionUnit' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLPredictionUnit" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLPredictionUnit" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLTrainingSnapshot"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLTrainingSnapshot */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLTrainingSnapshot */
UPDATE __mj."MLTrainingSnapshot" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MLTrainingSnapshot' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLTrainingSnapshot" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLTrainingSnapshot" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLTrainingSnapshot"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLTrainingSnapshot */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLTrainingSnapshot */
UPDATE __mj."MLTrainingSnapshot" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MLTrainingSnapshot' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLTrainingSnapshot" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLTrainingSnapshot" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLEvaluationProtocol"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLEvaluationProtocol */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLEvaluationProtocol */
UPDATE __mj."MLEvaluationProtocol" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MLEvaluationProtocol' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLEvaluationProtocol" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLEvaluationProtocol" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLEvaluationProtocol"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLEvaluationProtocol */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLEvaluationProtocol */
UPDATE __mj."MLEvaluationProtocol" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MLEvaluationProtocol' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLEvaluationProtocol" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLEvaluationProtocol" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4caaed2-29ad-4ae4-9d27-662406e3876f' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4caaed2-29ad-4ae4-9d27-662406e3876f', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4c1ca8f-92f6-4d1f-91b8-7989c68a2ff3' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'LineageRootID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4c1ca8f-92f6-4d1f-91b8-7989c68a2ff3', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'LineageRootID', 'Lineage Root ID', 'ID of version 1 of this unit. Version 1 points at itself; every later version points at version 1.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '75bd5e78-48bb-44d8-8b1f-cfb4edfef309' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'Version')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('75bd5e78-48bb-44d8-8b1f-cfb4edfef309', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'Version', 'Version', 'Version number within the lineage, starting at 1. A saved version is never updated.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '367ef229-e773-4eff-9050-d5d864329c7b' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('367ef229-e773-4eff-9050-d5d864329c7b', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'Name', 'Name', 'Display name of the unit, e.g. "Member renewal (person x membership period)".', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40751f77-3489-4bb1-a007-c3bf4f909221' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40751f77-3489-4bb1-a007-c3bf4f909221', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'Description', 'Description', 'What the unit predicts and for whom, in plain words.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd3aaffd7-39e7-4318-9c7e-78d1b274cf2e' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'UnitRows')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d3aaffd7-39e7-4318-9c7e-78d1b274cf2e', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'UnitRows', 'Unit Rows', 'JSON UnitRows: {kind:"grain", grainEntity, decisionDate, filter} or {kind:"grain-x-periods", grainEntity, childEntity, foreignKey, periodDate, filter}. Defines what one row is and its decision date.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1701db5-91dc-477c-8e8a-8191f18f3945' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'LabelRule')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b1701db5-91dc-477c-8e8a-8191f18f3945', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'LabelRule', 'Label Rule', 'JSON LabelRule: how the outcome of a row is read — a column on the row, the next period of the same grain record, or an event in a dated child entity — always within the window that starts LabelGapDays after the decision date and lasts LabelWindowDays.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '497d0450-7569-4ae2-ac34-2110c4cce6fc' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'LabelWindowDays')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('497d0450-7569-4ae2-ac34-2110c4cce6fc', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'LabelWindowDays', 'Label Window Days', 'Length in days of the outcome window. A row whose window ends after the data cutoff is censored (excluded and counted).', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6d5425d-6e89-42db-a089-e6020b969496' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'LabelGapDays')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e6d5425d-6e89-42db-a089-e6020b969496', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'LabelGapDays', 'Label Gap Days', 'Days between the decision date and the start of the outcome window.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6da08af0-f2f5-4294-abe1-f2de92a4278c' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'TaskType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6da08af0-f2f5-4294-abe1-f2de92a4278c', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'TaskType', 'Task Type', 'JSON TaskType: binary {classOrder, adverseIndex}, multiclass {classOrder, adverseIndices}, continuous, count, non-negative {tweediePower}, or forecast {valueKind}. Which class a score refers to and the adverse direction are derived from it, never stored separately.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a414a7a-b576-49c5-917c-5586fd9e645f' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'LabelVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1a414a7a-b576-49c5-917c-5586fd9e645f', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'LabelVersion', 'Label Version', 'Outcome-definition version: equals the previous version''s LabelVersion when LabelRule, LabelWindowDays, LabelGapDays and TaskType are unchanged, and that plus one otherwise.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e84bdae-c220-42f7-9716-ae7da85bb277' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'Censoring')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e84bdae-c220-42f7-9716-ae7da85bb277', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'Censoring', 'Censoring', 'JSON CensoringRule: {rule:"exclude-unresolved", cutoff} where cutoff is {kind:"corpus-end", entity, field}, {kind:"now"} or {kind:"fixed", at}. Rows whose outcome window has not closed at the cutoff are excluded and counted.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '02f695d3-28bb-414a-876d-37b0ad1dcaeb' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'ChangeHistoryPolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('02f695d3-28bb-414a-876d-37b0ad1dcaeb', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'ChangeHistoryPolicy', 'Change History Policy', 'JSON ChangeHistoryPolicy: {onUncoveredRow:"refuse"|"exclude-and-count", externalSourceRows:"as-of-detection-time"|"ineligible"} — what as-of assembly does when a decision date precedes the change history of a field updated in place.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6e6f6ee-8e03-44cd-91d3-f0a699d94a23' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'GroupKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e6e6f6ee-8e03-44cd-91d3-f0a699d94a23', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'GroupKey', 'Group Key', 'Field on the row whose value keeps one entity''s rows together in grouped folds and the new-entity report; NULL means the grain record key.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '599b6550-9744-441d-8d28-25dc8505914f' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'TemporalSpec')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('599b6550-9744-441d-8d28-25dc8505914f', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'TemporalSpec', 'Temporal Spec', 'JSON TemporalSpec for series and panels: timeColumn, horizonPeriods, lags, rollingWindows, period, seasonality. Every lag and rolling-window endLag is at least horizonPeriods. Required when TaskType is forecast. Versioned with the unit.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b01e7da7-5aa2-43e0-8414-47f2158f208d' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'DecisionSpec')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b01e7da7-5aa2-43e0-8414-47f2158f208d', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'DecisionSpec', 'Decision Spec', 'JSON DecisionSpec: the action the prediction serves, the actor role, the capacity per period (for precision at capacity) and the period.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '743899b5-546d-47b9-aa4b-28623bc2885e' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'IncumbentHeuristic')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('743899b5-546d-47b9-aa4b-28623bc2885e', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'IncumbentHeuristic', 'Incumbent Heuristic', 'JSON IncumbentHeuristic: {kind:"none"} or {kind:"rule", name, scoreExpression} — today''s rule of thumb, scored as a named comparator on the same holdout.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c44c7b71-e487-4c32-a7fc-12a714715bbd' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'AuthoredBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c44c7b71-e487-4c32-a7fc-12a714715bbd', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'AuthoredBy', 'Authored By', 'JSON Actor who authored this version: {kind:"human", userId} (a user), or an automated author {kind:"agent", agentRunId}, {kind:"scheduled-job", scheduledJobRunId} or {kind:"system", component}.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '247807bd-b812-4de5-9d17-49788c5e7b29' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('247807bd-b812-4de5-9d17-49788c5e7b29', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a565f607-69d9-4d1e-b326-5067cd19dd8b' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a565f607-69d9-4d1e-b326-5067cd19dd8b', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '28d4be83-b39f-4e10-b368-0fe0c171a22b' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('28d4be83-b39f-4e10-b368-0fe0c171a22b', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fa8d93a6-c4f0-4b15-9516-7815bbc9bbc0' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ContentHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fa8d93a6-c4f0-4b15-9516-7815bbc9bbc0', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ContentHash', 'Content Hash', 'SHA-256 (lower-case hex) of the canonical JSON of the three file hashes, the feature schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID and DataCutoff.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f8d2651-b8bd-4406-a051-567b13bdca78' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'PipelineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f8d2651-b8bd-4406-a051-567b13bdca78', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'PipelineID', 'Pipeline ID', 'The ML Training Pipeline whose feature spec was assembled.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '703FD109-331B-438D-902B-8E4A93C3F6AA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '517ace76-ec37-449f-8ab2-737099d8c1d2' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'PredictionUnitID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('517ace76-ec37-449f-8ab2-737099d8c1d2', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'PredictionUnitID', 'Prediction Unit ID', 'The exact Prediction Unit version whose rows were read.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f2ec3773-fce0-461a-bddb-88489f0ab03d' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'LabelVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f2ec3773-fce0-461a-bddb-88489f0ab03d', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'LabelVersion', 'Label Version', 'The unit''s LabelVersion at assembly.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4fa37ef-982b-456f-bbfc-4497138b31eb' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'FeatureSpecVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4fa37ef-982b-456f-bbfc-4497138b31eb', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'FeatureSpecVersion', 'Feature Spec Version', 'The pipeline Version whose FeatureSteps produced the feature spec.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f49f9e6-7306-4f1a-8179-0a04ee34415a' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f49f9e6-7306-4f1a-8179-0a04ee34415a', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'EvaluationProtocolID', 'Evaluation Protocol ID', 'The Evaluation Protocol version whose holdout rule assigned the manifest roles; NULL only for a legacy pipeline trained before its protocol was migrated.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '366bd221-dead-41dc-ad75-3642fc088fa9' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'StorageProviderID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('366bd221-dead-41dc-ad75-3642fc088fa9', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'StorageProviderID', 'Storage Provider ID', 'The File Storage Provider holding the three files.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '28248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e286da2-8662-49fb-b490-94148bc6f2c9' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'MatrixFileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8e286da2-8662-49fb-b490-94148bc6f2c9', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'MatrixFileID', 'Matrix File ID', 'MJ: Files row of matrix.jsonl (header line with column names, then one JSON array per manifest row).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c1d1e86-be68-4bb1-b4ec-6d0483a55c3a' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'MatrixSha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c1d1e86-be68-4bb1-b4ec-6d0483a55c3a', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'MatrixSha256', 'Matrix Sha 256', 'SHA-256 of the matrix file bytes.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc5fa05b-7fe5-46f1-9a98-6423fae0de42' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'MatrixSizeBytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dc5fa05b-7fe5-46f1-9a98-6423fae0de42', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'MatrixSizeBytes', 'Matrix Size Bytes', 'Size of the matrix file in bytes.', 'bigint', 8, 19, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '19a80161-8c30-4528-b62f-f528dacf4f0b' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'RowManifestFileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19a80161-8c30-4528-b62f-f528dacf4f0b', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'RowManifestFileID', 'Row Manifest File ID', 'MJ: Files row of manifest.jsonl (one SnapshotRowKey per row; the locked-holdout rows are the stored holdout keys).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b37e93be-197f-4b74-b48e-62234b9517c8' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'RowManifestSha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b37e93be-197f-4b74-b48e-62234b9517c8', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'RowManifestSha256', 'Row Manifest Sha 256', 'SHA-256 of the manifest file bytes.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '516f7d0d-f38e-4395-ab5c-32c77e664c1d' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'RowManifestSizeBytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('516f7d0d-f38e-4395-ab5c-32c77e664c1d', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'RowManifestSizeBytes', 'Row Manifest Size Bytes', 'Size of the manifest file in bytes.', 'bigint', 8, 19, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2e6da552-0e71-4fb7-8e9c-f435f11d1fc7' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ProvenanceFileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2e6da552-0e71-4fb7-8e9c-f435f11d1fc7', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ProvenanceFileID', 'Provenance File ID', 'MJ: Files row of provenance.jsonl (for every row and column: source kind, source reference, source version, computed-at).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a05375b-b318-46b5-a58e-6028b17b7e17' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ProvenanceSha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2a05375b-b318-46b5-a58e-6028b17b7e17', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ProvenanceSha256', 'Provenance Sha 256', 'SHA-256 of the provenance file bytes.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a79c79e3-9ba0-4c54-a5c3-96a5d874fb7f' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ProvenanceSizeBytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a79c79e3-9ba0-4c54-a5c3-96a5d874fb7f', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ProvenanceSizeBytes', 'Provenance Size Bytes', 'Size of the provenance file in bytes.', 'bigint', 8, 19, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ab85c20f-ff13-41c9-a11e-2cf9e8294260' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ManifestRowCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ab85c20f-ff13-41c9-a11e-2cf9e8294260', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ManifestRowCount', 'Manifest Row Count', 'Rows in the manifest (development plus locked holdout).', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a69b3c8c-bde6-4674-b41d-a56c677de157' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'HoldoutRowCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a69b3c8c-bde6-4674-b41d-a56c677de157', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'HoldoutRowCount', 'Holdout Row Count', 'Manifest rows with role locked-holdout.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '62861dc3-7a4f-4111-b64e-a3b8afaa664d' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'FeatureSpec')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('62861dc3-7a4f-4111-b64e-a3b8afaa664d', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'FeatureSpec', 'Feature Spec', 'JSON array of the resolved FeatureColumnSpec (name, dated source, encoding, missing-value policy) assembled.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40def3c6-04b1-4246-99d7-6965d37961d5' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'FeatureSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40def3c6-04b1-4246-99d7-6965d37961d5', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'FeatureSchema', 'Feature Schema', 'JSON array of matrix columns {name, encoding, sourceColumn} in matrix order.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84377039-15bd-41ff-ac27-b86d47e655df' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'FeatureSchemaHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84377039-15bd-41ff-ac27-b86d47e655df', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'FeatureSchemaHash', 'Feature Schema Hash', 'SHA-256 of the canonical JSON of FeatureSchema; compared before scoring.', 'nvarchar', 128, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7eb7a214-d268-4ba4-97ba-e6d2330efe95' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ColumnProvenance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7eb7a214-d268-4ba4-97ba-e6d2330efe95', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ColumnProvenance', 'Column Provenance', 'JSON array of ColumnProvenance: per matrix column, the source kind, source reference and source version.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6a1c77e5-a702-4ed3-89b5-d9495f9b85a2' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'PinnedFeatureVersions')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a1c77e5-a702-4ed3-89b5-d9495f9b85a2', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'PinnedFeatureVersions', 'Pinned Feature Versions', 'JSON array of FeatureVersionPin for every Feature Value source read.', 'nvarchar', -1, 0, 0, FALSE, '[]', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fcd672b4-13c6-4b49-a7a3-3ce86a1c135c' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'RowsRead')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fcd672b4-13c6-4b49-a7a3-3ce86a1c135c', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'RowsRead', 'Rows Read', 'Unit rows read from the source before exclusions; equals the source count (a truncated read is refused).', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8dbca900-1a90-4d1b-b7cb-a95353041a58' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ReadComplete')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8dbca900-1a90-4d1b-b7cb-a95353041a58', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ReadComplete', 'Read Complete', 'Always 1: a snapshot exists only for a complete read.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c5447115-f0d9-4e3e-a5f7-99b604cae9d7' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'CensoredRowsExcluded')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c5447115-f0d9-4e3e-a5f7-99b604cae9d7', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'CensoredRowsExcluded', 'Censored Rows Excluded', 'Rows excluded because their outcome window had not closed at DataCutoff.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8a7611f-6332-465b-b2bf-7ff6bbd329a9' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'LabelKnownRowsExcluded')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8a7611f-6332-465b-b2bf-7ff6bbd329a9', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'LabelKnownRowsExcluded', 'Label Known Rows Excluded', 'Rows excluded because their outcome was already recorded on or before the decision date (next-period rule).', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c2c36e97-d80c-47a6-b1be-52e9d9253a13' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'EmptyLabelRowsExcluded')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c2c36e97-d80c-47a6-b1be-52e9d9253a13', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'EmptyLabelRowsExcluded', 'Empty Label Rows Excluded', 'Rows excluded because their label was empty (NULL or an empty string) — unlabelled, never a class.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '19f7a467-c851-4c98-843b-1235819da36f' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'UncoveredHistoryRowsExcluded')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19f7a467-c851-4c98-843b-1235819da36f', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'UncoveredHistoryRowsExcluded', 'Uncovered History Rows Excluded', 'JSON array {entity, field, rows}: rows excluded because a field''s change history did not cover their decision date (policy exclude-and-count).', 'nvarchar', -1, 0, 0, FALSE, '[]', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f0b40ef-42cf-4a22-b77b-320e5aab0542' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'DuplicateRowsRemoved')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f0b40ef-42cf-4a22-b77b-320e5aab0542', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'DuplicateRowsRemoved', 'Duplicate Rows Removed', 'Rows removed as exact duplicates of (entity key, decision date, period).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6a9fecd0-fb18-4f21-a6f8-f5f48ed17203' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ClassBalance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a9fecd0-fb18-4f21-a6f8-f5f48ed17203', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ClassBalance', 'Class Balance', 'JSON array {label, rows} over manifest rows for classification tasks; NULL otherwise.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8faa92f0-8f7c-4739-a762-9489835d71b9' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'DataCutoff')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8faa92f0-8f7c-4739-a762-9489835d71b9', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'DataCutoff', 'Data Cutoff', 'The censoring cutoff the unit resolved to for this assembly.', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dbc13174-3a1d-4f40-a5d3-95d40fbb2819' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'AssemblyCodeVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dbc13174-3a1d-4f40-a5d3-95d40fbb2819', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'AssemblyCodeVersion', 'Assembly Code Version', 'Package version and git commit of the assembly code that built the snapshot.', 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68f17137-6405-460d-9796-60785602a4d3' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68f17137-6405-460d-9796-60785602a4d3', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'abfcfa3f-1315-4df2-ac8a-e710f99823c2' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abfcfa3f-1315-4df2-ac8a-e710f99823c2', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b8c4ad9-59e6-421e-b28d-c2c60d8c9aef' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1b8c4ad9-59e6-421e-b28d-c2c60d8c9aef', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc21f4d2-0d46-44b0-8fe4-c16dfdf4c522' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'LineageRootID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cc21f4d2-0d46-44b0-8fe4-c16dfdf4c522', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'LineageRootID', 'Lineage Root ID', 'ID of version 1 of this protocol. Version 1 points at itself.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e16b9172-338c-4d7a-8dfe-f9fa06cf4db8' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Version')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e16b9172-338c-4d7a-8dfe-f9fa06cf4db8', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Version', 'Version', 'Version number within the lineage, starting at 1. A saved version is never updated.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd44848c6-9cab-4c17-a4e8-27eda46692d6' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d44848c6-9cab-4c17-a4e8-27eda46692d6', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Name', 'Name', 'Display name of the protocol.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1985f44-5f4f-4831-bb96-3470ce296583' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b1985f44-5f4f-4831-bb96-3470ce296583', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Description', 'Description', 'What the protocol is for, in plain words.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd3c7baef-df62-4355-a7ed-cde904b888d5' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Holdout')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d3c7baef-df62-4355-a7ed-cde904b888d5', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Holdout', 'Holdout', 'JSON HoldoutSplit (guard field): {kind:"date-carved", dateColumn, cutoff, holdoutEnd, newEntityReport} or {kind:"rolling-origin", origins (>= 5), horizonPeriods, gapPeriods, minTrainPeriods, window}.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '968afd18-c8a9-41c6-a03c-4d284033bd6b' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'InnerValidation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('968afd18-c8a9-41c6-a03c-4d284033bd6b', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'InnerValidation', 'Inner Validation', 'JSON InnerValidation over development rows only: repeated-stratified-kfold, grouped-kfold or blocked-time.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0e507e5-acc9-4d6b-ab4a-49fe2be84b96' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Seed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0e507e5-acc9-4d6b-ab4a-49fe2be84b96', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Seed', 'Seed', 'Random seed for every split, fold, bootstrap and estimator of a run under this protocol.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2153c8c2-8dff-422c-9759-8ee80f53f0ae' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'HoldoutAccessBudget')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2153c8c2-8dff-422c-9759-8ee80f53f0ae', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'HoldoutAccessBudget', 'Holdout Access Budget', 'How many times the locked holdout may be scored per run: always 1, for one declared finalist.', 'int', 4, 10, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18636bb2-a8be-4a84-9c8f-211a35ff4d00' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'PrimaryScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18636bb2-a8be-4a84-9c8f-211a35ff4d00', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'PrimaryScore', 'Primary Score', 'JSON ProperScore {family, metric}: the only metric that ranks candidates and gates outcomes. Its family must equal the pipeline unit''s task kind.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '252225d0-f65a-453d-9390-2c2c7da687a2' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'SecondaryMetrics')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('252225d0-f65a-453d-9390-2c2c7da687a2', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'SecondaryMetrics', 'Secondary Metrics', 'JSON array of secondary metric keys (auc, accuracy, f1, precision, recall, r2, calibration-slope); reported with intervals, never used to rank.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '89230037-5a26-4441-911f-2b9fae0369b9' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Baselines')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('89230037-5a26-4441-911f-2b9fae0369b9', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Baselines', 'Baselines', 'JSON array of BaselineSpec fitted on every run: dummy, one-feature, glm, naive, seasonal-naive, incumbent-heuristic.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e170cd66-f89b-4403-8538-e80e3757df23' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Calibration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e170cd66-f89b-4403-8538-e80e3757df23', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Calibration', 'Calibration', 'JSON CalibrationMethod: platt, isotonic or auto, always fit on a disjoint calibration fold; not-applicable for regression.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7b16e14f-39a2-4405-b612-aedb8fb5a4e5' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Resampling')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7b16e14f-39a2-4405-b612-aedb8fb5a4e5', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Resampling', 'Resampling', 'JSON ResamplingSpec: {kind:"none"} or {kind:"in-fold", method}; resampling never touches holdout rows.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e12ef381-23cb-44f0-9234-27ad4854a41e' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Intervals')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e12ef381-23cb-44f0-9234-27ad4854a41e', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Intervals', 'Intervals', 'JSON IntervalSpec: level 0.95, method, resamples and the paired test for model-versus-comparator differences.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '53a6b363-0c31-4a02-8098-7997ffa6773b' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Promotion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('53a6b363-0c31-4a02-8098-7997ffa6773b', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Promotion', 'Promotion', 'JSON PromotionRule (guard field): comparators, incumbent, margin (>= 0), lowerBoundLevel 0.95, pairedOn same-holdout-rows, decisionTable Q13+Q14+Q15.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f849c1e5-2a72-459c-9c5b-65bf039e73bc' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'AllowedOutcomes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f849c1e5-2a72-459c-9c5b-65bf039e73bc', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'AllowedOutcomes', 'Allowed Outcomes', 'JSON array, exactly ["model","keep-simple-baseline","no-signal"]: a protocol cannot omit no-signal.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30b68cf1-3409-453a-98c2-e6c2255ac836' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'LeakageAudit')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('30b68cf1-3409-453a-98c2-e6c2255ac836', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'LeakageAudit', 'Leakage Audit', 'JSON LeakageAuditSpec (guard field): held-out single-feature AUC ceiling, time-shifted-label test, drop-column test, per-source-column importance aggregation, high-cardinality ID check.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3f5a513-4467-46a9-865e-1bec926439f1' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Exclusions')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3f5a513-4467-46a9-865e-1bec926439f1', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Exclusions', 'Exclusions', 'JSON ProtocolExclusions (guard field): {denyFields, denySources} — columns and sources that never enter the feature matrix (the former LeakageGuard deny lists).', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb620df0-fc76-4d02-b7c8-1bfa3c19770c' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Slices')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb620df0-fc76-4d02-b7c8-1bfa3c19770c', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Slices', 'Slices', 'JSON SliceSpec: {outOfTime, subgroups} — each slice is reported with the primary score and its interval.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32743338-0281-4a24-ba0a-4ef8d5281866' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'PredictionIntervals')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32743338-0281-4a24-ba0a-4ef8d5281866', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'PredictionIntervals', 'Prediction Intervals', 'JSON PredictionIntervalSpec {method, nominalCoverage} for continuous, count and non-negative tasks; NULL when not requested.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ae6c0a7-5b72-4c3a-a080-154be17da485' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'ResidualDiagnostics')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ae6c0a7-5b72-4c3a-a080-154be17da485', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'ResidualDiagnostics', 'Residual Diagnostics', 'JSON ResidualDiagnosticsSpec {acfLags, ljungBoxAlpha} for series and panels; NULL otherwise.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'acbd66b0-1219-4441-a7c0-0f82808e40f7' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'RetrainTriggers')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('acbd66b0-1219-4441-a7c0-0f82808e40f7', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'RetrainTriggers', 'Retrain Triggers', 'JSON array of RetrainTrigger declared for monitoring (outcome-degradation, calibration-drift).', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b05f9bd-d5a9-4852-b5b1-48c58796ae02' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'SearchStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b05f9bd-d5a9-4852-b5b1-48c58796ae02', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'SearchStrategy', 'Search Strategy', 'JSON SearchStrategy: {kind:"random", candidates} or {kind:"guided", method, equalCostComparisonId}.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2af1a4ee-1133-458c-ad90-ad95dd2f1043' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'Budgets')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2af1a4ee-1133-458c-ad90-ad95dd2f1043', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'Budgets', 'Budgets', 'JSON Budgets (guard field): maxComputeSeconds, maxTokens, maxCandidates, hardStop true.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5a26ca06-0e44-4ce3-ab6d-c7541002eed3' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'MinMinorityClassRows')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a26ca06-0e44-4ce3-ab6d-c7541002eed3', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'MinMinorityClassRows', 'Min Minority Class Rows', 'Smallest minority-class row count in the locked holdout for which a classification gate may return model; below it the gate cannot ship a model.', 'int', 4, 10, 0, FALSE, '(20)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ecf141b1-f1f5-4db6-bf75-ccc11817c2d8' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'GuardFieldsEditableBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ecf141b1-f1f5-4db6-bf75-ccc11817c2d8', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'GuardFieldsEditableBy', 'Guard Fields Editable By', 'Who may change the guard fields (Holdout, Promotion, LeakageAudit, Exclusions, Budgets and this setting) in the next version: non-agent (default: any author except an agent tool call — a user, a non-agent API caller, a scheduled job or the system) or human-only (optional: only a version authored by a user). Every author''s version passes the same guard-field validation.', 'nvarchar', 40, 0, 0, FALSE, 'non-agent', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7937b713-ff95-424f-a2e6-553e2b545b21' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'AuthoredBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7937b713-ff95-424f-a2e6-553e2b545b21', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'AuthoredBy', 'Authored By', 'JSON Actor who authored this version.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e1b8fc2b-3bd5-420a-a8d6-6af5becb306e' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e1b8fc2b-3bd5-420a-a8d6-6af5becb306e', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '59f85ac9-0097-463c-b91b-6d74777c5a55' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('59f85ac9-0097-463c-b91b-6d74777c5a55', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b08d0b2-50b0-492e-8639-98538371560e' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'TrainingSnapshotID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b08d0b2-50b0-492e-8639-98538371560e', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'), 'TrainingSnapshotID', 'Training Snapshot ID', 'The Training Snapshot this run trained on; NULL for a run refused before assembly and for runs before Predictive Studio 6.3.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40a9ac69-85a2-4f16-8910-7e96274deb16' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('40a9ac69-85a2-4f16-8910-7e96274deb16', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'), 'EvaluationProtocolID', 'Evaluation Protocol ID', 'The Evaluation Protocol version the run was graded under, pinned when the run started.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82fa5ea5-51c7-46ed-8447-58fa5e3d023f' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'CodeVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('82fa5ea5-51c7-46ed-8447-58fa5e3d023f', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'), 'CodeVersion', 'Code Version', 'JSON CodeVersion: PS git commit, sidecar version, library versions, thread count and seed the run used.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b27c085b-e8b8-4e9b-93ae-f9b018cb6ba6' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'ComputeSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b27c085b-e8b8-4e9b-93ae-f9b018cb6ba6', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'), 'ComputeSeconds', 'Compute Seconds', 'Measured trainer compute time in seconds, as returned by the sidecar.', 'decimal', 9, 18, 3, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a9142009-7413-48c2-afc9-23528c97083a' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'EffectiveAsOf')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a9142009-7413-48c2-afc9-23528c97083a', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'EffectiveAsOf', 'Effective As Of', 'Instant from which this value is the record''s value of the feature; as-of assembly reads the latest value with EffectiveAsOf at or before a row''s decision date. On a Source = Model row it is the scoring as-of date. NULL = not effective-dated (ineligible for as-of assembly).', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7c731f43-07c1-4972-a06a-92209286f478' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'InputAsOf')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7c731f43-07c1-4972-a06a-92209286f478', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'InputAsOf', 'Input As Of', 'Instant of the input data the value was computed from (its provenance); never after EffectiveAsOf.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f6d36e6-64eb-4972-8590-dff51bfeed77' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'PredictionUnitID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f6d36e6-64eb-4972-8590-dff51bfeed77', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA'), 'PredictionUnitID', 'Prediction Unit ID', 'The exact Prediction Unit version this pipeline trains on. NULL only on a pipeline created before Predictive Studio 6.3 that has not been migrated; such a pipeline cannot be trained.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '50d68b63-68b4-4a71-82c0-02fd0d7ccfc0' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('50d68b63-68b4-4a71-82c0-02fd0d7ccfc0', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA'), 'EvaluationProtocolID', 'Evaluation Protocol ID', 'The exact Evaluation Protocol version every training run of this pipeline is graded under. Its primary score family must equal the unit''s task kind.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 9cc0abeb-8746-4d07-8802-fac33b262693 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9cc0abeb-8746-4d07-8802-fac33b262693',
    '2153C8C2-8DFF-422C-9759-8EE80F53F0AE',
    1,
    '1',
    '1',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2153C8C2-8DFF-422C-9759-8EE80F53F0AE */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2153C8C2-8DFF-422C-9759-8EE80F53F0AE';
/* SQL text to insert entity field value with ID 87a6fd51-4138-4c6c-9999-e19b6b867ad6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '87a6fd51-4138-4c6c-9999-e19b6b867ad6',
    'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8',
    1,
    'human-only',
    'human-only',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6b87db2b-b65c-4523-b4e2-f574eb9fafdf */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6b87db2b-b65c-4523-b4e2-f574eb9fafdf',
    'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8',
    2,
    'non-agent',
    'non-agent',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8';
/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" IN (
    SELECT
      "e"."ID"
    FROM __mj."Entity" AS "e"
    WHERE
      "e"."AllowUserSearchAPI" = TRUE
      AND "e"."AutoUpdateAllowUserSearchAPI" = TRUE
      AND "e"."VirtualEntity" = FALSE
      AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
      AND NOT "e"."SchemaName" IN ('sys', 'staging')
      AND NOT EXISTS(
        SELECT
          1
        FROM __mj."EntityField" AS "f2"
        WHERE
          "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
      )
  );
/* Create Entity Relationship: MJ: ML Prediction Units -> MJ: ML Prediction Units (One To Many via LineageRootID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6216a501-fcbb-4ac1-8a55-628b7182f952' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "RelatedEntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "RelatedEntityJoinField" = 'LineageRootID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6216a501-fcbb-4ac1-8a55-628b7182f952', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'LineageRootID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8463ebe3-2d8e-4f8d-9d6b-21ef5ce17f20' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'PredictionUnitID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8463ebe3-2d8e-4f8d-9d6b-21ef5ce17f20', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'PredictionUnitID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a647bcd2-b388-4a5a-9565-75963787ab4e' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "RelatedEntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "RelatedEntityJoinField" = 'PredictionUnitID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a647bcd2-b388-4a5a-9565-75963787ab4e', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'PredictionUnitID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bbb7a603-1307-4929-bb90-44c9a3113e06' OR ("EntityID" = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'StorageProviderID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bbb7a603-1307-4929-bb90-44c9a3113e06', '28248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'StorageProviderID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '20d7c085-dce4-4a7c-9ec7-79a15c62896a' OR ("EntityID" = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'MatrixFileID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('20d7c085-dce4-4a7c-9ec7-79a15c62896a', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'MatrixFileID', 'One To Many', TRUE, TRUE, 12, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5a28a7fb-c4f2-4aaa-9ba8-5fa271556841' OR ("EntityID" = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'RowManifestFileID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a28a7fb-c4f2-4aaa-9ba8-5fa271556841', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'RowManifestFileID', 'One To Many', TRUE, TRUE, 13, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b9a1f060-e95e-43ad-83e1-8f1b2d1569e0' OR ("EntityID" = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'ProvenanceFileID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b9a1f060-e95e-43ad-83e1-8f1b2d1569e0', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'ProvenanceFileID', 'One To Many', TRUE, TRUE, 14, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '24a3a8a7-1dbb-44ac-b1b2-ec9fd437c8af' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "RelatedEntityJoinField" = 'TrainingSnapshotID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24a3a8a7-1dbb-44ac-b1b2-ec9fd437c8af', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'TrainingSnapshotID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6930ccde-4cee-458b-bec5-aa803c76e18a' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6930ccde-4cee-458b-bec5-aa803c76e18a', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'EvaluationProtocolID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5f43125b-bead-42b7-b2db-448378807db3' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "RelatedEntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "RelatedEntityJoinField" = 'LineageRootID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f43125b-bead-42b7-b2db-448378807db3', '7DB88C96-C922-4724-AE93-7B91798CEAFE', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'LineageRootID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '34415204-8d17-40ce-a99f-e6bf63041940' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "RelatedEntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "RelatedEntityJoinField" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34415204-8d17-40ce-a99f-e6bf63041940', '7DB88C96-C922-4724-AE93-7B91798CEAFE', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'EvaluationProtocolID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9a30061a-304a-40ef-a11e-c391148679c0' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "RelatedEntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "RelatedEntityJoinField" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a30061a-304a-40ef-a11e-c391148679c0', '7DB88C96-C922-4724-AE93-7B91798CEAFE', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'EvaluationProtocolID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e39332d1-4a97-4201-ac02-14e2b654a90f' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "RelatedEntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityJoinField" = 'PipelineID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e39332d1-4a97-4201-ac02-14e2b654a90f', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'PipelineID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2659c3fc-5c4a-45a1-8503-ea35e535dc86' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'LineageRoot')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2659c3fc-5c4a-45a1-8503-ea35e535dc86', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' /* Entity: MJ: ML Prediction Units */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'), 'LineageRoot', 'Lineage Root', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3cb7ff9-ef00-4328-91b5-1636e0fe28a2' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'Pipeline')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3cb7ff9-ef00-4328-91b5-1636e0fe28a2', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'Pipeline', 'Pipeline', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3209c303-58d1-4664-92e5-25346fe4c7c8' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'PredictionUnit')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3209c303-58d1-4664-92e5-25346fe4c7c8', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'PredictionUnit', 'Prediction Unit', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8da58777-5274-49b8-b769-6b0414de7778' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'EvaluationProtocol')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8da58777-5274-49b8-b769-6b0414de7778', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'EvaluationProtocol', 'Evaluation Protocol', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29b6e621-51f1-440c-8ef9-591e60ad2c8b' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'StorageProvider')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29b6e621-51f1-440c-8ef9-591e60ad2c8b', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'StorageProvider', 'Storage Provider', NULL, 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e9b5c93d-9be8-4dc8-a6ca-1fc07af0c9c1' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'MatrixFile')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e9b5c93d-9be8-4dc8-a6ca-1fc07af0c9c1', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'MatrixFile', 'Matrix File', NULL, 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad7d26ec-0d16-4859-a709-e65dedb0336e' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'RowManifestFile')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad7d26ec-0d16-4859-a709-e65dedb0336e', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'RowManifestFile', 'Row Manifest File', NULL, 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '932935b3-e8ab-43b8-a9f8-1bee61f1f8c9' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'ProvenanceFile')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('932935b3-e8ab-43b8-a9f8-1bee61f1f8c9', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' /* Entity: MJ: ML Training Snapshots */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6'), 'ProvenanceFile', 'Provenance File', NULL, 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4d9a19f-c0f1-4a25-b2c3-a8328b332c0d' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'LineageRoot')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4d9a19f-c0f1-4a25-b2c3-a8328b332c0d', '7DB88C96-C922-4724-AE93-7B91798CEAFE' /* Entity: MJ: ML Evaluation Protocols */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE'), 'LineageRoot', 'Lineage Root', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3bf248e-6359-45b4-8054-c5ce314ab738' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'EvaluationProtocol')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3bf248e-6359-45b4-8054-c5ce314ab738', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'), 'EvaluationProtocol', 'Evaluation Protocol', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '10e2d48e-5d23-4ccf-b10a-8ac9bc84726f' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'PredictionUnit')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('10e2d48e-5d23-4ccf-b10a-8ac9bc84726f', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA'), 'PredictionUnit', 'Prediction Unit', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b4d5c9f6-af81-425a-b535-5fe9ffe84047' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'EvaluationProtocol')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b4d5c9f6-af81-425a-b535-5fe9ffe84047', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA'), 'EvaluationProtocol', 'Evaluation Protocol', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A0E507E5-ACC9-4D6B-AB4A-49FE2BE84B96'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '2153C8C2-8DFF-422C-9759-8EE80F53F0AE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'D44848C6-9CAB-4C17-A4E8-27EDA46692D6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'FA8D93A6-C4F0-4B15-9516-7815BBC9BBC0' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'AB85C20F-FF13-41C9-A11E-2CF9E8294260'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A69B3C8C-BDE6-4674-B41D-A56C677DE157'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8FAA92F0-8F7C-4739-A762-9489835D71B9'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E3CB7FF9-EF00-4328-91B5-1636E0FE28A2'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3209C303-58D1-4664-92E5-25346FE4C7C8'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B27C085B-E8B8-4E9B-93AE-F9B018CB6BA6'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 4 fields */
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.PredictionUnitID */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prediction Unit'
WHERE
  "ID" = '5F6D36E6-64EB-4972-8590-DFF51BFEED77';
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.EvaluationProtocolID */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Safety', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol'
WHERE
  "ID" = '50D68B63-68B4-4A71-82C0-02FD0D7CCFC0';
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.PredictionUnit */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prediction Unit Name'
WHERE
  "ID" = '10E2D48E-5D23-4CCF-B10A-8AC9BC84726F';
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.EvaluationProtocol */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Safety', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol Name'
WHERE
  "ID" = 'B4D5C9F6-AF81-425A-B535-5FE9FFE84047';

/* Set categories for 5 fields */
/* UPDATE Entity Field Category Info MJ: ML Training Runs.TrainingSnapshotID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Snapshot'
WHERE
  "ID" = '4B08D0B2-50B0-492E-8639-98538371560E';
/* UPDATE Entity Field Category Info MJ: ML Training Runs.EvaluationProtocolID */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol'
WHERE
  "ID" = '40A9AC69-85A2-4F16-8910-7E96274DEB16';
/* UPDATE Entity Field Category Info MJ: ML Training Runs.CodeVersion */
UPDATE __mj."EntityField" SET "Category" = 'Model Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '82FA5EA5-51C7-46ED-8447-58FA5E3D023F';
/* UPDATE Entity Field Category Info MJ: ML Training Runs.ComputeSeconds */
UPDATE __mj."EntityField" SET "Category" = 'Resource Usage', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B27C085B-E8B8-4E9B-93AE-F9B018CB6BA6';
/* UPDATE Entity Field Category Info MJ: ML Training Runs.EvaluationProtocol */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol Details'
WHERE
  "ID" = 'F3BF248E-6359-45B4-8054-C5CE314AB738';

/* Set field properties for entity */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: Feature Values.EffectiveAsOf */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A9142009-7413-48C2-AFC9-23528C97083A';
/* UPDATE Entity Field Category Info MJ: Feature Values.InputAsOf */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7C731F43-07C1-4972-A06A-92209286F478';

/* Set categories for 43 fields */
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '28D4BE83-B39F-4E10-B368-0FE0C171A22B';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ContentHash */
UPDATE __mj."EntityField" SET "Category" = 'Snapshot Identity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FA8D93A6-C4F0-4B15-9516-7815BBC9BBC0';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.PipelineID */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Pipeline'
WHERE
  "ID" = '8F8D2651-B8BD-4406-A051-567B13BDCA78';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.PredictionUnitID */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prediction Unit'
WHERE
  "ID" = '517ACE76-EC37-449F-8AB2-737099D8C1D2';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.LabelVersion */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F2EC3773-FCE0-461A-BDDB-88489F0AB03D';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSpecVersion */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C4FA37EF-982B-456F-BBFC-4497138B31EB';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.EvaluationProtocolID */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol'
WHERE
  "ID" = '5F49F9E6-7306-4F1A-8179-0A04EE34415A';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.StorageProviderID */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Storage Provider'
WHERE
  "ID" = '366BD221-DEAD-41DC-AD75-3642FC088FA9';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixFileID */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Matrix File'
WHERE
  "ID" = '8E286DA2-8662-49FB-B490-94148BC6F2C9';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixSha256 */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Matrix SHA-256'
WHERE
  "ID" = '2C1D1E86-BE68-4BB1-B4EC-6D0483A55C3A';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixSizeBytes */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Matrix Size (Bytes)'
WHERE
  "ID" = 'DC5FA05B-7FE5-46F1-9A98-6423FAE0DE42';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestFileID */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Row Manifest File'
WHERE
  "ID" = '19A80161-8C30-4528-B62F-F528DACF4F0B';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestSha256 */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Row Manifest SHA-256'
WHERE
  "ID" = 'B37E93BE-197F-4B74-B48E-62234B9517C8';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestSizeBytes */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Row Manifest Size (Bytes)'
WHERE
  "ID" = '516F7D0D-F38E-4395-AB5C-32C77E664C1D';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceFileID */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Provenance File'
WHERE
  "ID" = '2E6DA552-0E71-4FB7-8E9C-F435F11D1FC7';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceSha256 */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Provenance SHA-256'
WHERE
  "ID" = '2A05375B-B318-46B5-A58E-6028B17B7E17';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceSizeBytes */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Provenance Size (Bytes)'
WHERE
  "ID" = 'A79C79E3-9BA0-4C54-A5C3-96A5D874FB7F';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ManifestRowCount */
UPDATE __mj."EntityField" SET "Category" = 'Row Metrics and Statistics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AB85C20F-FF13-41C9-A11E-2CF9E8294260';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.HoldoutRowCount */
UPDATE __mj."EntityField" SET "Category" = 'Row Metrics and Statistics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A69B3C8C-BDE6-4674-B41D-A56C677DE157';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSpec */
UPDATE __mj."EntityField" SET "Category" = 'Schema and Features', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '62861DC3-7A4F-4111-B64E-A3B8AFAA664D';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSchema */
UPDATE __mj."EntityField" SET "Category" = 'Schema and Features', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '40DEF3C6-04B1-4246-99D7-6965D37961D5';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.FeatureSchemaHash */
UPDATE __mj."EntityField" SET "Category" = 'Schema and Features', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '84377039-15BD-41FF-AC27-B86D47E655DF';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ColumnProvenance */
UPDATE __mj."EntityField" SET "Category" = 'Schema and Features', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '7EB7A214-D268-4BA4-97BA-E6D2330EFE95';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.PinnedFeatureVersions */
UPDATE __mj."EntityField" SET "Category" = 'Schema and Features', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '6A1C77E5-A702-4ED3-89B5-D9495F9B85A2';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowsRead */
UPDATE __mj."EntityField" SET "Category" = 'Row Metrics and Statistics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FCD672B4-13C6-4B49-A7A3-3CE86A1C135C';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ReadComplete */
UPDATE __mj."EntityField" SET "Category" = 'Row Metrics and Statistics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8DBCA900-1A90-4D1B-B7CB-A95353041A58';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.CensoredRowsExcluded */
UPDATE __mj."EntityField" SET "Category" = 'Exclusions and Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C5447115-F0D9-4E3E-A5F7-99B604CAE9D7';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.LabelKnownRowsExcluded */
UPDATE __mj."EntityField" SET "Category" = 'Exclusions and Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F8A7611F-6332-465B-B2BF-7FF6BBD329A9';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.EmptyLabelRowsExcluded */
UPDATE __mj."EntityField" SET "Category" = 'Exclusions and Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C2C36E97-D80C-47A6-B1BE-52E9D9253A13';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.UncoveredHistoryRowsExcluded */
UPDATE __mj."EntityField" SET "Category" = 'Exclusions and Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '19F7A467-C851-4C98-843B-1235819DA36F';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.DuplicateRowsRemoved */
UPDATE __mj."EntityField" SET "Category" = 'Exclusions and Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8F0B40EF-42CF-4A22-B77B-320E5AAB0542';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ClassBalance */
UPDATE __mj."EntityField" SET "Category" = 'Exclusions and Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '6A9FECD0-FB18-4F21-A6F8-F5F48ED17203';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.DataCutoff */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8FAA92F0-8F7C-4739-A762-9489835D71B9';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.AssemblyCodeVersion */
UPDATE __mj."EntityField" SET "Category" = 'Snapshot Identity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DBC13174-3A1D-4F40-A5D3-95D40FBB2819';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '68F17137-6405-460D-9796-60785602A4D3';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'ABFCFA3F-1315-4DF2-AC8A-E710F99823C2';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.Pipeline */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E3CB7FF9-EF00-4328-91B5-1636E0FE28A2';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.PredictionUnit */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3209C303-58D1-4664-92E5-25346FE4C7C8';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.EvaluationProtocol */
UPDATE __mj."EntityField" SET "Category" = 'Configuration References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8DA58777-5274-49B8-B769-6B0414DE7778';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.StorageProvider */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '29B6E621-51F1-440C-8EF9-591E60AD2C8B';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.MatrixFile */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E9B5C93D-9BE8-4DC8-A6CA-1FC07AF0C9C1';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.RowManifestFile */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AD7D26EC-0D16-4859-A709-E65DEDB0336E';
/* UPDATE Entity Field Category Info MJ: ML Training Snapshots.ProvenanceFile */
UPDATE __mj."EntityField" SET "Category" = 'File Storage Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '932935B3-E8AB-43B8-A9F8-1BEE61F1F8C9';

/* Set entity icon to fa fa-database */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-database', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7a2a7e43-c12c-5b20-9c72-10509bd216b8', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5aaf856e-03ac-5309-8a7a-9f4576696e17', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'FieldCategoryIcons', '{
  "Configuration References": "fa fa-cogs",
  "Exclusions and Metrics": "fa fa-filter",
  "File Storage Metadata": "fa fa-file-archive",
  "Row Metrics and Statistics": "fa fa-list-ol",
  "Schema and Features": "fa fa-table",
  "Snapshot Identity": "fa fa-fingerprint"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6';

/* Set categories for 21 fields */
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F4CAAED2-29AD-4AE4-9D27-662406E3876F';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.LineageRootID */
UPDATE __mj."EntityField" SET "Category" = 'Lineage and Versioning', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D4C1CA8F-92F6-4D1F-91B8-7989C68A2FF3';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.Version */
UPDATE __mj."EntityField" SET "Category" = 'Lineage and Versioning', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '75BD5E78-48BB-44D8-8B1F-CFB4EDFEF309';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelVersion */
UPDATE __mj."EntityField" SET "Category" = 'Lineage and Versioning', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1A414A7A-B576-49C5-917C-5586FD9E645F';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.LineageRoot */
UPDATE __mj."EntityField" SET "Category" = 'Lineage and Versioning', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2659C3FC-5C4A-45A1-8503-EA35E535DC86';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.Name */
UPDATE __mj."EntityField" SET "Category" = 'Prediction Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '367EF229-E773-4EFF-9050-D5D864329C7B';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.Description */
UPDATE __mj."EntityField" SET "Category" = 'Prediction Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '40751F77-3489-4BB1-A007-C3BF4F909221';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.TaskType */
UPDATE __mj."EntityField" SET "Category" = 'Prediction Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '6DA08AF0-F2F5-4294-ABE1-F2DE92A4278C';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.UnitRows */
UPDATE __mj."EntityField" SET "Category" = 'Data and Feature Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'D3AAFFD7-39E7-4318-9C7E-78D1B274CF2E';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.GroupKey */
UPDATE __mj."EntityField" SET "Category" = 'Data and Feature Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E6E6F6EE-8E03-44CD-91D3-F0A699D94A23';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.TemporalSpec */
UPDATE __mj."EntityField" SET "Category" = 'Data and Feature Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '599B6550-9744-441D-8D28-25DC8505914F';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelRule */
UPDATE __mj."EntityField" SET "Category" = 'Outcome and Labeling', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'B1701DB5-91DC-477C-8E8A-8191F18F3945';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelWindowDays */
UPDATE __mj."EntityField" SET "Category" = 'Outcome and Labeling', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '497D0450-7569-4AE2-AC34-2110C4CCE6FC';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.LabelGapDays */
UPDATE __mj."EntityField" SET "Category" = 'Outcome and Labeling', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E6D5425D-6E89-42DB-A089-E6020B969496';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.Censoring */
UPDATE __mj."EntityField" SET "Category" = 'Outcome and Labeling', "GeneratedFormSection" = 'Category', "DisplayName" = 'Censoring Rule', "ExtendedType" = 'JSON'
WHERE
  "ID" = '6E84BDAE-C220-42F7-9716-AE7DA85BB277';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.ChangeHistoryPolicy */
UPDATE __mj."EntityField" SET "Category" = 'Model Execution and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '02F695D3-28BB-414A-876D-37B0AD1DCAEB';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.DecisionSpec */
UPDATE __mj."EntityField" SET "Category" = 'Model Execution and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'B01E7DA7-5AA2-43E0-8414-47F2158F208D';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.IncumbentHeuristic */
UPDATE __mj."EntityField" SET "Category" = 'Model Execution and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '743899B5-546D-47B9-AA4B-28623BC2885E';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.AuthoredBy */
UPDATE __mj."EntityField" SET "Category" = 'Model Execution and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'C44C7B71-E487-4C32-A7FC-12A714715BBD';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '247807BD-B812-4DE5-9D17-49788C5E7B29';
/* UPDATE Entity Field Category Info MJ: ML Prediction Units.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A565F607-69D9-4D1E-B326-5067CD19DD8B';

/* Set entity icon to fa fa-chart-line */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-chart-line', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('65441f16-8ce2-51b7-846d-c0518ad1e20a', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c912dfe4-1540-534e-8e0e-2e8d1229e257', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'FieldCategoryIcons', '{
  "Data and Feature Configuration": "fa fa-database",
  "Lineage and Versioning": "fa fa-code-branch",
  "Model Execution and Governance": "fa fa-cogs",
  "Outcome and Labeling": "fa fa-tags",
  "Prediction Definition": "fa fa-bullseye",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6';

/* Set categories for 31 fields */
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.ID */
UPDATE __mj."EntityField" SET "Category" = 'Basic Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1B8C4AD9-59E6-421E-B28D-C2C60D8C9AEF';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.LineageRootID */
UPDATE __mj."EntityField" SET "Category" = 'Basic Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CC21F4D2-0D46-44B0-8FE4-C16DFDF4C522';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Version */
UPDATE __mj."EntityField" SET "Category" = 'Basic Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E16B9172-338C-4D7A-8DFE-F9FA06CF4DB8';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Name */
UPDATE __mj."EntityField" SET "Category" = 'Basic Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D44848C6-9CAB-4C17-A4E8-27EDA46692D6';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Description */
UPDATE __mj."EntityField" SET "Category" = 'Basic Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B1985F44-5F4F-4831-BB96-3470CE296583';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.LineageRoot */
UPDATE __mj."EntityField" SET "Category" = 'Basic Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F4D9A19F-C0F1-4A25-B2C3-A8328B332C0D';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Holdout */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Splits', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'D3C7BAEF-DF62-4355-A7ED-CDE904B888D5';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.InnerValidation */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Splits', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '968AFD18-C8A9-41C6-A03C-4D284033BD6B';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Seed */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Splits', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A0E507E5-ACC9-4D6B-AB4A-49FE2BE84B96';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.HoldoutAccessBudget */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Splits', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2153C8C2-8DFF-422C-9759-8EE80F53F0AE';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.PrimaryScore */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '18636BB2-A8BE-4A84-9C8F-211A35FF4D00';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.SecondaryMetrics */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '252225D0-F65A-453D-9390-2C2C7DA687A2';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Baselines */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '89230037-5A26-4441-911F-2B9FAE0369B9';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Calibration */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'E170CD66-F89B-4403-8538-E80E3757DF23';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Resampling */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '7B16E14F-39A2-4405-B612-AEDB8FB5A4E5';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Intervals */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'E12EF381-23CB-44F0-9234-27AD4854A41E';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.PredictionIntervals */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '32743338-0281-4A24-BA0A-4EF8D5281866';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.ResidualDiagnostics */
UPDATE __mj."EntityField" SET "Category" = 'Metrics and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '0AE6C0A7-5B72-4C3A-A080-154BE17DA485';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Promotion */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '53A6B363-0C31-4A02-8098-7997FFA6773B';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.AllowedOutcomes */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'F849C1E5-2A72-459C-9C5B-65BF039E73BC';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.LeakageAudit */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '30B68CF1-3409-453A-98C2-E6C2255AC836';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Exclusions */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'F3F5A513-4467-46A9-865E-1BEC926439F1';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Slices */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'FB620DF0-FC76-4D02-B7C8-1BFA3C19770C';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.RetrainTriggers */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'ACBD66B0-1219-4441-A7C0-0F82808E40F7';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.SearchStrategy */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '2B05F9BD-D5A9-4852-B5B1-48C58796AE02';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.Budgets */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '2AF1A4EE-1133-458C-AD90-AD95DD2F1043';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.MinMinorityClassRows */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5A26CA06-0E44-4CE3-AB6D-C7541002EED3';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.GuardFieldsEditableBy */
UPDATE __mj."EntityField" SET "Category" = 'Guards and Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'ECF141B1-F1F5-4DB6-BF75-CCC11817C2D8';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.AuthoredBy */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '7937B713-FF95-424F-A2E6-553E2B545B21';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E1B8FC2B-3BD5-420A-A8D6-6AF5BECB306E';
/* UPDATE Entity Field Category Info MJ: ML Evaluation Protocols.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '59F85AC9-0097-463C-B91B-6D74777C5A55';

/* Set entity icon to fa fa-sliders-h */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-sliders-h', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fc0cdb71-ad41-564d-b1c9-7ca29ba55f9b', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'FieldCategoryInfo', '{
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
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('550557b9-1140-5c42-a744-9d339bb2f2d4', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'FieldCategoryIcons', '{
  "Basic Information": "fa fa-info-circle",
  "Guards and Governance": "fa fa-shield-alt",
  "Metrics and Evaluation": "fa fa-chart-line",
  "System Metadata": "fa fa-cog",
  "Validation and Splits": "fa fa-random"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c79e2fe7-bd1f-4262-a732-ec3026b6f789' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'TrainingSnapshot')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c79e2fe7-bd1f-4262-a732-ec3026b6f789', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2'), 'TrainingSnapshot', 'Training Snapshot', NULL, 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: ML Training Runs.TrainingSnapshot */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C79E2FE7-BD1F-4262-A732-EC3026B6F789';

/* SQL text to update entity field value sequence and source */
UPDATE __mj."EntityFieldValue" SET "Source" = 'Check'
WHERE
  "ID" = '9CC0ABEB-8746-4D07-8802-FAC33B262693';

/* SQL text to update entity field value sequence and source */
UPDATE __mj."EntityFieldValue" SET "Source" = 'Check'
WHERE
  "ID" = '87A6FD51-4138-4C6C-9999-E19B6B867AD6';

/* SQL text to update entity field value sequence and source */
UPDATE __mj."EntityFieldValue" SET "Source" = 'Check'
WHERE
  "ID" = '6B87DB2B-B65C-4523-B4E2-F574EB9FAFDF';

/* EntityField metadata CodeGen derives for the regenerated views (label fields read as nullable through LEFT OUTER joins) */
/* MJ: ML Training Snapshots.Pipeline: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = 'E3CB7FF9-EF00-4328-91B5-1636E0FE28A2';
/* MJ: ML Training Snapshots.ProvenanceFile: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '932935B3-E8AB-43B8-A9F8-1BEE61F1F8C9';
/* MJ: ML Training Snapshots.MatrixFile: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = 'E9B5C93D-9BE8-4DC8-A6CA-1FC07AF0C9C1';
/* MJ: Feature Values.RecordProcess: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '6FB9CC06-9E1A-4309-A119-20D5A6DFBECC';
/* MJ: ML Training Snapshots.PredictionUnit: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '3209C303-58D1-4664-92E5-25346FE4C7C8';
/* MJ: ML Training Pipelines.TargetEntity: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA';
/* MJ: ML Training Snapshots.StorageProvider: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '29B6E621-51F1-440C-8EF9-591E60AD2C8B';
/* MJ: ML Training Runs.Pipeline: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '3C939B88-8A7F-49C5-9567-9E04C7C656DC';
/* MJ: ML Evaluation Protocols.LineageRoot: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = 'F4D9A19F-C0F1-4A25-B2C3-A8328B332C0D';
/* MJ: Feature Values.Entity: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '0E527A97-32CC-495B-9722-CBAD72F46295';
/* MJ: ML Training Pipelines.Algorithm: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '9A40BAC8-DB50-418F-9422-E24C1935E0DA';
/* MJ: ML Training Snapshots.RowManifestFile: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = 'AD7D26EC-0D16-4859-A709-E65DEDB0336E';
/* MJ: ML Prediction Units.LineageRoot: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = '2659C3FC-5C4A-45A1-8503-EA35E535DC86';
/* MJ: ML Training Runs.Algorithm: AllowsNull 0→1 */
UPDATE __mj."EntityField" SET "AllowsNull" = TRUE
WHERE
  "ID" = 'E01BA18E-8697-4ECC-9437-F567DAC85155';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_record_process_id"
    ON "__mj"."FeatureValue" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_entity_id"
    ON "__mj"."FeatureValue" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_prompt_id"
    ON "__mj"."FeatureValue" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_process_run_id"
    ON "__mj"."FeatureValue" ("ProcessRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_process_run_detail_id"
    ON "__mj"."FeatureValue" ("ProcessRunDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_feature_value_cache_id"
    ON "__mj"."FeatureValue" ("FeatureValueCacheID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_ai_model_id"
    ON "__mj"."FeatureValue" ("AIModelID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: vwFeatureValues
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Feature Values
-----               SCHEMA:      __mj
-----               BASE TABLE:  FeatureValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwFeatureValues"
AS
SELECT
    f.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_EntityID."Name" AS "Entity",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJProcessRunDetail_ProcessRunDetailID."RecordID" AS "ProcessRunDetail",
    MJFeatureValueCache_FeatureValueCacheID."KeyDisplay" AS "FeatureValueCache",
    MJAIModel_AIModelID."Name" AS "AIModel"
FROM
    "__mj"."FeatureValue" AS f
LEFT OUTER JOIN
    "__mj"."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "f"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "f"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "f"."PromptID" = MJAIPrompt_PromptID."ID"
LEFT OUTER JOIN
    "__mj"."ProcessRunDetail" AS MJProcessRunDetail_ProcessRunDetailID
  ON
    "f"."ProcessRunDetailID" = MJProcessRunDetail_ProcessRunDetailID."ID"
LEFT OUTER JOIN
    "__mj"."FeatureValueCache" AS MJFeatureValueCache_FeatureValueCacheID
  ON
    "f"."FeatureValueCacheID" = MJFeatureValueCache_FeatureValueCacheID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_AIModelID
  ON
    "f"."AIModelID" = MJAIModel_AIModelID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwFeatureValues'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwFeatureValues'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwFeatureValues" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwFeatureValues" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwFeatureValues" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwFeatureValues" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: spCreateFeatureValue
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR FeatureValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateFeatureValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateFeatureValue"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(900) DEFAULT NULL,
    p_featurename varchar(255) DEFAULT NULL,
    p_valuetext_clear boolean DEFAULT false,
    p_valuetext TEXT DEFAULT NULL,
    p_valuenumeric_clear boolean DEFAULT false,
    p_valuenumeric float(53) DEFAULT NULL,
    p_valuedate_clear boolean DEFAULT false,
    p_valuedate TIMESTAMPTZ DEFAULT NULL,
    p_valueboolean_clear boolean DEFAULT false,
    p_valueboolean BOOLEAN DEFAULT NULL,
    p_valuejson_clear boolean DEFAULT false,
    p_valuejson TEXT DEFAULT NULL,
    p_reasoning_clear boolean DEFAULT false,
    p_reasoning TEXT DEFAULT NULL,
    p_confidence_clear boolean DEFAULT false,
    p_confidence float(53) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash_clear boolean DEFAULT false,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_constrainthash_clear boolean DEFAULT false,
    p_constrainthash varchar(64) DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_processrundetailid_clear boolean DEFAULT false,
    p_processrundetailid UUID DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL,
    p_featurevaluecacheid_clear boolean DEFAULT false,
    p_featurevaluecacheid UUID DEFAULT NULL,
    p_computedat TIMESTAMPTZ DEFAULT NULL,
    p_pipelineversion_clear boolean DEFAULT false,
    p_pipelineversion int DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL,
    p_inputhash_clear boolean DEFAULT false,
    p_inputhash varchar(64) DEFAULT NULL,
    p_valuekeyhash_clear boolean DEFAULT false,
    p_valuekeyhash varchar(64) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_effectiveasof_clear boolean DEFAULT false,
    p_effectiveasof TIMESTAMPTZ DEFAULT NULL,
    p_inputasof_clear boolean DEFAULT false,
    p_inputasof TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeatureValues" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."FeatureValue"
        (
            "ID",
            "RecordProcessID",
                "EntityID",
                "RecordID",
                "FeatureName",
                "ValueText",
                "ValueNumeric",
                "ValueDate",
                "ValueBoolean",
                "ValueJSON",
                "Reasoning",
                "Confidence",
                "PromptID",
                "PromptVersionHash",
                "ConstraintHash",
                "ProcessRunID",
                "ProcessRunDetailID",
                "AIPromptRunID",
                "FeatureValueCacheID",
                "ComputedAt",
                "PipelineVersion",
                "AIModelID",
                "ParametersHash",
                "InputHash",
                "ValueKeyHash",
                "Source",
                "EffectiveAsOf",
                "InputAsOf"
        )
    VALUES
        (
            v_new_id,
            p_recordprocessid,
                p_entityid,
                p_recordid,
                p_featurename,
                CASE WHEN p_valuetext_clear = true THEN NULL ELSE COALESCE(p_valuetext, NULL) END,
                CASE WHEN p_valuenumeric_clear = true THEN NULL ELSE COALESCE(p_valuenumeric, NULL) END,
                CASE WHEN p_valuedate_clear = true THEN NULL ELSE COALESCE(p_valuedate, NULL) END,
                CASE WHEN p_valueboolean_clear = true THEN NULL ELSE COALESCE(p_valueboolean, NULL) END,
                CASE WHEN p_valuejson_clear = true THEN NULL ELSE COALESCE(p_valuejson, NULL) END,
                CASE WHEN p_reasoning_clear = true THEN NULL ELSE COALESCE(p_reasoning, NULL) END,
                CASE WHEN p_confidence_clear = true THEN NULL ELSE COALESCE(p_confidence, NULL) END,
                CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, NULL) END,
                CASE WHEN p_promptversionhash_clear = true THEN NULL ELSE COALESCE(p_promptversionhash, NULL) END,
                CASE WHEN p_constrainthash_clear = true THEN NULL ELSE COALESCE(p_constrainthash, NULL) END,
                CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, NULL) END,
                CASE WHEN p_processrundetailid_clear = true THEN NULL ELSE COALESCE(p_processrundetailid, NULL) END,
                CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, NULL) END,
                CASE WHEN p_featurevaluecacheid_clear = true THEN NULL ELSE COALESCE(p_featurevaluecacheid, NULL) END,
                COALESCE(p_computedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_pipelineversion_clear = true THEN NULL ELSE COALESCE(p_pipelineversion, NULL) END,
                CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, NULL) END,
                CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, NULL) END,
                CASE WHEN p_inputhash_clear = true THEN NULL ELSE COALESCE(p_inputhash, NULL) END,
                CASE WHEN p_valuekeyhash_clear = true THEN NULL ELSE COALESCE(p_valuekeyhash, NULL) END,
                COALESCE(p_source, 'Pipeline'),
                CASE WHEN p_effectiveasof_clear = true THEN NULL ELSE COALESCE(p_effectiveasof, NULL) END,
                CASE WHEN p_inputasof_clear = true THEN NULL ELSE COALESCE(p_inputasof, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwFeatureValues"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeatureValue" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateFeatureValue" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: spUpdateFeatureValue
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR FeatureValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateFeatureValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateFeatureValue"(
    p_id UUID,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(900) DEFAULT NULL,
    p_featurename varchar(255) DEFAULT NULL,
    p_valuetext_clear boolean DEFAULT false,
    p_valuetext TEXT DEFAULT NULL,
    p_valuenumeric_clear boolean DEFAULT false,
    p_valuenumeric float(53) DEFAULT NULL,
    p_valuedate_clear boolean DEFAULT false,
    p_valuedate TIMESTAMPTZ DEFAULT NULL,
    p_valueboolean_clear boolean DEFAULT false,
    p_valueboolean BOOLEAN DEFAULT NULL,
    p_valuejson_clear boolean DEFAULT false,
    p_valuejson TEXT DEFAULT NULL,
    p_reasoning_clear boolean DEFAULT false,
    p_reasoning TEXT DEFAULT NULL,
    p_confidence_clear boolean DEFAULT false,
    p_confidence float(53) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_promptversionhash_clear boolean DEFAULT false,
    p_promptversionhash varchar(64) DEFAULT NULL,
    p_constrainthash_clear boolean DEFAULT false,
    p_constrainthash varchar(64) DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_processrundetailid_clear boolean DEFAULT false,
    p_processrundetailid UUID DEFAULT NULL,
    p_aipromptrunid_clear boolean DEFAULT false,
    p_aipromptrunid UUID DEFAULT NULL,
    p_featurevaluecacheid_clear boolean DEFAULT false,
    p_featurevaluecacheid UUID DEFAULT NULL,
    p_computedat TIMESTAMPTZ DEFAULT NULL,
    p_pipelineversion_clear boolean DEFAULT false,
    p_pipelineversion int DEFAULT NULL,
    p_aimodelid_clear boolean DEFAULT false,
    p_aimodelid UUID DEFAULT NULL,
    p_parametershash_clear boolean DEFAULT false,
    p_parametershash varchar(64) DEFAULT NULL,
    p_inputhash_clear boolean DEFAULT false,
    p_inputhash varchar(64) DEFAULT NULL,
    p_valuekeyhash_clear boolean DEFAULT false,
    p_valuekeyhash varchar(64) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_effectiveasof_clear boolean DEFAULT false,
    p_effectiveasof TIMESTAMPTZ DEFAULT NULL,
    p_inputasof_clear boolean DEFAULT false,
    p_inputasof TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwFeatureValues" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."FeatureValue"
    SET
        "RecordProcessID" = COALESCE(p_recordprocessid, "RecordProcessID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "FeatureName" = COALESCE(p_featurename, "FeatureName"),
        "ValueText" = CASE WHEN p_valuetext_clear = true THEN NULL ELSE COALESCE(p_valuetext, "ValueText") END,
        "ValueNumeric" = CASE WHEN p_valuenumeric_clear = true THEN NULL ELSE COALESCE(p_valuenumeric, "ValueNumeric") END,
        "ValueDate" = CASE WHEN p_valuedate_clear = true THEN NULL ELSE COALESCE(p_valuedate, "ValueDate") END,
        "ValueBoolean" = CASE WHEN p_valueboolean_clear = true THEN NULL ELSE COALESCE(p_valueboolean, "ValueBoolean") END,
        "ValueJSON" = CASE WHEN p_valuejson_clear = true THEN NULL ELSE COALESCE(p_valuejson, "ValueJSON") END,
        "Reasoning" = CASE WHEN p_reasoning_clear = true THEN NULL ELSE COALESCE(p_reasoning, "Reasoning") END,
        "Confidence" = CASE WHEN p_confidence_clear = true THEN NULL ELSE COALESCE(p_confidence, "Confidence") END,
        "PromptID" = CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, "PromptID") END,
        "PromptVersionHash" = CASE WHEN p_promptversionhash_clear = true THEN NULL ELSE COALESCE(p_promptversionhash, "PromptVersionHash") END,
        "ConstraintHash" = CASE WHEN p_constrainthash_clear = true THEN NULL ELSE COALESCE(p_constrainthash, "ConstraintHash") END,
        "ProcessRunID" = CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, "ProcessRunID") END,
        "ProcessRunDetailID" = CASE WHEN p_processrundetailid_clear = true THEN NULL ELSE COALESCE(p_processrundetailid, "ProcessRunDetailID") END,
        "AIPromptRunID" = CASE WHEN p_aipromptrunid_clear = true THEN NULL ELSE COALESCE(p_aipromptrunid, "AIPromptRunID") END,
        "FeatureValueCacheID" = CASE WHEN p_featurevaluecacheid_clear = true THEN NULL ELSE COALESCE(p_featurevaluecacheid, "FeatureValueCacheID") END,
        "ComputedAt" = COALESCE(p_computedat, "ComputedAt"),
        "PipelineVersion" = CASE WHEN p_pipelineversion_clear = true THEN NULL ELSE COALESCE(p_pipelineversion, "PipelineVersion") END,
        "AIModelID" = CASE WHEN p_aimodelid_clear = true THEN NULL ELSE COALESCE(p_aimodelid, "AIModelID") END,
        "ParametersHash" = CASE WHEN p_parametershash_clear = true THEN NULL ELSE COALESCE(p_parametershash, "ParametersHash") END,
        "InputHash" = CASE WHEN p_inputhash_clear = true THEN NULL ELSE COALESCE(p_inputhash, "InputHash") END,
        "ValueKeyHash" = CASE WHEN p_valuekeyhash_clear = true THEN NULL ELSE COALESCE(p_valuekeyhash, "ValueKeyHash") END,
        "Source" = COALESCE(p_source, "Source"),
        "EffectiveAsOf" = CASE WHEN p_effectiveasof_clear = true THEN NULL ELSE COALESCE(p_effectiveasof, "EffectiveAsOf") END,
        "InputAsOf" = CASE WHEN p_inputasof_clear = true THEN NULL ELSE COALESCE(p_inputasof, "InputAsOf") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwFeatureValues"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeatureValue" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateFeatureValue" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FeatureValue table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_feature_value"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_feature_value" ON "__mj"."FeatureValue";

CREATE TRIGGER "trg_update_feature_value"
BEFORE UPDATE ON "__mj"."FeatureValue"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_feature_value"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: spDeleteFeatureValue
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR FeatureValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteFeatureValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteFeatureValue"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."FeatureValue"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeatureValue" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteFeatureValue" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Evaluation Protocols
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_evaluation_protocol_lineage_root_id"
    ON "__mj"."MLEvaluationProtocol" ("LineageRootID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Evaluation Protocols
-- Item: vwMLEvaluationProtocols
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Evaluation Protocols
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLEvaluationProtocol
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLEvaluationProtocols"
AS
SELECT
    m.*,
    MJMLEvaluationProtocol_LineageRootID."Name" AS "LineageRoot"
FROM
    "__mj"."MLEvaluationProtocol" AS m
LEFT OUTER JOIN
    "__mj"."MLEvaluationProtocol" AS MJMLEvaluationProtocol_LineageRootID
  ON
    "m"."LineageRootID" = MJMLEvaluationProtocol_LineageRootID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMLEvaluationProtocols'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMLEvaluationProtocols'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLEvaluationProtocols" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMLEvaluationProtocols" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLEvaluationProtocols" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLEvaluationProtocols" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Evaluation Protocols
-- Item: spCreateMLEvaluationProtocol
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLEvaluationProtocol
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLEvaluationProtocol'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLEvaluationProtocol"(
    p_id UUID DEFAULT NULL,
    p_lineagerootid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_holdout TEXT DEFAULT NULL,
    p_innervalidation TEXT DEFAULT NULL,
    p_seed int DEFAULT NULL,
    p_holdoutaccessbudget int DEFAULT NULL,
    p_primaryscore TEXT DEFAULT NULL,
    p_secondarymetrics TEXT DEFAULT NULL,
    p_baselines TEXT DEFAULT NULL,
    p_calibration TEXT DEFAULT NULL,
    p_resampling TEXT DEFAULT NULL,
    p_intervals TEXT DEFAULT NULL,
    p_promotion TEXT DEFAULT NULL,
    p_allowedoutcomes TEXT DEFAULT NULL,
    p_leakageaudit TEXT DEFAULT NULL,
    p_exclusions TEXT DEFAULT NULL,
    p_slices TEXT DEFAULT NULL,
    p_predictionintervals_clear boolean DEFAULT false,
    p_predictionintervals TEXT DEFAULT NULL,
    p_residualdiagnostics_clear boolean DEFAULT false,
    p_residualdiagnostics TEXT DEFAULT NULL,
    p_retraintriggers TEXT DEFAULT NULL,
    p_searchstrategy TEXT DEFAULT NULL,
    p_budgets TEXT DEFAULT NULL,
    p_minminorityclassrows int DEFAULT NULL,
    p_guardfieldseditableby varchar(20) DEFAULT NULL,
    p_authoredby TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLEvaluationProtocols" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLEvaluationProtocol"
        (
            "ID",
            "LineageRootID",
                "Version",
                "Name",
                "Description",
                "Holdout",
                "InnerValidation",
                "Seed",
                "HoldoutAccessBudget",
                "PrimaryScore",
                "SecondaryMetrics",
                "Baselines",
                "Calibration",
                "Resampling",
                "Intervals",
                "Promotion",
                "AllowedOutcomes",
                "LeakageAudit",
                "Exclusions",
                "Slices",
                "PredictionIntervals",
                "ResidualDiagnostics",
                "RetrainTriggers",
                "SearchStrategy",
                "Budgets",
                "MinMinorityClassRows",
                "GuardFieldsEditableBy",
                "AuthoredBy"
        )
    VALUES
        (
            v_new_id,
            p_lineagerootid,
                p_version,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_holdout,
                p_innervalidation,
                p_seed,
                COALESCE(p_holdoutaccessbudget, 1),
                p_primaryscore,
                p_secondarymetrics,
                p_baselines,
                p_calibration,
                p_resampling,
                p_intervals,
                p_promotion,
                p_allowedoutcomes,
                p_leakageaudit,
                p_exclusions,
                p_slices,
                CASE WHEN p_predictionintervals_clear = true THEN NULL ELSE COALESCE(p_predictionintervals, NULL) END,
                CASE WHEN p_residualdiagnostics_clear = true THEN NULL ELSE COALESCE(p_residualdiagnostics, NULL) END,
                p_retraintriggers,
                p_searchstrategy,
                p_budgets,
                COALESCE(p_minminorityclassrows, 20),
                COALESCE(p_guardfieldseditableby, 'non-agent'),
                p_authoredby
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLEvaluationProtocols"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLEvaluationProtocol" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLEvaluationProtocol" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Evaluation Protocols
-- Item: spUpdateMLEvaluationProtocol
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLEvaluationProtocol
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLEvaluationProtocol'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLEvaluationProtocol"(
    p_id UUID,
    p_lineagerootid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_holdout TEXT DEFAULT NULL,
    p_innervalidation TEXT DEFAULT NULL,
    p_seed int DEFAULT NULL,
    p_holdoutaccessbudget int DEFAULT NULL,
    p_primaryscore TEXT DEFAULT NULL,
    p_secondarymetrics TEXT DEFAULT NULL,
    p_baselines TEXT DEFAULT NULL,
    p_calibration TEXT DEFAULT NULL,
    p_resampling TEXT DEFAULT NULL,
    p_intervals TEXT DEFAULT NULL,
    p_promotion TEXT DEFAULT NULL,
    p_allowedoutcomes TEXT DEFAULT NULL,
    p_leakageaudit TEXT DEFAULT NULL,
    p_exclusions TEXT DEFAULT NULL,
    p_slices TEXT DEFAULT NULL,
    p_predictionintervals_clear boolean DEFAULT false,
    p_predictionintervals TEXT DEFAULT NULL,
    p_residualdiagnostics_clear boolean DEFAULT false,
    p_residualdiagnostics TEXT DEFAULT NULL,
    p_retraintriggers TEXT DEFAULT NULL,
    p_searchstrategy TEXT DEFAULT NULL,
    p_budgets TEXT DEFAULT NULL,
    p_minminorityclassrows int DEFAULT NULL,
    p_guardfieldseditableby varchar(20) DEFAULT NULL,
    p_authoredby TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLEvaluationProtocols" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLEvaluationProtocol"
    SET
        "LineageRootID" = COALESCE(p_lineagerootid, "LineageRootID"),
        "Version" = COALESCE(p_version, "Version"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Holdout" = COALESCE(p_holdout, "Holdout"),
        "InnerValidation" = COALESCE(p_innervalidation, "InnerValidation"),
        "Seed" = COALESCE(p_seed, "Seed"),
        "HoldoutAccessBudget" = COALESCE(p_holdoutaccessbudget, "HoldoutAccessBudget"),
        "PrimaryScore" = COALESCE(p_primaryscore, "PrimaryScore"),
        "SecondaryMetrics" = COALESCE(p_secondarymetrics, "SecondaryMetrics"),
        "Baselines" = COALESCE(p_baselines, "Baselines"),
        "Calibration" = COALESCE(p_calibration, "Calibration"),
        "Resampling" = COALESCE(p_resampling, "Resampling"),
        "Intervals" = COALESCE(p_intervals, "Intervals"),
        "Promotion" = COALESCE(p_promotion, "Promotion"),
        "AllowedOutcomes" = COALESCE(p_allowedoutcomes, "AllowedOutcomes"),
        "LeakageAudit" = COALESCE(p_leakageaudit, "LeakageAudit"),
        "Exclusions" = COALESCE(p_exclusions, "Exclusions"),
        "Slices" = COALESCE(p_slices, "Slices"),
        "PredictionIntervals" = CASE WHEN p_predictionintervals_clear = true THEN NULL ELSE COALESCE(p_predictionintervals, "PredictionIntervals") END,
        "ResidualDiagnostics" = CASE WHEN p_residualdiagnostics_clear = true THEN NULL ELSE COALESCE(p_residualdiagnostics, "ResidualDiagnostics") END,
        "RetrainTriggers" = COALESCE(p_retraintriggers, "RetrainTriggers"),
        "SearchStrategy" = COALESCE(p_searchstrategy, "SearchStrategy"),
        "Budgets" = COALESCE(p_budgets, "Budgets"),
        "MinMinorityClassRows" = COALESCE(p_minminorityclassrows, "MinMinorityClassRows"),
        "GuardFieldsEditableBy" = COALESCE(p_guardfieldseditableby, "GuardFieldsEditableBy"),
        "AuthoredBy" = COALESCE(p_authoredby, "AuthoredBy")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLEvaluationProtocols"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLEvaluationProtocol" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLEvaluationProtocol" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLEvaluationProtocol table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_evaluation_protocol"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_evaluation_protocol" ON "__mj"."MLEvaluationProtocol";

CREATE TRIGGER "trg_update_ml_evaluation_protocol"
BEFORE UPDATE ON "__mj"."MLEvaluationProtocol"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_evaluation_protocol"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Evaluation Protocols
-- Item: spDeleteMLEvaluationProtocol
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLEvaluationProtocol
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLEvaluationProtocol'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLEvaluationProtocol"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLEvaluationProtocol"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLEvaluationProtocol" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLEvaluationProtocol" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Prediction Units
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_prediction_unit_lineage_root_id"
    ON "__mj"."MLPredictionUnit" ("LineageRootID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Prediction Units
-- Item: vwMLPredictionUnits
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Prediction Units
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLPredictionUnit
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLPredictionUnits"
AS
SELECT
    m.*,
    MJMLPredictionUnit_LineageRootID."Name" AS "LineageRoot"
FROM
    "__mj"."MLPredictionUnit" AS m
LEFT OUTER JOIN
    "__mj"."MLPredictionUnit" AS MJMLPredictionUnit_LineageRootID
  ON
    "m"."LineageRootID" = MJMLPredictionUnit_LineageRootID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMLPredictionUnits'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMLPredictionUnits'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLPredictionUnits" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMLPredictionUnits" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLPredictionUnits" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLPredictionUnits" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Prediction Units
-- Item: spCreateMLPredictionUnit
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLPredictionUnit
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLPredictionUnit'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLPredictionUnit"(
    p_id UUID DEFAULT NULL,
    p_lineagerootid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_unitrows TEXT DEFAULT NULL,
    p_labelrule TEXT DEFAULT NULL,
    p_labelwindowdays int DEFAULT NULL,
    p_labelgapdays int DEFAULT NULL,
    p_tasktype TEXT DEFAULT NULL,
    p_labelversion int DEFAULT NULL,
    p_censoring TEXT DEFAULT NULL,
    p_changehistorypolicy TEXT DEFAULT NULL,
    p_groupkey_clear boolean DEFAULT false,
    p_groupkey varchar(255) DEFAULT NULL,
    p_temporalspec_clear boolean DEFAULT false,
    p_temporalspec TEXT DEFAULT NULL,
    p_decisionspec TEXT DEFAULT NULL,
    p_incumbentheuristic TEXT DEFAULT NULL,
    p_authoredby TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLPredictionUnits" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLPredictionUnit"
        (
            "ID",
            "LineageRootID",
                "Version",
                "Name",
                "Description",
                "UnitRows",
                "LabelRule",
                "LabelWindowDays",
                "LabelGapDays",
                "TaskType",
                "LabelVersion",
                "Censoring",
                "ChangeHistoryPolicy",
                "GroupKey",
                "TemporalSpec",
                "DecisionSpec",
                "IncumbentHeuristic",
                "AuthoredBy"
        )
    VALUES
        (
            v_new_id,
            p_lineagerootid,
                p_version,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_unitrows,
                p_labelrule,
                p_labelwindowdays,
                COALESCE(p_labelgapdays, 0),
                p_tasktype,
                p_labelversion,
                p_censoring,
                p_changehistorypolicy,
                CASE WHEN p_groupkey_clear = true THEN NULL ELSE COALESCE(p_groupkey, NULL) END,
                CASE WHEN p_temporalspec_clear = true THEN NULL ELSE COALESCE(p_temporalspec, NULL) END,
                p_decisionspec,
                p_incumbentheuristic,
                p_authoredby
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLPredictionUnits"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLPredictionUnit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLPredictionUnit" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Prediction Units
-- Item: spUpdateMLPredictionUnit
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLPredictionUnit
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLPredictionUnit'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLPredictionUnit"(
    p_id UUID,
    p_lineagerootid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_unitrows TEXT DEFAULT NULL,
    p_labelrule TEXT DEFAULT NULL,
    p_labelwindowdays int DEFAULT NULL,
    p_labelgapdays int DEFAULT NULL,
    p_tasktype TEXT DEFAULT NULL,
    p_labelversion int DEFAULT NULL,
    p_censoring TEXT DEFAULT NULL,
    p_changehistorypolicy TEXT DEFAULT NULL,
    p_groupkey_clear boolean DEFAULT false,
    p_groupkey varchar(255) DEFAULT NULL,
    p_temporalspec_clear boolean DEFAULT false,
    p_temporalspec TEXT DEFAULT NULL,
    p_decisionspec TEXT DEFAULT NULL,
    p_incumbentheuristic TEXT DEFAULT NULL,
    p_authoredby TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLPredictionUnits" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLPredictionUnit"
    SET
        "LineageRootID" = COALESCE(p_lineagerootid, "LineageRootID"),
        "Version" = COALESCE(p_version, "Version"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "UnitRows" = COALESCE(p_unitrows, "UnitRows"),
        "LabelRule" = COALESCE(p_labelrule, "LabelRule"),
        "LabelWindowDays" = COALESCE(p_labelwindowdays, "LabelWindowDays"),
        "LabelGapDays" = COALESCE(p_labelgapdays, "LabelGapDays"),
        "TaskType" = COALESCE(p_tasktype, "TaskType"),
        "LabelVersion" = COALESCE(p_labelversion, "LabelVersion"),
        "Censoring" = COALESCE(p_censoring, "Censoring"),
        "ChangeHistoryPolicy" = COALESCE(p_changehistorypolicy, "ChangeHistoryPolicy"),
        "GroupKey" = CASE WHEN p_groupkey_clear = true THEN NULL ELSE COALESCE(p_groupkey, "GroupKey") END,
        "TemporalSpec" = CASE WHEN p_temporalspec_clear = true THEN NULL ELSE COALESCE(p_temporalspec, "TemporalSpec") END,
        "DecisionSpec" = COALESCE(p_decisionspec, "DecisionSpec"),
        "IncumbentHeuristic" = COALESCE(p_incumbentheuristic, "IncumbentHeuristic"),
        "AuthoredBy" = COALESCE(p_authoredby, "AuthoredBy")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLPredictionUnits"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLPredictionUnit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLPredictionUnit" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLPredictionUnit table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_prediction_unit"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_prediction_unit" ON "__mj"."MLPredictionUnit";

CREATE TRIGGER "trg_update_ml_prediction_unit"
BEFORE UPDATE ON "__mj"."MLPredictionUnit"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_prediction_unit"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Prediction Units
-- Item: spDeleteMLPredictionUnit
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLPredictionUnit
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLPredictionUnit'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLPredictionUnit"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLPredictionUnit"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLPredictionUnit" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLPredictionUnit" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Pipelines
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_pipeline_target_entity_id"
    ON "__mj"."MLTrainingPipeline" ("TargetEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_pipeline_algorithm_id"
    ON "__mj"."MLTrainingPipeline" ("AlgorithmID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_pipeline_prediction_unit_id"
    ON "__mj"."MLTrainingPipeline" ("PredictionUnitID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_pipeline_evaluation_protocol_id"
    ON "__mj"."MLTrainingPipeline" ("EvaluationProtocolID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Pipelines
-- Item: vwMLTrainingPipelines
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Pipelines
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLTrainingPipeline
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLTrainingPipelines"
AS
SELECT
    m.*,
    MJEntity_TargetEntityID."Name" AS "TargetEntity",
    MJMLAlgorithm_AlgorithmID."Name" AS "Algorithm",
    MJMLPredictionUnit_PredictionUnitID."Name" AS "PredictionUnit",
    MJMLEvaluationProtocol_EvaluationProtocolID."Name" AS "EvaluationProtocol"
FROM
    "__mj"."MLTrainingPipeline" AS m
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_TargetEntityID
  ON
    "m"."TargetEntityID" = MJEntity_TargetEntityID."ID"
LEFT OUTER JOIN
    "__mj"."MLAlgorithm" AS MJMLAlgorithm_AlgorithmID
  ON
    "m"."AlgorithmID" = MJMLAlgorithm_AlgorithmID."ID"
LEFT OUTER JOIN
    "__mj"."MLPredictionUnit" AS MJMLPredictionUnit_PredictionUnitID
  ON
    "m"."PredictionUnitID" = MJMLPredictionUnit_PredictionUnitID."ID"
LEFT OUTER JOIN
    "__mj"."MLEvaluationProtocol" AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    "m"."EvaluationProtocolID" = MJMLEvaluationProtocol_EvaluationProtocolID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMLTrainingPipelines'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMLTrainingPipelines'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLTrainingPipelines" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMLTrainingPipelines" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLTrainingPipelines" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwMLTrainingPipelines" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Pipelines
-- Item: spCreateMLTrainingPipeline
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLTrainingPipeline
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLTrainingPipeline'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLTrainingPipeline"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_targetentityid UUID DEFAULT NULL,
    p_targetvariable varchar(500) DEFAULT NULL,
    p_problemtype varchar(20) DEFAULT NULL,
    p_algorithmid UUID DEFAULT NULL,
    p_hyperparameters_clear boolean DEFAULT false,
    p_hyperparameters TEXT DEFAULT NULL,
    p_sourcebindings_clear boolean DEFAULT false,
    p_sourcebindings TEXT DEFAULT NULL,
    p_featuresteps_clear boolean DEFAULT false,
    p_featuresteps TEXT DEFAULT NULL,
    p_asofstrategy_clear boolean DEFAULT false,
    p_asofstrategy TEXT DEFAULT NULL,
    p_leakageguard_clear boolean DEFAULT false,
    p_leakageguard TEXT DEFAULT NULL,
    p_validationstrategy_clear boolean DEFAULT false,
    p_validationstrategy TEXT DEFAULT NULL,
    p_predictionunitid_clear boolean DEFAULT false,
    p_predictionunitid UUID DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLTrainingPipelines" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLTrainingPipeline"
        (
            "ID",
            "Name",
                "Description",
                "Version",
                "Status",
                "TargetEntityID",
                "TargetVariable",
                "ProblemType",
                "AlgorithmID",
                "Hyperparameters",
                "SourceBindings",
                "FeatureSteps",
                "AsOfStrategy",
                "LeakageGuard",
                "ValidationStrategy",
                "PredictionUnitID",
                "EvaluationProtocolID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_version, 1),
                COALESCE(p_status, 'Draft'),
                p_targetentityid,
                p_targetvariable,
                p_problemtype,
                p_algorithmid,
                CASE WHEN p_hyperparameters_clear = true THEN NULL ELSE COALESCE(p_hyperparameters, NULL) END,
                CASE WHEN p_sourcebindings_clear = true THEN NULL ELSE COALESCE(p_sourcebindings, NULL) END,
                CASE WHEN p_featuresteps_clear = true THEN NULL ELSE COALESCE(p_featuresteps, NULL) END,
                CASE WHEN p_asofstrategy_clear = true THEN NULL ELSE COALESCE(p_asofstrategy, NULL) END,
                CASE WHEN p_leakageguard_clear = true THEN NULL ELSE COALESCE(p_leakageguard, NULL) END,
                CASE WHEN p_validationstrategy_clear = true THEN NULL ELSE COALESCE(p_validationstrategy, NULL) END,
                CASE WHEN p_predictionunitid_clear = true THEN NULL ELSE COALESCE(p_predictionunitid, NULL) END,
                CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLTrainingPipelines"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLTrainingPipeline" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLTrainingPipeline" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Pipelines
-- Item: spUpdateMLTrainingPipeline
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLTrainingPipeline
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLTrainingPipeline'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLTrainingPipeline"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_targetentityid UUID DEFAULT NULL,
    p_targetvariable varchar(500) DEFAULT NULL,
    p_problemtype varchar(20) DEFAULT NULL,
    p_algorithmid UUID DEFAULT NULL,
    p_hyperparameters_clear boolean DEFAULT false,
    p_hyperparameters TEXT DEFAULT NULL,
    p_sourcebindings_clear boolean DEFAULT false,
    p_sourcebindings TEXT DEFAULT NULL,
    p_featuresteps_clear boolean DEFAULT false,
    p_featuresteps TEXT DEFAULT NULL,
    p_asofstrategy_clear boolean DEFAULT false,
    p_asofstrategy TEXT DEFAULT NULL,
    p_leakageguard_clear boolean DEFAULT false,
    p_leakageguard TEXT DEFAULT NULL,
    p_validationstrategy_clear boolean DEFAULT false,
    p_validationstrategy TEXT DEFAULT NULL,
    p_predictionunitid_clear boolean DEFAULT false,
    p_predictionunitid UUID DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLTrainingPipelines" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLTrainingPipeline"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Version" = COALESCE(p_version, "Version"),
        "Status" = COALESCE(p_status, "Status"),
        "TargetEntityID" = COALESCE(p_targetentityid, "TargetEntityID"),
        "TargetVariable" = COALESCE(p_targetvariable, "TargetVariable"),
        "ProblemType" = COALESCE(p_problemtype, "ProblemType"),
        "AlgorithmID" = COALESCE(p_algorithmid, "AlgorithmID"),
        "Hyperparameters" = CASE WHEN p_hyperparameters_clear = true THEN NULL ELSE COALESCE(p_hyperparameters, "Hyperparameters") END,
        "SourceBindings" = CASE WHEN p_sourcebindings_clear = true THEN NULL ELSE COALESCE(p_sourcebindings, "SourceBindings") END,
        "FeatureSteps" = CASE WHEN p_featuresteps_clear = true THEN NULL ELSE COALESCE(p_featuresteps, "FeatureSteps") END,
        "AsOfStrategy" = CASE WHEN p_asofstrategy_clear = true THEN NULL ELSE COALESCE(p_asofstrategy, "AsOfStrategy") END,
        "LeakageGuard" = CASE WHEN p_leakageguard_clear = true THEN NULL ELSE COALESCE(p_leakageguard, "LeakageGuard") END,
        "ValidationStrategy" = CASE WHEN p_validationstrategy_clear = true THEN NULL ELSE COALESCE(p_validationstrategy, "ValidationStrategy") END,
        "PredictionUnitID" = CASE WHEN p_predictionunitid_clear = true THEN NULL ELSE COALESCE(p_predictionunitid, "PredictionUnitID") END,
        "EvaluationProtocolID" = CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, "EvaluationProtocolID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLTrainingPipelines"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLTrainingPipeline" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLTrainingPipeline" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingPipeline table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_training_pipeline"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_training_pipeline" ON "__mj"."MLTrainingPipeline";

CREATE TRIGGER "trg_update_ml_training_pipeline"
BEFORE UPDATE ON "__mj"."MLTrainingPipeline"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_training_pipeline"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Pipelines
-- Item: spDeleteMLTrainingPipeline
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLTrainingPipeline
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLTrainingPipeline'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLTrainingPipeline"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLTrainingPipeline"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLTrainingPipeline" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLTrainingPipeline" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_pipeline_id"
    ON "__mj"."MLTrainingRun" ("PipelineID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_resulting_model_id"
    ON "__mj"."MLTrainingRun" ("ResultingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_experiment_session_iteration_i"
    ON "__mj"."MLTrainingRun" ("ExperimentSessionIterationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_algorithm_id"
    ON "__mj"."MLTrainingRun" ("AlgorithmID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_training_snapshot_id"
    ON "__mj"."MLTrainingRun" ("TrainingSnapshotID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_evaluation_protocol_id"
    ON "__mj"."MLTrainingRun" ("EvaluationProtocolID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Runs
-- Item: vwMLTrainingRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLTrainingRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLTrainingRuns"
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID."Name" AS "Pipeline",
    MJExperimentSessionIteration_ExperimentSessionIterationID."Label" AS "ExperimentSessionIteration",
    MJMLAlgorithm_AlgorithmID."Name" AS "Algorithm",
    MJMLTrainingSnapshot_TrainingSnapshotID."ContentHash" AS "TrainingSnapshot",
    MJMLEvaluationProtocol_EvaluationProtocolID."Name" AS "EvaluationProtocol"
FROM
    "__mj"."MLTrainingRun" AS m
LEFT OUTER JOIN
    "__mj"."MLTrainingPipeline" AS MJMLTrainingPipeline_PipelineID
  ON
    "m"."PipelineID" = MJMLTrainingPipeline_PipelineID."ID"
LEFT OUTER JOIN
    "__mj"."ExperimentSessionIteration" AS MJExperimentSessionIteration_ExperimentSessionIterationID
  ON
    "m"."ExperimentSessionIterationID" = MJExperimentSessionIteration_ExperimentSessionIterationID."ID"
LEFT OUTER JOIN
    "__mj"."MLAlgorithm" AS MJMLAlgorithm_AlgorithmID
  ON
    "m"."AlgorithmID" = MJMLAlgorithm_AlgorithmID."ID"
LEFT OUTER JOIN
    "__mj"."MLTrainingSnapshot" AS MJMLTrainingSnapshot_TrainingSnapshotID
  ON
    "m"."TrainingSnapshotID" = MJMLTrainingSnapshot_TrainingSnapshotID."ID"
LEFT OUTER JOIN
    "__mj"."MLEvaluationProtocol" AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    "m"."EvaluationProtocolID" = MJMLEvaluationProtocol_EvaluationProtocolID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMLTrainingRuns'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMLTrainingRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLTrainingRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMLTrainingRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLTrainingRuns" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwMLTrainingRuns" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Runs
-- Item: spCreateMLTrainingRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLTrainingRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLTrainingRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLTrainingRun"(
    p_id UUID DEFAULT NULL,
    p_pipelineid UUID DEFAULT NULL,
    p_resultingmodelid_clear boolean DEFAULT false,
    p_resultingmodelid UUID DEFAULT NULL,
    p_experimentsessioniterationid_clear boolean DEFAULT false,
    p_experimentsessioniterationid UUID DEFAULT NULL,
    p_featuresused_clear boolean DEFAULT false,
    p_featuresused TEXT DEFAULT NULL,
    p_algorithmid UUID DEFAULT NULL,
    p_hyperparameters_clear boolean DEFAULT false,
    p_hyperparameters TEXT DEFAULT NULL,
    p_validationresults_clear boolean DEFAULT false,
    p_validationresults TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_computecost_clear boolean DEFAULT false,
    p_computecost decimal(18, 6) DEFAULT NULL,
    p_tokensused_clear boolean DEFAULT false,
    p_tokensused int DEFAULT NULL,
    p_notes_clear boolean DEFAULT false,
    p_notes TEXT DEFAULT NULL,
    p_trainingsnapshotid_clear boolean DEFAULT false,
    p_trainingsnapshotid UUID DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL,
    p_codeversion_clear boolean DEFAULT false,
    p_codeversion TEXT DEFAULT NULL,
    p_computeseconds_clear boolean DEFAULT false,
    p_computeseconds decimal(18, 3) DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLTrainingRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLTrainingRun"
        (
            "ID",
            "PipelineID",
                "ResultingModelID",
                "ExperimentSessionIterationID",
                "FeaturesUsed",
                "AlgorithmID",
                "Hyperparameters",
                "ValidationResults",
                "Status",
                "StartedAt",
                "CompletedAt",
                "ComputeCost",
                "TokensUsed",
                "Notes",
                "TrainingSnapshotID",
                "EvaluationProtocolID",
                "CodeVersion",
                "ComputeSeconds"
        )
    VALUES
        (
            v_new_id,
            p_pipelineid,
                CASE WHEN p_resultingmodelid_clear = true THEN NULL ELSE COALESCE(p_resultingmodelid, NULL) END,
                CASE WHEN p_experimentsessioniterationid_clear = true THEN NULL ELSE COALESCE(p_experimentsessioniterationid, NULL) END,
                CASE WHEN p_featuresused_clear = true THEN NULL ELSE COALESCE(p_featuresused, NULL) END,
                p_algorithmid,
                CASE WHEN p_hyperparameters_clear = true THEN NULL ELSE COALESCE(p_hyperparameters, NULL) END,
                CASE WHEN p_validationresults_clear = true THEN NULL ELSE COALESCE(p_validationresults, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_computecost_clear = true THEN NULL ELSE COALESCE(p_computecost, NULL) END,
                CASE WHEN p_tokensused_clear = true THEN NULL ELSE COALESCE(p_tokensused, NULL) END,
                CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, NULL) END,
                CASE WHEN p_trainingsnapshotid_clear = true THEN NULL ELSE COALESCE(p_trainingsnapshotid, NULL) END,
                CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, NULL) END,
                CASE WHEN p_codeversion_clear = true THEN NULL ELSE COALESCE(p_codeversion, NULL) END,
                CASE WHEN p_computeseconds_clear = true THEN NULL ELSE COALESCE(p_computeseconds, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLTrainingRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLTrainingRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLTrainingRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Runs
-- Item: spUpdateMLTrainingRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLTrainingRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLTrainingRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLTrainingRun"(
    p_id UUID,
    p_pipelineid UUID DEFAULT NULL,
    p_resultingmodelid_clear boolean DEFAULT false,
    p_resultingmodelid UUID DEFAULT NULL,
    p_experimentsessioniterationid_clear boolean DEFAULT false,
    p_experimentsessioniterationid UUID DEFAULT NULL,
    p_featuresused_clear boolean DEFAULT false,
    p_featuresused TEXT DEFAULT NULL,
    p_algorithmid UUID DEFAULT NULL,
    p_hyperparameters_clear boolean DEFAULT false,
    p_hyperparameters TEXT DEFAULT NULL,
    p_validationresults_clear boolean DEFAULT false,
    p_validationresults TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_computecost_clear boolean DEFAULT false,
    p_computecost decimal(18, 6) DEFAULT NULL,
    p_tokensused_clear boolean DEFAULT false,
    p_tokensused int DEFAULT NULL,
    p_notes_clear boolean DEFAULT false,
    p_notes TEXT DEFAULT NULL,
    p_trainingsnapshotid_clear boolean DEFAULT false,
    p_trainingsnapshotid UUID DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL,
    p_codeversion_clear boolean DEFAULT false,
    p_codeversion TEXT DEFAULT NULL,
    p_computeseconds_clear boolean DEFAULT false,
    p_computeseconds decimal(18, 3) DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLTrainingRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLTrainingRun"
    SET
        "PipelineID" = COALESCE(p_pipelineid, "PipelineID"),
        "ResultingModelID" = CASE WHEN p_resultingmodelid_clear = true THEN NULL ELSE COALESCE(p_resultingmodelid, "ResultingModelID") END,
        "ExperimentSessionIterationID" = CASE WHEN p_experimentsessioniterationid_clear = true THEN NULL ELSE COALESCE(p_experimentsessioniterationid, "ExperimentSessionIterationID") END,
        "FeaturesUsed" = CASE WHEN p_featuresused_clear = true THEN NULL ELSE COALESCE(p_featuresused, "FeaturesUsed") END,
        "AlgorithmID" = COALESCE(p_algorithmid, "AlgorithmID"),
        "Hyperparameters" = CASE WHEN p_hyperparameters_clear = true THEN NULL ELSE COALESCE(p_hyperparameters, "Hyperparameters") END,
        "ValidationResults" = CASE WHEN p_validationresults_clear = true THEN NULL ELSE COALESCE(p_validationresults, "ValidationResults") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "ComputeCost" = CASE WHEN p_computecost_clear = true THEN NULL ELSE COALESCE(p_computecost, "ComputeCost") END,
        "TokensUsed" = CASE WHEN p_tokensused_clear = true THEN NULL ELSE COALESCE(p_tokensused, "TokensUsed") END,
        "Notes" = CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, "Notes") END,
        "TrainingSnapshotID" = CASE WHEN p_trainingsnapshotid_clear = true THEN NULL ELSE COALESCE(p_trainingsnapshotid, "TrainingSnapshotID") END,
        "EvaluationProtocolID" = CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, "EvaluationProtocolID") END,
        "CodeVersion" = CASE WHEN p_codeversion_clear = true THEN NULL ELSE COALESCE(p_codeversion, "CodeVersion") END,
        "ComputeSeconds" = CASE WHEN p_computeseconds_clear = true THEN NULL ELSE COALESCE(p_computeseconds, "ComputeSeconds") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLTrainingRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLTrainingRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLTrainingRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_training_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_training_run" ON "__mj"."MLTrainingRun";

CREATE TRIGGER "trg_update_ml_training_run"
BEFORE UPDATE ON "__mj"."MLTrainingRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_training_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Runs
-- Item: spDeleteMLTrainingRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLTrainingRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLTrainingRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLTrainingRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLTrainingRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLTrainingRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLTrainingRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Snapshots
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_pipeline_id"
    ON "__mj"."MLTrainingSnapshot" ("PipelineID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_prediction_unit_id"
    ON "__mj"."MLTrainingSnapshot" ("PredictionUnitID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_evaluation_protocol_id"
    ON "__mj"."MLTrainingSnapshot" ("EvaluationProtocolID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_storage_provider_id"
    ON "__mj"."MLTrainingSnapshot" ("StorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_matrix_file_id"
    ON "__mj"."MLTrainingSnapshot" ("MatrixFileID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_row_manifest_file_id"
    ON "__mj"."MLTrainingSnapshot" ("RowManifestFileID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_snapshot_provenance_file_id"
    ON "__mj"."MLTrainingSnapshot" ("ProvenanceFileID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Snapshots
-- Item: vwMLTrainingSnapshots
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Snapshots
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLTrainingSnapshot
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLTrainingSnapshots"
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID."Name" AS "Pipeline",
    MJMLPredictionUnit_PredictionUnitID."Name" AS "PredictionUnit",
    MJMLEvaluationProtocol_EvaluationProtocolID."Name" AS "EvaluationProtocol",
    MJFileStorageProvider_StorageProviderID."Name" AS "StorageProvider",
    MJFile_MatrixFileID."Name" AS "MatrixFile",
    MJFile_RowManifestFileID."Name" AS "RowManifestFile",
    MJFile_ProvenanceFileID."Name" AS "ProvenanceFile"
FROM
    "__mj"."MLTrainingSnapshot" AS m
LEFT OUTER JOIN
    "__mj"."MLTrainingPipeline" AS MJMLTrainingPipeline_PipelineID
  ON
    "m"."PipelineID" = MJMLTrainingPipeline_PipelineID."ID"
LEFT OUTER JOIN
    "__mj"."MLPredictionUnit" AS MJMLPredictionUnit_PredictionUnitID
  ON
    "m"."PredictionUnitID" = MJMLPredictionUnit_PredictionUnitID."ID"
LEFT OUTER JOIN
    "__mj"."MLEvaluationProtocol" AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    "m"."EvaluationProtocolID" = MJMLEvaluationProtocol_EvaluationProtocolID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_StorageProviderID
  ON
    "m"."StorageProviderID" = MJFileStorageProvider_StorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_MatrixFileID
  ON
    "m"."MatrixFileID" = MJFile_MatrixFileID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_RowManifestFileID
  ON
    "m"."RowManifestFileID" = MJFile_RowManifestFileID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_ProvenanceFileID
  ON
    "m"."ProvenanceFileID" = MJFile_ProvenanceFileID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMLTrainingSnapshots'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMLTrainingSnapshots'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLTrainingSnapshots" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMLTrainingSnapshots" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLTrainingSnapshots" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLTrainingSnapshots" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Snapshots
-- Item: spCreateMLTrainingSnapshot
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLTrainingSnapshot
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLTrainingSnapshot'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLTrainingSnapshot"(
    p_id UUID DEFAULT NULL,
    p_contenthash varchar(64) DEFAULT NULL,
    p_pipelineid UUID DEFAULT NULL,
    p_predictionunitid UUID DEFAULT NULL,
    p_labelversion int DEFAULT NULL,
    p_featurespecversion int DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL,
    p_storageproviderid UUID DEFAULT NULL,
    p_matrixfileid UUID DEFAULT NULL,
    p_matrixsha256 varchar(64) DEFAULT NULL,
    p_matrixsizebytes bigint DEFAULT NULL,
    p_rowmanifestfileid UUID DEFAULT NULL,
    p_rowmanifestsha256 varchar(64) DEFAULT NULL,
    p_rowmanifestsizebytes bigint DEFAULT NULL,
    p_provenancefileid UUID DEFAULT NULL,
    p_provenancesha256 varchar(64) DEFAULT NULL,
    p_provenancesizebytes bigint DEFAULT NULL,
    p_manifestrowcount int DEFAULT NULL,
    p_holdoutrowcount int DEFAULT NULL,
    p_featurespec TEXT DEFAULT NULL,
    p_featureschema TEXT DEFAULT NULL,
    p_featureschemahash varchar(64) DEFAULT NULL,
    p_columnprovenance TEXT DEFAULT NULL,
    p_pinnedfeatureversions TEXT DEFAULT NULL,
    p_rowsread int DEFAULT NULL,
    p_readcomplete BOOLEAN DEFAULT NULL,
    p_censoredrowsexcluded int DEFAULT NULL,
    p_labelknownrowsexcluded int DEFAULT NULL,
    p_emptylabelrowsexcluded int DEFAULT NULL,
    p_uncoveredhistoryrowsexcluded TEXT DEFAULT NULL,
    p_duplicaterowsremoved int DEFAULT NULL,
    p_classbalance_clear boolean DEFAULT false,
    p_classbalance TEXT DEFAULT NULL,
    p_datacutoff TIMESTAMPTZ DEFAULT NULL,
    p_assemblycodeversion varchar(200) DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLTrainingSnapshots" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLTrainingSnapshot"
        (
            "ID",
            "ContentHash",
                "PipelineID",
                "PredictionUnitID",
                "LabelVersion",
                "FeatureSpecVersion",
                "EvaluationProtocolID",
                "StorageProviderID",
                "MatrixFileID",
                "MatrixSha256",
                "MatrixSizeBytes",
                "RowManifestFileID",
                "RowManifestSha256",
                "RowManifestSizeBytes",
                "ProvenanceFileID",
                "ProvenanceSha256",
                "ProvenanceSizeBytes",
                "ManifestRowCount",
                "HoldoutRowCount",
                "FeatureSpec",
                "FeatureSchema",
                "FeatureSchemaHash",
                "ColumnProvenance",
                "PinnedFeatureVersions",
                "RowsRead",
                "ReadComplete",
                "CensoredRowsExcluded",
                "LabelKnownRowsExcluded",
                "EmptyLabelRowsExcluded",
                "UncoveredHistoryRowsExcluded",
                "DuplicateRowsRemoved",
                "ClassBalance",
                "DataCutoff",
                "AssemblyCodeVersion"
        )
    VALUES
        (
            v_new_id,
            p_contenthash,
                p_pipelineid,
                p_predictionunitid,
                p_labelversion,
                p_featurespecversion,
                CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, NULL) END,
                p_storageproviderid,
                p_matrixfileid,
                p_matrixsha256,
                p_matrixsizebytes,
                p_rowmanifestfileid,
                p_rowmanifestsha256,
                p_rowmanifestsizebytes,
                p_provenancefileid,
                p_provenancesha256,
                p_provenancesizebytes,
                p_manifestrowcount,
                p_holdoutrowcount,
                p_featurespec,
                p_featureschema,
                p_featureschemahash,
                p_columnprovenance,
                COALESCE(p_pinnedfeatureversions, '[]'),
                p_rowsread,
                COALESCE(p_readcomplete, TRUE),
                p_censoredrowsexcluded,
                p_labelknownrowsexcluded,
                p_emptylabelrowsexcluded,
                COALESCE(p_uncoveredhistoryrowsexcluded, '[]'),
                COALESCE(p_duplicaterowsremoved, 0),
                CASE WHEN p_classbalance_clear = true THEN NULL ELSE COALESCE(p_classbalance, NULL) END,
                p_datacutoff,
                p_assemblycodeversion
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLTrainingSnapshots"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLTrainingSnapshot" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLTrainingSnapshot" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Snapshots
-- Item: spUpdateMLTrainingSnapshot
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLTrainingSnapshot
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLTrainingSnapshot'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLTrainingSnapshot"(
    p_id UUID,
    p_contenthash varchar(64) DEFAULT NULL,
    p_pipelineid UUID DEFAULT NULL,
    p_predictionunitid UUID DEFAULT NULL,
    p_labelversion int DEFAULT NULL,
    p_featurespecversion int DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL,
    p_storageproviderid UUID DEFAULT NULL,
    p_matrixfileid UUID DEFAULT NULL,
    p_matrixsha256 varchar(64) DEFAULT NULL,
    p_matrixsizebytes bigint DEFAULT NULL,
    p_rowmanifestfileid UUID DEFAULT NULL,
    p_rowmanifestsha256 varchar(64) DEFAULT NULL,
    p_rowmanifestsizebytes bigint DEFAULT NULL,
    p_provenancefileid UUID DEFAULT NULL,
    p_provenancesha256 varchar(64) DEFAULT NULL,
    p_provenancesizebytes bigint DEFAULT NULL,
    p_manifestrowcount int DEFAULT NULL,
    p_holdoutrowcount int DEFAULT NULL,
    p_featurespec TEXT DEFAULT NULL,
    p_featureschema TEXT DEFAULT NULL,
    p_featureschemahash varchar(64) DEFAULT NULL,
    p_columnprovenance TEXT DEFAULT NULL,
    p_pinnedfeatureversions TEXT DEFAULT NULL,
    p_rowsread int DEFAULT NULL,
    p_readcomplete BOOLEAN DEFAULT NULL,
    p_censoredrowsexcluded int DEFAULT NULL,
    p_labelknownrowsexcluded int DEFAULT NULL,
    p_emptylabelrowsexcluded int DEFAULT NULL,
    p_uncoveredhistoryrowsexcluded TEXT DEFAULT NULL,
    p_duplicaterowsremoved int DEFAULT NULL,
    p_classbalance_clear boolean DEFAULT false,
    p_classbalance TEXT DEFAULT NULL,
    p_datacutoff TIMESTAMPTZ DEFAULT NULL,
    p_assemblycodeversion varchar(200) DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLTrainingSnapshots" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLTrainingSnapshot"
    SET
        "ContentHash" = COALESCE(p_contenthash, "ContentHash"),
        "PipelineID" = COALESCE(p_pipelineid, "PipelineID"),
        "PredictionUnitID" = COALESCE(p_predictionunitid, "PredictionUnitID"),
        "LabelVersion" = COALESCE(p_labelversion, "LabelVersion"),
        "FeatureSpecVersion" = COALESCE(p_featurespecversion, "FeatureSpecVersion"),
        "EvaluationProtocolID" = CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, "EvaluationProtocolID") END,
        "StorageProviderID" = COALESCE(p_storageproviderid, "StorageProviderID"),
        "MatrixFileID" = COALESCE(p_matrixfileid, "MatrixFileID"),
        "MatrixSha256" = COALESCE(p_matrixsha256, "MatrixSha256"),
        "MatrixSizeBytes" = COALESCE(p_matrixsizebytes, "MatrixSizeBytes"),
        "RowManifestFileID" = COALESCE(p_rowmanifestfileid, "RowManifestFileID"),
        "RowManifestSha256" = COALESCE(p_rowmanifestsha256, "RowManifestSha256"),
        "RowManifestSizeBytes" = COALESCE(p_rowmanifestsizebytes, "RowManifestSizeBytes"),
        "ProvenanceFileID" = COALESCE(p_provenancefileid, "ProvenanceFileID"),
        "ProvenanceSha256" = COALESCE(p_provenancesha256, "ProvenanceSha256"),
        "ProvenanceSizeBytes" = COALESCE(p_provenancesizebytes, "ProvenanceSizeBytes"),
        "ManifestRowCount" = COALESCE(p_manifestrowcount, "ManifestRowCount"),
        "HoldoutRowCount" = COALESCE(p_holdoutrowcount, "HoldoutRowCount"),
        "FeatureSpec" = COALESCE(p_featurespec, "FeatureSpec"),
        "FeatureSchema" = COALESCE(p_featureschema, "FeatureSchema"),
        "FeatureSchemaHash" = COALESCE(p_featureschemahash, "FeatureSchemaHash"),
        "ColumnProvenance" = COALESCE(p_columnprovenance, "ColumnProvenance"),
        "PinnedFeatureVersions" = COALESCE(p_pinnedfeatureversions, "PinnedFeatureVersions"),
        "RowsRead" = COALESCE(p_rowsread, "RowsRead"),
        "ReadComplete" = COALESCE(p_readcomplete, "ReadComplete"),
        "CensoredRowsExcluded" = COALESCE(p_censoredrowsexcluded, "CensoredRowsExcluded"),
        "LabelKnownRowsExcluded" = COALESCE(p_labelknownrowsexcluded, "LabelKnownRowsExcluded"),
        "EmptyLabelRowsExcluded" = COALESCE(p_emptylabelrowsexcluded, "EmptyLabelRowsExcluded"),
        "UncoveredHistoryRowsExcluded" = COALESCE(p_uncoveredhistoryrowsexcluded, "UncoveredHistoryRowsExcluded"),
        "DuplicateRowsRemoved" = COALESCE(p_duplicaterowsremoved, "DuplicateRowsRemoved"),
        "ClassBalance" = CASE WHEN p_classbalance_clear = true THEN NULL ELSE COALESCE(p_classbalance, "ClassBalance") END,
        "DataCutoff" = COALESCE(p_datacutoff, "DataCutoff"),
        "AssemblyCodeVersion" = COALESCE(p_assemblycodeversion, "AssemblyCodeVersion")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLTrainingSnapshots"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLTrainingSnapshot" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLTrainingSnapshot" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingSnapshot table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_training_snapshot"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_training_snapshot" ON "__mj"."MLTrainingSnapshot";

CREATE TRIGGER "trg_update_ml_training_snapshot"
BEFORE UPDATE ON "__mj"."MLTrainingSnapshot"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_training_snapshot"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Snapshots
-- Item: spDeleteMLTrainingSnapshot
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLTrainingSnapshot
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLTrainingSnapshot'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLTrainingSnapshot"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLTrainingSnapshot"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLTrainingSnapshot" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLTrainingSnapshot" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
    ON "__mj"."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
    ON "__mj"."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
    ON "__mj"."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
    ON "__mj"."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
    ON "__mj"."AIPrompt" ("ResultSelectorPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: vwAIPrompts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPrompts"
AS
SELECT
    a.*,
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIPromptCategory_CategoryID."Name" AS "Category",
    MJAIPromptType_TypeID."Name" AS "Type",
    MJAIModelType_AIModelTypeID."Name" AS "AIModelType",
    MJAIPrompt_ResultSelectorPromptID."Name" AS "ResultSelectorPrompt"
FROM
    "__mj"."AIPrompt" AS a
LEFT OUTER JOIN
    "__mj"."Template" AS MJTemplate_TemplateID
  ON
    "a"."TemplateID" = MJTemplate_TemplateID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptCategory" AS MJAIPromptCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIPromptCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptType" AS MJAIPromptType_TypeID
  ON
    "a"."TypeID" = MJAIPromptType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIModelType" AS MJAIModelType_AIModelTypeID
  ON
    "a"."AIModelTypeID" = MJAIModelType_AIModelTypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ResultSelectorPromptID
  ON
    "a"."ResultSelectorPromptID" = MJAIPrompt_ResultSelectorPromptID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIPrompts'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIPrompts'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPrompts" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_Developer";
DO $if_view_exists$
BEGIN
  IF to_regclass('"__mj"."vwAIPromptsActive"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON "__mj"."vwAIPromptsActive" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIPromptsActive" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptsActive" TO "cdp_Developer";';
  END IF;
END
$if_view_exists$;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPrompt"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL,
    p_templatedatacapture_clear boolean DEFAULT false,
    p_templatedatacapture varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPrompts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIPrompt"
        (
            "ID",
            "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode",
                "RequireSpecificModels",
                "PromptConfiguration",
                "TemplateDataCapture"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_templateid,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_typeid,
                p_status,
                COALESCE(p_responseformat, 'Any'),
                CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, NULL) END,
                CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, NULL) END,
                CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, 0) END,
                COALESCE(p_selectionstrategy, 'Default'),
                COALESCE(p_powerpreference, 'Highest'),
                COALESCE(p_parallelizationmode, 'None'),
                CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, NULL) END,
                CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, NULL) END,
                COALESCE(p_outputtype, 'string'),
                CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, NULL) END,
                COALESCE(p_validationbehavior, 'Warn'),
                COALESCE(p_maxretries, 0),
                COALESCE(p_retrydelayms, 0),
                COALESCE(p_retrystrategy, 'Fixed'),
                CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, NULL) END,
                COALESCE(p_enablecaching, FALSE),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                COALESCE(p_cachematchtype, 'Exact'),
                CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, NULL) END,
                COALESCE(p_cachemustmatchmodel, TRUE),
                COALESCE(p_cachemustmatchvendor, TRUE),
                COALESCE(p_cachemustmatchagent, FALSE),
                COALESCE(p_cachemustmatchconfig, FALSE),
                COALESCE(p_promptrole, 'System'),
                COALESCE(p_promptposition, 'First'),
                CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, NULL) END,
                CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, NULL) END,
                CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, NULL) END,
                CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, NULL) END,
                CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, NULL) END,
                CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, NULL) END,
                CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, NULL) END,
                CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, NULL) END,
                CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, FALSE) END,
                CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, NULL) END,
                COALESCE(p_failoverstrategy, 'SameModelDifferentVendor'),
                CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, 3) END,
                CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, 5) END,
                COALESCE(p_failovermodelstrategy, 'PreferSameModel'),
                COALESCE(p_failovererrorscope, 'All'),
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, NULL) END,
                COALESCE(p_prefillfallbackmode, 'Ignore'),
                COALESCE(p_requirespecificmodels, FALSE),
                CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, NULL) END,
                CASE WHEN p_templatedatacapture_clear = true THEN NULL ELSE COALESCE(p_templatedatacapture, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPrompts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPrompt" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPrompt"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL,
    p_templatedatacapture_clear boolean DEFAULT false,
    p_templatedatacapture varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPrompts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIPrompt"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "ResponseFormat" = COALESCE(p_responseformat, "ResponseFormat"),
        "ModelSpecificResponseFormat" = CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, "ModelSpecificResponseFormat") END,
        "AIModelTypeID" = CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, "AIModelTypeID") END,
        "MinPowerRank" = CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, "MinPowerRank") END,
        "SelectionStrategy" = COALESCE(p_selectionstrategy, "SelectionStrategy"),
        "PowerPreference" = COALESCE(p_powerpreference, "PowerPreference"),
        "ParallelizationMode" = COALESCE(p_parallelizationmode, "ParallelizationMode"),
        "ParallelCount" = CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, "ParallelCount") END,
        "ParallelConfigParam" = CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, "ParallelConfigParam") END,
        "OutputType" = COALESCE(p_outputtype, "OutputType"),
        "OutputExample" = CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, "OutputExample") END,
        "ValidationBehavior" = COALESCE(p_validationbehavior, "ValidationBehavior"),
        "MaxRetries" = COALESCE(p_maxretries, "MaxRetries"),
        "RetryDelayMS" = COALESCE(p_retrydelayms, "RetryDelayMS"),
        "RetryStrategy" = COALESCE(p_retrystrategy, "RetryStrategy"),
        "ResultSelectorPromptID" = CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, "ResultSelectorPromptID") END,
        "EnableCaching" = COALESCE(p_enablecaching, "EnableCaching"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "CacheMatchType" = COALESCE(p_cachematchtype, "CacheMatchType"),
        "CacheSimilarityThreshold" = CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, "CacheSimilarityThreshold") END,
        "CacheMustMatchModel" = COALESCE(p_cachemustmatchmodel, "CacheMustMatchModel"),
        "CacheMustMatchVendor" = COALESCE(p_cachemustmatchvendor, "CacheMustMatchVendor"),
        "CacheMustMatchAgent" = COALESCE(p_cachemustmatchagent, "CacheMustMatchAgent"),
        "CacheMustMatchConfig" = COALESCE(p_cachemustmatchconfig, "CacheMustMatchConfig"),
        "PromptRole" = COALESCE(p_promptrole, "PromptRole"),
        "PromptPosition" = COALESCE(p_promptposition, "PromptPosition"),
        "Temperature" = CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, "Temperature") END,
        "TopP" = CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, "TopP") END,
        "TopK" = CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, "TopK") END,
        "MinP" = CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, "MinP") END,
        "FrequencyPenalty" = CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, "FrequencyPenalty") END,
        "PresencePenalty" = CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, "PresencePenalty") END,
        "Seed" = CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, "Seed") END,
        "StopSequences" = CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, "StopSequences") END,
        "IncludeLogProbs" = CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, "IncludeLogProbs") END,
        "TopLogProbs" = CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, "TopLogProbs") END,
        "FailoverStrategy" = COALESCE(p_failoverstrategy, "FailoverStrategy"),
        "FailoverMaxAttempts" = CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, "FailoverMaxAttempts") END,
        "FailoverDelaySeconds" = CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, "FailoverDelaySeconds") END,
        "FailoverModelStrategy" = COALESCE(p_failovermodelstrategy, "FailoverModelStrategy"),
        "FailoverErrorScope" = COALESCE(p_failovererrorscope, "FailoverErrorScope"),
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "AssistantPrefill" = CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, "AssistantPrefill") END,
        "PrefillFallbackMode" = COALESCE(p_prefillfallbackmode, "PrefillFallbackMode"),
        "RequireSpecificModels" = COALESCE(p_requirespecificmodels, "RequireSpecificModels"),
        "PromptConfiguration" = CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, "PromptConfiguration") END,
        "TemplateDataCapture" = CASE WHEN p_templatedatacapture_clear = true THEN NULL ELSE COALESCE(p_templatedatacapture, "TemplateDataCapture") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPrompts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPrompt" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt" ON "__mj"."AIPrompt";

CREATE TRIGGER "trg_update_ai_prompt"
BEFORE UPDATE ON "__mj"."AIPrompt"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPrompt"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.CompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocument"
        WHERE "ReasoningPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."EntityDocument"
        SET "ReasoningPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Feature Pipeline Versions.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FeaturePipelineVersion"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."FeaturePipelineVersion"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Feature Value Caches records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FeatureValueCache"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteFeatureValueCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Feature Values.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."FeatureValue"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."FeatureValue"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Configs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptConfig"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteScopedPromptConfig"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Parts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptPart"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteScopedPromptPart"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Tasks.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPrompt" TO "cdp_Developer";
