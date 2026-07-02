-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606271601__v5.44.x__Predictive_Studio.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* *************************************************************************************************
 * Migration: Predictive Studio — core schema (full DDL)
 *
 * One migration for the entire Predictive Studio data model, so it can be run once and CodeGen
 * run once. See plans/predictive-studio.md (§4) for the design.
 *
 * Tables created (FK order):
 *   1. MLAlgorithm                 (MJ: ML Algorithms)                    - curated algorithm catalog
 *   2. MLAlgorithmUseCase          (MJ: ML Algorithm Use Cases)           - decision-relevant scenarios
 *   3. MLAlgorithmUseCaseRanking   (MJ: ML Algorithm Use Case Rankings)   - algorithm x use-case fit
 *   4. MLTrainingPipeline          (MJ: ML Training Pipelines)            - declarative model definition
 *   5. MLModel                     (MJ: ML Models)                        - immutable, versioned trained model
 *   6. Experiment                  (MJ: Experiments)                      - GENERIC reusable experiment definition
 *   7. ExperimentSession           (MJ: Experiment Sessions)             - GENERIC one execution of an Experiment
 *   8. ExperimentSessionIteration  (MJ: Experiment Session Iterations)    - GENERIC one attempt within a session
 *   9. MLTrainingRun               (MJ: ML Training Runs)                 - ML-specific detail of an iteration / standalone train
 *  10. MLModelScoringBinding       (MJ: ML Model Scoring Bindings)        - where a model scores (lineage)
 *
 * Experiment / ExperimentSession / ExperimentSessionIteration are deliberately GENERIC, ML-agnostic
 * primitives: a budgeted, plan-then-execute-then-refine agentic search that groups N iterations with a
 * leaderboard, a human approval gate, and an owning agent run. Predictive Studio is the first consumer
 * (MLTrainingRun is the ML leaf that hangs off an iteration), but the same three tables are intended to
 * back prompt-optimization, agent-config search, eval sweeps, etc. — each with its own leaf run table
 * FK'ing into ExperimentSessionIteration. Nothing here is ML-coupled except the MLTrainingRun leaf.
 *
 * Schema/DDL only. CodeGen generates the Entity/EntityField metadata, __mj_CreatedAt/__mj_UpdatedAt
 * columns, foreign-key indexes (IDX_AUTO_MJ_FKEY_*), views, and CRUD stored procedures after this
 * migration runs. Lookup ROWS (the algorithm catalog, use cases, and the ranking matrix) are seeded
 * later via metadata sync (mj sync), not here.
 *
 * Note: MLModelScoringBinding.MaterializedResultID is a forward-compatible SOFT reference to
 * "MJ: Materialized Results" (PR #2770), which is not yet merged — so it is intentionally NOT a
 * foreign-key constraint here. Promote it to a real FK once that table exists.
 *
 * Version: 5.44.x
 ************************************************************************************************* */
/* ============================================================================ */
/* 1. MLAlgorithm (MJ: ML Algorithms) — curated algorithm catalog */
/* ============================================================================ */
CREATE TABLE __mj."MLAlgorithm" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ProblemTypes" VARCHAR(100) NOT NULL,
  "DriverClass" VARCHAR(255) NOT NULL,
  "HyperparameterSchema" TEXT NULL,
  "DefaultHyperparameters" TEXT NULL,
  "SupportsFeatureImportance" BOOLEAN NOT NULL DEFAULT TRUE,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT "PK_MLAlgorithm" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLAlgorithm_Status" CHECK ("Status" IN ('Active', 'Deprecated'))
);

COMMENT ON TABLE __mj."MLAlgorithm" IS 'Curated, fixed catalog of machine-learning algorithms a Training Pipeline can use. Opinionated by design (a small set of well-understood algorithms); the differentiation is in the data/features, not algorithm innovation. Each row declares the algorithm''s supported problem types, its hyperparameter schema, and the Python-sidecar driver key that executes it. EXAMPLE: "Gradient Boosting (XGBoost)" with DriverClass "xgboost".';

COMMENT ON COLUMN __mj."MLAlgorithm"."Name" IS 'Display name of the algorithm (e.g., "Gradient Boosting (XGBoost)", "Logistic Regression")';

COMMENT ON COLUMN __mj."MLAlgorithm"."Description" IS 'Optional description of the algorithm and when to use it';

COMMENT ON COLUMN __mj."MLAlgorithm"."ProblemTypes" IS 'Comma-delimited list of supported problem types (e.g., "classification", "regression", or "classification,regression")';

COMMENT ON COLUMN __mj."MLAlgorithm"."DriverClass" IS 'Algorithm key passed to the Python training/inference sidecar (e.g., "xgboost", "lightgbm", "logistic_regression", "random_forest", "ridge", "mlp")';

COMMENT ON COLUMN __mj."MLAlgorithm"."HyperparameterSchema" IS 'JSON Schema describing the algorithm''s tunable hyperparameters (drives the UI form and validation)';

COMMENT ON COLUMN __mj."MLAlgorithm"."DefaultHyperparameters" IS 'JSON object of default hyperparameter values applied when a pipeline does not override them';

COMMENT ON COLUMN __mj."MLAlgorithm"."SupportsFeatureImportance" IS 'When 1, the algorithm produces per-feature importance scores used for explainability and the leakage guard';

COMMENT ON COLUMN __mj."MLAlgorithm"."Status" IS 'Lifecycle status: Active (selectable) or Deprecated';

/* ============================================================================ */
/* 2. MLAlgorithmUseCase (MJ: ML Algorithm Use Cases) — decision-relevant scenarios */
/* ============================================================================ */
CREATE TABLE __mj."MLAlgorithmUseCase" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ProblemTypeScope" VARCHAR(20) NOT NULL DEFAULT 'any',
  "Guidance" TEXT NULL,
  "DisplayOrder" INT NOT NULL DEFAULT 0,
  CONSTRAINT "PK_MLAlgorithmUseCase" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLAlgorithmUseCase_ProblemTypeScope" CHECK ("ProblemTypeScope" IN ('classification', 'regression', 'any'))
);

COMMENT ON TABLE __mj."MLAlgorithmUseCase" IS 'A curated, decision-relevant scenario used to guide algorithm choice — NOT a business label (churn/renewal/attendee-return are all the same "binary classification" shape, so they do not differentiate algorithms). Joined to MLAlgorithm via MLAlgorithmUseCaseRanking. EXAMPLES: "Binary classification (yes/no)", "Regression (predict a number)", "Interpretability required", "Minimal tuning (business-user)", "Large/wide dataset (speed)", "Embedding/LLM-feature-heavy", "Small dataset".';

COMMENT ON COLUMN __mj."MLAlgorithmUseCase"."Name" IS 'Display name of the scenario (e.g., "Interpretability required")';

COMMENT ON COLUMN __mj."MLAlgorithmUseCase"."Description" IS 'Optional description of the scenario';

COMMENT ON COLUMN __mj."MLAlgorithmUseCase"."ProblemTypeScope" IS 'Which problem type this scenario applies to: classification, regression, or any';

COMMENT ON COLUMN __mj."MLAlgorithmUseCase"."Guidance" IS 'Longer agent-readable guidance on when this scenario applies and what it implies for algorithm choice';

COMMENT ON COLUMN __mj."MLAlgorithmUseCase"."DisplayOrder" IS 'Ordering hint for displaying scenarios in the UI';

/* ============================================================================ */
/* 3. MLAlgorithmUseCaseRanking (MJ: ML Algorithm Use Case Rankings) — algorithm x use-case fit */
/* ============================================================================ */
CREATE TABLE __mj."MLAlgorithmUseCaseRanking" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "MLAlgorithmID" UUID NOT NULL,
  "MLAlgorithmUseCaseID" UUID NOT NULL,
  "SuitabilityScore" INT NOT NULL,
  "RecommendationLevel" VARCHAR(20) NOT NULL,
  "Rationale" TEXT NULL,
  CONSTRAINT "PK_MLAlgorithmUseCaseRanking" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLAlgorithmUseCaseRanking_SuitabilityScore" CHECK ("SuitabilityScore" >= 1 AND "SuitabilityScore" <= 5),
  CONSTRAINT "CK_MLAlgorithmUseCaseRanking_RecommendationLevel" CHECK ("RecommendationLevel" IN ('Primary', 'Strong', 'Viable', 'Weak', 'NotRecommended')),
  CONSTRAINT "UQ_MLAlgorithmUseCaseRanking_Algo_UseCase" UNIQUE (
    "MLAlgorithmID",
    "MLAlgorithmUseCaseID"
  ),
  CONSTRAINT "FK_MLAlgorithmUseCaseRanking_Algorithm" FOREIGN KEY ("MLAlgorithmID") REFERENCES __mj."MLAlgorithm" (
    "ID"
  ),
  CONSTRAINT "FK_MLAlgorithmUseCaseRanking_UseCase" FOREIGN KEY ("MLAlgorithmUseCaseID") REFERENCES __mj."MLAlgorithmUseCase" (
    "ID"
  )
);

COMMENT ON TABLE __mj."MLAlgorithmUseCaseRanking" IS 'Codifies how well each algorithm fits each use-case scenario, so both the model-development agent and a non-expert human get guided, rationale-bearing defaults instead of guessing. One row per (algorithm, use case) pair.';

COMMENT ON COLUMN __mj."MLAlgorithmUseCaseRanking"."MLAlgorithmID" IS 'Foreign key to the algorithm being ranked';

COMMENT ON COLUMN __mj."MLAlgorithmUseCaseRanking"."MLAlgorithmUseCaseID" IS 'Foreign key to the use-case scenario the algorithm is ranked for';

COMMENT ON COLUMN __mj."MLAlgorithmUseCaseRanking"."SuitabilityScore" IS 'Numeric suitability for sorting/ranking, 1 (worst) to 5 (best)';

COMMENT ON COLUMN __mj."MLAlgorithmUseCaseRanking"."RecommendationLevel" IS 'Categorical recommendation: Primary, Strong, Viable, Weak, or NotRecommended';

COMMENT ON COLUMN __mj."MLAlgorithmUseCaseRanking"."Rationale" IS 'Plain-language explanation of the ranking, readable by both agents and humans (e.g., "Gives feature importances but not simple coefficients — if a stakeholder needs to see exactly why each prediction was made, prefer Logistic/Ridge.")';

/* ============================================================================ */
/* 4. MLTrainingPipeline (MJ: ML Training Pipelines) — declarative model definition */
/* ============================================================================ */
CREATE TABLE __mj."MLTrainingPipeline" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Version" INT NOT NULL DEFAULT 1,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
  "TargetEntityID" UUID NOT NULL,
  "TargetVariable" VARCHAR(500) NOT NULL,
  "ProblemType" VARCHAR(20) NOT NULL,
  "AlgorithmID" UUID NOT NULL,
  "Hyperparameters" TEXT NULL,
  "SourceBindings" TEXT NULL,
  "FeatureSteps" TEXT NULL,
  "AsOfStrategy" TEXT NULL,
  "LeakageGuard" TEXT NULL,
  "ValidationStrategy" TEXT NULL,
  CONSTRAINT "PK_MLTrainingPipeline" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLTrainingPipeline_Status" CHECK ("Status" IN ('Draft', 'Published', 'Archived')),
  CONSTRAINT "CK_MLTrainingPipeline_ProblemType" CHECK ("ProblemType" IN ('classification', 'regression')),
  CONSTRAINT "FK_MLTrainingPipeline_TargetEntity" FOREIGN KEY ("TargetEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingPipeline_Algorithm" FOREIGN KEY ("AlgorithmID") REFERENCES __mj."MLAlgorithm" (
    "ID"
  )
);

COMMENT ON TABLE __mj."MLTrainingPipeline" IS 'A declarative definition of how to build a predictive model: what to predict (target), over which entity''s records, using which algorithm, assembled from which sources via which feature steps, validated how. Saving a pipeline saves intent, not results — each successful training run of it produces an immutable MLModel. EXAMPLE: "Member Renewal Predictor" predicts Member.Renewed using XGBoost from tenure/engagement features plus a member-summary embedding, with a point-in-time as-of strategy and a locked holdout.';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."Name" IS 'Human-readable name of the pipeline';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."Description" IS 'Optional description of what this pipeline predicts and how';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."Version" IS 'Monotonic version number of the pipeline definition';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."Status" IS 'Lifecycle status: Draft, Published, or Archived';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."TargetEntityID" IS 'Foreign key to the entity whose records are the training units (e.g., Members)';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."TargetVariable" IS 'The label being predicted — a column or expression on the target entity (e.g., "Renewed")';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."ProblemType" IS 'Problem type: classification or regression';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."AlgorithmID" IS 'Foreign key to the chosen algorithm in the catalog';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."Hyperparameters" IS 'JSON hyperparameter overrides for the chosen algorithm';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."SourceBindings" IS 'JSON ordered references to source entities / queries / external entities / vector sets the features are drawn from';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."FeatureSteps" IS 'JSON ordered DAG of FeatureAssembly steps (selection, null-handling, encoding, scaling, embedding/LLM featurization) executed by the single FeatureAssembly executor';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."AsOfStrategy" IS 'JSON point-in-time configuration: { Mode: none|column|offset, Column?, OffsetDays? } — assembles features as of the decision point to prevent future leakage';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."LeakageGuard" IS 'JSON leakage guard: deny-list of fields/sources that must not enter features, plus the single-feature-dominance threshold that flags suspicious runs';

COMMENT ON COLUMN __mj."MLTrainingPipeline"."ValidationStrategy" IS 'JSON validation strategy: { Strategy: train_test_split|kfold|holdout, TestSize?, K?, LockedHoldoutFraction }';

/* ============================================================================ */
/* 5. MLModel (MJ: ML Models) — immutable, versioned trained model */
/* ============================================================================ */
CREATE TABLE __mj."MLModel" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "PipelineID" UUID NOT NULL,
  "Version" INT NOT NULL DEFAULT 1,
  "AlgorithmID" UUID NOT NULL,
  "ArtifactFileID" UUID NULL,
  "FittedPreprocessing" TEXT NULL,
  "FeatureSchema" TEXT NOT NULL,
  "TargetVariable" VARCHAR(500) NOT NULL,
  "ProblemType" VARCHAR(20) NOT NULL,
  "Metrics" TEXT NULL,
  "HoldoutMetrics" TEXT NULL,
  "FeatureImportance" TEXT NULL,
  "Lineage" TEXT NULL,
  "TrainedAt" TIMESTAMPTZ NULL,
  "TrainingDurationSec" INT NULL,
  "TrainingRowCount" INT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
  CONSTRAINT "PK_MLModel" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLModel_ProblemType" CHECK ("ProblemType" IN ('classification', 'regression')),
  CONSTRAINT "CK_MLModel_Status" CHECK ("Status" IN ('Draft', 'Validated', 'Published', 'Archived')),
  CONSTRAINT "FK_MLModel_Pipeline" FOREIGN KEY ("PipelineID") REFERENCES __mj."MLTrainingPipeline" (
    "ID"
  ),
  CONSTRAINT "FK_MLModel_Algorithm" FOREIGN KEY ("AlgorithmID") REFERENCES __mj."MLAlgorithm" (
    "ID"
  ),
  CONSTRAINT "FK_MLModel_ArtifactFile" FOREIGN KEY ("ArtifactFileID") REFERENCES __mj."File" (
    "ID"
  )
);

COMMENT ON TABLE __mj."MLModel" IS 'An immutable, versioned trained predictive model produced by a training run — distinct from MJ: AI Models (the catalog of off-the-shelf foundation models we CALL). A model is never mutated in place; retraining produces a new MLModel. The serialized artifact lives in MJStorage (MJ: Files) and the FITTED preprocessing parameters travel WITH the model so inference applies the exact transforms learned at training time (prevents train/serve skew). Inference runs via the Python sidecar.';

COMMENT ON COLUMN __mj."MLModel"."PipelineID" IS 'Foreign key to the ML Training Pipeline that produced this model (lineage)';

COMMENT ON COLUMN __mj."MLModel"."Version" IS 'Monotonic version number of this model under its pipeline';

COMMENT ON COLUMN __mj."MLModel"."AlgorithmID" IS 'Foreign key to the algorithm used to train this model';

COMMENT ON COLUMN __mj."MLModel"."ArtifactFileID" IS 'Foreign key to the MJ: Files record holding the serialized model artifact in MJStorage';

COMMENT ON COLUMN __mj."MLModel"."FittedPreprocessing" IS 'JSON of the fitted preprocessing parameters (means/std, one-hot vocabularies, bin edges, imputation fills) learned at training time and re-applied verbatim at inference — the anti train/serve skew payload';

COMMENT ON COLUMN __mj."MLModel"."FeatureSchema" IS 'JSON ordered list of feature names + kinds the model expects as input (the inference input contract)';

COMMENT ON COLUMN __mj."MLModel"."TargetVariable" IS 'The label this model predicts';

COMMENT ON COLUMN __mj."MLModel"."ProblemType" IS 'Problem type: classification or regression';

COMMENT ON COLUMN __mj."MLModel"."Metrics" IS 'JSON of training + validation metrics (AUC, F1, accuracy, RMSE, etc.)';

COMMENT ON COLUMN __mj."MLModel"."HoldoutMetrics" IS 'JSON metrics on the locked holdout set the search never saw — scored exactly once for an honest performance number';

COMMENT ON COLUMN __mj."MLModel"."FeatureImportance" IS 'JSON per-feature importance/contribution for explainability and the leakage guard';

COMMENT ON COLUMN __mj."MLModel"."Lineage" IS 'JSON lineage: data version(s), pipeline version, source bindings, as-of date, sidecar version, and any embedding/LLM model versions used to build features';

COMMENT ON COLUMN __mj."MLModel"."TrainedAt" IS 'Timestamp when training completed';

COMMENT ON COLUMN __mj."MLModel"."TrainingDurationSec" IS 'Wall-clock training duration in seconds';

COMMENT ON COLUMN __mj."MLModel"."TrainingRowCount" IS 'Number of rows used to train the model';

COMMENT ON COLUMN __mj."MLModel"."Status" IS 'Lifecycle status: Draft, Validated, Published, or Archived';

/* ============================================================================ */
/* 6. Experiment (MJ: Experiments) — GENERIC reusable experiment definition */
/* ============================================================================ */
CREATE TABLE __mj."Experiment" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ExperimentType" VARCHAR(50) NOT NULL,
  "Goal" TEXT NULL,
  "TargetMetric" VARCHAR(100) NULL,
  "PlanSpecTemplate" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT "PK_Experiment" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_Experiment_Status" CHECK ("Status" IN ('Active', 'Archived'))
);

COMMENT ON TABLE __mj."Experiment" IS 'A GENERIC, reusable definition of an experiment — the durable "what we are trying to optimize," independent of any single execution. Each kick-off of the experiment creates an ExperimentSession under it (so retraining/re-optimizing monthly = new sessions under the same Experiment, enabling comparison over time). Deliberately NOT ML-specific: ExperimentType discriminates the consumer (MLModelSearch, PromptOptimization, AgentConfigSearch, ...) so prompt-optimization, agent-config search, and eval sweeps reuse the same Experiment/Session/Iteration substrate. Predictive Studio is the first consumer.';

COMMENT ON COLUMN __mj."Experiment"."Name" IS 'Human-readable name of the experiment';

COMMENT ON COLUMN __mj."Experiment"."Description" IS 'Optional description of the experiment';

COMMENT ON COLUMN __mj."Experiment"."ExperimentType" IS 'Discriminator naming the kind of experiment / consuming subsystem (e.g., "MLModelSearch", "PromptOptimization", "AgentConfigSearch"). Intentionally an open NVARCHAR (no CHECK constraint) so new consumers can introduce types without a schema migration.';

COMMENT ON COLUMN __mj."Experiment"."Goal" IS 'Natural-language objective of the experiment (e.g., "maximize holdout AUC for renewal prediction")';

COMMENT ON COLUMN __mj."Experiment"."TargetMetric" IS 'The metric the experiment optimizes (e.g., "AUC", "F1", "RMSE") — the normalized number iterations are scored and ranked by';

COMMENT ON COLUMN __mj."Experiment"."PlanSpecTemplate" IS 'Optional JSON reusable plan template that seeds new sessions'' PlanSpec (consumer-specific shape; opaque to the generic substrate)';

COMMENT ON COLUMN __mj."Experiment"."Status" IS 'Lifecycle status: Active or Archived';

/* ============================================================================ */
/* 7. ExperimentSession (MJ: Experiment Sessions) — GENERIC one execution of an Experiment */
/* ============================================================================ */
CREATE TABLE __mj."ExperimentSession" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ExperimentID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Goal" TEXT NULL,
  "Budget" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Planning',
  "PlanSpec" TEXT NULL,
  "Leaderboard" TEXT NULL,
  "AgentRunID" UUID NULL,
  CONSTRAINT "PK_ExperimentSession" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_ExperimentSession_Status" CHECK ("Status" IN ('Planning', 'AwaitingApproval', 'Running', 'Paused', 'Completed', 'Cancelled')),
  CONSTRAINT "FK_ExperimentSession_Experiment" FOREIGN KEY ("ExperimentID") REFERENCES __mj."Experiment" (
    "ID"
  ),
  CONSTRAINT "FK_ExperimentSession_AgentRun" FOREIGN KEY ("AgentRunID") REFERENCES __mj."AIAgentRun" (
    "ID"
  )
);

COMMENT ON TABLE __mj."ExperimentSession" IS 'A GENERIC single execution of an Experiment: a budgeted, plan-then-execute-then-refine search that groups N iterations, maintains a leaderboard, and is driven by an owning agent run with a human approval gate. ML-agnostic — the ML-specific work hangs off ExperimentSessionIteration via MLTrainingRun. The execution phase runs iterations in WAVES through Record Set Processing (bounded concurrency, budget, pause/resume, audit), with the adaptive prune/what-next logic above it.';

COMMENT ON COLUMN __mj."ExperimentSession"."ExperimentID" IS 'Foreign key to the Experiment definition this session executes';

