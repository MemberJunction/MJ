-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611231001__v6.3.x__PS_Honest_Serving_Schema.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* *************************************************************************************************
 * Migration: Predictive Studio — honest serving (publish records, scoring runs, monitoring results,
 * output bindings, the ML Models registry columns, model predictions as Feature Values)
 *
 *   1. MLModelPublishRecord  (MJ: ML Model Publish Records)  — the ledger of every human sign-off, every
 *                                                              applied publish or rollback, and every refused
 *                                                              publish attempt. Rows are never updated, except
 *                                                              that spDeleteEntityWithCoreDependencies clears
 *                                                              SignOffID, ReplacesModelID and TrainingRunID when
 *                                                              the referenced row is removed with its entity.
 *      MLScoringRun          (MJ: ML Scoring Runs)          — one row per scoring call, dry runs and refusals
 *                                                              included.
 *      MLMonitoringResult    (MJ: ML Monitoring Results)    — one row per model per monitoring period.
 *      MLOutputBinding       (MJ: ML Output Bindings)       — how one surface shows a model's output.
 *   2. MLModel               + the registry entry (lineage, artifact hash and status, delivery, status reason),
 *                              the statuses KeepBaseline and Unevaluated, the serving flag of a pre-change model
 *   3. MLModel               duplicate (PipelineID, Version) rows renumbered, then one version per pipeline
 *   4. FeatureValue          the per-record, per-feature as-of index (over FeatureValue.Role and MLModelID, which
 *                              V202611101901__v6.3.x__Task_Security_Saga_Shadow_Scoring adds with their metadata rows)
 *   5. vwLatestFeatureValues and its read-only virtual entity MJ: Latest Feature Values
 *   6. FeatureValue          model predictions (Source = 'Model') with their binding, scoring run and in-training
 *                              flag; RecordProcessID nullable; one row per binding, record, as-of instant and role
 *   7. MLModelScoringBinding the binding as a prediction feature: pipeline, feature name, column-copy source, status,
 *                              view authorization, retention
 *   8. MLModelScoringBinding existing bindings filled in; the write-back mapping of their Record Processes cleared
 *   9. MLModelScoringBinding MLModelID and MaterializedResultID dropped; the materialized mode removed
 *  10. vwUserHeldAuthorizations, the authorizations each user holds (MJ's authorization rule in SQL)
 *  11. vwLatestFeatureValues re-created with the prediction lineage columns
 *  12. spDeleteEntityWithCoreDependencies, re-created to clear the serving tables' rows when an entity is removed
 *  13. MLModel               models registered before the lifecycle gate: re-checked from their stored gate record,
 *                              or Unevaluated (the newest formerly Published one of a pipeline still serving it); then
 *                              at most one Published model per pipeline
 *
 * Documented exception (D4-13): section 13 rewrites MLModel business state (Status, StatusReason, ArtifactStatus,
 * ServingWhileUnevaluated, TrainingRunID) with raw UPDATEs, which writes no Record Changes rows. It is the one-time data
 * fix of the pre-change statuses that UX_MLModel_OnePublishedPerPipeline and the lifecycle gate need before they can hold;
 * the engine's step (g) (PreGateModelMigration, run by the Predictive Studio Registry Check job) does every later change
 * through the gate, with its publish records and Record Changes.
 ************************************************************************************************* */
/* ============================================================================ */
/* 1. New tables */
/* ============================================================================ */
CREATE TABLE __mj."MLModelPublishRecord" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ModelID" UUID NULL,
  "TrainingRunID" UUID NULL,
  "Kind" VARCHAR(20) NOT NULL,
  "Purpose" VARCHAR(20) NOT NULL,
  "ApproverKind" VARCHAR(20) NOT NULL,
  "UserID" UUID NULL,
  "Initiator" TEXT NOT NULL,
  "RecordedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "Decision" VARCHAR(10) NULL,
  "Reason" TEXT NULL,
  "GateDecision" TEXT NULL,
  "Evidence" TEXT NULL,
  "EvidenceSha256" CHAR(64) NULL,
  "OverridesFlags" TEXT NOT NULL DEFAULT (
    '[]'
  ),
  "SignOffID" UUID NULL,
  "ReplacesModelID" UUID NULL,
  "Refusal" TEXT NULL,
  "Transient" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "PK_MLModelPublishRecord" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MLModelPublishRecord_Model" FOREIGN KEY ("ModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "FK_MLModelPublishRecord_Run" FOREIGN KEY ("TrainingRunID") REFERENCES __mj."MLTrainingRun" (
    "ID"
  ),
  CONSTRAINT "FK_MLModelPublishRecord_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_MLModelPublishRecord_SignOff" FOREIGN KEY ("SignOffID") REFERENCES __mj."MLModelPublishRecord" (
    "ID"
  ),
  CONSTRAINT "FK_MLModelPublishRecord_Replaces" FOREIGN KEY ("ReplacesModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "CK_MLModelPublishRecord_Kind" CHECK ("Kind" IN ('sign-off', 'publish', 'refusal')),
  CONSTRAINT "CK_MLModelPublishRecord_Purpose" CHECK ("Purpose" IN ('publish', 'rollback', 'evaluate', 'adopt')),
  CONSTRAINT "CK_MLModelPublishRecord_Adopt" CHECK ("Purpose" <> 'adopt' OR "Kind" = 'publish'),
  CONSTRAINT "CK_MLModelPublishRecord_Subject" CHECK (NOT "ModelID" IS NULL OR NOT "TrainingRunID" IS NULL),
  CONSTRAINT "CK_MLModelPublishRecord_RunLevel" CHECK ((
    NOT "ModelID" IS NULL AND "Purpose" <> 'evaluate'
  )
  OR (
    "ModelID" IS NULL AND "Kind" = 'refusal' AND "Purpose" = 'evaluate'
  )),
  CONSTRAINT "CK_MLModelPublishRecord_Approver" CHECK ((
    "ApproverKind" = 'user' AND NOT "UserID" IS NULL
  )
  OR (
    "ApproverKind" = 'automated-gate' AND "UserID" IS NULL
  )),
  CONSTRAINT "CK_MLModelPublishRecord_SignOff" CHECK ((
    "Kind" = 'sign-off'
    AND "ApproverKind" = 'user'
    AND "Decision" IN ('approve', 'reject')
  )
  OR (
    "Kind" <> 'sign-off' AND "Decision" IS NULL AND "OverridesFlags" = '[]'
  )),
  CONSTRAINT "CK_MLModelPublishRecord_Evidence" CHECK ("Kind" = 'refusal'
  OR (
    NOT "Evidence" IS NULL AND NOT "EvidenceSha256" IS NULL
  )),
  CONSTRAINT "CK_MLModelPublishRecord_Publish" CHECK ("Kind" <> 'publish' OR NOT "GateDecision" IS NULL),
  CONSTRAINT "CK_MLModelPublishRecord_Refusal" CHECK ((
    "Kind" = 'refusal' AND NOT "Refusal" IS NULL
  )
  OR (
    "Kind" <> 'refusal' AND "Refusal" IS NULL AND "Transient" = FALSE
  )),
  CONSTRAINT "CK_MLModelPublishRecord_Reason" CHECK ("OverridesFlags" = '[]'
  OR LENGTH(CAST(LTRIM(RTRIM(COALESCE("Reason", ''))) AS TEXT)) > 0)
);

CREATE INDEX "IX_MLModelPublishRecord_Model" ON __mj."MLModelPublishRecord"("ModelID", "RecordedAt" DESC NULLS LAST);
CREATE INDEX "IX_MLModelPublishRecord_Run" ON __mj."MLModelPublishRecord"("TrainingRunID", "RecordedAt" DESC NULLS LAST);
/* One applied publish (or adoption of a pre-change Published model) per training run, ever: a retried */
/* publish of the same run cannot apply twice. */
CREATE UNIQUE INDEX "UX_MLModelPublishRecord_OnePublishPerRun" ON __mj."MLModelPublishRecord"("TrainingRunID") NULLS NOT DISTINCT
WHERE
  "Kind" = 'publish'
  AND "Purpose" IN ('publish', 'adopt')
  AND NOT "TrainingRunID" IS NULL;
/* One run-level outcome per training run: a retried job records a run without a model once. */
CREATE UNIQUE INDEX "UX_MLModelPublishRecord_OneRunOutcome" ON __mj."MLModelPublishRecord"("TrainingRunID") NULLS NOT DISTINCT
WHERE
  "Purpose" = 'evaluate' AND NOT "TrainingRunID" IS NULL;

COMMENT ON TABLE __mj."MLModelPublishRecord" IS 'The publish ledger of ML models: every human sign-off, every applied publish or rollback (automatic or by a person) and every refused publish attempt. An audit trail only: the lifecycle gate re-derives each decision from the stored evaluation and the model''s Delivery. Rows are never updated, except that spDeleteEntityWithCoreDependencies clears SignOffID, ReplacesModelID and TrainingRunID on surviving rows when the referenced row is deleted with its entity.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."ModelID" IS 'The model the record is about. NULL only on a run-level refusal: a training run whose outcome produced no model row.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."TrainingRunID" IS 'The training run the record is about; the idempotency key of a publish and of a run-level refusal.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Kind" IS 'sign-off (a person approved or rejected), publish (a status change was applied) or refusal (a publish attempt was refused).';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Purpose" IS 'publish, rollback (an archived model published again), evaluate (a run-level outcome only) or adopt (a pre-change Published model re-verified).';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."ApproverKind" IS 'automated-gate when no person approved the publish; user when a person published or the publish consumed that person''s approving sign-off.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."UserID" IS 'The person who approved, when ApproverKind is user.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Initiator" IS 'JSON Actor: who started the attempt (a user, an agent run, a Record Process run or a scheduled job run).';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."RecordedAt" IS 'When the record was written.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Decision" IS 'Sign-off rows only: approve or reject.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Reason" IS 'The reason in plain words; required when the record overrides flags.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."GateDecision" IS 'JSON GateDecision as the gate re-derived it at the publish, kept as a copy for audit. Required on publish rows.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Evidence" IS 'JSON EvidenceSnapshot built by the server from stored rows at the moment of the sign-off or publish.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."EvidenceSha256" IS 'SHA-256 of the canonical Evidence JSON; a sign-off authorises a publish only while it equals a fresh recomputation.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."OverridesFlags" IS 'JSON array of the leakage flags a sign-off acknowledges by name; empty on every other row.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."SignOffID" IS 'Publish rows: the human sign-off this publish consumed, when one was required.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."ReplacesModelID" IS 'Publish rows: the model archived in the same transaction.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Refusal" IS 'Refusal rows: JSON TransitionRefusal, the reason the attempt was refused.';

COMMENT ON COLUMN __mj."MLModelPublishRecord"."Transient" IS 'Refusal rows: true when a retry may succeed.';

CREATE TABLE __mj."MLScoringRun" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ModelID" UUID NULL,
  "ModelVersion" INT NULL,
  "MLModelScoringBindingID" UUID NULL,
  "ArtifactSha256" CHAR(64) NULL,
  "FeatureSchemaHash" CHAR(64) NULL,
  "Path" VARCHAR(20) NOT NULL,
  "ScopeKind" VARCHAR(20) NOT NULL,
  "ScopeEntityID" UUID NOT NULL,
  "Scope" TEXT NOT NULL,
  "EntityMapping" TEXT NULL,
  "AsOfDate" TIMESTAMPTZ NOT NULL,
  "ReadPolicy" TEXT NOT NULL,
  "DryRun" BOOLEAN NOT NULL DEFAULT FALSE,
  "RequestedBy" TEXT NOT NULL,
  "RequestedByUserID" UUID NULL,
  "ProcessRunID" UUID NULL,
  "ScheduledJobRunID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'running'
  ),
  "Refusal" TEXT NULL,
  "Total" INT NOT NULL DEFAULT (
    0
  ),
  "Written" INT NOT NULL DEFAULT (
    0
  ),
  "Failed" INT NOT NULL DEFAULT (
    0
  ),
  "Skipped" INT NOT NULL DEFAULT (
    0
  ),
  "FirstErrors" TEXT NULL,
  "StartedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "EndedAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_MLScoringRun" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MLScoringRun_Model" FOREIGN KEY ("ModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "FK_MLScoringRun_Binding" FOREIGN KEY ("MLModelScoringBindingID") REFERENCES __mj."MLModelScoringBinding" (
    "ID"
  ),
  CONSTRAINT "FK_MLScoringRun_Entity" FOREIGN KEY ("ScopeEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_MLScoringRun_User" FOREIGN KEY ("RequestedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_MLScoringRun_Process" FOREIGN KEY ("ProcessRunID") REFERENCES __mj."ProcessRun" (
    "ID"
  ),
  CONSTRAINT "FK_MLScoringRun_JobRun" FOREIGN KEY ("ScheduledJobRunID") REFERENCES __mj."ScheduledJobRun" (
    "ID"
  ),
  CONSTRAINT "CK_MLScoringRun_Path" CHECK ("Path" IN ('score-record-set', 'record-process', 'monitoring', 'parity', 'predict')),
  CONSTRAINT "CK_MLScoringRun_ScopeKind" CHECK ("ScopeKind" IN ('record-ids', 'view', 'filter')),
  CONSTRAINT "CK_MLScoringRun_Status" CHECK ("Status" IN ('running', 'refused', 'failed', 'completed')),
  CONSTRAINT "CK_MLScoringRun_Refused" CHECK ("Status" <> 'refused' OR (
    NOT "Refusal" IS NULL AND "Written" = 0
  )),
  CONSTRAINT "CK_MLScoringRun_Model" CHECK ("Status" = 'refused'
  OR (
    NOT "ModelID" IS NULL AND NOT "ModelVersion" IS NULL
  )),
  CONSTRAINT "CK_MLScoringRun_DryRun" CHECK ("DryRun" = FALSE OR "Written" = 0)
);

CREATE INDEX "IX_MLScoringRun_Model" ON __mj."MLScoringRun"("ModelID", "StartedAt" DESC NULLS LAST);

COMMENT ON TABLE __mj."MLScoringRun" IS 'One row per scoring call, dry runs and refusals included, written by the scoring service only. A running row exists before the first record is scored, so a crash leaves a visible row.';

COMMENT ON COLUMN __mj."MLScoringRun"."ModelID" IS 'The exact model version that scored. NULL only on a refused run whose binding''s pipeline has no Published model.';

COMMENT ON COLUMN __mj."MLScoringRun"."ModelVersion" IS 'The model''s Version, copied at the run.';

COMMENT ON COLUMN __mj."MLScoringRun"."MLModelScoringBindingID" IS 'The scoring binding a writing run scored for; NULL for a call that returns its scores and writes no Feature Value.';

COMMENT ON COLUMN __mj."MLScoringRun"."ArtifactSha256" IS 'SHA-256 of the artifact bytes that scored; NULL only when the run was refused before the artifact verified.';

COMMENT ON COLUMN __mj."MLScoringRun"."FeatureSchemaHash" IS 'Hash of the model''s feature schema the run scored with.';

COMMENT ON COLUMN __mj."MLScoringRun"."Path" IS 'Which caller ran it: score-record-set, record-process, monitoring, parity or predict.';

COMMENT ON COLUMN __mj."MLScoringRun"."ScopeKind" IS 'How the scope names its records: record-ids, view or filter.';

COMMENT ON COLUMN __mj."MLScoringRun"."ScopeEntityID" IS 'The entity whose records the scope names.';

COMMENT ON COLUMN __mj."MLScoringRun"."Scope" IS 'JSON ScoringScope: the records the call asked to score.';

COMMENT ON COLUMN __mj."MLScoringRun"."EntityMapping" IS 'JSON EntityRef mapping the scope entity onto the model''s grain, when they differ.';

COMMENT ON COLUMN __mj."MLScoringRun"."AsOfDate" IS 'The as-of instant the features were read at.';

COMMENT ON COLUMN __mj."MLScoringRun"."ReadPolicy" IS 'JSON ReadPolicy the features were read under.';

COMMENT ON COLUMN __mj."MLScoringRun"."DryRun" IS 'True when the call scored without writing anything.';

COMMENT ON COLUMN __mj."MLScoringRun"."RequestedBy" IS 'JSON Actor: who asked for the run.';

COMMENT ON COLUMN __mj."MLScoringRun"."RequestedByUserID" IS 'The requesting user, when a person asked; a joinable copy of RequestedBy.';

COMMENT ON COLUMN __mj."MLScoringRun"."ProcessRunID" IS 'The Process Run, when the Record Process path ran it.';

COMMENT ON COLUMN __mj."MLScoringRun"."ScheduledJobRunID" IS 'The Scheduled Job Run, when monitoring or parity ran it.';

COMMENT ON COLUMN __mj."MLScoringRun"."Status" IS 'running, refused, failed or completed. A failed run keeps the batches it wrote before the failing one.';

COMMENT ON COLUMN __mj."MLScoringRun"."Refusal" IS 'JSON ScoringRefusal when the run was refused.';

COMMENT ON COLUMN __mj."MLScoringRun"."Total" IS 'Records in scope.';

COMMENT ON COLUMN __mj."MLScoringRun"."Written" IS 'Records whose prediction was written.';

COMMENT ON COLUMN __mj."MLScoringRun"."Failed" IS 'Records that failed to score.';

COMMENT ON COLUMN __mj."MLScoringRun"."Skipped" IS 'Records skipped (for example, a person''s value the run must not overwrite).';

COMMENT ON COLUMN __mj."MLScoringRun"."FirstErrors" IS 'JSON array of the first errors, at most 20, each {recordId, message}.';

COMMENT ON COLUMN __mj."MLScoringRun"."StartedAt" IS 'When the run started.';

COMMENT ON COLUMN __mj."MLScoringRun"."EndedAt" IS 'When the run ended; NULL while it runs.';

CREATE TABLE __mj."MLMonitoringResult" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ModelID" UUID NOT NULL,
  "ScheduledJobRunID" UUID NULL,
  "Period" DATE NOT NULL,
  "PeriodGrain" VARCHAR(10) NOT NULL,
  "State" VARCHAR(20) NOT NULL,
  "ScoredRows" INT NOT NULL DEFAULT (
    0
  ),
  "JoinedRows" INT NOT NULL DEFAULT (
    0
  ),
  "ExcludedInTrainingRows" INT NOT NULL DEFAULT (
    0
  ),
  "PrimaryScore" TEXT NULL,
  "PrimaryValue" DOUBLE PRECISION NULL,
  "PrimaryLower" DOUBLE PRECISION NULL,
  "PrimaryUpper" DOUBLE PRECISION NULL,
  "TrackedMetrics" TEXT NULL,
  "Calibration" TEXT NULL,
  "DriftLook" TEXT NULL,
  "DriftAlarms" TEXT NOT NULL DEFAULT (
    '[]'
  ),
  "Parity" TEXT NULL,
  "TriggersFired" TEXT NOT NULL DEFAULT (
    '[]'
  ),
  "ChallengerRunID" UUID NULL,
  "ChallengerResult" TEXT NULL,
  "RollbackCheck" TEXT NULL,
  "ErrorMessage" TEXT NULL,
  CONSTRAINT "PK_MLMonitoringResult" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MLMonitoringResult_Model" FOREIGN KEY ("ModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "FK_MLMonitoringResult_JobRun" FOREIGN KEY ("ScheduledJobRunID") REFERENCES __mj."ScheduledJobRun" (
    "ID"
  ),
  CONSTRAINT "FK_MLMonitoringResult_Challenger" FOREIGN KEY ("ChallengerRunID") REFERENCES __mj."MLTrainingRun" (
    "ID"
  ),
  CONSTRAINT "CK_MLMonitoringResult_Grain" CHECK ("PeriodGrain" IN ('week', 'month', 'quarter', 'year')),
  CONSTRAINT "CK_MLMonitoringResult_State" CHECK ("State" IN ('window-open', 'evaluated', 'insufficient-rows', 'failed')),
  CONSTRAINT "UQ_MLMonitoringResult_ModelPeriod" UNIQUE NULLS NOT DISTINCT (
    "ModelID",
    "PeriodGrain",
    "Period"
  )
);

COMMENT ON TABLE __mj."MLMonitoringResult" IS 'One row per Published model per monitoring period: the outcome join, the tracked metrics, drift, parity, the triggers that fired and the challenger and rollback checks.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ModelID" IS 'The model monitored.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ScheduledJobRunID" IS 'The monitoring job run that wrote the row; NULL for a run started from the UI or a test.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."Period" IS 'The first day of the period.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."PeriodGrain" IS 'week, month, quarter or year.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."State" IS 'window-open (outcomes not yet known), evaluated, insufficient-rows (fewer scored rows than the job''s minimum, so the period is recorded and not judged) or failed.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ScoredRows" IS 'Predictions the model stored for the period.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."JoinedRows" IS 'Predictions joined to a known outcome.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ExcludedInTrainingRows" IS 'Joined predictions left out because the record was in the model''s training snapshot.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."PrimaryScore" IS 'JSON MetricWithInterval: the protocol''s primary metric over the joined rows.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."PrimaryValue" IS 'The primary metric''s value, copied from PrimaryScore for queries and charts.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."PrimaryLower" IS 'The primary metric''s interval lower bound, copied from PrimaryScore.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."PrimaryUpper" IS 'The primary metric''s interval upper bound, copied from PrimaryScore.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."TrackedMetrics" IS 'JSON array of MetricWithInterval: the other tracked metrics (positive rate, log loss, RMSE and so on).';

COMMENT ON COLUMN __mj."MLMonitoringResult"."Calibration" IS 'JSON CalibrationReport over the joined rows.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."DriftLook" IS 'JSON per-input drift statistics of the period''s look: z, empirical p, adjusted p, the look''s threshold and index.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."DriftAlarms" IS 'JSON array of the inputs whose drift alarm fired.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."Parity" IS 'JSON {sampled, maxAbsDifference, passed}: the period''s scoring parity check.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."TriggersFired" IS 'JSON array of {kind, reason}: the retrain and rollback triggers that fired.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ChallengerRunID" IS 'The challenger training run a fired trigger started.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ChallengerResult" IS 'JSON {sharedRowIds, comparison, outcome, publishRecordId}: how the challenger compared and whether it was published or withheld.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."RollbackCheck" IS 'JSON {previousModelId, sharedRowIds, comparison, consecutive, fired or not-eligible with the reason}: the automated rollback check.';

COMMENT ON COLUMN __mj."MLMonitoringResult"."ErrorMessage" IS 'Why the period failed, when State is failed.';

CREATE TABLE __mj."MLOutputBinding" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "ModelID" UUID NOT NULL,
  "Surface" VARCHAR(30) NOT NULL,
  "SortsBy" VARCHAR(30) NOT NULL,
  "DriverDirectionRelativeTo" VARCHAR(20) NOT NULL,
  "Label" VARCHAR(255) NOT NULL,
  CONSTRAINT "PK_MLOutputBinding" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MLOutputBinding_Model" FOREIGN KEY ("ModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "CK_MLOutputBinding_Surface" CHECK ("Surface" IN ('at-risk-list', 'why-badge', 'predictions-grid', 'record-panel')),
  CONSTRAINT "CK_MLOutputBinding_SortsBy" CHECK ("SortsBy" IN ('adverse-probability-desc', 'score-desc', 'score-asc', 'none')),
  CONSTRAINT "CK_MLOutputBinding_Direction" CHECK ("DriverDirectionRelativeTo" IN ('adverse-class', 'raw-contribution')),
  CONSTRAINT "UQ_MLOutputBinding_ModelSurface" UNIQUE NULLS NOT DISTINCT (
    "ModelID",
    "Surface"
  )
);

COMMENT ON TABLE __mj."MLOutputBinding" IS 'How one surface shows a model''s output: what it sorts by, which way driver directions point and the label. Created from the model''s OutputSemantics when the model is evaluated; a save that contradicts those semantics is refused.';

COMMENT ON COLUMN __mj."MLOutputBinding"."ModelID" IS 'The model whose output the surface shows.';

COMMENT ON COLUMN __mj."MLOutputBinding"."Surface" IS 'at-risk-list, why-badge, predictions-grid or record-panel.';

COMMENT ON COLUMN __mj."MLOutputBinding"."SortsBy" IS 'adverse-probability-desc, score-desc, score-asc or none.';

COMMENT ON COLUMN __mj."MLOutputBinding"."DriverDirectionRelativeTo" IS 'adverse-class (a driver that raises the adverse outcome points up) or raw-contribution.';

COMMENT ON COLUMN __mj."MLOutputBinding"."Label" IS 'The label the surface shows, naming the scored class.';

ALTER TABLE __mj."MLModel"
  ADD COLUMN "PredictionUnitID" UUID NULL,
  ADD COLUMN "EvaluationProtocolID" UUID NULL,
  ADD COLUMN "TrainingSnapshotID" UUID NULL,
  ADD COLUMN "TrainingRunID" UUID NULL,
  ADD COLUMN "ArtifactSha256" CHAR(64) NULL,
  ADD COLUMN "SnapshotHash" CHAR(64) NULL,
  ADD COLUMN "CodeVersion" TEXT NULL,
  ADD COLUMN "FeatureSchemaHash" CHAR(64) NULL,
  ADD COLUMN "OutputSemantics" TEXT NULL,
  ADD COLUMN "Delivery" TEXT NULL,
  ADD COLUMN "StatusReason" TEXT NULL,
  ADD COLUMN "ArtifactStatus" VARCHAR(20) NOT NULL DEFAULT (
    'unverified'
  ),
  ADD COLUMN "ArtifactCheckedAt" TIMESTAMPTZ NULL,
  ADD COLUMN "ServingWhileUnevaluated" BOOLEAN NOT NULL DEFAULT FALSE
 /* ============================================================================ */ /* 2. MLModel + the registry entry, the gate's statuses, the pre-change serving flag */ /* ============================================================================ */;

ALTER TABLE __mj."MLModel"
  ADD CONSTRAINT "FK_MLModel_PredictionUnit" FOREIGN KEY ("PredictionUnitID") REFERENCES __mj."MLPredictionUnit" (
    "ID"
  ),
  ADD CONSTRAINT "FK_MLModel_EvaluationProtocol" FOREIGN KEY ("EvaluationProtocolID") REFERENCES __mj."MLEvaluationProtocol" (
    "ID"
  ),
  ADD CONSTRAINT "FK_MLModel_TrainingSnapshot" FOREIGN KEY ("TrainingSnapshotID") REFERENCES __mj."MLTrainingSnapshot" (
    "ID"
  ),
  ADD CONSTRAINT "FK_MLModel_TrainingRun" FOREIGN KEY ("TrainingRunID") REFERENCES __mj."MLTrainingRun" (
    "ID"
  ),
  ADD CONSTRAINT "CK_MLModel_ArtifactStatus" CHECK ("ArtifactStatus" IN ('unverified', 'verified', 'missing', 'hash-mismatch', 'legacy-local')),
  ADD CONSTRAINT "CK_MLModel_ServingWhileUnevaluated" CHECK ("ServingWhileUnevaluated" = FALSE OR "Status" = 'Unevaluated');

/* At most one pre-change model keeps serving a pipeline. */
CREATE UNIQUE INDEX "UX_MLModel_OneServingUnevaluatedPerPipeline" ON __mj."MLModel"("PipelineID") NULLS NOT DISTINCT
WHERE
  "ServingWhileUnevaluated" = TRUE;

ALTER TABLE __mj."MLModel"
DROP CONSTRAINT "CK_MLModel_Status" /* Status gains the gate's keep-baseline outcome and the demotion status Unevaluated. */;
ALTER TABLE __mj."MLModel"
  ADD CONSTRAINT "CK_MLModel_Status" CHECK ("Status" IN ('Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'));

COMMENT ON COLUMN __mj."MLModel"."PredictionUnitID" IS 'The Prediction Unit version the model was trained under (the exact version row).';

COMMENT ON COLUMN __mj."MLModel"."EvaluationProtocolID" IS 'The Evaluation Protocol version the model was graded under (the exact version row).';

COMMENT ON COLUMN __mj."MLModel"."TrainingSnapshotID" IS 'The Training Snapshot the model was trained on.';

COMMENT ON COLUMN __mj."MLModel"."TrainingRunID" IS 'The training run that produced the model.';

COMMENT ON COLUMN __mj."MLModel"."ArtifactSha256" IS 'SHA-256 of the shipped artifact''s stored bytes; a load that hashes differently is refused.';

COMMENT ON COLUMN __mj."MLModel"."SnapshotHash" IS 'Content hash of the training snapshot, copied at registration.';

COMMENT ON COLUMN __mj."MLModel"."CodeVersion" IS 'JSON CodeVersion of the training code: git commit, sidecar version, library versions, threads and seed.';

COMMENT ON COLUMN __mj."MLModel"."FeatureSchemaHash" IS 'Hash of the feature schema the model scores; a scoring request whose features hash differently is refused.';

COMMENT ON COLUMN __mj."MLModel"."OutputSemantics" IS 'JSON {task}: what the model''s output means (the task type and, for a classification, the adverse class).';

COMMENT ON COLUMN __mj."MLModel"."Delivery" IS 'JSON RegisteredDelivery: what the training run shipped and the gate decision it shipped under.';