COMMENT ON COLUMN __mj."ExperimentSession"."Name" IS 'Human-readable name of this session/execution';

COMMENT ON COLUMN __mj."ExperimentSession"."Goal" IS 'Optional per-session objective override (defaults to the parent Experiment''s Goal)';

COMMENT ON COLUMN __mj."ExperimentSession"."Budget" IS 'JSON budget bounding autonomy for this session: max compute-cost / max iterations / max wallclock';

COMMENT ON COLUMN __mj."ExperimentSession"."Status" IS 'Lifecycle status: Planning, AwaitingApproval, Running, Paused, Completed, or Cancelled';

COMMENT ON COLUMN __mj."ExperimentSession"."PlanSpec" IS 'JSON of the approved plan the deterministic orchestrator executes for this session (consumer-specific shape; for Predictive Studio this is the ModelingPlanSpec). Opaque to the generic substrate.';

COMMENT ON COLUMN __mj."ExperimentSession"."Leaderboard" IS 'JSON snapshot of the best iterations so far (also derivable from ExperimentSessionIteration scores)';

COMMENT ON COLUMN __mj."ExperimentSession"."AgentRunID" IS 'Foreign key to the MJ: AI Agent Run that owns/drives this session';

/* ============================================================================ */
/* 8. ExperimentSessionIteration (MJ: Experiment Session Iterations) — GENERIC one attempt within a session */
/* ============================================================================ */
CREATE TABLE __mj."ExperimentSessionIteration" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ExperimentSessionID" UUID NOT NULL,
  "Sequence" INT NOT NULL DEFAULT 0,
  "Label" VARCHAR(255) NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "Score" DECIMAL(18, 6) NULL,
  "ComputeCost" DECIMAL(18, 6) NULL,
  "TokensUsed" INT NULL,
  "Rationale" TEXT NULL,
  "AIAgentRunID" UUID NULL,
  CONSTRAINT "PK_ExperimentSessionIteration" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_ExperimentSessionIteration_Status" CHECK ("Status" IN ('Pending', 'Running', 'Completed', 'Failed', 'Pruned')),
  CONSTRAINT "FK_ExperimentSessionIteration_Session" FOREIGN KEY ("ExperimentSessionID") REFERENCES __mj."ExperimentSession" (
    "ID"
  ),
  CONSTRAINT "FK_ExperimentSessionIteration_AIAgentRun" FOREIGN KEY ("AIAgentRunID") REFERENCES __mj."AIAgentRun" (
    "ID"
  )
);

COMMENT ON TABLE __mj."ExperimentSessionIteration" IS 'A GENERIC single attempt within an ExperimentSession — the polymorphic anchor and the leaderboard unit. Owns the cross-cutting "attempt" accounting every experiment type shares: sequence, status, the normalized Score, compute/token cost, the agent reasoning for trying it, and (optionally) the AI Agent Run that executed it. Consumer-specific detail hangs off this row: Predictive Studio attaches an MLTrainingRun; a future prompt-optimization consumer would attach its own leaf run table the same way.';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."ExperimentSessionID" IS 'Foreign key to the ExperimentSession this iteration belongs to';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."Sequence" IS 'Order of this iteration within its session';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."Label" IS 'Optional human-readable label for the attempt (e.g., "XGBoost + engagement features")';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."Status" IS 'Iteration status: Pending, Running, Completed, Failed, or Pruned';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."Score" IS 'The normalized metric value this iteration achieved (the parent Experiment''s TargetMetric) — used to rank the leaderboard';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."ComputeCost" IS 'Compute cost attributed to this iteration, for budget enforcement';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."TokensUsed" IS 'LLM tokens used by this iteration (e.g., agent internal choice prompts), for budget enforcement';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."Rationale" IS 'Why this iteration was tried (agent rationale) and any observations';

COMMENT ON COLUMN __mj."ExperimentSessionIteration"."AIAgentRunID" IS 'Optional foreign key to the MJ: AI Agent Run that executed this iteration (NULL when executed by deterministic code with no dedicated agent run)';

/* ============================================================================ */
/* 9. MLTrainingRun (MJ: ML Training Runs) — ML-specific detail of an iteration / standalone train */
/* ============================================================================ */
CREATE TABLE __mj."MLTrainingRun" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "PipelineID" UUID NOT NULL,
  "ResultingModelID" UUID NULL,
  "ExperimentSessionIterationID" UUID NULL,
  "FeaturesUsed" TEXT NULL,
  "AlgorithmID" UUID NOT NULL,
  "Hyperparameters" TEXT NULL,
  "ValidationResults" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "StartedAt" TIMESTAMPTZ NULL,
  "CompletedAt" TIMESTAMPTZ NULL,
  "ComputeCost" DECIMAL(18, 6) NULL,
  "TokensUsed" INT NULL,
  "Notes" TEXT NULL,
  CONSTRAINT "PK_MLTrainingRun" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLTrainingRun_Status" CHECK ("Status" IN ('Pending', 'Running', 'Completed', 'Failed', 'Pruned')),
  CONSTRAINT "FK_MLTrainingRun_Pipeline" FOREIGN KEY ("PipelineID") REFERENCES __mj."MLTrainingPipeline" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingRun_ResultingModel" FOREIGN KEY ("ResultingModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingRun_Iteration" FOREIGN KEY ("ExperimentSessionIterationID") REFERENCES __mj."ExperimentSessionIteration" (
    "ID"
  ),
  CONSTRAINT "FK_MLTrainingRun_Algorithm" FOREIGN KEY ("AlgorithmID") REFERENCES __mj."MLAlgorithm" (
    "ID"
  )
);

COMMENT ON TABLE __mj."MLTrainingRun" IS 'The ML-specific detail of a training attempt — the leaf that hangs off a generic ExperimentSessionIteration when part of an agent-driven search, OR stands alone (ExperimentSessionIterationID NULL) for a one-off manual train. Captures the exact feature set, algorithm, hyperparameters, validation results, and the model produced (ResultingModelID is nullable: a run may be pruned/failed and produce no model). The generic search-level accounting (leaderboard Score, rationale, the driving agent run) lives on the parent iteration; this row keeps the ML execution detail.';

COMMENT ON COLUMN __mj."MLTrainingRun"."PipelineID" IS 'Foreign key to the ML Training Pipeline this run executed';

COMMENT ON COLUMN __mj."MLTrainingRun"."ResultingModelID" IS 'Foreign key to the MLModel this run produced, when it produced one (NULL for pruned/failed runs)';

COMMENT ON COLUMN __mj."MLTrainingRun"."ExperimentSessionIterationID" IS 'Optional foreign key to the generic ExperimentSessionIteration that owns this run (NULL for standalone/manual training outside a session)';

COMMENT ON COLUMN __mj."MLTrainingRun"."FeaturesUsed" IS 'JSON of the exact feature set used for this run';

COMMENT ON COLUMN __mj."MLTrainingRun"."AlgorithmID" IS 'Foreign key to the algorithm used for this run';

COMMENT ON COLUMN __mj."MLTrainingRun"."Hyperparameters" IS 'JSON hyperparameters used for this run';

COMMENT ON COLUMN __mj."MLTrainingRun"."ValidationResults" IS 'JSON of all validation metrics, per-fold where applicable (the full metric blob; the parent iteration''s Score is the single normalized leaderboard number)';

COMMENT ON COLUMN __mj."MLTrainingRun"."Status" IS 'Run status: Pending, Running, Completed, Failed, or Pruned';

COMMENT ON COLUMN __mj."MLTrainingRun"."StartedAt" IS 'Timestamp the run started';

COMMENT ON COLUMN __mj."MLTrainingRun"."CompletedAt" IS 'Timestamp the run completed';

COMMENT ON COLUMN __mj."MLTrainingRun"."ComputeCost" IS 'Compute cost attributed to this run, for budget enforcement';

COMMENT ON COLUMN __mj."MLTrainingRun"."TokensUsed" IS 'LLM tokens used by this run, for budget enforcement';

COMMENT ON COLUMN __mj."MLTrainingRun"."Notes" IS 'Notes / observations about this run';

/* ============================================================================ */
/* 10. MLModelScoringBinding (MJ: ML Model Scoring Bindings) — where a model scores (lineage) */
/* ============================================================================ */
CREATE TABLE __mj."MLModelScoringBinding" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "MLModelID" UUID NOT NULL,
  "RecordProcessID" UUID NULL,
  "TargetEntityID" UUID NULL,
  "TargetColumn" VARCHAR(255) NULL,
  "Mode" VARCHAR(20) NOT NULL DEFAULT 'OnDemand',
  "MaterializedResultID" UUID NULL,
  "LastScoredAt" TIMESTAMPTZ NULL,
  "LastRowCount" INT NULL,
  CONSTRAINT "PK_MLModelScoringBinding" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_MLModelScoringBinding_Mode" CHECK ("Mode" IN ('OnDemand', 'Scheduled', 'Materialized')),
  CONSTRAINT "FK_MLModelScoringBinding_MLModel" FOREIGN KEY ("MLModelID") REFERENCES __mj."MLModel" (
    "ID"
  ),
  CONSTRAINT "FK_MLModelScoringBinding_RecordProcess" FOREIGN KEY ("RecordProcessID") REFERENCES __mj."RecordProcess" (
    "ID"
  ),
  CONSTRAINT "FK_MLModelScoringBinding_TargetEntity" FOREIGN KEY ("TargetEntityID") REFERENCES __mj."Entity" (
    "ID"
  )
);

COMMENT ON TABLE __mj."MLModelScoringBinding" IS 'Binds an MLModel to where it scores, so staleness can be detected and retraining driven (maintenance). The scoring itself runs as a Record Process (the new ML inference work type); the binding records the target entity/column written and the scoring mode. MaterializedResultID is a forward-compatible SOFT reference to MJ: Materialized Results (PR #2770), not yet a FK because that table is not merged.';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."MLModelID" IS 'Foreign key to the MLModel that does the scoring';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."RecordProcessID" IS 'Foreign key to the Record Process that runs the ML inference work for this binding';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."TargetEntityID" IS 'Foreign key to the entity that receives the prediction (when scores are written back)';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."TargetColumn" IS 'Name of the column that receives the prediction (when scores are written back / materialized)';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."Mode" IS 'Scoring mode: OnDemand, Scheduled, or Materialized';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."MaterializedResultID" IS 'Soft reference to a MJ: Materialized Results row (PR #2770) when Mode=Materialized; not a FK until that table exists';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."LastScoredAt" IS 'Timestamp of the most recent scoring run for this binding';

COMMENT ON COLUMN __mj."MLModelScoringBinding"."LastRowCount" IS 'Number of records scored in the most recent scoring run';

/* *************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                          CODEGEN OUTPUT — Predictive Studio (v5.44.x)                         **
 **                                                                                              **
 **  Everything below this banner is generated by `mj codegen` AFTER the hand-authored DDL above **
 **  was applied and the schema introspected. It contains, for the 10 Predictive Studio tables:  **
 **    • Entity / EntityField metadata rows                                                       **
 **    • __mj_CreatedAt / __mj_UpdatedAt columns + their triggers                                 **
 **    • foreign-key indexes (IDX_AUTO_MJ_FKEY_*)                                                 **
 **    • base views                                                                               **
 **    • CRUD stored procedures (spCreate / spUpdate / spDelete)                                  **
 **                                                                                              **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the whole **
 **  5.44.x schema (hand-authored DDL + generated objects) applies as ONE migration, per MJ       **
 **  convention. DO NOT hand-edit below this line; it is regenerated by re-running CodeGen.        **
 **                                                                                              **
 **************************************************************************************************
 ************************************************************************************************* */