COMMENT ON COLUMN __mj."MLModel"."StatusReason" IS 'Why the model has its status, in plain words: a kept baseline, a demotion to Unevaluated, an archive or a withheld publish.';

COMMENT ON COLUMN __mj."MLModel"."ArtifactStatus" IS 'Health of the stored artifact as last checked: unverified, verified, missing, hash-mismatch or legacy-local.';

COMMENT ON COLUMN __mj."MLModel"."ArtifactCheckedAt" IS 'When ArtifactStatus was last checked.';

COMMENT ON COLUMN __mj."MLModel"."ServingWhileUnevaluated" IS 'True for a model that was Published before the lifecycle gate, demoted to Unevaluated and kept serving its pipeline until a model published through the gate replaces it. Never set by an entity save.';

/* ============================================================================ */
/* 3. MLModel: one version per pipeline */
/* ============================================================================ */
/* A duplicate (PipelineID, Version) row keeps its place only when it is the oldest of its group; every */
/* other one is renumbered above the pipeline's highest version, oldest __mj_CreatedAt first, and its old */
/* number is kept in Lineage.renumberedFromVersion. A Lineage that is NULL or not valid JSON is replaced by */
/* {"renumberedFromVersion": n}, so one malformed value cannot abort the migration (the old text is not kept). */
WITH "Ranked" AS (
  SELECT
    "ID",
    "PipelineID",
    "__mj_CreatedAt",
    ROW_NUMBER() OVER (PARTITION BY "PipelineID", "Version" ORDER BY "__mj_CreatedAt", "ID") AS "DuplicateRank"
  FROM __mj."MLModel"
), "Moves" AS (
  SELECT
    "r"."ID",
    "top_version"."MaxVersion" + ROW_NUMBER() OVER (PARTITION BY "r"."PipelineID" ORDER BY "r"."__mj_CreatedAt", "r"."ID") AS "NewVersion"
  FROM "Ranked" AS "r"
  JOIN (
    SELECT
      "PipelineID",
      MAX("Version") AS "MaxVersion"
    FROM __mj."MLModel"
    GROUP BY
      "PipelineID"
  ) AS "top_version"
    ON "top_version"."PipelineID" = "r"."PipelineID"
  WHERE
    "r"."DuplicateRank" > 1
)
-- [edge.2 hand-fix] JSON_MODIFY was emitted untranslated. jsonb_set / jsonb_build_object, stored back as text
-- (Lineage is TEXT). ISJSON → IS JSON OBJECT: jsonb_set needs an object; any other value is replaced, as SS does for
-- a NULL or malformed one.
UPDATE __mj."MLModel" AS "m" SET "Lineage" = CASE
  WHEN "m"."Lineage" IS JSON OBJECT
  THEN jsonb_set("m"."Lineage"::jsonb, '{renumberedFromVersion}', to_jsonb("m"."Version"))::text
  ELSE jsonb_build_object('renumberedFromVersion', "m"."Version")::text
END, "Version" = "mv"."NewVersion"
FROM "Moves" AS "mv"
WHERE
  "mv"."ID" = "m"."ID";

CREATE UNIQUE INDEX "UX_MLModel_PipelineVersion" ON __mj."MLModel"("PipelineID", "Version") NULLS NOT DISTINCT;

/* ============================================================================ */
/* 4. FeatureValue: the latest value of one record's feature, by effective date */
/* ============================================================================ */
CREATE INDEX "IX_FeatureValue_Record_Feature_AsOf" ON __mj."FeatureValue"("EntityID", "RecordID", "FeatureName", "EffectiveAsOf" DESC NULLS LAST, "ComputedAt" DESC NULLS LAST) INCLUDE ("Source", "Role");

/* ============================================================================ */
/* 5. vwLatestFeatureValues and the MJ: Latest Feature Values virtual entity */
/* ============================================================================ */
/* One row per (EntityID, RecordID, FeatureName): the newest Champion row by EffectiveAsOf, then ComputedAt */
/* (a descending ORDER BY puts a NULL EffectiveAsOf last, so a dated value beats an undated one). ID leads, */
/* because CodeGen makes the first column of a virtual entity with no primary key its key. A filter on the */
/* partition columns is pushed below the window and seeks IX_FeatureValue_Record_Feature_AsOf. */
CREATE OR REPLACE VIEW __mj."vwLatestFeatureValues" AS
SELECT
  "fv"."ID",
  "fv"."EntityID",
  "fv"."RecordID",
  "fv"."FeatureName",
  "fv"."Source",
  "fv"."Role",
  "fv"."EffectiveAsOf",
  "fv"."ComputedAt",
  "fv"."MLModelID",
  "fv"."RecordProcessID",
  "fv"."ValueText",
  "fv"."ValueNumeric",
  "fv"."ValueDate",
  "fv"."ValueBoolean",
  "fv"."ValueJSON",
  "fv"."Confidence"
FROM (
  SELECT
    "f".*,
    ROW_NUMBER() OVER (
      PARTITION BY "f"."EntityID", "f"."RecordID", "f"."FeatureName"
      ORDER BY "f"."EffectiveAsOf" DESC NULLS LAST, "f"."ComputedAt" DESC NULLS LAST, "f"."ID" DESC NULLS LAST
    ) AS "LatestRank"
  FROM __mj."FeatureValue" AS "f"
  WHERE
    "f"."Role" = 'Champion'
) AS "fv"
WHERE
  "fv"."LatestRank" = 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."Entity" WHERE "ID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7') THEN
    INSERT INTO __mj."Entity" ("ID", "Name", "Description", "SchemaName", "BaseTable", "BaseView", "BaseViewGenerated", "VirtualEntity", "IncludeInAPI", "AllowCreateAPI", "AllowUpdateAPI", "AllowDeleteAPI", "AllowAllRowsAPI", "spCreateGenerated", "spUpdateGenerated", "spDeleteGenerated", "TrackRecordChanges") VALUES ('1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'MJ: Latest Feature Values', 'The latest value of each record''s feature: one row per entity, record and feature name, the newest Champion Feature Value by effective date, then computation time. Read-only.', '__mj', 'vwLatestFeatureValues', 'vwLatestFeatureValues', FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE);
  END IF;
END $$;

ALTER TABLE __mj."FeatureValue"
  ADD COLUMN "MLModelScoringBindingID" UUID NULL,
  ADD COLUMN "MLScoringRunID" UUID NULL,
  ADD COLUMN "InTraining" BOOLEAN NULL
 /* ============================================================================ */ /* 6. FeatureValue: model predictions and their lineage */ /* ============================================================================ */ /* A model's prediction is a Feature Value with Source = 'Model'. It names the scoring binding that defines it, the */ /* scoring run that wrote it and whether the record was in the model's training snapshot; MLModelID (the exact model */ /* version that scored it) is V202611101901__v6.3.x__Task_Security_Saga_Shadow_Scoring's column. A Model row carries no */ /* Record Process, so RecordProcessID becomes nullable; the lineage check keeps a Pipeline row on its Record Process. */;

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
    WHERE tc.relname = 'FeatureValue' AND a.attname = 'RecordProcessID'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."FeatureValue" ALTER COLUMN "RecordProcessID" TYPE UUID, ALTER COLUMN "RecordProcessID" DROP NOT NULL;
ALTER TABLE __mj."FeatureValue"
DROP CONSTRAINT "CK_FeatureValue_Source";

ALTER TABLE __mj."FeatureValue"
  ADD CONSTRAINT "CK_FeatureValue_Source" CHECK ("Source" IN ('Pipeline', 'Human', 'Model')),
  ADD CONSTRAINT "CK_FeatureValue_SourceLineage" CHECK ((
    "Source" = 'Pipeline' AND NOT "RecordProcessID" IS NULL
  ) /* Pipeline: a pipeline's answer, and the champion audit and challenger rows (their MLModelID is unconstrained here) */
  OR /* Human: a person's value on a pipeline target, or on a binding scored with no Record Process */ (
    "Source" = 'Human'
    AND (
      NOT "RecordProcessID" IS NULL OR NOT "MLModelScoringBindingID" IS NULL
    )
  )
  OR /* Model: a prediction carries its binding, model, run, as-of instant and in-training flag */ (
    "Source" = 'Model'
    AND NOT "MLModelScoringBindingID" IS NULL
    AND NOT "MLModelID" IS NULL
    AND NOT "MLScoringRunID" IS NULL
    AND NOT "EffectiveAsOf" IS NULL
    AND NOT "InTraining" IS NULL
  )),
  ADD CONSTRAINT "FK_FeatureValue_ScoringBinding" FOREIGN KEY ("MLModelScoringBindingID") REFERENCES __mj."MLModelScoringBinding" (
    "ID"
  ),
  ADD CONSTRAINT "FK_FeatureValue_ScoringRun" FOREIGN KEY ("MLScoringRunID") REFERENCES __mj."MLScoringRun" (
    "ID"
  );

/* One prediction per binding, record, as-of instant and role: a re-run of the same as-of date replaces it, and a */
/* challenger's row (Role = 'Challenger') sits beside the champion's. */
CREATE UNIQUE INDEX "UQ_FeatureValue_ModelRow" ON __mj."FeatureValue"("MLModelScoringBindingID", "EntityID", "RecordID", "EffectiveAsOf", "Role") NULLS NOT DISTINCT
WHERE
  "Source" = 'Model';

/* A binding's predictions over a period (the outcome join of a model's monitoring period), covered so it seeks. */
CREATE INDEX "IX_FeatureValue_Binding_AsOf" ON __mj."FeatureValue"("MLModelScoringBindingID", "EffectiveAsOf") INCLUDE ("EntityID", "RecordID", "Role", "MLModelID", "InTraining", "ValueNumeric", "ValueText")
WHERE
  "Source" = 'Model';

COMMENT ON COLUMN __mj."FeatureValue"."MLModelScoringBindingID" IS 'The scoring binding whose prediction this is; set on every Model row and on a person''s value entered on a binding.';

COMMENT ON COLUMN __mj."FeatureValue"."MLScoringRunID" IS 'The scoring run that wrote this Model row.';

COMMENT ON COLUMN __mj."FeatureValue"."InTraining" IS 'Model rows: true when the record was in the model''s training snapshot, so its score is optimistic.';

ALTER TABLE __mj."MLModelScoringBinding"
  ADD COLUMN "MLTrainingPipelineID" UUID NULL,
  ADD COLUMN "FeatureName" VARCHAR(255) NULL,
  ADD COLUMN "TargetColumnSource" VARCHAR(255) NULL,
  ADD COLUMN "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  ADD COLUMN "ViewAuthorizationID" UUID NULL,
  ADD COLUMN "RetentionDays" INT NULL
 /* ============================================================================ */ /* 7. MLModelScoringBinding: a binding defines a prediction feature */ /* ============================================================================ */ /* A binding names a training pipeline, not one model version: it scores with the pipeline's Published model, so a */ /* new version needs no binding change. Its predictions are Feature Values named FeatureName on TargetEntityID; a */ /* TargetColumn, when set, also receives a copy of the newest value, resolved from the result by TargetColumnSource. */;

/* ============================================================================ */
/* 8. MLModelScoringBinding: existing bindings */
/* ============================================================================ */
/* Each existing binding takes its model's pipeline, the target entity of that pipeline when it has none, and the */
/* pipeline's name as its feature name (a second binding of the same name on one entity gets " (2)", " (3)" …, oldest */
/* first). A binding that writes a column copies the value its write-back mapping wrote there: the adverse-class */
/* probability of a classification, the predicted value of a regression. The materialized mode, never used, becomes */
/* on-demand. The binding's column copy replaces the write-back mapping of each Record Process a binding names, so */
/* that mapping is cleared. */
UPDATE __mj."MLModelScoringBinding" AS "b" SET "MLTrainingPipelineID" = "m"."PipelineID"
FROM __mj."MLModel" AS "m"
WHERE
  "m"."ID" = "b"."MLModelID";

UPDATE __mj."MLModelScoringBinding" AS "b" SET "TargetEntityID" = "p"."TargetEntityID"
FROM __mj."MLTrainingPipeline" AS "p"
WHERE
  "p"."ID" = "b"."MLTrainingPipelineID" AND "b"."TargetEntityID" IS NULL;

WITH "Named" AS (
  SELECT
    "b"."ID",
    "p"."Name",
    ROW_NUMBER() OVER (
      PARTITION BY "b"."TargetEntityID", "p"."Name"
      ORDER BY "b"."__mj_CreatedAt", "b"."ID"
    ) AS "NameRank"
  FROM __mj."MLModelScoringBinding" AS "b"
  JOIN __mj."MLTrainingPipeline" AS "p"
    ON "p"."ID" = "b"."MLTrainingPipelineID"
), "Suffixed" AS (
  SELECT
    "ID",
    "Name",
    "NameRank",
    CASE
      WHEN "NameRank" = 1
      THEN ''
      ELSE ' (' || CAST("NameRank" AS VARCHAR(10)) || ')' /* [edge.2 hand-fix] + → || */
    END AS "Suffix"
  FROM "Named"
)
UPDATE __mj."MLModelScoringBinding" AS "b" SET "FeatureName" = LEFT(CAST("s"."Name" AS TEXT), 255 - LENGTH(CAST("s"."Suffix" AS TEXT))) || "s"."Suffix" /* [edge.2 hand-fix] + → || */
FROM "Suffixed" AS "s"
WHERE
  "s"."ID" = "b"."ID";

UPDATE __mj."MLModelScoringBinding" AS "b" SET "TargetColumnSource" = CASE "m"."ProblemType"
  WHEN 'classification'
  THEN '$.AdverseProbability'
  ELSE '$.Value'
END
FROM __mj."MLModel" AS "m"
WHERE
  "m"."ID" = "b"."MLModelID" AND NOT "b"."TargetColumn" IS NULL;
UPDATE __mj."MLModelScoringBinding" SET "Mode" = 'OnDemand'
WHERE
  "Mode" = 'Materialized';
UPDATE __mj."RecordProcess" SET "OutputMapping" = NULL
WHERE
  "ID" IN (
    SELECT
      "RecordProcessID"
    FROM __mj."MLModelScoringBinding"
    WHERE
      NOT "RecordProcessID" IS NULL
  );

-- [edge.2 hand-fix] PG's FK index is idx_auto_mj_fkey_ml_model_scoring_binding_ml_model_id (dropped with the column);
-- vwMLModelScoringBindings (b.*) depends on both dropped columns, so it is dropped first (the baked CodeGen
-- section below re-creates it and its functions); and PG needs one DROP COLUMN per column.
DROP INDEX IF EXISTS __mj."IDX_AUTO_MJ_FKEY_MLModelScoringBinding_MLModelID";
DROP INDEX IF EXISTS __mj."idx_auto_mj_fkey_ml_model_scoring_binding_ml_model_id";
DROP VIEW IF EXISTS __mj."vwMLModelScoringBindings" CASCADE;
ALTER TABLE __mj."MLModelScoringBinding"
DROP CONSTRAINT "FK_MLModelScoringBinding_MLModel";
ALTER TABLE __mj."MLModelScoringBinding"
DROP CONSTRAINT "CK_MLModelScoringBinding_Mode";
ALTER TABLE __mj."MLModelScoringBinding"
DROP COLUMN "MLModelID", DROP COLUMN "MaterializedResultID";

/* The MJ: ML Models -> MJ: ML Model Scoring Bindings relationship joined on the dropped MLModelID; CodeGen does not */
/* remove a relationship whose join field is gone, so it goes with the column. */
DELETE FROM __mj."EntityRelationship"
WHERE
  "ID" = 'B3324F8A-5E80-4C82-A929-5CF1B8E5D015';

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
    WHERE tc.relname = 'MLModelScoringBinding' AND a.attname = 'MLTrainingPipelineID'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModelScoringBinding" ALTER COLUMN "MLTrainingPipelineID" TYPE UUID, ALTER COLUMN "MLTrainingPipelineID" SET NOT NULL;
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
    WHERE tc.relname = 'MLModelScoringBinding' AND a.attname = 'FeatureName'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModelScoringBinding" ALTER COLUMN "FeatureName" TYPE VARCHAR(255), ALTER COLUMN "FeatureName" SET NOT NULL;

ALTER TABLE __mj."MLModelScoringBinding"
  ADD CONSTRAINT "FK_MLModelScoringBinding_Pipeline" FOREIGN KEY ("MLTrainingPipelineID") REFERENCES __mj."MLTrainingPipeline" (
    "ID"
  ),
  ADD CONSTRAINT "FK_MLModelScoringBinding_Authorization" FOREIGN KEY ("ViewAuthorizationID") REFERENCES __mj."Authorization" (
    "ID"
  ),
  ADD CONSTRAINT "CK_MLModelScoringBinding_Status" CHECK ("Status" IN ('Active', 'Withdrawn')),
  ADD CONSTRAINT "CK_MLModelScoringBinding_Retention" CHECK ("RetentionDays" IS NULL OR "RetentionDays" > 0),
  ADD CONSTRAINT "CK_MLModelScoringBinding_CopySource" CHECK ("TargetColumn" IS NULL OR NOT "TargetColumnSource" IS NULL),
  ADD CONSTRAINT "CK_MLModelScoringBinding_Mode" CHECK ("Mode" IN ('OnDemand', 'Scheduled'));

/* A feature name is unique on its entity: the latest-value view keys on (EntityID, RecordID, FeatureName). */
CREATE UNIQUE INDEX "UQ_MLModelScoringBinding_EntityFeature" ON __mj."MLModelScoringBinding"("TargetEntityID", "FeatureName") NULLS NOT DISTINCT
WHERE
  NOT "TargetEntityID" IS NULL;

COMMENT ON TABLE __mj."MLModelScoringBinding" IS 'Defines a prediction feature: the training pipeline whose Published model scores, the entity whose records it scores and the feature name its predictions are stored under as Feature Values. Optionally copies the newest value into an existing column. Who may see the predictions is ViewAuthorizationID.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."TargetColumn" IS 'Name of an existing column of the target entity that also receives the newest prediction; NULL stores the predictions as Feature Values only.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."Mode" IS 'Scoring mode: OnDemand or Scheduled.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."MLTrainingPipelineID" IS 'The training pipeline whose Published model scores for this binding; publishing a new version needs no binding change.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."FeatureName" IS 'The feature name the predictions are stored under, unique on the target entity.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."TargetColumnSource" IS 'The result reference ($.Value, $.Class, $.AdverseProbability or $.Probabilities.<class>) the column copy writes into TargetColumn; required when TargetColumn is set.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."Status" IS 'Active or Withdrawn. A withdrawn binding no longer scores, and the column copies it made are cleared; its Feature Values stay.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."ViewAuthorizationID" IS 'The authorization a user must hold to see this binding''s predictions; a binding with none is visible to no user.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."RetentionDays" IS 'Days of prediction history kept; NULL keeps all of it.';

/* ============================================================================ */
/* 10. vwUserHeldAuthorizations: the authorizations each user holds */
/* ============================================================================ */
/* MJ's authorization rule in SQL. An Owner holds every authorization. Any other user holds one when it is active, none */
/* of the user's roles has a Deny grant on it, and it or an ancestor (the ParentID chain, cycles stopped) is active with */
/* an Allow grant and no Deny grant among the user's roles. A grant whose Type is not Allow counts as a Deny. */
-- [edge.2 hand-fix] WITH → WITH RECURSIVE (the CTE references itself) and the string + → || (3 places).
CREATE OR REPLACE VIEW __mj."vwUserHeldAuthorizations" AS
WITH RECURSIVE "AuthorizationChain" AS (
  SELECT
    "a"."ID" AS "AuthorizationID",
    "a"."ID" AS "NodeID",
    "a"."ParentID" AS "NextID",
    CAST('|' || CAST("a"."ID" AS VARCHAR(36)) || '|' AS TEXT) AS "Visited"
  FROM __mj."Authorization" AS "a"
  UNION ALL
  SELECT
    "c"."AuthorizationID",
    "parent"."ID",
    "parent"."ParentID",
    "c"."Visited" || CAST("parent"."ID" AS VARCHAR(36)) || '|'
  FROM "AuthorizationChain" AS "c"
  JOIN __mj."Authorization" AS "parent"
    ON "parent"."ID" = "c"."NextID"
  WHERE
    POSITION('|' || CAST("parent"."ID" AS VARCHAR(36)) || '|' IN "c"."Visited") = 0
), "UserGrant" AS (
  SELECT
    "ur"."UserID",
    "ar"."AuthorizationID",
    MAX(CASE WHEN LTRIM(RTRIM("ar"."Type")) = 'Allow' THEN 1 ELSE 0 END) AS "HasAllow",
    MAX(CASE WHEN LTRIM(RTRIM("ar"."Type")) = 'Allow' THEN 0 ELSE 1 END) AS "HasDeny"
  FROM __mj."UserRole" AS "ur"
  JOIN __mj."AuthorizationRole" AS "ar"
    ON "ar"."RoleID" = "ur"."RoleID"
  GROUP BY
    "ur"."UserID",
    "ar"."AuthorizationID"
)
SELECT
  "u"."ID" AS "UserID",
  "a"."ID" AS "AuthorizationID"
FROM __mj."User" AS "u"
CROSS JOIN __mj."Authorization" AS "a"
WHERE
  LTRIM(RTRIM("u"."Type")) = 'Owner'
UNION
SELECT
  "g"."UserID",
  "c"."AuthorizationID"
FROM "AuthorizationChain" AS "c"
JOIN __mj."Authorization" AS "linked"
  ON "linked"."ID" = "c"."AuthorizationID" AND "linked"."IsActive" = TRUE
JOIN __mj."Authorization" AS "node"
  ON "node"."ID" = "c"."NodeID" AND "node"."IsActive" = TRUE
JOIN "UserGrant" AS "g"
  ON "g"."AuthorizationID" = "c"."NodeID" AND "g"."HasAllow" = 1 AND "g"."HasDeny" = 0
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM "UserGrant" AS "d"
    WHERE
      "d"."UserID" = "g"."UserID"
      AND "d"."AuthorizationID" = "c"."AuthorizationID"
      AND "d"."HasDeny" = 1
  );

/* ============================================================================ */
/* 11. vwLatestFeatureValues re-created with the prediction lineage */
/* ============================================================================ */
/* Section 5's view with the three lineage columns of section 6, so a reader of the latest value sees which binding, */
/* scoring run and training-set membership it came from. ID still leads. */
CREATE OR REPLACE VIEW __mj."vwLatestFeatureValues" AS
SELECT
  "fv"."ID",
  "fv"."EntityID",
  "fv"."RecordID",
  "fv"."FeatureName",
  "fv"."Source",
  "fv"."Role",
  "fv"."EffectiveAsOf",
  "fv"."ComputedAt",
  "fv"."MLModelScoringBindingID",
  "fv"."MLModelID",
  "fv"."MLScoringRunID",
  "fv"."InTraining",
  "fv"."RecordProcessID",
  "fv"."ValueText",
  "fv"."ValueNumeric",
  "fv"."ValueDate",
  "fv"."ValueBoolean",
  "fv"."ValueJSON",
  "fv"."Confidence"
FROM (
  SELECT
    "f".*,
    ROW_NUMBER() OVER (
      PARTITION BY "f"."EntityID", "f"."RecordID", "f"."FeatureName"
      ORDER BY "f"."EffectiveAsOf" DESC NULLS LAST, "f"."ComputedAt" DESC NULLS LAST, "f"."ID" DESC NULLS LAST
    ) AS "LatestRank"
  FROM __mj."FeatureValue" AS "f"
  WHERE
    "f"."Role" = 'Champion'
) AS "fv"
WHERE
  "fv"."LatestRank" = 1;

-- ===================== HAND-FINISHED (v6.3.0-edge.2 release build) =====================
-- spDeleteEntityWithCoreDependencies (section 12). The split converter reports the proc as needs-hand
-- (a T-SQL transpile of it is not usable). This is the V202611120915 PostgreSQL port verbatim plus the
-- SQL Server delta 120915 → 231001, which is exactly four changes (SS bodies diffed):
--   1. 'MLScoringRun.ScopeEntityID' joins the handled-reference list (kept alphabetical, as on PG).
--   2. `UPDATE FeatureValue SET MLModelID = NULL WHERE MLModelID IN models` moves down (after the
--      models' predictions are deleted).
--   3. `DELETE MLModelScoringBinding WHERE MLModelID IN models` (MLModelID is dropped in section 9) is
--      replaced by the serving-ledger cleanup: MLModelPublishRecord, MLModel lineage links, model
--      predictions, MLOutputBinding, MLScoringRun, MLMonitoringResult, binding feature values and the
--      pipelines' MLModelScoringBinding rows, in the SS order.
--   4. After the MLTrainingPipeline delete: scoring runs scoped to this entity and their feature values.
-- @PipelineIDs / @MLModelIDs table variables → the port's existing v_PipelineIDs / v_MLModelIDs uuid[].
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
        'Artifact.DelegateEntityID',
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
        'EntityUniqueKey.EntityID',
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
        'MLScoringRun.ScopeEntityID',
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
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding / CK_Artifact_DelegateBinding: both columns or neither
    UPDATE __mj."AIAgentSession" SET "LinkedEntityID" = NULL, "LinkedRecordID" = NULL WHERE "LinkedEntityID" = p_EntityID;
    UPDATE __mj."Artifact" SET "DelegateEntityID" = NULL, "DelegateRecordID" = NULL WHERE "DelegateEntityID" = p_EntityID;
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
    -- the serving ledger: the models' publish records and the runs' run-level refusals (ModelID NULL) are deleted; a
    -- surviving record that consumed one of their sign-offs, replaced one of the models or names one of the runs loses
    -- only the link.
    -- the only mutation of a publish record: spDeleteEntityWithCoreDependencies clears SignOffID/ReplacesModelID when the referenced row is removed with its entity
    UPDATE __mj."MLModelPublishRecord" SET "SignOffID" = NULL WHERE "SignOffID" IN (SELECT "ID" FROM __mj."MLModelPublishRecord" WHERE "ModelID" = ANY (v_MLModelIDs) OR ("ModelID" IS NULL AND "TrainingRunID" IN (SELECT "ID" FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs))));
    UPDATE __mj."MLModelPublishRecord" SET "ReplacesModelID" = NULL WHERE "ReplacesModelID" = ANY (v_MLModelIDs);
    DELETE FROM __mj."MLModelPublishRecord" WHERE "ModelID" = ANY (v_MLModelIDs) OR ("ModelID" IS NULL AND "TrainingRunID" IN (SELECT "ID" FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs)));
    -- the rows left that name one of the runs have a ModelID, so clearing TrainingRunID keeps CK_MLModelPublishRecord_Subject
    UPDATE __mj."MLModelPublishRecord" SET "TrainingRunID" = NULL WHERE "TrainingRunID" IN (SELECT "ID" FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs));
    -- another pipeline's model that names one of these runs or snapshots loses only the lineage link
    UPDATE __mj."MLModel" SET "TrainingRunID" = NULL WHERE "TrainingRunID" IN (SELECT "ID" FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs));
    UPDATE __mj."MLModel" SET "TrainingSnapshotID" = NULL WHERE "TrainingSnapshotID" IN (SELECT "ID" FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs));
    -- the models' predictions are deleted before MLModelID is cleared on any other Feature Value
    DELETE FROM __mj."FeatureValue" WHERE "Source" = 'Model' AND "MLModelID" = ANY (v_MLModelIDs);
    UPDATE __mj."FeatureValue" SET "MLModelID" = NULL WHERE "MLModelID" = ANY (v_MLModelIDs);
    -- output bindings, scoring runs (CK_MLScoringRun_Model forbids clearing a run's model) and monitoring results
    DELETE FROM __mj."MLOutputBinding" WHERE "ModelID" = ANY (v_MLModelIDs);
    DELETE FROM __mj."FeatureValue" WHERE "MLScoringRunID" IN (SELECT "ID" FROM __mj."MLScoringRun" WHERE "ModelID" = ANY (v_MLModelIDs));
    DELETE FROM __mj."MLScoringRun" WHERE "ModelID" = ANY (v_MLModelIDs);
    UPDATE __mj."MLScoringRun" SET "MLModelScoringBindingID" = NULL WHERE "MLModelScoringBindingID" IN (SELECT "ID" FROM __mj."MLModelScoringBinding" WHERE "MLTrainingPipelineID" = ANY (v_PipelineIDs));
    DELETE FROM __mj."MLMonitoringResult" WHERE "ModelID" = ANY (v_MLModelIDs);
    UPDATE __mj."MLMonitoringResult" SET "ChallengerRunID" = NULL WHERE "ChallengerRunID" IN (SELECT "ID" FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs));
    DELETE FROM __mj."FeatureValue" WHERE "MLModelScoringBindingID" IN (SELECT "ID" FROM __mj."MLModelScoringBinding" WHERE "MLTrainingPipelineID" = ANY (v_PipelineIDs));
    DELETE FROM __mj."MLModelScoringBinding" WHERE "MLTrainingPipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLTrainingRun" WHERE "PipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLModel" WHERE "PipelineID" = ANY (v_PipelineIDs);
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE __mj."MLTrainingRun" SET "TrainingSnapshotID" = NULL WHERE "TrainingSnapshotID" IN (SELECT "ID" FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs));
    DELETE FROM __mj."MLTrainingSnapshot" WHERE "PipelineID" = ANY (v_PipelineIDs);
    DELETE FROM __mj."MLTrainingPipeline" WHERE "TargetEntityID" = p_EntityID;
    -- scoring runs scoped to this entity, whatever model they ran (ScopeEntityID is NOT NULL)
    DELETE FROM __mj."FeatureValue" WHERE "MLScoringRunID" IN (SELECT "ID" FROM __mj."MLScoringRun" WHERE "ScopeEntityID" = p_EntityID);
    DELETE FROM __mj."MLScoringRun" WHERE "ScopeEntityID" = p_EntityID;

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
    DELETE FROM __mj."EntityUniqueKey" WHERE "EntityID" = p_EntityID;
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