/* SQL generated to create new entity MJ: ML Training Runs */
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
    '1a4df72f-68e0-410c-b42c-815687bfe2d2',
    'MJ: ML Training Runs',
    'ML Training Runs',
    'The ML-specific detail of a training attempt — the leaf that hangs off a generic ExperimentSessionIteration when part of an agent-driven search, OR stands alone (ExperimentSessionIterationID NULL) for a one-off manual train. Captures the exact feature set, algorithm, hyperparameters, validation results, and the model produced (ResultingModelID is nullable: a run may be pruned/failed and produce no model). The generic search-level accounting (leaderboard Score, rationale, the driving agent run) lives on the parent iteration; this row keeps the ML execution detail.',
    NULL,
    'MLTrainingRun',
    'vwMLTrainingRuns',
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
/* SQL generated to add new entity MJ: ML Training Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '1a4df72f-68e0-410c-b42c-815687bfe2d2',
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
/* SQL generated to add new permission for entity MJ: ML Training Runs for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1a4df72f-68e0-410c-b42c-815687bfe2d2',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Training Runs for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1a4df72f-68e0-410c-b42c-815687bfe2d2',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Training Runs for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1a4df72f-68e0-410c-b42c-815687bfe2d2',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: ML Model Scoring Bindings */
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
    'fd8ef230-65f3-496d-a117-7610572c35aa',
    'MJ: ML Model Scoring Bindings',
    'ML Model Scoring Bindings',
    'Binds an MLModel to where it scores, so staleness can be detected and retraining driven (maintenance). The scoring itself runs as a Record Process (the new ML inference work type); the binding records the target entity/column written and the scoring mode. MaterializedResultID is a forward-compatible SOFT reference to MJ: Materialized Results (PR #2770), not yet a FK because that table is not merged.',
    NULL,
    'MLModelScoringBinding',
    'vwMLModelScoringBindings',
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
/* SQL generated to add new entity MJ: ML Model Scoring Bindings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'fd8ef230-65f3-496d-a117-7610572c35aa',
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
/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fd8ef230-65f3-496d-a117-7610572c35aa',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fd8ef230-65f3-496d-a117-7610572c35aa',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Model Scoring Bindings for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fd8ef230-65f3-496d-a117-7610572c35aa',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: ML Algorithms */
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
    '26642380-432d-4527-85dd-fe7a96e57549',
    'MJ: ML Algorithms',
    'ML Algorithms',
    'Curated, fixed catalog of machine-learning algorithms a Training Pipeline can use. Opinionated by design (a small set of well-understood algorithms); the differentiation is in the data/features, not algorithm innovation. Each row declares the algorithm''s supported problem types, its hyperparameter schema, and the Python-sidecar driver key that executes it. EXAMPLE: "Gradient Boosting (XGBoost)" with DriverClass "xgboost".',
    NULL,
    'MLAlgorithm',
    'vwMLAlgorithms',
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
/* SQL generated to add new entity MJ: ML Algorithms to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '26642380-432d-4527-85dd-fe7a96e57549',
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
/* SQL generated to add new permission for entity MJ: ML Algorithms for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '26642380-432d-4527-85dd-fe7a96e57549',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Algorithms for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '26642380-432d-4527-85dd-fe7a96e57549',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Algorithms for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '26642380-432d-4527-85dd-fe7a96e57549',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: ML Algorithm Use Cases */
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
    '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f',
    'MJ: ML Algorithm Use Cases',
    'ML Algorithm Use Cases',
    'A curated, decision-relevant scenario used to guide algorithm choice — NOT a business label (churn/renewal/attendee-return are all the same "binary classification" shape, so they do not differentiate algorithms). Joined to MLAlgorithm via MLAlgorithmUseCaseRanking. EXAMPLES: "Binary classification (yes/no)", "Regression (predict a number)", "Interpretability required", "Minimal tuning (business-user)", "Large/wide dataset (speed)", "Embedding/LLM-feature-heavy", "Small dataset".',
    NULL,
    'MLAlgorithmUseCase',
    'vwMLAlgorithmUseCases',
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
/* SQL generated to add new entity MJ: ML Algorithm Use Cases to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f',
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
/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Algorithm Use Cases for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '51a7bd55-6dc7-4162-8ad4-057e4b37ea0f',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: ML Algorithm Use Case Rankings */
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
    '05136fe9-994b-4c0f-926e-dee4d8d928c1',
    'MJ: ML Algorithm Use Case Rankings',
    'ML Algorithm Use Case Rankings',
    'Codifies how well each algorithm fits each use-case scenario, so both the model-development agent and a non-expert human get guided, rationale-bearing defaults instead of guessing. One row per (algorithm, use case) pair.',
    NULL,
    'MLAlgorithmUseCaseRanking',
    'vwMLAlgorithmUseCaseRankings',
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
/* SQL generated to add new entity MJ: ML Algorithm Use Case Rankings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '05136fe9-994b-4c0f-926e-dee4d8d928c1',
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
/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '05136fe9-994b-4c0f-926e-dee4d8d928c1',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '05136fe9-994b-4c0f-926e-dee4d8d928c1',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Algorithm Use Case Rankings for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '05136fe9-994b-4c0f-926e-dee4d8d928c1',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: ML Training Pipelines */
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
    '703fd109-331b-438d-902b-8e4a93c3f6aa',
    'MJ: ML Training Pipelines',
    'ML Training Pipelines',
    'A declarative definition of how to build a predictive model: what to predict (target), over which entity''s records, using which algorithm, assembled from which sources via which feature steps, validated how. Saving a pipeline saves intent, not results — each successful training run of it produces an immutable MLModel. EXAMPLE: "Member Renewal Predictor" predicts Member.Renewed using XGBoost from tenure/engagement features plus a member-summary embedding, with a point-in-time as-of strategy and a locked holdout.',
    NULL,
    'MLTrainingPipeline',
    'vwMLTrainingPipelines',
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
/* SQL generated to add new entity MJ: ML Training Pipelines to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '703fd109-331b-438d-902b-8e4a93c3f6aa',
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
/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '703fd109-331b-438d-902b-8e4a93c3f6aa',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '703fd109-331b-438d-902b-8e4a93c3f6aa',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Training Pipelines for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '703fd109-331b-438d-902b-8e4a93c3f6aa',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: ML Models */
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
    'a3997636-011d-46e0-bc01-8b1e61e1087b',
    'MJ: ML Models',
    'ML Models',
    'An immutable, versioned trained predictive model produced by a training run — distinct from MJ: AI Models (the catalog of off-the-shelf foundation models we CALL). A model is never mutated in place; retraining produces a new MLModel. The serialized artifact lives in MJStorage (MJ: Files) and the FITTED preprocessing parameters travel WITH the model so inference applies the exact transforms learned at training time (prevents train/serve skew). Inference runs via the Python sidecar.',
    NULL,
    'MLModel',
    'vwMLModels',
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
/* SQL generated to add new entity MJ: ML Models to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'a3997636-011d-46e0-bc01-8b1e61e1087b',
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
/* SQL generated to add new permission for entity MJ: ML Models for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3997636-011d-46e0-bc01-8b1e61e1087b',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Models for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3997636-011d-46e0-bc01-8b1e61e1087b',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: ML Models for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3997636-011d-46e0-bc01-8b1e61e1087b',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Experiments */
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
    '232793cf-4406-4bcc-8022-0589c6ea6ef3',
    'MJ: Experiments',
    'Experiments',
    'A GENERIC, reusable definition of an experiment — the durable "what we are trying to optimize," independent of any single execution. Each kick-off of the experiment creates an ExperimentSession under it (so retraining/re-optimizing monthly = new sessions under the same Experiment, enabling comparison over time). Deliberately NOT ML-specific: ExperimentType discriminates the consumer (MLModelSearch, PromptOptimization, AgentConfigSearch, ...) so prompt-optimization, agent-config search, and eval sweeps reuse the same Experiment/Session/Iteration substrate. Predictive Studio is the first consumer.',
    NULL,
    'Experiment',
    'vwExperiments',
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
/* SQL generated to add new entity MJ: Experiments to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '232793cf-4406-4bcc-8022-0589c6ea6ef3',
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
/* SQL generated to add new permission for entity MJ: Experiments for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '232793cf-4406-4bcc-8022-0589c6ea6ef3',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Experiments for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '232793cf-4406-4bcc-8022-0589c6ea6ef3',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Experiments for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '232793cf-4406-4bcc-8022-0589c6ea6ef3',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Experiment Sessions */
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
    '0b20aa02-67cc-4b78-8680-fddd4b0e6198',
    'MJ: Experiment Sessions',
    'Experiment Sessions',
    'A GENERIC single execution of an Experiment: a budgeted, plan-then-execute-then-refine search that groups N iterations, maintains a leaderboard, and is driven by an owning agent run with a human approval gate. ML-agnostic — the ML-specific work hangs off ExperimentSessionIteration via MLTrainingRun. The execution phase runs iterations in WAVES through Record Set Processing (bounded concurrency, budget, pause/resume, audit), with the adaptive prune/what-next logic above it.',
    NULL,
    'ExperimentSession',
    'vwExperimentSessions',
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
/* SQL generated to add new entity MJ: Experiment Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '0b20aa02-67cc-4b78-8680-fddd4b0e6198',
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
/* SQL generated to add new permission for entity MJ: Experiment Sessions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0b20aa02-67cc-4b78-8680-fddd4b0e6198',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Experiment Sessions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0b20aa02-67cc-4b78-8680-fddd4b0e6198',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Experiment Sessions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0b20aa02-67cc-4b78-8680-fddd4b0e6198',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Experiment Session Iterations */
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
    'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38',
    'MJ: Experiment Session Iterations',
    'Experiment Session Iterations',
    'A GENERIC single attempt within an ExperimentSession — the polymorphic anchor and the leaderboard unit. Owns the cross-cutting "attempt" accounting every experiment type shares: sequence, status, the normalized Score, compute/token cost, the agent reasoning for trying it, and (optionally) the AI Agent Run that executed it. Consumer-specific detail hangs off this row: Predictive Studio attaches an MLTrainingRun; a future prompt-optimization consumer would attach its own leaf run table the same way.',
    NULL,
    'ExperimentSessionIteration',
    'vwExperimentSessionIterations',
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
/* SQL generated to add new entity MJ: Experiment Session Iterations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38',
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
/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Experiment Session Iterations for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b3fa8ac2-b5db-4c3d-89a5-64b384fb3e38',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."MLAlgorithmUseCase"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLAlgorithmUseCase */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLAlgorithmUseCase */
UPDATE __mj."MLAlgorithmUseCase" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLAlgorithmUseCase' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLAlgorithmUseCase" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLAlgorithmUseCase" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLAlgorithmUseCase"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLAlgorithmUseCase */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLAlgorithmUseCase */
UPDATE __mj."MLAlgorithmUseCase" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLAlgorithmUseCase' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLAlgorithmUseCase" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLAlgorithmUseCase" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Experiment"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.Experiment */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.Experiment */
UPDATE __mj."Experiment" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'Experiment' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Experiment" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Experiment" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Experiment"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.Experiment */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.Experiment */
UPDATE __mj."Experiment" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'Experiment' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Experiment" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Experiment" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExperimentSessionIteration"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ExperimentSessionIteration */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ExperimentSessionIteration */
UPDATE __mj."ExperimentSessionIteration" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ExperimentSessionIteration' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExperimentSessionIteration" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ExperimentSessionIteration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExperimentSessionIteration"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExperimentSessionIteration */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExperimentSessionIteration */
UPDATE __mj."ExperimentSessionIteration" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ExperimentSessionIteration' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExperimentSessionIteration" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ExperimentSessionIteration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLModelScoringBinding"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLModelScoringBinding */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLModelScoringBinding */
UPDATE __mj."MLModelScoringBinding" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLModelScoringBinding' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModelScoringBinding" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLModelScoringBinding" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLModelScoringBinding"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLModelScoringBinding */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLModelScoringBinding */
UPDATE __mj."MLModelScoringBinding" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLModelScoringBinding' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModelScoringBinding" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLModelScoringBinding" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLTrainingRun"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLTrainingRun */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLTrainingRun */
UPDATE __mj."MLTrainingRun" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLTrainingRun' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLTrainingRun" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLTrainingRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLTrainingRun"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLTrainingRun */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLTrainingRun */
UPDATE __mj."MLTrainingRun" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLTrainingRun' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLTrainingRun" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLTrainingRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLModel"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLModel */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLModel */
UPDATE __mj."MLModel" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLModel' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModel" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLModel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLModel"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLModel */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLModel */
UPDATE __mj."MLModel" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLModel' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLModel" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLModel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLTrainingPipeline"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLTrainingPipeline */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLTrainingPipeline */
UPDATE __mj."MLTrainingPipeline" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLTrainingPipeline' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLTrainingPipeline" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLTrainingPipeline" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLTrainingPipeline"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLTrainingPipeline */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLTrainingPipeline */
UPDATE __mj."MLTrainingPipeline" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLTrainingPipeline' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLTrainingPipeline" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLTrainingPipeline" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLAlgorithmUseCaseRanking"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLAlgorithmUseCaseRanking */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLAlgorithmUseCaseRanking */
UPDATE __mj."MLAlgorithmUseCaseRanking" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLAlgorithmUseCaseRanking' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLAlgorithmUseCaseRanking"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLAlgorithmUseCaseRanking */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLAlgorithmUseCaseRanking */
UPDATE __mj."MLAlgorithmUseCaseRanking" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLAlgorithmUseCaseRanking' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExperimentSession"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ExperimentSession */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ExperimentSession */
UPDATE __mj."ExperimentSession" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ExperimentSession' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExperimentSession" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ExperimentSession" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ExperimentSession"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExperimentSession */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ExperimentSession */
UPDATE __mj."ExperimentSession" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ExperimentSession' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ExperimentSession" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ExperimentSession" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLAlgorithm"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MLAlgorithm */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MLAlgorithm */
UPDATE __mj."MLAlgorithm" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'MLAlgorithm' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLAlgorithm" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MLAlgorithm" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MLAlgorithm"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLAlgorithm */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MLAlgorithm */
UPDATE __mj."MLAlgorithm" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'MLAlgorithm' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MLAlgorithm" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MLAlgorithm" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d980809-164f-4f29-b360-bcf4fbecb882' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d980809-164f-4f29-b360-bcf4fbecb882', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69e1b728-8231-4181-aeaf-81f5c19c7042' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69e1b728-8231-4181-aeaf-81f5c19c7042', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100002, 'Name', 'Name', 'Display name of the scenario (e.g., "Interpretability required")', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51acbd01-9bd3-43a2-9562-c4c338dc5b18' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51acbd01-9bd3-43a2-9562-c4c338dc5b18', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100003, 'Description', 'Description', 'Optional description of the scenario', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cbd833aa-1c97-45e6-adc6-5101d31af5a4' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = 'ProblemTypeScope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cbd833aa-1c97-45e6-adc6-5101d31af5a4', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100004, 'ProblemTypeScope', 'Problem Type Scope', 'Which problem type this scenario applies to: classification, regression, or any', 'nvarchar', 40, 0, 0, FALSE, 'any', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4a0a11d-2953-42fe-b5f3-da0b2ecca343' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = 'Guidance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4a0a11d-2953-42fe-b5f3-da0b2ecca343', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100005, 'Guidance', 'Guidance', 'Longer agent-readable guidance on when this scenario applies and what it implies for algorithm choice', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '424b1239-76c8-4fa0-b825-5f959fe1806e' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = 'DisplayOrder')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('424b1239-76c8-4fa0-b825-5f959fe1806e', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100006, 'DisplayOrder', 'Display Order', 'Ordering hint for displaying scenarios in the UI', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e1e42a7a-d9e2-4763-bbaf-94a730936cac' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e1e42a7a-d9e2-4763-bbaf-94a730936cac', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '66ae2491-e621-40bc-b500-b2a0e053f820' OR ("EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('66ae2491-e621-40bc-b500-b2a0e053f820', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F' /* Entity: MJ: ML Algorithm Use Cases */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3729481-fe28-4891-9c14-c5a21dae93c8' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3729481-fe28-4891-9c14-c5a21dae93c8', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43e65059-00a5-4847-a047-17b86f2e16c3' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('43e65059-00a5-4847-a047-17b86f2e16c3', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100002, 'Name', 'Name', 'Human-readable name of the experiment', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '99b71188-3d89-46a1-af2c-0c61bdbfbd9f' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('99b71188-3d89-46a1-af2c-0c61bdbfbd9f', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100003, 'Description', 'Description', 'Optional description of the experiment', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef0182f4-7c41-41c0-9ed6-e6573601054a' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'ExperimentType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef0182f4-7c41-41c0-9ed6-e6573601054a', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100004, 'ExperimentType', 'Experiment Type', 'Discriminator naming the kind of experiment / consuming subsystem (e.g., "MLModelSearch", "PromptOptimization", "AgentConfigSearch"). Intentionally an open NVARCHAR (no CHECK constraint) so new consumers can introduce types without a schema migration.', 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dde443f0-f51e-401d-92bc-0b49a00f578f' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'Goal')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dde443f0-f51e-401d-92bc-0b49a00f578f', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100005, 'Goal', 'Goal', 'Natural-language objective of the experiment (e.g., "maximize holdout AUC for renewal prediction")', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f5e830e-4b7c-4cf0-a493-23cc34cb9e44' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'TargetMetric')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f5e830e-4b7c-4cf0-a493-23cc34cb9e44', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100006, 'TargetMetric', 'Target Metric', 'The metric the experiment optimizes (e.g., "AUC", "F1", "RMSE") — the normalized number iterations are scored and ranked by', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7fc84cb6-0a55-4537-8b41-3bbdda2cd9a2' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'PlanSpecTemplate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7fc84cb6-0a55-4537-8b41-3bbdda2cd9a2', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100007, 'PlanSpecTemplate', 'Plan Spec Template', 'Optional JSON reusable plan template that seeds new sessions'' PlanSpec (consumer-specific shape; opaque to the generic substrate)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0d7f9649-8909-4601-86ee-ba48c5a95582' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0d7f9649-8909-4601-86ee-ba48c5a95582', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100008, 'Status', 'Status', 'Lifecycle status: Active or Archived', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f55b3283-d82a-4a0e-a4f9-0c937ee114a1' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f55b3283-d82a-4a0e-a4f9-0c937ee114a1', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100009, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2fc3add0-bd34-4f92-bb62-4d0278bcb8e5' OR ("EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2fc3add0-bd34-4f92-bb62-4d0278bcb8e5', '232793CF-4406-4BCC-8022-0589C6EA6EF3' /* Entity: MJ: Experiments */, 100010, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2efdd32-ca23-4b7b-994a-319c989828ad' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2efdd32-ca23-4b7b-994a-319c989828ad', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'afb257ff-2710-4482-8d64-a5fb2e6dc0a4' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'ExperimentSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('afb257ff-2710-4482-8d64-a5fb2e6dc0a4', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100002, 'ExperimentSessionID', 'Experiment Session ID', 'Foreign key to the ExperimentSession this iteration belongs to', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc54b44d-79ac-4c91-9760-a2a91e708e7a' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dc54b44d-79ac-4c91-9760-a2a91e708e7a', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100003, 'Sequence', 'Sequence', 'Order of this iteration within its session', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af18f28e-58ef-4cfd-ba8e-b7c8d7a80f79' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'Label')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af18f28e-58ef-4cfd-ba8e-b7c8d7a80f79', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100004, 'Label', 'Label', 'Optional human-readable label for the attempt (e.g., "XGBoost + engagement features")', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6489a16d-9c97-4415-9d41-104732933d72' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6489a16d-9c97-4415-9d41-104732933d72', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100005, 'Status', 'Status', 'Iteration status: Pending, Running, Completed, Failed, or Pruned', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8cbcdfc-f3d8-4adc-89e3-bdbd893d9f3f' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'Score')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8cbcdfc-f3d8-4adc-89e3-bdbd893d9f3f', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100006, 'Score', 'Score', 'The normalized metric value this iteration achieved (the parent Experiment''s TargetMetric) — used to rank the leaderboard', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ba87989-b7e1-4701-bda0-5983b6d0d5e7' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'ComputeCost')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4ba87989-b7e1-4701-bda0-5983b6d0d5e7', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100007, 'ComputeCost', 'Compute Cost', 'Compute cost attributed to this iteration, for budget enforcement', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c14c9aff-aa11-4443-ab07-f054e984726c' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'TokensUsed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c14c9aff-aa11-4443-ab07-f054e984726c', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100008, 'TokensUsed', 'Tokens Used', 'LLM tokens used by this iteration (e.g., agent internal choice prompts), for budget enforcement', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8e3bb7c-e0b6-49d5-9260-03368b09bd08' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'Rationale')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c8e3bb7c-e0b6-49d5-9260-03368b09bd08', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100009, 'Rationale', 'Rationale', 'Why this iteration was tried (agent rationale) and any observations', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '19df8613-9f36-43c6-9ac9-0147f6b6b41b' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'AIAgentRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19df8613-9f36-43c6-9ac9-0147f6b6b41b', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100010, 'AIAgentRunID', 'AI Agent Run ID', 'Optional foreign key to the MJ: AI Agent Run that executed this iteration (NULL when executed by deterministic code with no dedicated agent run)', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0be6ca2b-2e93-4661-a6d1-991a36304591' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0be6ca2b-2e93-4661-a6d1-991a36304591', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100011, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d67e4b4-c9f3-40a0-9afd-53b34a6df191' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d67e4b4-c9f3-40a0-9afd-53b34a6df191', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100012, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d63c521-60a5-466f-a13f-e3b237cfb56d' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d63c521-60a5-466f-a13f-e3b237cfb56d', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86fd001c-52e7-4a71-a475-f5c4878b7cc4' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'MLModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86fd001c-52e7-4a71-a475-f5c4878b7cc4', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100002, 'MLModelID', 'ML Model ID', 'Foreign key to the MLModel that does the scoring', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd2474e9-3f84-4e48-844f-9f4c59079ff7' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd2474e9-3f84-4e48-844f-9f4c59079ff7', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100003, 'RecordProcessID', 'Record Process ID', 'Foreign key to the Record Process that runs the ML inference work for this binding', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e8a46a8-ef56-4d67-b161-b78e41941936' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'TargetEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e8a46a8-ef56-4d67-b161-b78e41941936', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100004, 'TargetEntityID', 'Target Entity ID', 'Foreign key to the entity that receives the prediction (when scores are written back)', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f9b34226-ceec-43f1-bb7b-db64448ac558' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'TargetColumn')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f9b34226-ceec-43f1-bb7b-db64448ac558', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100005, 'TargetColumn', 'Target Column', 'Name of the column that receives the prediction (when scores are written back / materialized)', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '919000eb-f5b2-495f-93f4-ae6d2a1af119' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'Mode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('919000eb-f5b2-495f-93f4-ae6d2a1af119', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100006, 'Mode', 'Mode', 'Scoring mode: OnDemand, Scheduled, or Materialized', 'nvarchar', 40, 0, 0, FALSE, 'OnDemand', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b041e1be-cc53-43d5-b446-ab7bf72fed60' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'MaterializedResultID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b041e1be-cc53-43d5-b446-ab7bf72fed60', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100007, 'MaterializedResultID', 'Materialized Result ID', 'Soft reference to a MJ: Materialized Results row (PR #2770) when Mode=Materialized; not a FK until that table exists', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '390dcc0b-c014-4c34-a899-e574f3933890' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'LastScoredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('390dcc0b-c014-4c34-a899-e574f3933890', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100008, 'LastScoredAt', 'Last Scored At', 'Timestamp of the most recent scoring run for this binding', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6cda85f4-965e-4835-96ea-58182d12f375' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'LastRowCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6cda85f4-965e-4835-96ea-58182d12f375', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100009, 'LastRowCount', 'Last Row Count', 'Number of records scored in the most recent scoring run', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29ae7dd0-460a-4e82-b651-f940129346ce' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29ae7dd0-460a-4e82-b651-f940129346ce', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a9d4e337-04c5-4e30-83c6-62b03d8e9343' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a9d4e337-04c5-4e30-83c6-62b03d8e9343', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ffd262b-18e6-449b-b103-ef59f59c317c' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ffd262b-18e6-449b-b103-ef59f59c317c', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05e0463c-130c-4b7c-8fc5-bf8c45640147' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'PipelineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05e0463c-130c-4b7c-8fc5-bf8c45640147', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100002, 'PipelineID', 'Pipeline ID', 'Foreign key to the ML Training Pipeline this run executed', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '703FD109-331B-438D-902B-8E4A93C3F6AA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '237cf3c4-7600-4c67-a368-73b9830ff3c2' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'ResultingModelID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('237cf3c4-7600-4c67-a368-73b9830ff3c2', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100003, 'ResultingModelID', 'Resulting Model ID', 'Foreign key to the MLModel this run produced, when it produced one (NULL for pruned/failed runs)', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '657c631b-a990-4f3a-a881-8a06bab643d4' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'ExperimentSessionIterationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('657c631b-a990-4f3a-a881-8a06bab643d4', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100004, 'ExperimentSessionIterationID', 'Experiment Session Iteration ID', 'Optional foreign key to the generic ExperimentSessionIteration that owns this run (NULL for standalone/manual training outside a session)', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'be952da9-141a-4dc0-bfd9-ddfd414ccc59' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'FeaturesUsed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('be952da9-141a-4dc0-bfd9-ddfd414ccc59', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100005, 'FeaturesUsed', 'Features Used', 'JSON of the exact feature set used for this run', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a774655-5497-4dea-9abc-694aef5ee8e3' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'AlgorithmID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4a774655-5497-4dea-9abc-694aef5ee8e3', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100006, 'AlgorithmID', 'Algorithm ID', 'Foreign key to the algorithm used for this run', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '26642380-432D-4527-85DD-FE7A96E57549', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '740ae4c7-6ed5-41e6-9af4-9e91f347fc48' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'Hyperparameters')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('740ae4c7-6ed5-41e6-9af4-9e91f347fc48', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100007, 'Hyperparameters', 'Hyperparameters', 'JSON hyperparameters used for this run', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c61ab0ed-a92c-4fcd-851f-2e778995c89f' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'ValidationResults')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c61ab0ed-a92c-4fcd-851f-2e778995c89f', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100008, 'ValidationResults', 'Validation Results', 'JSON of all validation metrics, per-fold where applicable (the full metric blob; the parent iteration''s Score is the single normalized leaderboard number)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '780aab1c-0740-4aed-83a7-dcbe8da2c843' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('780aab1c-0740-4aed-83a7-dcbe8da2c843', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100009, 'Status', 'Status', 'Run status: Pending, Running, Completed, Failed, or Pruned', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ceb5decc-6d27-48d4-9e81-0f4abc6cf017' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ceb5decc-6d27-48d4-9e81-0f4abc6cf017', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100010, 'StartedAt', 'Started At', 'Timestamp the run started', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'df11dbf7-c050-463b-87d4-9f2dc23cdacb' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'CompletedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('df11dbf7-c050-463b-87d4-9f2dc23cdacb', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100011, 'CompletedAt', 'Completed At', 'Timestamp the run completed', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '22352411-c09a-416a-8110-81215ab22047' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'ComputeCost')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('22352411-c09a-416a-8110-81215ab22047', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100012, 'ComputeCost', 'Compute Cost', 'Compute cost attributed to this run, for budget enforcement', 'decimal', 9, 18, 6, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a05882f-6969-41ee-91a4-8606bff23a8e' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'TokensUsed')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8a05882f-6969-41ee-91a4-8606bff23a8e', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100013, 'TokensUsed', 'Tokens Used', 'LLM tokens used by this run, for budget enforcement', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e7f45990-3456-4cd8-ad90-46ba864a60d2' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'Notes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e7f45990-3456-4cd8-ad90-46ba864a60d2', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100014, 'Notes', 'Notes', 'Notes / observations about this run', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0664ddd3-ed18-44be-a6a4-167959719288' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0664ddd3-ed18-44be-a6a4-167959719288', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100015, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '02798afd-669b-4c7d-b4a5-7d61100a3f75' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('02798afd-669b-4c7d-b4a5-7d61100a3f75', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100016, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '759d131a-7df7-4b85-9e0c-6db3bfc61084' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('759d131a-7df7-4b85-9e0c-6db3bfc61084', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cecbe6bf-4a2b-4d9b-9135-f372777ed18e' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'PipelineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cecbe6bf-4a2b-4d9b-9135-f372777ed18e', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100002, 'PipelineID', 'Pipeline ID', 'Foreign key to the ML Training Pipeline that produced this model (lineage)', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '703FD109-331B-438D-902B-8E4A93C3F6AA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b871a401-2aa4-4b5c-942e-6afb401660c6' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Version')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b871a401-2aa4-4b5c-942e-6afb401660c6', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100003, 'Version', 'Version', 'Monotonic version number of this model under its pipeline', 'int', 4, 10, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51e9a55b-d490-41b7-b4f3-2b429e18c71d' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'AlgorithmID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51e9a55b-d490-41b7-b4f3-2b429e18c71d', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100004, 'AlgorithmID', 'Algorithm ID', 'Foreign key to the algorithm used to train this model', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '26642380-432D-4527-85DD-FE7A96E57549', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ea625a1a-7553-41bd-9cf5-74bc41b541c7' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ArtifactFileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ea625a1a-7553-41bd-9cf5-74bc41b541c7', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100005, 'ArtifactFileID', 'Artifact File ID', 'Foreign key to the MJ: Files record holding the serialized model artifact in MJStorage', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b17a1f8f-fc2d-4c5b-8e89-fcd67605ef49' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'FittedPreprocessing')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b17a1f8f-fc2d-4c5b-8e89-fcd67605ef49', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100006, 'FittedPreprocessing', 'Fitted Preprocessing', 'JSON of the fitted preprocessing parameters (means/std, one-hot vocabularies, bin edges, imputation fills) learned at training time and re-applied verbatim at inference — the anti train/serve skew payload', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0bb4b332-de18-488a-b841-6c8bbac3bd9c' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'FeatureSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0bb4b332-de18-488a-b841-6c8bbac3bd9c', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100007, 'FeatureSchema', 'Feature Schema', 'JSON ordered list of feature names + kinds the model expects as input (the inference input contract)', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '052aa3ef-9b41-44c7-ac90-f9039d30a625' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TargetVariable')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('052aa3ef-9b41-44c7-ac90-f9039d30a625', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100008, 'TargetVariable', 'Target Variable', 'The label this model predicts', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0cb9357a-8739-4cb4-80eb-1dd0c0a0d9a0' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ProblemType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0cb9357a-8739-4cb4-80eb-1dd0c0a0d9a0', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100009, 'ProblemType', 'Problem Type', 'Problem type: classification or regression', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd008101-49c0-4f82-852d-963b77f096a8' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Metrics')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dd008101-49c0-4f82-852d-963b77f096a8', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100010, 'Metrics', 'Metrics', 'JSON of training + validation metrics (AUC, F1, accuracy, RMSE, etc.)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb2b1a50-0126-4374-88fa-d562c500da8e' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'HoldoutMetrics')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb2b1a50-0126-4374-88fa-d562c500da8e', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100011, 'HoldoutMetrics', 'Holdout Metrics', 'JSON metrics on the locked holdout set the search never saw — scored exactly once for an honest performance number', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86f10ce5-e0a9-47e5-8dd5-dc83d1a9622f' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'FeatureImportance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86f10ce5-e0a9-47e5-8dd5-dc83d1a9622f', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100012, 'FeatureImportance', 'Feature Importance', 'JSON per-feature importance/contribution for explainability and the leakage guard', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91eebc4e-4a98-4b20-ba7b-aa9f82c61bc1' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Lineage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('91eebc4e-4a98-4b20-ba7b-aa9f82c61bc1', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100013, 'Lineage', 'Lineage', 'JSON lineage: data version(s), pipeline version, source bindings, as-of date, sidecar version, and any embedding/LLM model versions used to build features', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94606151-4b72-423f-a494-e3230421752c' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TrainedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94606151-4b72-423f-a494-e3230421752c', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100014, 'TrainedAt', 'Trained At', 'Timestamp when training completed', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1065c3b7-ced6-4eed-a179-9fc98c8e9cdb' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TrainingDurationSec')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1065c3b7-ced6-4eed-a179-9fc98c8e9cdb', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100015, 'TrainingDurationSec', 'Training Duration Sec', 'Wall-clock training duration in seconds', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a33be812-e208-4410-8523-da31277508c4' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'TrainingRowCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a33be812-e208-4410-8523-da31277508c4', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100016, 'TrainingRowCount', 'Training Row Count', 'Number of rows used to train the model', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b0c0799-d66a-48ba-987d-c32d477e2a28' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b0c0799-d66a-48ba-987d-c32d477e2a28', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100017, 'Status', 'Status', 'Lifecycle status: Draft, Validated, Published, or Archived', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aed32800-6560-42f3-a8d3-06801c80476c' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aed32800-6560-42f3-a8d3-06801c80476c', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100018, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bba8940e-120a-4d50-a75d-7b598783f02b' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bba8940e-120a-4d50-a75d-7b598783f02b', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100019, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e458adcb-fccc-4074-a5ce-8d58d3ff8241' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e458adcb-fccc-4074-a5ce-8d58d3ff8241', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0613e52b-3280-4209-9b85-0a0feac23cda' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0613e52b-3280-4209-9b85-0a0feac23cda', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100002, 'Name', 'Name', 'Human-readable name of the pipeline', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5a9a161a-61be-4d2c-b603-675d7572c6cb' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a9a161a-61be-4d2c-b603-675d7572c6cb', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100003, 'Description', 'Description', 'Optional description of what this pipeline predicts and how', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '235b3ecf-9fc7-40b3-a3e7-f63758b1ad44' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'Version')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('235b3ecf-9fc7-40b3-a3e7-f63758b1ad44', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100004, 'Version', 'Version', 'Monotonic version number of the pipeline definition', 'int', 4, 10, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b7f8cd9-0491-493a-8961-b5b1e268b12b' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b7f8cd9-0491-493a-8961-b5b1e268b12b', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100005, 'Status', 'Status', 'Lifecycle status: Draft, Published, or Archived', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '30914c7c-6dda-409d-be74-dcecdeb57e32' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'TargetEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('30914c7c-6dda-409d-be74-dcecdeb57e32', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100006, 'TargetEntityID', 'Target Entity ID', 'Foreign key to the entity whose records are the training units (e.g., Members)', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '936424ab-347e-4e58-89d3-cd93e1a17b49' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'TargetVariable')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('936424ab-347e-4e58-89d3-cd93e1a17b49', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100007, 'TargetVariable', 'Target Variable', 'The label being predicted — a column or expression on the target entity (e.g., "Renewed")', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e245ef88-64a1-4f22-a954-ec44a431ce3e' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'ProblemType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e245ef88-64a1-4f22-a954-ec44a431ce3e', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100008, 'ProblemType', 'Problem Type', 'Problem type: classification or regression', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3bb4400a-0fe5-44f1-b565-4d0e69821d64' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'AlgorithmID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3bb4400a-0fe5-44f1-b565-4d0e69821d64', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100009, 'AlgorithmID', 'Algorithm ID', 'Foreign key to the chosen algorithm in the catalog', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '26642380-432D-4527-85DD-FE7A96E57549', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '887a5948-0f5e-4e3d-824c-c1d4b636b761' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'Hyperparameters')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('887a5948-0f5e-4e3d-824c-c1d4b636b761', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100010, 'Hyperparameters', 'Hyperparameters', 'JSON hyperparameter overrides for the chosen algorithm', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f9cc6e74-1e94-4d15-97d8-faced9b94433' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'SourceBindings')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f9cc6e74-1e94-4d15-97d8-faced9b94433', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100011, 'SourceBindings', 'Source Bindings', 'JSON ordered references to source entities / queries / external entities / vector sets the features are drawn from', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39701b36-19a8-45e5-b279-3a081ec3e5b0' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'FeatureSteps')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39701b36-19a8-45e5-b279-3a081ec3e5b0', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100012, 'FeatureSteps', 'Feature Steps', 'JSON ordered DAG of FeatureAssembly steps (selection, null-handling, encoding, scaling, embedding/LLM featurization) executed by the single FeatureAssembly executor', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b66d28b9-757f-45c2-a14d-bd2167627bff' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'AsOfStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b66d28b9-757f-45c2-a14d-bd2167627bff', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100013, 'AsOfStrategy', 'As Of Strategy', 'JSON point-in-time configuration: { Mode: none|column|offset, Column?, OffsetDays? } — assembles features as of the decision point to prevent future leakage', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b902f42b-3518-432a-8700-2c32e06704b3' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'LeakageGuard')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b902f42b-3518-432a-8700-2c32e06704b3', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100014, 'LeakageGuard', 'Leakage Guard', 'JSON leakage guard: deny-list of fields/sources that must not enter features, plus the single-feature-dominance threshold that flags suspicious runs', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a15d518-d028-4596-8124-9485865074a8' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'ValidationStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8a15d518-d028-4596-8124-9485865074a8', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100015, 'ValidationStrategy', 'Validation Strategy', 'JSON validation strategy: { Strategy: train_test_split|kfold|holdout, TestSize?, K?, LockedHoldoutFraction }', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7be270ef-bcb8-4354-a780-2820c12c38e5' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7be270ef-bcb8-4354-a780-2820c12c38e5', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100016, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0d82f95f-e227-4e90-b639-d001ee32a283' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0d82f95f-e227-4e90-b639-d001ee32a283', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100017, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '762c8803-fb39-4e24-b92f-4f18241256e1' OR ("EntityID" = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND "Name" = 'Subpath')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('762c8803-fb39-4e24-b92f-4f18241256e1', 'AC4A2799-454B-4395-AA56-A42241F32C12' /* Entity: MJ: Open Apps */, 100043, 'Subpath', 'Subpath', 'In-repo subdirectory the app was installed from for multi-app repositories (e.g. ''CRM/HubSpot''). NULL when the app''s mj-app.json is at the repository root.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d136b5a-cc4a-4355-b266-0f5dcafe2851' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d136b5a-cc4a-4355-b266-0f5dcafe2851', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5443c622-f023-45c0-995b-e765b728a075' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'MLAlgorithmID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5443c622-f023-45c0-995b-e765b728a075', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100002, 'MLAlgorithmID', 'ML Algorithm ID', 'Foreign key to the algorithm being ranked', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '26642380-432D-4527-85DD-FE7A96E57549', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8bb6b63d-0c44-421d-b845-3c44365ec788' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'MLAlgorithmUseCaseID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8bb6b63d-0c44-421d-b845-3c44365ec788', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100003, 'MLAlgorithmUseCaseID', 'ML Algorithm Use Case ID', 'Foreign key to the use-case scenario the algorithm is ranked for', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3ffab2e2-84ae-441a-8aca-37bfcc40cdb6' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'SuitabilityScore')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ffab2e2-84ae-441a-8aca-37bfcc40cdb6', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100004, 'SuitabilityScore', 'Suitability Score', 'Numeric suitability for sorting/ranking, 1 (worst) to 5 (best)', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '612df83c-8f49-43d9-9d30-eb9ff9d3e31e' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'RecommendationLevel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('612df83c-8f49-43d9-9d30-eb9ff9d3e31e', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100005, 'RecommendationLevel', 'Recommendation Level', 'Categorical recommendation: Primary, Strong, Viable, Weak, or NotRecommended', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f7134e3-acbe-49f4-8a9f-71fc04d10039' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'Rationale')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f7134e3-acbe-49f4-8a9f-71fc04d10039', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100006, 'Rationale', 'Rationale', 'Plain-language explanation of the ranking, readable by both agents and humans (e.g., "Gives feature importances but not simple coefficients — if a stakeholder needs to see exactly why each prediction was made, prefer Logistic/Ridge.")', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c294ad9-d593-41e0-afa7-ac21bffde5e9' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2c294ad9-d593-41e0-afa7-ac21bffde5e9', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d085176-5132-4e19-a109-e1f963509374' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8d085176-5132-4e19-a109-e1f963509374', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd00f5797-ac83-4398-b3e3-d4b30e925aae' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d00f5797-ac83-4398-b3e3-d4b30e925aae', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5329588b-49b4-49a6-a0dc-300e9490ed00' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'ExperimentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5329588b-49b4-49a6-a0dc-300e9490ed00', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100002, 'ExperimentID', 'Experiment ID', 'Foreign key to the Experiment definition this session executes', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '232793CF-4406-4BCC-8022-0589C6EA6EF3', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '49d424df-5006-49ff-bf6c-1fe96b65ebf3' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('49d424df-5006-49ff-bf6c-1fe96b65ebf3', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100003, 'Name', 'Name', 'Human-readable name of this session/execution', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e5ed3427-b34f-42a1-a513-f6953ea9d0c6' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'Goal')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5ed3427-b34f-42a1-a513-f6953ea9d0c6', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100004, 'Goal', 'Goal', 'Optional per-session objective override (defaults to the parent Experiment''s Goal)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7672a82d-9f28-4805-8f9e-1a60516c7c4e' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'Budget')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7672a82d-9f28-4805-8f9e-1a60516c7c4e', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100005, 'Budget', 'Budget', 'JSON budget bounding autonomy for this session: max compute-cost / max iterations / max wallclock', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24dd5079-7579-4792-bd72-cd6db2db0ed0' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24dd5079-7579-4792-bd72-cd6db2db0ed0', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100006, 'Status', 'Status', 'Lifecycle status: Planning, AwaitingApproval, Running, Paused, Completed, or Cancelled', 'nvarchar', 40, 0, 0, FALSE, 'Planning', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ebc06e3-72d5-4f59-9650-8047a8e45946' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'PlanSpec')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4ebc06e3-72d5-4f59-9650-8047a8e45946', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100007, 'PlanSpec', 'Plan Spec', 'JSON of the approved plan the deterministic orchestrator executes for this session (consumer-specific shape; for Predictive Studio this is the ModelingPlanSpec). Opaque to the generic substrate.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8fa23ed8-71e9-44b5-bb8f-762b07e72b8b' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'Leaderboard')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8fa23ed8-71e9-44b5-bb8f-762b07e72b8b', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100008, 'Leaderboard', 'Leaderboard', 'JSON snapshot of the best iterations so far (also derivable from ExperimentSessionIteration scores)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3e47f4d6-4653-41a8-bcd7-024fc9fc4280' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'AgentRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3e47f4d6-4653-41a8-bcd7-024fc9fc4280', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100009, 'AgentRunID', 'Agent Run ID', 'Foreign key to the MJ: AI Agent Run that owns/drives this session', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'baf736ac-d4c5-4021-bb99-b630122215a5' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('baf736ac-d4c5-4021-bb99-b630122215a5', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0a43e613-d18d-4bc4-a611-219f16f3739c' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a43e613-d18d-4bc4-a611-219f16f3739c', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ee985bc9-0a22-4ed4-93dc-236fdbdf77d9' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ee985bc9-0a22-4ed4-93dc-236fdbdf77d9', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15d6e08f-eb42-4cdc-b89b-80c63283cc8f' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15d6e08f-eb42-4cdc-b89b-80c63283cc8f', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100002, 'Name', 'Name', 'Display name of the algorithm (e.g., "Gradient Boosting (XGBoost)", "Logistic Regression")', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e8fc4567-5cb4-4ccf-aade-9b7dd38f3f43' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e8fc4567-5cb4-4ccf-aade-9b7dd38f3f43', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100003, 'Description', 'Description', 'Optional description of the algorithm and when to use it', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1597cd31-a1d4-4447-be0d-c72dcd2e3874' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'ProblemTypes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1597cd31-a1d4-4447-be0d-c72dcd2e3874', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100004, 'ProblemTypes', 'Problem Types', 'Comma-delimited list of supported problem types (e.g., "classification", "regression", or "classification,regression")', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a5f38db5-011d-41fe-96e8-d5d2baeb9150' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a5f38db5-011d-41fe-96e8-d5d2baeb9150', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100005, 'DriverClass', 'Driver Class', 'Algorithm key passed to the Python training/inference sidecar (e.g., "xgboost", "lightgbm", "logistic_regression", "random_forest", "ridge", "mlp")', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a180ce96-0d60-4b85-8f93-b56d26374546' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'HyperparameterSchema')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a180ce96-0d60-4b85-8f93-b56d26374546', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100006, 'HyperparameterSchema', 'Hyperparameter Schema', 'JSON Schema describing the algorithm''s tunable hyperparameters (drives the UI form and validation)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f2b8e114-843e-4dd9-99bc-87d3d492ea9a' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'DefaultHyperparameters')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f2b8e114-843e-4dd9-99bc-87d3d492ea9a', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100007, 'DefaultHyperparameters', 'Default Hyperparameters', 'JSON object of default hyperparameter values applied when a pipeline does not override them', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd3c4a5a5-54e3-4d70-b07a-f31e2f76a367' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'SupportsFeatureImportance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d3c4a5a5-54e3-4d70-b07a-f31e2f76a367', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100008, 'SupportsFeatureImportance', 'Supports Feature Importance', 'When 1, the algorithm produces per-feature importance scores used for explainability and the leakage guard', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '65776a4c-7173-40f8-aea8-6e5e24ac7227' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('65776a4c-7173-40f8-aea8-6e5e24ac7227', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100009, 'Status', 'Status', 'Lifecycle status: Active (selectable) or Deprecated', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68d8b8b2-145f-416c-af88-3d83f85a76fc' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68d8b8b2-145f-416c-af88-3d83f85a76fc', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c47e0f6-fd2a-44d8-b53b-722d8c9f3939' OR ("EntityID" = '26642380-432D-4527-85DD-FE7A96E57549' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c47e0f6-fd2a-44d8-b53b-722d8c9f3939', '26642380-432D-4527-85DD-FE7A96E57549' /* Entity: MJ: ML Algorithms */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 2bfa9080-33b0-4e56-a876-0e815654db9b */
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
    '2bfa9080-33b0-4e56-a876-0e815654db9b',
    '6489A16D-9C97-4415-9D41-104732933D72',
    1,
    'Completed',
    'Completed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 82ed4901-f383-4cf9-b919-5b42b0c5712e */
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
    '82ed4901-f383-4cf9-b919-5b42b0c5712e',
    '6489A16D-9C97-4415-9D41-104732933D72',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID caf5c61c-6441-4bc7-8cac-91d326bfe8be */
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
    'caf5c61c-6441-4bc7-8cac-91d326bfe8be',
    '6489A16D-9C97-4415-9D41-104732933D72',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 701210c6-ee19-48a4-aa21-1572a120efd3 */
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
    '701210c6-ee19-48a4-aa21-1572a120efd3',
    '6489A16D-9C97-4415-9D41-104732933D72',
    4,
    'Pruned',
    'Pruned',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3668b281-1edb-439f-9b33-b6233c3e5794 */
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
    '3668b281-1edb-439f-9b33-b6233c3e5794',
    '6489A16D-9C97-4415-9D41-104732933D72',
    5,
    'Running',
    'Running',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 6489A16D-9C97-4415-9D41-104732933D72 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6489A16D-9C97-4415-9D41-104732933D72';
/* SQL text to insert entity field value with ID 0e03d7fa-6eff-4b65-be07-6691429199ad */
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
    '0e03d7fa-6eff-4b65-be07-6691429199ad',
    '780AAB1C-0740-4AED-83A7-DCBE8DA2C843',
    1,
    'Completed',
    'Completed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 74138ee8-1e52-4129-ae35-860ba4306114 */
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
    '74138ee8-1e52-4129-ae35-860ba4306114',
    '780AAB1C-0740-4AED-83A7-DCBE8DA2C843',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4b720a8e-34b1-4a78-bd23-5ecb89338b8f */
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
    '4b720a8e-34b1-4a78-bd23-5ecb89338b8f',
    '780AAB1C-0740-4AED-83A7-DCBE8DA2C843',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6cc0e2a1-f162-40a5-a371-7372959b1e8c */
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
    '6cc0e2a1-f162-40a5-a371-7372959b1e8c',
    '780AAB1C-0740-4AED-83A7-DCBE8DA2C843',
    4,
    'Pruned',
    'Pruned',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 97c73e83-1b39-4339-861a-dbe2a793243d */
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
    '97c73e83-1b39-4339-861a-dbe2a793243d',
    '780AAB1C-0740-4AED-83A7-DCBE8DA2C843',
    5,
    'Running',
    'Running',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 780AAB1C-0740-4AED-83A7-DCBE8DA2C843 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843';
/* SQL text to insert entity field value with ID 285ab7f0-40c8-4455-a23a-8fc67d2c867c */
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
    '285ab7f0-40c8-4455-a23a-8fc67d2c867c',
    '919000EB-F5B2-495F-93F4-AE6D2A1AF119',
    1,
    'Materialized',
    'Materialized',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 774af3cf-cbfd-4cec-8e08-97f1eae6039f */
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
    '774af3cf-cbfd-4cec-8e08-97f1eae6039f',
    '919000EB-F5B2-495F-93F4-AE6D2A1AF119',
    2,
    'OnDemand',
    'OnDemand',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 59bf12a1-78dc-4042-9243-93935e738a59 */
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
    '59bf12a1-78dc-4042-9243-93935e738a59',
    '919000EB-F5B2-495F-93F4-AE6D2A1AF119',
    3,
    'Scheduled',
    'Scheduled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 919000EB-F5B2-495F-93F4-AE6D2A1AF119 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '919000EB-F5B2-495F-93F4-AE6D2A1AF119';
/* SQL text to insert entity field value with ID d325939d-2b36-4920-8a89-5bebf590ad44 */
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
    'd325939d-2b36-4920-8a89-5bebf590ad44',
    '65776A4C-7173-40F8-AEA8-6E5E24AC7227',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 03608d43-92a7-44a2-b9f2-cc154fa67b28 */
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
    '03608d43-92a7-44a2-b9f2-cc154fa67b28',
    '65776A4C-7173-40F8-AEA8-6E5E24AC7227',
    2,
    'Deprecated',
    'Deprecated',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 65776A4C-7173-40F8-AEA8-6E5E24AC7227 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '65776A4C-7173-40F8-AEA8-6E5E24AC7227';
/* SQL text to insert entity field value with ID d914382b-d575-41c9-b79e-1315efa7ee60 */
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
    'd914382b-d575-41c9-b79e-1315efa7ee60',
    'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4',
    1,
    'any',
    'any',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bef0fcc5-82a9-4365-9977-01fd1a8b315f */
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
    'bef0fcc5-82a9-4365-9977-01fd1a8b315f',
    'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4',
    2,
    'classification',
    'classification',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 695663a3-5b03-42b4-9a90-39bc4f470be9 */
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
    '695663a3-5b03-42b4-9a90-39bc4f470be9',
    'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4',
    3,
    'regression',
    'regression',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID CBD833AA-1C97-45E6-ADC6-5101D31AF5A4 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4';
/* SQL text to insert entity field value with ID e2ca4f08-9f8e-45f9-b664-45cc8cb93b09 */
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
    'e2ca4f08-9f8e-45f9-b664-45cc8cb93b09',
    '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E',
    1,
    'NotRecommended',
    'NotRecommended',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 79fdfedb-b6d7-4f00-931f-7d5f29aeb2dc */
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
    '79fdfedb-b6d7-4f00-931f-7d5f29aeb2dc',
    '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E',
    2,
    'Primary',
    'Primary',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 20d84a1d-f423-46ef-aa8f-ebaa84c04278 */
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
    '20d84a1d-f423-46ef-aa8f-ebaa84c04278',
    '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E',
    3,
    'Strong',
    'Strong',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 01ae0072-264f-4fd2-8010-799bef165469 */
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
    '01ae0072-264f-4fd2-8010-799bef165469',
    '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E',
    4,
    'Viable',
    'Viable',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3f5b4a07-5ab1-48c5-994a-130547e9e2e3 */
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
    '3f5b4a07-5ab1-48c5-994a-130547e9e2e3',
    '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E',
    5,
    'Weak',
    'Weak',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 612DF83C-8F49-43D9-9D30-EB9FF9D3E31E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E';
/* SQL text to insert entity field value with ID 86008bc6-e762-4a63-bafa-fffd9c243dbd */
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
    '86008bc6-e762-4a63-bafa-fffd9c243dbd',
    '6B7F8CD9-0491-493A-8961-B5B1E268B12B',
    1,
    'Archived',
    'Archived',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4f8f1649-b09d-4ad5-a687-0bd6d92c2c4d */
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
    '4f8f1649-b09d-4ad5-a687-0bd6d92c2c4d',
    '6B7F8CD9-0491-493A-8961-B5B1E268B12B',
    2,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 589168e9-011a-4fd4-b168-daaab2dfe3d6 */
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
    '589168e9-011a-4fd4-b168-daaab2dfe3d6',
    '6B7F8CD9-0491-493A-8961-B5B1E268B12B',
    3,
    'Published',
    'Published',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 6B7F8CD9-0491-493A-8961-B5B1E268B12B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6B7F8CD9-0491-493A-8961-B5B1E268B12B';
/* SQL text to insert entity field value with ID cbc185ff-72d0-4bf1-bd4f-c0f9ba28e2e7 */
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
    'cbc185ff-72d0-4bf1-bd4f-c0f9ba28e2e7',
    'E245EF88-64A1-4F22-A954-EC44A431CE3E',
    1,
    'classification',
    'classification',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5e1182d7-9450-4107-a24d-327e6b455317 */
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
    '5e1182d7-9450-4107-a24d-327e6b455317',
    'E245EF88-64A1-4F22-A954-EC44A431CE3E',
    2,
    'regression',
    'regression',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID E245EF88-64A1-4F22-A954-EC44A431CE3E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'E245EF88-64A1-4F22-A954-EC44A431CE3E';
/* SQL text to insert entity field value with ID 3617bf1d-ed43-4f64-a2a9-34e582be9ba3 */
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
    '3617bf1d-ed43-4f64-a2a9-34e582be9ba3',
    '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0',
    1,
    'classification',
    'classification',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ed520962-2b56-4cb0-8426-71850f01c597 */
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
    'ed520962-2b56-4cb0-8426-71850f01c597',
    '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0',
    2,
    'regression',
    'regression',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0';
/* SQL text to insert entity field value with ID 40ef12a2-7585-40e0-9d9f-95569751482b */
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
    '40ef12a2-7585-40e0-9d9f-95569751482b',
    '8B0C0799-D66A-48BA-987D-C32D477E2A28',
    1,
    'Archived',
    'Archived',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID eccee1ce-a8e5-45e0-a317-0eb26779d9c9 */
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
    'eccee1ce-a8e5-45e0-a317-0eb26779d9c9',
    '8B0C0799-D66A-48BA-987D-C32D477E2A28',
    2,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c2ce99ca-0e5d-4227-b71d-55a34c1b1f84 */
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
    'c2ce99ca-0e5d-4227-b71d-55a34c1b1f84',
    '8B0C0799-D66A-48BA-987D-C32D477E2A28',
    3,
    'Published',
    'Published',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5f645bca-78a6-4f2f-b01d-1ae7ed48bfc8 */
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
    '5f645bca-78a6-4f2f-b01d-1ae7ed48bfc8',
    '8B0C0799-D66A-48BA-987D-C32D477E2A28',
    4,
    'Validated',
    'Validated',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 8B0C0799-D66A-48BA-987D-C32D477E2A28 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8B0C0799-D66A-48BA-987D-C32D477E2A28';
/* SQL text to insert entity field value with ID 56d62ebd-30f0-47a8-9631-79f8d0ad0070 */
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
    '56d62ebd-30f0-47a8-9631-79f8d0ad0070',
    '0D7F9649-8909-4601-86EE-BA48C5A95582',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f52302df-76b7-4602-a1a7-fedf970e7259 */
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
    'f52302df-76b7-4602-a1a7-fedf970e7259',
    '0D7F9649-8909-4601-86EE-BA48C5A95582',
    2,
    'Archived',
    'Archived',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 0D7F9649-8909-4601-86EE-BA48C5A95582 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '0D7F9649-8909-4601-86EE-BA48C5A95582';
/* SQL text to insert entity field value with ID fd91f9a0-de28-4cea-be00-0fdd9c986691 */
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
    'fd91f9a0-de28-4cea-be00-0fdd9c986691',
    '24DD5079-7579-4792-BD72-CD6DB2DB0ED0',
    1,
    'AwaitingApproval',
    'AwaitingApproval',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 00147175-b620-4161-aa9d-e9ace8a27db9 */
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
    '00147175-b620-4161-aa9d-e9ace8a27db9',
    '24DD5079-7579-4792-BD72-CD6DB2DB0ED0',
    2,
    'Cancelled',
    'Cancelled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0e2e5229-a7cb-4a66-bb26-aae8c4ca8f14 */
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
    '0e2e5229-a7cb-4a66-bb26-aae8c4ca8f14',
    '24DD5079-7579-4792-BD72-CD6DB2DB0ED0',
    3,
    'Completed',
    'Completed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d0f2f195-7904-4802-a8a2-43bdace12f0b */
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
    'd0f2f195-7904-4802-a8a2-43bdace12f0b',
    '24DD5079-7579-4792-BD72-CD6DB2DB0ED0',
    4,
    'Paused',
    'Paused',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 577009b5-6d9b-4215-9a81-85d5cc88d90e */
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
    '577009b5-6d9b-4215-9a81-85d5cc88d90e',
    '24DD5079-7579-4792-BD72-CD6DB2DB0ED0',
    5,
    'Planning',
    'Planning',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a36634f1-b7a8-49ae-89b4-a7d93108dbea */
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
    'a36634f1-b7a8-49ae-89b4-a7d93108dbea',
    '24DD5079-7579-4792-BD72-CD6DB2DB0ED0',
    6,
    'Running',
    'Running',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 24DD5079-7579-4792-BD72-CD6DB2DB0ED0 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0';
/* Create Entity Relationship: MJ: ML Algorithm Use Cases -> MJ: ML Algorithm Use Case Rankings (One To Many via MLAlgorithmUseCaseID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'dbfa0041-a53a-484b-a186-c4342370d08e') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dbfa0041-a53a-484b-a186-c4342370d08e', '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'MLAlgorithmUseCaseID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e25db55a-d46d-411d-b363-3a13af6feba1') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e25db55a-d46d-411d-b363-3a13af6feba1', '232793CF-4406-4BCC-8022-0589C6EA6EF3', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'ExperimentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '888f33a9-3ed9-42de-b5db-a31e04c59d94') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('888f33a9-3ed9-42de-b5db-a31e04c59d94', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'AIAgentRunID', 'One To Many', TRUE, TRUE, 11, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '69d30b78-5e6a-4765-9351-47a7ce056921') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69d30b78-5e6a-4765-9351-47a7ce056921', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'AgentRunID', 'One To Many', TRUE, TRUE, 12, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '42815065-3419-4f77-85c2-ee69bdc347a6') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('42815065-3419-4f77-85c2-ee69bdc347a6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'TargetEntityID', 'One To Many', TRUE, TRUE, 67, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2d4b2674-1cdc-4dbb-8d3e-15be0cae1c7c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d4b2674-1cdc-4dbb-8d3e-15be0cae1c7c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'TargetEntityID', 'One To Many', TRUE, TRUE, 68, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'cf569ae7-5988-4f75-bd34-85ebd9684618') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf569ae7-5988-4f75-bd34-85ebd9684618', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ArtifactFileID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a53a0f11-14a1-4af3-8850-cb44afce4c40') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a53a0f11-14a1-4af3-8850-cb44afce4c40', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ExperimentSessionIterationID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1c03e8a6-cc87-4cfd-94f1-21e85cea9239') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c03e8a6-cc87-4cfd-94f1-21e85cea9239', 'A3997636-011D-46E0-BC01-8B1E61E1087B', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'ResultingModelID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b3324f8a-5e80-4c82-a929-5cf1b8e5d015') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3324f8a-5e80-4c82-a929-5cf1b8e5d015', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'MLModelID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '288fa1e8-51f9-4567-8876-e6d7d867c167') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('288fa1e8-51f9-4567-8876-e6d7d867c167', '703FD109-331B-438D-902B-8E4A93C3F6AA', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'PipelineID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6dc44e30-f262-4413-9bf6-4fdeb6494527') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6dc44e30-f262-4413-9bf6-4fdeb6494527', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'PipelineID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c792c88d-31f8-40c6-9d2a-2349938ccf1b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c792c88d-31f8-40c6-9d2a-2349938ccf1b', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'FD8EF230-65F3-496D-A117-7610572C35AA', 'RecordProcessID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9aae02cb-7a89-45c5-b94c-ec6e00f81851') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9aae02cb-7a89-45c5-b94c-ec6e00f81851', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38', 'ExperimentSessionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fe61be9f-0ec6-4d81-a85d-a7b9bbb42e5c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fe61be9f-0ec6-4d81-a85d-a7b9bbb42e5c', '26642380-432D-4527-85DD-FE7A96E57549', '1A4DF72F-68E0-410C-B42C-815687BFE2D2', 'AlgorithmID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e544b258-d52c-406d-9866-40b853c6297a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e544b258-d52c-406d-9866-40b853c6297a', '26642380-432D-4527-85DD-FE7A96E57549', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'AlgorithmID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4893ea23-7f6d-4a0b-b732-ace427479137') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4893ea23-7f6d-4a0b-b732-ace427479137', '26642380-432D-4527-85DD-FE7A96E57549', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'AlgorithmID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f96681d9-5b93-44b0-abed-581cc423c90c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f96681d9-5b93-44b0-abed-581cc423c90c', '26642380-432D-4527-85DD-FE7A96E57549', '05136FE9-994B-4C0F-926E-DEE4D8D928C1', 'MLAlgorithmID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef4d3a91-623e-429d-a5bb-0dc24474299a' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'ExperimentSession')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef4d3a91-623e-429d-a5bb-0dc24474299a', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100025, 'ExperimentSession', 'Experiment Session', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '601df784-0f34-4980-97b6-3f210c2109c1' OR ("EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' AND "Name" = 'AIAgentRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('601df784-0f34-4980-97b6-3f210c2109c1', 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38' /* Entity: MJ: Experiment Session Iterations */, 100026, 'AIAgentRun', 'AI Agent Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b9cd9ec-1fbd-41d8-afd9-75d662a87e2d' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'RecordProcess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b9cd9ec-1fbd-41d8-afd9-75d662a87e2d', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100023, 'RecordProcess', 'Record Process', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e4d5589-ec14-4384-a75d-101b3e326696' OR ("EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA' AND "Name" = 'TargetEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8e4d5589-ec14-4384-a75d-101b3e326696', 'FD8EF230-65F3-496D-A117-7610572C35AA' /* Entity: MJ: ML Model Scoring Bindings */, 100024, 'TargetEntity', 'Target Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c939b88-8a7f-49c5-9567-9e04c7c656dc' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'Pipeline')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3c939b88-8a7f-49c5-9567-9e04c7c656dc', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100033, 'Pipeline', 'Pipeline', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e01ba18e-8697-4ecc-9437-f567dac85155' OR ("EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2' AND "Name" = 'Algorithm')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e01ba18e-8697-4ecc-9437-f567dac85155', '1A4DF72F-68E0-410C-B42C-815687BFE2D2' /* Entity: MJ: ML Training Runs */, 100034, 'Algorithm', 'Algorithm', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc2f1f3a-c245-4f04-a91a-ce591d787b8f' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Pipeline')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cc2f1f3a-c245-4f04-a91a-ce591d787b8f', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100039, 'Pipeline', 'Pipeline', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f71b8b3b-b969-45e0-a998-ae7c1dc8b9cd' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'Algorithm')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f71b8b3b-b969-45e0-a998-ae7c1dc8b9cd', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100040, 'Algorithm', 'Algorithm', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0384067b-48d7-4a83-9e14-c776dca57ea7' OR ("EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND "Name" = 'ArtifactFile')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0384067b-48d7-4a83-9e14-c776dca57ea7', 'A3997636-011D-46E0-BC01-8B1E61E1087B' /* Entity: MJ: ML Models */, 100041, 'ArtifactFile', 'Artifact File', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8bc27dc-3de0-49e3-963d-27d3722946da' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'TargetEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8bc27dc-3de0-49e3-963d-27d3722946da', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100035, 'TargetEntity', 'Target Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a40bac8-db50-418f-9422-e24c1935e0da' OR ("EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND "Name" = 'Algorithm')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a40bac8-db50-418f-9422-e24c1935e0da', '703FD109-331B-438D-902B-8E4A93C3F6AA' /* Entity: MJ: ML Training Pipelines */, 100036, 'Algorithm', 'Algorithm', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fe8bc7c2-394b-43d1-bafa-4ceab34ff4a1' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'MLAlgorithm')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fe8bc7c2-394b-43d1-bafa-4ceab34ff4a1', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100017, 'MLAlgorithm', 'ML Algorithm', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3db32dd8-2743-4629-a8f9-5478e401591c' OR ("EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1' AND "Name" = 'MLAlgorithmUseCase')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3db32dd8-2743-4629-a8f9-5478e401591c', '05136FE9-994B-4C0F-926E-DEE4D8D928C1' /* Entity: MJ: ML Algorithm Use Case Rankings */, 100018, 'MLAlgorithmUseCase', 'ML Algorithm Use Case', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '73eb55b9-ac04-43f9-9db5-5114d4154de4' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'Experiment')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('73eb55b9-ac04-43f9-9db5-5114d4154de4', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100023, 'Experiment', 'Experiment', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0104ac74-5c9a-415d-b1d2-fc3e64f26e08' OR ("EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' AND "Name" = 'AgentRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0104ac74-5c9a-415d-b1d2-fc3e64f26e08', '0B20AA02-67CC-4B78-8680-FDDD4B0E6198' /* Entity: MJ: Experiment Sessions */, 100024, 'AgentRun', 'Agent Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1597CD31-A1D4-4447-BE0D-C72DCD2E3874'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '65776A4C-7173-40F8-AEA8-6E5E24AC7227'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '1597CD31-A1D4-4447-BE0D-C72DCD2E3874'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '15D6E08F-EB42-4CDC-B89B-80C63283CC8F'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '424B1239-76C8-4FA0-B825-5F959FE1806E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '69E1B728-8231-4181-AEAF-81F5C19C7042'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '27E04775-D00D-4D25-A076-4A6FF0205260'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'ABE2E189-4467-4E98-87C5-B209D656438B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '27E04775-D00D-4D25-A076-4A6FF0205260'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'AC4A2799-454B-4395-AA56-A42241F32C12'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'BAF736AC-D4C5-4021-BB99-B630122215A5'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '73EB55B9-AC04-43F9-9DB5-5114D4154DE4'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '0104AC74-5C9A-415D-B1D2-FC3E64F26E08'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '73EB55B9-AC04-43F9-9DB5-5114D4154DE4'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '0104AC74-5C9A-415D-B1D2-FC3E64F26E08'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'DC54B44D-79AC-4C91-9760-A2A91E708E7A'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6489A16D-9C97-4415-9D41-104732933D72'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D8CBCDFC-F3D8-4ADC-89E3-BDBD893D9F3F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4BA87989-B7E1-4701-BDA0-5983B6D0D5E7'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C14C9AFF-AA11-4443-AB07-F054E984726C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '235B3ECF-9FC7-40B3-A3E7-F63758B1AD44'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6B7F8CD9-0491-493A-8961-B5B1E268B12B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9A40BAC8-DB50-418F-9422-E24C1935E0DA'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '6B7F8CD9-0491-493A-8961-B5B1E268B12B'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '9A40BAC8-DB50-418F-9422-E24C1935E0DA'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '0613E52B-3280-4209-9B85-0A0FEAC23CDA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '9A40BAC8-DB50-418F-9422-E24C1935E0DA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '6B7F8CD9-0491-493A-8961-B5B1E268B12B'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'EF0182F4-7C41-41C0-9ED6-E6573601054A'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '0D7F9649-8909-4601-86EE-BA48C5A95582'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'EF0182F4-7C41-41C0-9ED6-E6573601054A'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '43E65059-00A5-4847-A047-17B86F2E16C3'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'EF0182F4-7C41-41C0-9ED6-E6573601054A'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CEB5DECC-6D27-48D4-9E81-0F4ABC6CF017'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '22352411-C09A-416A-8110-81215AB22047'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3C939B88-8A7F-49C5-9567-9E04C7C656DC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E01BA18E-8697-4ECC-9437-F567DAC85155'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'E7F45990-3456-4CD8-AD90-46BA864A60D2'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3C939B88-8A7F-49C5-9567-9E04C7C656DC'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'E01BA18E-8697-4ECC-9437-F567DAC85155'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '3C939B88-8A7F-49C5-9567-9E04C7C656DC'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'E01BA18E-8697-4ECC-9437-F567DAC85155'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3FFAB2E2-84AE-441A-8ACA-37BFCC40CDB6'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3DB32DD8-2743-4629-A8F9-5478E401591C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3DB32DD8-2743-4629-A8F9-5478E401591C'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '3DB32DD8-2743-4629-A8F9-5478E401591C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B871A401-2AA4-4B5C-942E-6AFB401660C6'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '052AA3EF-9B41-44C7-AC90-F9039D30A625'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '94606151-4B72-423F-A494-E3230421752C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8B0C0799-D66A-48BA-987D-C32D477E2A28'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CC2F1F3A-C245-4F04-A91A-CE591D787B8F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '052AA3EF-9B41-44C7-AC90-F9039D30A625'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '8B0C0799-D66A-48BA-987D-C32D477E2A28'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'CC2F1F3A-C245-4F04-A91A-CE591D787B8F'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '8B0C0799-D66A-48BA-987D-C32D477E2A28'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '919000EB-F5B2-495F-93F4-AE6D2A1AF119'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '390DCC0B-C014-4C34-A899-E574F3933890'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6CDA85F4-965E-4835-96EA-58182D12F375'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8E4D5589-EC14-4384-A75D-101B3E326696'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '919000EB-F5B2-495F-93F4-AE6D2A1AF119'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '8E4D5589-EC14-4384-A75D-101B3E326696'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '919000EB-F5B2-495F-93F4-AE6D2A1AF119'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 11 fields */
/* UPDATE Entity Field Category Info MJ: ML Algorithms.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EE985BC9-0A22-4ED4-93DC-236FDBDF77D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.Name */
UPDATE __mj."EntityField" SET "Category" = 'Algorithm Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '15D6E08F-EB42-4CDC-B89B-80C63283CC8F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.Description */
UPDATE __mj."EntityField" SET "Category" = 'Algorithm Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E8FC4567-5CB4-4CCF-AADE-9B7DD38F3F43' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.ProblemTypes */
UPDATE __mj."EntityField" SET "Category" = 'Algorithm Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1597CD31-A1D4-4447-BE0D-C72DCD2E3874' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.DriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A5F38DB5-011D-41FE-96E8-D5D2BAEB9150' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.HyperparameterSchema */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'A180CE96-0D60-4B85-8F93-B56D26374546' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.DefaultHyperparameters */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'F2B8E114-843E-4DD9-99BC-87D3D492EA9A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.SupportsFeatureImportance */
UPDATE __mj."EntityField" SET "Category" = 'Capabilities', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D3C4A5A5-54E3-4D70-B07A-F31E2F76A367' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.Status */
UPDATE __mj."EntityField" SET "Category" = 'Capabilities', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '65776A4C-7173-40F8-AEA8-6E5E24AC7227' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '68D8B8B2-145F-416C-AF88-3D83F85A76FC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithms.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9C47E0F6-FD2A-44D8-B53B-722D8C9F3939' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-brain */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-brain', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '26642380-432D-4527-85DD-FE7A96E57549';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'acdcb481-3195-4808-a1e2-6987b26b84ee',
    '26642380-432D-4527-85DD-FE7A96E57549',
    'FieldCategoryInfo',
    '{"Algorithm Overview":{"icon":"fa fa-info-circle","description":"Basic identification and functional purpose of the machine learning algorithm"},"Execution Settings":{"icon":"fa fa-cogs","description":"Technical configuration, driver mapping, and hyperparameter definitions"},"Capabilities":{"icon":"fa fa-check-square","description":"Functional capabilities and lifecycle status of the algorithm"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking information"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3f43a6c2-e905-4df2-8a58-a9538dbf5d78',
    '26642380-432D-4527-85DD-FE7A96E57549',
    'FieldCategoryIcons',
    '{"Algorithm Overview":"fa fa-info-circle","Execution Settings":"fa fa-cogs","Capabilities":"fa fa-check-square","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '26642380-432D-4527-85DD-FE7A96E57549';

/* Set categories for 14 fields */
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E2EFDD32-CA23-4B7B-994A-319C989828AD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ExperimentSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Experiment Session', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AFB257FF-2710-4482-8D64-A5FB2E6DC0A4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ExperimentSession */
UPDATE __mj."EntityField" SET "Category" = 'Session Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Experiment Session Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EF4D3A91-623E-429D-A5BB-0DC24474299A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Sequence */
UPDATE __mj."EntityField" SET "Category" = 'Iteration Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DC54B44D-79AC-4C91-9760-A2A91E708E7A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Label */
UPDATE __mj."EntityField" SET "Category" = 'Iteration Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AF18F28E-58EF-4CFD-BA8E-B7C8D7A80F79' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Status */
UPDATE __mj."EntityField" SET "Category" = 'Iteration Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6489A16D-9C97-4415-9D41-104732933D72' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Rationale */
UPDATE __mj."EntityField" SET "Category" = 'Iteration Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C8E3BB7C-E0B6-49D5-9260-03368B09BD08' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.Score */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D8CBCDFC-F3D8-4ADC-89E3-BDBD893D9F3F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.ComputeCost */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4BA87989-B7E1-4701-BDA0-5983B6D0D5E7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.TokensUsed */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C14C9AFF-AA11-4443-AB07-F054E984726C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.AIAgentRunID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Agent Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '19DF8613-9F36-43C6-9AC9-0147F6B6B41B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.AIAgentRun */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'AI Agent Run Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '601DF784-0F34-4980-97B6-3F210C2109C1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0BE6CA2B-2E93-4661-A6D1-991A36304591' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Session Iterations.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3D67E4B4-C9F3-40A0-9AFD-53B34A6DF191' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-vial */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-vial', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '871214f3-7578-497c-9cb0-a248106a0c12',
    'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38',
    'FieldCategoryInfo',
    '{"Session Context":{"icon":"fa fa-layer-group","description":"Information linking this iteration to its parent experiment session"},"Iteration Details":{"icon":"fa fa-info-circle","description":"Core descriptive and status information about the specific attempt"},"Performance Metrics":{"icon":"fa fa-chart-line","description":"Quantitative results and resource consumption data"},"Execution Context":{"icon":"fa fa-robot","description":"Details regarding the AI agent execution associated with this attempt"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b1b2eff5-bfd7-420e-86c7-354192a0d481',
    'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38',
    'FieldCategoryIcons',
    '{"Session Context":"fa fa-layer-group","Iteration Details":"fa fa-info-circle","Performance Metrics":"fa fa-chart-line","Execution Context":"fa fa-robot","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'B3FA8AC2-B5DB-4C3D-89A5-64B384FB3E38';

/* Set categories for 19 fields */
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E458ADCB-FCCC-4074-A5CE-8D58D3FF8241' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.Name */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0613E52B-3280-4209-9B85-0A0FEAC23CDA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.Description */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5A9A161A-61BE-4D2C-B603-675D7572C6CB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.Version */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '235B3ECF-9FC7-40B3-A3E7-F63758B1AD44' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.Status */
UPDATE __mj."EntityField" SET "Category" = 'Pipeline Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6B7F8CD9-0491-493A-8961-B5B1E268B12B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '30914C7C-6DDA-409D-BE74-DCECDEB57E32' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetEntity */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B8BC27DC-3DE0-49E3-963D-27D3722946DA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.TargetVariable */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '936424AB-347E-4E58-89D3-CD93E1A17B49' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.ProblemType */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E245EF88-64A1-4F22-A954-EC44A431CE3E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.AlgorithmID */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3BB4400A-0FE5-44F1-B565-4D0E69821D64' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.Algorithm */
UPDATE __mj."EntityField" SET "Category" = 'Model Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9A40BAC8-DB50-418F-9422-E24C1935E0DA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.Hyperparameters */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '887A5948-0F5E-4E3D-824C-C1D4B636B761' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.SourceBindings */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'F9CC6E74-1E94-4D15-97D8-FACED9B94433' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.FeatureSteps */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '39701B36-19A8-45E5-B279-3A081EC3E5B0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.AsOfStrategy */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B66D28B9-757F-45C2-A14D-BD2167627BFF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.LeakageGuard */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Safety', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B902F42B-3518-432A-8700-2C32E06704B3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.ValidationStrategy */
UPDATE __mj."EntityField" SET "Category" = 'Validation and Safety', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '8A15D518-D028-4596-8124-9485865074A8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7BE270EF-BCB8-4354-A780-2820C12C38E5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Pipelines.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0D82F95F-E227-4E90-B639-D001EE32A283' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-project-diagram */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-project-diagram', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '703FD109-331B-438D-902B-8E4A93C3F6AA';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2228a3a0-4594-41f6-b2ef-b62b17f55f1e',
    '703FD109-331B-438D-902B-8E4A93C3F6AA',
    'FieldCategoryInfo',
    '{"Pipeline Overview":{"icon":"fa fa-info-circle","description":"General identification and status of the ML pipeline"},"Model Definition":{"icon":"fa fa-brain","description":"Core modeling parameters including target variables and algorithms"},"Configuration":{"icon":"fa fa-sliders-h","description":"Technical configuration for data binding, feature engineering, and tuning"},"Validation and Safety":{"icon":"fa fa-shield-alt","description":"Strategies for model validation and leakage prevention"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6502aefc-82a3-4b13-ace7-ad898e8beae9',
    '703FD109-331B-438D-902B-8E4A93C3F6AA',
    'FieldCategoryIcons',
    '{"Pipeline Overview":"fa fa-info-circle","Model Definition":"fa fa-brain","Configuration":"fa fa-sliders-h","Validation and Safety":"fa fa-shield-alt","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '703FD109-331B-438D-902B-8E4A93C3F6AA';

/* Set categories for 18 fields */
/* UPDATE Entity Field Category Info MJ: ML Training Runs.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7FFD262B-18E6-449B-B103-EF59F59C317C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.PipelineID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Pipeline', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '05E0463C-130C-4B7C-8FC5-BF8C45640147' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.Pipeline */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Pipeline Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3C939B88-8A7F-49C5-9567-9E04C7C656DC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.ExperimentSessionIterationID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Experiment Iteration', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '657C631B-A990-4F3A-A881-8A06BAB643D4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.AlgorithmID */
UPDATE __mj."EntityField" SET "Category" = 'Model Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Algorithm', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4A774655-5497-4DEA-9ABC-694AEF5EE8E3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.Algorithm */
UPDATE __mj."EntityField" SET "Category" = 'Model Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Algorithm Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E01BA18E-8697-4ECC-9437-F567DAC85155' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.FeaturesUsed */
UPDATE __mj."EntityField" SET "Category" = 'Model Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'BE952DA9-141A-4DC0-BFD9-DDFD414CCC59' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.Hyperparameters */
UPDATE __mj."EntityField" SET "Category" = 'Model Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '740AE4C7-6ED5-41E6-9AF4-9E91F347FC48' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.ValidationResults */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'C61AB0ED-A92C-4FCD-851F-2E778995C89F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.ResultingModelID */
UPDATE __mj."EntityField" SET "Category" = 'Performance Metrics', "GeneratedFormSection" = 'Category', "DisplayName" = 'Resulting Model', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '237CF3C4-7600-4C67-A368-73B9830FF3C2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.Status */
UPDATE __mj."EntityField" SET "Category" = 'Execution Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '780AAB1C-0740-4AED-83A7-DCBE8DA2C843' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CEB5DECC-6D27-48D4-9E81-0F4ABC6CF017' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.CompletedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DF11DBF7-C050-463B-87D4-9F2DC23CDACB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.ComputeCost */
UPDATE __mj."EntityField" SET "Category" = 'Resource Usage', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '22352411-C09A-416A-8110-81215AB22047' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.TokensUsed */
UPDATE __mj."EntityField" SET "Category" = 'Resource Usage', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8A05882F-6969-41EE-91A4-8606BFF23A8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.Notes */
UPDATE __mj."EntityField" SET "Category" = 'Execution Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E7F45990-3456-4CD8-AD90-46BA864A60D2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0664DDD3-ED18-44BE-A6A4-167959719288' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Training Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '02798AFD-669B-4C7D-B4A5-7D61100A3F75' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-microchip */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-microchip', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd2c4b1bb-2813-465f-8240-203dbec53320',
    '1A4DF72F-68E0-410C-B42C-815687BFE2D2',
    'FieldCategoryInfo',
    '{"Execution Context":{"icon":"fa fa-project-diagram","description":"Links to pipelines, sessions, and parent iterations for the training run."},"Model Configuration":{"icon":"fa fa-cogs","description":"Details on the algorithm, features, and hyperparameters used."},"Performance Metrics":{"icon":"fa fa-chart-bar","description":"Validation results and references to resulting models."},"Execution Timeline":{"icon":"fa fa-clock","description":"Run status, timestamps, and observational notes."},"Resource Usage":{"icon":"fa fa-dollar-sign","description":"Financial and compute resource consumption metrics."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '154e9089-6fbb-4abe-9009-b1127e55780b',
    '1A4DF72F-68E0-410C-B42C-815687BFE2D2',
    'FieldCategoryIcons',
    '{"Execution Context":"fa fa-project-diagram","Model Configuration":"fa fa-cogs","Performance Metrics":"fa fa-chart-bar","Execution Timeline":"fa fa-clock","Resource Usage":"fa fa-dollar-sign","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '1A4DF72F-68E0-410C-B42C-815687BFE2D2';

/* Set categories for 22 fields */
/* UPDATE Entity Field Category Info MJ: Open Apps.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7655DE67-050C-4FEC-833F-3B3FE61E2451' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Name */
UPDATE __mj."EntityField" SET "Category" = 'App Identity', "GeneratedFormSection" = 'Category', "DisplayName" = 'App Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6AC413DC-EBE1-4DFC-9BE4-8E44377B7F46' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.DisplayName */
UPDATE __mj."EntityField" SET "Category" = 'App Identity', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '27E04775-D00D-4D25-A076-4A6FF0205260' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Description */
UPDATE __mj."EntityField" SET "Category" = 'App Identity', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3849DB2D-73C2-46BF-B263-AF66D6A0B34D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Version */
UPDATE __mj."EntityField" SET "Category" = 'App Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ABE2E189-4467-4E98-87C5-B209D656438B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Publisher */
UPDATE __mj."EntityField" SET "Category" = 'Publisher Information', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BF1AC3D5-615D-4C91-AFF7-6A9C88BC6D26' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.PublisherEmail */
UPDATE __mj."EntityField" SET "Category" = 'Publisher Information', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Email', "CodeType" = NULL
WHERE
  "ID" = '0F40CC6A-B28A-4B49-AF23-BEFE1B9907D3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.PublisherURL */
UPDATE __mj."EntityField" SET "Category" = 'Publisher Information', "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = 'F099ED4E-387C-4F5E-87A7-5272516719D1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.RepositoryURL */
UPDATE __mj."EntityField" SET "Category" = 'App Identity', "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '132CF4B3-E5E5-4083-B91D-1A629352872B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.SchemaName */
UPDATE __mj."EntityField" SET "Category" = 'App Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D8A2781A-95C0-4335-81B6-0021B7078E06' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.MJVersionRange */
UPDATE __mj."EntityField" SET "Category" = 'App Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0A1465DB-2055-46AB-93D8-A70DD2245102' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.License */
UPDATE __mj."EntityField" SET "Category" = 'App Identity', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8721CEB2-E802-4C49-BBFC-BF6AEB51544B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Icon */
UPDATE __mj."EntityField" SET "Category" = 'UI Branding', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '19CD1851-4DA5-43E7-BCE7-175F1248EB26' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Color */
UPDATE __mj."EntityField" SET "Category" = 'UI Branding', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A8A25DC2-66A9-4338-8CD5-C169F940372E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.ManifestJSON */
UPDATE __mj."EntityField" SET "Category" = 'App Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Manifest', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B37C9605-C957-4A09-ACC6-2862C1A86D67' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.ConfigurationSchemaJSON */
UPDATE __mj."EntityField" SET "Category" = 'App Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '519A5582-4618-4138-B19C-1713064CC457' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.InstalledByUserID */
UPDATE __mj."EntityField" SET "Category" = 'App Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A47E36F4-7942-4A8B-9735-72F74B07C618' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Status */
UPDATE __mj."EntityField" SET "Category" = 'App Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8416B44A-1A4D-4D48-AC1F-5831D14DFA12' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '12A25C96-E439-471A-AB5D-E190A3FFC957' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.Subpath */
UPDATE __mj."EntityField" SET "Category" = 'App Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '762C8803-FB39-4E24-B92F-4F18241256E1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Open Apps.InstalledByUser */
UPDATE __mj."EntityField" SET "Category" = 'App Lifecycle', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AC2D5658-7CAD-45CA-BCC5-A87E70144545' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-box-open */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-box-open', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'AC4A2799-454B-4395-AA56-A42241F32C12';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '54136050-5b9b-4d97-ba50-f94fd7d7b5f7',
    'AC4A2799-454B-4395-AA56-A42241F32C12',
    'FieldCategoryInfo',
    '{"App Identity":{"icon":"fa fa-info-circle","description":"Core identifying information including name, description, and source repository"},"App Lifecycle":{"icon":"fa fa-sync-alt","description":"Information regarding versioning, installation status, and compatibility"},"Publisher Information":{"icon":"fa fa-user-tie","description":"Contact and organizational details for the application publisher"},"App Configuration":{"icon":"fa fa-cogs","description":"Technical configuration, database schema, and manifest settings"},"UI Branding":{"icon":"fa fa-palette","description":"Visual branding elements for displaying the app in the UI"},"System Metadata":{"icon":"fa fa-database","description":"Audit and system tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3e4baca8-27d7-48fe-8458-fcc7cb9dd719',
    'AC4A2799-454B-4395-AA56-A42241F32C12',
    'FieldCategoryIcons',
    '{"App Identity":"fa fa-info-circle","App Lifecycle":"fa fa-sync-alt","Publisher Information":"fa fa-user-tie","App Configuration":"fa fa-cogs","UI Branding":"fa fa-palette","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7D136B5A-CC4A-4355-B266-0F5DCAFE2851' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmID */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5443C622-F023-45C0-995B-E765B728A075' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmUseCaseID */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8BB6B63D-0C44-421D-B845-3C44365EC788' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithm */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FE8BC7C2-394B-43D1-BAFA-4CEAB34FF4A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.MLAlgorithmUseCase */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3DB32DD8-2743-4629-A8F9-5478E401591C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.SuitabilityScore */
UPDATE __mj."EntityField" SET "Category" = 'Ranking Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3FFAB2E2-84AE-441A-8ACA-37BFCC40CDB6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.RecommendationLevel */
UPDATE __mj."EntityField" SET "Category" = 'Ranking Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '612DF83C-8F49-43D9-9D30-EB9FF9D3E31E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.Rationale */
UPDATE __mj."EntityField" SET "Category" = 'Ranking Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5F7134E3-ACBE-49F4-8A9F-71FC04D10039' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2C294AD9-D593-41E0-AFA7-AC21BFFDE5E9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Case Rankings.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8D085176-5132-4E19-A109-E1F963509374' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-brain */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-brain', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '091ab61c-de31-4431-863f-5e8f54a2861e',
    '05136FE9-994B-4C0F-926E-DEE4D8D928C1',
    'FieldCategoryInfo',
    '{"Use Case Mapping":{"icon":"fa fa-project-diagram","description":"Relationships and associations between ML algorithms and their target use cases"},"Ranking Details":{"icon":"fa fa-star","description":"Suitability scores, recommendation levels, and plain-language rationale for the ranking"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit logs and unique identifiers"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8a1a64b7-34a8-4f43-a058-4239f3d6a4a3',
    '05136FE9-994B-4C0F-926E-DEE4D8D928C1',
    'FieldCategoryIcons',
    '{"Use Case Mapping":"fa fa-project-diagram","Ranking Details":"fa fa-star","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '05136FE9-994B-4C0F-926E-DEE4D8D928C1';

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6D980809-164F-4F29-B360-BCF4FBECB882' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Name */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '69E1B728-8231-4181-AEAF-81F5C19C7042' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Description */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '51ACBD01-9BD3-43A2-9562-C4C338DC5B18' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.ProblemTypeScope */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.Guidance */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E4A0A11D-2953-42FE-B5F3-DA0B2ECCA343' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.DisplayOrder */
UPDATE __mj."EntityField" SET "Category" = 'Use Case Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '424B1239-76C8-4FA0-B825-5F959FE1806E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E1E42A7A-D9E2-4763-BBAF-94A730936CAC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Algorithm Use Cases.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '66AE2491-E621-40BC-B500-B2A0E053F820' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-brain */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-brain', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '36855eb0-6627-4162-a9c3-c29d49de06d2',
    '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F',
    'FieldCategoryInfo',
    '{"Use Case Details":{"icon":"fa fa-clipboard-list","description":"Core details, scope, and guidance for the machine learning use case scenario."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a4cf7823-6a61-4986-bd08-da61bcc4e022',
    '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F',
    'FieldCategoryIcons',
    '{"Use Case Details":"fa fa-clipboard-list","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '51A7BD55-6DC7-4162-8AD4-057E4B37EA0F';

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: Experiments.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B3729481-FE28-4891-9C14-C5A21DAE93C8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.Name */
UPDATE __mj."EntityField" SET "Category" = 'Experiment Profile', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '43E65059-00A5-4847-A047-17B86F2E16C3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.Description */
UPDATE __mj."EntityField" SET "Category" = 'Experiment Profile', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '99B71188-3D89-46A1-AF2C-0C61BDBFBD9F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.ExperimentType */
UPDATE __mj."EntityField" SET "Category" = 'Experiment Profile', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EF0182F4-7C41-41C0-9ED6-E6573601054A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.Status */
UPDATE __mj."EntityField" SET "Category" = 'Experiment Profile', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0D7F9649-8909-4601-86EE-BA48C5A95582' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.Goal */
UPDATE __mj."EntityField" SET "Category" = 'Objectives & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DDE443F0-F51E-401D-92BC-0B49A00F578F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.TargetMetric */
UPDATE __mj."EntityField" SET "Category" = 'Objectives & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5F5E830E-4B7C-4CF0-A493-23CC34CB9E44' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.PlanSpecTemplate */
UPDATE __mj."EntityField" SET "Category" = 'Objectives & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '7FC84CB6-0A55-4537-8B41-3BBDDA2CD9A2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F55B3283-D82A-4A0E-A4F9-0C937EE114A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiments.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2FC3ADD0-BD34-4F92-BB62-4D0278BCB8E5' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-flask */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-flask', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'aeecb583-e6d6-4d35-ab15-109c4a83f4cf',
    '232793CF-4406-4BCC-8022-0589C6EA6EF3',
    'FieldCategoryInfo',
    '{"Experiment Profile":{"icon":"fa fa-flask","description":"Basic identification, description, type, and current status of the experiment."},"Objectives & Configuration":{"icon":"fa fa-bullseye","description":"The goals, target metrics, and configuration templates defining the experiment''s execution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ada0dd18-364d-49f0-b1e4-90ef3610e983',
    '232793CF-4406-4BCC-8022-0589C6EA6EF3',
    'FieldCategoryIcons',
    '{"Experiment Profile":"fa fa-flask","Objectives & Configuration":"fa fa-bullseye","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '232793CF-4406-4BCC-8022-0589C6EA6EF3';

/* Set categories for 13 fields */
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D00F5797-AC83-4398-B3E3-D4B30E925AAE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.ExperimentID */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Experiment', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5329588B-49B4-49A6-A0DC-300E9490ED00' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.Name */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '49D424DF-5006-49FF-BF6C-1FE96B65EBF3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.Goal */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Goal Override', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E5ED3427-B34F-42A1-A513-F6953EA9D0C6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '24DD5079-7579-4792-BD72-CD6DB2DB0ED0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.Experiment */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Experiment Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '73EB55B9-AC04-43F9-9DB5-5114D4154DE4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.Budget */
UPDATE __mj."EntityField" SET "Category" = 'Execution & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Budget Constraints', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '7672A82D-9F28-4805-8F9E-1A60516C7C4E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.PlanSpec */
UPDATE __mj."EntityField" SET "Category" = 'Execution & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Plan Specification', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '4EBC06E3-72D5-4F59-9650-8047A8E45946' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.Leaderboard */
UPDATE __mj."EntityField" SET "Category" = 'Execution & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Leaderboard Snapshot', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '8FA23ED8-71E9-44B5-BB8F-762B07E72B8B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.AgentRunID */
UPDATE __mj."EntityField" SET "Category" = 'Execution & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3E47F4D6-4653-41A8-BCD7-024FC9FC4280' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.AgentRun */
UPDATE __mj."EntityField" SET "Category" = 'Execution & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Run Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0104AC74-5C9A-415D-B1D2-FC3E64F26E08' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BAF736AC-D4C5-4021-BB99-B630122215A5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Experiment Sessions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0A43E613-D18D-4BC4-A611-219F16F3739C' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-flask */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-flask', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fbeb1bdd-8225-4759-9d5f-374112fef384',
    '0B20AA02-67CC-4B78-8680-FDDD4B0E6198',
    'FieldCategoryInfo',
    '{"Session Details":{"icon":"fa fa-flask","description":"Core identity, goal, and status of the experiment session execution"},"Execution & Performance":{"icon":"fa fa-play-circle","description":"Execution parameters, budget constraints, agent run details, and performance leaderboards"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '23a01545-adc9-476a-aa4a-79f88ce36eda',
    '0B20AA02-67CC-4B78-8680-FDDD4B0E6198',
    'FieldCategoryIcons',
    '{"Session Details":"fa fa-flask","Execution & Performance":"fa fa-play-circle","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '0B20AA02-67CC-4B78-8680-FDDD4B0E6198';

/* Set categories for 13 fields */
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7D63C521-60A5-466F-A13F-E3B237CFB56D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MLModelID */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '86FD001C-52E7-4A71-A475-F5C4878B7CC4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CD2474E9-3F84-4E48-844F-9F4C59079FF7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.RecordProcess */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0B9CD9EC-1FBD-41D8-AFD9-75D662A87E2D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.Mode */
UPDATE __mj."EntityField" SET "Category" = 'Binding Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scoring Mode', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '919000EB-F5B2-495F-93F4-AE6D2A1AF119' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Target Destination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4E8A46A8-EF56-4D67-B161-B78E41941936' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetEntity */
UPDATE __mj."EntityField" SET "Category" = 'Target Destination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8E4D5589-EC14-4384-A75D-101B3E326696' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.TargetColumn */
UPDATE __mj."EntityField" SET "Category" = 'Target Destination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F9B34226-CEEC-43F1-BB7B-DB64448AC558' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.MaterializedResultID */
UPDATE __mj."EntityField" SET "Category" = 'Target Destination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B041E1BE-CC53-43D5-B446-AB7BF72FED60' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.LastScoredAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '390DCC0B-C014-4C34-A899-E574F3933890' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.LastRowCount */
UPDATE __mj."EntityField" SET "Category" = 'Execution Metrics', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6CDA85F4-965E-4835-96EA-58182D12F375' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '29AE7DD0-460A-4E82-B651-F940129346CE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Model Scoring Bindings.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A9D4E337-04C5-4E30-83C6-62B03D8E9343' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-project-diagram */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-project-diagram', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'FD8EF230-65F3-496D-A117-7610572C35AA';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0387472d-ed3f-4ac4-8199-419bc092eeed',
    'FD8EF230-65F3-496D-A117-7610572C35AA',
    'FieldCategoryInfo',
    '{"Binding Configuration":{"icon":"fa fa-sliders-h","description":"Settings defining the ML model, process, and scoring mode"},"Target Destination":{"icon":"fa fa-bullseye","description":"The destination entity and column where model predictions are written"},"Execution Metrics":{"icon":"fa fa-tachometer-alt","description":"Performance and execution statistics from the latest scoring run"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f92e21a0-c246-459e-add0-f0b77c95bb4a',
    'FD8EF230-65F3-496D-A117-7610572C35AA',
    'FieldCategoryIcons',
    '{"Binding Configuration":"fa fa-sliders-h","Target Destination":"fa fa-bullseye","Execution Metrics":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'FD8EF230-65F3-496D-A117-7610572C35AA';

/* Set categories for 22 fields */
/* UPDATE Entity Field Category Info MJ: ML Models.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Model ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '759D131A-7DF7-4B85-9E0C-6DB3BFC61084' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.PipelineID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CECBE6BF-4A2B-4D9B-9135-F372777ED18E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.Pipeline */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CC2F1F3A-C245-4F04-A91A-CE591D787B8F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.Version */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B871A401-2AA4-4B5C-942E-6AFB401660C6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.AlgorithmID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '51E9A55B-D490-41B7-B4F3-2B429E18C71D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.Algorithm */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F71B8B3B-B969-45E0-A998-AE7C1DC8B9CD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.ArtifactFileID */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EA625A1A-7553-41BD-9CF5-74BC41B541C7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.ArtifactFile */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0384067B-48D7-4A83-9E14-C776DCA57EA7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.Lineage */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Lineage Details', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '91EEBC4E-4A98-4B20-BA7B-AA9F82C61BC1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.Status */
UPDATE __mj."EntityField" SET "Category" = 'Model Identity & Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8B0C0799-D66A-48BA-987D-C32D477E2A28' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.ProblemType */
UPDATE __mj."EntityField" SET "Category" = 'Schema & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.TargetVariable */
UPDATE __mj."EntityField" SET "Category" = 'Schema & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '052AA3EF-9B41-44C7-AC90-F9039D30A625' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.FeatureSchema */
UPDATE __mj."EntityField" SET "Category" = 'Schema & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '0BB4B332-DE18-488A-B841-6C8BBAC3BD9C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.FittedPreprocessing */
UPDATE __mj."EntityField" SET "Category" = 'Schema & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B17A1F8F-FC2D-4C5B-8E89-FCD67605EF49' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.TrainedAt */
UPDATE __mj."EntityField" SET "Category" = 'Training & Performance', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '94606151-4B72-423F-A494-E3230421752C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.TrainingDurationSec */
UPDATE __mj."EntityField" SET "Category" = 'Training & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Duration (Seconds)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1065C3B7-CED6-4EED-A179-9FC98C8E9CDB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.TrainingRowCount */
UPDATE __mj."EntityField" SET "Category" = 'Training & Performance', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A33BE812-E208-4410-8523-DA31277508C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.Metrics */
UPDATE __mj."EntityField" SET "Category" = 'Training & Performance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Training Metrics', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'DD008101-49C0-4F82-852D-963B77F096A8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.HoldoutMetrics */
UPDATE __mj."EntityField" SET "Category" = 'Training & Performance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'EB2B1A50-0126-4374-88FA-D562C500DA8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.FeatureImportance */
UPDATE __mj."EntityField" SET "Category" = 'Training & Performance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '86F10CE5-E0A9-47E5-8DD5-DC83D1A9622F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AED32800-6560-42F3-A8D3-06801C80476C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: ML Models.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BBA8940E-120A-4D50-A75D-7B598783F02B' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-brain */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-brain', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '73550565-f5fe-463d-90f4-49d56c5ee74d',
    'A3997636-011D-46E0-BC01-8B1E61E1087B',
    'FieldCategoryInfo',
    '{"Model Identity & Status":{"icon":"fa fa-tag","description":"Core model identifiers, versioning, lineage, and lifecycle status."},"Schema & Configuration":{"icon":"fa fa-sliders-h","description":"Input schemas, target variables, and fitted preprocessing parameters."},"Training & Performance":{"icon":"fa fa-chart-line","description":"Training execution details, validation metrics, and feature importances."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c0a09c65-019e-4747-a954-13fb72845ba4',
    'A3997636-011D-46E0-BC01-8B1E61E1087B',
    'FieldCategoryIcons',
    '{"Model Identity & Status":"fa fa-tag","Schema & Configuration":"fa fa-sliders-h","Training & Performance":"fa fa-chart-line","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'A3997636-011D-46E0-BC01-8B1E61E1087B';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Session Iterations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_experiment_session_iteration_experiment_sessio"
    ON __mj."ExperimentSessionIteration" ("ExperimentSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_experiment_session_iteration_ai_agent_run_id"
    ON __mj."ExperimentSessionIteration" ("AIAgentRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Session Iterations
-- Item: vwExperimentSessionIterations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Experiment Session Iterations
-----               SCHEMA:      __mj
-----               BASE TABLE:  ExperimentSessionIteration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwExperimentSessionIterations"
AS
SELECT
    e.*,
    MJExperimentSession_ExperimentSessionID."Name" AS "ExperimentSession",
    MJAIAgentRun_AIAgentRunID."RunName" AS "AIAgentRun"
FROM
    __mj."ExperimentSessionIteration" AS e
INNER JOIN
    __mj."ExperimentSession" AS MJExperimentSession_ExperimentSessionID
  ON
    "e"."ExperimentSessionID" = MJExperimentSession_ExperimentSessionID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AIAgentRunID
  ON
    "e"."AIAgentRunID" = MJAIAgentRun_AIAgentRunID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwExperimentSessionIterations'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwExperimentSessionIterations'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwExperimentSessionIterations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwExperimentSessionIterations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwExperimentSessionIterations" TO "cdp_UI";
GRANT SELECT ON __mj."vwExperimentSessionIterations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwExperimentSessionIterations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Session Iterations
-- Item: spCreateExperimentSessionIteration
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ExperimentSessionIteration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExperimentSessionIteration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateExperimentSessionIteration"(
    p_id UUID DEFAULT NULL,
    p_experimentsessionid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_score_clear boolean DEFAULT false,
    p_score decimal(18, 6) DEFAULT NULL,
    p_computecost_clear boolean DEFAULT false,
    p_computecost decimal(18, 6) DEFAULT NULL,
    p_tokensused_clear boolean DEFAULT false,
    p_tokensused int DEFAULT NULL,
    p_rationale_clear boolean DEFAULT false,
    p_rationale TEXT DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwExperimentSessionIterations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ExperimentSessionIteration"
        (
            "ID",
            "ExperimentSessionID",
                "Sequence",
                "Label",
                "Status",
                "Score",
                "ComputeCost",
                "TokensUsed",
                "Rationale",
                "AIAgentRunID"
        )
    VALUES
        (
            v_new_id,
            p_experimentsessionid,
                COALESCE(p_sequence, 0),
                CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, NULL) END,
                CASE WHEN p_computecost_clear = true THEN NULL ELSE COALESCE(p_computecost, NULL) END,
                CASE WHEN p_tokensused_clear = true THEN NULL ELSE COALESCE(p_tokensused, NULL) END,
                CASE WHEN p_rationale_clear = true THEN NULL ELSE COALESCE(p_rationale, NULL) END,
                CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwExperimentSessionIterations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateExperimentSessionIteration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateExperimentSessionIteration" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Session Iterations
-- Item: spUpdateExperimentSessionIteration
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ExperimentSessionIteration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExperimentSessionIteration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateExperimentSessionIteration"(
    p_id UUID,
    p_experimentsessionid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_score_clear boolean DEFAULT false,
    p_score decimal(18, 6) DEFAULT NULL,
    p_computecost_clear boolean DEFAULT false,
    p_computecost decimal(18, 6) DEFAULT NULL,
    p_tokensused_clear boolean DEFAULT false,
    p_tokensused int DEFAULT NULL,
    p_rationale_clear boolean DEFAULT false,
    p_rationale TEXT DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwExperimentSessionIterations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ExperimentSessionIteration"
    SET
        "ExperimentSessionID" = COALESCE(p_experimentsessionid, "ExperimentSessionID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Label" = CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, "Label") END,
        "Status" = COALESCE(p_status, "Status"),
        "Score" = CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, "Score") END,
        "ComputeCost" = CASE WHEN p_computecost_clear = true THEN NULL ELSE COALESCE(p_computecost, "ComputeCost") END,
        "TokensUsed" = CASE WHEN p_tokensused_clear = true THEN NULL ELSE COALESCE(p_tokensused, "TokensUsed") END,
        "Rationale" = CASE WHEN p_rationale_clear = true THEN NULL ELSE COALESCE(p_rationale, "Rationale") END,
        "AIAgentRunID" = CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, "AIAgentRunID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwExperimentSessionIterations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateExperimentSessionIteration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateExperimentSessionIteration" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExperimentSessionIteration table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_experiment_session_iteration"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_experiment_session_iteration" ON __mj."ExperimentSessionIteration";

CREATE TRIGGER "trg_update_experiment_session_iteration"
BEFORE UPDATE ON __mj."ExperimentSessionIteration"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_experiment_session_iteration"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Session Iterations
-- Item: spDeleteExperimentSessionIteration
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ExperimentSessionIteration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteExperimentSessionIteration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteExperimentSessionIteration"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ExperimentSessionIteration"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteExperimentSessionIteration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteExperimentSessionIteration" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Sessions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_experiment_session_experiment_id"
    ON __mj."ExperimentSession" ("ExperimentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_experiment_session_agent_run_id"
    ON __mj."ExperimentSession" ("AgentRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Sessions
-- Item: vwExperimentSessions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Experiment Sessions
-----               SCHEMA:      __mj
-----               BASE TABLE:  ExperimentSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwExperimentSessions"
AS
SELECT
    e.*,
    MJExperiment_ExperimentID."Name" AS "Experiment",
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun"
FROM
    __mj."ExperimentSession" AS e
INNER JOIN
    __mj."Experiment" AS MJExperiment_ExperimentID
  ON
    "e"."ExperimentID" = MJExperiment_ExperimentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "e"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwExperimentSessions'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwExperimentSessions'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwExperimentSessions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwExperimentSessions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwExperimentSessions" TO "cdp_UI";
GRANT SELECT ON __mj."vwExperimentSessions" TO "cdp_Developer";
GRANT SELECT ON __mj."vwExperimentSessions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Sessions
-- Item: spCreateExperimentSession
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ExperimentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExperimentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateExperimentSession"(
    p_id UUID DEFAULT NULL,
    p_experimentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_goal_clear boolean DEFAULT false,
    p_goal TEXT DEFAULT NULL,
    p_budget_clear boolean DEFAULT false,
    p_budget TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_planspec_clear boolean DEFAULT false,
    p_planspec TEXT DEFAULT NULL,
    p_leaderboard_clear boolean DEFAULT false,
    p_leaderboard TEXT DEFAULT NULL,
    p_agentrunid_clear boolean DEFAULT false,
    p_agentrunid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwExperimentSessions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ExperimentSession"
        (
            "ID",
            "ExperimentID",
                "Name",
                "Goal",
                "Budget",
                "Status",
                "PlanSpec",
                "Leaderboard",
                "AgentRunID"
        )
    VALUES
        (
            v_new_id,
            p_experimentid,
                p_name,
                CASE WHEN p_goal_clear = true THEN NULL ELSE COALESCE(p_goal, NULL) END,
                CASE WHEN p_budget_clear = true THEN NULL ELSE COALESCE(p_budget, NULL) END,
                COALESCE(p_status, 'Planning'),
                CASE WHEN p_planspec_clear = true THEN NULL ELSE COALESCE(p_planspec, NULL) END,
                CASE WHEN p_leaderboard_clear = true THEN NULL ELSE COALESCE(p_leaderboard, NULL) END,
                CASE WHEN p_agentrunid_clear = true THEN NULL ELSE COALESCE(p_agentrunid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwExperimentSessions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateExperimentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateExperimentSession" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Sessions
-- Item: spUpdateExperimentSession
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ExperimentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExperimentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateExperimentSession"(
    p_id UUID,
    p_experimentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_goal_clear boolean DEFAULT false,
    p_goal TEXT DEFAULT NULL,
    p_budget_clear boolean DEFAULT false,
    p_budget TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_planspec_clear boolean DEFAULT false,
    p_planspec TEXT DEFAULT NULL,
    p_leaderboard_clear boolean DEFAULT false,
    p_leaderboard TEXT DEFAULT NULL,
    p_agentrunid_clear boolean DEFAULT false,
    p_agentrunid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwExperimentSessions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ExperimentSession"
    SET
        "ExperimentID" = COALESCE(p_experimentid, "ExperimentID"),
        "Name" = COALESCE(p_name, "Name"),
        "Goal" = CASE WHEN p_goal_clear = true THEN NULL ELSE COALESCE(p_goal, "Goal") END,
        "Budget" = CASE WHEN p_budget_clear = true THEN NULL ELSE COALESCE(p_budget, "Budget") END,
        "Status" = COALESCE(p_status, "Status"),
        "PlanSpec" = CASE WHEN p_planspec_clear = true THEN NULL ELSE COALESCE(p_planspec, "PlanSpec") END,
        "Leaderboard" = CASE WHEN p_leaderboard_clear = true THEN NULL ELSE COALESCE(p_leaderboard, "Leaderboard") END,
        "AgentRunID" = CASE WHEN p_agentrunid_clear = true THEN NULL ELSE COALESCE(p_agentrunid, "AgentRunID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwExperimentSessions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateExperimentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateExperimentSession" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExperimentSession table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_experiment_session"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_experiment_session" ON __mj."ExperimentSession";

CREATE TRIGGER "trg_update_experiment_session"
BEFORE UPDATE ON __mj."ExperimentSession"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_experiment_session"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiment Sessions
-- Item: spDeleteExperimentSession
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ExperimentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteExperimentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteExperimentSession"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ExperimentSession"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteExperimentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteExperimentSession" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiments
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiments
-- Item: vwExperiments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Experiments
-----               SCHEMA:      __mj
-----               BASE TABLE:  Experiment
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwExperiments"
AS
SELECT
    e.*
FROM
    __mj."Experiment" AS e
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwExperiments'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwExperiments'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwExperiments'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwExperiments" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwExperiments" TO "cdp_UI";
GRANT SELECT ON __mj."vwExperiments" TO "cdp_Developer";
GRANT SELECT ON __mj."vwExperiments" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiments
-- Item: spCreateExperiment
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Experiment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateExperiment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateExperiment"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_experimenttype varchar(50) DEFAULT NULL,
    p_goal_clear boolean DEFAULT false,
    p_goal TEXT DEFAULT NULL,
    p_targetmetric_clear boolean DEFAULT false,
    p_targetmetric varchar(100) DEFAULT NULL,
    p_planspectemplate_clear boolean DEFAULT false,
    p_planspectemplate TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwExperiments" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Experiment"
        (
            "ID",
            "Name",
                "Description",
                "ExperimentType",
                "Goal",
                "TargetMetric",
                "PlanSpecTemplate",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_experimenttype,
                CASE WHEN p_goal_clear = true THEN NULL ELSE COALESCE(p_goal, NULL) END,
                CASE WHEN p_targetmetric_clear = true THEN NULL ELSE COALESCE(p_targetmetric, NULL) END,
                CASE WHEN p_planspectemplate_clear = true THEN NULL ELSE COALESCE(p_planspectemplate, NULL) END,
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwExperiments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateExperiment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateExperiment" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiments
-- Item: spUpdateExperiment
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Experiment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateExperiment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateExperiment"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_experimenttype varchar(50) DEFAULT NULL,
    p_goal_clear boolean DEFAULT false,
    p_goal TEXT DEFAULT NULL,
    p_targetmetric_clear boolean DEFAULT false,
    p_targetmetric varchar(100) DEFAULT NULL,
    p_planspectemplate_clear boolean DEFAULT false,
    p_planspectemplate TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwExperiments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Experiment"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ExperimentType" = COALESCE(p_experimenttype, "ExperimentType"),
        "Goal" = CASE WHEN p_goal_clear = true THEN NULL ELSE COALESCE(p_goal, "Goal") END,
        "TargetMetric" = CASE WHEN p_targetmetric_clear = true THEN NULL ELSE COALESCE(p_targetmetric, "TargetMetric") END,
        "PlanSpecTemplate" = CASE WHEN p_planspectemplate_clear = true THEN NULL ELSE COALESCE(p_planspectemplate, "PlanSpecTemplate") END,
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwExperiments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateExperiment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateExperiment" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Experiment table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_experiment"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_experiment" ON __mj."Experiment";

CREATE TRIGGER "trg_update_experiment"
BEFORE UPDATE ON __mj."Experiment"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_experiment"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Experiments
-- Item: spDeleteExperiment
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Experiment
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteExperiment'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteExperiment"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."Experiment"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteExperiment" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteExperiment" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Case Rankings
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_algorithm_use_case_ranking_ml_algorithm_id"
    ON __mj."MLAlgorithmUseCaseRanking" ("MLAlgorithmID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_algorithm_use_case_ranking_ml_algorithm_use"
    ON __mj."MLAlgorithmUseCaseRanking" ("MLAlgorithmUseCaseID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Case Rankings
-- Item: vwMLAlgorithmUseCaseRankings
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Algorithm Use Case Rankings
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLAlgorithmUseCaseRanking
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLAlgorithmUseCaseRankings"
AS
SELECT
    m.*,
    MJMLAlgorithm_MLAlgorithmID."Name" AS "MLAlgorithm",
    MJMLAlgorithmUseCase_MLAlgorithmUseCaseID."Name" AS "MLAlgorithmUseCase"
FROM
    __mj."MLAlgorithmUseCaseRanking" AS m
INNER JOIN
    __mj."MLAlgorithm" AS MJMLAlgorithm_MLAlgorithmID
  ON
    "m"."MLAlgorithmID" = MJMLAlgorithm_MLAlgorithmID."ID"
INNER JOIN
    __mj."MLAlgorithmUseCase" AS MJMLAlgorithmUseCase_MLAlgorithmUseCaseID
  ON
    "m"."MLAlgorithmUseCaseID" = MJMLAlgorithmUseCase_MLAlgorithmUseCaseID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLAlgorithmUseCaseRankings'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLAlgorithmUseCaseRankings'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLAlgorithmUseCaseRankings'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLAlgorithmUseCaseRankings" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLAlgorithmUseCaseRankings" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLAlgorithmUseCaseRankings" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLAlgorithmUseCaseRankings" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Case Rankings
-- Item: spCreateMLAlgorithmUseCaseRanking
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLAlgorithmUseCaseRanking
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLAlgorithmUseCaseRanking'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMLAlgorithmUseCaseRanking"(
    p_id UUID DEFAULT NULL,
    p_mlalgorithmid UUID DEFAULT NULL,
    p_mlalgorithmusecaseid UUID DEFAULT NULL,
    p_suitabilityscore int DEFAULT NULL,
    p_recommendationlevel varchar(20) DEFAULT NULL,
    p_rationale_clear boolean DEFAULT false,
    p_rationale TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwMLAlgorithmUseCaseRankings" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLAlgorithmUseCaseRanking"
        (
            "ID",
            "MLAlgorithmID",
                "MLAlgorithmUseCaseID",
                "SuitabilityScore",
                "RecommendationLevel",
                "Rationale"
        )
    VALUES
        (
            v_new_id,
            p_mlalgorithmid,
                p_mlalgorithmusecaseid,
                p_suitabilityscore,
                p_recommendationlevel,
                CASE WHEN p_rationale_clear = true THEN NULL ELSE COALESCE(p_rationale, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLAlgorithmUseCaseRankings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLAlgorithmUseCaseRanking" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLAlgorithmUseCaseRanking" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Case Rankings
-- Item: spUpdateMLAlgorithmUseCaseRanking
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLAlgorithmUseCaseRanking
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLAlgorithmUseCaseRanking'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMLAlgorithmUseCaseRanking"(
    p_id UUID,
    p_mlalgorithmid UUID DEFAULT NULL,
    p_mlalgorithmusecaseid UUID DEFAULT NULL,
    p_suitabilityscore int DEFAULT NULL,
    p_recommendationlevel varchar(20) DEFAULT NULL,
    p_rationale_clear boolean DEFAULT false,
    p_rationale TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwMLAlgorithmUseCaseRankings" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLAlgorithmUseCaseRanking"
    SET
        "MLAlgorithmID" = COALESCE(p_mlalgorithmid, "MLAlgorithmID"),
        "MLAlgorithmUseCaseID" = COALESCE(p_mlalgorithmusecaseid, "MLAlgorithmUseCaseID"),
        "SuitabilityScore" = COALESCE(p_suitabilityscore, "SuitabilityScore"),
        "RecommendationLevel" = COALESCE(p_recommendationlevel, "RecommendationLevel"),
        "Rationale" = CASE WHEN p_rationale_clear = true THEN NULL ELSE COALESCE(p_rationale, "Rationale") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLAlgorithmUseCaseRankings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLAlgorithmUseCaseRanking" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLAlgorithmUseCaseRanking" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLAlgorithmUseCaseRanking table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_algorithm_use_case_ranking"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_algorithm_use_case_ranking" ON __mj."MLAlgorithmUseCaseRanking";

CREATE TRIGGER "trg_update_ml_algorithm_use_case_ranking"
BEFORE UPDATE ON __mj."MLAlgorithmUseCaseRanking"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_algorithm_use_case_ranking"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Case Rankings
-- Item: spDeleteMLAlgorithmUseCaseRanking
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLAlgorithmUseCaseRanking
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLAlgorithmUseCaseRanking'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMLAlgorithmUseCaseRanking"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLAlgorithmUseCaseRanking"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLAlgorithmUseCaseRanking" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLAlgorithmUseCaseRanking" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Cases
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Cases
-- Item: vwMLAlgorithmUseCases
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Algorithm Use Cases
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLAlgorithmUseCase
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLAlgorithmUseCases"
AS
SELECT
    m.*
FROM
    __mj."MLAlgorithmUseCase" AS m
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLAlgorithmUseCases'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLAlgorithmUseCases'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLAlgorithmUseCases'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLAlgorithmUseCases" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLAlgorithmUseCases" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLAlgorithmUseCases" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLAlgorithmUseCases" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Cases
-- Item: spCreateMLAlgorithmUseCase
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLAlgorithmUseCase
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLAlgorithmUseCase'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMLAlgorithmUseCase"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_problemtypescope varchar(20) DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_displayorder int DEFAULT NULL
) RETURNS SETOF __mj."vwMLAlgorithmUseCases" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLAlgorithmUseCase"
        (
            "ID",
            "Name",
                "Description",
                "ProblemTypeScope",
                "Guidance",
                "DisplayOrder"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_problemtypescope, 'any'),
                CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, NULL) END,
                COALESCE(p_displayorder, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLAlgorithmUseCases"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLAlgorithmUseCase" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLAlgorithmUseCase" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Cases
-- Item: spUpdateMLAlgorithmUseCase
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLAlgorithmUseCase
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLAlgorithmUseCase'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMLAlgorithmUseCase"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_problemtypescope varchar(20) DEFAULT NULL,
    p_guidance_clear boolean DEFAULT false,
    p_guidance TEXT DEFAULT NULL,
    p_displayorder int DEFAULT NULL
) RETURNS SETOF __mj."vwMLAlgorithmUseCases" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLAlgorithmUseCase"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ProblemTypeScope" = COALESCE(p_problemtypescope, "ProblemTypeScope"),
        "Guidance" = CASE WHEN p_guidance_clear = true THEN NULL ELSE COALESCE(p_guidance, "Guidance") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLAlgorithmUseCases"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLAlgorithmUseCase" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLAlgorithmUseCase" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLAlgorithmUseCase table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_algorithm_use_case"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_algorithm_use_case" ON __mj."MLAlgorithmUseCase";

CREATE TRIGGER "trg_update_ml_algorithm_use_case"
BEFORE UPDATE ON __mj."MLAlgorithmUseCase"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_algorithm_use_case"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithm Use Cases
-- Item: spDeleteMLAlgorithmUseCase
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLAlgorithmUseCase
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLAlgorithmUseCase'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMLAlgorithmUseCase"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLAlgorithmUseCase"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLAlgorithmUseCase" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLAlgorithmUseCase" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithms
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithms
-- Item: vwMLAlgorithms
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Algorithms
-----               SCHEMA:      __mj
-----               BASE TABLE:  MLAlgorithm
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLAlgorithms"
AS
SELECT
    m.*
FROM
    __mj."MLAlgorithm" AS m
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLAlgorithms'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLAlgorithms'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLAlgorithms'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLAlgorithms" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLAlgorithms" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLAlgorithms" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLAlgorithms" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithms
-- Item: spCreateMLAlgorithm
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MLAlgorithm
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMLAlgorithm'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMLAlgorithm"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_problemtypes varchar(100) DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_hyperparameterschema_clear boolean DEFAULT false,
    p_hyperparameterschema TEXT DEFAULT NULL,
    p_defaulthyperparameters_clear boolean DEFAULT false,
    p_defaulthyperparameters TEXT DEFAULT NULL,
    p_supportsfeatureimportance BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwMLAlgorithms" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLAlgorithm"
        (
            "ID",
            "Name",
                "Description",
                "ProblemTypes",
                "DriverClass",
                "HyperparameterSchema",
                "DefaultHyperparameters",
                "SupportsFeatureImportance",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_problemtypes,
                p_driverclass,
                CASE WHEN p_hyperparameterschema_clear = true THEN NULL ELSE COALESCE(p_hyperparameterschema, NULL) END,
                CASE WHEN p_defaulthyperparameters_clear = true THEN NULL ELSE COALESCE(p_defaulthyperparameters, NULL) END,
                COALESCE(p_supportsfeatureimportance, TRUE),
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLAlgorithms"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLAlgorithm" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLAlgorithm" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithms
-- Item: spUpdateMLAlgorithm
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MLAlgorithm
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMLAlgorithm'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMLAlgorithm"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_problemtypes varchar(100) DEFAULT NULL,
    p_driverclass varchar(255) DEFAULT NULL,
    p_hyperparameterschema_clear boolean DEFAULT false,
    p_hyperparameterschema TEXT DEFAULT NULL,
    p_defaulthyperparameters_clear boolean DEFAULT false,
    p_defaulthyperparameters TEXT DEFAULT NULL,
    p_supportsfeatureimportance BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwMLAlgorithms" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLAlgorithm"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ProblemTypes" = COALESCE(p_problemtypes, "ProblemTypes"),
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "HyperparameterSchema" = CASE WHEN p_hyperparameterschema_clear = true THEN NULL ELSE COALESCE(p_hyperparameterschema, "HyperparameterSchema") END,
        "DefaultHyperparameters" = CASE WHEN p_defaulthyperparameters_clear = true THEN NULL ELSE COALESCE(p_defaulthyperparameters, "DefaultHyperparameters") END,
        "SupportsFeatureImportance" = COALESCE(p_supportsfeatureimportance, "SupportsFeatureImportance"),
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLAlgorithms"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLAlgorithm" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLAlgorithm" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLAlgorithm table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_algorithm"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_algorithm" ON __mj."MLAlgorithm";

CREATE TRIGGER "trg_update_ml_algorithm"
BEFORE UPDATE ON __mj."MLAlgorithm"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_algorithm"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Algorithms
-- Item: spDeleteMLAlgorithm
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MLAlgorithm
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMLAlgorithm'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMLAlgorithm"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLAlgorithm"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLAlgorithm" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLAlgorithm" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Model Scoring Bindings
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_ml_model_id"
    ON __mj."MLModelScoringBinding" ("MLModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_record_process_id"
    ON __mj."MLModelScoringBinding" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_scoring_binding_target_entity_id"
    ON __mj."MLModelScoringBinding" ("TargetEntityID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLModelScoringBindings"
AS
SELECT
    m.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_TargetEntityID."Name" AS "TargetEntity"
FROM
    __mj."MLModelScoringBinding" AS m
LEFT OUTER JOIN
    __mj."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "m"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_TargetEntityID
  ON
    "m"."TargetEntityID" = MJEntity_TargetEntityID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLModelScoringBindings'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLModelScoringBindings'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLModelScoringBindings'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLModelScoringBindings" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLModelScoringBindings" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLModelScoringBindings" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLModelScoringBindings" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateMLModelScoringBinding"(
    p_id UUID DEFAULT NULL,
    p_mlmodelid UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetcolumn_clear boolean DEFAULT false,
    p_targetcolumn varchar(255) DEFAULT NULL,
    p_mode varchar(20) DEFAULT NULL,
    p_materializedresultid_clear boolean DEFAULT false,
    p_materializedresultid UUID DEFAULT NULL,
    p_lastscoredat_clear boolean DEFAULT false,
    p_lastscoredat TIMESTAMPTZ DEFAULT NULL,
    p_lastrowcount_clear boolean DEFAULT false,
    p_lastrowcount int DEFAULT NULL
) RETURNS SETOF __mj."vwMLModelScoringBindings" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLModelScoringBinding"
        (
            "ID",
            "MLModelID",
                "RecordProcessID",
                "TargetEntityID",
                "TargetColumn",
                "Mode",
                "MaterializedResultID",
                "LastScoredAt",
                "LastRowCount"
        )
    VALUES
        (
            v_new_id,
            p_mlmodelid,
                CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, NULL) END,
                CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, NULL) END,
                CASE WHEN p_targetcolumn_clear = true THEN NULL ELSE COALESCE(p_targetcolumn, NULL) END,
                COALESCE(p_mode, 'OnDemand'),
                CASE WHEN p_materializedresultid_clear = true THEN NULL ELSE COALESCE(p_materializedresultid, NULL) END,
                CASE WHEN p_lastscoredat_clear = true THEN NULL ELSE COALESCE(p_lastscoredat, NULL) END,
                CASE WHEN p_lastrowcount_clear = true THEN NULL ELSE COALESCE(p_lastrowcount, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLModelScoringBindings"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLModelScoringBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLModelScoringBinding" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateMLModelScoringBinding"(
    p_id UUID,
    p_mlmodelid UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetcolumn_clear boolean DEFAULT false,
    p_targetcolumn varchar(255) DEFAULT NULL,
    p_mode varchar(20) DEFAULT NULL,
    p_materializedresultid_clear boolean DEFAULT false,
    p_materializedresultid UUID DEFAULT NULL,
    p_lastscoredat_clear boolean DEFAULT false,
    p_lastscoredat TIMESTAMPTZ DEFAULT NULL,
    p_lastrowcount_clear boolean DEFAULT false,
    p_lastrowcount int DEFAULT NULL
) RETURNS SETOF __mj."vwMLModelScoringBindings" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLModelScoringBinding"
    SET
        "MLModelID" = COALESCE(p_mlmodelid, "MLModelID"),
        "RecordProcessID" = CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, "RecordProcessID") END,
        "TargetEntityID" = CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, "TargetEntityID") END,
        "TargetColumn" = CASE WHEN p_targetcolumn_clear = true THEN NULL ELSE COALESCE(p_targetcolumn, "TargetColumn") END,
        "Mode" = COALESCE(p_mode, "Mode"),
        "MaterializedResultID" = CASE WHEN p_materializedresultid_clear = true THEN NULL ELSE COALESCE(p_materializedresultid, "MaterializedResultID") END,
        "LastScoredAt" = CASE WHEN p_lastscoredat_clear = true THEN NULL ELSE COALESCE(p_lastscoredat, "LastScoredAt") END,
        "LastRowCount" = CASE WHEN p_lastrowcount_clear = true THEN NULL ELSE COALESCE(p_lastrowcount, "LastRowCount") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLModelScoringBindings"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLModelScoringBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLModelScoringBinding" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModelScoringBinding table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_model_scoring_binding"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_model_scoring_binding" ON __mj."MLModelScoringBinding";

CREATE TRIGGER "trg_update_ml_model_scoring_binding"
BEFORE UPDATE ON __mj."MLModelScoringBinding"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_model_scoring_binding"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteMLModelScoringBinding"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLModelScoringBinding"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLModelScoringBinding" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLModelScoringBinding" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Models
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_pipeline_id"
    ON __mj."MLModel" ("PipelineID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_algorithm_id"
    ON __mj."MLModel" ("AlgorithmID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_model_artifact_file_id"
    ON __mj."MLModel" ("ArtifactFileID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLModels"
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID."Name" AS "Pipeline",
    MJMLAlgorithm_AlgorithmID."Name" AS "Algorithm",
    MJFile_ArtifactFileID."Name" AS "ArtifactFile"
FROM
    __mj."MLModel" AS m
INNER JOIN
    __mj."MLTrainingPipeline" AS MJMLTrainingPipeline_PipelineID
  ON
    "m"."PipelineID" = MJMLTrainingPipeline_PipelineID."ID"
INNER JOIN
    __mj."MLAlgorithm" AS MJMLAlgorithm_AlgorithmID
  ON
    "m"."AlgorithmID" = MJMLAlgorithm_AlgorithmID."ID"
LEFT OUTER JOIN
    __mj."File" AS MJFile_ArtifactFileID
  ON
    "m"."ArtifactFileID" = MJFile_ArtifactFileID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLModels'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLModels'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLModels'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLModels" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLModels" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLModels" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLModels" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateMLModel"(
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
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwMLModels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLModel"
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
                "Status"
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
                COALESCE(p_status, 'Draft')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLModels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLModel" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateMLModel"(
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
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwMLModels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLModel"
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
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLModels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLModel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_model"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_model" ON __mj."MLModel";

CREATE TRIGGER "trg_update_ml_model"
BEFORE UPDATE ON __mj."MLModel"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_model"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteMLModel"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLModel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLModel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Pipelines
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_pipeline_target_entity_id"
    ON __mj."MLTrainingPipeline" ("TargetEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_pipeline_algorithm_id"
    ON __mj."MLTrainingPipeline" ("AlgorithmID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLTrainingPipelines"
AS
SELECT
    m.*,
    MJEntity_TargetEntityID."Name" AS "TargetEntity",
    MJMLAlgorithm_AlgorithmID."Name" AS "Algorithm"
FROM
    __mj."MLTrainingPipeline" AS m
INNER JOIN
    __mj."Entity" AS MJEntity_TargetEntityID
  ON
    "m"."TargetEntityID" = MJEntity_TargetEntityID."ID"
INNER JOIN
    __mj."MLAlgorithm" AS MJMLAlgorithm_AlgorithmID
  ON
    "m"."AlgorithmID" = MJMLAlgorithm_AlgorithmID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLTrainingPipelines'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLTrainingPipelines'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLTrainingPipelines'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLTrainingPipelines" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLTrainingPipelines" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLTrainingPipelines" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLTrainingPipelines" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateMLTrainingPipeline"(
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
    p_validationstrategy TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwMLTrainingPipelines" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLTrainingPipeline"
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
                "ValidationStrategy"
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
                CASE WHEN p_validationstrategy_clear = true THEN NULL ELSE COALESCE(p_validationstrategy, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLTrainingPipelines"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLTrainingPipeline" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLTrainingPipeline" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateMLTrainingPipeline"(
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
    p_validationstrategy TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwMLTrainingPipelines" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLTrainingPipeline"
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
        "ValidationStrategy" = CASE WHEN p_validationstrategy_clear = true THEN NULL ELSE COALESCE(p_validationstrategy, "ValidationStrategy") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLTrainingPipelines"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLTrainingPipeline" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLTrainingPipeline" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingPipeline table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_training_pipeline"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_training_pipeline" ON __mj."MLTrainingPipeline";

CREATE TRIGGER "trg_update_ml_training_pipeline"
BEFORE UPDATE ON __mj."MLTrainingPipeline"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_training_pipeline"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteMLTrainingPipeline"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLTrainingPipeline"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLTrainingPipeline" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLTrainingPipeline" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: ML Training Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_pipeline_id"
    ON __mj."MLTrainingRun" ("PipelineID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_resulting_model_id"
    ON __mj."MLTrainingRun" ("ResultingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_experiment_session_iteration_i"
    ON __mj."MLTrainingRun" ("ExperimentSessionIterationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ml_training_run_algorithm_id"
    ON __mj."MLTrainingRun" ("AlgorithmID");

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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMLTrainingRuns"
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID."Name" AS "Pipeline",
    MJExperimentSessionIteration_ExperimentSessionIterationID."Label" AS "ExperimentSessionIteration",
    MJMLAlgorithm_AlgorithmID."Name" AS "Algorithm"
FROM
    __mj."MLTrainingRun" AS m
INNER JOIN
    __mj."MLTrainingPipeline" AS MJMLTrainingPipeline_PipelineID
  ON
    "m"."PipelineID" = MJMLTrainingPipeline_PipelineID."ID"
LEFT OUTER JOIN
    __mj."ExperimentSessionIteration" AS MJExperimentSessionIteration_ExperimentSessionIterationID
  ON
    "m"."ExperimentSessionIterationID" = MJExperimentSessionIteration_ExperimentSessionIterationID."ID"
INNER JOIN
    __mj."MLAlgorithm" AS MJMLAlgorithm_AlgorithmID
  ON
    "m"."AlgorithmID" = MJMLAlgorithm_AlgorithmID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLTrainingRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMLTrainingRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMLTrainingRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMLTrainingRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMLTrainingRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwMLTrainingRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMLTrainingRuns" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateMLTrainingRun"(
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
    p_notes TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwMLTrainingRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MLTrainingRun"
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
                "Notes"
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
                CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMLTrainingRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMLTrainingRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMLTrainingRun" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateMLTrainingRun"(
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
    p_notes TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwMLTrainingRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MLTrainingRun"
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
        "Notes" = CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, "Notes") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMLTrainingRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLTrainingRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMLTrainingRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ml_training_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ml_training_run" ON __mj."MLTrainingRun";

CREATE TRIGGER "trg_update_ml_training_run"
BEFORE UPDATE ON __mj."MLTrainingRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ml_training_run"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteMLTrainingRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MLTrainingRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLTrainingRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMLTrainingRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_open_app_installed_by_user_id"
    ON __mj."OpenApp" ("InstalledByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: vwOpenApps
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      __mj
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwOpenApps"
AS
SELECT
    o.*,
    MJUser_InstalledByUserID."Name" AS "InstalledByUser"
FROM
    __mj."OpenApp" AS o
INNER JOIN
    __mj."User" AS MJUser_InstalledByUserID
  ON
    "o"."InstalledByUserID" = MJUser_InstalledByUserID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwOpenApps'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwOpenApps'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwOpenApps'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwOpenApps" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwOpenApps" TO "cdp_UI";
GRANT SELECT ON __mj."vwOpenApps" TO "cdp_Developer";
GRANT SELECT ON __mj."vwOpenApps" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: spCreateOpenApp
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR OpenApp
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateOpenApp'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateOpenApp"(
    p_id UUID DEFAULT NULL,
    p_name varchar(64) DEFAULT NULL,
    p_displayname varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_version varchar(50) DEFAULT NULL,
    p_publisher varchar(200) DEFAULT NULL,
    p_publisheremail_clear boolean DEFAULT false,
    p_publisheremail varchar(255) DEFAULT NULL,
    p_publisherurl_clear boolean DEFAULT false,
    p_publisherurl varchar(500) DEFAULT NULL,
    p_repositoryurl varchar(500) DEFAULT NULL,
    p_schemaname_clear boolean DEFAULT false,
    p_schemaname varchar(128) DEFAULT NULL,
    p_mjversionrange varchar(100) DEFAULT NULL,
    p_license_clear boolean DEFAULT false,
    p_license varchar(50) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(20) DEFAULT NULL,
    p_manifestjson TEXT DEFAULT NULL,
    p_configurationschemajson_clear boolean DEFAULT false,
    p_configurationschemajson TEXT DEFAULT NULL,
    p_installedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_subpath_clear boolean DEFAULT false,
    p_subpath varchar(500) DEFAULT NULL
) RETURNS SETOF __mj."vwOpenApps" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."OpenApp"
        (
            "ID",
            "Name",
                "DisplayName",
                "Description",
                "Version",
                "Publisher",
                "PublisherEmail",
                "PublisherURL",
                "RepositoryURL",
                "SchemaName",
                "MJVersionRange",
                "License",
                "Icon",
                "Color",
                "ManifestJSON",
                "ConfigurationSchemaJSON",
                "InstalledByUserID",
                "Status",
                "Subpath"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_displayname,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_version,
                p_publisher,
                CASE WHEN p_publisheremail_clear = true THEN NULL ELSE COALESCE(p_publisheremail, NULL) END,
                CASE WHEN p_publisherurl_clear = true THEN NULL ELSE COALESCE(p_publisherurl, NULL) END,
                p_repositoryurl,
                CASE WHEN p_schemaname_clear = true THEN NULL ELSE COALESCE(p_schemaname, NULL) END,
                p_mjversionrange,
                CASE WHEN p_license_clear = true THEN NULL ELSE COALESCE(p_license, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                p_manifestjson,
                CASE WHEN p_configurationschemajson_clear = true THEN NULL ELSE COALESCE(p_configurationschemajson, NULL) END,
                p_installedbyuserid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_subpath_clear = true THEN NULL ELSE COALESCE(p_subpath, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwOpenApps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateOpenApp" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR OpenApp
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateOpenApp'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateOpenApp"(
    p_id UUID,
    p_name varchar(64) DEFAULT NULL,
    p_displayname varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_version varchar(50) DEFAULT NULL,
    p_publisher varchar(200) DEFAULT NULL,
    p_publisheremail_clear boolean DEFAULT false,
    p_publisheremail varchar(255) DEFAULT NULL,
    p_publisherurl_clear boolean DEFAULT false,
    p_publisherurl varchar(500) DEFAULT NULL,
    p_repositoryurl varchar(500) DEFAULT NULL,
    p_schemaname_clear boolean DEFAULT false,
    p_schemaname varchar(128) DEFAULT NULL,
    p_mjversionrange varchar(100) DEFAULT NULL,
    p_license_clear boolean DEFAULT false,
    p_license varchar(50) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(20) DEFAULT NULL,
    p_manifestjson TEXT DEFAULT NULL,
    p_configurationschemajson_clear boolean DEFAULT false,
    p_configurationschemajson TEXT DEFAULT NULL,
    p_installedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_subpath_clear boolean DEFAULT false,
    p_subpath varchar(500) DEFAULT NULL
) RETURNS SETOF __mj."vwOpenApps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."OpenApp"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "DisplayName" = COALESCE(p_displayname, "DisplayName"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Version" = COALESCE(p_version, "Version"),
        "Publisher" = COALESCE(p_publisher, "Publisher"),
        "PublisherEmail" = CASE WHEN p_publisheremail_clear = true THEN NULL ELSE COALESCE(p_publisheremail, "PublisherEmail") END,
        "PublisherURL" = CASE WHEN p_publisherurl_clear = true THEN NULL ELSE COALESCE(p_publisherurl, "PublisherURL") END,
        "RepositoryURL" = COALESCE(p_repositoryurl, "RepositoryURL"),
        "SchemaName" = CASE WHEN p_schemaname_clear = true THEN NULL ELSE COALESCE(p_schemaname, "SchemaName") END,
        "MJVersionRange" = COALESCE(p_mjversionrange, "MJVersionRange"),
        "License" = CASE WHEN p_license_clear = true THEN NULL ELSE COALESCE(p_license, "License") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "ManifestJSON" = COALESCE(p_manifestjson, "ManifestJSON"),
        "ConfigurationSchemaJSON" = CASE WHEN p_configurationschemajson_clear = true THEN NULL ELSE COALESCE(p_configurationschemajson, "ConfigurationSchemaJSON") END,
        "InstalledByUserID" = COALESCE(p_installedbyuserid, "InstalledByUserID"),
        "Status" = COALESCE(p_status, "Status"),
        "Subpath" = CASE WHEN p_subpath_clear = true THEN NULL ELSE COALESCE(p_subpath, "Subpath") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwOpenApps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateOpenApp" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_open_app"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_open_app" ON __mj."OpenApp";

CREATE TRIGGER "trg_update_open_app"
BEFORE UPDATE ON __mj."OpenApp"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_open_app"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR OpenApp
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteOpenApp'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteOpenApp"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."OpenApp"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenApp" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON __mj."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.LastRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_last_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    root_ParentRunID.root_id AS "RootParentRunID",
    root_LastRunID.root_id AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_parent_run_id_get_root_id"(a."ID", a."ParentRunID") AS root_id
) AS root_ParentRunID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_last_run_id_get_root_id"(a."ID", a."LastRunID") AS root_id
) AS root_LastRunID ON true
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Running'')'
        WHEN 'StartedAt' THEN 'COALESCE(($1->>''StartedAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'AgentState' THEN '($1->>''AgentState'')'
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INT'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INT'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INT'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INT'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INT'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INT'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INT, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INT'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INT'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgentRun"
    SET
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ParentRunID" = CASE WHEN p_data ? 'ParentRunID' THEN (p_data->>'ParentRunID')::UUID ELSE "ParentRunID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "StartedAt" = CASE WHEN p_data ? 'StartedAt' THEN (p_data->>'StartedAt')::TIMESTAMPTZ ELSE "StartedAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ConversationID" = CASE WHEN p_data ? 'ConversationID' THEN (p_data->>'ConversationID')::UUID ELSE "ConversationID" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "AgentState" = CASE WHEN p_data ? 'AgentState' THEN (p_data->>'AgentState') ELSE "AgentState" END,
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INT ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INT ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INT ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INT ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INT ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INT ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INT ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INT ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INT ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INT ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON __mj."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON __mj."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration";