-- ===================== HAND-FINISHED (v6.3.0-edge.2 release build) =====================
-- Section 13: MLModel — models trained before the lifecycle gate (documented exception D4-13 of the
-- T-SQL file: raw UPDATEs, no Record Changes rows; a one-time data fix).
-- The split converter reported every statement of this batch as unhandled (DECLARE @Evidence /
-- @Serving TABLE, INSERT … CROSS APPLY, UPDATE m … FROM … JOIN @t, WITH … UPDATE / INSERT). Ported by hand:
--  * @Evidence / @Serving table variables → temp tables, dropped at the end of the section.
--  * CROSS APPLY (SELECT TOP 1 … ORDER BY …) → CROSS JOIN LATERAL (… LIMIT 1).
--  * CASE WHEN ISJSON(v) = 1 THEN JSON_VALUE(v, '$.gate.decision.outcome') END IS NOT NULL →
--    v IS JSON AND jsonb_typeof(v::jsonb #> '{gate,decision,outcome}') IN ('string','number','boolean')
--    (JSON_VALUE is NULL for a missing path, a JSON null and an object/array; a malformed value still
--    cannot abort the migration).
--  * UPDATE m … FROM MLModel m JOIN x → UPDATE __mj."MLModel" AS m … FROM x WHERE …; the final
--    LEFT JOIN @Serving → EXISTS (… _ps_serving …). ServingWhileUnevaluated is BOOLEAN on PG.
--  * Statement order and every predicate are the T-SQL's. Note: the "ID DESC" tie-breaks sort uuid on
--    PG and uniqueidentifier on SQL Server (different byte order); they decide only between rows with
--    the same __mj_CreatedAt (and Version).
DROP TABLE IF EXISTS pg_temp."_ps_evidence";
DROP TABLE IF EXISTS pg_temp."_ps_serving";
CREATE TEMP TABLE "_ps_evidence" ("ModelID" UUID NOT NULL PRIMARY KEY, "TrainingRunID" UUID NOT NULL);
CREATE TEMP TABLE "_ps_serving" ("ModelID" UUID NOT NULL PRIMARY KEY);

INSERT INTO "_ps_evidence" ("ModelID", "TrainingRunID")
SELECT m."ID", run."ID"
FROM __mj."MLModel" m
CROSS JOIN LATERAL (
    SELECT r."ID"
    FROM __mj."MLTrainingRun" r
    WHERE r."ResultingModelID" = m."ID"
      AND r."ValidationResults" IS JSON
      AND jsonb_typeof(r."ValidationResults"::jsonb #> '{gate,decision,outcome}') IN ('string', 'number', 'boolean')
    ORDER BY r."__mj_CreatedAt" DESC, r."ID" DESC
    LIMIT 1
) AS run
WHERE m."Delivery" IS NULL
  AND m."Status" IN ('Draft', 'Validated', 'Published');

UPDATE __mj."MLModel" AS m
   SET "TrainingRunID"  = e."TrainingRunID",
       "ArtifactStatus" = 'unverified',
       "Status"         = CASE WHEN m."Status" = 'Validated' THEN 'Draft' ELSE m."Status" END
FROM "_ps_evidence" e
WHERE e."ModelID" = m."ID";

WITH "RankedEvidence" AS (
    SELECT m."ID",
           ROW_NUMBER() OVER (PARTITION BY m."PipelineID" ORDER BY m."__mj_CreatedAt" DESC, m."Version" DESC, m."ID" DESC) AS "NewestRank"
    FROM __mj."MLModel" m
    JOIN "_ps_evidence" e ON e."ModelID" = m."ID"
    WHERE m."Status" = 'Published'
)
UPDATE __mj."MLModel" AS m
   SET "Status"       = 'Archived',
       "StatusReason" = 'Superseded: more than one Published model of the pipeline before the lifecycle gate'
FROM "RankedEvidence" ranked
WHERE ranked."ID" = m."ID"
  AND ranked."NewestRank" > 1;

WITH "RankedLegacy" AS (
    SELECT m."ID",
           ROW_NUMBER() OVER (PARTITION BY m."PipelineID" ORDER BY m."__mj_CreatedAt" DESC, m."Version" DESC, m."ID" DESC) AS "NewestRank"
    FROM __mj."MLModel" m
    WHERE m."Status" = 'Published'
      AND m."Delivery" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "_ps_evidence" e WHERE e."ModelID" = m."ID")
      AND NOT EXISTS (SELECT 1
                      FROM __mj."MLModel" kept
                      JOIN "_ps_evidence" ke ON ke."ModelID" = kept."ID"
                      WHERE kept."PipelineID" = m."PipelineID" AND kept."Status" = 'Published')
)
INSERT INTO "_ps_serving" ("ModelID")
SELECT "ID" FROM "RankedLegacy" WHERE "NewestRank" = 1;

UPDATE __mj."MLModel" AS m
   SET "Status"                  = 'Unevaluated',
       "ArtifactStatus"          = 'unverified',
       "ServingWhileUnevaluated" = EXISTS (SELECT 1 FROM "_ps_serving" s WHERE s."ModelID" = m."ID"),
       "StatusReason"            = CASE WHEN NOT EXISTS (SELECT 1 FROM "_ps_serving" s WHERE s."ModelID" = m."ID")
           THEN 'Trained before the Predictive Studio lifecycle gate; never evaluated under an Evaluation Protocol; the pipeline is retrained under its protocol automatically.'
           ELSE 'Trained before the Predictive Studio lifecycle gate and still serving; never evaluated under an Evaluation Protocol; replaced automatically when a model is published through the gate.' END
WHERE m."Status" IN ('Draft', 'Validated', 'Published')
  AND m."Delivery" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "_ps_evidence" e WHERE e."ModelID" = m."ID");

DROP TABLE IF EXISTS pg_temp."_ps_evidence";
DROP TABLE IF EXISTS pg_temp."_ps_serving";
-- ===================== END HAND-FINISHED =====================

/* At most one Published model per pipeline. Created after the statuses above, so a pipeline that would still hold two */
/* fails the migration here instead of serving from either. */
CREATE UNIQUE INDEX "UX_MLModel_OnePublishedPerPipeline" ON __mj."MLModel"("PipelineID") NULLS NOT DISTINCT
WHERE
  "Status" = 'Published';

/* =====================================================================================
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and EntityField metadata for MJ: ML Model Publish Records, MJ: ML Scoring Runs,
 * MJ: ML Monitoring Results, MJ: ML Output Bindings and the virtual entity MJ: Latest Feature
 * Values; new and dropped fields of MJ: ML Models, MJ: Feature Values and MJ: ML Model Scoring
 * Bindings; value lists, entity relationships, entity unique keys (including three for the
 * training schema's existing unique constraints, which the unique-key table was created without),
 * field categories and descriptions; base views, spCreate/spUpdate/spDelete (spUpdate* in the
 * single-write form, with the __mj_UpdatedAt trigger guarded by IF NOT UPDATE), permissions and
 * FK indexes. CodeGen ran on a database built from scratch by mj migrate with the hand-written
 * section above alone; a second database built from scratch with this section appended emits
 * nothing of this migration's. Four statements CodeGen emits on every fresh install belong to
 * V202611161958__v6.3.x__Artifact_Guest_Share_Links_And_WorkingState_Fixes (the MJ: Artifact
 * Guest Share Links unique key and three related-entity name-field maps), so they are not here.
 * Do NOT edit by hand: if the DDL above changes, re-run CodeGen and replace this section.
 * Two hand edits, each marked "HAND EDIT" where it is, must be re-applied after any regeneration (the
 * three guarded EntityUniqueKey inserts for the training schema's constraints are gone: next's
 * V202611201630__v6.3.x__ChiefOfStaff_ExtensibleSkills_And_AgentChannels ships those rows): the
 * MJ: Latest Feature Values EntityID field is inserted with
 * AutoUpdateRelatedEntityInfo = 0; and (5) the seven bounded-text columns of MJ: ML Models that
 * CodeGen may pick as the name field are set to AutoUpdateIsNameField = 0. Two generated blocks are
 * deleted, not edited, whenever CodeGen emits them (no marker): a "Set LLM-identified FKs" block for
 * MJ: Latest Feature Values and an MJ: Entities -> MJ: Latest Feature Values EntityRelationship
 * derived from that FK (a relationship with no FK behind it); this regeneration emitted neither. One
 * generated statement is deleted (no marker): the LLM decoration's IsNameField = 1 on MJ: ML Models.TargetVariable.
 * Kept, it gives every foreign key into MLModel a joined name column; HAND EDIT (5) keeps CodeGen from choosing one.
 * ===================================================================================== */
/* SQL generated to create new entity MJ: ML Model Publish Records */
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
    'bc5c5f60-2512-467a-bec8-14b4d8d3b640',
    'MJ: ML Model Publish Records',
    'ML Model Publish Records',
    'The publish ledger of ML models: every human sign-off, every applied publish or rollback (automatic or by a person) and every refused publish attempt. An audit trail only: the lifecycle gate re-derives each decision from the stored evaluation and the model''s Delivery. Rows are never updated, except that spDeleteEntityWithCoreDependencies clears SignOffID, ReplacesModelID and TrainingRunID on surviving rows when the referenced row is deleted with its entity.',
    NULL,
    'MLModelPublishRecord',
    'vwMLModelPublishRecords',
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
/* SQL generated to add entity MJ: ML Model Publish Records to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'bc5c5f60-2512-467a-bec8-14b4d8d3b640',
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
/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role UI */
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
  CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS UUID),
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
      "EntityID" = CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Developer */
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
  CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS UUID),
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
      "EntityID" = CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Model Publish Records for role Integration */
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
  CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS UUID),
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
      "EntityID" = CAST('bc5c5f60-2512-467a-bec8-14b4d8d3b640' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: ML Scoring Runs */
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
    'ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2',
    'MJ: ML Scoring Runs',
    'ML Scoring Runs',
    'One row per scoring call, dry runs and refusals included, written by the scoring service only. A running row exists before the first record is scored, so a crash leaves a visible row.',
    NULL,
    'MLScoringRun',
    'vwMLScoringRuns',
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
/* SQL generated to add entity MJ: ML Scoring Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2',
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
/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role UI */
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
  CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS UUID),
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
      "EntityID" = CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Developer */
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
  CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS UUID),
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
      "EntityID" = CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Scoring Runs for role Integration */
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
  CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS UUID),
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
      "EntityID" = CAST('ff3518d0-8bdc-440d-9480-8eb8cdf6d3b2' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: ML Monitoring Results */
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
    '18359693-d8df-4e8f-b5e1-d2c17b742834',
    'MJ: ML Monitoring Results',
    'ML Monitoring Results',
    'One row per Published model per monitoring period: the outcome join, the tracked metrics, drift, parity, the triggers that fired and the challenger and rollback checks.',
    NULL,
    'MLMonitoringResult',
    'vwMLMonitoringResults',
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
/* SQL generated to add entity MJ: ML Monitoring Results to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '18359693-d8df-4e8f-b5e1-d2c17b742834',
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
/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role UI */
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
  CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS UUID),
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
      "EntityID" = CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Developer */
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
  CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS UUID),
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
      "EntityID" = CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Monitoring Results for role Integration */
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
  CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS UUID),
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
      "EntityID" = CAST('18359693-d8df-4e8f-b5e1-d2c17b742834' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: ML Output Bindings */
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
    '75f9da13-10d3-4153-9299-e97f1ed296ad',
    'MJ: ML Output Bindings',
    'ML Output Bindings',
    'How one surface shows a model''s output: what it sorts by, which way driver directions point and the label. Created from the model''s OutputSemantics when the model is evaluated; a save that contradicts those semantics is refused.',
    NULL,
    'MLOutputBinding',
    'vwMLOutputBindings',
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
/* SQL generated to add entity MJ: ML Output Bindings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '75f9da13-10d3-4153-9299-e97f1ed296ad',
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
/* SQL generated to add new permission for entity MJ: ML Output Bindings for role UI */
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
  CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS UUID),
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
      "EntityID" = CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Developer */
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
  CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS UUID),
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
      "EntityID" = CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: ML Output Bindings for role Integration */
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
  CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS UUID),
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
      "EntityID" = CAST('75f9da13-10d3-4153-9299-e97f1ed296ad' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."MLModelPublishRecord"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLModelPublishRecord */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLModelPublishRecord */
UPDATE __mj."MLModelPublishRecord" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLModelPublishRecord' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModelPublishRecord" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLModelPublishRecord" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLModelPublishRecord"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLModelPublishRecord */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLModelPublishRecord */
UPDATE __mj."MLModelPublishRecord" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLModelPublishRecord' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModelPublishRecord" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLModelPublishRecord" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLScoringRun"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLScoringRun */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLScoringRun */
UPDATE __mj."MLScoringRun" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLScoringRun' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLScoringRun" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLScoringRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLScoringRun"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLScoringRun */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLScoringRun */
UPDATE __mj."MLScoringRun" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLScoringRun' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLScoringRun" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLScoringRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLMonitoringResult"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLMonitoringResult */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLMonitoringResult */
UPDATE __mj."MLMonitoringResult" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLMonitoringResult' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLMonitoringResult" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLMonitoringResult" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLMonitoringResult"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLMonitoringResult */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLMonitoringResult */
UPDATE __mj."MLMonitoringResult" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLMonitoringResult' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLMonitoringResult" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLMonitoringResult" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLOutputBinding"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLOutputBinding */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLOutputBinding */
UPDATE __mj."MLOutputBinding" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLOutputBinding' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLOutputBinding" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLOutputBinding" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLOutputBinding"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLOutputBinding */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLOutputBinding */
UPDATE __mj."MLOutputBinding" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLOutputBinding' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLOutputBinding" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLOutputBinding" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '80c5c1bb-6f0c-4c4f-b2cd-182162748e53' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('80c5c1bb-6f0c-4c4f-b2cd-182162748e53', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c1a24860-ae81-4cf5-8fe2-179e6b9f54bd' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'ModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c1a24860-ae81-4cf5-8fe2-179e6b9f54bd', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'ModelID', 'Model ID', 'The model the record is about. NULL only on a run-level refusal: a training run whose outcome produced no model row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '089114d6-5a6b-41a8-80ff-0b4fcfa82c21' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'TrainingRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('089114d6-5a6b-41a8-80ff-0b4fcfa82c21', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'TrainingRunID', 'Training Run ID', 'The training run the record is about; the idempotency key of a publish and of a run-level refusal.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '940329a6-0c44-44c2-b816-f192c3ddf75f' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Kind')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('940329a6-0c44-44c2-b816-f192c3ddf75f', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Kind', 'Kind', 'sign-off (a person approved or rejected), publish (a status change was applied) or refusal (a publish attempt was refused).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '381291ce-94e9-47e5-b465-216713718bfd' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Purpose')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('381291ce-94e9-47e5-b465-216713718bfd', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Purpose', 'Purpose', 'publish, rollback (an archived model published again), evaluate (a run-level outcome only) or adopt (a pre-change Published model re-verified).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cccd3301-bf44-457e-b997-a82342ce35f2' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'ApproverKind')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cccd3301-bf44-457e-b997-a82342ce35f2', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'ApproverKind', 'Approver Kind', 'automated-gate when no person approved the publish; user when a person published or the publish consumed that person''s approving sign-off.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '87b82e1a-cfd0-4b51-9127-e344c63f1373' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('87b82e1a-cfd0-4b51-9127-e344c63f1373', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'UserID', 'User ID', 'The person who approved, when ApproverKind is user.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44667eae-506d-4bfd-b6c8-92e4e148afb5' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Initiator')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44667eae-506d-4bfd-b6c8-92e4e148afb5', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Initiator', 'Initiator', 'JSON Actor: who started the attempt (a user, an agent run, a Record Process run or a scheduled job run).', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ab99cfe5-ddbf-4f08-a999-759012ade712' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'RecordedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ab99cfe5-ddbf-4f08-a999-759012ade712', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'RecordedAt', 'Recorded At', 'When the record was written.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1dd29ab7-cf34-4cc4-9bc3-cc694ea33480' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Decision')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1dd29ab7-cf34-4cc4-9bc3-cc694ea33480', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Decision', 'Decision', 'Sign-off rows only: approve or reject.', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88a11441-b549-45b5-8484-8b9ee7cdb5b3' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Reason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88a11441-b549-45b5-8484-8b9ee7cdb5b3', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Reason', 'Reason', 'The reason in plain words; required when the record overrides flags.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34e9db74-eaf9-419a-9b7c-895c4af44fa0' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'GateDecision')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34e9db74-eaf9-419a-9b7c-895c4af44fa0', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'GateDecision', 'Gate Decision', 'JSON GateDecision as the gate re-derived it at the publish, kept as a copy for audit. Required on publish rows.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'be4f236f-8b84-4931-b998-f2b568f8e714' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Evidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('be4f236f-8b84-4931-b998-f2b568f8e714', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Evidence', 'Evidence', 'JSON EvidenceSnapshot built by the server from stored rows at the moment of the sign-off or publish.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fef8d7f7-cb33-4dc5-8165-5d4288e02942' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'EvidenceSha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fef8d7f7-cb33-4dc5-8165-5d4288e02942', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'EvidenceSha256', 'Evidence Sha 256', 'SHA-256 of the canonical Evidence JSON; a sign-off authorises a publish only while it equals a fresh recomputation.', 'char', 64, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fa36fc82-f357-47a8-bd79-bde885e7e502' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'OverridesFlags')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fa36fc82-f357-47a8-bd79-bde885e7e502', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'OverridesFlags', 'Overrides Flags', 'JSON array of the leakage flags a sign-off acknowledges by name; empty on every other row.', 'nvarchar', -1, 0, 0, FALSE, '[]', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08b15f48-8f82-4df6-9f51-9e944fe5f4a4' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'SignOffID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08b15f48-8f82-4df6-9f51-9e944fe5f4a4', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'SignOffID', 'Sign Off ID', 'Publish rows: the human sign-off this publish consumed, when one was required.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7745439f-8c94-4042-9478-c89100c3ffc3' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'ReplacesModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7745439f-8c94-4042-9478-c89100c3ffc3', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'ReplacesModelID', 'Replaces Model ID', 'Publish rows: the model archived in the same transaction.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5791332f-d06d-4116-8c09-15269fc16d0f' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Refusal')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5791332f-d06d-4116-8c09-15269fc16d0f', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Refusal', 'Refusal', 'Refusal rows: JSON TransitionRefusal, the reason the attempt was refused.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77191e92-a1c6-4aeb-875f-feb94ab491e6' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'Transient')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('77191e92-a1c6-4aeb-875f-feb94ab491e6', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'Transient', 'Transient', 'Refusal rows: true when a retry may succeed.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f340669-13e9-4172-89ea-b9ee16f72407' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f340669-13e9-4172-89ea-b9ee16f72407', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2b16f733-8e05-4d1f-ba5b-9e23b96e8905' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2b16f733-8e05-4d1f-ba5b-9e23b96e8905', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3cb8070-e989-462a-acc9-07547455634d' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3cb8070-e989-462a-acc9-07547455634d', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7f56029-cf28-434c-b31e-4c236fe48ed5' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "AutoUpdateRelatedEntityInfo", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b7f56029-cf28-434c-b31e-4c236fe48ed5', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'EntityID', 'Entity ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', FALSE, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1d765f7a-d8f0-445d-b486-8f460efa9d26' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'RecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1d765f7a-d8f0-445d-b486-8f460efa9d26', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'RecordID', 'Record ID', NULL, 'nvarchar', 1800, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6dfc99b-3dbc-4d7e-8e9b-ca20265e1a03' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'FeatureName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6dfc99b-3dbc-4d7e-8e9b-ca20265e1a03', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'FeatureName', 'Feature Name', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f121d621-9b0a-412d-ad72-99e6d95ae363' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'Source')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f121d621-9b0a-412d-ad72-99e6d95ae363', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'Source', 'Source', NULL, 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9f933a69-6aab-4f53-848c-84118e48e113' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9f933a69-6aab-4f53-848c-84118e48e113', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'Role', 'Role', NULL, 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f803213-626c-4674-a9c7-e272e834a888' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'EffectiveAsOf')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3f803213-626c-4674-a9c7-e272e834a888', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'EffectiveAsOf', 'Effective As Of', NULL, 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '56a1a22f-5536-4ad4-af40-73bdc7d97469' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ComputedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('56a1a22f-5536-4ad4-af40-73bdc7d97469', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ComputedAt', 'Computed At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6126aad-2279-4778-bb39-2c840818ac49' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'MLModelScoringBindingID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f6126aad-2279-4778-bb39-2c840818ac49', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'MLModelScoringBindingID', 'ML Model Scoring Binding ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a14fc5f-1a67-493d-b3b1-04a8b7edc0db' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'MLModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3a14fc5f-1a67-493d-b3b1-04a8b7edc0db', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'MLModelID', 'ML Model ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '47fad71c-9ead-4f63-8b42-4103d908c454' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'MLScoringRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('47fad71c-9ead-4f63-8b42-4103d908c454', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'MLScoringRunID', 'ML Scoring Run ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7987f81-6e7c-46fc-b408-c2e543d9f27a' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'InTraining')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a7987f81-6e7c-46fc-b408-c2e543d9f27a', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'InTraining', 'In Training', NULL, 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34b2591a-814e-4186-b072-fa0fc5e96da8' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34b2591a-814e-4186-b072-fa0fc5e96da8', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'RecordProcessID', 'Record Process ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ac1e9d90-20c6-47bd-818d-1a155b37fc8b' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueText')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ac1e9d90-20c6-47bd-818d-1a155b37fc8b', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ValueText', 'Value Text', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '589b764f-fec8-4ef6-a936-289630132999' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueNumeric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('589b764f-fec8-4ef6-a936-289630132999', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ValueNumeric', 'Value Numeric', NULL, 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5e86b922-c294-46c4-b78a-b322dc75e394' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueDate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5e86b922-c294-46c4-b78a-b322dc75e394', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ValueDate', 'Value Date', NULL, 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e491cd6f-09e0-4d52-a5bd-c0d6f45ec0ef' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueBoolean')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e491cd6f-09e0-4d52-a5bd-c0d6f45ec0ef', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ValueBoolean', 'Value Boolean', NULL, 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9cb5af74-f68d-4ad0-99c4-0004d0e7b712' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9cb5af74-f68d-4ad0-99c4-0004d0e7b712', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'ValueJSON', 'Value JSON', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aadb4ba9-8cb3-42eb-9746-d3f36587169b' OR ("EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'Confidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aadb4ba9-8cb3-42eb-9746-d3f36587169b', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' /* Entity: MJ: Latest Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'), 'Confidence', 'Confidence', NULL, 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a5ab8b8-1db9-44de-ac6f-95f6561601b7' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'MLTrainingPipelineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a5ab8b8-1db9-44de-ac6f-95f6561601b7', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'MLTrainingPipelineID', 'ML Training Pipeline ID', 'The training pipeline whose Published model scores for this binding; publishing a new version needs no binding change.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '703FD109-331B-438D-902B-8E4A93C3F6AA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '13f4734b-cac4-40b6-a7a1-bbbb2c5ce0ff' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'FeatureName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('13f4734b-cac4-40b6-a7a1-bbbb2c5ce0ff', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'FeatureName', 'Feature Name', 'The feature name the predictions are stored under, unique on the target entity.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5a5b7894-74cb-42de-8749-351510121685' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'TargetColumnSource')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a5b7894-74cb-42de-8749-351510121685', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'TargetColumnSource', 'Target Column Source', 'The result reference ($.Value, $.Class, $.AdverseProbability or $.Probabilities.<class>) the column copy writes into TargetColumn; required when TargetColumn is set.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d45d97d-9dbc-42e0-bd83-33f7c91b6923' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d45d97d-9dbc-42e0-bd83-33f7c91b6923', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'Status', 'Status', 'Active or Withdrawn. A withdrawn binding no longer scores, and the column copies it made are cleared; its Feature Values stay.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c531130d-2663-402b-9643-57af83e76f08' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'ViewAuthorizationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c531130d-2663-402b-9643-57af83e76f08', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'ViewAuthorizationID', 'View Authorization ID', 'The authorization a user must hold to see this binding''s predictions; a binding with none is visible to no user.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'F9238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '134dd51d-b21a-437d-a82b-a9790472b91c' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'RetentionDays')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('134dd51d-b21a-437d-a82b-a9790472b91c', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'RetentionDays', 'Retention Days', 'Days of prediction history kept; NULL keeps all of it.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63758d3b-ebe1-4f32-8ddd-a6c56a403651' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'MLModelScoringBindingID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63758d3b-ebe1-4f32-8ddd-a6c56a403651', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'MLModelScoringBindingID', 'ML Model Scoring Binding ID', 'The scoring binding whose prediction this is; set on every Model row and on a person''s value entered on a binding.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'FD8EF230-65F3-496D-A117-7610572C35AA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8dc16bec-2aa6-4e87-88cd-6a2bdd606249' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'MLScoringRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8dc16bec-2aa6-4e87-88cd-6a2bdd606249', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'MLScoringRunID', 'ML Scoring Run ID', 'The scoring run that wrote this Model row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd99f2888-bb28-4435-91fa-e550bb4a5cbf' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'InTraining')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d99f2888-bb28-4435-91fa-e550bb4a5cbf', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'InTraining', 'In Training', 'Model rows: true when the record was in the model''s training snapshot, so its score is optimistic.', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd70f7357-7955-4a95-baca-2c1562af73ba' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'PredictionUnitID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d70f7357-7955-4a95-baca-2c1562af73ba', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'PredictionUnitID', 'Prediction Unit ID', 'The Prediction Unit version the model was trained under (the exact version row).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '56811dd1-2425-4943-93e4-699b08cca40c' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('56811dd1-2425-4943-93e4-699b08cca40c', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'EvaluationProtocolID', 'Evaluation Protocol ID', 'The Evaluation Protocol version the model was graded under (the exact version row).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7965bb9c-a42e-4dcc-8e32-a78d8309b922' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TrainingSnapshotID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7965bb9c-a42e-4dcc-8e32-a78d8309b922', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'TrainingSnapshotID', 'Training Snapshot ID', 'The Training Snapshot the model was trained on.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '859e225e-3777-47fe-86fe-38bcd231a562' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TrainingRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('859e225e-3777-47fe-86fe-38bcd231a562', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'TrainingRunID', 'Training Run ID', 'The training run that produced the model.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '53d76647-33d0-4f5f-860c-5ff4968e6429' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ArtifactSha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('53d76647-33d0-4f5f-860c-5ff4968e6429', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'ArtifactSha256', 'Artifact Sha 256', 'SHA-256 of the shipped artifact''s stored bytes; a load that hashes differently is refused.', 'char', 64, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e52dd2c2-0d59-4ffc-a9e9-90456a571e27' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'SnapshotHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e52dd2c2-0d59-4ffc-a9e9-90456a571e27', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'SnapshotHash', 'Snapshot Hash', 'Content hash of the training snapshot, copied at registration.', 'char', 64, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'caaa603e-d0ba-4796-9851-eee910205605' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'CodeVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('caaa603e-d0ba-4796-9851-eee910205605', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'CodeVersion', 'Code Version', 'JSON CodeVersion of the training code: git commit, sidecar version, library versions, threads and seed.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9bea6b10-2722-4ccf-8919-6cf80a634cdc' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'FeatureSchemaHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9bea6b10-2722-4ccf-8919-6cf80a634cdc', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'FeatureSchemaHash', 'Feature Schema Hash', 'Hash of the feature schema the model scores; a scoring request whose features hash differently is refused.', 'char', 64, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69e6b2e6-ce7d-4676-acee-6a24ab66eb87' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'OutputSemantics')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69e6b2e6-ce7d-4676-acee-6a24ab66eb87', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'OutputSemantics', 'Output Semantics', 'JSON {task}: what the model''s output means (the task type and, for a classification, the adverse class).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '32243fff-0ada-46b8-95e6-9e9a300b9ed3' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Delivery')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32243fff-0ada-46b8-95e6-9e9a300b9ed3', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'Delivery', 'Delivery', 'JSON RegisteredDelivery: what the training run shipped and the gate decision it shipped under.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7cd0993f-a915-4d50-9fd8-cadcc9a4ff0e' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'StatusReason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7cd0993f-a915-4d50-9fd8-cadcc9a4ff0e', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'StatusReason', 'Status Reason', 'Why the model has its status, in plain words: a kept baseline, a demotion to Unevaluated, an archive or a withheld publish.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d26a331-b246-4781-ab7e-5fc789ef4996' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ArtifactStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d26a331-b246-4781-ab7e-5fc789ef4996', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'ArtifactStatus', 'Artifact Status', 'Health of the stored artifact as last checked: unverified, verified, missing, hash-mismatch or legacy-local.', 'nvarchar', 40, 0, 0, FALSE, 'unverified', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd577f2f-8a21-44f1-82a9-a0545ef10ca6' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ArtifactCheckedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd577f2f-8a21-44f1-82a9-a0545ef10ca6', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'ArtifactCheckedAt', 'Artifact Checked At', 'When ArtifactStatus was last checked.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd181470a-ef06-4ff6-a288-c7b4479d5b42' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ServingWhileUnevaluated')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d181470a-ef06-4ff6-a288-c7b4479d5b42', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'ServingWhileUnevaluated', 'Serving While Unevaluated', 'True for a model that was Published before the lifecycle gate, demoted to Unevaluated and kept serving its pipeline until a model published through the gate replaces it. Never set by an entity save.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1e89cb7-38b9-42a0-849e-5fe2891056f9' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1e89cb7-38b9-42a0-849e-5fe2891056f9', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '92633337-875a-46e0-8b8a-c10043bf583a' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('92633337-875a-46e0-8b8a-c10043bf583a', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ModelID', 'Model ID', 'The exact model version that scored. NULL only on a refused run whose binding''s pipeline has no Published model.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '035103c4-23de-4842-9e5f-1838b2531358' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ModelVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('035103c4-23de-4842-9e5f-1838b2531358', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ModelVersion', 'Model Version', 'The model''s Version, copied at the run.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c1418070-bc06-4c81-a5e5-9157d98260e1' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'MLModelScoringBindingID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c1418070-bc06-4c81-a5e5-9157d98260e1', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'MLModelScoringBindingID', 'ML Model Scoring Binding ID', 'The scoring binding a writing run scored for; NULL for a call that returns its scores and writes no Feature Value.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'FD8EF230-65F3-496D-A117-7610572C35AA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e628b36a-a9ca-4ee1-b45c-c6c7ddeb946a' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ArtifactSha256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e628b36a-a9ca-4ee1-b45c-c6c7ddeb946a', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ArtifactSha256', 'Artifact Sha 256', 'SHA-256 of the artifact bytes that scored; NULL only when the run was refused before the artifact verified.', 'char', 64, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c29838b7-2f50-4427-88af-ee9e4181539c' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'FeatureSchemaHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c29838b7-2f50-4427-88af-ee9e4181539c', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'FeatureSchemaHash', 'Feature Schema Hash', 'Hash of the model''s feature schema the run scored with.', 'char', 64, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7f0d206-facb-41b7-b581-12028ad8c572' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Path')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a7f0d206-facb-41b7-b581-12028ad8c572', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Path', 'Path', 'Which caller ran it: score-record-set, record-process, monitoring, parity or predict.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c5ca5c1-9f48-40d8-a982-fde7b605a266' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ScopeKind')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c5ca5c1-9f48-40d8-a982-fde7b605a266', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ScopeKind', 'Scope Kind', 'How the scope names its records: record-ids, view or filter.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4274b247-7fe6-42af-82f1-54c01b0bfcfe' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ScopeEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4274b247-7fe6-42af-82f1-54c01b0bfcfe', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ScopeEntityID', 'Scope Entity ID', 'The entity whose records the scope names.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9eb4c128-62a6-4723-84be-b928b74a7b0d' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Scope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9eb4c128-62a6-4723-84be-b928b74a7b0d', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Scope', 'Scope', 'JSON ScoringScope: the records the call asked to score.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '292f38de-b136-4a24-9205-58c6eda4bfc3' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'EntityMapping')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('292f38de-b136-4a24-9205-58c6eda4bfc3', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'EntityMapping', 'Entity Mapping', 'JSON EntityRef mapping the scope entity onto the model''s grain, when they differ.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9fd64601-0b57-40a7-b646-7b3d923b4204' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'AsOfDate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9fd64601-0b57-40a7-b646-7b3d923b4204', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'AsOfDate', 'As Of Date', 'The as-of instant the features were read at.', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ca00152-6dfc-4d07-8d62-d2e756b476e5' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ReadPolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ca00152-6dfc-4d07-8d62-d2e756b476e5', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ReadPolicy', 'Read Policy', 'JSON ReadPolicy the features were read under.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b6434a0-8214-45cf-adf0-14eb1cee1991' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'DryRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b6434a0-8214-45cf-adf0-14eb1cee1991', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'DryRun', 'Dry Run', 'True when the call scored without writing anything.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4f07b62-0498-4c66-a9bf-7a7d6d21e1c1' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'RequestedBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4f07b62-0498-4c66-a9bf-7a7d6d21e1c1', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'RequestedBy', 'Requested By', 'JSON Actor: who asked for the run.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44a3f9e4-8767-4d71-8d31-800f5593537e' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'RequestedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44a3f9e4-8767-4d71-8d31-800f5593537e', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'RequestedByUserID', 'Requested By User ID', 'The requesting user, when a person asked; a joinable copy of RequestedBy.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '496111ba-dd23-453a-a738-0ffa3840175e' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ProcessRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('496111ba-dd23-453a-a738-0ffa3840175e', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ProcessRunID', 'Process Run ID', 'The Process Run, when the Record Process path ran it.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '9989A9A4-5546-4552-A765-B27EE399BFEA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '080ec5a4-cf1b-4bae-95bd-c7bfbc1442c2' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ScheduledJobRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('080ec5a4-cf1b-4bae-95bd-c7bfbc1442c2', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ScheduledJobRunID', 'Scheduled Job Run ID', 'The Scheduled Job Run, when monitoring or parity ran it.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '05853432-5E13-4F2A-8618-77857ADF17FA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1b99310-9e0d-4a03-8a4e-f1f96a8ec370' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d1b99310-9e0d-4a03-8a4e-f1f96a8ec370', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Status', 'Status', 'running, refused, failed or completed. A failed run keeps the batches it wrote before the failing one.', 'nvarchar', 40, 0, 0, FALSE, 'running', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a9d0eb0b-9a38-4ece-8ebd-e431b2927981' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Refusal')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a9d0eb0b-9a38-4ece-8ebd-e431b2927981', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Refusal', 'Refusal', 'JSON ScoringRefusal when the run was refused.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '014fcbc2-e056-4eeb-b192-ace37f3ff497' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Total')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('014fcbc2-e056-4eeb-b192-ace37f3ff497', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Total', 'Total', 'Records in scope.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1101bbc0-d03a-4635-9510-76635311bcbe' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Written')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1101bbc0-d03a-4635-9510-76635311bcbe', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Written', 'Written', 'Records whose prediction was written.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '286790aa-aa0f-4ae2-bfe5-0f7ae9672906' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Failed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('286790aa-aa0f-4ae2-bfe5-0f7ae9672906', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Failed', 'Failed', 'Records that failed to score.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '21a4210a-737e-4f7e-b11b-7c69567952fb' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'Skipped')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('21a4210a-737e-4f7e-b11b-7c69567952fb', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'Skipped', 'Skipped', 'Records skipped (for example, a person''s value the run must not overwrite).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '04257c99-90d3-4396-9402-657c9f558c58' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'FirstErrors')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('04257c99-90d3-4396-9402-657c9f558c58', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'FirstErrors', 'First Errors', 'JSON array of the first errors, at most 20, each {recordId, message}.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1605cc51-f9ad-4cb2-b4c3-7280e8bc6544' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1605cc51-f9ad-4cb2-b4c3-7280e8bc6544', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'StartedAt', 'Started At', 'When the run started.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c447f97a-de65-49b8-9b69-44e75347a05c' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'EndedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c447f97a-de65-49b8-9b69-44e75347a05c', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'EndedAt', 'Ended At', 'When the run ended; NULL while it runs.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a523ad28-ddf2-4a9f-b98d-98a496860eab' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a523ad28-ddf2-4a9f-b98d-98a496860eab', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6eda4eec-7c3f-4c68-affa-e0f8234ac3e5' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6eda4eec-7c3f-4c68-affa-e0f8234ac3e5', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c7230c6-1208-4299-8e20-d9f95c54bcc5' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3c7230c6-1208-4299-8e20-d9f95c54bcc5', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fedef598-ea62-4001-91f2-65a0d7c2ed69' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fedef598-ea62-4001-91f2-65a0d7c2ed69', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ModelID', 'Model ID', 'The model monitored.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1ee5d2d-3609-4f19-8ca1-58c4cad0a9e1' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ScheduledJobRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d1ee5d2d-3609-4f19-8ca1-58c4cad0a9e1', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ScheduledJobRunID', 'Scheduled Job Run ID', 'The monitoring job run that wrote the row; NULL for a run started from the UI or a test.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '05853432-5E13-4F2A-8618-77857ADF17FA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4cc916c1-6cf0-4392-93eb-a56f04bb62d5' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'Period')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4cc916c1-6cf0-4392-93eb-a56f04bb62d5', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'Period', 'Period', 'The first day of the period.', 'date', 3, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '98f67019-f93f-4dd6-bba1-70b848353726' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'PeriodGrain')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('98f67019-f93f-4dd6-bba1-70b848353726', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'PeriodGrain', 'Period Grain', 'week, month, quarter or year.', 'nvarchar', 20, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1aaf359f-c0a4-4cf0-8365-92803287fb66' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'State')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1aaf359f-c0a4-4cf0-8365-92803287fb66', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'State', 'State', 'window-open (outcomes not yet known), evaluated, insufficient-rows (fewer scored rows than the job''s minimum, so the period is recorded and not judged) or failed.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81d5492d-dde5-44ed-978e-e67909a7acab' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ScoredRows')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81d5492d-dde5-44ed-978e-e67909a7acab', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ScoredRows', 'Scored Rows', 'Predictions the model stored for the period.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c69f005a-a435-46c7-9de8-62e09d6e7209' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'JoinedRows')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c69f005a-a435-46c7-9de8-62e09d6e7209', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'JoinedRows', 'Joined Rows', 'Predictions joined to a known outcome.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0e7f6f2-b61a-4f20-bcf7-c485a500a404' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ExcludedInTrainingRows')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c0e7f6f2-b61a-4f20-bcf7-c485a500a404', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ExcludedInTrainingRows', 'Excluded In Training Rows', 'Joined predictions left out because the record was in the model''s training snapshot.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'afce783f-21f5-43c0-b6f2-b9c37fc4fbf2' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'PrimaryScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('afce783f-21f5-43c0-b6f2-b9c37fc4fbf2', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'PrimaryScore', 'Primary Score', 'JSON MetricWithInterval: the protocol''s primary metric over the joined rows.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '10699c33-22cf-4ba1-8079-3a354fcb49f9' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'PrimaryValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('10699c33-22cf-4ba1-8079-3a354fcb49f9', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'PrimaryValue', 'Primary Value', 'The primary metric''s value, copied from PrimaryScore for queries and charts.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cdfd9c3e-f52e-48ae-9843-2d7bc3860dd2' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'PrimaryLower')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cdfd9c3e-f52e-48ae-9843-2d7bc3860dd2', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'PrimaryLower', 'Primary Lower', 'The primary metric''s interval lower bound, copied from PrimaryScore.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c022edb6-4870-4cab-a9a9-e7ddbbe3b2fe' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'PrimaryUpper')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c022edb6-4870-4cab-a9a9-e7ddbbe3b2fe', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'PrimaryUpper', 'Primary Upper', 'The primary metric''s interval upper bound, copied from PrimaryScore.', 'float', 8, 53, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7da54052-f022-45e3-95bb-d7c70e07e539' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'TrackedMetrics')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7da54052-f022-45e3-95bb-d7c70e07e539', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'TrackedMetrics', 'Tracked Metrics', 'JSON array of MetricWithInterval: the other tracked metrics (positive rate, log loss, RMSE and so on).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'df8da9d9-8d9f-4272-9da7-73f16f1d3bc1' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'Calibration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('df8da9d9-8d9f-4272-9da7-73f16f1d3bc1', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'Calibration', 'Calibration', 'JSON CalibrationReport over the joined rows.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5e85f9aa-08b8-4fb6-8036-ff7bcc422e6e' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'DriftLook')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5e85f9aa-08b8-4fb6-8036-ff7bcc422e6e', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'DriftLook', 'Drift Look', 'JSON per-input drift statistics of the period''s look: z, empirical p, adjusted p, the look''s threshold and index.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd59641f9-fc8f-43cb-ade7-6a4a544237b7' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'DriftAlarms')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d59641f9-fc8f-43cb-ade7-6a4a544237b7', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'DriftAlarms', 'Drift Alarms', 'JSON array of the inputs whose drift alarm fired.', 'nvarchar', -1, 0, 0, FALSE, '[]', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fee3eaf7-0f45-41b1-a5b5-c15c46d3a44a' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'Parity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fee3eaf7-0f45-41b1-a5b5-c15c46d3a44a', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'Parity', 'Parity', 'JSON {sampled, maxAbsDifference, passed}: the period''s scoring parity check.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44c03183-72fb-48c1-af77-d74bd3750997' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'TriggersFired')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44c03183-72fb-48c1-af77-d74bd3750997', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'TriggersFired', 'Triggers Fired', 'JSON array of {kind, reason}: the retrain and rollback triggers that fired.', 'nvarchar', -1, 0, 0, FALSE, '[]', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dcf4fc08-b0f5-497c-b1b1-613baf468ab0' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ChallengerRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dcf4fc08-b0f5-497c-b1b1-613baf468ab0', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ChallengerRunID', 'Challenger Run ID', 'The challenger training run a fired trigger started.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee9273b1-cc1c-4ff5-b6c7-b5874c6f8dbd' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ChallengerResult')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ee9273b1-cc1c-4ff5-b6c7-b5874c6f8dbd', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ChallengerResult', 'Challenger Result', 'JSON {sharedRowIds, comparison, outcome, publishRecordId}: how the challenger compared and whether it was published or withheld.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8540bbd-4487-406a-8ade-950f06df6961' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'RollbackCheck')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8540bbd-4487-406a-8ade-950f06df6961', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'RollbackCheck', 'Rollback Check', 'JSON {previousModelId, sharedRowIds, comparison, consecutive, fired or not-eligible with the reason}: the automated rollback check.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58b18e38-a901-40b9-a670-3ad7b05ac820' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ErrorMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58b18e38-a901-40b9-a670-3ad7b05ac820', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ErrorMessage', 'Error Message', 'Why the period failed, when State is failed.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e5d79b26-ace7-4a92-9854-c8467af131d6' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5d79b26-ace7-4a92-9854-c8467af131d6', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd2617595-a76d-4d94-8d31-0f23a1f94d23' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d2617595-a76d-4d94-8d31-0f23a1f94d23', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b35104bb-a8db-46e9-b4a7-04c8764958a5' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b35104bb-a8db-46e9-b4a7-04c8764958a5', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0674e79f-d45c-49b5-bd64-d4166e92e45c' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'ModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0674e79f-d45c-49b5-bd64-d4166e92e45c', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), 'ModelID', 'Model ID', 'The model whose output the surface shows.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cbde6ea2-03cc-4a4b-b5e6-51a5b114f889' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'Surface')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cbde6ea2-03cc-4a4b-b5e6-51a5b114f889', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), 'Surface', 'Surface', 'at-risk-list, why-badge, predictions-grid or record-panel.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '480927ef-43d6-43d8-af27-884397692d15' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'SortsBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('480927ef-43d6-43d8-af27-884397692d15', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), 'SortsBy', 'Sorts By', 'adverse-probability-desc, score-desc, score-asc or none.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6bc9e1e-abde-4d8d-9905-e024a94d0aac' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'DriverDirectionRelativeTo')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6bc9e1e-abde-4d8d-9905-e024a94d0aac', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), 'DriverDirectionRelativeTo', 'Driver Direction Relative To', 'adverse-class (a driver that raises the adverse outcome points up) or raw-contribution.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b8aa70f-84a5-48bc-adb9-4e43de26fd33' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'Label')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b8aa70f-84a5-48bc-adb9-4e43de26fd33', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), 'Label', 'Label', 'The label the surface shows, naming the scored class.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e63aff6-e431-4a19-8587-ee652f430a44' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e63aff6-e431-4a19-8587-ee652f430a44', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8bfd740e-dee6-458a-a4bb-328d7346533c' OR ("EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8bfd740e-dee6-458a-a4bb-328d7346533c', '75F9DA13-10D3-4153-9299-E97F1ED296AD' /* Entity: MJ: ML Output Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* HAND EDIT (5): the bounded-text columns of MJ: ML Models that CodeGen may pick as its name field, pinned */
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.TargetVariable the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'TargetVariable'
  AND "IsNameField" = FALSE;
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ProblemType the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'ProblemType'
  AND "IsNameField" = FALSE;
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.Status the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'Status'
  AND "IsNameField" = FALSE;
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ArtifactSha256 the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'ArtifactSha256'
  AND "IsNameField" = FALSE;
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.SnapshotHash the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'SnapshotHash'
  AND "IsNameField" = FALSE;
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.FeatureSchemaHash the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'FeatureSchemaHash'
  AND "IsNameField" = FALSE;
/* HAND EDIT (5) (re-apply after any tail regeneration): AutoUpdateIsNameField = 0 so CodeGen's name-field pick never makes MJ: ML Models.ArtifactStatus the name field; a name field on ML Models adds a joined name column to every view with a foreign key into MLModel */
UPDATE __mj."EntityField" SET "AutoUpdateIsNameField" = FALSE
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'ArtifactStatus'
  AND "IsNameField" = FALSE;
/* SQL text to sync entity unique keys (10 added, 0 updated, 0 removed) */
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'dd3be67f-c35f-45a0-afe1-553285e7c93a',
    '18359693-D8DF-4E8F-B5E1-D2C17B742834',
    'UQ_MLMonitoringResult_ModelPeriod',
    'ModelID,PeriodGrain,Period',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'cb945559-ef12-4233-a3d1-d2f033b073ce',
    '3BED585D-B150-4899-AB06-8A19624EA9BE',
    'UQ_FeatureValue_ModelRow',
    'MLModelScoringBindingID,EntityID,RecordID,EffectiveAsOf,Role',
    '([Source]=N''Model'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '93275069-ad6d-46cb-bc40-23aa62f0bdef',
    '75F9DA13-10D3-4153-9299-E97F1ED296AD',
    'UQ_MLOutputBinding_ModelSurface',
    'ModelID,Surface',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '60bf8799-8770-4fb9-bc38-53b42d43f66e',
    'A3997636-011D-46E0-BC01-8B1E61E1087B',
    'UX_MLModel_OneServingUnevaluatedPerPipeline',
    'PipelineID',
    '([ServingWhileUnevaluated]=(1))'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '13d270c1-93e1-4a75-83c7-7db302f3a152',
    'A3997636-011D-46E0-BC01-8B1E61E1087B',
    'UX_MLModel_PipelineVersion',
    'PipelineID,Version',
    NULL
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    'c4d35846-8f14-4255-a95a-d1d87500e501',
    'A3997636-011D-46E0-BC01-8B1E61E1087B',
    'UX_MLModel_OnePublishedPerPipeline',
    'PipelineID',
    '([Status]=N''Published'')'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '78910fdd-18f4-48e0-824f-d84855e29ce6',
    'BC5C5F60-2512-467A-BEC8-14B4D8D3B640',
    'UX_MLModelPublishRecord_OnePublishPerRun',
    'TrainingRunID',
    '([Kind]=''publish'' AND ([Purpose] IN (''publish'', ''adopt'')) AND [TrainingRunID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '82235b10-3719-4320-b793-8e90b8d810f7',
    'BC5C5F60-2512-467A-BEC8-14B4D8D3B640',
    'UX_MLModelPublishRecord_OneRunOutcome',
    'TrainingRunID',
    '([Purpose]=''evaluate'' AND [TrainingRunID] IS NOT NULL)'
  );
INSERT INTO __mj."EntityUniqueKey" (
  "ID",
  "EntityID",
  "Name",
  "FieldNames",
  "FilterDefinition"
)
VALUES
  (
    '5296bd6d-304d-4bbd-9483-a6a1bf7f0e3e',
    'FD8EF230-65F3-496D-A117-7610572C35AA',
    'UQ_MLModelScoringBinding_EntityFeature',
    'TargetEntityID,FeatureName',
    '([TargetEntityID] IS NOT NULL)'
  );
/* SQL text to sync 3 entity field value row(s) for entity field ID 940329A6-0C44-44C2-B816-F192C3DDF75F */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e068b3eb-aec5-4288-b383-8bce5d8f7c03',
    '940329A6-0C44-44C2-B816-F192C3DDF75F',
    1,
    'publish',
    'publish',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f6b8417e-c84e-4587-bd49-e6e1d6f4ee88',
    '940329A6-0C44-44C2-B816-F192C3DDF75F',
    2,
    'refusal',
    'refusal',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2458ea31-9cfc-4807-a5d0-8e1ad092c3e5',
    '940329A6-0C44-44C2-B816-F192C3DDF75F',
    3,
    'sign-off',
    'sign-off',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 940329A6-0C44-44C2-B816-F192C3DDF75F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '940329A6-0C44-44C2-B816-F192C3DDF75F';
/* SQL text to sync 4 entity field value row(s) for entity field ID 381291CE-94E9-47E5-B465-216713718BFD */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8cf84ce0-7fea-4db0-a29a-93850d2e102c',
    '381291CE-94E9-47E5-B465-216713718BFD',
    1,
    'adopt',
    'adopt',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '18d875a2-4953-475b-ae2e-204c3fed6f1a',
    '381291CE-94E9-47E5-B465-216713718BFD',
    2,
    'evaluate',
    'evaluate',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0f8da959-2ae5-41c3-ade6-1b1377d1bd93',
    '381291CE-94E9-47E5-B465-216713718BFD',
    3,
    'publish',
    'publish',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '21747a9f-1617-4bec-9d78-8da676522b9b',
    '381291CE-94E9-47E5-B465-216713718BFD',
    4,
    'rollback',
    'rollback',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 381291CE-94E9-47E5-B465-216713718BFD */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '381291CE-94E9-47E5-B465-216713718BFD';
/* SQL text to sync 5 entity field value row(s) for entity field ID A7F0D206-FACB-41B7-B581-12028AD8C572 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0cae480e-3c2e-4fc3-96a3-85303b910e63',
    'A7F0D206-FACB-41B7-B581-12028AD8C572',
    1,
    'monitoring',
    'monitoring',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e26a2b37-2ff2-4eb8-bd60-f82fd41a045e',
    'A7F0D206-FACB-41B7-B581-12028AD8C572',
    2,
    'parity',
    'parity',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '808eacbf-102e-4ddd-8372-c8fcaf15f58e',
    'A7F0D206-FACB-41B7-B581-12028AD8C572',
    3,
    'predict',
    'predict',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c06af62c-bbde-4f68-b7d6-6b0db09979dc',
    'A7F0D206-FACB-41B7-B581-12028AD8C572',
    4,
    'record-process',
    'record-process',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ecb1dceb-1f28-4bea-9456-6f35391076eb',
    'A7F0D206-FACB-41B7-B581-12028AD8C572',
    5,
    'score-record-set',
    'score-record-set',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID A7F0D206-FACB-41B7-B581-12028AD8C572 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'A7F0D206-FACB-41B7-B581-12028AD8C572';
/* SQL text to sync 3 entity field value row(s) for entity field ID 5C5CA5C1-9F48-40D8-A982-FDE7B605A266 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '4f19b0b0-ab69-4827-b6a7-a53df91d66d1',
    '5C5CA5C1-9F48-40D8-A982-FDE7B605A266',
    1,
    'filter',
    'filter',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ed1a86ec-388b-40eb-b8ce-b1e349348eae',
    '5C5CA5C1-9F48-40D8-A982-FDE7B605A266',
    2,
    'record-ids',
    'record-ids',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '690540bc-5223-41ba-a766-d79747e2a907',
    '5C5CA5C1-9F48-40D8-A982-FDE7B605A266',
    3,
    'view',
    'view',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 5C5CA5C1-9F48-40D8-A982-FDE7B605A266 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '5C5CA5C1-9F48-40D8-A982-FDE7B605A266';
/* SQL text to sync 4 entity field value row(s) for entity field ID D1B99310-9E0D-4A03-8A4E-F1F96A8EC370 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f56f8076-bea9-4d5f-94c0-a3f7c463dea1',
    'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370',
    1,
    'completed',
    'completed',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '87339f06-b60b-4c28-acf8-3aca51023dce',
    'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370',
    2,
    'failed',
    'failed',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ca4db3af-d412-4f5c-84f1-fdc9777aab98',
    'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370',
    3,
    'refused',
    'refused',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b73a72b7-ad0a-4392-a456-84b4f22b8784',
    'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370',
    4,
    'running',
    'running',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D1B99310-9E0D-4A03-8A4E-F1F96A8EC370 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370';
/* SQL text to sync 4 entity field value row(s) for entity field ID 98F67019-F93F-4DD6-BBA1-70B848353726 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '15e6a336-af4f-4c87-9daa-70dabb7706b3',
    '98F67019-F93F-4DD6-BBA1-70B848353726',
    1,
    'month',
    'month',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8fe42854-c5c7-4e93-8120-3ef692312785',
    '98F67019-F93F-4DD6-BBA1-70B848353726',
    2,
    'quarter',
    'quarter',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ee67f9fc-dbf6-408a-ab76-bfdc464e44de',
    '98F67019-F93F-4DD6-BBA1-70B848353726',
    3,
    'week',
    'week',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd4bb98c2-ec0b-43c6-b2df-029dee8f9223',
    '98F67019-F93F-4DD6-BBA1-70B848353726',
    4,
    'year',
    'year',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 98F67019-F93F-4DD6-BBA1-70B848353726 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '98F67019-F93F-4DD6-BBA1-70B848353726';
/* SQL text to sync 4 entity field value row(s) for entity field ID 1AAF359F-C0A4-4CF0-8365-92803287FB66 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a53866f4-589b-4ae6-b258-43814d57a27f',
    '1AAF359F-C0A4-4CF0-8365-92803287FB66',
    1,
    'evaluated',
    'evaluated',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '87a32765-0937-4222-8515-7ceb09aad0bb',
    '1AAF359F-C0A4-4CF0-8365-92803287FB66',
    2,
    'failed',
    'failed',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c610cf5a-3175-4aae-b92c-1d912fd8b34a',
    '1AAF359F-C0A4-4CF0-8365-92803287FB66',
    3,
    'insufficient-rows',
    'insufficient-rows',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a763b8e5-079d-428d-aac0-2b7a23b14c9f',
    '1AAF359F-C0A4-4CF0-8365-92803287FB66',
    4,
    'window-open',
    'window-open',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 1AAF359F-C0A4-4CF0-8365-92803287FB66 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1AAF359F-C0A4-4CF0-8365-92803287FB66';
/* SQL text to sync 4 entity field value row(s) for entity field ID CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '67d063d0-bbbb-49c5-aa12-478255de6d98',
    'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889',
    1,
    'at-risk-list',
    'at-risk-list',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ffe8a738-da6a-4bd0-ba79-6f80fa3b2318',
    'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889',
    2,
    'predictions-grid',
    'predictions-grid',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1e3b4477-4343-46b2-a5c2-ce0dbb042a1c',
    'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889',
    3,
    'record-panel',
    'record-panel',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0f1ac20c-274a-4d7a-ae39-824c290e1ad6',
    'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889',
    4,
    'why-badge',
    'why-badge',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889';
/* SQL text to sync 4 entity field value row(s) for entity field ID 480927EF-43D6-43D8-AF27-884397692D15 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e395edd0-9577-4227-a052-9f0aa7acfa9a',
    '480927EF-43D6-43D8-AF27-884397692D15',
    1,
    'adverse-probability-desc',
    'adverse-probability-desc',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '32c54c1b-e5ab-422f-8ad3-fa5da461ad1b',
    '480927EF-43D6-43D8-AF27-884397692D15',
    2,
    'none',
    'none',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '15091671-5ea0-434b-994a-ed8abd231c2b',
    '480927EF-43D6-43D8-AF27-884397692D15',
    3,
    'score-asc',
    'score-asc',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '4113fafb-e564-4cde-a50b-16de7c23932b',
    '480927EF-43D6-43D8-AF27-884397692D15',
    4,
    'score-desc',
    'score-desc',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 480927EF-43D6-43D8-AF27-884397692D15 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '480927EF-43D6-43D8-AF27-884397692D15';
/* SQL text to sync 2 entity field value row(s) for entity field ID A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6e44e2c9-a60e-4215-8aa3-ba475716da7f',
    'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC',
    1,
    'adverse-class',
    'adverse-class',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c85d7440-bb0d-4703-9b9c-b45891455329',
    'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC',
    2,
    'raw-contribution',
    'raw-contribution',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC';
/* SQL text to sync 5 entity field value row(s) for entity field ID 3D26A331-B246-4781-AB7E-5FC789EF4996 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9a074f98-87b6-42c7-84eb-cb7ff4408c18',
    '3D26A331-B246-4781-AB7E-5FC789EF4996',
    1,
    'hash-mismatch',
    'hash-mismatch',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5b18530b-15b6-4fcc-8943-ea9d25dca545',
    '3D26A331-B246-4781-AB7E-5FC789EF4996',
    2,
    'legacy-local',
    'legacy-local',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd5aea6ae-2e84-40f3-9aab-8e96d2eeed0d',
    '3D26A331-B246-4781-AB7E-5FC789EF4996',
    3,
    'missing',
    'missing',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '22240bf4-fc20-4d5b-b380-c92bbf4ab5fb',
    '3D26A331-B246-4781-AB7E-5FC789EF4996',
    4,
    'unverified',
    'unverified',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8478c933-5ae0-4d23-acb8-e56e24c24e99',
    '3D26A331-B246-4781-AB7E-5FC789EF4996',
    5,
    'verified',
    'verified',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3D26A331-B246-4781-AB7E-5FC789EF4996 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3D26A331-B246-4781-AB7E-5FC789EF4996';
/* SQL text to sync 4 entity field value row(s) for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'cb62b007-4aca-4b60-8959-878ba86f080d',
    '8B0C0799-D66A-48BA-987D-C32D477E2A28',
    3,
    'KeepBaseline',
    'KeepBaseline',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a236628a-2bd5-48bd-998c-f50b66ad2647',
    '8B0C0799-D66A-48BA-987D-C32D477E2A28',
    5,
    'Unevaluated',
    'Unevaluated',
    'Check',
    NOW(),
    NOW()
  );
UPDATE __mj."EntityFieldValue" SET "Sequence" = 4
WHERE
  "ID" = 'C2CE99CA-0E5D-4227-B71D-55A34C1B1F84';
UPDATE __mj."EntityFieldValue" SET "Sequence" = 6
WHERE
  "ID" = '5F645BCA-78A6-4F2F-B01D-1AE7ED48BFC8';
/* SQL text to sync 2 entity field value row(s) for entity field ID 83C833AF-DF1F-43E9-A9A0-715AB5A9318B */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '704ce04c-6029-44e8-b484-a2aa2f6ffe63',
    '83C833AF-DF1F-43E9-A9A0-715AB5A9318B',
    2,
    'Model',
    'Model',
    'Check',
    NOW(),
    NOW()
  );
UPDATE __mj."EntityFieldValue" SET "Sequence" = 3
WHERE
  "ID" = 'A98135F6-E8A9-44D9-BBA0-B0EA2AD6CD49';
/* SQL text to sync 2 entity field value row(s) for entity field ID 7D45D97D-9DBC-42E0-BD83-33F7C91B6923 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '99034faa-6a30-4414-9593-e319f83ae13e',
    '7D45D97D-9DBC-42E0-BD83-33F7C91B6923',
    1,
    'Active',
    'Active',
    'Check',
    NOW(),
    NOW()
  );
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ef9f5a46-bd5e-48a5-b562-00dc7d376217',
    '7D45D97D-9DBC-42E0-BD83-33F7C91B6923',
    2,
    'Withdrawn',
    'Withdrawn',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7D45D97D-9DBC-42E0-BD83-33F7C91B6923 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7D45D97D-9DBC-42E0-BD83-33F7C91B6923';
/* SQL text to sync 3 entity field value row(s) for entity field ID 919000EB-F5B2-495F-93F4-AE6D2A1AF119 */
DELETE FROM __mj."EntityFieldValue"
WHERE
  "ID" = '285AB7F0-40C8-4455-A23A-8FC67D2C867C';
UPDATE __mj."EntityFieldValue" SET "Sequence" = 1
WHERE
  "ID" = '774AF3CF-CBFD-4CEC-8E08-97F1EAE6039F';
UPDATE __mj."EntityFieldValue" SET "Sequence" = 2
WHERE
  "ID" = '59BF12A1-78DC-4042-9243-93935E738A59';
/* Deterministic search-flag hygiene — seed name fields */
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE, "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" IN (
    SELECT
      "ranked"."ID"
    FROM (
      SELECT
        "f"."ID",
        ROW_NUMBER() OVER (PARTITION BY "f"."EntityID" ORDER BY "f"."Sequence", "f"."Name") AS "rn"
      FROM __mj."EntityField" AS "f"
      INNER JOIN __mj."Entity" AS "e"
        ON "e"."ID" = "f"."EntityID"
      WHERE
        LOWER("f"."Name") IN (
          'name',
          'title',
          'firstname',
          'lastname',
          'middlename',
          'displayname',
          'fullname',
          'label'
        )
        AND "f"."AutoUpdateIncludeInUserSearchAPI" = TRUE
        AND "f"."IncludeInUserSearchAPI" = FALSE
        AND COALESCE("f"."IsPrimaryKey", FALSE) = FALSE
        AND COALESCE("f"."IsVirtual", FALSE) = FALSE
        AND LOWER("f"."Type") IN ('nvarchar', 'varchar', 'char', 'nchar')
        AND COALESCE("f"."Length", 0) <> -1
        AND "e"."VirtualEntity" = FALSE
        AND "e"."AllowUserSearchAPI" = TRUE
        AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
        AND NOT (
          (
            "e"."Name" = 'Logs' OR "e"."Name" LIKE '% Logs'
          )
          OR (
            "e"."Name" = 'Log' OR "e"."Name" LIKE '% Log'
          )
          OR (
            "e"."Name" = 'Runs' OR "e"."Name" LIKE '% Runs'
          )
          OR (
            "e"."Name" = 'Run' OR "e"."Name" LIKE '% Run'
          )
          OR (
            "e"."Name" = 'Run History' OR "e"."Name" LIKE '% Run History'
          )
          OR (
            "e"."Name" = 'Run Steps' OR "e"."Name" LIKE '% Run Steps'
          )
          OR (
            "e"."Name" = 'Run Messages' OR "e"."Name" LIKE '% Run Messages'
          )
          OR (
            "e"."Name" = 'Execution Logs' OR "e"."Name" LIKE '% Execution Logs'
          )
          OR (
            "e"."Name" = 'Details' OR "e"."Name" LIKE '% Details'
          )
          OR (
            "e"."Name" = 'Detail' OR "e"."Name" LIKE '% Detail'
          )
          OR (
            "e"."Name" = 'Lines' OR "e"."Name" LIKE '% Lines'
          )
          OR (
            "e"."Name" = 'Line' OR "e"."Name" LIKE '% Line'
          )
          OR (
            "e"."Name" = 'Items' OR "e"."Name" LIKE '% Items'
          )
          OR (
            "e"."Name" = 'Item' OR "e"."Name" LIKE '% Item'
          )
          OR (
            "e"."Name" = 'Steps' OR "e"."Name" LIKE '% Steps'
          )
          OR (
            "e"."Name" = 'Step' OR "e"."Name" LIKE '% Step'
          )
          OR (
            "e"."Name" = 'Params' OR "e"."Name" LIKE '% Params'
          )
          OR (
            "e"."Name" = 'Param' OR "e"."Name" LIKE '% Param'
          )
          OR (
            "e"."Name" = 'Mappings' OR "e"."Name" LIKE '% Mappings'
          )
          OR (
            "e"."Name" = 'Mapping' OR "e"."Name" LIKE '% Mapping'
          )
          OR (
            "e"."Name" = 'Audit'
            OR "e"."Name" LIKE 'Audit %'
            OR "e"."Name" LIKE '% Audit'
            OR "e"."Name" LIKE '% Audit %'
          )
          OR (
            "e"."Name" = 'Record Change'
            OR "e"."Name" LIKE 'Record Change %'
            OR "e"."Name" LIKE '% Record Change'
            OR "e"."Name" LIKE '% Record Change %'
          )
        )
        AND NOT "e"."SchemaName" IN ('sys', 'staging')
        AND NOT EXISTS(
          SELECT
            1
          FROM __mj."EntityField" AS "f2"
          WHERE
            "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
        )
    ) AS "ranked"
    WHERE
      "ranked"."rn" <= 3
  );
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
/* Create Entity Relationship: MJ: ML Model Publish Records -> MJ: ML Model Publish Records (One To Many via SignOffID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c0860c71-14bd-4dda-a973-6f37581e6506' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "RelatedEntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "RelatedEntityJoinField" = 'SignOffID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c0860c71-14bd-4dda-a973-6f37581e6506', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'SignOffID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '516351f6-491e-4438-8e87-ad9dccfb10b9' OR ("EntityID" = 'D5052EB0-354C-4C4D-80D8-2832FCC720E6' AND "RelatedEntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityJoinField" = 'PredictionUnitID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('516351f6-491e-4438-8e87-ad9dccfb10b9', 'D5052EB0-354C-4C4D-80D8-2832FCC720E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PredictionUnitID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8eb22700-15d0-4632-a0cc-bb9c1eab1fb3' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityJoinField" = 'ScopeEntityID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8eb22700-15d0-4632-a0cc-bb9c1eab1fb3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ScopeEntityID', 'One To Many', TRUE, TRUE, 95, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '844030dd-c9b8-42b7-9735-be65a6c984b6' OR ("EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "RelatedEntityJoinField" = 'UserID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('844030dd-c9b8-42b7-9735-be65a6c984b6', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'UserID', 'One To Many', TRUE, TRUE, 132, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '38b9fb74-0c05-4d4a-8c77-f164acf95d8c' OR ("EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityJoinField" = 'RequestedByUserID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38b9fb74-0c05-4d4a-8c77-f164acf95d8c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'RequestedByUserID', 'One To Many', TRUE, TRUE, 133, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6fa446e4-7955-43dd-bf2a-59497b84def3' OR ("EntityID" = 'F9238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "RelatedEntityJoinField" = 'ViewAuthorizationID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6fa446e4-7955-43dd-bf2a-59497b84def3', 'F9238F34-2837-EF11-86D4-6045BDEE16E6', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'ViewAuthorizationID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ac6138e0-990c-4a49-87fb-0938fef3ebf5' OR ("EntityID" = 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6' AND "RelatedEntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityJoinField" = 'TrainingSnapshotID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ac6138e0-990c-4a49-87fb-0938fef3ebf5', 'F36CDE0E-DBCD-4527-9AF6-66D8C710C8E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingSnapshotID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '359c9d16-d70b-465c-831f-b1efa4e43f66' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "RelatedEntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "RelatedEntityJoinField" = 'MLModelScoringBindingID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('359c9d16-d70b-465c-831f-b1efa4e43f66', 'FD8EF230-65F3-496D-A117-7610572C35AA', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'MLModelScoringBindingID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e4850125-fc94-4f24-9ec2-eb12d8501b01' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "RelatedEntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityJoinField" = 'MLModelScoringBindingID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4850125-fc94-4f24-9ec2-eb12d8501b01', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'MLModelScoringBindingID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '18b98129-dc6f-4161-b751-61488e8f676e' OR ("EntityID" = '05853432-5E13-4F2A-8618-77857ADF17FA' AND "RelatedEntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityJoinField" = 'ScheduledJobRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18b98129-dc6f-4161-b751-61488e8f676e', '05853432-5E13-4F2A-8618-77857ADF17FA', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ScheduledJobRunID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '514440b3-904d-4a7e-86b6-8b1e972bd208' OR ("EntityID" = '05853432-5E13-4F2A-8618-77857ADF17FA' AND "RelatedEntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "RelatedEntityJoinField" = 'ScheduledJobRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('514440b3-904d-4a7e-86b6-8b1e972bd208', '05853432-5E13-4F2A-8618-77857ADF17FA', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'ScheduledJobRunID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a46eb9a6-b30d-4175-8a83-2ef8883c0cc1' OR ("EntityID" = '7DB88C96-C922-4724-AE93-7B91798CEAFE' AND "RelatedEntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityJoinField" = 'EvaluationProtocolID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a46eb9a6-b30d-4175-8a83-2ef8883c0cc1', '7DB88C96-C922-4724-AE93-7B91798CEAFE', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'EvaluationProtocolID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '836f9dd0-bcbb-4e12-ba44-99590fb78b75' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "RelatedEntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "RelatedEntityJoinField" = 'TrainingRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('836f9dd0-bcbb-4e12-ba44-99590fb78b75', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'TrainingRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8b8adc06-f681-4cb9-ad95-716f79434a64' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "RelatedEntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityJoinField" = 'TrainingRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b8adc06-f681-4cb9-ad95-716f79434a64', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'TrainingRunID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e14ed9cb-5252-42de-a188-1e967c3302e8' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "RelatedEntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "RelatedEntityJoinField" = 'ChallengerRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e14ed9cb-5252-42de-a188-1e967c3302e8', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'ChallengerRunID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '16264ba0-2640-431d-ac96-6b97f010f9f5' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "RelatedEntityJoinField" = 'ModelID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('16264ba0-2640-431d-ac96-6b97f010f9f5', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'ModelID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '32efa861-0881-4a0d-a7bf-6a8e56378dac' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "RelatedEntityJoinField" = 'ReplacesModelID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32efa861-0881-4a0d-a7bf-6a8e56378dac', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'ReplacesModelID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e7a708ed-7a53-4b64-a429-ade600d1cbbf' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityJoinField" = 'ModelID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e7a708ed-7a53-4b64-a429-ade600d1cbbf', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ModelID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '3d02aea8-0ae9-4640-b5f2-7ad15aa4f297' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "RelatedEntityJoinField" = 'ModelID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d02aea8-0ae9-4640-b5f2-7ad15aa4f297', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'ModelID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5a458e54-c1f2-4352-884b-6c287e9454b0' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "RelatedEntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "RelatedEntityJoinField" = 'ModelID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a458e54-c1f2-4352-884b-6c287e9454b0', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'ModelID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '001e4a3a-ebe9-492c-a330-d97a6d715fc1' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "RelatedEntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "RelatedEntityJoinField" = 'MLTrainingPipelineID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('001e4a3a-ebe9-492c-a330-d97a6d715fc1', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'MLTrainingPipelineID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '14f09508-94c8-4069-8800-04617df7eade' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "RelatedEntityJoinField" = 'MLScoringRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14f09508-94c8-4069-8800-04617df7eade', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', '3BED585D-B150-4899-AB06-8A19624EA9BE', 'MLScoringRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2ea64da4-aff1-4254-aaef-f65eb5ce562a' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "RelatedEntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "RelatedEntityJoinField" = 'ProcessRunID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2ea64da4-aff1-4254-aaef-f65eb5ce562a', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'ProcessRunID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

/* SQL text to update virtual entity field ID for entity MJ: Latest Feature Values */
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "AllowsNull" = FALSE, "IsPrimaryKey" = TRUE, "IsUnique" = TRUE, "Length" = 16, "Precision" = 0, "Scale" = 0
WHERE
  "ID" = 'E3CB8070-E989-462A-ACC9-07547455634D';
/* SQL text to update virtual entity updated date for MJ: Latest Feature Values */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';
/* Set LLM-identified PKs for MJ: Latest Feature Values: ID */
UPDATE __mj."EntityField" SET "IsPrimaryKey" = FALSE, "IsUnique" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'
  AND "IsPrimaryKey" = TRUE
  AND "IsSoftPrimaryKey" = FALSE;
UPDATE __mj."EntityField" SET "IsPrimaryKey" = TRUE, "IsUnique" = TRUE, "IsSoftPrimaryKey" = TRUE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ID';
/* Set LLM-generated descriptions for MJ: Latest Feature Values (19 fields) */
UPDATE __mj."EntityField" SET "Description" = 'Unique identifier for this feature value record, matching the source FeatureValue.ID.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ID';
UPDATE __mj."EntityField" SET "Description" = 'The entity ID of the record this feature was computed for.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'EntityID';
UPDATE __mj."EntityField" SET "Description" = 'Serialized primary key of the record this feature value belongs to.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'RecordID';
UPDATE __mj."EntityField" SET "Description" = 'Name of the feature.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'FeatureName';
UPDATE __mj."EntityField" SET "Description" = 'Who produced the value (e.g., Pipeline, Human, Model).', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'Source';
UPDATE __mj."EntityField" SET "Description" = 'Role of the feature value (e.g., Champion).', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'Role';
UPDATE __mj."EntityField" SET "Description" = 'Timestamp from which this value is considered effective for the feature.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'EffectiveAsOf';
UPDATE __mj."EntityField" SET "Description" = 'Timestamp when this feature value was computed.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ComputedAt';
UPDATE __mj."EntityField" SET "Description" = 'Identifier of the scoring binding whose prediction this value represents.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'
  AND "Name" = 'MLModelScoringBindingID';
UPDATE __mj."EntityField" SET "Description" = 'Identifier of the ML model that scored this value.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'MLModelID';
UPDATE __mj."EntityField" SET "Description" = 'Identifier of the ML scoring run that computed this value.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'MLScoringRunID';
UPDATE __mj."EntityField" SET "Description" = 'Indicates whether this record was included in the model''s training snapshot.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'InTraining';
UPDATE __mj."EntityField" SET "Description" = 'Identifier of the Record Process (Feature Pipeline) that computed this feature value.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7'
  AND "Name" = 'RecordProcessID';
UPDATE __mj."EntityField" SET "Description" = 'Computed feature value as text, for textual or categorical features.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueText';
UPDATE __mj."EntityField" SET "Description" = 'Computed feature value as a floating-point numeric score or metric.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueNumeric';
UPDATE __mj."EntityField" SET "Description" = 'Computed feature value formatted as a date/time timestamp.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueDate';
UPDATE __mj."EntityField" SET "Description" = 'Computed feature value as a boolean true/false flag.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueBoolean';
UPDATE __mj."EntityField" SET "Description" = 'Computed feature value as structured JSON data.', "AutoUpdateDescription" = FALSE, "ExtendedType" = 'JSON'
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'ValueJSON';
UPDATE __mj."EntityField" SET "Description" = 'Optional confidence score associated with this computed feature value.', "AutoUpdateDescription" = FALSE
WHERE
  "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'Confidence';
/* Set categories for 19 fields */
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E3CB8070-E989-462A-ACC9-07547455634D';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B7F56029-CF28-434C-B31E-4C236FE48ED5';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordID */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1D765F7A-D8F0-445D-B486-8F460EFA9D26';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.FeatureName */
UPDATE __mj."EntityField" SET "Category" = 'Feature Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D6DFC99B-3DBC-4D7E-8E9B-CA20265E1A03';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.Source */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F121D621-9B0A-412D-AD72-99E6D95AE363';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.Role */
UPDATE __mj."EntityField" SET "Category" = 'Feature Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9F933A69-6AAB-4F53-848C-84118E48E113';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.EffectiveAsOf */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3F803213-626C-4674-A9C7-E272E834A888';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ComputedAt */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '56A1A22F-5536-4AD4-AF40-73BDC7D97469';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelScoringBindingID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F6126AAD-2279-4778-BB39-2C840818AC49';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.MLModelID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3A14FC5F-1A67-493D-B3B1-04A8B7EDC0DB';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.MLScoringRunID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '47FAD71C-9EAD-4F63-8B42-4103D908C454';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.InTraining */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A7987F81-6E7C-46FC-B408-C2E543D9F27A';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '34B2591A-814E-4186-B072-FA0FC5E96DA8';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueText */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Text)'
WHERE
  "ID" = 'AC1E9D90-20C6-47BD-818D-1A155B37FC8B';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueNumeric */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Numeric)'
WHERE
  "ID" = '589B764F-FEC8-4EF6-A936-289630132999';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueDate */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Date)'
WHERE
  "ID" = '5E86B922-C294-46C4-B78A-B322DC75E394';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueBoolean */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (Boolean)'
WHERE
  "ID" = 'E491CD6F-09E0-4D52-A5BD-C0D6F45EC0EF';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.ValueJSON */
UPDATE __mj."EntityField" SET "Category" = 'Feature Values', "GeneratedFormSection" = 'Category', "DisplayName" = 'Value (JSON)'
WHERE
  "ID" = '9CB5AF74-F68D-4AD0-99C4-0004D0E7B712';
/* UPDATE Entity Field Category Info MJ: Latest Feature Values.Confidence */
UPDATE __mj."EntityField" SET "Category" = 'Feature Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AADB4BA9-8CB3-42EB-9746-D3F36587169B';
/* Set entity icon to fa-solid fa-brain */
UPDATE __mj."Entity" SET "Icon" = 'fa-solid fa-brain', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';
/* Insert FieldCategoryInfo setting for entity */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6ffbbf96-457e-5629-87d2-761e7e340241', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'FieldCategoryInfo', '{
  "Feature Details": {
    "description": "Metadata regarding the feature name, champion/challenger role, and confidence score",
    "icon": "fa-solid fa-sliders"
  },
  "Feature Values": {
    "description": "Typed representations of the computed feature value",
    "icon": "fa-solid fa-square-root-variable"
  },
  "Pipeline Provenance": {
    "description": "Lineage details linking values back to machine learning models, bindings, runs, and pipelines",
    "icon": "fa-solid fa-diagram-project"
  },
  "Record Context": {
    "description": "Target entity, record identifiers, source details, and effective dates",
    "icon": "fa-solid fa-bullseye"
  },
  "System Metadata": {
    "description": "System identifiers and administrative tracking fields",
    "icon": "fa-solid fa-gear"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5da419c2-f730-51fc-a33a-261c05a2ae47', '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7', 'FieldCategoryIcons', '{
  "Feature Details": "fa-solid fa-sliders",
  "Feature Values": "fa-solid fa-square-root-variable",
  "Pipeline Provenance": "fa-solid fa-diagram-project",
  "Record Context": "fa-solid fa-bullseye",
  "System Metadata": "fa-solid fa-gear"
}', NOW(), NOW());
  END IF;
END $$;

/* Update entity timestamp for MJ: Latest Feature Values after LLM decoration */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';
/* SQL text to update entity field related entity name field map for entity field ID 63758D3B-EBE1-4F32-8DDD-A6C56A403651 */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '45c5d308-1a6b-4e26-b7a6-cfe2664734e9' OR ("EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('45c5d308-1a6b-4e26-b7a6-cfe2664734e9', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' /* Entity: MJ: ML Model Publish Records */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640'), 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d6a3b8f-f864-4ca4-8585-e4c6ee3cb2cb' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'MLTrainingPipeline')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d6a3b8f-f864-4ca4-8585-e4c6ee3cb2cb', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'MLTrainingPipeline', 'ML Training Pipeline', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c21872d3-a8c4-4077-8f94-2e8f2c3cc4f4' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'ViewAuthorization')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c21872d3-a8c4-4077-8f94-2e8f2c3cc4f4', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'), 'ViewAuthorization', 'View Authorization', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba75b663-d1ab-4afd-b838-1481ea2b16ef' OR ("EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE' AND "Name" = 'MLModelScoringBinding')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba75b663-d1ab-4afd-b838-1481ea2b16ef', '3BED585D-B150-4899-AB06-8A19624EA9BE' /* Entity: MJ: Feature Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3BED585D-B150-4899-AB06-8A19624EA9BE'), 'MLModelScoringBinding', 'ML Model Scoring Binding', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd24c1d93-5014-4ae2-aee3-3aab12db2a5b' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'PredictionUnit')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d24c1d93-5014-4ae2-aee3-3aab12db2a5b', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'PredictionUnit', 'Prediction Unit', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b90cca3d-6292-44a1-afe9-0f9777551bd6' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'EvaluationProtocol')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b90cca3d-6292-44a1-afe9-0f9777551bd6', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'EvaluationProtocol', 'Evaluation Protocol', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7f8d0b93-bd67-4dfa-9463-a9a721b3d52f' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TrainingSnapshot')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7f8d0b93-bd67-4dfa-9463-a9a721b3d52f', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'), 'TrainingSnapshot', 'Training Snapshot', NULL, 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '90ee43f7-6882-40d9-9564-20701cf7a5fd' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'MLModelScoringBinding')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('90ee43f7-6882-40d9-9564-20701cf7a5fd', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'MLModelScoringBinding', 'ML Model Scoring Binding', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fdf9dc9f-6241-4661-b45b-df0468efad86' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ScopeEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fdf9dc9f-6241-4661-b45b-df0468efad86', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ScopeEntity', 'Scope Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '20bc4fec-f7be-4524-ba56-9073fe4ee923' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'RequestedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('20bc4fec-f7be-4524-ba56-9073fe4ee923', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'RequestedByUser', 'Requested By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ede21505-537f-48bb-9e63-16c67c03a496' OR ("EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'ScheduledJobRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ede21505-537f-48bb-9e63-16c67c03a496', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' /* Entity: MJ: ML Scoring Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2'), 'ScheduledJobRun', 'Scheduled Job Run', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8567862-7f27-41e4-ab3a-a966ce02c38f' OR ("EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'ScheduledJobRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8567862-7f27-41e4-ab3a-a966ce02c38f', '18359693-D8DF-4E8F-B5E1-D2C17B742834' /* Entity: MJ: ML Monitoring Results */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834'), 'ScheduledJobRun', 'Scheduled Job Run', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '13F4734B-CAC4-40B6-A7A1-BBBB2C5CE0FF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '7D45D97D-9DBC-42E0-BD83-33F7C91B6923'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLTrainingPipelineID */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'ML Training Pipeline'
WHERE
  "ID" = '9A5AB8B8-1DB9-44DE-AC6F-95F6561601B7';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.FeatureName */
UPDATE __mj."EntityField" SET "Category" = 'Target Destination', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '13F4734B-CAC4-40B6-A7A1-BBBB2C5CE0FF';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetColumnSource */
UPDATE __mj."EntityField" SET "Category" = 'Target Destination', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5A5B7894-74CB-42DE-8749-351510121685';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.Status */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7D45D97D-9DBC-42E0-BD83-33F7C91B6923';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ViewAuthorizationID */
UPDATE __mj."EntityField" SET "Category" = 'Security and Retention', "GeneratedFormSection" = 'Category', "DisplayName" = 'View Authorization'
WHERE
  "ID" = 'C531130D-2663-402B-9643-57AF83E76F08';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RetentionDays */
UPDATE __mj."EntityField" SET "Category" = 'Security and Retention', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '134DD51D-B21A-437D-A82B-A9790472B91C';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLTrainingPipeline */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'ML Training Pipeline Name'
WHERE
  "ID" = '5D6A3B8F-F864-4CA4-8585-E4C6EE3CB2CB';
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ViewAuthorization */
UPDATE __mj."EntityField" SET "Category" = 'Security and Retention', "GeneratedFormSection" = 'Category', "DisplayName" = 'View Authorization Name'
WHERE
  "ID" = 'C21872D3-A8C4-4077-8F94-2E8F2C3CC4F4';

/* Update FieldCategoryInfo setting for entity */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Binding Configuration": {
    "description": "Settings defining the ML model, process, and scoring mode",
    "icon": "fa fa-sliders-h"
  },
  "Execution Metrics": {
    "description": "Performance and execution statistics from the latest scoring run",
    "icon": "fa fa-tachometer-alt"
  },
  "Security and Retention": {
    "description": "Permissions, authorization rules, and data retention policies for predictions",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Target Destination": {
    "description": "The destination entity and column where model predictions are written",
    "icon": "fa fa-bullseye"
  }
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'
  AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Binding Configuration": "fa fa-sliders-h",
  "Execution Metrics": "fa fa-tachometer-alt",
  "Security and Retention": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog",
  "Target Destination": "fa fa-bullseye"
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA'
  AND "Name" = 'FieldCategoryIcons';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1AAF359F-C0A4-4CF0-8365-92803287FB66'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '81D5492D-DDE5-44ED-978E-E67909A7ACAB'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C69F005A-A435-46C7-9DE8-62E09D6E7209'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '10699C33-22CF-4BA1-8079-3A354FCB49F9'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CCCD3301-BF44-457E-B997-A82342CE35F2'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'AB99CFE5-DDBF-4F08-A999-759012ADE712'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A7F0D206-FACB-41B7-B581-12028AD8C572'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '014FCBC2-E056-4EEB-B192-ACE37F3FF497'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1101BBC0-D03A-4635-9510-76635311BCBE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '286790AA-AA0F-4AE2-BFE5-0F7AE9672906'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1605CC51-F9AD-4CB2-B4C3-7280E8BC6544'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '4B8AA70F-84A5-48BC-ADB9-4E43DE26FD33' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4B8AA70F-84A5-48BC-ADB9-4E43DE26FD33'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 22 fields */
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '80C5C1BB-6F0C-4C4F-B2CD-182162748E53';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.ModelID */
UPDATE __mj."EntityField" SET "Category" = 'Publish References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Model'
WHERE
  "ID" = 'C1A24860-AE81-4CF5-8FE2-179E6B9F54BD';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.TrainingRunID */
UPDATE __mj."EntityField" SET "Category" = 'Publish References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Run'
WHERE
  "ID" = '089114D6-5A6B-41A8-80FF-0B4FCFA82C21';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Kind */
UPDATE __mj."EntityField" SET "Category" = 'Publish Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '940329A6-0C44-44C2-B816-F192C3DDF75F';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Purpose */
UPDATE __mj."EntityField" SET "Category" = 'Publish Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '381291CE-94E9-47E5-B465-216713718BFD';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.ApproverKind */
UPDATE __mj."EntityField" SET "Category" = 'Authorization and Actors', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CCCD3301-BF44-457E-B997-A82342CE35F2';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Authorization and Actors', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = '87B82E1A-CFD0-4B51-9127-E344C63F1373';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Initiator */
UPDATE __mj."EntityField" SET "Category" = 'Authorization and Actors', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '44667EAE-506D-4BFD-B6C8-92E4E148AFB5';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.User */
UPDATE __mj."EntityField" SET "Category" = 'Authorization and Actors', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Details'
WHERE
  "ID" = '45C5D308-1A6B-4E26-B7A6-CFE2664734E9';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.RecordedAt */
UPDATE __mj."EntityField" SET "Category" = 'Publish Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AB99CFE5-DDBF-4F08-A999-759012ADE712';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Decision */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1DD29AB7-CF34-4CC4-9BC3-CC694EA33480';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Reason */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '88A11441-B549-45B5-8484-8B9EE7CDB5B3';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.GateDecision */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '34E9DB74-EAF9-419A-9B7C-895C4AF44FA0';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Evidence */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'BE4F236F-8B84-4931-B998-F2B568F8E714';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.EvidenceSha256 */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evidence SHA-256'
WHERE
  "ID" = 'FEF8D7F7-CB33-4DC5-8165-5D4288E02942';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.OverridesFlags */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'FA36FC82-F357-47A8-BD79-BDE885E7E502';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.SignOffID */
UPDATE __mj."EntityField" SET "Category" = 'Publish References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Sign-Off'
WHERE
  "ID" = '08B15F48-8F82-4DF6-9F51-9E944FE5F4A4';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.ReplacesModelID */
UPDATE __mj."EntityField" SET "Category" = 'Publish References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Replaces Model'
WHERE
  "ID" = '7745439F-8C94-4042-9478-C89100C3FFC3';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Refusal */
UPDATE __mj."EntityField" SET "Category" = 'Decision and Evaluation', "GeneratedFormSection" = 'Category', "DisplayName" = 'Refusal Details', "ExtendedType" = 'JSON'
WHERE
  "ID" = '5791332F-D06D-4116-8C09-15269FC16D0F';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.Transient */
UPDATE __mj."EntityField" SET "Category" = 'Publish Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '77191E92-A1C6-4AEB-875F-FEB94AB491E6';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5F340669-13E9-4172-89EA-B9EE16F72407';
/* UPDATE Entity Field Category Info MJ: ML Model Publish Records.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2B16F733-8E05-4D1F-BA5B-9E23B96E8905';

/* Set entity icon to fa fa-history */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-history', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1cbb55be-3e64-5cbe-b3d5-d9c724e28aa4', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'FieldCategoryInfo', '{
  "Authorization and Actors": {
    "description": "Approvers, user details, and initiator metadata",
    "icon": "fa fa-user-shield"
  },
  "Decision and Evaluation": {
    "description": "Evaluations, gate decisions, evidence snapshots, and refusal details",
    "icon": "fa fa-clipboard-check"
  },
  "Publish Details": {
    "description": "Core classifications, timing, and transient state of the publish record",
    "icon": "fa fa-info-circle"
  },
  "Publish References": {
    "description": "References to models, training runs, sign-offs, and replaced entities",
    "icon": "fa fa-link"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('129a1232-5954-5c40-aff9-38c2759018dd', 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640', 'FieldCategoryIcons', '{
  "Authorization and Actors": "fa fa-user-shield",
  "Decision and Evaluation": "fa fa-clipboard-check",
  "Publish Details": "fa fa-info-circle",
  "Publish References": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'BC5C5F60-2512-467A-BEC8-14B4D8D3B640';

/* Set categories for 6 fields */
/* UPDATE Entity Field Category Info MJ: Feature Values.Role */
UPDATE __mj."EntityField" SET "Category" = 'Record Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BAB2F6F6-56D7-4372-9F00-505790D71886';
/* UPDATE Entity Field Category Info MJ: Feature Values.MLModelID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '24ACE2B5-B5E9-4048-80ED-7D55CBCD2846';
/* UPDATE Entity Field Category Info MJ: Feature Values.MLModelScoringBindingID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'ML Model Scoring Binding'
WHERE
  "ID" = '63758D3B-EBE1-4F32-8DDD-A6C56A403651';
/* UPDATE Entity Field Category Info MJ: Feature Values.MLScoringRunID */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'ML Scoring Run'
WHERE
  "ID" = '8DC16BEC-2AA6-4E87-88CD-6A2BDD606249';
/* UPDATE Entity Field Category Info MJ: Feature Values.InTraining */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D99F2888-BB28-4435-91FA-E550BB4A5CBF';
/* UPDATE Entity Field Category Info MJ: Feature Values.MLModelScoringBinding */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Provenance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BA75B663-D1AB-4AFD-B838-1481EA2B16EF';

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B35104BB-A8DB-46E9-B4A7-04C8764958A5';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.ModelID */
UPDATE __mj."EntityField" SET "Category" = 'Model Binding Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Model'
WHERE
  "ID" = '0674E79F-D45C-49B5-BD64-D4166E92E45C';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.Surface */
UPDATE __mj."EntityField" SET "Category" = 'Model Binding Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CBDE6EA2-03CC-4A4B-B5E6-51A5B114F889';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.SortsBy */
UPDATE __mj."EntityField" SET "Category" = 'Model Binding Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '480927EF-43D6-43D8-AF27-884397692D15';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.DriverDirectionRelativeTo */
UPDATE __mj."EntityField" SET "Category" = 'Model Binding Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A6BC9E1E-ABDE-4D8D-9905-E024A94D0AAC';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.Label */
UPDATE __mj."EntityField" SET "Category" = 'Model Binding Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4B8AA70F-84A5-48BC-ADB9-4E43DE26FD33';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4E63AFF6-E431-4A19-8587-EE652F430A44';
/* UPDATE Entity Field Category Info MJ: ML Output Bindings.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8BFD740E-DEE6-458A-A4BB-328D7346533C';

/* Set entity icon to fa fa-sliders-h */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-sliders-h', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e84223c8-9333-516f-b65c-2e6149074b01', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'FieldCategoryInfo', '{
  "Model Binding Configuration": {
    "description": "Configuration settings for how machine learning model outputs are displayed and sorted on a surface",
    "icon": "fa fa-sliders-h"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2adcbedf-ed2b-5775-bdd2-871e51a9e194', '75F9DA13-10D3-4153-9299-E97F1ED296AD', 'FieldCategoryIcons', '{
  "Model Binding Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '75F9DA13-10D3-4153-9299-E97F1ED296AD';

/* Set categories for 26 fields */
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3C7230C6-1208-4299-8E20-D9F95C54BCC5';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ModelID */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Model'
WHERE
  "ID" = 'FEDEF598-EA62-4001-91F2-65A0D7C2ED69';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRunID */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D1EE5D2D-3609-4F19-8CA1-58C4CAD0A9E1';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.Period */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4CC916C1-6CF0-4392-93EB-A56F04BB62D5';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.PeriodGrain */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '98F67019-F93F-4DD6-BBA1-70B848353726';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.State */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1AAF359F-C0A4-4CF0-8365-92803287FB66';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScoredRows */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '81D5492D-DDE5-44ED-978E-E67909A7ACAB';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.JoinedRows */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C69F005A-A435-46C7-9DE8-62E09D6E7209';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ExcludedInTrainingRows */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C0E7F6F2-B61A-4F20-BCF7-C485A500A404';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryScore */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'AFCE783F-21F5-43C0-B6F2-B9C37FC4FBF2';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryValue */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '10699C33-22CF-4BA1-8079-3A354FCB49F9';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryLower */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category', "DisplayName" = 'Primary Lower Bound'
WHERE
  "ID" = 'CDFD9C3E-F52E-48AE-9843-2D7BC3860DD2';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.PrimaryUpper */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category', "DisplayName" = 'Primary Upper Bound'
WHERE
  "ID" = 'C022EDB6-4870-4CAB-A9A9-E7DDBBE3B2FE';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.TrackedMetrics */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '7DA54052-F022-45E3-95BB-D7C70E07E539';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.Calibration */
UPDATE __mj."EntityField" SET "Category" = 'Evaluation Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'DF8DA9D9-8D9F-4272-9DA7-73F16F1D3BC1';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftLook */
UPDATE __mj."EntityField" SET "Category" = 'Drift and Parity Analysis', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '5E85F9AA-08B8-4FB6-8036-FF7BCC422E6E';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.DriftAlarms */
UPDATE __mj."EntityField" SET "Category" = 'Drift and Parity Analysis', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'D59641F9-FC8F-43CB-ADE7-6A4A544237B7';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.Parity */
UPDATE __mj."EntityField" SET "Category" = 'Drift and Parity Analysis', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'FEE3EAF7-0F45-41B1-A5B5-C15C46D3A44A';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.TriggersFired */
UPDATE __mj."EntityField" SET "Category" = 'Triggers and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '44C03183-72FB-48C1-AF77-D74BD3750997';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerRunID */
UPDATE __mj."EntityField" SET "Category" = 'Triggers and Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DCF4FC08-B0F5-497C-B1B1-613BAF468AB0';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ChallengerResult */
UPDATE __mj."EntityField" SET "Category" = 'Triggers and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'EE9273B1-CC1C-4FF5-B6C7-B5874C6F8DBD';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.RollbackCheck */
UPDATE __mj."EntityField" SET "Category" = 'Triggers and Governance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'F8540BBD-4487-406A-8ADE-950F06DF6961';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ErrorMessage */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '58B18E38-A901-40B9-A670-3AD7B05AC820';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E5D79B26-ACE7-4A92-9854-C8467AF131D6';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D2617595-A76D-4D94-8D31-0F23A1F94D23';
/* UPDATE Entity Field Category Info MJ: ML Monitoring Results.ScheduledJobRun */
UPDATE __mj."EntityField" SET "Category" = 'Monitoring Period and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F8567862-7F27-41E4-AB3A-A966CE02C38F';

/* Set entity icon to fa fa-chart-line */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-chart-line', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b571334e-6f7a-50a2-8385-1a8e04b94d13', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'FieldCategoryInfo', '{
  "Drift and Parity Analysis": {
    "description": "Input drift statistics, alarms, and scoring parity check results",
    "icon": "fa fa-balance-scale"
  },
  "Evaluation Metrics": {
    "description": "Scoring outcomes, primary metrics, intervals, and tracked model metrics",
    "icon": "fa fa-chart-bar"
  },
  "Monitoring Period and Status": {
    "description": "Period definitions, job execution references, and monitoring run states",
    "icon": "fa fa-calendar-alt"
  },
  "Triggers and Governance": {
    "description": "Retrain/rollback triggers, challenger evaluations, and automated checks",
    "icon": "fa fa-shield-alt"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5ff79db-474c-5604-907e-389da8807c3c', '18359693-D8DF-4E8F-B5E1-D2C17B742834', 'FieldCategoryIcons', '{
  "Drift and Parity Analysis": "fa fa-balance-scale",
  "Evaluation Metrics": "fa fa-chart-bar",
  "Monitoring Period and Status": "fa fa-calendar-alt",
  "Triggers and Governance": "fa fa-shield-alt"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '18359693-D8DF-4E8F-B5E1-D2C17B742834';

/* Set categories for 33 fields */
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F1E89CB7-38B9-42A0-849E-5FE2891056F9';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelID */
UPDATE __mj."EntityField" SET "Category" = 'Model and Binding Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Model'
WHERE
  "ID" = '92633337-875A-46E0-8B8A-C10043BF583A';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ModelVersion */
UPDATE __mj."EntityField" SET "Category" = 'Model and Binding Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '035103C4-23DE-4842-9E5F-1838B2531358';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBindingID */
UPDATE __mj."EntityField" SET "Category" = 'Model and Binding Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'ML Model Scoring Binding'
WHERE
  "ID" = 'C1418070-BC06-4C81-A5E5-9157D98260E1';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ArtifactSha256 */
UPDATE __mj."EntityField" SET "Category" = 'Model and Binding Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Artifact SHA-256'
WHERE
  "ID" = 'E628B36A-A9CA-4EE1-B45C-C6C7DDEB946A';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.FeatureSchemaHash */
UPDATE __mj."EntityField" SET "Category" = 'Model and Binding Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C29838B7-2F50-4427-88AF-EE9E4181539C';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.MLModelScoringBinding */
UPDATE __mj."EntityField" SET "Category" = 'Model and Binding Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'ML Model Scoring Binding Name'
WHERE
  "ID" = '90EE43F7-6882-40D9-9564-20701CF7A5FD';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Path */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A7F0D206-FACB-41B7-B581-12028AD8C572';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeKind */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5C5CA5C1-9F48-40D8-A982-FDE7B605A266';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scope Entity'
WHERE
  "ID" = '4274B247-7FE6-42AF-82F1-54C01B0BFCFE';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Scope */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '9EB4C128-62A6-4723-84BE-B928B74A7B0D';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.EntityMapping */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '292F38DE-B136-4A24-9205-58C6EDA4BFC3';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.AsOfDate */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9FD64601-0B57-40A7-B646-7B3D923B4204';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ReadPolicy */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '8CA00152-6DFC-4D07-8D62-D2E756B476E5';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.DryRun */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6B6434A0-8214-45CF-ADF0-14EB1CEE1991';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScopeEntity */
UPDATE __mj."EntityField" SET "Category" = 'Scoring Scope and Execution', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scope Entity Name'
WHERE
  "ID" = 'FDF9DC9F-6241-4661-B45B-DF0468EFAD86';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedBy */
UPDATE __mj."EntityField" SET "Category" = 'Execution Request and Context', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'D4F07B62-0498-4C66-A9BF-7A7D6D21E1C1';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Request and Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Requested By User'
WHERE
  "ID" = '44A3F9E4-8767-4D71-8D31-800F5593537E';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ProcessRunID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Request and Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Process Run'
WHERE
  "ID" = '496111BA-DD23-453A-A738-0FFA3840175E';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRunID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Request and Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Job Run'
WHERE
  "ID" = '080EC5A4-CF1B-4BAE-95BD-C7BFBC1442C2';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.RequestedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Execution Request and Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Requested By User Name'
WHERE
  "ID" = '20BC4FEC-F7BE-4524-BA56-9073FE4EE923';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.ScheduledJobRun */
UPDATE __mj."EntityField" SET "Category" = 'Execution Request and Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Job Run Details'
WHERE
  "ID" = 'EDE21505-537F-48BB-9E63-16C67C03A496';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Status */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D1B99310-9E0D-4A03-8A4E-F1F96A8EC370';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Refusal */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'A9D0EB0B-9A38-4ECE-8EBD-E431B2927981';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Total */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Total Records'
WHERE
  "ID" = '014FCBC2-E056-4EEB-B192-ACE37F3FF497';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Written */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Written Records'
WHERE
  "ID" = '1101BBC0-D03A-4635-9510-76635311BCBE';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Failed */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Failed Records'
WHERE
  "ID" = '286790AA-AA0F-4AE2-BFE5-0F7AE9672906';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.Skipped */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Skipped Records'
WHERE
  "ID" = '21A4210A-737E-4F7E-B11B-7C69567952FB';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.FirstErrors */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '04257C99-90D3-4396-9402-657C9F558C58';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1605CC51-F9AD-4CB2-B4C3-7280E8BC6544';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.EndedAt */
UPDATE __mj."EntityField" SET "Category" = 'Run Results and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C447F97A-DE65-49B8-9B69-44E75347A05C';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A523AD28-DDF2-4A9F-B98D-98A496860EAB';
/* UPDATE Entity Field Category Info MJ: ML Scoring Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6EDA4EEC-7C3F-4C68-AFFA-E0F8234AC3E5';

/* Set entity icon to fa fa-cogs */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-cogs', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('427233ab-5f26-54db-9a50-b7ba4bf9ba97', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'FieldCategoryInfo', '{
  "Execution Request and Context": {
    "description": "Details on who or what initiated the scoring run",
    "icon": "fa fa-user-clock"
  },
  "Model and Binding Details": {
    "description": "Information regarding the model version, artifacts, and scoring bindings used for the run",
    "icon": "fa fa-cube"
  },
  "Run Results and Status": {
    "description": "Execution status, metrics, error logs, and timestamps for the scoring call",
    "icon": "fa fa-chart-bar"
  },
  "Scoring Scope and Execution": {
    "description": "Parameters defining the scope, read policies, and execution context of the scoring run",
    "icon": "fa fa-crosshairs"
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
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('20bcfbaa-4b4c-58bb-94f1-37c7ae15d3e3', 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2', 'FieldCategoryIcons', '{
  "Execution Request and Context": "fa fa-user-clock",
  "Model and Binding Details": "fa fa-cube",
  "Run Results and Status": "fa fa-chart-bar",
  "Scoring Scope and Execution": "fa fa-crosshairs",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'FF3518D0-8BDC-440D-9480-8EB8CDF6D3B2';

/* Set categories for 17 fields */
/* UPDATE Entity Field Category Info MJ: ML Models.PredictionUnitID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prediction Unit'
WHERE
  "ID" = 'D70F7357-7955-4A95-BACA-2C1562AF73BA';
/* UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocolID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol'
WHERE
  "ID" = '56811DD1-2425-4943-93E4-699B08CCA40C';
/* UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshotID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Snapshot'
WHERE
  "ID" = '7965BB9C-A42E-4DCC-8E32-A78D8309B922';
/* UPDATE Entity Field Category Info MJ: ML Models.TrainingRunID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Run'
WHERE
  "ID" = '859E225E-3777-47FE-86FE-38BCD231A562';
/* UPDATE Entity Field Category Info MJ: ML Models.OutputSemantics */
UPDATE __mj."EntityField" SET "Category" = 'Schema & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '69E6B2E6-CE7D-4676-ACEE-6A24AB66EB87';
/* UPDATE Entity Field Category Info MJ: ML Models.StatusReason */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7CD0993F-A915-4D50-9FD8-CADCC9A4FF0E';
/* UPDATE Entity Field Category Info MJ: ML Models.ArtifactSha256 */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category', "DisplayName" = 'Artifact SHA-256'
WHERE
  "ID" = '53D76647-33D0-4F5F-860C-5FF4968E6429';
/* UPDATE Entity Field Category Info MJ: ML Models.SnapshotHash */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E52DD2C2-0D59-4FFC-A9E9-90456A571E27';
/* UPDATE Entity Field Category Info MJ: ML Models.CodeVersion */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'CAAA603E-D0BA-4796-9851-EEE910205605';
/* UPDATE Entity Field Category Info MJ: ML Models.FeatureSchemaHash */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9BEA6B10-2722-4CCF-8919-6CF80A634CDC';
/* UPDATE Entity Field Category Info MJ: ML Models.Delivery */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '32243FFF-0ADA-46B8-95E6-9E9A300B9ED3';
/* UPDATE Entity Field Category Info MJ: ML Models.ArtifactStatus */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3D26A331-B246-4781-AB7E-5FC789EF4996';
/* UPDATE Entity Field Category Info MJ: ML Models.ArtifactCheckedAt */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FD577F2F-8A21-44F1-82A9-A0545EF10CA6';
/* UPDATE Entity Field Category Info MJ: ML Models.ServingWhileUnevaluated */
UPDATE __mj."EntityField" SET "Category" = 'Artifacts & Validation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D181470A-EF06-4FF6-A288-C7B4479D5B42';
/* UPDATE Entity Field Category Info MJ: ML Models.PredictionUnit */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prediction Unit Name'
WHERE
  "ID" = 'D24C1D93-5014-4AE2-AEE3-3AAB12DB2A5B';
/* UPDATE Entity Field Category Info MJ: ML Models.EvaluationProtocol */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Evaluation Protocol Name'
WHERE
  "ID" = 'B90CCA3D-6292-44A1-AFE9-0F9777551BD6';
/* UPDATE Entity Field Category Info MJ: ML Models.TrainingSnapshot */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Snapshot Name'
WHERE
  "ID" = '7F8D0B93-BD67-4DFA-9463-A9A721B3D52F';

/* Update FieldCategoryInfo setting for entity */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Artifacts & Validation": {
    "description": "Model artifact hashes, delivery metadata, code versions, and validation checks",
    "icon": "fa fa-shield-alt"
  },
  "Model Identity & Status": {
    "description": "Core model identifiers, versioning, lineage, and lifecycle status.",
    "icon": "fa fa-tag"
  },
  "Schema & Configuration": {
    "description": "Input schemas, target variables, and fitted preprocessing parameters.",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  },
  "Training & Performance": {
    "description": "Training execution details, validation metrics, and feature importances.",
    "icon": "fa fa-chart-line"
  }
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Artifacts & Validation": "fa fa-shield-alt",
  "Model Identity & Status": "fa fa-tag",
  "Schema & Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog",
  "Training & Performance": "fa fa-chart-line"
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B'
  AND "Name" = 'FieldCategoryIcons';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Feature Values
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'RecordProcessID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_record_process_id"
            ON "__mj"."FeatureValue" ("RecordProcessID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_entity_id"
            ON "__mj"."FeatureValue" ("EntityID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'RecordID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_record_id"
            ON "__mj"."FeatureValue" ("RecordID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'PromptID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_prompt_id"
            ON "__mj"."FeatureValue" ("PromptID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ProcessRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_process_run_id"
            ON "__mj"."FeatureValue" ("ProcessRunID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ProcessRunDetailID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_process_run_detail_id"
            ON "__mj"."FeatureValue" ("ProcessRunDetailID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'FeatureValueCacheID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_feature_value_cache_id"
            ON "__mj"."FeatureValue" ("FeatureValueCacheID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AIModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_ai_model_id"
            ON "__mj"."FeatureValue" ("AIModelID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'MLModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_ml_model_id"
            ON "__mj"."FeatureValue" ("MLModelID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'MLModelScoringBindingID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_ml_model_scoring_binding_id"
            ON "__mj"."FeatureValue" ("MLModelScoringBindingID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FeatureValue'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'MLScoringRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_feature_value_ml_scoring_run_id"
            ON "__mj"."FeatureValue" ("MLScoringRunID");
    END IF;
END
$$;

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
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJMLModelScoringBinding_MLModelScoringBindingID."TargetColumn" AS "MLModelScoringBinding"
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
LEFT OUTER JOIN
    "__mj"."MLModelScoringBinding" AS MJMLModelScoringBinding_MLModelScoringBindingID
  ON
    "f"."MLModelScoringBindingID" = MJMLModelScoringBinding_MLModelScoringBindingID."ID"
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
    p_inputasof TIMESTAMPTZ DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL,
    p_mlmodelid_clear boolean DEFAULT false,
    p_mlmodelid UUID DEFAULT NULL,
    p_mlmodelscoringbindingid_clear boolean DEFAULT false,
    p_mlmodelscoringbindingid UUID DEFAULT NULL,
    p_mlscoringrunid_clear boolean DEFAULT false,
    p_mlscoringrunid UUID DEFAULT NULL,
    p_intraining_clear boolean DEFAULT false,
    p_intraining BOOLEAN DEFAULT NULL
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
                "InputAsOf",
                "Role",
                "MLModelID",
                "MLModelScoringBindingID",
                "MLScoringRunID",
                "InTraining"
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
                CASE WHEN p_inputasof_clear = true THEN NULL ELSE COALESCE(p_inputasof, NULL) END,
                COALESCE(p_role, 'Champion'),
                CASE WHEN p_mlmodelid_clear = true THEN NULL ELSE COALESCE(p_mlmodelid, NULL) END,
                CASE WHEN p_mlmodelscoringbindingid_clear = true THEN NULL ELSE COALESCE(p_mlmodelscoringbindingid, NULL) END,
                CASE WHEN p_mlscoringrunid_clear = true THEN NULL ELSE COALESCE(p_mlscoringrunid, NULL) END,
                CASE WHEN p_intraining_clear = true THEN NULL ELSE COALESCE(p_intraining, NULL) END
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
    p_inputasof TIMESTAMPTZ DEFAULT NULL,
    p_role varchar(20) DEFAULT NULL,
    p_mlmodelid_clear boolean DEFAULT false,
    p_mlmodelid UUID DEFAULT NULL,
    p_mlmodelscoringbindingid_clear boolean DEFAULT false,
    p_mlmodelscoringbindingid UUID DEFAULT NULL,
    p_mlscoringrunid_clear boolean DEFAULT false,
    p_mlscoringrunid UUID DEFAULT NULL,
    p_intraining_clear boolean DEFAULT false,
    p_intraining BOOLEAN DEFAULT NULL
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
        "InputAsOf" = CASE WHEN p_inputasof_clear = true THEN NULL ELSE COALESCE(p_inputasof, "InputAsOf") END,
        "Role" = COALESCE(p_role, "Role"),
        "MLModelID" = CASE WHEN p_mlmodelid_clear = true THEN NULL ELSE COALESCE(p_mlmodelid, "MLModelID") END,
        "MLModelScoringBindingID" = CASE WHEN p_mlmodelscoringbindingid_clear = true THEN NULL ELSE COALESCE(p_mlmodelscoringbindingid, "MLModelScoringBindingID") END,
        "MLScoringRunID" = CASE WHEN p_mlscoringrunid_clear = true THEN NULL ELSE COALESCE(p_mlscoringrunid, "MLScoringRunID") END,
        "InTraining" = CASE WHEN p_intraining_clear = true THEN NULL ELSE COALESCE(p_intraining, "InTraining") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
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
-- PostgreSQL Generated SQL for Entity: MJ: Latest Feature Values
-- Item: Permissions for vwLatestFeatureValues
-- ============================================================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Publish Records
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelPublishRecord'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_publish_record_model_id"
            ON "__mj"."MLModelPublishRecord" ("ModelID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelPublishRecord'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'TrainingRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_publish_record_training_run_id"
            ON "__mj"."MLModelPublishRecord" ("TrainingRunID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelPublishRecord'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'UserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_publish_record_user_id"
            ON "__mj"."MLModelPublishRecord" ("UserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelPublishRecord'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'SignOffID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_publish_record_sign_off_id"
            ON "__mj"."MLModelPublishRecord" ("SignOffID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelPublishRecord'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ReplacesModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_publish_record_replaces_model_id"
            ON "__mj"."MLModelPublishRecord" ("ReplacesModelID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Publish Records
-- Item: vwMLModelPublishRecords
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Model Publish Records
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLModelPublishRecord
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLModelPublishRecords"
AS
SELECT
    m.*,
    MJUser_UserID."Name" AS "User"
FROM
    "__mj"."MLModelPublishRecord" AS m
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "m"."UserID" = MJUser_UserID."ID"
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
        AND tc.relname = 'vwMLModelPublishRecords'
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
                           AND tc.relname = 'vwMLModelPublishRecords'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLModelPublishRecords" CASCADE;
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
GRANT SELECT ON "__mj"."vwMLModelPublishRecords" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLModelPublishRecords" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLModelPublishRecords" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Publish Records
-- Item: spCreateMLModelPublishRecord
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLModelPublishRecord
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLModelPublishRecord'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLModelPublishRecord"(
    p_id UUID DEFAULT NULL,
    p_modelid_clear boolean DEFAULT false,
    p_modelid UUID DEFAULT NULL,
    p_trainingrunid_clear boolean DEFAULT false,
    p_trainingrunid UUID DEFAULT NULL,
    p_kind varchar(20) DEFAULT NULL,
    p_purpose varchar(20) DEFAULT NULL,
    p_approverkind varchar(20) DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_initiator TEXT DEFAULT NULL,
    p_recordedat TIMESTAMPTZ DEFAULT NULL,
    p_decision_clear boolean DEFAULT false,
    p_decision varchar(10) DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_gatedecision_clear boolean DEFAULT false,
    p_gatedecision TEXT DEFAULT NULL,
    p_evidence_clear boolean DEFAULT false,
    p_evidence TEXT DEFAULT NULL,
    p_evidencesha256_clear boolean DEFAULT false,
    p_evidencesha256 char(64) DEFAULT NULL,
    p_overridesflags TEXT DEFAULT NULL,
    p_signoffid_clear boolean DEFAULT false,
    p_signoffid UUID DEFAULT NULL,
    p_replacesmodelid_clear boolean DEFAULT false,
    p_replacesmodelid UUID DEFAULT NULL,
    p_refusal_clear boolean DEFAULT false,
    p_refusal TEXT DEFAULT NULL,
    p_transient BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLModelPublishRecords" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLModelPublishRecord"
        (
            "ID",
            "ModelID",
                "TrainingRunID",
                "Kind",
                "Purpose",
                "ApproverKind",
                "UserID",
                "Initiator",
                "RecordedAt",
                "Decision",
                "Reason",
                "GateDecision",
                "Evidence",
                "EvidenceSha256",
                "OverridesFlags",
                "SignOffID",
                "ReplacesModelID",
                "Refusal",
                "Transient"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_modelid_clear = true THEN NULL ELSE COALESCE(p_modelid, NULL) END,
                CASE WHEN p_trainingrunid_clear = true THEN NULL ELSE COALESCE(p_trainingrunid, NULL) END,
                p_kind,
                p_purpose,
                p_approverkind,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                p_initiator,
                COALESCE(p_recordedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_decision_clear = true THEN NULL ELSE COALESCE(p_decision, NULL) END,
                CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, NULL) END,
                CASE WHEN p_gatedecision_clear = true THEN NULL ELSE COALESCE(p_gatedecision, NULL) END,
                CASE WHEN p_evidence_clear = true THEN NULL ELSE COALESCE(p_evidence, NULL) END,
                CASE WHEN p_evidencesha256_clear = true THEN NULL ELSE COALESCE(p_evidencesha256, NULL) END,
                COALESCE(p_overridesflags, '[]'),
                CASE WHEN p_signoffid_clear = true THEN NULL ELSE COALESCE(p_signoffid, NULL) END,
                CASE WHEN p_replacesmodelid_clear = true THEN NULL ELSE COALESCE(p_replacesmodelid, NULL) END,
                CASE WHEN p_refusal_clear = true THEN NULL ELSE COALESCE(p_refusal, NULL) END,
                COALESCE(p_transient, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLModelPublishRecords"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLModelPublishRecord" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLModelPublishRecord" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Publish Records
-- Item: spUpdateMLModelPublishRecord
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLModelPublishRecord
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLModelPublishRecord'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLModelPublishRecord"(
    p_id UUID,
    p_modelid_clear boolean DEFAULT false,
    p_modelid UUID DEFAULT NULL,
    p_trainingrunid_clear boolean DEFAULT false,
    p_trainingrunid UUID DEFAULT NULL,
    p_kind varchar(20) DEFAULT NULL,
    p_purpose varchar(20) DEFAULT NULL,
    p_approverkind varchar(20) DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_initiator TEXT DEFAULT NULL,
    p_recordedat TIMESTAMPTZ DEFAULT NULL,
    p_decision_clear boolean DEFAULT false,
    p_decision varchar(10) DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_gatedecision_clear boolean DEFAULT false,
    p_gatedecision TEXT DEFAULT NULL,
    p_evidence_clear boolean DEFAULT false,
    p_evidence TEXT DEFAULT NULL,
    p_evidencesha256_clear boolean DEFAULT false,
    p_evidencesha256 char(64) DEFAULT NULL,
    p_overridesflags TEXT DEFAULT NULL,
    p_signoffid_clear boolean DEFAULT false,
    p_signoffid UUID DEFAULT NULL,
    p_replacesmodelid_clear boolean DEFAULT false,
    p_replacesmodelid UUID DEFAULT NULL,
    p_refusal_clear boolean DEFAULT false,
    p_refusal TEXT DEFAULT NULL,
    p_transient BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLModelPublishRecords" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLModelPublishRecord"
    SET
        "ModelID" = CASE WHEN p_modelid_clear = true THEN NULL ELSE COALESCE(p_modelid, "ModelID") END,
        "TrainingRunID" = CASE WHEN p_trainingrunid_clear = true THEN NULL ELSE COALESCE(p_trainingrunid, "TrainingRunID") END,
        "Kind" = COALESCE(p_kind, "Kind"),
        "Purpose" = COALESCE(p_purpose, "Purpose"),
        "ApproverKind" = COALESCE(p_approverkind, "ApproverKind"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Initiator" = COALESCE(p_initiator, "Initiator"),
        "RecordedAt" = COALESCE(p_recordedat, "RecordedAt"),
        "Decision" = CASE WHEN p_decision_clear = true THEN NULL ELSE COALESCE(p_decision, "Decision") END,
        "Reason" = CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "GateDecision" = CASE WHEN p_gatedecision_clear = true THEN NULL ELSE COALESCE(p_gatedecision, "GateDecision") END,
        "Evidence" = CASE WHEN p_evidence_clear = true THEN NULL ELSE COALESCE(p_evidence, "Evidence") END,
        "EvidenceSha256" = CASE WHEN p_evidencesha256_clear = true THEN NULL ELSE COALESCE(p_evidencesha256, "EvidenceSha256") END,
        "OverridesFlags" = COALESCE(p_overridesflags, "OverridesFlags"),
        "SignOffID" = CASE WHEN p_signoffid_clear = true THEN NULL ELSE COALESCE(p_signoffid, "SignOffID") END,
        "ReplacesModelID" = CASE WHEN p_replacesmodelid_clear = true THEN NULL ELSE COALESCE(p_replacesmodelid, "ReplacesModelID") END,
        "Refusal" = CASE WHEN p_refusal_clear = true THEN NULL ELSE COALESCE(p_refusal, "Refusal") END,
        "Transient" = COALESCE(p_transient, "Transient"),
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLModelPublishRecords"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLModelPublishRecord" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLModelPublishRecord" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModelPublishRecord table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_model_publish_record"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_model_publish_record" ON "__mj"."MLModelPublishRecord";

CREATE TRIGGER "trg_update_ml_model_publish_record"
BEFORE UPDATE ON "__mj"."MLModelPublishRecord"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_model_publish_record"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Publish Records
-- Item: spDeleteMLModelPublishRecord
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLModelPublishRecord
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLModelPublishRecord'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLModelPublishRecord"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLModelPublishRecord"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLModelPublishRecord" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLModelPublishRecord" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Scoring Bindings
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelScoringBinding'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'RecordProcessID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_record_process_id"
            ON "__mj"."MLModelScoringBinding" ("RecordProcessID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelScoringBinding'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'TargetEntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_target_entity_id"
            ON "__mj"."MLModelScoringBinding" ("TargetEntityID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelScoringBinding'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'MLTrainingPipelineID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_ml_training_pipeline_"
            ON "__mj"."MLModelScoringBinding" ("MLTrainingPipelineID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModelScoringBinding'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ViewAuthorizationID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_view_authorization_id"
            ON "__mj"."MLModelScoringBinding" ("ViewAuthorizationID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Scoring Bindings
-- Item: vwMLModelScoringBindings
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Model Scoring Bindings
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLModelScoringBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLModelScoringBindings"
AS
SELECT
    m.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_TargetEntityID."Name" AS "TargetEntity",
    MJMLTrainingPipeline_MLTrainingPipelineID."Name" AS "MLTrainingPipeline",
    MJAuthorization_ViewAuthorizationID."Name" AS "ViewAuthorization"
FROM
    "__mj"."MLModelScoringBinding" AS m
LEFT OUTER JOIN
    "__mj"."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "m"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_TargetEntityID
  ON
    "m"."TargetEntityID" = MJEntity_TargetEntityID."ID"
LEFT OUTER JOIN
    "__mj"."MLTrainingPipeline" AS MJMLTrainingPipeline_MLTrainingPipelineID
  ON
    "m"."MLTrainingPipelineID" = MJMLTrainingPipeline_MLTrainingPipelineID."ID"
LEFT OUTER JOIN
    "__mj"."Authorization" AS MJAuthorization_ViewAuthorizationID
  ON
    "m"."ViewAuthorizationID" = MJAuthorization_ViewAuthorizationID."ID"
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
        AND tc.relname = 'vwMLModelScoringBindings'
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
                           AND tc.relname = 'vwMLModelScoringBindings'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLModelScoringBindings" CASCADE;
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
GRANT SELECT ON "__mj"."vwMLModelScoringBindings" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLModelScoringBindings" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwMLModelScoringBindings" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Scoring Bindings
-- Item: spCreateMLModelScoringBinding
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLModelScoringBinding
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLModelScoringBinding'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLModelScoringBinding"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetcolumn_clear boolean DEFAULT false,
    p_targetcolumn varchar(255) DEFAULT NULL,
    p_mode varchar(20) DEFAULT NULL,
    p_lastscoredat_clear boolean DEFAULT false,
    p_lastscoredat TIMESTAMPTZ DEFAULT NULL,
    p_lastrowcount_clear boolean DEFAULT false,
    p_lastrowcount int DEFAULT NULL,
    p_mltrainingpipelineid UUID DEFAULT NULL,
    p_featurename varchar(255) DEFAULT NULL,
    p_targetcolumnsource_clear boolean DEFAULT false,
    p_targetcolumnsource varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_viewauthorizationid_clear boolean DEFAULT false,
    p_viewauthorizationid UUID DEFAULT NULL,
    p_retentiondays_clear boolean DEFAULT false,
    p_retentiondays int DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLModelScoringBindings" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLModelScoringBinding"
        (
            "ID",
            "RecordProcessID",
                "TargetEntityID",
                "TargetColumn",
                "Mode",
                "LastScoredAt",
                "LastRowCount",
                "MLTrainingPipelineID",
                "FeatureName",
                "TargetColumnSource",
                "Status",
                "ViewAuthorizationID",
                "RetentionDays"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, NULL) END,
                CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, NULL) END,
                CASE WHEN p_targetcolumn_clear = true THEN NULL ELSE COALESCE(p_targetcolumn, NULL) END,
                COALESCE(p_mode, 'OnDemand'),
                CASE WHEN p_lastscoredat_clear = true THEN NULL ELSE COALESCE(p_lastscoredat, NULL) END,
                CASE WHEN p_lastrowcount_clear = true THEN NULL ELSE COALESCE(p_lastrowcount, NULL) END,
                p_mltrainingpipelineid,
                p_featurename,
                CASE WHEN p_targetcolumnsource_clear = true THEN NULL ELSE COALESCE(p_targetcolumnsource, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_viewauthorizationid_clear = true THEN NULL ELSE COALESCE(p_viewauthorizationid, NULL) END,
                CASE WHEN p_retentiondays_clear = true THEN NULL ELSE COALESCE(p_retentiondays, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLModelScoringBindings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLModelScoringBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLModelScoringBinding" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Scoring Bindings
-- Item: spUpdateMLModelScoringBinding
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLModelScoringBinding
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLModelScoringBinding'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLModelScoringBinding"(
    p_id UUID,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetcolumn_clear boolean DEFAULT false,
    p_targetcolumn varchar(255) DEFAULT NULL,
    p_mode varchar(20) DEFAULT NULL,
    p_lastscoredat_clear boolean DEFAULT false,
    p_lastscoredat TIMESTAMPTZ DEFAULT NULL,
    p_lastrowcount_clear boolean DEFAULT false,
    p_lastrowcount int DEFAULT NULL,
    p_mltrainingpipelineid UUID DEFAULT NULL,
    p_featurename varchar(255) DEFAULT NULL,
    p_targetcolumnsource_clear boolean DEFAULT false,
    p_targetcolumnsource varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_viewauthorizationid_clear boolean DEFAULT false,
    p_viewauthorizationid UUID DEFAULT NULL,
    p_retentiondays_clear boolean DEFAULT false,
    p_retentiondays int DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLModelScoringBindings" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLModelScoringBinding"
    SET
        "RecordProcessID" = CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, "RecordProcessID") END,
        "TargetEntityID" = CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, "TargetEntityID") END,
        "TargetColumn" = CASE WHEN p_targetcolumn_clear = true THEN NULL ELSE COALESCE(p_targetcolumn, "TargetColumn") END,
        "Mode" = COALESCE(p_mode, "Mode"),
        "LastScoredAt" = CASE WHEN p_lastscoredat_clear = true THEN NULL ELSE COALESCE(p_lastscoredat, "LastScoredAt") END,
        "LastRowCount" = CASE WHEN p_lastrowcount_clear = true THEN NULL ELSE COALESCE(p_lastrowcount, "LastRowCount") END,
        "MLTrainingPipelineID" = COALESCE(p_mltrainingpipelineid, "MLTrainingPipelineID"),
        "FeatureName" = COALESCE(p_featurename, "FeatureName"),
        "TargetColumnSource" = CASE WHEN p_targetcolumnsource_clear = true THEN NULL ELSE COALESCE(p_targetcolumnsource, "TargetColumnSource") END,
        "Status" = COALESCE(p_status, "Status"),
        "ViewAuthorizationID" = CASE WHEN p_viewauthorizationid_clear = true THEN NULL ELSE COALESCE(p_viewauthorizationid, "ViewAuthorizationID") END,
        "RetentionDays" = CASE WHEN p_retentiondays_clear = true THEN NULL ELSE COALESCE(p_retentiondays, "RetentionDays") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLModelScoringBindings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLModelScoringBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLModelScoringBinding" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModelScoringBinding table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_model_scoring_binding"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_model_scoring_binding" ON "__mj"."MLModelScoringBinding";

CREATE TRIGGER "trg_update_ml_model_scoring_binding"
BEFORE UPDATE ON "__mj"."MLModelScoringBinding"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_model_scoring_binding"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Scoring Bindings
-- Item: spDeleteMLModelScoringBinding
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLModelScoringBinding
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLModelScoringBinding'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLModelScoringBinding"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLModelScoringBinding"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLModelScoringBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLModelScoringBinding" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Models
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'PipelineID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_pipeline_id"
            ON "__mj"."MLModel" ("PipelineID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AlgorithmID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_algorithm_id"
            ON "__mj"."MLModel" ("AlgorithmID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ArtifactFileID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_artifact_file_id"
            ON "__mj"."MLModel" ("ArtifactFileID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'PredictionUnitID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_prediction_unit_id"
            ON "__mj"."MLModel" ("PredictionUnitID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EvaluationProtocolID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_evaluation_protocol_id"
            ON "__mj"."MLModel" ("EvaluationProtocolID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'TrainingSnapshotID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_training_snapshot_id"
            ON "__mj"."MLModel" ("TrainingSnapshotID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLModel'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'TrainingRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_training_run_id"
            ON "__mj"."MLModel" ("TrainingRunID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Models
-- Item: vwMLModels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Models
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLModels"
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID."Name" AS "Pipeline",
    MJMLAlgorithm_AlgorithmID."Name" AS "Algorithm",
    MJFile_ArtifactFileID."Name" AS "ArtifactFile",
    MJMLPredictionUnit_PredictionUnitID."Name" AS "PredictionUnit",
    MJMLEvaluationProtocol_EvaluationProtocolID."Name" AS "EvaluationProtocol",
    MJMLTrainingSnapshot_TrainingSnapshotID."ContentHash" AS "TrainingSnapshot"
FROM
    "__mj"."MLModel" AS m
LEFT OUTER JOIN
    "__mj"."MLTrainingPipeline" AS MJMLTrainingPipeline_PipelineID
  ON
    "m"."PipelineID" = MJMLTrainingPipeline_PipelineID."ID"
LEFT OUTER JOIN
    "__mj"."MLAlgorithm" AS MJMLAlgorithm_AlgorithmID
  ON
    "m"."AlgorithmID" = MJMLAlgorithm_AlgorithmID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_ArtifactFileID
  ON
    "m"."ArtifactFileID" = MJFile_ArtifactFileID."ID"
LEFT OUTER JOIN
    "__mj"."MLPredictionUnit" AS MJMLPredictionUnit_PredictionUnitID
  ON
    "m"."PredictionUnitID" = MJMLPredictionUnit_PredictionUnitID."ID"
LEFT OUTER JOIN
    "__mj"."MLEvaluationProtocol" AS MJMLEvaluationProtocol_EvaluationProtocolID
  ON
    "m"."EvaluationProtocolID" = MJMLEvaluationProtocol_EvaluationProtocolID."ID"
LEFT OUTER JOIN
    "__mj"."MLTrainingSnapshot" AS MJMLTrainingSnapshot_TrainingSnapshotID
  ON
    "m"."TrainingSnapshotID" = MJMLTrainingSnapshot_TrainingSnapshotID."ID"
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
        AND tc.relname = 'vwMLModels'
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
                           AND tc.relname = 'vwMLModels'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLModels" CASCADE;
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
GRANT SELECT ON "__mj"."vwMLModels" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLModels" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwMLModels" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Models
-- Item: spCreateMLModel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLModel"(
    p_id UUID DEFAULT NULL,
    p_pipelineid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_algorithmid UUID DEFAULT NULL,
    p_artifactfileid_clear boolean DEFAULT false,
    p_artifactfileid UUID DEFAULT NULL,
    p_fittedpreprocessing_clear boolean DEFAULT false,
    p_fittedpreprocessing TEXT DEFAULT NULL,
    p_featureschema TEXT DEFAULT NULL,
    p_targetvariable varchar(500) DEFAULT NULL,
    p_problemtype varchar(20) DEFAULT NULL,
    p_metrics_clear boolean DEFAULT false,
    p_metrics TEXT DEFAULT NULL,
    p_holdoutmetrics_clear boolean DEFAULT false,
    p_holdoutmetrics TEXT DEFAULT NULL,
    p_featureimportance_clear boolean DEFAULT false,
    p_featureimportance TEXT DEFAULT NULL,
    p_lineage_clear boolean DEFAULT false,
    p_lineage TEXT DEFAULT NULL,
    p_trainedat_clear boolean DEFAULT false,
    p_trainedat TIMESTAMPTZ DEFAULT NULL,
    p_trainingdurationsec_clear boolean DEFAULT false,
    p_trainingdurationsec int DEFAULT NULL,
    p_trainingrowcount_clear boolean DEFAULT false,
    p_trainingrowcount int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_predictionunitid_clear boolean DEFAULT false,
    p_predictionunitid UUID DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL,
    p_trainingsnapshotid_clear boolean DEFAULT false,
    p_trainingsnapshotid UUID DEFAULT NULL,
    p_trainingrunid_clear boolean DEFAULT false,
    p_trainingrunid UUID DEFAULT NULL,
    p_artifactsha256_clear boolean DEFAULT false,
    p_artifactsha256 char(64) DEFAULT NULL,
    p_snapshothash_clear boolean DEFAULT false,
    p_snapshothash char(64) DEFAULT NULL,
    p_codeversion_clear boolean DEFAULT false,
    p_codeversion TEXT DEFAULT NULL,
    p_featureschemahash_clear boolean DEFAULT false,
    p_featureschemahash char(64) DEFAULT NULL,
    p_outputsemantics_clear boolean DEFAULT false,
    p_outputsemantics TEXT DEFAULT NULL,
    p_delivery_clear boolean DEFAULT false,
    p_delivery TEXT DEFAULT NULL,
    p_statusreason_clear boolean DEFAULT false,
    p_statusreason TEXT DEFAULT NULL,
    p_artifactstatus varchar(20) DEFAULT NULL,
    p_artifactcheckedat_clear boolean DEFAULT false,
    p_artifactcheckedat TIMESTAMPTZ DEFAULT NULL,
    p_servingwhileunevaluated BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLModels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLModel"
        (
            "ID",
            "PipelineID",
                "Version",
                "AlgorithmID",
                "ArtifactFileID",
                "FittedPreprocessing",
                "FeatureSchema",
                "TargetVariable",
                "ProblemType",
                "Metrics",
                "HoldoutMetrics",
                "FeatureImportance",
                "Lineage",
                "TrainedAt",
                "TrainingDurationSec",
                "TrainingRowCount",
                "Status",
                "PredictionUnitID",
                "EvaluationProtocolID",
                "TrainingSnapshotID",
                "TrainingRunID",
                "ArtifactSha256",
                "SnapshotHash",
                "CodeVersion",
                "FeatureSchemaHash",
                "OutputSemantics",
                "Delivery",
                "StatusReason",
                "ArtifactStatus",
                "ArtifactCheckedAt",
                "ServingWhileUnevaluated"
        )
    VALUES
        (
            v_new_id,
            p_pipelineid,
                COALESCE(p_version, 1),
                p_algorithmid,
                CASE WHEN p_artifactfileid_clear = true THEN NULL ELSE COALESCE(p_artifactfileid, NULL) END,
                CASE WHEN p_fittedpreprocessing_clear = true THEN NULL ELSE COALESCE(p_fittedpreprocessing, NULL) END,
                p_featureschema,
                p_targetvariable,
                p_problemtype,
                CASE WHEN p_metrics_clear = true THEN NULL ELSE COALESCE(p_metrics, NULL) END,
                CASE WHEN p_holdoutmetrics_clear = true THEN NULL ELSE COALESCE(p_holdoutmetrics, NULL) END,
                CASE WHEN p_featureimportance_clear = true THEN NULL ELSE COALESCE(p_featureimportance, NULL) END,
                CASE WHEN p_lineage_clear = true THEN NULL ELSE COALESCE(p_lineage, NULL) END,
                CASE WHEN p_trainedat_clear = true THEN NULL ELSE COALESCE(p_trainedat, NULL) END,
                CASE WHEN p_trainingdurationsec_clear = true THEN NULL ELSE COALESCE(p_trainingdurationsec, NULL) END,
                CASE WHEN p_trainingrowcount_clear = true THEN NULL ELSE COALESCE(p_trainingrowcount, NULL) END,
                COALESCE(p_status, 'Draft'),
                CASE WHEN p_predictionunitid_clear = true THEN NULL ELSE COALESCE(p_predictionunitid, NULL) END,
                CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, NULL) END,
                CASE WHEN p_trainingsnapshotid_clear = true THEN NULL ELSE COALESCE(p_trainingsnapshotid, NULL) END,
                CASE WHEN p_trainingrunid_clear = true THEN NULL ELSE COALESCE(p_trainingrunid, NULL) END,
                CASE WHEN p_artifactsha256_clear = true THEN NULL ELSE COALESCE(p_artifactsha256, NULL) END,
                CASE WHEN p_snapshothash_clear = true THEN NULL ELSE COALESCE(p_snapshothash, NULL) END,
                CASE WHEN p_codeversion_clear = true THEN NULL ELSE COALESCE(p_codeversion, NULL) END,
                CASE WHEN p_featureschemahash_clear = true THEN NULL ELSE COALESCE(p_featureschemahash, NULL) END,
                CASE WHEN p_outputsemantics_clear = true THEN NULL ELSE COALESCE(p_outputsemantics, NULL) END,
                CASE WHEN p_delivery_clear = true THEN NULL ELSE COALESCE(p_delivery, NULL) END,
                CASE WHEN p_statusreason_clear = true THEN NULL ELSE COALESCE(p_statusreason, NULL) END,
                COALESCE(p_artifactstatus, 'unverified'),
                CASE WHEN p_artifactcheckedat_clear = true THEN NULL ELSE COALESCE(p_artifactcheckedat, NULL) END,
                COALESCE(p_servingwhileunevaluated, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLModels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLModel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Models
-- Item: spUpdateMLModel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLModel"(
    p_id UUID,
    p_pipelineid UUID DEFAULT NULL,
    p_version int DEFAULT NULL,
    p_algorithmid UUID DEFAULT NULL,
    p_artifactfileid_clear boolean DEFAULT false,
    p_artifactfileid UUID DEFAULT NULL,
    p_fittedpreprocessing_clear boolean DEFAULT false,
    p_fittedpreprocessing TEXT DEFAULT NULL,
    p_featureschema TEXT DEFAULT NULL,
    p_targetvariable varchar(500) DEFAULT NULL,
    p_problemtype varchar(20) DEFAULT NULL,
    p_metrics_clear boolean DEFAULT false,
    p_metrics TEXT DEFAULT NULL,
    p_holdoutmetrics_clear boolean DEFAULT false,
    p_holdoutmetrics TEXT DEFAULT NULL,
    p_featureimportance_clear boolean DEFAULT false,
    p_featureimportance TEXT DEFAULT NULL,
    p_lineage_clear boolean DEFAULT false,
    p_lineage TEXT DEFAULT NULL,
    p_trainedat_clear boolean DEFAULT false,
    p_trainedat TIMESTAMPTZ DEFAULT NULL,
    p_trainingdurationsec_clear boolean DEFAULT false,
    p_trainingdurationsec int DEFAULT NULL,
    p_trainingrowcount_clear boolean DEFAULT false,
    p_trainingrowcount int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_predictionunitid_clear boolean DEFAULT false,
    p_predictionunitid UUID DEFAULT NULL,
    p_evaluationprotocolid_clear boolean DEFAULT false,
    p_evaluationprotocolid UUID DEFAULT NULL,
    p_trainingsnapshotid_clear boolean DEFAULT false,
    p_trainingsnapshotid UUID DEFAULT NULL,
    p_trainingrunid_clear boolean DEFAULT false,
    p_trainingrunid UUID DEFAULT NULL,
    p_artifactsha256_clear boolean DEFAULT false,
    p_artifactsha256 char(64) DEFAULT NULL,
    p_snapshothash_clear boolean DEFAULT false,
    p_snapshothash char(64) DEFAULT NULL,
    p_codeversion_clear boolean DEFAULT false,
    p_codeversion TEXT DEFAULT NULL,
    p_featureschemahash_clear boolean DEFAULT false,
    p_featureschemahash char(64) DEFAULT NULL,
    p_outputsemantics_clear boolean DEFAULT false,
    p_outputsemantics TEXT DEFAULT NULL,
    p_delivery_clear boolean DEFAULT false,
    p_delivery TEXT DEFAULT NULL,
    p_statusreason_clear boolean DEFAULT false,
    p_statusreason TEXT DEFAULT NULL,
    p_artifactstatus varchar(20) DEFAULT NULL,
    p_artifactcheckedat_clear boolean DEFAULT false,
    p_artifactcheckedat TIMESTAMPTZ DEFAULT NULL,
    p_servingwhileunevaluated BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLModels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLModel"
    SET
        "PipelineID" = COALESCE(p_pipelineid, "PipelineID"),
        "Version" = COALESCE(p_version, "Version"),
        "AlgorithmID" = COALESCE(p_algorithmid, "AlgorithmID"),
        "ArtifactFileID" = CASE WHEN p_artifactfileid_clear = true THEN NULL ELSE COALESCE(p_artifactfileid, "ArtifactFileID") END,
        "FittedPreprocessing" = CASE WHEN p_fittedpreprocessing_clear = true THEN NULL ELSE COALESCE(p_fittedpreprocessing, "FittedPreprocessing") END,
        "FeatureSchema" = COALESCE(p_featureschema, "FeatureSchema"),
        "TargetVariable" = COALESCE(p_targetvariable, "TargetVariable"),
        "ProblemType" = COALESCE(p_problemtype, "ProblemType"),
        "Metrics" = CASE WHEN p_metrics_clear = true THEN NULL ELSE COALESCE(p_metrics, "Metrics") END,
        "HoldoutMetrics" = CASE WHEN p_holdoutmetrics_clear = true THEN NULL ELSE COALESCE(p_holdoutmetrics, "HoldoutMetrics") END,
        "FeatureImportance" = CASE WHEN p_featureimportance_clear = true THEN NULL ELSE COALESCE(p_featureimportance, "FeatureImportance") END,
        "Lineage" = CASE WHEN p_lineage_clear = true THEN NULL ELSE COALESCE(p_lineage, "Lineage") END,
        "TrainedAt" = CASE WHEN p_trainedat_clear = true THEN NULL ELSE COALESCE(p_trainedat, "TrainedAt") END,
        "TrainingDurationSec" = CASE WHEN p_trainingdurationsec_clear = true THEN NULL ELSE COALESCE(p_trainingdurationsec, "TrainingDurationSec") END,
        "TrainingRowCount" = CASE WHEN p_trainingrowcount_clear = true THEN NULL ELSE COALESCE(p_trainingrowcount, "TrainingRowCount") END,
        "Status" = COALESCE(p_status, "Status"),
        "PredictionUnitID" = CASE WHEN p_predictionunitid_clear = true THEN NULL ELSE COALESCE(p_predictionunitid, "PredictionUnitID") END,
        "EvaluationProtocolID" = CASE WHEN p_evaluationprotocolid_clear = true THEN NULL ELSE COALESCE(p_evaluationprotocolid, "EvaluationProtocolID") END,
        "TrainingSnapshotID" = CASE WHEN p_trainingsnapshotid_clear = true THEN NULL ELSE COALESCE(p_trainingsnapshotid, "TrainingSnapshotID") END,
        "TrainingRunID" = CASE WHEN p_trainingrunid_clear = true THEN NULL ELSE COALESCE(p_trainingrunid, "TrainingRunID") END,
        "ArtifactSha256" = CASE WHEN p_artifactsha256_clear = true THEN NULL ELSE COALESCE(p_artifactsha256, "ArtifactSha256") END,
        "SnapshotHash" = CASE WHEN p_snapshothash_clear = true THEN NULL ELSE COALESCE(p_snapshothash, "SnapshotHash") END,
        "CodeVersion" = CASE WHEN p_codeversion_clear = true THEN NULL ELSE COALESCE(p_codeversion, "CodeVersion") END,
        "FeatureSchemaHash" = CASE WHEN p_featureschemahash_clear = true THEN NULL ELSE COALESCE(p_featureschemahash, "FeatureSchemaHash") END,
        "OutputSemantics" = CASE WHEN p_outputsemantics_clear = true THEN NULL ELSE COALESCE(p_outputsemantics, "OutputSemantics") END,
        "Delivery" = CASE WHEN p_delivery_clear = true THEN NULL ELSE COALESCE(p_delivery, "Delivery") END,
        "StatusReason" = CASE WHEN p_statusreason_clear = true THEN NULL ELSE COALESCE(p_statusreason, "StatusReason") END,
        "ArtifactStatus" = COALESCE(p_artifactstatus, "ArtifactStatus"),
        "ArtifactCheckedAt" = CASE WHEN p_artifactcheckedat_clear = true THEN NULL ELSE COALESCE(p_artifactcheckedat, "ArtifactCheckedAt") END,
        "ServingWhileUnevaluated" = COALESCE(p_servingwhileunevaluated, "ServingWhileUnevaluated"),
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLModels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLModel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_model"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_model" ON "__mj"."MLModel";

CREATE TRIGGER "trg_update_ml_model"
BEFORE UPDATE ON "__mj"."MLModel"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_model"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Models
-- Item: spDeleteMLModel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLModel"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLModel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLModel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Monitoring Results
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLMonitoringResult'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_monitoring_result_model_id"
            ON "__mj"."MLMonitoringResult" ("ModelID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLMonitoringResult'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ScheduledJobRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_monitoring_result_scheduled_job_run_id"
            ON "__mj"."MLMonitoringResult" ("ScheduledJobRunID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLMonitoringResult'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ChallengerRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_monitoring_result_challenger_run_id"
            ON "__mj"."MLMonitoringResult" ("ChallengerRunID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Monitoring Results
-- Item: vwMLMonitoringResults
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Monitoring Results
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLMonitoringResult
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLMonitoringResults"
AS
SELECT
    m.*,
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun"
FROM
    "__mj"."MLMonitoringResult" AS m
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "m"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
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
        AND tc.relname = 'vwMLMonitoringResults'
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
                           AND tc.relname = 'vwMLMonitoringResults'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLMonitoringResults" CASCADE;
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
GRANT SELECT ON "__mj"."vwMLMonitoringResults" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLMonitoringResults" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLMonitoringResults" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Monitoring Results
-- Item: spCreateMLMonitoringResult
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLMonitoringResult
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLMonitoringResult'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLMonitoringResult"(
    p_id UUID DEFAULT NULL,
    p_modelid UUID DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_period date DEFAULT NULL,
    p_periodgrain varchar(10) DEFAULT NULL,
    p_state varchar(20) DEFAULT NULL,
    p_scoredrows int DEFAULT NULL,
    p_joinedrows int DEFAULT NULL,
    p_excludedintrainingrows int DEFAULT NULL,
    p_primaryscore_clear boolean DEFAULT false,
    p_primaryscore TEXT DEFAULT NULL,
    p_primaryvalue_clear boolean DEFAULT false,
    p_primaryvalue float(53) DEFAULT NULL,
    p_primarylower_clear boolean DEFAULT false,
    p_primarylower float(53) DEFAULT NULL,
    p_primaryupper_clear boolean DEFAULT false,
    p_primaryupper float(53) DEFAULT NULL,
    p_trackedmetrics_clear boolean DEFAULT false,
    p_trackedmetrics TEXT DEFAULT NULL,
    p_calibration_clear boolean DEFAULT false,
    p_calibration TEXT DEFAULT NULL,
    p_driftlook_clear boolean DEFAULT false,
    p_driftlook TEXT DEFAULT NULL,
    p_driftalarms TEXT DEFAULT NULL,
    p_parity_clear boolean DEFAULT false,
    p_parity TEXT DEFAULT NULL,
    p_triggersfired TEXT DEFAULT NULL,
    p_challengerrunid_clear boolean DEFAULT false,
    p_challengerrunid UUID DEFAULT NULL,
    p_challengerresult_clear boolean DEFAULT false,
    p_challengerresult TEXT DEFAULT NULL,
    p_rollbackcheck_clear boolean DEFAULT false,
    p_rollbackcheck TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLMonitoringResults" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLMonitoringResult"
        (
            "ID",
            "ModelID",
                "ScheduledJobRunID",
                "Period",
                "PeriodGrain",
                "State",
                "ScoredRows",
                "JoinedRows",
                "ExcludedInTrainingRows",
                "PrimaryScore",
                "PrimaryValue",
                "PrimaryLower",
                "PrimaryUpper",
                "TrackedMetrics",
                "Calibration",
                "DriftLook",
                "DriftAlarms",
                "Parity",
                "TriggersFired",
                "ChallengerRunID",
                "ChallengerResult",
                "RollbackCheck",
                "ErrorMessage"
        )
    VALUES
        (
            v_new_id,
            p_modelid,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                p_period,
                p_periodgrain,
                p_state,
                COALESCE(p_scoredrows, 0),
                COALESCE(p_joinedrows, 0),
                COALESCE(p_excludedintrainingrows, 0),
                CASE WHEN p_primaryscore_clear = true THEN NULL ELSE COALESCE(p_primaryscore, NULL) END,
                CASE WHEN p_primaryvalue_clear = true THEN NULL ELSE COALESCE(p_primaryvalue, NULL) END,
                CASE WHEN p_primarylower_clear = true THEN NULL ELSE COALESCE(p_primarylower, NULL) END,
                CASE WHEN p_primaryupper_clear = true THEN NULL ELSE COALESCE(p_primaryupper, NULL) END,
                CASE WHEN p_trackedmetrics_clear = true THEN NULL ELSE COALESCE(p_trackedmetrics, NULL) END,
                CASE WHEN p_calibration_clear = true THEN NULL ELSE COALESCE(p_calibration, NULL) END,
                CASE WHEN p_driftlook_clear = true THEN NULL ELSE COALESCE(p_driftlook, NULL) END,
                COALESCE(p_driftalarms, '[]'),
                CASE WHEN p_parity_clear = true THEN NULL ELSE COALESCE(p_parity, NULL) END,
                COALESCE(p_triggersfired, '[]'),
                CASE WHEN p_challengerrunid_clear = true THEN NULL ELSE COALESCE(p_challengerrunid, NULL) END,
                CASE WHEN p_challengerresult_clear = true THEN NULL ELSE COALESCE(p_challengerresult, NULL) END,
                CASE WHEN p_rollbackcheck_clear = true THEN NULL ELSE COALESCE(p_rollbackcheck, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLMonitoringResults"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLMonitoringResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLMonitoringResult" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Monitoring Results
-- Item: spUpdateMLMonitoringResult
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLMonitoringResult
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLMonitoringResult'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLMonitoringResult"(
    p_id UUID,
    p_modelid UUID DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_period date DEFAULT NULL,
    p_periodgrain varchar(10) DEFAULT NULL,
    p_state varchar(20) DEFAULT NULL,
    p_scoredrows int DEFAULT NULL,
    p_joinedrows int DEFAULT NULL,
    p_excludedintrainingrows int DEFAULT NULL,
    p_primaryscore_clear boolean DEFAULT false,
    p_primaryscore TEXT DEFAULT NULL,
    p_primaryvalue_clear boolean DEFAULT false,
    p_primaryvalue float(53) DEFAULT NULL,
    p_primarylower_clear boolean DEFAULT false,
    p_primarylower float(53) DEFAULT NULL,
    p_primaryupper_clear boolean DEFAULT false,
    p_primaryupper float(53) DEFAULT NULL,
    p_trackedmetrics_clear boolean DEFAULT false,
    p_trackedmetrics TEXT DEFAULT NULL,
    p_calibration_clear boolean DEFAULT false,
    p_calibration TEXT DEFAULT NULL,
    p_driftlook_clear boolean DEFAULT false,
    p_driftlook TEXT DEFAULT NULL,
    p_driftalarms TEXT DEFAULT NULL,
    p_parity_clear boolean DEFAULT false,
    p_parity TEXT DEFAULT NULL,
    p_triggersfired TEXT DEFAULT NULL,
    p_challengerrunid_clear boolean DEFAULT false,
    p_challengerrunid UUID DEFAULT NULL,
    p_challengerresult_clear boolean DEFAULT false,
    p_challengerresult TEXT DEFAULT NULL,
    p_rollbackcheck_clear boolean DEFAULT false,
    p_rollbackcheck TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLMonitoringResults" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLMonitoringResult"
    SET
        "ModelID" = COALESCE(p_modelid, "ModelID"),
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "Period" = COALESCE(p_period, "Period"),
        "PeriodGrain" = COALESCE(p_periodgrain, "PeriodGrain"),
        "State" = COALESCE(p_state, "State"),
        "ScoredRows" = COALESCE(p_scoredrows, "ScoredRows"),
        "JoinedRows" = COALESCE(p_joinedrows, "JoinedRows"),
        "ExcludedInTrainingRows" = COALESCE(p_excludedintrainingrows, "ExcludedInTrainingRows"),
        "PrimaryScore" = CASE WHEN p_primaryscore_clear = true THEN NULL ELSE COALESCE(p_primaryscore, "PrimaryScore") END,
        "PrimaryValue" = CASE WHEN p_primaryvalue_clear = true THEN NULL ELSE COALESCE(p_primaryvalue, "PrimaryValue") END,
        "PrimaryLower" = CASE WHEN p_primarylower_clear = true THEN NULL ELSE COALESCE(p_primarylower, "PrimaryLower") END,
        "PrimaryUpper" = CASE WHEN p_primaryupper_clear = true THEN NULL ELSE COALESCE(p_primaryupper, "PrimaryUpper") END,
        "TrackedMetrics" = CASE WHEN p_trackedmetrics_clear = true THEN NULL ELSE COALESCE(p_trackedmetrics, "TrackedMetrics") END,
        "Calibration" = CASE WHEN p_calibration_clear = true THEN NULL ELSE COALESCE(p_calibration, "Calibration") END,
        "DriftLook" = CASE WHEN p_driftlook_clear = true THEN NULL ELSE COALESCE(p_driftlook, "DriftLook") END,
        "DriftAlarms" = COALESCE(p_driftalarms, "DriftAlarms"),
        "Parity" = CASE WHEN p_parity_clear = true THEN NULL ELSE COALESCE(p_parity, "Parity") END,
        "TriggersFired" = COALESCE(p_triggersfired, "TriggersFired"),
        "ChallengerRunID" = CASE WHEN p_challengerrunid_clear = true THEN NULL ELSE COALESCE(p_challengerrunid, "ChallengerRunID") END,
        "ChallengerResult" = CASE WHEN p_challengerresult_clear = true THEN NULL ELSE COALESCE(p_challengerresult, "ChallengerResult") END,
        "RollbackCheck" = CASE WHEN p_rollbackcheck_clear = true THEN NULL ELSE COALESCE(p_rollbackcheck, "RollbackCheck") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLMonitoringResults"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLMonitoringResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLMonitoringResult" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLMonitoringResult table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_monitoring_result"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_monitoring_result" ON "__mj"."MLMonitoringResult";

CREATE TRIGGER "trg_update_ml_monitoring_result"
BEFORE UPDATE ON "__mj"."MLMonitoringResult"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_monitoring_result"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Monitoring Results
-- Item: spDeleteMLMonitoringResult
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLMonitoringResult
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLMonitoringResult'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLMonitoringResult"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLMonitoringResult"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLMonitoringResult" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLMonitoringResult" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Output Bindings
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLOutputBinding'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_output_binding_model_id"
            ON "__mj"."MLOutputBinding" ("ModelID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Output Bindings
-- Item: vwMLOutputBindings
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Output Bindings
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLOutputBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLOutputBindings"
AS
SELECT
    m.*
FROM
    "__mj"."MLOutputBinding" AS m
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
        AND tc.relname = 'vwMLOutputBindings'
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
                           AND tc.relname = 'vwMLOutputBindings'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLOutputBindings" CASCADE;
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
GRANT SELECT ON "__mj"."vwMLOutputBindings" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLOutputBindings" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLOutputBindings" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Output Bindings
-- Item: spCreateMLOutputBinding
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLOutputBinding
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLOutputBinding'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLOutputBinding"(
    p_id UUID DEFAULT NULL,
    p_modelid UUID DEFAULT NULL,
    p_surface varchar(30) DEFAULT NULL,
    p_sortsby varchar(30) DEFAULT NULL,
    p_driverdirectionrelativeto varchar(20) DEFAULT NULL,
    p_label varchar(255) DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLOutputBindings" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLOutputBinding"
        (
            "ID",
            "ModelID",
                "Surface",
                "SortsBy",
                "DriverDirectionRelativeTo",
                "Label"
        )
    VALUES
        (
            v_new_id,
            p_modelid,
                p_surface,
                p_sortsby,
                p_driverdirectionrelativeto,
                p_label
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLOutputBindings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLOutputBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLOutputBinding" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Output Bindings
-- Item: spUpdateMLOutputBinding
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLOutputBinding
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLOutputBinding'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLOutputBinding"(
    p_id UUID,
    p_modelid UUID DEFAULT NULL,
    p_surface varchar(30) DEFAULT NULL,
    p_sortsby varchar(30) DEFAULT NULL,
    p_driverdirectionrelativeto varchar(20) DEFAULT NULL,
    p_label varchar(255) DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLOutputBindings" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLOutputBinding"
    SET
        "ModelID" = COALESCE(p_modelid, "ModelID"),
        "Surface" = COALESCE(p_surface, "Surface"),
        "SortsBy" = COALESCE(p_sortsby, "SortsBy"),
        "DriverDirectionRelativeTo" = COALESCE(p_driverdirectionrelativeto, "DriverDirectionRelativeTo"),
        "Label" = COALESCE(p_label, "Label"),
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLOutputBindings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLOutputBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLOutputBinding" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLOutputBinding table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_output_binding"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_output_binding" ON "__mj"."MLOutputBinding";

CREATE TRIGGER "trg_update_ml_output_binding"
BEFORE UPDATE ON "__mj"."MLOutputBinding"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_output_binding"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Output Bindings
-- Item: spDeleteMLOutputBinding
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLOutputBinding
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLOutputBinding'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLOutputBinding"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLOutputBinding"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLOutputBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLOutputBinding" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Scoring Runs
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLScoringRun'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_scoring_run_model_id"
            ON "__mj"."MLScoringRun" ("ModelID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLScoringRun'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'MLModelScoringBindingID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_scoring_run_ml_model_scoring_binding_id"
            ON "__mj"."MLScoringRun" ("MLModelScoringBindingID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLScoringRun'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ScopeEntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_scoring_run_scope_entity_id"
            ON "__mj"."MLScoringRun" ("ScopeEntityID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLScoringRun'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'RequestedByUserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_scoring_run_requested_by_user_id"
            ON "__mj"."MLScoringRun" ("RequestedByUserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLScoringRun'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ProcessRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_scoring_run_process_run_id"
            ON "__mj"."MLScoringRun" ("ProcessRunID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'MLScoringRun'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ScheduledJobRunID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_scoring_run_scheduled_job_run_id"
            ON "__mj"."MLScoringRun" ("ScheduledJobRunID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Scoring Runs
-- Item: vwMLScoringRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Scoring Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLScoringRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMLScoringRuns"
AS
SELECT
    m.*,
    MJMLModelScoringBinding_MLModelScoringBindingID."TargetColumn" AS "MLModelScoringBinding",
    MJEntity_ScopeEntityID."Name" AS "ScopeEntity",
    MJUser_RequestedByUserID."Name" AS "RequestedByUser",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun"
FROM
    "__mj"."MLScoringRun" AS m
LEFT OUTER JOIN
    "__mj"."MLModelScoringBinding" AS MJMLModelScoringBinding_MLModelScoringBindingID
  ON
    "m"."MLModelScoringBindingID" = MJMLModelScoringBinding_MLModelScoringBindingID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_ScopeEntityID
  ON
    "m"."ScopeEntityID" = MJEntity_ScopeEntityID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_RequestedByUserID
  ON
    "m"."RequestedByUserID" = MJUser_RequestedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "m"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
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
        AND tc.relname = 'vwMLScoringRuns'
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
                           AND tc.relname = 'vwMLScoringRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMLScoringRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwMLScoringRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMLScoringRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMLScoringRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Scoring Runs
-- Item: spCreateMLScoringRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLScoringRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLScoringRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMLScoringRun"(
    p_id UUID DEFAULT NULL,
    p_modelid_clear boolean DEFAULT false,
    p_modelid UUID DEFAULT NULL,
    p_modelversion_clear boolean DEFAULT false,
    p_modelversion int DEFAULT NULL,
    p_mlmodelscoringbindingid_clear boolean DEFAULT false,
    p_mlmodelscoringbindingid UUID DEFAULT NULL,
    p_artifactsha256_clear boolean DEFAULT false,
    p_artifactsha256 char(64) DEFAULT NULL,
    p_featureschemahash_clear boolean DEFAULT false,
    p_featureschemahash char(64) DEFAULT NULL,
    p_path varchar(20) DEFAULT NULL,
    p_scopekind varchar(20) DEFAULT NULL,
    p_scopeentityid UUID DEFAULT NULL,
    p_scope TEXT DEFAULT NULL,
    p_entitymapping_clear boolean DEFAULT false,
    p_entitymapping TEXT DEFAULT NULL,
    p_asofdate TIMESTAMPTZ DEFAULT NULL,
    p_readpolicy TEXT DEFAULT NULL,
    p_dryrun BOOLEAN DEFAULT NULL,
    p_requestedby TEXT DEFAULT NULL,
    p_requestedbyuserid_clear boolean DEFAULT false,
    p_requestedbyuserid UUID DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_refusal_clear boolean DEFAULT false,
    p_refusal TEXT DEFAULT NULL,
    p_total int DEFAULT NULL,
    p_written int DEFAULT NULL,
    p_failed int DEFAULT NULL,
    p_skipped int DEFAULT NULL,
    p_firsterrors_clear boolean DEFAULT false,
    p_firsterrors TEXT DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLScoringRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MLScoringRun"
        (
            "ID",
            "ModelID",
                "ModelVersion",
                "MLModelScoringBindingID",
                "ArtifactSha256",
                "FeatureSchemaHash",
                "Path",
                "ScopeKind",
                "ScopeEntityID",
                "Scope",
                "EntityMapping",
                "AsOfDate",
                "ReadPolicy",
                "DryRun",
                "RequestedBy",
                "RequestedByUserID",
                "ProcessRunID",
                "ScheduledJobRunID",
                "Status",
                "Refusal",
                "Total",
                "Written",
                "Failed",
                "Skipped",
                "FirstErrors",
                "StartedAt",
                "EndedAt"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_modelid_clear = true THEN NULL ELSE COALESCE(p_modelid, NULL) END,
                CASE WHEN p_modelversion_clear = true THEN NULL ELSE COALESCE(p_modelversion, NULL) END,
                CASE WHEN p_mlmodelscoringbindingid_clear = true THEN NULL ELSE COALESCE(p_mlmodelscoringbindingid, NULL) END,
                CASE WHEN p_artifactsha256_clear = true THEN NULL ELSE COALESCE(p_artifactsha256, NULL) END,
                CASE WHEN p_featureschemahash_clear = true THEN NULL ELSE COALESCE(p_featureschemahash, NULL) END,
                p_path,
                p_scopekind,
                p_scopeentityid,
                p_scope,
                CASE WHEN p_entitymapping_clear = true THEN NULL ELSE COALESCE(p_entitymapping, NULL) END,
                p_asofdate,
                p_readpolicy,
                COALESCE(p_dryrun, FALSE),
                p_requestedby,
                CASE WHEN p_requestedbyuserid_clear = true THEN NULL ELSE COALESCE(p_requestedbyuserid, NULL) END,
                CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                COALESCE(p_status, 'running'),
                CASE WHEN p_refusal_clear = true THEN NULL ELSE COALESCE(p_refusal, NULL) END,
                COALESCE(p_total, 0),
                COALESCE(p_written, 0),
                COALESCE(p_failed, 0),
                COALESCE(p_skipped, 0),
                CASE WHEN p_firsterrors_clear = true THEN NULL ELSE COALESCE(p_firsterrors, NULL) END,
                COALESCE(p_startedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMLScoringRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLScoringRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMLScoringRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Scoring Runs
-- Item: spUpdateMLScoringRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLScoringRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLScoringRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMLScoringRun"(
    p_id UUID,
    p_modelid_clear boolean DEFAULT false,
    p_modelid UUID DEFAULT NULL,
    p_modelversion_clear boolean DEFAULT false,
    p_modelversion int DEFAULT NULL,
    p_mlmodelscoringbindingid_clear boolean DEFAULT false,
    p_mlmodelscoringbindingid UUID DEFAULT NULL,
    p_artifactsha256_clear boolean DEFAULT false,
    p_artifactsha256 char(64) DEFAULT NULL,
    p_featureschemahash_clear boolean DEFAULT false,
    p_featureschemahash char(64) DEFAULT NULL,
    p_path varchar(20) DEFAULT NULL,
    p_scopekind varchar(20) DEFAULT NULL,
    p_scopeentityid UUID DEFAULT NULL,
    p_scope TEXT DEFAULT NULL,
    p_entitymapping_clear boolean DEFAULT false,
    p_entitymapping TEXT DEFAULT NULL,
    p_asofdate TIMESTAMPTZ DEFAULT NULL,
    p_readpolicy TEXT DEFAULT NULL,
    p_dryrun BOOLEAN DEFAULT NULL,
    p_requestedby TEXT DEFAULT NULL,
    p_requestedbyuserid_clear boolean DEFAULT false,
    p_requestedbyuserid UUID DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_refusal_clear boolean DEFAULT false,
    p_refusal TEXT DEFAULT NULL,
    p_total int DEFAULT NULL,
    p_written int DEFAULT NULL,
    p_failed int DEFAULT NULL,
    p_skipped int DEFAULT NULL,
    p_firsterrors_clear boolean DEFAULT false,
    p_firsterrors TEXT DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwMLScoringRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MLScoringRun"
    SET
        "ModelID" = CASE WHEN p_modelid_clear = true THEN NULL ELSE COALESCE(p_modelid, "ModelID") END,
        "ModelVersion" = CASE WHEN p_modelversion_clear = true THEN NULL ELSE COALESCE(p_modelversion, "ModelVersion") END,
        "MLModelScoringBindingID" = CASE WHEN p_mlmodelscoringbindingid_clear = true THEN NULL ELSE COALESCE(p_mlmodelscoringbindingid, "MLModelScoringBindingID") END,
        "ArtifactSha256" = CASE WHEN p_artifactsha256_clear = true THEN NULL ELSE COALESCE(p_artifactsha256, "ArtifactSha256") END,
        "FeatureSchemaHash" = CASE WHEN p_featureschemahash_clear = true THEN NULL ELSE COALESCE(p_featureschemahash, "FeatureSchemaHash") END,
        "Path" = COALESCE(p_path, "Path"),
        "ScopeKind" = COALESCE(p_scopekind, "ScopeKind"),
        "ScopeEntityID" = COALESCE(p_scopeentityid, "ScopeEntityID"),
        "Scope" = COALESCE(p_scope, "Scope"),
        "EntityMapping" = CASE WHEN p_entitymapping_clear = true THEN NULL ELSE COALESCE(p_entitymapping, "EntityMapping") END,
        "AsOfDate" = COALESCE(p_asofdate, "AsOfDate"),
        "ReadPolicy" = COALESCE(p_readpolicy, "ReadPolicy"),
        "DryRun" = COALESCE(p_dryrun, "DryRun"),
        "RequestedBy" = COALESCE(p_requestedby, "RequestedBy"),
        "RequestedByUserID" = CASE WHEN p_requestedbyuserid_clear = true THEN NULL ELSE COALESCE(p_requestedbyuserid, "RequestedByUserID") END,
        "ProcessRunID" = CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, "ProcessRunID") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "Status" = COALESCE(p_status, "Status"),
        "Refusal" = CASE WHEN p_refusal_clear = true THEN NULL ELSE COALESCE(p_refusal, "Refusal") END,
        "Total" = COALESCE(p_total, "Total"),
        "Written" = COALESCE(p_written, "Written"),
        "Failed" = COALESCE(p_failed, "Failed"),
        "Skipped" = COALESCE(p_skipped, "Skipped"),
        "FirstErrors" = CASE WHEN p_firsterrors_clear = true THEN NULL ELSE COALESCE(p_firsterrors, "FirstErrors") END,
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMLScoringRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLScoringRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMLScoringRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLScoringRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ml_scoring_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_scoring_run" ON "__mj"."MLScoringRun";

CREATE TRIGGER "trg_update_ml_scoring_run"
BEFORE UPDATE ON "__mj"."MLScoringRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ml_scoring_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Scoring Runs
-- Item: spDeleteMLScoringRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLScoringRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLScoringRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMLScoringRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MLScoringRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLScoringRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMLScoringRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIPrompt'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'TemplateID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
            ON "__mj"."AIPrompt" ("TemplateID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIPrompt'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'CategoryID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
            ON "__mj"."AIPrompt" ("CategoryID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIPrompt'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'TypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
            ON "__mj"."AIPrompt" ("TypeID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIPrompt'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'AIModelTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
            ON "__mj"."AIPrompt" ("AIModelTypeID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'AIPrompt'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ResultSelectorPromptID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
            ON "__mj"."AIPrompt" ("ResultSelectorPromptID");
    END IF;
END
$$;

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


DO $if_view_exists$
BEGIN
  IF to_regclass('"__mj"."vwAIPromptsActive"') IS NOT NULL THEN
    EXECUTE 'SELECT "__mj"."spRebindLayeredOuterView"(''__mj'', ''vwAIPromptsActive'', ''vwAIPrompts'');';
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
    p_templatedatacapture varchar(20) DEFAULT NULL,
    p_timeoutms_clear boolean DEFAULT false,
    p_timeoutms int DEFAULT NULL
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
                "TemplateDataCapture",
                "TimeoutMS"
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
                CASE WHEN p_templatedatacapture_clear = true THEN NULL ELSE COALESCE(p_templatedatacapture, NULL) END,
                CASE WHEN p_timeoutms_clear = true THEN NULL ELSE COALESCE(p_timeoutms, NULL) END
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
    p_templatedatacapture varchar(20) DEFAULT NULL,
    p_timeoutms_clear boolean DEFAULT false,
    p_timeoutms int DEFAULT NULL
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
        "TemplateDataCapture" = CASE WHEN p_templatedatacapture_clear = true THEN NULL ELSE COALESCE(p_templatedatacapture, "TemplateDataCapture") END,
        "TimeoutMS" = CASE WHEN p_timeoutms_clear = true THEN NULL ELSE COALESCE(p_timeoutms, "TimeoutMS") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
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

-- ===================== HAND-FINISHED (v6.3.0-edge.2 release build) =====================
-- RelatedEntityNameFieldMap calls. The SQL Server CodeGen section sets these with
-- EXEC spUpdateEntityFieldRelatedEntityNameFieldMap; the split converter reports those EXECs as unhandled
-- (blocking the bake, so they were removed from the bake input) and the bake does not carry them, so a PG
-- database built by mj migrate would leave the map NULL. On PostgreSQL the routine is a FUNCTION, so the
-- calls are PERFORM with named arguments (same form as V202609091200 / V202611161546).

/* related entity name field map for entity field 63758D3B-EBE1-4F32-8DDD-A6C56A403651 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '63758D3B-EBE1-4F32-8DDD-A6C56A403651'::uuid,
    p_relatedentitynamefieldmap := 'MLModelScoringBinding'
  );
END $$;

/* related entity name field map for entity field 87B82E1A-CFD0-4B51-9127-E344C63F1373 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '87B82E1A-CFD0-4B51-9127-E344C63F1373'::uuid,
    p_relatedentitynamefieldmap := 'User'
  );
END $$;

/* related entity name field map for entity field 9A5AB8B8-1DB9-44DE-AC6F-95F6561601B7 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '9A5AB8B8-1DB9-44DE-AC6F-95F6561601B7'::uuid,
    p_relatedentitynamefieldmap := 'MLTrainingPipeline'
  );
END $$;

/* related entity name field map for entity field D70F7357-7955-4A95-BACA-2C1562AF73BA */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'D70F7357-7955-4A95-BACA-2C1562AF73BA'::uuid,
    p_relatedentitynamefieldmap := 'PredictionUnit'
  );
END $$;

/* related entity name field map for entity field D1EE5D2D-3609-4F19-8CA1-58C4CAD0A9E1 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'D1EE5D2D-3609-4F19-8CA1-58C4CAD0A9E1'::uuid,
    p_relatedentitynamefieldmap := 'ScheduledJobRun'
  );
END $$;

/* related entity name field map for entity field C1418070-BC06-4C81-A5E5-9157D98260E1 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'C1418070-BC06-4C81-A5E5-9157D98260E1'::uuid,
    p_relatedentitynamefieldmap := 'MLModelScoringBinding'
  );
END $$;

/* related entity name field map for entity field 56811DD1-2425-4943-93E4-699B08CCA40C */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '56811DD1-2425-4943-93E4-699B08CCA40C'::uuid,
    p_relatedentitynamefieldmap := 'EvaluationProtocol'
  );
END $$;

/* related entity name field map for entity field C531130D-2663-402B-9643-57AF83E76F08 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'C531130D-2663-402B-9643-57AF83E76F08'::uuid,
    p_relatedentitynamefieldmap := 'ViewAuthorization'
  );
END $$;

/* related entity name field map for entity field 4274B247-7FE6-42AF-82F1-54C01B0BFCFE */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '4274B247-7FE6-42AF-82F1-54C01B0BFCFE'::uuid,
    p_relatedentitynamefieldmap := 'ScopeEntity'
  );
END $$;

/* related entity name field map for entity field 7965BB9C-A42E-4DCC-8E32-A78D8309B922 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '7965BB9C-A42E-4DCC-8E32-A78D8309B922'::uuid,
    p_relatedentitynamefieldmap := 'TrainingSnapshot'
  );
END $$;

/* related entity name field map for entity field 44A3F9E4-8767-4D71-8D31-800F5593537E */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '44A3F9E4-8767-4D71-8D31-800F5593537E'::uuid,
    p_relatedentitynamefieldmap := 'RequestedByUser'
  );
END $$;

/* related entity name field map for entity field 080EC5A4-CF1B-4BAE-95BD-C7BFBC1442C2 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '080EC5A4-CF1B-4BAE-95BD-C7BFBC1442C2'::uuid,
    p_relatedentitynamefieldmap := 'ScheduledJobRun'
  );
END $$;
-- ===================== END HAND-FINISHED =====================
